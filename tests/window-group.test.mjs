import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/core/window-manager.ts"], bundle: true, format: "cjs", write: false });

function setup(platform, background = true) {
	const windows = [], calls = [], timers = new Map(), dispose = [];
	function make(name) {
		const win = Object.assign(new EventEmitter(), {
			name, visible: true, minimized: false, maximized: false, focused: false, destroyed: false,
			webContents: new EventEmitter(), children: [],
			isDestroyed() { return this.destroyed; },
			isVisible() { return this.visible; },
			isFocused() { return this.focused; },
			isMinimized() { return this.minimized; },
			isMaximized() { return this.maximized; },
			getChildWindows() { return this.children; },
			setSkipTaskbar() {},
			getBounds() { return { x: 10, y: 10, width: 800, height: 600 }; },
			setPosition() {},
			setVisibleOnAllWorkspaces(value) { this.allWorkspaces = value; },
			showInactive() { this.visible = true; calls.push(`show:${name}`); this.emit("show"); },
			focus() { windows.forEach(w => { w.focused = false; }); this.focused = true; calls.push(`focus:${name}`); this.emit("focus"); },
			moveTop() { calls.push(`top:${name}`); },
			hide() { this.visible = false; this.focused = false; this.emit("hide"); },
			minimize() { this.minimized = true; this.focused = false; this.emit("minimize"); },
			restore() { this.minimized = false; this.emit("restore"); },
			maximize() { this.maximized = true; this.emit("maximize"); },
			destroy() { this.destroyed = true; this.visible = false; this.focused = false; this.emit("closed"); },
		});
		windows.push(win);
		return win;
	}
	const main = make("main"), module = { exports: {} };
	const display = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
	runInNewContext(bundle.outputFiles[0].text, {
		module, exports: module.exports, process: { platform },
		require: () => ({ remote: { getCurrentWindow: () => main, app: { dock: { show() {}, hide() {} }, focus() {} }, screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => display } } }),
		setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id; },
		clearTimeout: id => timers.delete(id), console: { debug() {}, error() {}, warn() {} },
	});
	const manager = module.exports;
	const plugin = { settings: { runInBackground: background, hideTaskbarIcon: false }, register: fn => dispose.push(fn) };
	manager.observeWindows(plugin);
	const note = make("note"); main.webContents.emit("did-create-window", note);
	manager.observeNoteWindow({ electronWindow: note });
	const settings = make("settings"); note.webContents.emit("did-create-window", settings);
	settings.focus(); calls.length = 0;
	const flush = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
	const toggle = () => { manager.toggleWindows(plugin); flush(); };
	const shown = () => windows.filter(w => !w.destroyed && w.visible && !w.minimized).map(w => w.name);
	return { manager, plugin, main, note, settings, calls, make, flush, toggle, shown, dispose };
}

for (const platform of ["darwin", "win32", "linux"]) {
	for (const background of [true, false]) {
		test(`group round trip preserves order and independent minimisation: ${platform}, background=${background}`, () => {
			const h = setup(platform, background);
			h.main.minimize(); h.note.focus(); h.note.maximize();
			h.toggle(); assert.deepEqual(h.shown(), []);
			h.toggle(); assert.deepEqual(h.shown(), ["note", "settings"]);
			assert.equal(h.note.focused, true); assert.equal(h.note.maximized, true);
			assert.deepEqual(h.calls.filter(c => c.startsWith("top:")), ["top:settings", "top:note"]);
		});
	}
	test(`partial restore and new window retain pending recall: ${platform}`, () => {
		const h = setup(platform); h.toggle();
		h.main.showInactive(); h.main.focus(); h.toggle(); h.toggle();
		assert.deepEqual(h.shown(), ["main", "note", "settings"]);
		assert.equal(h.main.focused, true);
		h.toggle(); const extra = h.make("extra"); h.note.webContents.emit("did-create-window", extra); extra.focus();
		h.toggle(); h.toggle(); assert.deepEqual(h.shown(), ["main", "note", "settings", "extra"]);
		assert.equal(extra.focused, true);
	});
	test(`closed recall member is skipped and fallback prefers recent note: ${platform}`, () => {
		const h = setup(platform); h.toggle(); h.settings.destroy(); h.toggle();
		assert.equal(h.note.focused, true);
		h.note.minimize(); h.main.minimize(); h.toggle();
		assert.deepEqual(h.shown(), ["note"]);
	});
	test(`explicit hide works without vault focus and leaves other vault alone: ${platform}`, () => {
		const h = setup(platform), other = h.make("other vault"); other.focus();
		h.manager.hideWindows(h.plugin); h.flush(); assert.deepEqual(h.shown(), ["other vault"]);
		h.toggle(); assert.equal(h.settings.focused, true); assert.equal(other.visible, true);
	});
	test(`unload removes recursive observers: ${platform}`, () => {
		const h = setup(platform); h.dispose.forEach(fn => fn());
		assert.equal(h.note.listenerCount("focus"), 0);
		assert.equal(h.note.webContents.listenerCount("did-create-window"), 0);
		assert.equal(h.manager.getWindows().length, 0);
	});
}

test("rapid second toggle cancels macOS focus and workspace changes", () => {
	const h = setup("darwin"); h.toggle();
	h.manager.toggleWindows(h.plugin);
	h.manager.toggleWindows(h.plugin);
	h.flush();
	assert.deepEqual(h.shown(), []);
	assert.equal(h.calls.filter(c => c.startsWith("focus:")).length, 0);
	assert.equal(h.main.allWorkspaces, false);
});

test("closing every member does not resurrect a vault", () => {
	const h = setup("linux"); h.toggle();
	[h.main, h.note, h.settings].forEach(w => w.destroy()); h.toggle();
	assert.deepEqual(h.shown(), []);
});

test("late native minimise events do not remove the group's recall members", () => {
	const h = setup("darwin", false);
	const windows = [h.main, h.note, h.settings];
	windows.forEach(w => { w.minimize = () => { w.minimized = true; w.focused = false; }; });
	h.toggle();
	windows.forEach(w => w.emit("minimize"));
	h.toggle();
	assert.deepEqual(h.shown(), ["main", "note", "settings"]);
	assert.equal(h.settings.focused, true);
});

test("native restore completion controls focus, and a second toggle cancels restoration", () => {
	const h = setup("darwin", false);
	h.toggle();
	const windows = [h.main, h.note, h.settings];
	windows.forEach(w => { w.restore = () => {}; });
	h.manager.toggleWindows(h.plugin); h.flush();
	assert.equal(h.calls.some(c => c.startsWith("focus:")), false);
	h.main.minimized = false; h.main.emit("restore");
	h.note.minimized = false; h.note.emit("restore");
	h.flush();
	assert.equal(h.calls.some(c => c.startsWith("focus:")), false);
	h.manager.toggleWindows(h.plugin);
	// Settings finishes its native animation after the user already hid again.
	h.settings.minimized = false; h.settings.emit("restore"); h.flush();
	assert.deepEqual(h.shown(), []);
	assert.equal(h.calls.some(c => c.startsWith("focus:")), false);
	windows.forEach(w => { w.restore = () => { w.minimized = false; w.emit("restore"); }; });
	h.toggle();
	assert.deepEqual(h.shown(), ["main", "note", "settings"]);
	assert.equal(h.settings.focused, true);
});
