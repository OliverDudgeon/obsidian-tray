/**
 * Prefixed logger wrapping the renderer console. The original plugin
 * attempted to fetch Electron's main-process logger via `app.getLogger`,
 * but that API does not exist in the renderer — the call always fell
 * back to `console` anyway.
 */

export const LOG_PREFIX = "obsidian-tray";

export const LOG_LOADING = "loading";
export const LOG_CLEANUP = "cleaning up";
export const LOG_SHOWING_WINDOWS = "showing windows";
export const LOG_HIDING_WINDOWS = "hiding windows";
export const LOG_WINDOW_CLOSE = "intercepting window close";
export const LOG_TRAY_ICON = "creating system icon";
export const LOG_REGISTER_HOTKEY = "registering hotkey";
export const LOG_UNREGISTER_HOTKEY = "unregistering hotkey";

const prefix = (message: string) => `[${LOG_PREFIX}] ${message}`;

export const logger = {
	info: (message: string): void => console.debug(prefix(message)),
	warn: (message: string): void => console.warn(prefix(message)),
	error: (message: string): void => console.error(prefix(message)),
	debug: (message: string): void => console.debug(prefix(message)),
	verbose: (message: string, data: Record<string, unknown> = {}): void => {
		if (Object.keys(data).length > 0) {
			console.debug(prefix(message) + "\n" + JSON.stringify(data, null, 2));
		} else {
			console.debug(prefix(message));
		}
	},
};

export const log = (message: string): void => logger.info(message);
export const debugLog = (message: string): void => logger.debug(message);
