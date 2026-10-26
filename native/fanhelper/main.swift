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
// client is signed by the same team; an ad-hoc build cannot tell code apart and skips it.
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
/// The log is rotated to `<path>.1` past this size; a daemon would otherwise grow it forever.
let logMaxBytes: UInt64 = 1_000_000

// MARK: - Logging

final class Log {
  private let path: String
  private var handle: FileHandle?
  private let queue = DispatchQueue(label: "viezan.fanhelper.log")
  private let formatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  init(path: String) {
    self.path = path
    handle = Log.open(path)
  }

  private static func open(_ path: String) -> FileHandle? {
    if !FileManager.default.fileExists(atPath: path) {
      FileManager.default.createFile(atPath: path, contents: nil, attributes: [.posixPermissions: 0o644])
    }
    let handle = FileHandle(forWritingAtPath: path)
    handle?.seekToEndOfFile()
    return handle
  }

  /// Keep one previous file: `<path>.1` is replaced each time the log passes `logMaxBytes`.
  private func rotateIfNeeded() {
    guard let current = handle, let size = try? current.offset(), size > logMaxBytes else { return }
    try? current.close()
    let previous = path + ".1"
    try? FileManager.default.removeItem(atPath: previous)
    try? FileManager.default.moveItem(atPath: path, toPath: previous)
    handle = Log.open(path)
  }

  func write(_ message: String) {
    let line = "\(formatter.string(from: Date())) [\(getpid())] \(message)\n"
    queue.sync {
      rotateIfNeeded()
      guard let data = line.data(using: .utf8) else { return }
      // The throwing form: a full disk must cost a log line, not crash-loop the daemon.
      if let handle, (try? handle.write(contentsOf: data)) != nil { return }
      try? FileHandle.standardError.write(contentsOf: data)
    }
  }
}

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

