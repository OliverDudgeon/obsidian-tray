// Read only the owning process IDs of the fixture windows, front to back.
// No window titles, images, or other applications' metadata are returned.
import CoreGraphics
import Foundation
let owners = Set(CommandLine.arguments.dropFirst().compactMap(Int.init))
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let order = windows.compactMap { info -> Int? in
    guard let pid = info[kCGWindowOwnerPID as String] as? Int,
          owners.contains(pid),
          (info[kCGWindowLayer as String] as? Int) == 0 else { return nil }
    return pid
}
print(String(data: try JSONSerialization.data(withJSONObject: order), encoding: .utf8)!)
