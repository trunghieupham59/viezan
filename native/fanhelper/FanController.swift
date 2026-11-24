import Foundation

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

/// Darwin's monotonic clock includes system sleep and cannot jump with the wall clock.
func monotonicSeconds() -> TimeInterval {
  Double(clock_gettime_nsec_np(CLOCK_MONOTONIC)) / 1e9
}

/// Owns the SMC connection and the override state. Every method runs on `queue`.
final class FanController {
  let smc: FanSMCAccess
  let log: Log
  let ceilingCelsius: Double
  let queue = DispatchQueue(label: "viezan.fanhelper.smc")
  private(set) var fans: [Fan] = []
  /// `FS! ` bitmask of forced fans, the mode key on Intel Macs without `F%dMd`.
  private let forceBits: SensorKey?
  private var temperatureKeys: [SensorKey] = []
  /// Fan index → target RPM for every fan currently under manual control.
  private(set) var overrides: [Int: Double] = [:]
  private(set) var pendingRestore = Set<Int>()
  private var pendingFans: [Fan] { fans.filter { pendingRestore.contains($0.index) } }
  /// The temperature event already recorded for the fans still awaiting restore; nil when none.
  private var reportedCeiling: String?
  private(set) var lastCommandAt = monotonicSeconds()
  private(set) var lastError: String?
  private(set) var lastRestoreReason: String?
  /// Counts every restore, so a client can tell a new restore from an old one with the same reason.
  private(set) var restoreSeq = 0
  /// The connected client, set and cleared by the accept loop (on `queue`).
  var client: (fd: Int32, uid: uid_t)?
  let startedAt = monotonicSeconds()

