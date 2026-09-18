const { ipcRenderer } = require("electron");
const remote = require(process.env.TRAY_REMOTE_PATH);

const assert = require("node:assert/strict");

if (process.argv.includes("--tray-group-root")) {
	globalThis.require = () => ({ remote });
	const manager = require(process.env.TRAY_BUNDLE_PATH);
	const disposers = [];
	const plugin = { settings: { runInBackground: true, hideTaskbarIcon: false }, register: fn => disposers.push(fn) };
	const pause = () => new Promise(resolve => setTimeout(resolve, 150));
	const report = message => ipcRenderer.sendSync("test-result", message);
	window.addEventListener("DOMContentLoaded", async () => {
		try {
			manager.observeWindows(plugin);
			const noteDom = window.open("about:blank", "note");
			if (process.env.TRAY_SCENARIO === "merge") {
				await pause();
				noteDom.electronWindow = noteDom.require(process.env.TRAY_REMOTE_PATH).getCurrentWindow();
				manager.observeNoteWindow(noteDom);
				assert.equal(manager.getWindows().length, 2, "workspace and creation events share one native window");
				// Moving the last leaf back closes its pop-out renderer in Obsidian.
				noteDom.close();
				await pause();
				window.open("about:blank", "settings");
				await pause();
				const members = manager.getWindows();
				assert.equal(members.length, 2, "only main and Settings survive the merge");
				const settings = members[1];
				remote.app.focus({ steal: true }); settings.show(); settings.focus(); await pause();
				manager.toggleWindows(plugin); await pause();
				assert.ok(members.every(win => !win.isVisible()));
				manager.toggleWindows(plugin); await pause();
				assert.ok(members.every(win => win.isVisible()));
				assert.ok(settings.isFocused());
				disposers.forEach(fn => fn());
				report("merge transitions passed"); remote.app.exit(0); return;
			}
			if (process.env.TRAY_SCENARIO !== "stacking") window.open("about:blank", "settings");
			await pause();
			const [main, note, settings = note] = manager.getWindows();
			assert.equal(manager.getWindows().length, process.env.TRAY_SCENARIO === "stacking" ? 2 : 3, "discovers native pop-outs");
			noteDom.electronWindow = noteDom.require(process.env.TRAY_REMOTE_PATH).getCurrentWindow();
			manager.observeNoteWindow(noteDom);
			remote.app.focus({ steal: true });
			settings.show(); settings.focus(); await pause();
			assert.equal(settings.isFocused(), true, "native test acquires initial focus");
			manager.toggleWindows(plugin); await pause();
			assert.ok(manager.getWindows().every(win => !win.isVisible()));
			if (process.env.TRAY_SCENARIO === "stacking") {
				const unrelatedPid = await ipcRenderer.invoke("stacking-external");
				assert.equal((await ipcRenderer.invoke("stacking-order"))[0], unrelatedPid, "unrelated app starts in front");
				manager.toggleWindows(plugin); await pause();
				const order = await ipcRenderer.invoke("stacking-order");
				const ownPid = remote.process.pid;
				assert.ok(order.includes(unrelatedPid), "unrelated window stays visible");
				assert.deepEqual(order.slice(0, 2), [ownPid, ownPid], `every vault window must precede unrelated app; front-to-back owners: ${order.map(pid => pid === ownPid ? "vault" : "unrelated")}`);
				assert.ok(settings.isFocused());
				report("stacking passed");
				remote.app.exit(0);
				return;
			}
			manager.toggleWindows(plugin); await pause();
			assert.ok(manager.getWindows().every(win => win.isVisible()));
			assert.ok(settings.isFocused(), "Settings regains focus");
			manager.hideWindows(plugin); await pause();
			main.show(); main.focus(); await pause();
			manager.toggleWindows(plugin); await pause();
			manager.toggleWindows(plugin); await pause();
			assert.ok(manager.getWindows().every(win => win.isVisible()));
			assert.ok(main.isFocused(), "partial restore keeps last focus");
			note.minimize(); await pause();
			settings.focus(); await pause();
			manager.toggleWindows(plugin); await pause();
			settings.destroy(); await pause();
			manager.toggleWindows(plugin); await pause();
			assert.ok(note.isMinimized(), "independent minimisation survives");
			assert.ok(main.isFocused(), "destroyed Settings is skipped");
			plugin.settings.runInBackground = false;
			note.restore(); note.show(); note.focus(); await new Promise(resolve => setTimeout(resolve, 700));
			assert.ok(note.isVisible() && !note.isMinimized(), "note independently restored before group minimise");
			assert.ok(note.isFocused(), "note focused before group minimise");
			manager.toggleWindows(plugin); await pause();
			assert.ok(manager.getWindows().every(win => win.isMinimized()));
			manager.toggleWindows(plugin); await new Promise(resolve => setTimeout(resolve, 700));
			assert.ok(manager.getWindows().every(win => !win.isMinimized()));
			assert.ok(note.isFocused(), "minimise-mode recall preserves group focus");
			disposers.forEach(fn => fn());
			report("group transitions passed");
			remote.app.exit(0);
		} catch (error) {
			report(String(error.stack));
			remote.app.exit(1);
		}
	});
}
