import AppKit
import CoreGraphics

// Launch the exact installed bundle via Launch Services. A different copy of
// Viezan may activate itself and make a process-name check falsely pass.
let appURL = URL(fileURLWithPath: CommandLine.arguments[1]).resolvingSymlinksInPath()
let profile = CommandLine.arguments[2]
func fail(_ reason: String) -> Never {
    FileHandle.standardError.write(Data((reason + "\n").utf8))
    exit(1)
}
guard let bundle = Bundle(url: appURL), let identifier = bundle.bundleIdentifier,
      let executable = bundle.executableURL else { fail("Invalid installed app bundle") }
if let peer = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first {
    fail("Another Viezan instance is running, PID \(peer.processIdentifier)")
}
let options = NSWorkspace.OpenConfiguration()
options.createsNewApplicationInstance = true
options.environment = ["CFFIXED_USER_HOME": profile]
let app: NSRunningApplication = try await withCheckedThrowingContinuation { continuation in
    NSWorkspace.shared.openApplication(at: appURL, configuration: options) { opened, error in
        if let opened { continuation.resume(returning: opened) }
        else { continuation.resume(throwing: error ?? CocoaError(.executableNotLoadable)) }
    }
}
guard app.executableURL?.resolvingSymlinksInPath().path == executable.resolvingSymlinksInPath().path else {
    fail("Launch Services opened a different executable")
}
func hasWindow() -> Bool {
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
    return (windows as? [[String: Any]] ?? []).contains { window in
        guard window[kCGWindowOwnerPID as String] as? Int32 == app.processIdentifier,
              window[kCGWindowLayer as String] as? Int == 0,
              let bounds = window[kCGWindowBounds as String] as? [String: Double] else { return false }
        return (bounds["Width"] ?? 0) >= 320 && (bounds["Height"] ?? 0) >= 200
    }
}
for _ in 0..<120 where !app.isTerminated && !(app.isFinishedLaunching && hasWindow()) {
    try await Task.sleep(for: .milliseconds(250))
}
let opened = hasWindow() && app.isFinishedLaunching && !app.isTerminated
if !app.isTerminated {
    app.terminate()
    for _ in 0..<60 where !app.isTerminated { try await Task.sleep(for: .milliseconds(250)) }
}
guard opened, app.isTerminated else {
    if !app.isTerminated { app.forceTerminate() }
    throw NSError(domain: "Viezan.InstallTest", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Expected a visible workbench window and a clean quit from the installed app",
    ])
}
print("Opened and closed installed Viezan, PID \(app.processIdentifier), \(executable.path)")
