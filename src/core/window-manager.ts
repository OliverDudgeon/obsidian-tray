/**
 * Window management functionality
 */

import {
  logger,
  LOG_SHOWING_WINDOWS,
  LOG_HIDING_WINDOWS,
  LOG_WINDOW_CLOSE,
} from "../utils/logger";

// Electron API helpers — Obsidian exposes Electron via the legacy `remote` shim
const getElectronCurrentWindow = (): ElectronWindow => {
  const { getCurrentWindow } = globalThis.require("electron").remote;
  return getCurrentWindow();
};

const getElectronApp = () => {
  const { app } = globalThis.require("electron").remote;
  return app;
};

// Define types for Electron objects
interface ElectronWindow {
  setSkipTaskbar: (skip: boolean) => void;
  isMaximized: () => boolean;
  isMinimized: () => boolean;
  isVisible: () => boolean;
  isFocused: () => boolean;
  isDestroyed: () => boolean;
  getBounds: () => { x: number; y: number; width: number; height: number };
  setPosition: (x: number, y: number) => void;
  setVisibleOnAllWorkspaces: (visible: boolean) => void;
  show: () => void;
  hide: () => void;
  focus: () => void;
  blur: () => void;
  maximize: () => void;
  minimize: () => void;
  restore: () => void;
  moveTop: () => void;
  destroy: () => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  removeListener: (event: string, listener: (...args: any[]) => void) => void;
}

interface ElectronWebContents {
  on: (event: string, listener: (...args: any[]) => void) => void;
}

interface PluginSettings {
  hideTaskbarIcon: boolean;
  runInBackground: boolean;
}

interface TrayPlugin {
  settings: PluginSettings;
}

// Get current window function
const getCurrentWindow = (): ElectronWindow => {
  return getElectronCurrentWindow();
};

// State management
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

  onWindowCreation(getCurrentWindow());

  // Type the webContents properly
  const currentWindow = getCurrentWindow() as ElectronWindow & {
    webContents: ElectronWebContents;
  };
  currentWindow.webContents.on("did-create-window", onWindowCreation);

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
        const app = getElectronApp();
        app.dock.hide();
      }
    });
  }
};

export const showWindows = (): void => {
  logger.info(LOG_SHOWING_WINDOWS);
  getWindows().forEach((win: ElectronWindow) => {
    if (process.platform === "darwin") {
      const app = getElectronApp();
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

export const hideWindows = (plugin: TrayPlugin): void => {
  logger.info(LOG_HIDING_WINDOWS);
  getWindows().forEach((win: ElectronWindow, index: number) => {
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

export const toggleWindows = (
  plugin: TrayPlugin,
  checkForFocus = true
): void => {
  const openWindows = getWindows().some((win: ElectronWindow) => {
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
const onWindowClose = (event: Event): void => {
  // Allow quit during system shutdown on macOS
  if (isQuittingDueToSystemShutdown) return;
  event.preventDefault();
};

const onWindowUnload = (event: BeforeUnloadEvent): void => {
  logger.info(LOG_WINDOW_CLOSE);
  // Allow quit during system shutdown on macOS
  if (isQuittingDueToSystemShutdown) return;
  getCurrentWindow().hide();
  event.stopImmediatePropagation();
  // setting return value manually is more reliable than
  // via `return false` according to electron
  event.returnValue = false;
};

export const interceptWindowClose = (): void => {
  // intercept in renderer
  window.addEventListener("beforeunload", onWindowUnload, true);
  // intercept in main: is asynchronously executed when registered
  // from renderer, so won't prevent close by itself, but counteracts
  // the 3-second delayed window force close in obsidian.asar/main.js
  getCurrentWindow().on("close", onWindowClose);
};

export const allowWindowClose = (): void => {
  try {
    getCurrentWindow().removeListener("close", onWindowClose);
  } catch (error) {
    logger.error("Error removing close listener: " + (error as Error).message);
  }
  try {
    window.removeEventListener("beforeunload", onWindowUnload, true);
  } catch (error) {
    logger.error(
      "Error removing beforeunload listener: " + (error as Error).message
    );
  }
};

export const hideTaskbarIcons = (): void => {
  getWindows().forEach((win: ElectronWindow) => win.setSkipTaskbar(true));
  if (process.platform === "darwin") {
    const app = getElectronApp();
    app.dock.hide();
  }
};

export const showTaskbarIcons = (): void => {
  getWindows().forEach((win: ElectronWindow) => win.setSkipTaskbar(false));
  if (process.platform === "darwin") {
    const app = getElectronApp();
    app.dock.show();
  }
};
