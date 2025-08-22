/**
 * Logger utility for obsidian-tray plugin
 * Uses Electron's built-in logger for consistent logging
 */

import { app } from "electron";

export const LOG_PREFIX = "obsidian-tray";

// Log level constants
export const LOG_LOADING = "loading";
export const LOG_CLEANUP = "cleaning up";
export const LOG_SHOWING_WINDOWS = "showing windows";
export const LOG_HIDING_WINDOWS = "hiding windows";
export const LOG_WINDOW_CLOSE = "intercepting window close";
export const LOG_TRAY_ICON = "creating system icon";
export const LOG_REGISTER_HOTKEY = "registering hotkey";
export const LOG_UNREGISTER_HOTKEY = "unregistering hotkey";

// Get Electron's logger
const electronLogger = app?.getLogger ? app.getLogger() : console;

// Create logger wrapper with prefixed messages
export const logger = {
  info: (message) => electronLogger.info(`[${LOG_PREFIX}] ${message}`),
  warn: (message) => electronLogger.warn(`[${LOG_PREFIX}] ${message}`),
  error: (message) => electronLogger.error(`[${LOG_PREFIX}] ${message}`),
  debug: (message) => electronLogger.debug(`[${LOG_PREFIX}] ${message}`),
  verbose: (message, data = {}) => {
    if (Object.keys(data).length > 0) {
      electronLogger.debug(
        `[${LOG_PREFIX}] ${message}`,
        JSON.stringify(data, null, 2)
      );
    } else {
      electronLogger.debug(`[${LOG_PREFIX}] ${message}`);
    }
  },
};

// Maintain backward compatibility
export const log = (message) => logger.info(message);
export const debugLog = (message) => logger.debug(message);
