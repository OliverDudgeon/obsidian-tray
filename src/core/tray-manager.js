/**
 * System tray icon management
 */

import { Tray, Menu, nativeImage } from "electron";
import { logger, LOG_TRAY_ICON } from "../utils/logger.js";
import {
  ACTION_QUICK_NOTE,
  ACTION_SHOW,
  ACTION_HIDE,
  ACTION_RELAUNCH,
  ACTION_CLOSE,
  OBSIDIAN_BASE64_ICON,
} from "../utils/constants.js";

let tray;

export const replaceVaultName = (str, app) => {
  return str.replace(/{{vault}}/g, app.vault.getName());
};

export const destroyTray = () => {
  try {
    if (tray) {
      tray.destroy();
      tray = undefined;
    }
  } catch (error) {
    logger.error("Error destroying tray: " + error.message);
    tray = undefined; // Set to undefined anyway to prevent further issues
  }
};

export const createTrayIcon = (
  plugin,
  addQuickNote,
  showWindows,
  hideWindows,
  relaunchApp,
  closeVault
) => {
  destroyTray();
  if (!plugin.settings.createTrayIcon) return;

  logger.info(LOG_TRAY_ICON);
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
  tray.setContextMenu(contextMenu);
  tray.setToolTip(
    replaceVaultName(plugin.settings.trayIconTooltip, plugin.app)
  );

  tray.on("click", () => {
    if (process.platform === "darwin") {
      // On macOS, left click shows/hides windows
      const { toggleWindows } = require("../core/window-manager.js");
      toggleWindows(plugin, false);
    } else {
      showWindows();
    }
  });
};
