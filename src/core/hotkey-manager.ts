/**
 * Global hotkey management
 */

import {
	logger,
	LOG_REGISTER_HOTKEY,
	LOG_UNREGISTER_HOTKEY,
} from "../utils/logger";
import { electronRemote } from "../utils/electron";

interface PluginSettings {
	toggleWindowFocusHotkey?: string;
	quickNoteHotkey?: string;
}

interface TrayPlugin {
	settings: PluginSettings;
}

export const registerHotkeys = (
	plugin: TrayPlugin,
	onToggleWindows: () => void,
	onQuickNote: () => void,
): void => {
	logger.info(LOG_REGISTER_HOTKEY);
	try {
		const { globalShortcut } = electronRemote;
		const { toggleWindowFocusHotkey, quickNoteHotkey } = plugin.settings;

		if (toggleWindowFocusHotkey) {
			globalShortcut.register(toggleWindowFocusHotkey, onToggleWindows);
			logger.debug(`Registered toggle hotkey: ${toggleWindowFocusHotkey}`);
		}

		if (quickNoteHotkey) {
			globalShortcut.register(quickNoteHotkey, onQuickNote);
			logger.debug(`Registered quick note hotkey: ${quickNoteHotkey}`);
		}
	} catch (error) {
		logger.error("Error registering hotkeys: " + (error as Error).message);
	}
};

export const unregisterHotkeys = (plugin: TrayPlugin): void => {
	logger.info(LOG_UNREGISTER_HOTKEY);
	try {
		const { globalShortcut } = electronRemote;

		if (plugin.settings.toggleWindowFocusHotkey) {
			globalShortcut.unregister(plugin.settings.toggleWindowFocusHotkey);
			logger.debug(
				`Unregistered toggle hotkey: ${plugin.settings.toggleWindowFocusHotkey}`,
			);
		}
		if (plugin.settings.quickNoteHotkey) {
			globalShortcut.unregister(plugin.settings.quickNoteHotkey);
			logger.debug(
				`Unregistered quick note hotkey: ${plugin.settings.quickNoteHotkey}`,
			);
		}
		// Fallback in case other shortcuts were registered.
		globalShortcut.unregisterAll();
	} catch (error) {
		logger.error("Error unregistering hotkeys: " + (error as Error).message);
	}
};
