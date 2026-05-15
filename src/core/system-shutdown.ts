/**
 * System shutdown handling for macOS
 */

import { logger } from "../utils/logger";
import { setQuittingFlag } from "./window-manager";
import { electronRemote } from "../utils/electron";

let beforeQuitHandler: ((event: Event) => void) | null = null;
let willQuitHandler: ((event: Event) => void) | null = null;
let windowAllClosedHandler: ((event: Event) => void) | null = null;
let quitTimeoutId: ReturnType<typeof setTimeout> | null = null;

export const handleSystemShutdown = (): void => {
	if (process.platform !== "darwin") return;

	const { app } = electronRemote;

	beforeQuitHandler = () => {
		logger.debug("System shutdown: before-quit event");
		setQuittingFlag(true);

		if (quitTimeoutId) {
			clearTimeout(quitTimeoutId);
			quitTimeoutId = null;
		}

		// Force quit if something hangs.
		quitTimeoutId = setTimeout(() => {
			logger.warn("Force quitting due to timeout");
			process.exit(0);
		}, 5000);
	};

	// `will-quit` is more definitive — the app *will* quit after this.
	willQuitHandler = () => {
		logger.debug("System shutdown: will-quit event");
		setQuittingFlag(true);

		if (quitTimeoutId) {
			clearTimeout(quitTimeoutId);
			quitTimeoutId = null;
		}
	};

	windowAllClosedHandler = () => {
		logger.debug("System shutdown: window-all-closed event");
		setQuittingFlag(true);
	};

	app.on("before-quit", beforeQuitHandler);
	app.on("will-quit", willQuitHandler);
	app.on("window-all-closed", windowAllClosedHandler);
};

export const removeSystemShutdownHandlers = (): void => {
	if (quitTimeoutId) {
		try {
			clearTimeout(quitTimeoutId);
			quitTimeoutId = null;
		} catch (error) {
			logger.error("Error clearing quit timeout: " + (error as Error).message);
		}
	}

	if (process.platform !== "darwin") return;

	try {
		const { app } = electronRemote;
		if (beforeQuitHandler) app.removeListener("before-quit", beforeQuitHandler);
		if (willQuitHandler) app.removeListener("will-quit", willQuitHandler);
		if (windowAllClosedHandler) {
			app.removeListener("window-all-closed", windowAllClosedHandler);
		}
	} catch (error) {
		logger.error(
			"Error removing system shutdown handlers: " + (error as Error).message,
		);
	}
};
