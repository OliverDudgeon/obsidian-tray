import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const bundle = await build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian"],
	format: "cjs",
	write: false,
});

function createApp({ delayQuitNotification = false, stallQuit = false } = {}) {
	const calls = [];
	const windows = [];
	const pendingNotifications = [];
	const timers = new Map();
	const app = Object.assign(new EventEmitter(), {
		relaunch: () => calls.push("relaunch"),
		exit: (code) => calls.push(`exit:${code}`),
		quit: () => {
			calls.push("quit");
			if (delayQuitNotification) pendingNotifications.push(() => app.emit("before-quit"));
			else app.emit("before-quit");
			for (const { win, listeners } of windows) {
				const event = {
					defaultPrevented: false,
					preventDefault() { this.defaultPrevented = true; },
					stopImmediatePropagation() {},
				};
				win.emit("close", event);
				listeners.get("beforeunload")?.(event);
				assert.equal(event.defaultPrevented, false, "native close must be allowed");
				assert.notEqual(event.returnValue, false, "renderer unload must be allowed");
			}
			if (!stallQuit) app.emit("will-quit");
		},
		dock: { show() {}, hide() {} },
	});
	return { app, calls, windows, timers, flushNotifications: () => pendingNotifications.splice(0).forEach((notify) => notify()) };
}

async function loadPlugin({ reloadAvailable = true, platform = "darwin", electron = createApp() } = {}) {
	const { app, calls, windows } = electron;
	const listeners = new Map();
	const renderer = {
		addEventListener: (name, callback) => listeners.set(name, callback),
		removeEventListener: (name) => listeners.delete(name),
	};
	const original = () => {
		calls.push("reload");
		listeners.get("beforeunload")?.({ stopImmediatePropagation() {} });
	};
	const reload = { id: "app:reload", callback: original };
	const commands = reloadAvailable ? { "app:reload": reload } : {};
	const disposers = [];
	class Plugin {
		app = {
			commands: { commands },
			workspace: { onLayoutReady: (callback) => callback(), iterateAllLeaves() {}, on() {} },
		};
		loadData() { return Promise.resolve({}); }
		registerEvent() {}
		addCommand() {}
		addSettingTab() {}
		register(callback) { disposers.push(callback); }
	}
	const win = Object.assign(new EventEmitter(), {
		webContents: new EventEmitter(),
		setSkipTaskbar() {},
		isDestroyed: () => false,
		getChildWindows: () => [],
		isMaximized: () => false,
		hide: () => calls.push("hide"),
	});
	// Obsidian persists its window bounds in the BrowserWindow close handler.
	let savedBounds = { x: 100, y: 100, width: 800, height: 600 };
	const bounds = { x: 2100, y: 200, width: 1000, height: 800 };
	win.on("close", () => { savedBounds = { ...bounds }; });
	windows.push({ win, listeners });
	const module = { exports: {} };
	runInNewContext(bundle.outputFiles[0].text, {
		module,
		exports: module.exports,
		require: (name) => {
			if (name === "obsidian") return { Plugin, PluginSettingTab: class {} };
			if (name === "electron") return { remote: { app, getCurrentWindow: () => win } };
			throw new Error(`Unexpected import: ${name}`);
		},
		window: renderer,
		process: { platform },
		setTimeout: (callback) => { const id = Symbol(); electron.timers.set(id, callback); return id; },
		clearTimeout: (id) => electron.timers.delete(id),
		console: { debug() {}, warn() {}, error() {} },
	});
	const plugin = new module.exports.default();
	for (const method of ["setLaunchOnStartup", "createTrayIcon", "registerHotkeys", "unregisterHotkeys"]) {
		plugin[method] = () => {};
	}
	await plugin.onload();
	return { plugin, reload, original, calls, disposers, listeners, win, bounds, getSavedBounds: () => savedBounds };
}

test("built-in reload relaunches and quits, like the tray action", async () => {
	const { plugin, reload, calls } = await loadPlugin();
	reload.callback();
	assert.deepEqual(calls, ["relaunch", "quit"]);
	calls.length = 0;
	plugin.relaunchApp();
	assert.deepEqual(calls, ["relaunch", "quit"]);
});

test("normal window close still hides the window", async () => {
	const { listeners, calls } = await loadPlugin();
	const event = { stopImmediatePropagation() {} };
	listeners.get("beforeunload")(event);
	assert.deepEqual(calls, ["hide"]);
	assert.equal(event.returnValue, false);
});

test("unloading restores the built-in reload callback", async () => {
	const { reload, original, disposers } = await loadPlugin();
	for (const dispose of disposers) dispose();
	assert.equal(reload.callback, original);
});

test("unloading preserves a later replacement by another plugin", async () => {
	const { reload, disposers } = await loadPlugin();
	const replacement = () => {};
	reload.callback = replacement;
	for (const dispose of disposers) dispose();
	assert.equal(reload.callback, replacement);
});

test("loading tolerates an unavailable built-in reload command", async () => {
	await loadPlugin({ reloadAvailable: false });
});

for (const platform of ["darwin", "win32", "linux"]) {
	test(`relaunch saves the current monitor position and allows all vaults to close on ${platform}`, async () => {
		const electron = createApp();
		const first = await loadPlugin({ platform, electron });
		const second = await loadPlugin({ platform, electron });
		first.plugin.relaunchApp();
		assert.deepEqual(first.getSavedBounds(), first.bounds);
		assert.deepEqual(second.getSavedBounds(), second.bounds);
		assert.deepEqual(electron.calls, ["relaunch", "quit"]);
	});
}

test("relaunch allows unload even when the remote before-quit notification is late", async () => {
	const electron = createApp({ delayQuitNotification: true });
	const { plugin } = await loadPlugin({ electron });
	plugin.relaunchApp();
	assert.deepEqual(electron.calls, ["relaunch", "quit"]);
});

test("a canceled close keeps the vault window available to Show vault", async () => {
	const { plugin, win, listeners } = await loadPlugin();
	win.emit("close", { preventDefault() {} });
	listeners.get("beforeunload")({ stopImmediatePropagation() {} });
	assert.deepEqual(Array.from(plugin.getWindows()), [win]);
	win.emit("closed");
	assert.equal(plugin.getWindows().length, 0);
});

test("a stalled quit terminates the application rather than just its renderer", async () => {
	const electron = createApp({ stallQuit: true });
	const { plugin } = await loadPlugin({ electron });
	plugin.relaunchApp();
	for (const callback of electron.timers.values()) callback();
	assert.deepEqual(electron.calls, ["relaunch", "quit", "exit:0"]);
});
