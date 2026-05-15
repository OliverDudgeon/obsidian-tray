/**
 * Window management functionality
 */

import {
	logger,
	LOG_SHOWING_WINDOWS,
	LOG_HIDING_WINDOWS,
	LOG_WINDOW_CLOSE,
} from "../utils/logger";
import { electronRemote, type ElectronWindow } from "../utils/electron";

interface PluginSettings {
	hideTaskbarIcon: boolean;
	runInBackground: boolean;
}

interface TrayPlugin {
	settings: PluginSettings;
}

const getCurrentWindow = (): ElectronWindow => electronRemote.getCurrentWindow();

const vaultWindows = new Set<ElectronWindow>();
const maximizedWindows = new Set<ElectronWindow>();
let isQuittingDueToSystemShutdown = false;

export const getWindows = (): ElectronWindow[] => [...vaultWindows];

export const setQuittingFlag = (flag: boolean): void => {
	isQuittingDueToSystemShutdown = flag;
};

export const observeWindows = (plugin: TrayPlugin): void => {
	const onWindowCreation = (win: ElectronWindow) => {
		vaultWindows.add(win);
		win.setSkipTaskbar(plugin.settings.hideTaskbarIcon);

		win.on("close", () => {
			vaultWindows.delete(win);
		});

		// preserve maximised windows after minimisation
		if (win.isMaximized()) {
			maximizedWindows.add(win);
		}
		win.on("maximize", () => maximizedWindows.add(win));
		win.on("unmaximize", () => maximizedWindows.delete(win));
	};

	const currentWindow = getCurrentWindow();
	onWindowCreation(currentWindow);
	currentWindow.webContents.on("did-create-window", onWindowCreation);

	if (process.platform === "darwin") {
		// On macOS, the "hide taskbar icon" option is implemented via
		// app.dock.hide(): the whole app is hidden from the dock, including
		// windows from other vaults. When a vault is closed via the "close
		// vault" button, cleanup calls app.dock.show() to restore access to
		// any other open vaults that don't have the option enabled. This
		// listener re-hides the dock when refocusing a vault with the option
		// enabled.
		currentWindow.on("focus", () => {
			if (plugin.settings.hideTaskbarIcon) {
				electronRemote.app.dock.hide();
			}
		});
	}
};

export const showWindows = (): void => {
	logger.info(LOG_SHOWING_WINDOWS);
	const isDarwin = process.platform === "darwin";
	getWindows().forEach((win) => {
		if (isDarwin) electronRemote.app.dock.show();
		if (win.isMinimized()) win.restore();
		win.show();
		if (maximizedWindows.has(win)) win.maximize();
		win.focus();
	});
};

export const hideWindows = (plugin: TrayPlugin): void => {
	logger.info(LOG_HIDING_WINDOWS);
	getWindows().forEach((win, index) => {
		const isFocused = win.isFocused();
		const action = plugin.settings.runInBackground ? "hide" : "minimize";
		logger.verbose(`Hiding window ${index + 1}`, {
			focused: isFocused,
			action,
		});

		if (isFocused) {
			if (plugin.settings.runInBackground) {
				win.hide();
			} else {
				win.minimize();
			}
		}
	});
};

export const toggleWindows = (
	plugin: TrayPlugin,
	checkForFocus = true,
): void => {
	const openWindows = getWindows().some((win) => {
		return (!checkForFocus || win.isFocused()) && win.isVisible();
	});
	logger.verbose("Toggle windows", {
		checkForFocus,
		hasOpenWindows: openWindows,
		windowCount: getWindows().length,
	});
	if (openWindows) {
		logger.debug("Toggle: Hiding windows");
		hideWindows(plugin);
	} else {
		logger.debug("Toggle: Showing windows");
		showWindows();
	}
};

const onWindowClose = (event: Event): void => {
	if (isQuittingDueToSystemShutdown) return;
	event.preventDefault();
};

const onWindowUnload = (event: BeforeUnloadEvent): void => {
	logger.info(LOG_WINDOW_CLOSE);
	if (isQuittingDueToSystemShutdown) return;
	getCurrentWindow().hide();
	event.stopImmediatePropagation();
	// Setting returnValue is more reliable than `return false` in Electron's
	// beforeunload path.
	// eslint-disable-next-line @typescript-eslint/no-deprecated
	event.returnValue = false;
};

export const interceptWindowClose = (): void => {
	// Intercept in the renderer.
	window.addEventListener("beforeunload", onWindowUnload, true);
	// Intercept in main: registering from the renderer is async so this
	// can't prevent the close on its own, but it counteracts the 3-second
	// delayed window force-close in obsidian.asar/main.js.
	getCurrentWindow().on("close", onWindowClose as (...args: unknown[]) => void);
};

export const allowWindowClose = (): void => {
	try {
		getCurrentWindow().removeListener(
			"close",
			onWindowClose as (...args: unknown[]) => void,
		);
	} catch (error) {
		logger.error("Error removing close listener: " + (error as Error).message);
	}
	try {
		window.removeEventListener("beforeunload", onWindowUnload, true);
	} catch (error) {
		logger.error(
			"Error removing beforeunload listener: " + (error as Error).message,
		);
	}
};

export const hideTaskbarIcons = (): void => {
	getWindows().forEach((win) => win.setSkipTaskbar(true));
	if (process.platform === "darwin") electronRemote.app.dock.hide();
};

export const showTaskbarIcons = (): void => {
	getWindows().forEach((win) => win.setSkipTaskbar(false));
	if (process.platform === "darwin") electronRemote.app.dock.show();
};