  init(smc: FanSMCAccess, log: Log, ceilingCelsius: Double) throws {
    self.log = log
    self.ceilingCelsius = ceilingCelsius
    self.smc = smc
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

  private func touch() { lastCommandAt = monotonicSeconds() }

  // The accept loop keeps the fd open until serve returns, so it cannot be reused mid-command.
  func beginCommand(from fd: Int32) -> Bool {
    guard client?.fd == fd else { return false }
    touch()
    return true
  }

  func disconnect(_ fd: Int32, reason: String) {
    guard client?.fd == fd else { return }
    client = nil
    restoreAll(reason: reason)
  }

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
      let maskBytes = min(Int(forceBits.info.dataSize), forceBits.type == "ui8 " ? 1 : 2)
      guard fan.index < maskBytes * 8 else {
        throw HelperError(code: "unsupported", message: "The forced fan mask cannot represent \(fan.id).")
      }
      guard let mask = readNumber(smc, forceBits) else {
        let message = "Cannot read the forced fan mask."
        lastError = message
        throw HelperError(code: "smc-error", message: message)
      }
      let current = UInt16(mask)
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
      // Formatted as text: converting an out-of-range number to Int would trap this root process.
      throw HelperError(code: "out-of-range", message: String(format: "Target %.0f RPM is outside %.0f–%.0f RPM.", rpm, min, max))
    }
    guard let target = fan.target else { throw HelperError(code: "unsupported", message: "Fan \(id) has no target key.") }
    guard let hottest = hottestCelsius() else {
      throw HelperError(code: "unsupported", message: "No readable SMC temperature for the safety ceiling.")
    }
    guard hottest < ceilingCelsius else {
      throw HelperError(code: "ceiling", message: "A temperature sensor is at the safety ceiling.")
    }
    reportedCeiling = nil
    guard !pendingRestore.contains(fan.index) else {
      throw HelperError(code: "smc-error", message: "Fan \(id) is awaiting automatic control.")
    }
    // If both writes fail, status still needs the last known RPM for the manual fan.
    guard let previousRpm = overrides[fan.index] ?? readNumber(smc, target) else {
      throw HelperError(code: "smc-error", message: "Cannot read the current target for \(id).")
    }
    try setManual(fan, true)
    do {
      try write(target, rpm.rounded())
    } catch {
      overrides[fan.index] = previousRpm
      try? restore(fan)
      throw error
    }
    overrides[fan.index] = rpm.rounded()
    touch()
    log.write("set \(fan.id) target=\(Int(rpm.rounded())) rpm")
    return ["id": fan.id, "targetRpm": rpm.rounded(), "mode": "manual"]
  }

  func setAuto(id: String) throws -> [String: Any] {
    let fan = try fan(withId: id)
    try restore(fan)
    touch()
    log.write("auto \(fan.id)")
    return ["id": fan.id, "mode": "auto"]
  }

  private func restore(_ fan: Fan) throws {
    do {
      try setManual(fan, false)
    } catch {
      // Without a mode key the fan was never manual, so there is nothing to retry.
      if (error as? HelperError)?.code == "unsupported" { throw error }
      if pendingRestore.insert(fan.index).inserted {
        log.write("restore \(fan.id) failed: \(error)")
      }
      throw error
    }
    overrides[fan.index] = nil
    if pendingRestore.remove(fan.index) != nil {
      log.write("restore \(fan.id) recovered")
    }
    if overrides.isEmpty && pendingRestore.isEmpty { reportedCeiling = nil }
  }

  /// Every fan back to automatic control. Never throws: each fan is attempted, failures logged.
  @discardableResult
  func restoreAll(reason: String) -> Bool {
    restore(fans, reason: reason)
  }

  @discardableResult
  private func restore(_ candidates: [Fan], reason: String? = nil) -> Bool {
    let hadOverrides = !overrides.isEmpty
    for fan in candidates { try? restore(fan) }
    let ok = pendingRestore.isEmpty
    guard let reason else { return ok } // A retry belongs to the original restore event.
    if hadOverrides || reason != "disconnect-idle" {
      log.write("restoreAll (\(reason)) → \(ok ? "ok" : "partial")")
    }
    lastRestoreReason = reason
    restoreSeq += 1
    return ok
  }

  func restoreBeforeExit(reason: String, now: () -> TimeInterval = monotonicSeconds,
                         wait: (TimeInterval) -> Void = Thread.sleep(forTimeInterval:)) {
    let deadline = now() + 3
    guard !restoreAll(reason: reason) else { return }
    for _ in 0..<12 {
      let remaining = deadline - now()
      guard remaining > 0 else { break }
      wait(min(0.25, remaining))
      if restore(pendingFans) { return }
    }
    log.write("exit (\(reason)): automatic mode unconfirmed for " + pendingFans.map(\.id).joined(separator: ", "))
  }

  func hottestCelsius() -> Double? {
    var hottest: Double?
    for key in temperatureKeys {
      guard let value = readNumber(smc, key), value > 0, value < 150 else { continue }
      if hottest == nil || value > hottest! { hottest = value }
    }
    return hottest
  }

  func tick(now: TimeInterval, watchdogSeconds: Double) {
    guard !overrides.isEmpty || !pendingRestore.isEmpty else { return }
    let hasActiveTarget = overrides.keys.contains { !pendingRestore.contains($0) }
    let hottest = hottestCelsius()
    if let hottest, hottest < ceilingCelsius {
      reportedCeiling = nil
      if hasActiveTarget && now - lastCommandAt > watchdogSeconds {
        restoreAll(reason: "watchdog")
        return
      }
    } else {
      let reason = hottest == nil ? "ceiling-unreadable" : "ceiling"
      if reportedCeiling != reason {
        if let hottest { log.write("temperature \(hottest) °C reached the ceiling") }
        reportedCeiling = restore(hasActiveTarget ? fans : pendingFans, reason: reason) ? nil : reason
        return
      }
    }
    if !pendingRestore.isEmpty { restore(pendingFans) }
  }

  func status() -> [String: Any] {
    var row: [String: Any] = [
      "uptime": monotonicSeconds() - startedAt,
      "activeOverrides": overrides.keys.sorted().map { ["id": "fan\($0)", "rpm": overrides[$0]!] },
      "pendingRestore": pendingRestore.sorted().map { "fan\($0)" },
      "restoreSeq": restoreSeq,
    ]
    if let lastError { row["lastError"] = lastError }
    if let lastRestoreReason { row["lastRestoreReason"] = lastRestoreReason }
    return row
  }
}
