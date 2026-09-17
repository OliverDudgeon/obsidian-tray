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

async function loadPlugin({ reloadAvailable = true } = {}) {
	const calls = [];
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
			workspace: { onLayoutReady: (callback) => callback() },
		};
		loadData() { return Promise.resolve({}); }
		addCommand() {}
		addSettingTab() {}
		register(callback) { disposers.push(callback); }
	}
	const win = Object.assign(new EventEmitter(), {
		webContents: new EventEmitter(),
		setSkipTaskbar() {},
		isMaximized: () => false,
		hide: () => calls.push("hide"),
	});
	const app = Object.assign(new EventEmitter(), {
		relaunch: () => calls.push("relaunch"),
		exit: (code) => calls.push(`exit:${code}`),
		dock: { show() {}, hide() {} },
	});
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
		process,
		console: { debug() {}, warn() {}, error() {} },
	});
	const plugin = new module.exports.default();
	for (const method of ["setLaunchOnStartup", "createTrayIcon", "registerHotkeys", "unregisterHotkeys"]) {
		plugin[method] = () => {};
	}
	await plugin.onload();
	return { plugin, reload, original, calls, disposers, listeners };
}

test("built-in reload relaunches and exits, like the tray action", async () => {
	const { plugin, reload, calls } = await loadPlugin();
	reload.callback();
	assert.deepEqual(calls, ["relaunch", "exit:0"]);
	calls.length = 0;
	plugin.relaunchApp();
	assert.deepEqual(calls, ["relaunch", "exit:0"]);
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
