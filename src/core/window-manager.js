/**
 * Window management functionality
 */

import { getCurrentWindow } from "electron";
import {
  logger,
  LOG_SHOWING_WINDOWS,
  LOG_HIDING_WINDOWS,
  LOG_WINDOW_CLOSE,
} from "../utils/logger.js";

// State management
const vaultWindows = new Set();
const maximizedWindows = new Set();
let isQuittingDueToSystemShutdown = false;

export const getWindows = () => [...vaultWindows];

export const setQuittingFlag = (flag) => {
  isQuittingDueToSystemShutdown = flag;
};

export const observeWindows = (plugin) => {
  const onWindowCreation = (win) => {
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

  onWindowCreation(getCurrentWindow());
  getCurrentWindow().webContents.on("did-create-window", onWindowCreation);

  if (process.platform === "darwin") {
    // on macos, the "hide taskbar icon" option is implemented
    // via app.dock.hide(): thus, the app as a whole will be
    // hidden from the dock, including windows from other vaults.
    // when a vault is closed via the "close vault" button,
    // the cleanup process will call app.dock.show() to restore
    // access to any other open vaults w/out the system icon enabled
    // => thus, this listener is required to re-hide the dock
    // if switching to another vault with the option enabled
    getCurrentWindow().on("focus", () => {
      if (plugin.settings.hideTaskbarIcon) {
        const { app } = require("electron").remote;
        app.dock.hide();
      }
    });
  }
};

export const showWindows = () => {
  logger.info(LOG_SHOWING_WINDOWS);
  getWindows().forEach((win) => {
    if (process.platform === "darwin") {
      const { app } = require("electron").remote;
      app.show();
      if (win.isMinimized()) win.restore();
      win.show();
      if (maximizedWindows.has(win)) win.maximize();
      win.focus();
    } else {
      if (win.isMinimized()) win.restore();
      win.show();
      if (maximizedWindows.has(win)) win.maximize();
      win.focus();
    }
  });
};

export const hideWindows = (plugin) => {
  logger.info(LOG_HIDING_WINDOWS);
  getWindows().forEach((win, index) => {
    const isFocused = win.isFocused();
    const action = plugin.settings.runInBackground ? "hide" : "minimize";
    logger.verbose(`Hiding window ${index + 1}`, {
      focused: isFocused,
      action: action,
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

export const toggleWindows = (plugin, checkForFocus = true) => {
  const openWindows = getWindows().some((win) => {
    return (!checkForFocus || win.isFocused()) && win.isVisible();
  });
  logger.verbose("Toggle windows", {
    checkForFocus: checkForFocus,
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

// Window close handling
const onWindowClose = (event) => {
  // Allow quit during system shutdown on macOS
  if (isQuittingDueToSystemShutdown) return;
  event.preventDefault();
};

const onWindowUnload = (event) => {
  logger.info(LOG_WINDOW_CLOSE);
  // Allow quit during system shutdown on macOS
  if (isQuittingDueToSystemShutdown) return;
  getCurrentWindow().hide();
  event.stopImmediatePropagation();
  // setting return value manually is more reliable than
  // via `return false` according to electron
  event.returnValue = false;
};

export const interceptWindowClose = () => {
  // intercept in renderer
  window.addEventListener("beforeunload", onWindowUnload, true);
  // intercept in main: is asynchronously executed when registered
  // from renderer, so won't prevent close by itself, but counteracts
  // the 3-second delayed window force close in obsidian.asar/main.js
  getCurrentWindow().on("close", onWindowClose);
};

export const allowWindowClose = () => {
  try {
    getCurrentWindow().removeListener("close", onWindowClose);
  } catch (error) {
    logger.error("Error removing close listener: " + error.message);
  }
  try {
    window.removeEventListener("beforeunload", onWindowUnload, true);
  } catch (error) {
    logger.error("Error removing beforeunload listener: " + error.message);
  }
};

export const hideTaskbarIcons = () => {
  getWindows().forEach((win) => win.setSkipTaskbar(true));
  if (process.platform === "darwin") {
    const { app } = require("electron").remote;
    app.dock.hide();
  }
};

export const showTaskbarIcons = () => {
  getWindows().forEach((win) => win.setSkipTaskbar(false));
  if (process.platform === "darwin") {
    const { app } = require("electron").remote;
    app.dock.show();
  }
};
