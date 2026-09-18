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
// Insertion order is least recently focused to most recently focused.
const focusOrder = new Set<ElectronWindow>();
const recallWindows = new Set<ElectronWindow>();
const noteWindows = new Set<ElectronWindow>();
const pendingMinimize = new Set<ElectronWindow>();
let trackWindow: ((win: ElectronWindow) => void) | undefined;
let transition = 0;
let changingWindows = false;
let restoringGroup = false;
const pendingRestore = new Set<ElectronWindow>();
const hideAfterRestore = new Map<ElectronWindow, boolean>();
let finishRestoration: (() => void) | undefined;
let finishShow: ReturnType<typeof setTimeout> | undefined;
const workspaceWindows = new Set<ElectronWindow>();

const isShown = (win: ElectronWindow): boolean =>
	!win.isDestroyed() && win.isVisible() && !win.isMinimized();

const cancelTransition = (): number => {
	transition++;
	if (finishShow !== undefined) clearTimeout(finishShow);
	finishShow = undefined;
	for (const win of workspaceWindows) {
		if (!win.isDestroyed()) win.setVisibleOnAllWorkspaces(false);
	}
	workspaceWindows.clear();
	changingWindows = false;
	restoringGroup = false;
	pendingRestore.clear();
	finishRestoration = undefined;
	return transition;
};

export const getWindows = (): ElectronWindow[] =>
	[...vaultWindows].filter((win) => !win.isDestroyed());

// Obsidian exposes the native window on each workspace container's DOM window.
// Seed existing pop-outs on layout-ready, and classify note windows for fallback.
export const observeNoteWindow = (domWindow: Window): void => {
	const win = (domWindow as Window & { electronWindow?: ElectronWindow }).electronWindow;
	if (!win || win.isDestroyed()) return;
	trackWindow?.(win);
	noteWindows.add(win);
};

export const setQuittingFlag = (flag: boolean): void => {
	isQuittingDueToSystemShutdown = flag;
};

