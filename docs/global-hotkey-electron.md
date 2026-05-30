# Implementing a Global Hotkey Feature in Electron

A summary of the Electron API calls that make up the global hotkey feature in
this plugin, written so it can be applied to another Electron project.

## Where the code runs

This plugin lives in Obsidian's **renderer** process, so it reaches
main-process APIs through the legacy `@electron/remote` shim:

```js
const { remote } = require("electron");
const { globalShortcut, getCurrentWindow, BrowserWindow, app } = remote;
```

In a normal Electron app you'd call these **directly in the main process** (no
`remote`). `globalShortcut`, `app`, and `BrowserWindow` are main-process
modules; if you're in a renderer you either use `@electron/remote` or
(preferred today) proxy through IPC to the main process.

## The core API: `globalShortcut`

The whole feature rests on three methods of
[`globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut):

| Call | Purpose |
|------|---------|
| `globalShortcut.register(accelerator, callback)` | Bind an OS-wide hotkey to a callback. Returns `false` if the OS rejected it (e.g. another app owns it). |
| `globalShortcut.unregister(accelerator)` | Release one binding. |
| `globalShortcut.unregisterAll()` | Release everything this app registered (use on quit / before re-registering). |

The `accelerator` is an
[Electron Accelerator string](https://www.electronjs.org/docs/latest/api/accelerator),
e.g. `"CmdOrCtrl+Shift+A"`. `CmdOrCtrl` maps to ⌘ on macOS and Ctrl elsewhere.

### Registration

```js
if (toggleWindowFocusHotkey)
  globalShortcut.register(toggleWindowFocusHotkey, onToggleWindows);
if (quickNoteHotkey)
  globalShortcut.register(quickNoteHotkey, onQuickNote);
```

### Unregistration

```js
globalShortcut.unregister(toggleWindowFocusHotkey);
globalShortcut.unregister(quickNoteHotkey);
globalShortcut.unregisterAll(); // fallback safety net
```

## Lifecycle rules

These matter more than the API surface:

1. **Register after the app is ready.** In a real Electron main process, call
   `globalShortcut.register` inside `app.whenReady()` — registering earlier
   silently fails.
2. **Always unregister on quit.** Hook
   `app.on("will-quit", () => globalShortcut.unregisterAll())`. Global shortcuts
   are an OS-level resource; failing to release them can leave them claimed.
3. **Re-register on settings change, not in place.** When the user edits a
   hotkey, unregister *before* the change and register *after*. You can't mutate
   a binding — you tear down and rebuild.
4. **Wrap in try/catch.** `register` can throw or return `false` if the
   accelerator is malformed or already taken by another app; handle that
   gracefully rather than assuming success.

## What the callbacks do (the "summon window" part)

The hotkey itself is trivial; the valuable, non-obvious part is what
`onToggleWindows` does — bringing a hidden/background window back to the user.
The relevant `BrowserWindow` methods:

`win.isVisible()`, `win.isFocused()`, `win.isMinimized()`, `win.isDestroyed()`,
`win.show()`, `win.hide()`, `win.minimize()`, `win.restore()`,
`win.maximize()`, `win.focus()`, `win.moveTop()`, `win.getBounds()`,
`win.setPosition(x, y)`, and crucially on macOS
`win.setVisibleOnAllWorkspaces(bool)`.

### The macOS Spaces gotcha

A plain `win.show()` does **not** pull a window to the user's current
Space/virtual desktop — macOS instead switches the user *to the window*. To
summon the window to the active Space:

```js
win.setVisibleOnAllWorkspaces(true);   // forces it onto the current Space
win.show();
setTimeout(() => {
  if (win.isDestroyed()) return;
  win.setVisibleOnAllWorkspaces(false);
  win.setPosition(bounds.x + 1, bounds.y + 1); // 1px nudge...
  win.setPosition(bounds.x, bounds.y);          // ...and back, forces AppKit to recompute Space membership
  win.focus();
  win.moveTop();
}, 30);
```

The `setVisibleOnAllWorkspaces(true)` -> `show()` -> `false` toggle plus the 1px
position nudge (after a short timeout) is the trick that makes AppKit
re-evaluate which Space the window belongs to. Without it, the global hotkey
appears to "work" but yanks the user away from their current desktop.

On Windows/Linux the same callback just needs `restore()` (if minimized) then
`show()`/`focus()`.

## Minimal recipe for another project

```js
const { app, globalShortcut, BrowserWindow } = require("electron");

app.whenReady().then(() => {
  globalShortcut.register("CmdOrCtrl+Shift+A", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isVisible() && win.isFocused()) {
      win.hide();              // toggle off
    } else {
      // (apply the macOS Spaces dance above for darwin)
      win.show();
      win.focus();
    }
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
```

That's the entire feature: `register`/`unregister`/`unregisterAll` for the
hotkey, the ready/quit lifecycle, and `BrowserWindow` show/focus methods (with
the `setVisibleOnAllWorkspaces` nudge) for the summon behaviour.
