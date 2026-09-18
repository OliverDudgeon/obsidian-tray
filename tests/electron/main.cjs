// Runs only in an isolated Electron process, with no Obsidian vault loaded.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const isGroup = ["group", "stacking", "merge"].includes(process.env.TRAY_SCENARIO);
const remoteMain = require(process.env.TRAY_REMOTE_PATH + "/main");
remoteMain.initialize();
const report = (message) => fs.appendFileSync(process.env.TRAY_REPORT_PATH, message + "\n");
const exit = app.exit.bind(app);
app.relaunch = () => report("relaunch scheduled");
app.exit = (code) => { report("app exit"); exit(code); };
app.setPath("userData", process.env.TRAY_PROFILE_PATH);
app.on("will-quit", () => report("app quit"));
ipcMain.on("test-result", (event, message) => { report(message); event.returnValue = null; });
setTimeout(() => { report("TIMEOUT"); exit(1); }, isGroup ? 20000 : 9000);
let unrelated;
ipcMain.handle("stacking-external", async () => {
	const executable = process.env.TRAY_UNRELATED_BINARY;
	unrelated = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] });
	await new Promise((resolve, reject) => {
		unrelated.on("error", reject);
		unrelated.on("exit", code => reject(new Error(`Unrelated fixture exited: ${code}`)));
		unrelated.stdout.on("data", data => { if (String(data).includes("READY")) resolve(); });
	});
	return unrelated.pid;
});
ipcMain.handle("stacking-order", () => JSON.parse(execFileSync("/usr/bin/swift", [path.join(__dirname, "window-order.swift"), String(process.pid), String(unrelated.pid)], { encoding: "utf8", timeout: 10000 })));
app.on("will-quit", () => unrelated?.kill());
app.whenReady().then(() => {
	const win = new BrowserWindow({
		show: isGroup,
		webPreferences: {
			nodeIntegration: true,
			backgroundThrottling: false,
			contextIsolation: false,
			preload: path.join(__dirname, isGroup ? "group-preload.cjs" : "preload.cjs"),
			additionalArguments: ["--tray-group-root"],
		},
	});
	remoteMain.enable(win.webContents);
	if (isGroup) {
		win.webContents.on("did-create-window", child => remoteMain.enable(child.webContents));
		win.webContents.on("preload-error", (_event, _path, error) => report(String(error)));
		win.webContents.setWindowOpenHandler(() => ({ action: "allow", overrideBrowserWindowOptions: { webPreferences: { additionalArguments: [], backgroundThrottling: false } } }));
	}
	win.on("close", () => report("window position saved"));
	win.on("closed", () => report("window closed"));
	if (process.env.TRAY_SCENARIO === "stalled") {
		win.on("close", (event) => event.preventDefault());
	}
	win.loadURL("data:text/html,<title>Tray regression test</title>");
});