export const observeWindows = (plugin: TrayPlugin & { register: (cleanup: () => void) => void }): void => {
	const disposers: (() => void)[] = [];
	const listen = (win: ElectronWindow, event: string, callback: () => void) => {
		win.on(event, callback);
		disposers.push(() => { if (!win.isDestroyed()) win.removeListener(event, callback); });
	};
	const onWindowCreation = (win: ElectronWindow) => {
		if (vaultWindows.has(win) || win.isDestroyed()) return;
		vaultWindows.add(win);
		focusOrder.add(win);
		win.setSkipTaskbar(plugin.settings.hideTaskbarIcon);

		// A close request can be canceled by close-to-tray or another handler.
		// Keep the window available to Show vault until it is actually closed.
		listen(win, "closed", () => {
			vaultWindows.delete(win);
			maximizedWindows.delete(win);
			focusOrder.delete(win);
			noteWindows.delete(win);
			pendingMinimize.delete(win);
			pendingRestore.delete(win);
			hideAfterRestore.delete(win);
			if (!pendingRestore.size) finishRestoration?.();
			recallWindows.delete(win);
		});

		// preserve maximised windows after minimisation
		if (win.isMaximized()) {
			maximizedWindows.add(win);
		}
		listen(win, "maximize", () => { maximizedWindows.add(win); });
		listen(win, "unmaximize", () => {
			if (!changingWindows && !win.isMinimized()) maximizedWindows.delete(win);
		});
		listen(win, "focus", () => {
			// Remote notifications can arrive after our calls return. Check the
			// actual state as well as the transition guard before accepting them.
			if (changingWindows || !isShown(win) || !win.isFocused()) return;
			focusOrder.delete(win);
			focusOrder.add(win);
			recallWindows.delete(win);
		});
		listen(win, "minimize", () => {
			if (pendingMinimize.delete(win)) return;
			if (win.isMinimized()) recallWindows.delete(win);
		});
		listen(win, "restore", () => {
			const hide = hideAfterRestore.get(win);
			if (hide !== undefined) {
				hideAfterRestore.delete(win);
				if (hide) win.hide();
				else {
					pendingMinimize.add(win);
					win.minimize();
				}
				return;
			}
			pendingRestore.delete(win);
			if (!pendingRestore.size) finishRestoration?.();
			if (!changingWindows && !win.isMinimized()) recallWindows.delete(win);
		});
		win.webContents.on("did-create-window", onWindowCreation);
		disposers.push(() => {
			if (!win.isDestroyed()) win.webContents.removeListener("did-create-window", onWindowCreation);
		});
		for (const child of win.getChildWindows()) onWindowCreation(child);
	};

	trackWindow = onWindowCreation;
	const currentWindow = getCurrentWindow();
	onWindowCreation(currentWindow);
	noteWindows.add(currentWindow);
	plugin.register(() => {
		cancelTransition();
		for (const dispose of disposers) dispose();
		vaultWindows.clear();
		focusOrder.clear();
		recallWindows.clear();
		maximizedWindows.clear();
		noteWindows.clear();
		pendingMinimize.clear();
		hideAfterRestore.clear();
		trackWindow = undefined;
	});

	if (process.platform === "darwin") {
		// On macOS, the "hide taskbar icon" option is implemented via
		// app.dock.hide(): the whole app is hidden from the dock, including
		// windows from other vaults. When a vault is closed via the "close
		// vault" button, cleanup calls app.dock.show() to restore access to
		// any other open vaults that don't have the option enabled. This
		// listener re-hides the dock when refocusing a vault with the option
		// enabled.
		listen(currentWindow, "focus", () => {
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
	const generation = cancelTransition();
	const ordered = [...focusOrder].filter((win) => !win.isDestroyed());
	let selected = ordered.filter((win) => isShown(win) || recallWindows.has(win));
	if (!selected.length) {
		// Prefer the most recently used note when everything was independently
		// hidden/minimized. Never recreate a destroyed window.
		const fallback = [...ordered].reverse().find((win) => noteWindows.has(win))
			?? ordered[ordered.length - 1];
		if (fallback) selected = [fallback];
	}
	if (!selected.length) return;
	const isDarwin = process.platform === "darwin";
	changingWindows = true;
	restoringGroup = true;
	if (isDarwin) electronRemote.app.dock.show();
	const positions = new Map<ElectronWindow, { x: number; y: number }>();
	try {
		for (const win of selected) {
			hideAfterRestore.delete(win);
			if (isDarwin) {
				const target = positionOnCursorDisplay(win.getBounds());
				positions.set(win, target);
				win.setPosition(target.x, target.y);
				win.setVisibleOnAllWorkspaces(true);
				workspaceWindows.add(win);
			}
			if (win.isMinimized()) {
				pendingRestore.add(win);
				win.restore();
			}
			win.showInactive();
		}
		const finish = () => {
			if (generation !== transition) return;
			try {
				const surviving = selected.filter(isShown);
				// macOS activation can reset the application's stacking order.
				// Activate before raising the group, otherwise only the final
				// focused window reliably clears the previously active app.
				if (isDarwin && surviving.length) electronRemote.app.focus({ steal: true });
				for (const win of surviving) {
					const target = positions.get(win);
					if (target) {
						win.setVisibleOnAllWorkspaces(false);
						workspaceWindows.delete(win);
						win.setPosition(target.x + 1, target.y + 1);
						win.setPosition(target.x, target.y);
					}
					if (maximizedWindows.has(win)) win.maximize();
					win.moveTop();
				}
				const target = surviving[surviving.length - 1];
				if (target) {
					target.focus();
				}
			} finally {
				cancelTransition();
			}
		};
		for (const win of selected) recallWindows.delete(win);
		finishRestoration = () => {
			finishRestoration = undefined;
			if (isDarwin) finishShow = setTimeout(finish, 30);
			else finish();
		};
		// Cocoa restoration is asynchronous. Moving/focusing a still-minimised
		// window can lose the last active member of the group.
		if (!pendingRestore.size) finishRestoration();
	} catch (error) {
		cancelTransition();
		throw error;
	}
};

export const hideWindows = (plugin: TrayPlugin): void => {
	logger.info(LOG_HIDING_WINDOWS);
	const restoring = new Set(pendingRestore);
	cancelTransition();
	// Snapshot before hiding: native parent/child behavior and focus transfer
	// can otherwise change which windows appear eligible halfway through.
	const shown = [...focusOrder].filter((win) =>
		!win.isDestroyed() && (isShown(win) || restoring.has(win)),
	);
	const focused = shown.find((win) => win.isFocused());
	if (focused) {
		focusOrder.delete(focused);
		focusOrder.add(focused);
	}
	for (const win of shown) {
		if (restoring.has(win)) hideAfterRestore.set(win, plugin.settings.runInBackground);
		recallWindows.add(win);
		if (win.isMaximized()) maximizedWindows.add(win);
	}
	changingWindows = true;
	try {
		for (const win of shown.reverse()) {
			if (win.isDestroyed()) continue;
			if (plugin.settings.runInBackground) win.hide();
			else {
				pendingMinimize.add(win);
				win.minimize();
			}
		}
	} finally {
		changingWindows = false;
	}
};

export const toggleWindows = (
	plugin: TrayPlugin,
	checkForFocus = true,
): void => {
	const hasOpenWindows = getWindows().some((win) =>
		isShown(win) && (!checkForFocus || win.isFocused()),
	);
	// A second press during macOS restoration should hide, not queue a
	// second restoration before the first one has acquired focus.
	if (hasOpenWindows || restoringGroup) hideWindows(plugin);
	else showWindows();
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
