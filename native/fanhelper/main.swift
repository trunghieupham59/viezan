// viezan-fan-helper — the privileged half of Viezan's fan control on macOS.
//
// Writing fan targets to the SMC needs root. The binary runs in one of two ways:
//
// * Daemon (`--daemon`, release builds): installed once as the launchd job
//   `com.viezan.fan-helper` (docs/plans/fan-helper-daemon.md) and kept running by
//   launchd, so the app connects without asking for a password again. Any client of
//   the user at the console may connect; a console-user switch drops the client.
// * Session (`--socket … --uid …`, development builds and the fallback): launched with
//   administrator rights for one session through the system password dialog, serves
//   only that uid, and exits a while after its client leaves.
//
// A helper signed with a Team ID (the Developer ID release, path B) also checks that its
// client is the Viezan app signed by the same team; an ad-hoc build cannot tell code apart and skips it.
//
// Either way it serves exactly one client over a Unix socket, understands a fixed set
// of commands (docs/plans/module-platform-and-privileged-helper.md §4.3), clamps every
// target to the hardware range, and returns every fan to automatic control on its own
// whenever it starts, the client goes quiet or disconnects, the machine sleeps or
// wakes, a temperature crosses the ceiling, or the process is told to stop.
//
//   viezan-fan-helper --daemon [--watchdog 15] [--ceiling 105]
//   viezan-fan-helper --socket /var/run/viezan-fan-helper-501.sock --uid 501
//                     [--watchdog 15] [--idle-exit 60] [--ceiling 105]
//
// Protocol: one JSON object per line. Request `{"id":1,"op":"fans.setTarget","args":{...}}`,
// reply `{"id":1,"ok":true,"result":...}` or `{"id":1,"ok":false,"error":{"code":"...","message":"..."}}`.
import CryptoKit
import Darwin
import Foundation
import IOKit
import IOKit.pwr_mgt
import Security
import SystemConfiguration

let helperVersion = "1.1.0"
let protocolVersion = 1
// IOKit power messages (`iokit_common_msg(n)` = 0xE0000000 | n); the macros do not import into Swift.
let messageCanSystemSleep: UInt32 = 0xE000_0270
let messageSystemWillSleep: UInt32 = 0xE000_0280
let messageSystemHasPoweredOn: UInt32 = 0xE000_0300
let socketPathPrefix = "/var/run/viezan-fan-helper"
let daemonSocketPath = "/var/run/viezan-fan-helper.sock"
let logPath = "/var/log/viezan-fan-helper.log"

// MARK: - Identity

/// SHA-256 of this executable as it was when the process started. Under SMAppService the binary
/// lives in the app bundle; after an app update the app compares this with the new file and asks
/// the old process to exit (`helper.exit`) so launchd starts the new one.
let executableSha256: String? = {
  guard let url = Bundle.main.executableURL, let data = try? Data(contentsOf: url) else { return nil }
  return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}()

/// The Team ID this helper is signed with; nil for an ad-hoc build.
let ownTeamId: String? = {
  var code: SecCode?
  guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return nil }
  var staticCode: SecStaticCode?
  guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else { return nil }
  var info: CFDictionary?
  guard SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
        let row = info as? [String: Any] else { return nil }
  return row[kSecCodeInfoTeamIdentifier as String] as? String
}()

/// The only program that may drive the fans: the Viezan app (`scripts/native/build.py` signs it with this identifier).
let clientIdentifier = "com.viezan.native.preview"

/// What a client must satisfy when this helper is team-signed: the Viezan app, signed by the same team.
let clientRequirement: SecRequirement? = {
  guard let team = ownTeamId else { return nil }
  var requirement: SecRequirement?
  let text = "anchor apple generic and certificate leaf[subject.OU] = \"\(team)\" and identifier \"\(clientIdentifier)\"" as CFString
  return SecRequirementCreateWithString(text, [], &requirement) == errSecSuccess ? requirement : nil
}()

