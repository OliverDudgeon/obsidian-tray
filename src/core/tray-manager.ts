/**
 * System tray icon management
 */

import { logger, LOG_TRAY_ICON } from "../utils/logger";
import { toggleWindows } from "./window-manager";
import {
	ACTION_QUICK_NOTE,
	ACTION_SHOW,
	ACTION_HIDE,
	ACTION_RELAUNCH,
	ACTION_CLOSE,
	OBSIDIAN_BASE64_ICON,
} from "../utils/constants";
import { electronRemote, type ElectronTray } from "../utils/electron";

interface ObsidianApp {
	vault: {
		getName: () => string;
	};
}

interface PluginSettings {
	createTrayIcon: boolean;
	trayIconImage?: string;
	trayIconTooltip: string;
	quickNoteHotkey?: string;
	toggleWindowFocusHotkey?: string;
	// Required by toggleWindows; we forward `plugin` to it.
	hideTaskbarIcon: boolean;
	runInBackground: boolean;
}

interface TrayPlugin {
	settings: PluginSettings;
	app: ObsidianApp;
}

let tray: ElectronTray | undefined;

export const replaceVaultName = (str: string, app: ObsidianApp): string => {
	return str.replace(/{{vault}}/g, app.vault.getName());
};

export const destroyTray = (): void => {
	try {
		if (tray) {
			tray.destroy();
			tray = undefined;
		}
	} catch (error) {
		logger.error("Error destroying tray: " + (error as Error).message);
		tray = undefined;
	}
};

export const createTrayIcon = (
	plugin: TrayPlugin,
	addQuickNote: () => void,
	showWindows: () => void,
	hideWindows: () => void,
	relaunchApp: () => void,
	closeVault: () => void,
): void => {
	destroyTray();
	if (!plugin.settings.createTrayIcon) return;

	logger.info(LOG_TRAY_ICON);

	const { Tray, Menu, nativeImage } = electronRemote;

	const obsidianIcon = nativeImage.createFromDataURL(
		plugin.settings.trayIconImage || OBSIDIAN_BASE64_ICON,
	);

	const contextMenu = Menu.buildFromTemplate([
		{
			type: "normal",
			label: ACTION_QUICK_NOTE,
			accelerator: plugin.settings.quickNoteHotkey,
			click: addQuickNote,
		},
		{
			type: "normal",
			label: ACTION_SHOW,
			accelerator: plugin.settings.toggleWindowFocusHotkey,
			click: showWindows,
		},
		{
			type: "normal",
			label: ACTION_HIDE,
			accelerator: plugin.settings.toggleWindowFocusHotkey,
			click: hideWindows,
		},
		{ type: "separator" },
		{ label: ACTION_RELAUNCH, click: relaunchApp },
		{ label: ACTION_CLOSE, click: closeVault },
	]);

	const newTray = new Tray(obsidianIcon);
	tray = newTray;

	newTray.setContextMenu(contextMenu);
	newTray.setToolTip(
		replaceVaultName(
			plugin.settings.trayIconTooltip || "{{vault}} | Obsidian",
			plugin.app,
		),
	);

	newTray.on("click", () => {
		if (process.platform === "darwin") {
			// macOS does not register separate left/right click actions for menu
			// bar items, so the icon opens the menu without triggering a window
			// toggle (see fix #16).
			newTray.popUpContextMenu();
		} else {
			toggleWindows(plugin, false);
		}
	});
};