/// What a client must satisfy when this helper is team-signed: code signed by the same team.
let clientRequirement: SecRequirement? = {
  guard let team = ownTeamId else { return nil }
  var requirement: SecRequirement?
  let text = "anchor apple generic and certificate leaf[subject.OU] = \"\(team)\"" as CFString
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

struct Options {
  var daemon = false
  var socketPath = ""
  var uid: uid_t = 0
  var watchdogSeconds = 15.0
  var idleExitSeconds = 60.0
  var ceilingCelsius = 105.0
}

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

// MARK: - Fan model

struct Fan {
  let index: Int
  let actual: SensorKey
  let min: SensorKey?
  let max: SensorKey?
  let target: SensorKey?
  /// Per-fan mode key (`F0Md`, Apple Silicon and recent Intel). Absent on older Intel Macs.
  let mode: SensorKey?

  var id: String { "fan\(index)" }
}

struct HelperError: Error {
  let code: String
  let message: String
}

/// Owns the SMC connection and the override state. Every method runs on `queue`.
final class FanController {
  let smc: SMC
  let log: Log
  let ceilingCelsius: Double
  let queue = DispatchQueue(label: "viezan.fanhelper.smc")
  private(set) var fans: [Fan] = []
  /// `FS! ` bitmask of forced fans, the mode key on Intel Macs without `F%dMd`.
  private let forceBits: SensorKey?
  private var temperatureKeys: [SensorKey] = []
  /// Fan index → target RPM for every fan currently under manual control.
  private(set) var overrides: [Int: Double] = [:]
  private(set) var lastCommandAt = Date()
  private(set) var lastError: String?
  private(set) var lastRestoreReason: String?
  /// Counts every restore, so a client can tell a new restore from an old one with the same reason.
  private(set) var restoreSeq = 0
  /// The connected client, set and cleared by the accept loop (on `queue`).
  var client: (fd: Int32, uid: uid_t)?
  let startedAt = Date()

  init(log: Log, ceilingCelsius: Double) throws {
    self.log = log
    self.ceilingCelsius = ceilingCelsius
    smc = try SMC()
    forceBits = lookupKey(smc, "FS! ", allowedTypes: ["ui16", "ui8 "])
    try discover()
  }

  private func discover() throws {
    var list: [Fan] = []
    if let countKey = lookupKey(smc, "FNum", allowedTypes: ["ui8 ", "ui16", "ui32"]), let count = readNumber(smc, countKey) {
      for index in 0..<Int(Swift.min(count, 16)) {
        guard let actual = lookupKey(smc, "F\(index)Ac", allowedTypes: fanTypes) else { continue }
        list.append(Fan(
          index: index,
          actual: actual,
          min: lookupKey(smc, "F\(index)Mn", allowedTypes: fanTypes),
          max: lookupKey(smc, "F\(index)Mx", allowedTypes: fanTypes),
          target: lookupKey(smc, "F\(index)Tg", allowedTypes: fanTypes),
          mode: lookupKey(smc, "F\(index)Md", allowedTypes: ["ui8 "])
        ))
      }
    }
    fans = list

    // Temperature keys for the ceiling rule: everything "T..." with a numeric type and a
    // plausible value, like the reader does. Enumerated once.
    var temps: [SensorKey] = []
    let count = try smc.keyCount()
    for index in 0..<count {
      guard let key = try? smc.key(at: index) else { continue }
      let name = fourCCString(key)
      guard name.hasPrefix("T"), name.count == 4, let info = try? smc.keyInfo(key) else { continue }
      let type = fourCCString(info.dataType)
      guard temperatureTypes.contains(type) else { continue }
      let sensor = SensorKey(key: key, name: name, type: type, info: info)
      guard let value = readNumber(smc, sensor), value > 0, value < 150 else { continue }
      temps.append(sensor)
    }
    temperatureKeys = temps
    log.write("ready: \(fans.count) fan(s), \(temps.count) temperature key(s), mode key \(fans.first?.mode != nil ? "F%dMd" : forceBits != nil ? "FS! " : "none")")
  }

  func touch() { lastCommandAt = Date() }

  func fan(withId id: String) throws -> Fan {
    guard let fan = fans.first(where: { $0.id == id }) else { throw HelperError(code: "unknown-fan", message: "No fan \(id).") }
    return fan
  }

  func range(of fan: Fan) -> (min: Double, max: Double) {
    let min = readNumber(smc, fan.min) ?? 0
    let max = readNumber(smc, fan.max) ?? 0
    return (min, max)
  }

  func listFans() -> [[String: Any]] {
    fans.map { fan in
      let (min, max) = range(of: fan)
      var row: [String: Any] = [
        "id": fan.id,
        "index": fan.index,
        "minRpm": min.rounded(),
        "maxRpm": max.rounded(),
        "currentRpm": (readNumber(smc, fan.actual) ?? 0).rounded(),
        "mode": overrides[fan.index] != nil ? "manual" : "auto",
      ]
      if let target = readNumber(smc, fan.target) { row["targetRpm"] = target.rounded() }
      return row
    }
  }

  private func write(_ key: SensorKey, _ value: Double) throws {
    guard let bytes = encodeNumber(type: key.type, value: value, size: Int(key.info.dataSize)) else {
      throw HelperError(code: "smc-error", message: "Cannot encode type \(key.type) for \(key.name).")
    }
    do {
      try smc.writeKey(key.key, info: key.info, bytes: bytes)
    } catch {
      lastError = "\(error)"
      throw HelperError(code: "smc-error", message: "\(error)")
    }
  }

  private func setManual(_ fan: Fan, _ manual: Bool) throws {
    if let mode = fan.mode {
      try write(mode, manual ? 1 : 0)
      return
    }
    if let forceBits {
      let current = UInt16(readNumber(smc, forceBits) ?? 0)
      let bit = UInt16(1) << UInt16(fan.index)
      try write(forceBits, Double(manual ? current | bit : current & ~bit))
      return
    }
    throw HelperError(code: "unsupported", message: "This Mac exposes no fan mode key; manual control is not possible.")
  }

  func setTarget(id: String, rpm: Double) throws -> [String: Any] {
    let fan = try fan(withId: id)
    let (min, max) = range(of: fan)
    guard max > min else { throw HelperError(code: "unsupported", message: "Fan \(id) reports no speed range.") }
    guard rpm.isFinite, rpm >= min, rpm <= max else {
      throw HelperError(code: "out-of-range", message: "Target \(Int(rpm)) RPM is outside \(Int(min))–\(Int(max)) RPM.")
    }
    guard let target = fan.target else { throw HelperError(code: "unsupported", message: "Fan \(id) has no target key.") }
    try setManual(fan, true)
    try write(target, rpm.rounded())
    overrides[fan.index] = rpm.rounded()
    touch()
    log.write("set \(fan.id) target=\(Int(rpm.rounded())) rpm")
    return ["id": fan.id, "targetRpm": rpm.rounded(), "mode": "manual"]
  }

  func setAuto(id: String) throws -> [String: Any] {
    let fan = try fan(withId: id)
    try setManual(fan, false)
    overrides[fan.index] = nil
    touch()
    log.write("auto \(fan.id)")
    return ["id": fan.id, "mode": "auto"]
  }

  /// Every fan back to automatic control. Never throws: each fan is attempted, failures logged.
  @discardableResult
  func restoreAll(reason: String) -> Bool {
    var ok = true
    for fan in fans {
      do {
        try setManual(fan, false)
      } catch {
        ok = false
        log.write("restore \(fan.id) failed: \(error)")
      }
    }
    if !overrides.isEmpty || reason != "disconnect-idle" {
      log.write("restoreAll (\(reason)) → \(ok ? "ok" : "partial")")
    }
    overrides = [:]
    lastRestoreReason = reason
    restoreSeq += 1
    return ok
  }

  func hottestCelsius() -> Double? {
    var hottest: Double?
    for key in temperatureKeys {
      guard let value = readNumber(smc, key), value > 0, value < 150 else { continue }
      if hottest == nil || value > hottest! { hottest = value }
    }
    return hottest
  }

  func status() -> [String: Any] {
    var row: [String: Any] = [
      "uptime": Date().timeIntervalSince(startedAt),
      "activeOverrides": overrides.keys.sorted().map { ["id": "fan\($0)", "rpm": overrides[$0]!] },
      "restoreSeq": restoreSeq,
    ]
    if let lastError { row["lastError"] = lastError }
    if let lastRestoreReason { row["lastRestoreReason"] = lastRestoreReason }
    return row
  }
}

// MARK: - Request handling

/// Set once the process is up (`shutdown` captures globals declared later in this file).
var requestExit: () -> Void = {}

func jsonLine(_ object: [String: Any]) -> Data {
  var data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data("{}".utf8)
  data.append(0x0A)
  return data
}

func reply(_ id: Any, result: Any) -> Data { jsonLine(["id": id, "ok": true, "result": result]) }
func replyError(_ id: Any, _ code: String, _ message: String) -> Data { jsonLine(["id": id, "ok": false, "error": ["code": code, "message": message]]) }

func handle(_ line: Data, controller: FanController, options: Options) -> Data {
  guard let raw = try? JSONSerialization.jsonObject(with: line), let request = raw as? [String: Any] else {
    return replyError(NSNull(), "bad-request", "Not a JSON object.")
  }
  let id: Any = request["id"] ?? NSNull()
  guard let op = request["op"] as? String else { return replyError(id, "bad-request", "Missing op.") }
  let args = request["args"] as? [String: Any] ?? [:]

  return controller.queue.sync {
    controller.touch()
    do {
      switch op {
      case "hello":
        var hello: [String: Any] = [
          "protocol": protocolVersion,
          "helperVersion": helperVersion,
          "platform": "darwin",
          "mode": options.daemon ? "daemon" : "session",
          "pid": Int(getpid()),
          "watchdogSeconds": options.watchdogSeconds,
          "ceilingCelsius": options.ceilingCelsius,
          "capabilities": ["fans.write"],
          "teamSigned": ownTeamId != nil,
        ]
        if let executableSha256 { hello["binarySha256"] = executableSha256 }
        return reply(id, result: hello)
      case "status":
        return reply(id, result: controller.status())
      case "fans.list":
        return reply(id, result: controller.listFans())
      case "fans.setMode":
        guard let fanId = args["id"] as? String, let mode = args["mode"] as? String else {
          return replyError(id, "bad-request", "fans.setMode needs id and mode.")
        }
        guard mode == "auto" else { return replyError(id, "bad-request", "Only mode \"auto\" is settable; use fans.setTarget for manual.") }
        return reply(id, result: try controller.setAuto(id: fanId))
      case "fans.setTarget":
        guard let fanId = args["id"] as? String, let rpm = (args["rpm"] as? NSNumber)?.doubleValue else {
          return replyError(id, "bad-request", "fans.setTarget needs id and a numeric rpm.")
        }
        return reply(id, result: try controller.setTarget(id: fanId, rpm: rpm))
      case "fans.restoreAll":
        let ok = controller.restoreAll(reason: "client")
        return reply(id, result: ["restored": ok])
      case "helper.exit":
        // Restore and leave once the reply is out; launchd starts the daemon again from the
        // (possibly updated) binary.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { requestExit() }
        return reply(id, result: ["exiting": true])
      default:
        return replyError(id, "bad-request", "Unknown op \(op).")
      }
    } catch let error as HelperError {
      return replyError(id, error.code, error.message)
    } catch {
      return replyError(id, "smc-error", "\(error)")
    }
  }
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
func serve(client: Int32, controller: FanController, options: Options, log: Log) {
  var buffer = Data()
  var chunk = [UInt8](repeating: 0, count: 4096)
  while true {
    let count = Darwin.read(client, &chunk, chunk.count)
    if count <= 0 { break }
    buffer.append(contentsOf: chunk[0..<count])
    if buffer.count > 65536 {
      log.write("client sent an oversized line; closing")
      break
    }
    while let newline = buffer.firstIndex(of: 0x0A) {
      let line = buffer.subdata(in: buffer.startIndex..<newline)
      buffer.removeSubrange(buffer.startIndex...newline)
      if line.isEmpty { continue }
      if !writeAll(client, handle(line, controller: controller, options: options)) { return }
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
  controller = try FanController(log: log, ceilingCelsius: options.ceilingCelsius)
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

func shutdown(_ reason: String, code: Int32) -> Never {
  _ = controller.queue.sync { controller.restoreAll(reason: reason) }
  unlink(options.socketPath)
  log.write("exit (\(reason))")
  exit(code)
}

requestExit = { shutdown("client-exit", code: 0) }

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
let watchdog = DispatchSource.makeTimerSource(queue: controller.queue)
watchdog.schedule(deadline: .now() + 1, repeating: 1)
watchdog.setEventHandler {
  if options.daemon, let client = controller.client, !isAllowedPeer(client.uid, options: options) {
    log.write("uid \(client.uid) is no longer the console user; dropping the client")
    controller.restoreAll(reason: "console-user")
    Darwin.shutdown(client.fd, SHUT_RDWR)
    controller.client = nil
  }
  guard !controller.overrides.isEmpty else { return }
  if Date().timeIntervalSince(controller.lastCommandAt) > options.watchdogSeconds {
    controller.restoreAll(reason: "watchdog")
    return
  }
  if let hottest = controller.hottestCelsius(), hottest >= options.ceilingCelsius {
    log.write("temperature \(hottest) °C reached the ceiling")
    controller.restoreAll(reason: "ceiling")
  }
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
    controller.queue.sync { controller.client = (client, uid) }
    serve(client: client, controller: controller, options: options, log: log)
    _ = controller.queue.sync {
      controller.client = nil
      return controller.restoreAll(reason: "disconnect")
    }
    close(client)
    if options.daemon {
      log.write("client disconnected")
      continue
    }
    log.write("client disconnected; exiting in \(Int(options.idleExitSeconds)) s unless a client returns")
    let work = DispatchWorkItem { shutdown("idle", code: 0) }
    idleExit = work
    DispatchQueue.main.asyncAfter(deadline: .now() + options.idleExitSeconds, execute: work)
  }
}

CFRunLoopRun()
