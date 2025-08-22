/**
 * Platform-specific utilities
 */

// Platform-specific terminology
export const getPlatformText = () => {
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
