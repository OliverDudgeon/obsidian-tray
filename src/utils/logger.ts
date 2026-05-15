/**
 * Logger utility for obsidian-tray plugin
 * Uses Electron's built-in logger for consistent logging
 */

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

// Logger interface
interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
  verbose?: (message: string, data?: Record<string, unknown>) => void;
}

// Get Electron's logger with fallback to console
const getElectronLogger = (): Logger => {
  try {
    const { app } = globalThis.require("electron");
    return app?.getLogger ? app.getLogger() : console;
  } catch {
    return console;
  }
};

const electronLogger: Logger = getElectronLogger();

// Create logger wrapper with prefixed messages
export const logger = {
  info: (message: string) => electronLogger.info(`[${LOG_PREFIX}] ${message}`),
  warn: (message: string) => electronLogger.warn(`[${LOG_PREFIX}] ${message}`),
  error: (message: string) =>
    electronLogger.error(`[${LOG_PREFIX}] ${message}`),
  debug: (message: string) =>
    electronLogger.debug(`[${LOG_PREFIX}] ${message}`),
  verbose: (message: string, data: Record<string, unknown> = {}) => {
    if (Object.keys(data).length > 0) {
      const dataStr = JSON.stringify(data, null, 2);
      electronLogger.debug?.(`[${LOG_PREFIX}] ${message}\n${dataStr}`);
    } else {
      electronLogger.debug?.(`[${LOG_PREFIX}] ${message}`);
    }
  },
};

// Maintain backward compatibility
export const log = (message: string): void => logger.info(message);
export const debugLog = (message: string): void => logger.debug(message);
