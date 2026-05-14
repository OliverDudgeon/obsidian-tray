/**
 * System tray icon management
 */

import { logger, LOG_TRAY_ICON } from "../utils/logger.js";
import { toggleWindows } from "./window-manager.js";
import {
  ACTION_QUICK_NOTE,
  ACTION_SHOW,
  ACTION_HIDE,
  ACTION_RELAUNCH,
  ACTION_CLOSE,
  OBSIDIAN_BASE64_ICON,
} from "../utils/constants.js";

// Electron API helper
const getElectronTrayComponents = () => {
  const { Tray, Menu, nativeImage } = globalThis.require("electron");
  return { Tray, Menu, nativeImage };
};

interface ElectronTray {
  destroy: () => void;
  setContextMenu: (menu: ElectronMenu) => void;
  setToolTip: (toolTip: string) => void;
  on: (event: string, listener: () => void) => void;
}

interface ElectronMenu {
  // Menu is built from template, we don't need to define its structure
}

interface ElectronNativeImage {
  createFromDataURL: (dataURL: string) => ElectronNativeImage;
}

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
    tray = undefined; // Set to undefined anyway to prevent further issues
  }
};

export const createTrayIcon = (
  plugin: TrayPlugin,
  addQuickNote: () => void,
  showWindows: () => void,
  hideWindows: () => void,
  relaunchApp: () => void,
  closeVault: () => void
): void => {
  destroyTray();
  if (!plugin.settings.createTrayIcon) return;

  logger.info(LOG_TRAY_ICON);

  const { Tray, Menu, nativeImage } = getElectronTrayComponents();

  const obsidianIcon = nativeImage.createFromDataURL(
    plugin.settings.trayIconImage ?? OBSIDIAN_BASE64_ICON
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

  tray = new Tray(obsidianIcon);

  if (tray) {
    tray.setContextMenu(contextMenu);
    tray.setToolTip(
      replaceVaultName(plugin.settings.trayIconTooltip, plugin.app)
    );

    tray.on("click", () => {
      if (process.platform === "darwin") {
        // On macOS, left click shows/hides windows
        toggleWindows(plugin as any, false);
      } else {
        showWindows();
      }
    });
  }
};
