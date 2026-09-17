// Runs only in an isolated Electron process, with no Obsidian vault loaded.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const remoteMain = require(process.env.TRAY_REMOTE_PATH + "/main");
remoteMain.initialize();
const report = (message) => fs.appendFileSync(process.env.TRAY_REPORT_PATH, message + "\n");
const exit = app.exit.bind(app);
app.relaunch = () => report("relaunch scheduled");
app.exit = (code) => { report("app exit"); exit(code); };
app.setPath("userData", process.env.TRAY_PROFILE_PATH);
app.on("will-quit", () => report("app quit"));
ipcMain.on("test-result", (event, message) => { report(message); event.returnValue = null; });
setTimeout(() => { report("TIMEOUT"); exit(1); }, 9000);
app.whenReady().then(() => {
	const win = new BrowserWindow({
		show: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			preload: path.join(__dirname, "preload.cjs"),
		},
	});
	remoteMain.enable(win.webContents);
	win.on("close", () => report("window position saved"));
	win.on("closed", () => report("window closed"));
	if (process.env.TRAY_SCENARIO === "stalled") {
		win.on("close", (event) => event.preventDefault());
	}
	win.loadURL("data:text/html,<title>Tray regression test</title>");
});
