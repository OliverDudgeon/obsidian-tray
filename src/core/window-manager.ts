/**
 * Window management functionality
 */

import {
	logger,
	LOG_SHOWING_WINDOWS,
	LOG_HIDING_WINDOWS,
	LOG_WINDOW_CLOSE,
} from "../utils/logger";
import {
	electronRemote,
	type ElectronWindow,
	type ElectronRectangle,
} from "../utils/electron";

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

// Returns the position the window should occupy so that it lands on the
// display where the cursor currently is (i.e. the display the user is working
// on). If the window is already on that display, its position is left
// untouched. The window's offset relative to its previous display's work area
// is preserved on the target display and clamped so the window stays fully
// on-screen.
const positionOnCursorDisplay = (
	bounds: ElectronRectangle,
): { x: number; y: number } => {
	const { screen } = electronRemote;
	const center = {
		x: bounds.x + bounds.width / 2,
		y: bounds.y + bounds.height / 2,
	};
	const cursorDisplay = screen.getDisplayNearestPoint(
		screen.getCursorScreenPoint(),
	);
	const windowDisplay = screen.getDisplayNearestPoint(center);

	if (cursorDisplay.id === windowDisplay.id) {
		return { x: bounds.x, y: bounds.y };
	}

	const from = windowDisplay.workArea;
	const to = cursorDisplay.workArea;
	const relX = from.width > 0 ? (bounds.x - from.x) / from.width : 0;
	const relY = from.height > 0 ? (bounds.y - from.y) / from.height : 0;

	const x = Math.round(to.x + relX * to.width);
	const y = Math.round(to.y + relY * to.height);

	return {
		x: Math.max(to.x, Math.min(x, to.x + to.width - bounds.width)),
		y: Math.max(to.y, Math.min(y, to.y + to.height - bounds.height)),
	};
};

export const showWindows = (): void => {
	logger.info(LOG_SHOWING_WINDOWS);
	const isDarwin = process.platform === "darwin";
	if (isDarwin) electronRemote.app.dock.show();

	getWindows().forEach((win) => {
		if (isDarwin) {
			// macOS Spaces won't pull a window across to the current desktop on a
			// plain `show()` — instead the system follows the window. Briefly
			// marking it visible on all workspaces forces it onto the active
			// Space; a position change after the toggle is needed to make AppKit
			// recompute its Space membership.
			const isMaximized = maximizedWindows.has(win);
			const bounds = win.getBounds();
			// Move the window to the display the cursor is on so it follows the
			// user across monitors. Falls back to its current position when it is
			// already on that display.
			const target = positionOnCursorDisplay(bounds);

			win.setVisibleOnAllWorkspaces(true);
			win.show();

			setTimeout(() => {
				if (win.isDestroyed()) return;
				win.setVisibleOnAllWorkspaces(false);
				// A one-pixel nudge guarantees a position change (forcing the Space
				// recompute) even when the window stays on the same display.
				win.setPosition(target.x + 1, target.y + 1);
				win.setPosition(target.x, target.y);
				win.focus();
				win.moveTop();
				// Bring the app itself to the foreground. Without this the
				// previously-active app (often on the Space the hotkey was pressed
				// from) keeps focus and renders Obsidian behind it.
				electronRemote.app.focus({ steal: true });
				// Re-maximize after positioning so the window fills the cursor's
				// display rather than its original one.
				if (isMaximized) win.maximize();
			}, 30);
		} else {
			if (win.isMinimized()) win.restore();
			if (maximizedWindows.has(win)) {
				win.maximize();
				win.focus();
			} else {
				win.show();
			}
		}
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
