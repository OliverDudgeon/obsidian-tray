/**
 * obsidian-tray v0.3.5
 * (c) 2023 dragonwocky <thedragonring.bod@gmail.com> (https://dragonwocky.me/)
 * (https://github.com/dragonwocky/obsidian-tray/) under the MIT license
 *
 * Debug Logging: To enable verbose debug logs, use one of these methods:
 * 1. Set environment variable: ELECTRON_ENABLE_DEBUG_LOGGING=true
 * 2. Add command line flag: --enable-debug-logging
 * 3. Set NODE_ENV=development
 */

"use strict";

const LOG_PREFIX = "obsidian-tray",
  LOG_LOADING = "loading",
  LOG_CLEANUP = "cleaning up",
  LOG_SHOWING_WINDOWS = "showing windows",
  LOG_HIDING_WINDOWS = "hiding windows",
  LOG_WINDOW_CLOSE = "intercepting window close",
  LOG_TRAY_ICON = "creating system icon",
  LOG_REGISTER_HOTKEY = "registering hotkey",
  LOG_UNREGISTER_HOTKEY = "unregistering hotkey",
  ACTION_QUICK_NOTE = "Quick Note",
  ACTION_SHOW = "Show Vault",
  ACTION_HIDE = "Hide Vault",
  ACTION_RELAUNCH = "Relaunch Obsidian",
  ACTION_CLOSE = "Close Vault",
  DEFAULT_DATE_FORMAT = "YYYY-MM-DD",
  ACCELERATOR_FORMAT = `
    This hotkey is registered globally and will be detected even if Obsidian does
    not have keyboard focus. Format:
    <a href="https://www.electronjs.org/docs/latest/api/accelerator" target="_blank" rel="noopener">
    Electron accelerator</a>
  `,
  MOMENT_FORMAT = `
    Format:
    <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener">
    Moment.js format string</a>
  `,
  // 16x16 base64 obsidian icon: generated from obsidian.asar/icon.png
  OBSIDIAN_BASE64_ICON = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAHZSURBVDhPlZKxTxRBFMa/XZcF7nIG7mjxjoRCwomJxgsFdhaASqzQxFDzB1AQKgstLGxIiBQGJBpiCCGx8h+wgYaGgAWNd0dyHofeEYVwt/PmOTMZV9aDIL/s5pvZvPfN9yaL/+HR3eXcypta0m4juFbP5GHuXc9IbunDFc9db/G81/ZzhDMN7g8td47mll4R5BfHwZN4LOaA+fHa259PbUmIYzWkt3e2NZNo3/V9v1vvU6kkstk+tLW3ItUVr/m+c3N8MlkwxYqmBFcbwUQQCNOcyVzDwEAWjuPi5DhAMV/tKOYPX5hCyz8Gz1zX5SmWjBvZfmTSaRBJkGAIoxJHv+pVW2yIGNxOJ8bUVNcFEWLxuG1ia6JercTbttwQTeDwPS0kCMXiXtgk/jQrFUw7ptYSMWApF40yo/ytjHq98fdk3ayVE+cn2CxMb6ruz9qAJKFUKoWza1VJSi/n0+ffgYHdWW2gHuxXymg0gjCB0sjpmiaDnkL3RzDyzLqBUKns2ztQqUR0fk2TwSrGSf1eczqF5vsPZRCQSSAFLk6gqctgQRkc6TWRQLV2YMYQki9OoNkqzFQ9r+WOGuW5CrJbOzyAlPKr6MSGLbkcDwbf35oY/jRkt6cAfgNwowruAMz9AgAAAABJRU5ErkJggg==`;

// Simple debug logging check using Electron's built-in capabilities
const isDebugEnabled = () => {
  return (
    process.env.ELECTRON_ENABLE_LOGGING === "true" ||
    process.env.ELECTRON_ENABLE_DEBUG_LOGGING === "true" ||
    process.argv.includes("--enable-logging") ||
    process.argv.includes("--enable-debug-logging") ||
    process.env.NODE_ENV === "development"
  );
};

// Use Electron's native console methods directly
const logger = {
  info: (message) => console.info(`${LOG_PREFIX}: ${message}`),
  warn: (message) => console.warn(`${LOG_PREFIX}: ${message}`),
  error: (message) => console.error(`${LOG_PREFIX}: ${message}`),
  debug: (message) => {
    if (isDebugEnabled()) {
      console.debug(`${LOG_PREFIX}: ${message}`);
    }
  },
};

// Maintain backward compatibility
const log = (message) => logger.info(message);
const debugLog = (message) => logger.debug(message);

/*
LOGGING USAGE:
- logger.info()  : For main operational messages (uses console.info)
- logger.warn()  : For warnings (uses console.warn)
- logger.error() : For errors (uses console.error)
- logger.debug() : For debug info (uses console.debug, only when debug enabled)

ENABLE DEBUG LOGGING:
1. Environment: ELECTRON_ENABLE_LOGGING=true or ELECTRON_ENABLE_DEBUG_LOGGING=true
2. Command line: --enable-logging or --enable-debug-logging
3. Development: NODE_ENV=development

Uses Electron's native console methods with proper log levels and DevTools integration.
*/

// Platform-specific terminology
const getPlatformText = () => {
  if (process.platform === "darwin") {
    return {
      systemArea: "menu bar",
      systemAreaCapitalized: "Menu Bar",
      iconType: "menu bar item",
      iconTypeCapitalized: "Menu Bar Item",
      taskbarDock: "dock",
      taskbarDockCapitalized: "Dock",
    };
  } else {
    return {
      systemArea: "system tray",
      systemAreaCapitalized: "System Tray",
      iconType: "tray icon",
      iconTypeCapitalized: "Tray Icon",
      taskbarDock: "taskbar",
      taskbarDockCapitalized: "Taskbar",
    };
  }
};

let tray,
  plugin,
  isQuittingDueToSystemShutdown = false,
  beforeQuitHandler,
  windowAllClosedHandler,
  willQuitHandler,
  quitTimeoutId;
const obsidian = require("obsidian"),
  { app, Tray, Menu } = require("electron").remote,
  { nativeImage, BrowserWindow } = require("electron").remote,
  { getCurrentWindow, globalShortcut } = require("electron").remote;

const vaultWindows = new Set(),
  maximizedWindows = new Set(),
  getWindows = () => [...vaultWindows],
  observeWindows = () => {
    const onWindowCreation = (win) => {
      vaultWindows.add(win);
      win.setSkipTaskbar(plugin.settings.hideTaskbarIcon);
      win.on("close", () => {
        if (win !== getCurrentWindow()) vaultWindows.delete(win);
      });
      // preserve maximised windows after minimisation
      if (win.isMaximized()) maximizedWindows.add(win);
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
        if (plugin.settings.hideTaskbarIcon) hideTaskbarIcons();
      });
    }
  },
  showWindows = () => {
    logger.info(LOG_SHOWING_WINDOWS);
    getWindows().forEach((win, index) => {
      if (process.platform === "darwin") {
        logger.verbose(
          `macOS: Processing window ${index + 1} for virtual desktop handling`
        );

        // Check initial window state
        const isVisible = win.isVisible();
        const isMaximized = maximizedWindows.has(win);
        logger.verbose(`macOS: Window ${index + 1} - Initial state`, {
          visible: isVisible,
          maximized: isMaximized,
        });

        // Get the current position
        const bounds = win.getBounds();
        logger.verbose(`macOS: Window ${index + 1} - Original bounds`, bounds);

        // Method 1: Use setVisibleOnAllWorkspaces to force current Space
        logger.debug(
          `macOS: Window ${index + 1} - Setting visible on all workspaces`
        );
        win.setVisibleOnAllWorkspaces(true);
        win.show();

        // Much shorter delay to make shortcut more responsive
        setTimeout(() => {
          if (!win.isDestroyed()) {
            logger.debug(
              `macOS: Window ${index + 1} - Restricting to current workspace`
            );
            win.setVisibleOnAllWorkspaces(false);

            // Slight position nudge to force Space recalculation
            win.setPosition(bounds.x + 1, bounds.y + 1);
            win.setPosition(bounds.x, bounds.y);

            win.focus();
            win.moveTop();

            // Handle maximization
            if (isMaximized) {
              logger.debug(
                `macOS: Window ${index + 1} - Restoring maximized state`
              );
              win.maximize();
            }
            logger.debug(
              `macOS: Window ${index + 1} - Virtual desktop handling completed`
            );
          }
        }, 30);
      } else {
        logger.verbose(
          `Non-macOS: Processing window ${index + 1} with standard behavior`
        );
        // Non-macOS platforms - original behavior
        if (maximizedWindows.has(win)) {
          logger.debug(
            `Non-macOS: Window ${index + 1} - Maximizing and focusing`
          );
          win.maximize();
          win.focus();
        } else {
          logger.debug(`Non-macOS: Window ${index + 1} - Showing`);
          win.show();
        }
      }
    });
  },
  hideWindows = () => {
    logger.info(LOG_HIDING_WINDOWS);
    getWindows().forEach((win, index) => {
      const isFocused = win.isFocused();
      const action = plugin.settings.runInBackground ? "hide" : "minimize";
      logger.verbose(`Hiding window ${index + 1}`, {
        focused: isFocused,
        action: action,
      });

      if (isFocused) win.blur();
      if (plugin.settings.runInBackground) {
        win.hide();
      } else {
        win.minimize();
      }
    });
  },
  toggleWindows = (checkForFocus = true) => {
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
      hideWindows();
    } else {
      logger.debug("Toggle: Showing windows");
      showWindows();
    }
  };

const onWindowClose = (event) => {
    // Allow quit during system shutdown on macOS
    if (isQuittingDueToSystemShutdown) return;
    event.preventDefault();
  },
  onWindowUnload = (event) => {
    log(LOG_WINDOW_CLOSE);
    // Allow quit during system shutdown on macOS
    if (isQuittingDueToSystemShutdown) return;
    getCurrentWindow().hide();
    event.stopImmediatePropagation();
    // setting return value manually is more reliable than
    // via `return false` according to electron
    event.returnValue = false;
  },
  interceptWindowClose = () => {
    // intercept in renderer
    window.addEventListener("beforeunload", onWindowUnload, true);
    // intercept in main: is asynchronously executed when registered
    // from renderer, so won't prevent close by itself, but counteracts
    // the 3-second delayed window force close in obsidian.asar/main.js
    getCurrentWindow().on("close", onWindowClose);
  },
  allowWindowClose = () => {
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

const handleSystemShutdown = () => {
  // On macOS, listen for system shutdown/restart/logout signals
  if (process.platform === "darwin") {
    beforeQuitHandler = (event) => {
      // If we're running in background mode, we need to be more aggressive
      // about detecting system-initiated quits (logout, restart, shutdown)
      if (plugin.settings.runInBackground) {
        const hasVisibleWindows = getWindows().some(
          (win) => win.isVisible() && !win.isMinimized()
        );

        // Check if this looks like a system-initiated quit
        // System quits often happen when no windows are visible OR
        // when the user hasn't been actively using the app
        const isLikelySystemQuit =
          !hasVisibleWindows || getWindows().every((win) => !win.isFocused());

        if (isLikelySystemQuit) {
          debugLog(
            "Detected system quit (shutdown/logout/restart) - allowing app to quit"
          );
          isQuittingDueToSystemShutdown = true;
          // Don't prevent the quit, just clean up
          cleanup();
          return;
        }

        // If windows are visible and focused, this might be user Cmd+Q
        // Handle according to runInBackground setting
        debugLog(
          "User-initiated quit with visible windows - hiding instead of quitting"
        );
        event.preventDefault();
        hideWindows();

        // Set a timeout - if the system really wants to quit (like during shutdown),
        // it will send will-quit shortly after. If not, this was likely user Cmd+Q
        if (quitTimeoutId) clearTimeout(quitTimeoutId);
        quitTimeoutId = setTimeout(() => {
          debugLog(
            "No will-quit received - this was likely a user Cmd+Q, staying hidden"
          );
          quitTimeoutId = null;
        }, 1000);
        return;
      }
    };

    // will-quit is more definitive - the app WILL quit after this
    willQuitHandler = (event) => {
      // Clear the timeout since we got will-quit
      if (quitTimeoutId) {
        clearTimeout(quitTimeoutId);
        quitTimeoutId = null;
      }

      if (plugin.settings.runInBackground && !isQuittingDueToSystemShutdown) {
        // At this point, we have one last chance to detect if this is
        // a forced quit (system shutdown/logout/restart)
        const hasVisibleWindows = getWindows().some(
          (win) => win.isVisible() && !win.isMinimized()
        );

        // If no windows are visible, this is likely a system quit
        // For logout/restart scenarios, we should allow the quit to proceed
        if (!hasVisibleWindows) {
          debugLog(
            "will-quit: System shutdown/logout detected - allowing quit"
          );
          isQuittingDueToSystemShutdown = true;
          cleanup();
          return;
        }

        // If we get will-quit after before-quit, this is probably a forced quit
        // (system shutdown/logout) even if windows were visible
        debugLog(
          "will-quit: Forced quit detected (likely system shutdown) - allowing quit"
        );
        isQuittingDueToSystemShutdown = true;
        cleanup();
        return;
      }
    };

    windowAllClosedHandler = (event) => {
      // On macOS, don't quit when all windows are closed if running in background
      if (plugin.settings.runInBackground && !isQuittingDueToSystemShutdown) {
        event.preventDefault();
      }
    };

    app.on("before-quit", beforeQuitHandler);
    app.on("will-quit", willQuitHandler);
    app.on("window-all-closed", windowAllClosedHandler);
  }
};

const hideTaskbarIcons = () => {
    getWindows().forEach((win) => win.setSkipTaskbar(true));
    if (process.platform === "darwin") app.dock.hide();
  },
  showTaskbarIcons = () => {
    getWindows().forEach((win) => win.setSkipTaskbar(false));
    if (process.platform === "darwin") app.dock.show();
  },
  setLaunchOnStartup = () => {
    const { launchOnStartup, runInBackground, hideOnLaunch } = plugin.settings;
    app.setLoginItemSettings({
      openAtLogin: launchOnStartup,
      openAsHidden: runInBackground && hideOnLaunch,
    });
  };

const cleanup = () => {
    logger.info(LOG_CLEANUP);

    try {
      unregisterHotkeys();
    } catch (error) {
      logger.error("Error unregistering hotkeys: " + error.message);
    }

    try {
      showTaskbarIcons();
    } catch (error) {
      logger.error("Error showing taskbar icons: " + error.message);
    }

    try {
      allowWindowClose();
    } catch (error) {
      logger.error("Error allowing window close: " + error.message);
    }

    try {
      destroyTray();
    } catch (error) {
      logger.error("Error destroying tray: " + error.message);
    }

    isQuittingDueToSystemShutdown = false;

    // Clear any pending timeout
    if (quitTimeoutId) {
      try {
        clearTimeout(quitTimeoutId);
        quitTimeoutId = null;
      } catch (error) {
        logger.error("Error clearing timeout: " + error.message);
      }
    }

    // Remove macOS event listeners
    if (process.platform === "darwin") {
      try {
        if (beforeQuitHandler) {
          app.removeListener("before-quit", beforeQuitHandler);
          beforeQuitHandler = null;
        }
        if (willQuitHandler) {
          app.removeListener("will-quit", willQuitHandler);
          willQuitHandler = null;
        }
        if (windowAllClosedHandler) {
          app.removeListener("window-all-closed", windowAllClosedHandler);
          windowAllClosedHandler = null;
        }
      } catch (error) {
        logger.error("Error removing macOS event listeners: " + error.message);
      }
    }
  },
  relaunchApp = () => {
    app.relaunch();
    app.exit(0);
  },
  closeVault = () => {
    log(LOG_CLEANUP);
    isQuittingDueToSystemShutdown = true;
    cleanup();
    const vaultWindows = getWindows(),
      obsidianWindows = BrowserWindow.getAllWindows();
    if (obsidianWindows.length === vaultWindows.length) {
      // quit app directly if only remaining windows are in the
      // current vault - necessary for successful quit on macos
      app.quit();
    } else vaultWindows.forEach((win) => win.destroy());
  };

const addQuickNote = () => {
    const { quickNoteLocation, quickNoteDateFormat } = plugin.settings,
      pattern = quickNoteDateFormat || DEFAULT_DATE_FORMAT,
      date = obsidian.moment().format(pattern),
      name = obsidian
        .normalizePath(`${quickNoteLocation ?? ""}/${date}`)
        .replace(/\*|"|\\|<|>|:|\||\?/g, "-"),
      // manually create and open file instead of depending
      // on createAndOpenMarkdownFile to force file creation
      // relative to the root instead of the active file
      // (in case user has default location for new notes
      // set to "same folder as current file")
      leaf = plugin.app.workspace.getLeaf(),
      root = plugin.app.fileManager.getNewFileParent(""),
      openMode = { active: true, state: { mode: "source" } };
    plugin.app.fileManager
      .createNewMarkdownFile(root, name)
      .then((file) => leaf.openFile(file, openMode));
    showWindows();
  },
  replaceVaultName = (str) => {
    return str.replace(/{{vault}}/g, plugin.app.vault.getName());
  },
  destroyTray = () => {
    try {
      if (tray) {
        tray.destroy();
        tray = undefined;
        logger.debug(
          `${getPlatformText().iconTypeCapitalized} destroyed successfully`
        );
      }
    } catch (error) {
      logger.error("Error destroying tray: " + error.message);
      tray = undefined; // Set to undefined anyway to prevent further issues
    }
  },
  createTrayIcon = () => {
    destroyTray();
    if (!plugin.settings.createTrayIcon) return;
    log(LOG_TRAY_ICON);
    const obsidianIcon = nativeImage.createFromDataURL(
        plugin.settings.trayIconImage ?? OBSIDIAN_BASE64_ICON
      ),
      contextMenu = Menu.buildFromTemplate([
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
    tray.setToolTip(replaceVaultName(plugin.settings.trayIconTooltip));
    tray.on("click", () => {
      if (process.platform === "darwin") {
        // macos does not register separate left/right click actions
        // for menu items, icon should open menu w/out causing toggle
        tray.popUpContextMenu();
      } else toggleWindows(false);
    });
  };

const registerHotkeys = () => {
    log(LOG_REGISTER_HOTKEY);
    try {
      const { toggleWindowFocusHotkey, quickNoteHotkey } = plugin.settings;
      if (toggleWindowFocusHotkey) {
        globalShortcut.register(toggleWindowFocusHotkey, toggleWindows);
      }
      if (quickNoteHotkey) {
        globalShortcut.register(quickNoteHotkey, addQuickNote);
      }
    } catch {}
  },
  unregisterHotkeys = () => {
    logger.info(LOG_UNREGISTER_HOTKEY);
    try {
      if (plugin?.settings?.toggleWindowFocusHotkey) {
        globalShortcut.unregister(plugin.settings.toggleWindowFocusHotkey);
      }
      if (plugin?.settings?.quickNoteHotkey) {
        globalShortcut.unregister(plugin.settings.quickNoteHotkey);
      }
      // Also unregister all shortcuts as a fallback
      globalShortcut.unregisterAll();
    } catch (error) {
      logger.error("Error unregistering hotkeys: " + error.message);
    }
  };

const OPTIONS = [
  "Window management",
  {
    key: "launchOnStartup",
    desc: "Open Obsidian automatically whenever you log into your computer.",
    type: "toggle",
    default: false,
    onChange: setLaunchOnStartup,
  },
  {
    key: "hideOnLaunch",
    desc: `
      Minimises Obsidian automatically whenever the app is launched. If the
      "Run in background" option is enabled, windows will be hidden to the ${
        getPlatformText().systemArea
      }
      instead of minimised to the ${getPlatformText().taskbarDock}.
    `,
    type: "toggle",
    default: false,
  },
  {
    key: "runInBackground",
    desc: `
      Hides the app and continues to run it in the background instead of quitting
      it when pressing the window close button or toggle focus hotkey.
    `,
    type: "toggle",
    default: false,
    onChange() {
      setLaunchOnStartup();
      if (plugin.settings.runInBackground) interceptWindowClose();
      else [allowWindowClose(), showWindows()];
    },
  },
  {
    key: "hideTaskbarIcon",
    desc: `
      Hides the window's icon from from the ${getPlatformText().taskbarDockCapitalized.toLowerCase()}. Enabling the ${
      getPlatformText().iconType
    } first
      is recommended if using this option. This may not work on Linux-based OSes.
    `,
    type: "toggle",
    default: false,
    onChange() {
      if (plugin.settings.hideTaskbarIcon) hideTaskbarIcons();
      else showTaskbarIcons();
    },
  },
  {
    key: "createTrayIcon",
    desc: `
      Adds an icon to your ${
        getPlatformText().systemArea
      } to bring hidden Obsidian windows
      back into focus on click or force a full quit/relaunch of the app through
      the right-click menu.
    `,
    type: "toggle",
    default: true,
    onChange: createTrayIcon,
  },
  {
    key: "trayIconImage",
    desc: `
      Set the image used by the ${
        getPlatformText().iconType
      }. Recommended size: 16x16
      <br>Preview: <img data-preview style="height: 16px; vertical-align: bottom;">
    `,
    type: "image",
    default: OBSIDIAN_BASE64_ICON,
    onChange: createTrayIcon,
  },
  {
    key: "trayIconTooltip",
    desc: `
      Set a title to identify the ${getPlatformText().iconType} by. The
      <code>{{vault}}</code> placeholder will be replaced by the vault name.
      <br>Preview: <b class="u-pop" data-preview></b>
    `,
    type: "text",
    default: "{{vault}} | Obsidian",
    postprocessor: replaceVaultName,
    onChange: createTrayIcon,
  },
  {
    key: "toggleWindowFocusHotkey",
    desc: ACCELERATOR_FORMAT,
    type: "hotkey",
    default: "CmdOrCtrl+Shift+Tab",
    onBeforeChange: unregisterHotkeys,
    onChange: registerHotkeys,
  },
  "Quick notes",
  {
    key: "quickNoteLocation",
    desc: "New quick notes will be placed in this folder.",
    type: "text",
    placeholder: "Example: notes/quick",
  },
  {
    key: "quickNoteDateFormat",
    desc: `
      New quick notes will use a filename of this pattern. ${MOMENT_FORMAT}
      <br>Preview: <b class="u-pop" data-preview></b>
    `,
    type: "moment",
    default: DEFAULT_DATE_FORMAT,
  },
  {
    key: "quickNoteHotkey",
    desc: ACCELERATOR_FORMAT,
    type: "hotkey",
    default: "CmdOrCtrl+Shift+Q",
    onBeforeChange: unregisterHotkeys,
    onChange: registerHotkeys,
  },
];

const keyToLabel = (key) => {
    // Platform-specific setting labels
    const platformText = getPlatformText();
    const customLabels = {
      createTrayIcon: `Create ${platformText.iconTypeCapitalized}`,
      trayIconImage: `${platformText.iconTypeCapitalized} Image`,
      trayIconTooltip: `${platformText.iconTypeCapitalized} Tooltip`,
      hideTaskbarIcon: `Hide ${platformText.taskbarDockCapitalized} Icon`,
    };

    if (customLabels[key]) {
      return customLabels[key];
    }

    // Default label generation for other settings
    return (
      key[0].toUpperCase() +
      key
        .slice(1)
        .split(/(?=[A-Z])/)
        .map((word) => word.toLowerCase())
        .join(" ")
    );
  },
  htmlToFragment = (html) =>
    document
      .createRange()
      .createContextualFragment((html ?? "").replace(/\s+/g, " "));

class SettingsTab extends obsidian.PluginSettingTab {
  display() {
    this.containerEl.empty();
    for (const opt of OPTIONS) {
      const setting = new obsidian.Setting(this.containerEl);
      if (typeof opt === "string") {
        setting.setName(opt);
        setting.setHeading();
      } else {
        if (opt.default) opt.placeholder ??= `Example: ${opt.default}`;
        setting.setName(keyToLabel(opt.key));
        setting.setDesc(htmlToFragment(opt.desc));
        const onChange = async (value) => {
          await opt.onBeforeChange?.();
          plugin.settings[opt.key] = value;
          await plugin.saveSettings();
          await opt.onChange?.();
        };

        const value = plugin.settings[opt.key] ?? opt.default ?? "";
        if (opt.type === "toggle") {
          setting.addToggle((toggle) => {
            toggle.setValue(value).onChange(onChange);
          });
        } else if (opt.type === "image") {
          const previewImg = setting.descEl.querySelector("img[data-preview");
          if (previewImg) previewImg.src = value;
          const fileUpload = setting.descEl.createEl("input");
          fileUpload.style.visibility = "hidden";
          fileUpload.type = "file";
          fileUpload.onchange = (event) => {
            const file = event.target.files[0],
              reader = new FileReader();
            reader.onloadend = () => {
              onChange(reader.result);
              if (previewImg) previewImg.src = reader.result;
            };
            reader.readAsDataURL(file);
          };
          setting.addButton((button) => {
            button.setIcon("image").onClick(() => fileUpload.click());
          });
        } else if (opt.type === "moment") {
          setting.addMomentFormat((moment) => {
            const previewEl = setting.descEl.querySelector("[data-preview]");
            if (previewEl) moment.setSampleEl(previewEl);
            moment
              .setPlaceholder(opt.placeholder)
              .setDefaultFormat(opt.default ?? "")
              .setValue(value)
              .onChange(onChange);
          });
        } else {
          const previewEl = setting.descEl.querySelector("[data-preview]"),
            updatePreview = (value) => {
              if (!previewEl) return;
              previewEl.innerText = opt?.postprocessor(value) ?? value;
            };
          updatePreview(value);
          setting.addText((text) => {
            text
              .setPlaceholder(opt.placeholder)
              .setValue(value)
              .onChange((value) => [onChange(value), updatePreview(value)]);
          });
        }
      }
    }
  }
}

class TrayPlugin extends obsidian.Plugin {
  async onload() {
    log(LOG_LOADING);
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));
    const { settings } = this;

    plugin = this;
    createTrayIcon();
    registerHotkeys();
    setLaunchOnStartup();
    observeWindows();
    handleSystemShutdown();
    if (settings.runInBackground) interceptWindowClose();
    if (settings.hideTaskbarIcon) hideTaskbarIcons();
    // Disabled: Don't auto-hide on plugin load, only on manual shortcut
    // if (settings.hideOnLaunch) {
    //   this.registerEvent(this.app.workspace.onLayoutReady(hideWindows));
    // }

    // add as command: can be called from command palette
    // and can have non-global hotkey assigned via in-app menu
    this.addCommand({
      id: "relaunch-app",
      name: ACTION_RELAUNCH,
      callback: relaunchApp,
    });
    this.addCommand({
      id: "close-vault",
      name: ACTION_CLOSE,
      callback: closeVault,
    });
  }
  onunload() {
    try {
      logger.debug("Plugin unloading - starting cleanup");
      cleanup();
      logger.debug("Plugin unload cleanup completed");
    } catch (error) {
      logger.error("Error during plugin unload: " + error.message);
      // Force cleanup of critical items even if others failed
      try {
        if (tray) {
          tray.destroy();
          tray = undefined;
        }
        globalShortcut.unregisterAll();
      } catch (fallbackError) {
        logger.error("Fallback cleanup also failed: " + fallbackError.message);
      }
    }
  }

  getCurrentWindow = getCurrentWindow;
  getWindows = getWindows;
  showWindows = showWindows;
  hideWindows = hideWindows;
  toggleWindows = toggleWindows;

  async loadSettings() {
    const DEFAULT_SETTINGS = OPTIONS.map((opt) => ({ [opt.key]: opt.default }));
    this.settings = Object.assign(...DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
module.exports = TrayPlugin;
