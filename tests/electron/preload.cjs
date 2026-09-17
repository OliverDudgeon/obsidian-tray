const { ipcRenderer } = require("electron");
const remote = require(process.env.TRAY_REMOTE_PATH);
const Module = require("node:module");
const load = Module._load;
class Plugin {
	app = { commands: { commands: {} }, workspace: { onLayoutReady: (fn) => fn() } };
	loadData() { return Promise.resolve({}); }
	addCommand() {}
	addSettingTab() {}
	register() {}
}
Module._load = function (name, ...args) {
	if (name === "obsidian") return { Plugin, PluginSettingTab: class {} };
	return load.call(this, name, ...args);
};
globalThis.require = (name) => name === "electron" ? { remote } : require(name);
const TrayPlugin = require(process.env.TRAY_BUNDLE_PATH).default;
const plugin = new TrayPlugin();
for (const method of ["setLaunchOnStartup", "createTrayIcon", "registerHotkeys", "unregisterHotkeys"]) {
	plugin[method] = () => {};
}
plugin.onload().then(() => {
	setTimeout(() => {
		if (process.env.TRAY_SCENARIO === "close") {
			remote.getCurrentWindow().close();
			setTimeout(() => {
				ipcRenderer.sendSync("test-result", "tracked windows: " + plugin.getWindows().length);
				remote.app.exit(0);
			}, 200);
		} else {
			plugin.relaunchApp();
		}
	}, 100);
});
