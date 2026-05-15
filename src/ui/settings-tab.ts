/**
 * Settings UI component
 */

import { PluginSettingTab, Setting, App, moment, type Plugin } from "obsidian";
import { getPlatformText } from "../utils/platform";
import {
	ACCELERATOR_FORMAT,
	MOMENT_FORMAT,
	DEFAULT_DATE_FORMAT,
	OBSIDIAN_BASE64_ICON,
} from "../utils/constants";
import { replaceVaultName } from "../core/tray-manager";

interface ObsidianApp {
	vault: {
		getName: () => string;
	};
}

interface PluginSettings {
	launchOnStartup?: boolean;
	hideOnLaunch?: boolean;
	runInBackground?: boolean;
	hideTaskbarIcon?: boolean;
	createTrayIcon?: boolean;
	trayIconImage?: string;
	trayIconTooltip?: string;
	toggleWindowFocusHotkey?: string;
	quickNoteLocation?: string;
	quickNoteDateFormat?: string;
	quickNoteHotkey?: string;
	[key: string]: unknown;
}

interface TrayPlugin extends Plugin {
	settings: PluginSettings;
	app: App & ObsidianApp;
	setLaunchOnStartup: () => void;
	interceptWindowClose: () => void;
	allowWindowClose: () => void;
	hideTaskbarIcons: () => void;
	showTaskbarIcons: () => void;
	createTrayIcon: () => void;
	registerHotkeys: () => void;
	unregisterHotkeys: () => void;
	saveSettings: () => Promise<void>;
}

type SettingType = "toggle" | "text" | "hotkey" | "image" | "moment";

interface SettingOption {
	key: string;
	desc?: string;
	type: SettingType;
	default?: string | boolean;
	placeholder?: string;
	postprocessor?: (value: string) => string;
	onChange?: () => void;
	onBeforeChange?: () => void;
}

type SettingEntry = string | SettingOption;

const keyToLabel = (key: string): string => {
	const platformText = getPlatformText();
	const customLabels: Record<string, string> = {
		createTrayIcon: `Create ${platformText.iconTypeCapitalized}`,
		trayIconImage: `${platformText.iconTypeCapitalized} image`,
		trayIconTooltip: `${platformText.iconTypeCapitalized} tooltip`,
		hideTaskbarIcon: `Hide ${platformText.taskbarDockCapitalized} icon`,
	};

	if (customLabels[key]) return customLabels[key];

	return (
		key[0].toUpperCase() +
		key
			.slice(1)
			.split(/(?=[A-Z])/)
			.map((word) => word.toLowerCase())
			.join(" ")
	);
};

const htmlToFragment = (html?: string): DocumentFragment =>
	document
		.createRange()
		.createContextualFragment((html ?? "").replace(/\s+/g, " "));

export class SettingsTab extends PluginSettingTab {
	plugin: TrayPlugin;

	constructor(app: App, plugin: TrayPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		const options = this.getSettingsOptions();

		for (const option of options) {
			if (typeof option === "string") {
				new Setting(containerEl).setName(option).setHeading();
				continue;
			}

			const {
				key,
				desc,
				type,
				default: defaultValue,
				placeholder,
				postprocessor,
				onChange,
				onBeforeChange,
			} = option;

			const setting = new Setting(containerEl).setName(keyToLabel(key));
			if (desc) setting.setDesc(htmlToFragment(desc));

			const setStringValue = async (value: string) => {
				if (onBeforeChange) onBeforeChange();
				this.plugin.settings[key] = value;
				await this.plugin.saveSettings();
				if (onChange) onChange();
			};

			if (type === "toggle") {
				const current = this.plugin.settings[key];
				const initial =
					typeof current === "boolean"
						? current
						: typeof defaultValue === "boolean"
							? defaultValue
							: false;
				setting.addToggle((toggle) => {
					toggle.setValue(initial).onChange(async (value) => {
						if (onBeforeChange) onBeforeChange();
						this.plugin.settings[key] = value;
						await this.plugin.saveSettings();
						if (onChange) onChange();
					});
				});
			} else {
				const current = this.plugin.settings[key];
				const fallback =
					typeof defaultValue === "string" ? defaultValue : "";
				const initial = typeof current === "string" ? current : fallback;
				setting.addText((text) => {
					if (type === "hotkey") text.setPlaceholder("e.g. CmdOrCtrl+Shift+O");
					else if (type === "image")
						text.setPlaceholder("Data URL or file path");
					else if (type === "moment") text.setPlaceholder(DEFAULT_DATE_FORMAT);
					else if (placeholder) text.setPlaceholder(placeholder);

					text.setValue(initial).onChange((value) => {
						void setStringValue(value);
					});
				});
			}

			if (postprocessor) {
				const previewEl = setting.settingEl.querySelector("[data-preview]");
				if (previewEl) {
					const updatePreview = () => {
						const value = this.plugin.settings[key];
						const stringValue =
							typeof value === "string"
								? value
								: typeof defaultValue === "string"
									? defaultValue
									: "";
						if (type === "image") {
							const imgEl = previewEl as HTMLImageElement;
							imgEl.src = stringValue || OBSIDIAN_BASE64_ICON;
						} else {
							previewEl.textContent = postprocessor(stringValue);
						}
					};
					updatePreview();
					setting.settingEl.addEventListener("input", updatePreview);
				}
			}
		}
	}

