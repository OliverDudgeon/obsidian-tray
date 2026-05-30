/**
 * Typed access to Electron's main-process APIs from Obsidian's renderer.
 * Obsidian still exposes them via the legacy `@electron/remote` shim.
 */

export interface ElectronDock {
	show: () => void;
	hide: () => void;
}

export interface ElectronApp {
	setLoginItemSettings: (settings: {
		openAtLogin: boolean;
		openAsHidden: boolean;
	}) => void;
	relaunch: () => void;
	exit: (code: number) => void;
	quit: () => void;
	// On macOS, `steal: true` brings the app to the foreground even when
	// another app on another Space currently has focus.
	focus: (options?: { steal?: boolean }) => void;
	dock: ElectronDock;
	on: (event: string, listener: (event: Event) => void) => void;
	removeListener: (
		event: string,
		listener: (event: Event) => void,
	) => void;
}

export interface ElectronWebContents {
	on: (event: string, listener: (win: ElectronWindow) => void) => void;
}

export interface ElectronRectangle {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ElectronWindow {
	setSkipTaskbar: (skip: boolean) => void;
	isMaximized: () => boolean;
	isMinimized: () => boolean;
	isVisible: () => boolean;
	isFocused: () => boolean;
	isDestroyed: () => boolean;
	show: () => void;
	hide: () => void;
	focus: () => void;
	blur: () => void;
	maximize: () => void;
	minimize: () => void;
	restore: () => void;
	destroy: () => void;
	moveTop: () => void;
	getBounds: () => ElectronRectangle;
	setPosition: (x: number, y: number) => void;
	setVisibleOnAllWorkspaces: (visible: boolean) => void;
	on: (event: string, listener: (...args: unknown[]) => void) => void;
	removeListener: (
		event: string,
		listener: (...args: unknown[]) => void,
	) => void;
	webContents: ElectronWebContents;
}

export interface ElectronBrowserWindow {
	getAllWindows: () => ElectronWindow[];
}

export interface ElectronPoint {
	x: number;
	y: number;
}

export interface ElectronDisplay {
	id: number;
	bounds: ElectronRectangle;
	workArea: ElectronRectangle;
}

export interface ElectronScreen {
	getCursorScreenPoint: () => ElectronPoint;
	getDisplayNearestPoint: (point: ElectronPoint) => ElectronDisplay;
}

// Opaque handle types — we never touch their internals directly.
export type ElectronNativeImage = object;
export type ElectronMenu = object;

export interface ElectronTray {
	destroy: () => void;
	setContextMenu: (menu: ElectronMenu) => void;
	setToolTip: (toolTip: string) => void;
	popUpContextMenu: () => void;
	on: (event: string, listener: () => void) => void;
}

export type ElectronTrayConstructor = new (
	image: ElectronNativeImage,
) => ElectronTray;

export interface ElectronMenuItem {
	type?: "normal" | "separator";
	label?: string;
	accelerator?: string;
	click?: () => void;
}

export interface ElectronMenuStatic {
	buildFromTemplate: (template: ElectronMenuItem[]) => ElectronMenu;
}

export interface ElectronNativeImageStatic {
	createFromDataURL: (dataURL: string) => ElectronNativeImage;
}

export interface ElectronGlobalShortcut {
	register: (accelerator: string, callback: () => void) => boolean;
	unregister: (accelerator: string) => void;
	unregisterAll: () => void;
}

interface ElectronRemote {
	app: ElectronApp;
	BrowserWindow: ElectronBrowserWindow;
	Tray: ElectronTrayConstructor;
	Menu: ElectronMenuStatic;
	nativeImage: ElectronNativeImageStatic;
	globalShortcut: ElectronGlobalShortcut;
	screen: ElectronScreen;
	getCurrentWindow: () => ElectronWindow;
}

const electronRequire = (
	globalThis as unknown as {
		require: (mod: string) => { remote: ElectronRemote };
	}
).require;

export const electronRemote: ElectronRemote =
	electronRequire("electron").remote;