/// True when the peer's code signature passes `clientRequirement` (always true for an ad-hoc helper).
func peerIsTrustedCode(_ fd: Int32) -> Bool {
  guard ownTeamId != nil else { return true }
  guard let requirement = clientRequirement else { return false }
  var token = audit_token_t()
  var length = socklen_t(MemoryLayout<audit_token_t>.size)
  guard getsockopt(fd, SOL_LOCAL, LOCAL_PEERTOKEN, &token, &length) == 0 else { return false }
  let tokenData = withUnsafeBytes(of: &token) { Data($0) }
  var code: SecCode?
  guard SecCodeCopyGuestWithAttributes(nil, [kSecGuestAttributeAudit: tokenData] as CFDictionary, [], &code) == errSecSuccess,
        let code else { return false }
  return SecCodeCheckValidity(code, [], requirement) == errSecSuccess
}

// MARK: - Arguments

func parseOptions(_ arguments: [String]) -> Options? {
  var options = Options()
  var index = 1
  func value() -> String? {
    index += 1
    return index < arguments.count ? arguments[index] : nil
  }
  while index < arguments.count {
    switch arguments[index] {
    case "--daemon": options.daemon = true
    case "--socket": guard let v = value() else { return nil }; options.socketPath = v
    case "--uid": guard let v = value(), let n = UInt32(v) else { return nil }; options.uid = n
    case "--watchdog": guard let v = value(), let n = Double(v), n >= 3 else { return nil }; options.watchdogSeconds = n
    case "--idle-exit": guard let v = value(), let n = Double(v), n >= 5 else { return nil }; options.idleExitSeconds = n
    case "--ceiling": guard let v = value(), let n = Double(v), n >= 60, n <= 120 else { return nil }; options.ceilingCelsius = n
    default: return nil
    }
    index += 1
  }
  if options.daemon {
    // The daemon's socket and peers are fixed; a session's arguments make no sense here.
    guard options.socketPath.isEmpty, options.uid == 0 else { return nil }
    options.socketPath = daemonSocketPath
    return options
  }
  guard options.socketPath.hasPrefix(socketPathPrefix), options.socketPath != daemonSocketPath,
        !options.socketPath.contains(".."), options.uid != 0 else { return nil }
  return options
}

// MARK: - Socket server

func makeServerSocket(path: String, owner: uid_t, mode: mode_t) throws -> Int32 {
  let fd = socket(AF_UNIX, SOCK_STREAM, 0)
  guard fd >= 0 else { throw HelperError(code: "socket", message: "socket() failed: \(errno)") }
  unlink(path)
  var address = sockaddr_un()
  address.sun_family = sa_family_t(AF_UNIX)
  let bytes = Array(path.utf8)
  let capacity = MemoryLayout.size(ofValue: address.sun_path)
  guard bytes.count < capacity else { throw HelperError(code: "socket", message: "Socket path too long.") }
  withUnsafeMutableBytes(of: &address.sun_path) { raw in
    for (offset, byte) in bytes.enumerated() { raw[offset] = byte }
    raw[bytes.count] = 0
  }
  address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
  let length = socklen_t(MemoryLayout<sockaddr_un>.size)
  let bound = withUnsafePointer(to: &address) { pointer in
    pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, length) }
  }
  guard bound == 0 else { throw HelperError(code: "socket", message: "bind() failed: \(errno)") }
  // Session: the socket file is the launching user's and private. Daemon: root's and open
  // to all; `isAllowedPeer` decides who may stay connected.
  guard chown(path, owner, gid_t(bitPattern: -1)) == 0, chmod(path, mode) == 0 else {
    throw HelperError(code: "socket", message: "chown/chmod failed: \(errno)")
  }
  guard listen(fd, 2) == 0 else { throw HelperError(code: "socket", message: "listen() failed: \(errno)") }
  return fd
}

func peerUid(_ fd: Int32) -> uid_t? {
  var uid: uid_t = 0
  var gid: gid_t = 0
  return getpeereid(fd, &uid, &gid) == 0 ? uid : nil
}

/// The uid of the user at the console, or nil at the login window.
func consoleUid() -> uid_t? {
  var uid: uid_t = 0
  guard let name = SCDynamicStoreCopyConsoleUser(nil, &uid, nil) as String?, name != "loginwindow", uid != 0 else { return nil }
  return uid
}

