/**
 * Global hotkey management
 */

import { globalShortcut } from "electron";
import {
  logger,
  LOG_REGISTER_HOTKEY,
  LOG_UNREGISTER_HOTKEY,
} from "../utils/logger.js";

export const registerHotkeys = (plugin, onToggleWindows, onQuickNote) => {
  logger.info(LOG_REGISTER_HOTKEY);
  try {
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
    logger.error("Error registering hotkeys: " + error.message);
  }
};

export const unregisterHotkeys = (plugin) => {
  logger.info(LOG_UNREGISTER_HOTKEY);
  try {
    if (plugin?.settings?.toggleWindowFocusHotkey) {
      globalShortcut.unregister(plugin.settings.toggleWindowFocusHotkey);
      logger.debug(
        `Unregistered toggle hotkey: ${plugin.settings.toggleWindowFocusHotkey}`
      );
    }
    if (plugin?.settings?.quickNoteHotkey) {
      globalShortcut.unregister(plugin.settings.quickNoteHotkey);
      logger.debug(
        `Unregistered quick note hotkey: ${plugin.settings.quickNoteHotkey}`
      );
    }
    // Also unregister all shortcuts as a fallback
    globalShortcut.unregisterAll();
  } catch (error) {
    logger.error("Error unregistering hotkeys: " + error.message);
  }
};
