/**
 * obsidian-tray
 * (c) 2023 dragonwocky <thedragonring.bod@gmail.com> (https://dragonwocky.me/)
 * (https://github.com/dragonwocky/obsidian-tray/) under the MIT license
 */

import { Plugin, moment, normalizePath, type TFile } from "obsidian";
import { logger, log, LOG_LOADING, LOG_CLEANUP } from "./utils/logger";
import { DEFAULT_DATE_FORMAT } from "./utils/constants";
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
} from "./core/window-manager";
import {
	handleSystemShutdown,
	removeSystemShutdownHandlers,
} from "./core/system-shutdown";
import { createTrayIcon, destroyTray } from "./core/tray-manager";
import { registerHotkeys, unregisterHotkeys } from "./core/hotkey-manager";
import { SettingsTab } from "./ui/settings-tab";

export interface PluginSettings {
	runInBackground: boolean;
	hideOnLaunch: boolean;
	launchOnStartup: boolean;
	hideTaskbarIcon: boolean;
	createTrayIcon: boolean;
	trayIconImage: string;
	trayIconTooltip: string;
	toggleWindowFocusHotkey: string;
	quickNoteHotkey: string;
	quickNoteLocation: string;
	quickNoteDateFormat: string;
	// settings-tab.ts iterates settings dynamically by key
	[key: string]: unknown;
}

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
	getAllWindows: () => unknown[];
}

// Obsidian's renderer exposes Electron's main-process APIs via the legacy
// `remote` shim — app, BrowserWindow, getCurrentWindow all live there.
const electronRemote = (
	globalThis as unknown as {
		require: (mod: string) => {
			remote: {
				app: ElectronApp;
				BrowserWindow: ElectronBrowserWindow;
				getCurrentWindow: () => unknown;
			};
		};
	}
).require("electron").remote;

const getElectronApp = (): ElectronApp => electronRemote.app;

const getElectronBrowserWindow = (): ElectronBrowserWindow =>
	electronRemote.BrowserWindow;

const getElectronCurrentWindow = (): unknown => electronRemote.getCurrentWindow();

export const DEFAULT_SETTINGS: PluginSettings = {
	runInBackground: true,
	hideOnLaunch: false,
	launchOnStartup: false,
	hideTaskbarIcon: false,
	createTrayIcon: true,
	trayIconImage: "",
	trayIconTooltip: "{{vault}} | Obsidian",
	toggleWindowFocusHotkey: "CmdOrCtrl+Shift+A",
	quickNoteHotkey: "CmdOrCtrl+Shift+N",
	quickNoteLocation: "",
	quickNoteDateFormat: DEFAULT_DATE_FORMAT,
};

export default class TrayPlugin extends Plugin {
	settings!: PluginSettings;

	async onload(): Promise<void> {
		log(LOG_LOADING);

		await this.loadSettings();

		observeWindows(this);
		handleSystemShutdown();

		this.setLaunchOnStartup();
		if (this.settings.runInBackground) this.interceptWindowClose();
		if (this.settings.hideTaskbarIcon) this.hideTaskbarIcons();

		this.createTrayIcon();
		this.registerHotkeys();

		this.addSettingTab(new SettingsTab(this.app, this));

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

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getCurrentWindow(): unknown {
		return getElectronCurrentWindow();
	}

	getWindows(): unknown[] {
		return getWindows();
	}

	showWindows(): void {
		showWindows();
	}

	hideWindows(): void {
		hideWindows(this);
	}

	toggleWindows(checkForFocus = true): void {
		toggleWindows(this, checkForFocus);
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

	setLaunchOnStartup(): void {
		const { launchOnStartup, runInBackground, hideOnLaunch } = this.settings;
		getElectronApp().setLoginItemSettings({
			openAtLogin: launchOnStartup,
			openAsHidden: runInBackground && hideOnLaunch,
		});
	}

	createTrayIcon(): void {
		createTrayIcon(
			this,
			() => this.addQuickNote(),
			() => this.showWindows(),
			() => this.hideWindows(),
			() => this.relaunchApp(),
			() => this.closeVault(),
		);
	}

	registerHotkeys(): void {
		registerHotkeys(
			this,
			() => this.toggleWindows(),
			() => this.addQuickNote(),
		);
	}

	unregisterHotkeys(): void {
		unregisterHotkeys(this);
	}

	addQuickNote(): void {
		const { quickNoteLocation, quickNoteDateFormat } = this.settings;
		const pattern = quickNoteDateFormat || DEFAULT_DATE_FORMAT;
		const date = (moment as unknown as () => { format: (p: string) => string })().format(pattern);
		const name = normalizePath(`${quickNoteLocation}/${date}`).replace(
			/\*|"|\\|<|>|:|\||\?/g,
			"-",
		);

		// manually create and open file instead of depending
		// on createAndOpenMarkdownFile to force file creation
		// relative to the root instead of the active file
		// (in case user has default location for new notes
		// set to "same folder as current file")
		const leaf = this.app.workspace.getLeaf();
		const root = this.app.fileManager.getNewFileParent("");
		const openMode = { active: true, state: { mode: "source" } };

		(
			this.app.fileManager as unknown as {
				createNewMarkdownFile: (
					root: unknown,
					name: string,
				) => Promise<TFile>;
			}
		)
			.createNewMarkdownFile(root, name)
			.then((file: TFile) => leaf.openFile(file, openMode));

		this.showWindows();
	}

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
			// current vault — necessary for successful quit on macos
			getElectronApp().quit();
		} else {
			vaultWindows.forEach((win) => win.destroy());
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
				"Error removing system shutdown handlers: " + (error as Error).message,
			);
		}

		setQuittingFlag(false);
	}
}