func isAllowedPeer(_ uid: uid_t, options: Options) -> Bool {
  if uid == 0 { return true }
  return options.daemon ? uid == consoleUid() : uid == options.uid
}

func writeAll(_ fd: Int32, _ data: Data) -> Bool {
  var offset = 0
  return data.withUnsafeBytes { raw -> Bool in
    guard let base = raw.baseAddress else { return true }
    while offset < raw.count {
      let written = Darwin.write(fd, base + offset, raw.count - offset)
      if written <= 0 { return false }
      offset += written
    }
    return true
  }
}

/// A client that sends nothing for this long is dropped. The app's heartbeat comes every 5 s, so
/// only a stuck or hostile peer reaches it, and it must not hold the one client slot forever.
let clientIdleSeconds = 30

/// Serve one client until it disconnects or goes quiet. Lines longer than 64 KiB end the session.
func serve(client: Int32, controller: FanController, options: Options, environment: CommandEnvironment) {
  var buffer = Data()
  var chunk = [UInt8](repeating: 0, count: 4096)
  while true {
    let count = Darwin.read(client, &chunk, chunk.count)
    if count <= 0 { break }
    buffer.append(contentsOf: chunk[0..<count])
    if buffer.count > 65536 {
      environment.writeLog("client sent an oversized line; closing")
      break
    }
    while let newline = buffer.firstIndex(of: 0x0A) {
      let line = buffer.subdata(in: buffer.startIndex..<newline)
      buffer.removeSubrange(buffer.startIndex...newline)
      if line.isEmpty { continue }
      guard let response = handle(line, from: client, controller: controller, options: options, environment: environment),
            writeAll(client, response) else { return }
    }
  }
}

// MARK: - Main

guard let options = parseOptions(CommandLine.arguments) else {
  FileHandle.standardError.write("usage: viezan-fan-helper --daemon [--watchdog s] [--ceiling c]\n       viezan-fan-helper --socket \(socketPathPrefix)-<uid>.sock --uid <uid> [--watchdog s] [--idle-exit s] [--ceiling c]\n".data(using: .utf8)!)
  exit(64)
}
guard geteuid() == 0 else {
  FileHandle.standardError.write("viezan-fan-helper must run as root\n".data(using: .utf8)!)
  exit(77)
}

let log = Log(path: logPath)
signal(SIGPIPE, SIG_IGN)

let controller: FanController
do {
  controller = try FanController(smc: SMC(), log: log, ceilingCelsius: options.ceilingCelsius)
} catch {
  log.write("startup failed: \(error)")
  exit(1)
}
// A previous run may have crashed with a fan overridden; start from automatic control.
_ = controller.queue.sync { controller.restoreAll(reason: "start") }

let serverFd: Int32
do {
  serverFd = options.daemon
    ? try makeServerSocket(path: options.socketPath, owner: 0, mode: 0o666)
    : try makeServerSocket(path: options.socketPath, owner: options.uid, mode: 0o600)
} catch {
  log.write("socket failed: \(error)")
  exit(1)
}
log.write(options.daemon
  ? "daemon \(helperVersion) listening on \(options.socketPath) for the console user; watchdog \(Int(options.watchdogSeconds)) s, ceiling \(Int(options.ceilingCelsius)) °C"
  : "listening on \(options.socketPath) for uid \(options.uid); watchdog \(Int(options.watchdogSeconds)) s, idle exit \(Int(options.idleExitSeconds)) s, ceiling \(Int(options.ceilingCelsius)) °C")

func finishShutdown(_ reason: String, code: Int32) -> Never {
  unlink(options.socketPath)
  log.write("exit (\(reason))")
  exit(code)
}

func shutdown(_ reason: String, code: Int32) -> Never {
  // Leave from inside the queue, so no client command can set a fan manual after the restore.
  controller.queue.sync {
    controller.restoreBeforeExit(reason: reason)
    finishShutdown(reason, code: code)
  }
}

let commandEnvironment = CommandEnvironment(
  protocolVersion: protocolVersion, helperVersion: helperVersion,
  teamSigned: ownTeamId != nil, executableSha256: executableSha256,
  isAllowedPeer: isAllowedPeer, writeLog: log.write,
  shutdownSocket: { Darwin.shutdown($0, SHUT_RDWR) },
  requestExit: { shutdown("client-exit", code: 0) }
)

