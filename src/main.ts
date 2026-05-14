/**
 * obsidian-tray v0.3.5
 * (c) 2023 dragonwocky <thedragonring.bod@gmail.com> (https://dragonwocky.me/)
 * (https://github.com/dragonwocky/obsidian-tray/) under the MIT license
 */

import { Plugin, moment, normalizePath, type TFile } from "obsidian";
import { logger, log, LOG_LOADING, LOG_CLEANUP } from "./utils/logger.js";
import { DEFAULT_DATE_FORMAT } from "./utils/constants.js";

// Core modules
import {
  observeWindows,
  showWindows,
  hideWindows,
  toggleWindows,
  interceptWindowClose,
  allowWindowClose,
  hideTaskbarIcons,
  showTaskbarIcons,
  getWindows,
  setQuittingFlag,
} from "./core/window-manager.js";
import {
  handleSystemShutdown,
  removeSystemShutdownHandlers,
} from "./core/system-shutdown.js";
import { createTrayIcon, destroyTray } from "./core/tray-manager.js";
import { registerHotkeys, unregisterHotkeys } from "./core/hotkey-manager.js";

// UI modules
import { SettingsTab } from "./ui/settings-tab.js";

// Define the plugin settings interface
interface PluginSettings {
  runInBackground?: boolean;
  hideOnLaunch?: boolean;
  launchOnStartup?: boolean;
  hideTaskbarIcon?: boolean;
  createTrayIcon?: boolean;
  trayIconImage?: string;
  trayIconTooltip?: string;
  toggleObsidianHotkey?: string;
  toggleWindowFocusHotkey?: string;
  quickNoteHotkey?: string;
  quickNoteLocation?: string;
  quickNoteDateFormat?: string;
  [key: string]: any; // Allow additional properties
}

// Electron interfaces
interface ElectronApp {
  setLoginItemSettings: (settings: {
    openAtLogin: boolean;
    openAsHidden: boolean;
  }) => void;
  relaunch: () => void;
  exit: (code: number) => void;
  quit: () => void;
}

interface ElectronBrowserWindow {
  getAllWindows: () => any[];
  destroy?: () => void;
}

interface ElectronWindow {
  destroy: () => void;
}

// Electron API helpers
const getElectronApp = (): ElectronApp => {
  const { app } = globalThis.require("electron");
  return app;
};

const getElectronBrowserWindow = (): ElectronBrowserWindow => {
  const { BrowserWindow } = globalThis.require("electron");
  return BrowserWindow;
};

const getElectronCurrentWindow = () => {
  const { getCurrentWindow } = globalThis.require("electron").remote;
  return getCurrentWindow();
};

const DEFAULT_SETTINGS: PluginSettings = {
  runInBackground: true,
  hideOnLaunch: false,
  launchOnStartup: false,
  hideTaskbarIcon: false,
  createTrayIcon: true,
  trayIconImage: undefined, // Will use default icon
  trayIconTooltip: undefined,
  toggleObsidianHotkey: "CmdOrCtrl+Shift+A",
  toggleWindowFocusHotkey: "CmdOrCtrl+Shift+A",
  quickNoteHotkey: "CmdOrCtrl+Shift+N",
  quickNoteLocation: undefined,
  quickNoteDateFormat: undefined,
};

export default class TrayPlugin extends Plugin {
  settings!: PluginSettings;

  async onload(): Promise<void> {
    log(LOG_LOADING);

    await this.loadSettings();

    // Initialize window management with normalized settings
    const normalizedPlugin = {
      settings: {
        ...this.settings,
        hideTaskbarIcon:
          this.settings.hideTaskbarIcon ??
          DEFAULT_SETTINGS.hideTaskbarIcon ??
          false,
        runInBackground:
          this.settings.runInBackground ??
          DEFAULT_SETTINGS.runInBackground ??
          true,
      },
    };
    observeWindows(normalizedPlugin as any);

    // Setup system shutdown handling
    handleSystemShutdown();

    // Apply initial settings
    this.setLaunchOnStartup();

    if (this.settings.runInBackground ?? DEFAULT_SETTINGS.runInBackground) {
      this.interceptWindowClose();
    }

    if (this.settings.hideTaskbarIcon ?? DEFAULT_SETTINGS.hideTaskbarIcon) {
      this.hideTaskbarIcons();
    } // Create tray icon and register hotkeys
    this.createTrayIcon();
    this.registerHotkeys();

    // Add settings tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // Register commands
    this.addCommand({
      id: "tray-relaunch-obsidian",
      name: "Tray: Relaunch Obsidian",
      callback: () => this.relaunchApp(),
    });

    this.addCommand({
      id: "tray-close-vault",
      name: "Tray: Close Vault",
      callback: () => this.closeVault(),
    });

    logger.debug("Plugin loaded successfully");
  }

  onunload(): void {
    this.cleanup();
  }

  // Settings management
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // Window management methods
  getCurrentWindow(): any {
    return getElectronCurrentWindow();
  }

  getWindows(): any[] {
    return getWindows();
  }

