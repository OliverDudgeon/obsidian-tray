/**
 * Platform-specific utilities
 */

interface PlatformText {
  systemArea: string;
  systemAreaCapitalized: string;
  iconType: string;
  iconTypeCapitalized: string;
  taskbarDock: string;
  taskbarDockCapitalized: string;
}

// Platform-specific terminology
export const getPlatformText = (): PlatformText => {
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