// Stop signals: restore, then leave.
for sig in [SIGTERM, SIGINT, SIGHUP] {
  signal(sig, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { shutdown("signal \(sig)", code: 0) }
  source.resume()
  // Keep the source alive for the process lifetime.
  _ = Unmanaged.passRetained(source)
}

// Every second: the daemon drops a client whose user left the console (fast user
// switching, logout); then watchdog and temperature ceiling while any fan is overridden.
var idleExitAfterRestore = false // Accessed on controller.queue.
let watchdog = DispatchSource.makeTimerSource(queue: controller.queue)
watchdog.schedule(deadline: .now() + 1, repeating: 1)
watchdog.setEventHandler {
  if options.daemon, let client = controller.client, !isAllowedPeer(client.uid, options: options) {
    log.write("uid \(client.uid) is no longer the console user; dropping the client")
    controller.disconnect(client.fd, reason: "console-user")
    Darwin.shutdown(client.fd, SHUT_RDWR)
    return
  }
  controller.tick(now: monotonicSeconds(), watchdogSeconds: options.watchdogSeconds)
  if idleExitAfterRestore, controller.pendingRestore.isEmpty { finishShutdown("idle", code: 0) }
}
watchdog.resume()

// Sleep / wake: fans go back to auto on the way down and again on the way up, so a
// stale override never survives a power transition.
var powerNotifier: io_object_t = 0
var powerNotifyPort: IONotificationPortRef?
var powerRootPort: io_connect_t = 0
powerRootPort = IORegisterForSystemPower(nil, &powerNotifyPort, { _, _, messageType, messageArgument in
  switch messageType {
  case messageSystemWillSleep, messageCanSystemSleep:
    _ = controller.queue.sync { controller.restoreAll(reason: messageType == messageSystemWillSleep ? "sleep" : "can-sleep") }
    IOAllowPowerChange(powerRootPort, Int(bitPattern: messageArgument))
  case messageSystemHasPoweredOn:
    _ = controller.queue.sync { controller.restoreAll(reason: "wake") }
  default:
    break
  }
}, &powerNotifier)
if let powerNotifyPort {
  CFRunLoopAddSource(CFRunLoopGetMain(), IONotificationPortGetRunLoopSource(powerNotifyPort).takeUnretainedValue(), .defaultMode)
} else {
  log.write("warning: could not register for power notifications")
}

// One client at a time; a disconnect restores the fans. A session helper then starts its
// idle-exit clock; the daemon stays for the next client (launchd keeps it alive anyway).
var idleExit: DispatchWorkItem?
DispatchQueue.global(qos: .userInitiated).async {
  while true {
    let client = accept(serverFd, nil, nil)
    if client < 0 {
      if errno == EINTR { continue }
      log.write("accept failed: \(errno)")
      shutdown("accept-failed", code: 1)
    }
    guard let uid = peerUid(client), isAllowedPeer(uid, options: options), uid == 0 || peerIsTrustedCode(client) else {
      log.write("rejected client with uid \(peerUid(client).map(String.init) ?? "?")")
      close(client)
      continue
    }
    var timeout = timeval(tv_sec: clientIdleSeconds, tv_usec: 0)
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    idleExit?.cancel()
    idleExit = nil
    log.write("client connected (uid \(uid))")
    controller.queue.sync {
      idleExitAfterRestore = false
      controller.client = (client, uid)
    }
    serve(client: client, controller: controller, options: options, environment: commandEnvironment)
    controller.queue.sync { controller.disconnect(client, reason: "disconnect") }
    close(client)
    if options.daemon {
      log.write("client disconnected")
      continue
    }
    log.write("client disconnected; exiting in \(Int(options.idleExitSeconds)) s unless a client returns")
    let work = DispatchWorkItem {
      if controller.restoreAll(reason: "idle") { finishShutdown("idle", code: 0) }
      idleExitAfterRestore = true
    }
    idleExit = work
    controller.queue.asyncAfter(deadline: .now() + options.idleExitSeconds, execute: work)
  }
}

CFRunLoopRun()