	getSettingsOptions(): SettingEntry[] {
		const platformText = getPlatformText();

		return [
			"Window management",
			{
				key: "launchOnStartup",
				desc: "Open Obsidian automatically whenever you log into your computer.",
				type: "toggle",
				default: false,
				onChange: () => this.plugin.setLaunchOnStartup(),
			},
			{
				key: "hideOnLaunch",
				desc: `
          Minimises Obsidian automatically whenever the app is launched. If the
          "Run in background" option is enabled, windows will be hidden to the ${platformText.systemArea}
          instead of minimised to the ${platformText.taskbarDock}.
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
				onChange: () => {
					this.plugin.setLaunchOnStartup();
					if (this.plugin.settings.runInBackground) {
						this.plugin.interceptWindowClose();
					} else {
						this.plugin.allowWindowClose();
					}
				},
			},
			{
				key: "hideTaskbarIcon",
				desc: `
          Hides the window's icon from the ${platformText.taskbarDockCapitalized.toLowerCase()}. Enabling the ${
						platformText.iconType
					} first
          is recommended if using this option. This may not work on Linux-based OSes.
        `,
				type: "toggle",
				default: false,
				onChange: () => {
					if (this.plugin.settings.hideTaskbarIcon) {
						this.plugin.hideTaskbarIcons();
					} else {
						this.plugin.showTaskbarIcons();
					}
				},
			},
			{
				key: "createTrayIcon",
				desc: `
          Adds an icon to your ${platformText.systemArea} to bring hidden Obsidian windows
          back into focus on click or force a full quit/relaunch of the app through
          the right-click menu.
        `,
				type: "toggle",
				default: true,
				onChange: () => this.plugin.createTrayIcon(),
			},
			{
				key: "trayIconImage",
				desc: `
          Set the image used by the ${platformText.iconType}. Recommended size: 16x16
          <br>Preview: <img data-preview style="height: 16px; vertical-align: bottom;">
        `,
				type: "image",
				default: OBSIDIAN_BASE64_ICON,
				onChange: () => this.plugin.createTrayIcon(),
			},
			{
				key: "trayIconTooltip",
				desc: `
          Set a title to identify the ${platformText.iconType} by. The
          <code>{{vault}}</code> placeholder will be replaced by the vault name.
          <br>Preview: <b class="u-pop" data-preview></b>
        `,
				type: "text",
				default: "{{vault}} | Obsidian",
				postprocessor: (value) => replaceVaultName(value, this.plugin.app),
				onChange: () => this.plugin.createTrayIcon(),
			},
			{
				key: "toggleWindowFocusHotkey",
				desc: ACCELERATOR_FORMAT,
				type: "hotkey",
				default: "CmdOrCtrl+Shift+Tab",
				onBeforeChange: () => this.plugin.unregisterHotkeys(),
				onChange: () => this.plugin.registerHotkeys(),
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
				postprocessor: (value) =>
					(moment as unknown as (input?: string) => { format: (p: string) => string })(
						undefined,
					).format(value || DEFAULT_DATE_FORMAT),
			},
			{
				key: "quickNoteHotkey",
				desc: ACCELERATOR_FORMAT,
				type: "hotkey",
				default: "CmdOrCtrl+Shift+Q",
				onBeforeChange: () => this.plugin.unregisterHotkeys(),
				onChange: () => this.plugin.registerHotkeys(),
			},
		];
	}
}
