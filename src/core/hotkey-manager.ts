/**
 * Global hotkey management
 */

import {
  logger,
  LOG_REGISTER_HOTKEY,
  LOG_UNREGISTER_HOTKEY,
} from "../utils/logger";

// Electron API helper — Obsidian exposes globalShortcut via the legacy `remote` shim
const getElectronGlobalShortcut = () => {
  const { globalShortcut } = globalThis.require("electron").remote;
  return globalShortcut;
};

interface ElectronGlobalShortcut {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
  unregisterAll: () => void;
}

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
  onQuickNote: () => void
): void => {
  logger.info(LOG_REGISTER_HOTKEY);
  try {
    const globalShortcut = getElectronGlobalShortcut();
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
    const globalShortcut = getElectronGlobalShortcut();

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
    logger.error("Error unregistering hotkeys: " + (error as Error).message);
  }
};
