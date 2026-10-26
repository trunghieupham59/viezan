// viezan-helper-ctl — registers the fan helper daemon through SMAppService (macOS 13+).
//
// Path B of docs/plans/fan-helper-daemon.md. SMAppService looks the job up in the calling
// app's `Contents/Library/LaunchDaemons`, so this tool lives in `Contents/MacOS` where its
// main bundle is Viezan.app; Electron runs it and reads one JSON line from stdout. It only
// works in an app signed with a Developer ID (the daemon must carry the app's Team ID),
// which is why the app keeps it behind a switch until the release is signed.
//
//   viezan-helper-ctl status | register | unregister | open-settings
//
// Output: `{"ok":true,"status":"enabled"}`; on failure `{"ok":false,"status":…,"error":"…","code":n}`
// and exit 1. `status` is one of not-registered, enabled, requires-approval, not-found.
import Foundation
import ServiceManagement

let plistName = "com.viezan.fan-helper.plist"
let service = SMAppService.daemon(plistName: plistName)

func statusName(_ status: SMAppService.Status) -> String {
  switch status {
  case .notRegistered: return "not-registered"
  case .enabled: return "enabled"
  case .requiresApproval: return "requires-approval"
  case .notFound: return "not-found"
  @unknown default: return "unknown"
  }
}

func emit(_ row: [String: Any], exitCode: Int32 = 0) -> Never {
  var data = (try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])) ?? Data("{}".utf8)
  data.append(0x0A)
  FileHandle.standardOutput.write(data)
  exit(exitCode)
}

func failure(_ error: Error) -> Never {
  let nsError = error as NSError
  // A daemon waiting for the user's approval is a state, not a failure: report it as such.
  if service.status == .requiresApproval { emit(["ok": true, "status": statusName(service.status)]) }
  emit(["ok": false, "status": statusName(service.status), "error": nsError.localizedDescription, "code": nsError.code], exitCode: 1)
}

switch CommandLine.arguments.dropFirst().first {
case "status":
  // The bundle and plist SMAppService resolves against, for diagnosing a `not-found`.
  let plistPath = Bundle.main.bundleURL.appendingPathComponent("Contents/Library/LaunchDaemons/\(plistName)").path
  emit(["ok": true, "status": statusName(service.status), "bundle": Bundle.main.bundlePath, "plistPresent": FileManager.default.fileExists(atPath: plistPath)])
case "register":
  do { try service.register() } catch { failure(error) }
  emit(["ok": true, "status": statusName(service.status)])
case "unregister":
  do { try service.unregister() } catch { failure(error) }
  emit(["ok": true, "status": statusName(service.status)])
case "open-settings":
  SMAppService.openSystemSettingsLoginItems()
  emit(["ok": true, "status": statusName(service.status)])
default:
  FileHandle.standardError.write("usage: viezan-helper-ctl status | register | unregister | open-settings\n".data(using: .utf8)!)
  exit(64)
}
