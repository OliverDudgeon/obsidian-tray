/**
 * System shutdown handling for macOS
 */

import { logger } from "../utils/logger";
import { setQuittingFlag } from "./window-manager";

// Electron API helper
const getElectronApp = () => {
  const { app } = globalThis.require("electron").remote;
  return app;
};

interface ElectronApp {
  on: (event: string, listener: (event: Event) => void) => void;
  removeListener: (event: string, listener: (event: Event) => void) => void;
}

let beforeQuitHandler: ((event: Event) => void) | null = null;
let willQuitHandler: ((event: Event) => void) | null = null;
let windowAllClosedHandler: ((event: Event) => void) | null = null;
let quitTimeoutId: NodeJS.Timeout | null = null;

export const handleSystemShutdown = (): void => {
  // On macOS, listen for system shutdown/restart/logout signals
  if (process.platform === "darwin") {
    const app = getElectronApp();

    beforeQuitHandler = (_event: Event) => {
      logger.debug("System shutdown: before-quit event");
      // Set flag to allow window close
      setQuittingFlag(true);

      // Clear any existing timeout
      if (quitTimeoutId) {
        clearTimeout(quitTimeoutId);
        quitTimeoutId = null;
      }

      // Set a timeout to force quit if something hangs
      quitTimeoutId = setTimeout(() => {
        logger.warn("Force quitting due to timeout");
        process.exit(0);
      }, 5000);
    };

    // will-quit is more definitive - the app WILL quit after this
    willQuitHandler = (_event: Event) => {
      logger.debug("System shutdown: will-quit event");
      setQuittingFlag(true);

      if (quitTimeoutId) {
        clearTimeout(quitTimeoutId);
        quitTimeoutId = null;
      }
    };

    windowAllClosedHandler = (_event: Event) => {
      logger.debug("System shutdown: window-all-closed event");
      setQuittingFlag(true);
    };

    app.on("before-quit", beforeQuitHandler);
    app.on("will-quit", willQuitHandler);
    app.on("window-all-closed", windowAllClosedHandler);
  }
};

export const removeSystemShutdownHandlers = (): void => {
  // Clear any pending timeout
  if (quitTimeoutId) {
    try {
      clearTimeout(quitTimeoutId);
      quitTimeoutId = null;
    } catch (error) {
      logger.error("Error clearing quit timeout: " + (error as Error).message);
    }
  }

  // Remove macOS event listeners
  if (process.platform === "darwin") {
    try {
      const app = getElectronApp();
      if (beforeQuitHandler)
        app.removeListener("before-quit", beforeQuitHandler);
      if (willQuitHandler) app.removeListener("will-quit", willQuitHandler);
      if (windowAllClosedHandler)
        app.removeListener("window-all-closed", windowAllClosedHandler);
    } catch (error) {
      logger.error(
        "Error removing system shutdown handlers: " + (error as Error).message
      );
    }
  }
};
