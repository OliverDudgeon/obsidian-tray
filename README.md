<img alt="" src="tray.png" align="right" height="128px">

**Tray** is an [Obsidian](https://obsidian.md/) plugin that launches Obsidian on
system startup, keeps it running in the background, and adds global hotkeys plus
a system tray / menu bar menu to toggle window visibility and create quick notes
from anywhere in your operating system.

## Features

- **Cross-platform** with platform-aware behaviour — uses the system tray and
  taskbar on Windows/Linux and the menu bar and dock on macOS
- **Run in background** — closing the window hides Obsidian instead of quitting
  it, so it stays warm in the tray/menu bar.
- **Launch on startup** — optionally start Obsidian (hidden, if you prefer) when
  you log into your computer.
- **Global hotkeys** registered at the OS level for toggling window focus and
  creating quick notes. These work even when Obsidian doesn't have keyboard
  focus.
- **System tray / menu bar icon** with a context menu for quick note creation,
  show/hide, relaunch, and clean vault close. Clicking the icon toggles window
  visibility (Windows/Linux) or shows hidden windows (macOS — single-click
  toggle is disabled by design to avoid conflicting with the system menu bar).
- **Quick notes** can be created from anywhere via a global hotkey or the tray
  menu, written to a configurable folder with a configurable date-based
  filename. Notes are always created relative to the vault root regardless of
  Obsidian's "new file location" setting.
- **Hide taskbar / dock icon** to keep Obsidian fully out of the way while it
  runs in the background.
- **Maximised window state preserved** across hide/show cycles, including after
  alt-tab focus changes.
- **Clean shutdown handling** on macOS — the plugin intercepts window close to
  keep Obsidian alive in the background but releases the intercept during
  system shutdown / log-out / restart so the OS can quit the app cleanly.
- **Dock restoration on quit** — if you've hidden the dock icon, the plugin
  re-shows it when the vault closes so other open vaults stay accessible.
- **Programmatic API** — other plugins can call `getCurrentWindow`,
  `getWindows`, `showWindows`, `hideWindows`, and `toggleWindows` on the Tray
  plugin instance to coordinate window behaviour.
- **Desktop-only** — uses Electron APIs, so the plugin does not run on mobile.

## Configuration

### Window management

| Option                     | Description                                                                                                                                                                                               | Default                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Launch on startup          | Open Obsidian automatically whenever you log into your computer.                                                                                                                                          | Disabled                       |
| Hide on launch             | Minimises Obsidian automatically whenever the app is launched. If the "Run in background" option is enabled, windows will be hidden to the system tray/menu bar instead of minimised to the taskbar/dock. | Disabled                       |
| Run in background          | Hide the app and continue to run it in the background instead of quitting it when pressing the window close button or toggle focus hotkey.                                                                | Disabled                       |
| Hide taskbar/dock icon     | Hides the window's icon from the dock/taskbar. This may not work on Linux-based OSes.                                                                                                                     | Disabled                       |
| Create tray/menu bar icon  | Add an icon to your system tray/menu bar to bring hidden Obsidian windows back into focus on click or force a full quit/relaunch of the app through the right-click menu.                                 | Enabled                        |
| Tray/menu bar icon image   | Set the image used by the tray/menu bar icon. Recommended size: 16x16                                                                                                                                     | ![](obsidian.png)              |
| Tray/menu bar icon tooltip | Set a title to identify the icon by. The `{{vault}}` placeholder will be replaced by the vault name.                                                                                                      | `{{vault}} \| Obsidian`        |
| Toggle window focus hotkey | Registered globally and detected even if Obsidian does not have keyboard focus. Format: [Electron accelerator](https://www.electronjs.org/docs/latest/api/accelerator)                                    | <kbd>CmdOrCtrl+Shift+Tab</kbd> |

The `Relaunch Obsidian` and `Close Vault` actions can be triggered from the
tray/menu bar context menu or with the in-app command palette (search for
"Tray: Relaunch Obsidian" or "Tray: Close Vault"). Hotkeys can be assigned to
the commands via Obsidian's built-in hotkey manager.

### Quick notes

| Option                 | Description                                                                                                                                                            | Default                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Quick note location    | New quick notes will be placed in this folder (relative to the vault root).                                                                                            |                              |
| Quick note date format | New quick notes will use a filename of this pattern. Format: [Moment.js format string](https://momentjs.com/docs/#/displaying/format/)                                 | `YYYY-MM-DD`                 |
| Quick note hotkey      | Registered globally and detected even if Obsidian does not have keyboard focus. Format: [Electron accelerator](https://www.electronjs.org/docs/latest/api/accelerator) | <kbd>CmdOrCtrl+Shift+Q</kbd> |

## Installation

### Obsidian Marketplace

The [original plugin](https://github.com/dragonwocky/obsidian-tray) is available on the community plugins list. This fork must be installed manually or via BRAT.

### Manual

1. Download this repository.
2. Run `pnpm install` to install dependencies.
3. Run `pnpm build` to build the plugin.
4. Copy `main.js`, `manifest.json`, and (if present) `styles.css` into your
   vault's `.obsidian/plugins/tray/` directory.
5. In Obsidian, navigate to **Settings** → **Community plugins**.
6. Press **Turn on community plugins** if you haven't already.
7. Find `Tray` in the list of **Installed plugins** and toggle it on.
8. Press the **⚙️** button beside the toggle to configure it.

## Development

Built with TypeScript, bundled with [esbuild](https://esbuild.github.io/), and
following the layout of the
[obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
template.

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/)

### Setup

```bash
git clone https://github.com/dragonwocky/obsidian-tray.git
cd obsidian-tray
pnpm install

pnpm dev        # watch mode
pnpm build      # typecheck + production bundle to main.js
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint
```

### Project structure

```
src/
├── core/                    # Electron-facing behaviour
│   ├── hotkey-manager.ts    # global shortcut registration
│   ├── system-shutdown.ts   # macOS before-quit / will-quit handling
│   ├── tray-manager.ts      # system tray / menu bar icon
│   └── window-manager.ts    # show/hide/toggle/intercept-close
├── ui/
│   └── settings-tab.ts      # plugin settings panel
├── utils/
│   ├── constants.ts         # action labels, default icon, help text
│   ├── logger.ts            # prefixed Electron logger wrapper
│   └── platform.ts          # macOS vs other platform terminology
└── main.ts                  # plugin entry / public API
```

## Disclaimer

This plugin is provided as-is and is designed for personal use. It has not
been tested on every platform and may not work as expected with all future updates.
If you notice something is not working as intended, please open a bug report or
pull request so it can be fixed.

The Obsidian logo is distributed with this plugin as the default image for the
system tray / menu bar icon, intended to be used within Obsidian. This logo
remains the property of the Obsidian project and is not under the same license
as the plugin's source code.