  showWindows(): void {
    showWindows();
  }

  hideWindows(): void {
    // Create a normalized plugin object with guaranteed boolean values
    const normalizedPlugin = {
      settings: {
        ...this.settings,
        hideTaskbarIcon:
          this.settings.hideTaskbarIcon ??
          DEFAULT_SETTINGS.hideTaskbarIcon ??
          false,
      },
    };
    hideWindows(normalizedPlugin as any);
  }

  toggleWindows(checkForFocus = true): void {
    // Create a normalized plugin object with guaranteed boolean values
    const normalizedPlugin = {
      settings: {
        ...this.settings,
        hideTaskbarIcon:
          this.settings.hideTaskbarIcon ??
          DEFAULT_SETTINGS.hideTaskbarIcon ??
          false,
      },
    };
    toggleWindows(normalizedPlugin as any, checkForFocus);
  }

  interceptWindowClose(): void {
    interceptWindowClose();
  }

  allowWindowClose(): void {
    allowWindowClose();
  }

  hideTaskbarIcons(): void {
    hideTaskbarIcons();
  }

  showTaskbarIcons(): void {
    showTaskbarIcons();
  }

  // Startup management
  setLaunchOnStartup(): void {
    const { launchOnStartup, runInBackground, hideOnLaunch } = this.settings;
    const app = getElectronApp();
    app.setLoginItemSettings({
      openAtLogin: launchOnStartup ?? DEFAULT_SETTINGS.launchOnStartup ?? false,
      openAsHidden:
        (runInBackground ?? DEFAULT_SETTINGS.runInBackground ?? false) &&
        (hideOnLaunch ?? DEFAULT_SETTINGS.hideOnLaunch ?? false),
    });
  }

  // Tray management
  createTrayIcon(): void {
    // Create a normalized plugin object with guaranteed boolean values
    const normalizedPlugin = {
      settings: {
        ...this.settings,
        createTrayIcon:
          this.settings.createTrayIcon ??
          DEFAULT_SETTINGS.createTrayIcon ??
          true,
      },
      app: this.app,
    };
    createTrayIcon(
      normalizedPlugin as any,
      () => this.addQuickNote(),
      () => this.showWindows(),
      () => this.hideWindows(),
      () => this.relaunchApp(),
      () => this.closeVault()
    );
  }

  // Hotkey management
  registerHotkeys(): void {
    registerHotkeys(
      this,
      () => this.toggleWindows(),
      () => this.addQuickNote()
    );
  }

  unregisterHotkeys(): void {
    unregisterHotkeys(this);
  }

  // Quick note functionality
  addQuickNote(): void {
    const { quickNoteLocation, quickNoteDateFormat } = this.settings;
    const pattern = quickNoteDateFormat || DEFAULT_DATE_FORMAT;
    const date = (moment as any)().format(pattern);
    const name = normalizePath(`${quickNoteLocation ?? ""}/${date}`).replace(
      /\*|"|\\|<|>|:|\||\?/g,
      "-"
    );

    // manually create and open file instead of depending
    // on createAndOpenMarkdownFile to force file creation
    // relative to the root instead of the active file
    // (in case user has default location for new notes
    // set to "same folder as current file")
    const leaf = this.app.workspace.getLeaf();
    const root = this.app.fileManager.getNewFileParent("");
    const openMode = { active: true, state: { mode: "source" } };

    (this.app.fileManager as any)
      .createNewMarkdownFile(root, name)
      .then((file: TFile) => leaf.openFile(file, openMode));

    this.showWindows();
  }

  // App lifecycle management
  relaunchApp(): void {
    const app = getElectronApp();
    app.relaunch();
    app.exit(0);
  }

  closeVault(): void {
    log(LOG_CLEANUP);
    setQuittingFlag(true);
    this.cleanup();

    const vaultWindows = getWindows();
    const BrowserWindow = getElectronBrowserWindow();
    const obsidianWindows = BrowserWindow.getAllWindows();

    if (obsidianWindows.length === vaultWindows.length) {
      // quit app directly if only remaining windows are in the
      // current vault - necessary for successful quit on macos
      const app = getElectronApp();
      app.quit();
    } else {
      vaultWindows.forEach((win: any) => win.destroy());
    }
  }

  cleanup(): void {
    logger.info(LOG_CLEANUP);

    try {
      this.unregisterHotkeys();
    } catch (error) {
      logger.error("Error unregistering hotkeys: " + (error as Error).message);
    }

    try {
      this.showTaskbarIcons();
    } catch (error) {
      logger.error("Error showing taskbar icons: " + (error as Error).message);
    }

    try {
      this.allowWindowClose();
    } catch (error) {
      logger.error("Error allowing window close: " + (error as Error).message);
    }

    try {
      destroyTray();
    } catch (error) {
      logger.error("Error destroying tray: " + (error as Error).message);
    }

    try {
      removeSystemShutdownHandlers();
    } catch (error) {
      logger.error(
        "Error removing system shutdown handlers: " + (error as Error).message
      );
    }

    setQuittingFlag(false);
  }
}
