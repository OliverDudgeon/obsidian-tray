// A separate native app avoids sharing Electron's application identity.
import AppKit
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 150, y: 150, width: 900, height: 650), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
window.title = "Unrelated application fixture"
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
print("READY")
fflush(stdout)
DispatchQueue.global().async {
    _ = FileHandle.standardInput.readDataToEndOfFile()
    exit(0)
}
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { exit(1) }
app.run()
