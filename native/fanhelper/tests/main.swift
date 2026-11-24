import Foundation

final class FakeSMC: FanSMCAccess {
  var values: [String: Double] = ["TC0P": 55]
  let forceMaskType: String?
  var unreadable = Set<String>()
  var failingWrites: [String: Double] = [:]
  var writes: [(key: String, value: Double)] = []

  init(hasTemperature: Bool, forceMaskType: String? = nil, fanCount: Int = 2) {
    self.forceMaskType = forceMaskType
    values["FNum"] = Double(fanCount)
    if !hasTemperature { values.removeValue(forKey: "TC0P") }
    if forceMaskType != nil { values["FS! "] = 0 }
    for index in 0..<fanCount {
      let fan = "F\(index)"
      if forceMaskType == nil { values[fan + "Md"] = 0 }
      values[fan + "Mn"] = 1000
      values[fan + "Mx"] = 6000
      values[fan + "Ac"] = 1500
      values[fan + "Tg"] = 2000
    }
  }

  func keyCount() -> UInt32 { UInt32(values.count) }
  func key(at index: UInt32) -> UInt32 { fourCC(values.keys.sorted()[Int(index)]) }

  func keyInfo(_ key: UInt32) throws -> SMCKeyInfoData {
    let name = fourCCString(key)
    guard values[name] != nil else { throw SMCError(description: "missing " + name) }
    let byte = name == "FNum" || name.hasSuffix("Md") || (name == "FS! " && forceMaskType == "ui8 ")
    return SMCKeyInfoData(dataSize: byte ? 1 : 2, dataType: fourCC(byte ? "ui8 " : "ui16"))
  }

  func readKey(_ key: UInt32, info: SMCKeyInfoData) throws -> [UInt8] {
    let name = fourCCString(key)
    guard !unreadable.contains(name), let value = values[name],
          let bytes = encodeNumber(type: fourCCString(info.dataType), value: value, size: Int(info.dataSize))
    else { throw SMCError(description: "read " + name) }
    return bytes
  }

  func writeKey(_ key: UInt32, info: SMCKeyInfoData, bytes: [UInt8]) throws {
    let name = fourCCString(key)
    guard let value = decodeNumber(type: fourCCString(info.dataType), bytes: bytes) else {
      throw SMCError(description: "decode " + name)
    }
    writes.append((name, value))
    if failingWrites[name] == value { throw SMCError(description: "write " + name) }
    values[name] = value
  }
}

struct CheckFailure: Error, CustomStringConvertible { let description: String }

func expect(_ condition: Bool, _ message: String) throws {
  if !condition { throw CheckFailure(description: message) }
}

func expectError(_ code: String, message: String? = nil, _ action: () throws -> Void) throws {
  do {
    try action()
    throw CheckFailure(description: "expected " + code + ", command succeeded")
  } catch let error as HelperError {
    try expect(error.code == code, "unexpected error code " + error.code)
    if let message { try expect(error.message == message, "unexpected error " + error.message) }
  }
}

func active(_ controller: FanController) throws -> [[String: Any]] {
  guard let fans = controller.status()["activeOverrides"] as? [[String: Any]] else {
    throw CheckFailure(description: "invalid activeOverrides")
  }
  return fans
}

var failures = 0
func checkFixture(_ name: String, hasTemperature: Bool = true, forceMaskType: String? = nil, fanCount: Int = 2,
                  _ body: (FakeSMC, FanController, URL) throws -> Void) {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: url) }
  do {
    let smc = FakeSMC(hasTemperature: hasTemperature, forceMaskType: forceMaskType, fanCount: fanCount)
    let controller = try FanController(smc: smc, log: Log(path: url.path), ceilingCelsius: 105)
    try body(smc, controller, url)
    print("PASS " + name)
  } catch {
    failures += 1
    print("FAIL " + name + " — " + String(describing: error))
  }
}

func check(_ name: String, hasTemperature: Bool = true, forceMaskType: String? = nil, fanCount: Int = 2,
           _ body: (FakeSMC, FanController, URL) throws -> Void) {
  checkFixture(name, hasTemperature: hasTemperature, forceMaskType: forceMaskType, fanCount: fanCount) { smc, controller, url in
    try controller.queue.sync { try body(smc, controller, url) }
  }
}

final class CommandClient {
  let controller: FanController
  var consoleUID: uid_t = 501
  var shutdownFDs: [Int32] = []
  var exitRequests = 0

  init(_ controller: FanController) {
    self.controller = controller
    controller.queue.sync { controller.client = (11, 501) }
  }

  func send(_ line: String, from fd: Int32 = 11) -> Data? {
    let environment = CommandEnvironment(
      protocolVersion: 1, helperVersion: "test", teamSigned: false, executableSha256: nil,
      isAllowedPeer: { uid, _ in uid == self.consoleUID }, writeLog: controller.log.write,
      shutdownSocket: { self.shutdownFDs.append($0) }, requestExit: { self.exitRequests += 1 }
    )
    return handle(Data(line.utf8), from: fd, controller: controller, options: Options(daemon: true), environment: environment)
  }
}

let targetCommand = #"{"id":1,"op":"fans.setTarget","args":{"id":"fan0","rpm":3000}}"#
let statusCommand = #"{"id":2,"op":"status"}"#

func decodedReply(_ data: Data?, id: Int) throws -> [String: Any] {
  guard let data, data.last == 0x0A, let reply = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        reply["id"] as? Int == id else { throw CheckFailure(description: "missing or invalid reply to request \(id)") }
  return reply
}

check("a. target write rolls back mode and returns the original error") { smc, controller, _ in
  smc.failingWrites["F0Tg"] = 3000
  try expectError("smc-error", message: "write F0Tg") { _ = try controller.setTarget(id: "fan0", rpm: 3000) }
  try expect(smc.values["F0Md"] == 0, "F0Md is still 1")
  try expect(try active(controller).isEmpty, "rolled-back fan is still active")
}

check("b. failed rollback stays manual until the next successful retry") { smc, controller, _ in
  smc.failingWrites = ["F0Tg": 3000, "F0Md": 0]
  try expectError("smc-error", message: "write F0Tg") { _ = try controller.setTarget(id: "fan0", rpm: 3000) }
  let rows = try active(controller)
  try expect(rows.count == 1 && rows[0]["id"] as? String == "fan0", "manual fan is missing")
  try expect(rows[0]["rpm"] as? Double == 2000, "status must report the actual target")
  try expect(controller.status()["pendingRestore"] as? [String] == ["fan0"], "missing pending rollback")
  smc.failingWrites.removeAll()
  try expectError("smc-error") { _ = try controller.setTarget(id: "fan0", rpm: 4000) }
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(smc.values["F0Md"] == 0 && (try active(controller)).isEmpty, "rollback was not retried")
  try expect(controller.restoreSeq == 0 && controller.lastRestoreReason == nil, "retry became a restore event")
}

check("c. partial restore retries only the failed fan and logs each transition once") { smc, controller, url in
  _ = try controller.setTarget(id: "fan0", rpm: 3000)
  _ = try controller.setTarget(id: "fan1", rpm: 4000)
  smc.failingWrites["F0Md"] = 0
  try expect(!controller.restoreAll(reason: "sleep"), "partial restore reported success")
  let rows = try active(controller)
  try expect(rows.count == 1 && rows[0]["id"] as? String == "fan0", "status lost the failed fan")
  try expect(rows[0]["rpm"] as? Double == 3000, "lost the applied target")
  try expect(smc.values["F0Md"] == 1 && smc.values["F1Md"] == 0, "wrong hardware modes")
  smc.writes.removeAll()
  let overdue = controller.lastCommandAt + 16
  controller.tick(now: overdue, watchdogSeconds: 15)
  controller.tick(now: overdue, watchdogSeconds: 15)
  smc.failingWrites.removeAll()
  controller.tick(now: overdue, watchdogSeconds: 15)
  smc.unreadable.insert("TC0P")
  controller.tick(now: overdue, watchdogSeconds: 15)
  try expect(smc.writes.map(\.key) == ["F0Md", "F0Md", "F0Md"], "unexpected retry writes")
  try expect(smc.values["F0Md"] == 0 && (try active(controller)).isEmpty, "retry did not clear the fan")
  try expect(controller.restoreSeq == 1 && controller.lastRestoreReason == "sleep", "retry changed restore event")
  let log = try String(contentsOf: url, encoding: .utf8)
  for transition in ["restore fan0 failed", "restore fan0 recovered"] {
    try expect(log.components(separatedBy: transition).count == 2, "wrong log count for " + transition)
  }
}

for hasTemperature in [false, true] {
  check("d. reject target with " + (hasTemperature ? "unreadable sensor" : "no sensor"),
        hasTemperature: hasTemperature) { smc, controller, _ in
    smc.unreadable.insert("TC0P")
    try expectError("unsupported") { _ = try controller.setTarget(id: "fan0", rpm: 3000) }
    try expect(smc.writes.isEmpty, "wrote to SMC without a temperature")
  }
}

check("e. normal target and restore preserve status and RPM") { smc, controller, _ in
  let result = try controller.setTarget(id: "fan0", rpm: 2999.6)
  let rows = try active(controller)
  try expect(result["targetRpm"] as? Double == 3000 && result["mode"] as? String == "manual", "bad reply")
  try expect(rows.count == 1 && rows[0]["rpm"] as? Double == 3000 && smc.values["F0Tg"] == 3000, "bad target")
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(smc.values["F0Md"] == 1 && controller.restoreSeq == 0, "spurious restore")
  try expect(controller.restoreAll(reason: "client"), "restore failed")
  try expect(try active(controller).isEmpty && smc.values["F0Md"] == 0, "manual override remains")
  try expect(controller.restoreSeq == 1 && controller.lastRestoreReason == "client", "missing restore event")
}

for reason in ["ceiling-unreadable", "watchdog", "ceiling"] {
  check("watchdog restores for " + reason) { smc, controller, _ in
    _ = try controller.setTarget(id: "fan0", rpm: 3000)
    if reason == "ceiling" { smc.values["TC0P"] = 105 } else if reason != "watchdog" { smc.unreadable.insert("TC0P") }
    let now = controller.lastCommandAt + (reason == "watchdog" ? 16 : 1)
    controller.tick(now: now, watchdogSeconds: 15)
    try expect(controller.lastRestoreReason == reason && controller.restoreSeq == 1, "wrong restore event")
    try expect(smc.values["F0Md"] == 0 && (try active(controller)).isEmpty, "safety restore left fan manual")
  }
}

check("unreadable initial target leaves the fan in automatic mode") { smc, controller, _ in
  smc.unreadable.insert("F0Tg")
  try expectError("smc-error") { _ = try controller.setTarget(id: "fan0", rpm: 3000) }
  try expect(smc.writes.isEmpty && (try active(controller)).isEmpty, "entered manual without a known target")
}

check("failed update keeps the previous override until automatic mode succeeds") { smc, controller, _ in
  _ = try controller.setTarget(id: "fan0", rpm: 2500)
  smc.unreadable.insert("F0Tg")
  smc.failingWrites = ["F0Tg": 3000, "F0Md": 0]
  try expectError("smc-error", message: "write F0Tg") { _ = try controller.setTarget(id: "fan0", rpm: 3000) }
  let rows = try active(controller)
  try expect(rows.count == 1 && rows[0]["rpm"] as? Double == 2500, "lost previous RPM")
  smc.failingWrites.removeAll()
  _ = try controller.setAuto(id: "fan0")
  smc.writes.removeAll()
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(smc.writes.isEmpty && (try active(controller)).isEmpty, "retried after successful setAuto")
}

check("pending startup restore and a new override both receive watchdog protection") { smc, controller, _ in
  smc.failingWrites["F0Md"] = 0
  try expect(!controller.restoreAll(reason: "start"), "expected startup failure")
  try expect(try active(controller).isEmpty, "startup invented a manual override")
  smc.writes.removeAll()
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(smc.writes.map(\.key) == ["F0Md"], "missed retry without a known override")
  _ = try controller.setTarget(id: "fan1", rpm: 4000)
  smc.unreadable.insert("TC0P")
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(smc.values["F1Md"] == 0 && controller.lastRestoreReason == "ceiling-unreadable", "missed ceiling")
  smc.failingWrites.removeAll()
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(controller.pendingRestore.isEmpty && controller.restoreSeq == 2, "missed pending restore")
}

check("Intel mask retry preserves the other manual fan", forceMaskType: "ui16") { smc, controller, _ in
  _ = try controller.setTarget(id: "fan0", rpm: 3000)
  _ = try controller.setTarget(id: "fan1", rpm: 4000)
  smc.unreadable.insert("FS! ")
  try expectError("smc-error") { _ = try controller.setAuto(id: "fan1") }
  try expect(smc.values["FS! "] == 3, "overwrote an unreadable mask")
  smc.unreadable.remove("FS! ")
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(smc.values["FS! "] == 1 && controller.pendingRestore.isEmpty, "retry changed fan0")
}

check("ceiling is reported even when the client is also late") { smc, controller, _ in
  _ = try controller.setTarget(id: "fan0", rpm: 3000)
  smc.values["TC0P"] = 105
  controller.tick(now: controller.lastCommandAt + 60, watchdogSeconds: 15)
  try expect(controller.lastRestoreReason == "ceiling" && smc.values["F0Md"] == 0, "watchdog hid the ceiling")
}

check("target is refused while a sensor is at the ceiling") { smc, controller, _ in
  smc.values["TC0P"] = 105
  try expectError("ceiling") { _ = try controller.setTarget(id: "fan0", rpm: 3000) }
  try expect(smc.writes.isEmpty && (try active(controller)).isEmpty, "entered manual at the ceiling")
}

check("a huge target is rejected without trapping") { smc, controller, _ in
  try expectError("out-of-range") { _ = try controller.setTarget(id: "fan0", rpm: 1e30) }
  try expectError("out-of-range") { _ = try controller.setTarget(id: "fan0", rpm: -1e30) }
  try expect(smc.writes.isEmpty, "wrote for an out-of-range target")
}

do {
  let name = "a fan without a mode key is never left pending"
  let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: url) }
  let smc = FakeSMC(hasTemperature: true, forceMaskType: "ui16")
  smc.values.removeValue(forKey: "FS! ")
  let controller = try FanController(smc: smc, log: Log(path: url.path), ceilingCelsius: 105)
  let clean = controller.queue.sync { controller.restoreAll(reason: "start") && controller.pendingRestore.isEmpty }
  if clean { print("PASS " + name) } else { failures += 1; print("FAIL " + name) }
}

check("shutdown retries only the pending fan and stops on recovery") { smc, controller, _ in
  _ = try controller.setTarget(id: "fan0", rpm: 3000)
  _ = try controller.setTarget(id: "fan1", rpm: 4000)
  smc.failingWrites["F0Md"] = 0
  smc.writes.removeAll()
  var waits: [TimeInterval] = []
  controller.restoreBeforeExit(reason: "client-exit", now: { 0 }) { delay in
    waits.append(delay)
    if waits.count == 2 { smc.failingWrites.removeAll() }
  }
  try expect(waits == [0.25, 0.25], "wrong shutdown retry schedule")
  try expect(smc.writes.map(\.key) == ["F0Md", "F1Md", "F0Md", "F0Md"], "retried a restored fan")
  try expect(controller.pendingRestore.isEmpty && (try active(controller)).isEmpty, "left fan manual")
  try expect(controller.restoreSeq == 1 && controller.lastRestoreReason == "client-exit", "counted a retry as an event")
}

check("shutdown bounds retries and logs the remaining fan once") { smc, controller, url in
  _ = try controller.setTarget(id: "fan1", rpm: 4000)
  smc.failingWrites["F1Md"] = 0
  var waits: [TimeInterval] = []
  controller.restoreBeforeExit(reason: "signal 15", now: { 0 }) { waits.append($0) }
  try expect(waits == Array(repeating: 0.25, count: 12), "wrong retry count or interval")
  try expect(controller.pendingRestore == [1] && smc.values["F1Md"] == 1, "lost the pending fan")
  let log = try String(contentsOf: url, encoding: .utf8)
  let warnings = log.split(separator: "\n").filter { $0.contains("automatic mode unconfirmed") }
  try expect(warnings.count == 1 && warnings[0].hasSuffix("automatic mode unconfirmed for fan1"), "wrong final list of fans")
}

check("shutdown stops at the three-second deadline before exhausting retries") { smc, controller, url in
  _ = try controller.setTarget(id: "fan1", rpm: 4000)
  smc.failingWrites["F1Md"] = 0
  smc.writes.removeAll()
  var now = 100.0
  var waits: [TimeInterval] = []
  controller.restoreBeforeExit(reason: "signal 15", now: { now }) { delay in
    waits.append(delay)
    // The first wait returns late with 1/8 second left. The second crosses the deadline.
    now += waits.count == 1 ? 2.875 : 0.25
  }
  try expect(waits == [0.25, 0.125], "waits at the three-second deadline: \(waits)")
  try expect(smc.writes.map(\.key) == ["F0Md", "F1Md", "F1Md", "F1Md"], "unexpected retries at shutdown")
  try expect(controller.pendingRestore == [1] && smc.values["F1Md"] == 1, "lost the pending fan")
  let log = try String(contentsOf: url, encoding: .utf8)
  let warnings = log.split(separator: "\n").filter { $0.contains("automatic mode unconfirmed") }
  try expect(warnings.count == 1 && warnings[0].hasSuffix("automatic mode unconfirmed for fan1"), "wrong deadline warning")
}

checkFixture("a buffered command from a revoked console client is dropped") { smc, controller, _ in
  let client = CommandClient(controller)
  try expect(client.send(statusCommand) != nil, "current client was rejected")
  controller.queue.sync { controller.disconnect(11, reason: "console-user") }
  let revokedAt = controller.queue.sync { controller.lastCommandAt }
  smc.writes.removeAll()
  try expect(client.send(targetCommand) == nil, "replied to revoked client")
  try expect(smc.writes.isEmpty && controller.queue.sync { controller.lastCommandAt == revokedAt },
             "revoked command ran or renewed watchdog")
}

checkFixture("serve cleanup preserves the console restore and the next client") { smc, controller, _ in
  let client = CommandClient(controller)
  try expect(try decodedReply(client.send(targetCommand), id: 1)["ok"] as? Bool == true, "target failed")
  client.consoleUID = 502
  try expect(client.send(statusCommand) == nil, "replied after console switch")
  try expect(smc.values["F0Md"] == 0 && controller.queue.sync { controller.client == nil }, "console switch did not release the fan and client")
  smc.writes.removeAll()
  try controller.queue.sync {
    controller.disconnect(11, reason: "disconnect")
    try expect(controller.lastRestoreReason == "console-user" && controller.restoreSeq == 1 && smc.writes.isEmpty,
               "cleanup overwrote console-user")
    controller.client = (12, 502)
    controller.disconnect(11, reason: "disconnect")
  }
  try expect(client.send(statusCommand) == nil && client.send(statusCommand, from: 12) != nil, "lost the current client")
  try controller.queue.sync {
    controller.disconnect(12, reason: "disconnect")
    try expect(controller.restoreSeq == 2 && controller.lastRestoreReason == "disconnect", "missed normal disconnect")
  }
}

checkFixture("setTarget from another fd is dropped without an SMC write or reply") { smc, controller, _ in
  let client = CommandClient(controller)
  let reply = client.send(targetCommand, from: 12)
  try expect(smc.writes.isEmpty, "another fd wrote to SMC")
  try expect(reply == nil && client.shutdownFDs.isEmpty, "answered or shut down the wrong fd")
}

checkFixture("daemon rechecks the console user before setTarget") { smc, controller, _ in
  let client = CommandClient(controller)
  try expect(client.send(statusCommand) != nil, "console user was rejected")
  client.consoleUID = 502
  try expect(client.send(targetCommand) == nil, "answered setTarget after console switch")
  try expect(smc.writes.map(\.key) == ["F0Md", "F1Md"] && smc.writes.allSatisfy { $0.value == 0 },
             "expected only writes restoring automatic mode")
  try controller.queue.sync {
    try expect(controller.client == nil && controller.lastRestoreReason == "console-user" && controller.restoreSeq == 1,
               "missing console-user disconnect")
  }
  try expect(client.shutdownFDs == [11], "expected one shutdown of the revoked socket")
}

checkFixture("valid setTarget writes the target and returns ok") { smc, controller, _ in
  let client = CommandClient(controller)
  let reply = try decodedReply(client.send(targetCommand), id: 1)
  try expect(reply["ok"] as? Bool == true, "setTarget failed")
  try expect(smc.writes.map(\.key) == ["F0Md", "F0Tg"] && smc.writes.map(\.value) == [1, 3000], "wrong SMC writes")
}

checkFixture("setTarget with a nonnumeric rpm returns bad-request") { smc, controller, _ in
  let client = CommandClient(controller)
  let reply = try decodedReply(client.send(#"{"id":3,"op":"fans.setTarget","args":{"id":"fan0","rpm":"3000"}}"#), id: 3)
  let error = reply["error"] as? [String: Any]
  try expect(reply["ok"] as? Bool == false && error?["code"] as? String == "bad-request", "wrong setTarget error")
  for value in ["true", "false"] {
    let reply = try decodedReply(client.send(#"{"id":4,"op":"fans.setTarget","args":{"id":"fan0","rpm":"# + value + "}}"), id: 4)
    try expect((reply["error"] as? [String: Any])?["code"] as? String == "bad-request", "boolean rpm accepted")
  }
  try expect(smc.writes.isEmpty, "invalid rpm wrote to SMC")
}

checkFixture("helper.exit replies before calling the injected exit") { _, controller, _ in
  let client = CommandClient(controller)
  let reply = try decodedReply(client.send(#"{"id":4,"op":"helper.exit"}"#), id: 4)
  let result = reply["result"] as? [String: Any]
  try expect(reply["ok"] as? Bool == true && result?["exiting"] as? Bool == true && client.exitRequests == 0,
             "missing exit acknowledgement before callback")
  let deadline = monotonicSeconds() + 2
  while client.exitRequests == 0 && monotonicSeconds() < deadline {
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.02))
  }
  try expect(client.exitRequests == 1, "exit callback did not run")
}

for reason in ["ceiling", "ceiling-unreadable"] {
  check("pending fan reports one " + reason + " per episode while retrying") { smc, controller, _ in
    _ = try controller.setTarget(id: "fan0", rpm: 3000)
    smc.failingWrites["F0Md"] = 0
    try expect(!controller.restoreAll(reason: "sleep"), "expected pending fan")
    smc.writes.removeAll()
    for episode in 1...2 {
      if reason == "ceiling" { smc.values["TC0P"] = 105 } else { smc.unreadable.insert("TC0P") }
      for _ in 0..<3 { controller.tick(now: controller.lastCommandAt + 16, watchdogSeconds: 15) }
      try expect(controller.restoreSeq == 1 + episode && controller.lastRestoreReason == reason,
                 "wrong event count or reason for pending fan")
      smc.values["TC0P"] = 55
      smc.unreadable.remove("TC0P")
      if episode == 2 { smc.failingWrites.removeAll() }
      controller.tick(now: controller.lastCommandAt + 16, watchdogSeconds: 15)
    }
    try expect(smc.writes.map(\.key) == Array(repeating: "F0Md", count: 8), "missed or duplicated a retry")
    try expect(controller.pendingRestore.isEmpty && smc.values["F0Md"] == 0, "missed recovery")
  }
}

check("watchdog expires on Darwin continuous elapsed time") { smc, controller, _ in
  let before = Double(clock_gettime_nsec_np(CLOCK_MONOTONIC)) / 1e9
  _ = try controller.setTarget(id: "fan0", rpm: 3000)
  let after = Double(clock_gettime_nsec_np(CLOCK_MONOTONIC)) / 1e9
  controller.tick(now: before + 15, watchdogSeconds: 15)
  try expect(smc.values["F0Md"] == 1, "watchdog fired early")
  controller.tick(now: after + 16, watchdogSeconds: 15)
  try expect(controller.lastRestoreReason == "watchdog" && smc.values["F0Md"] == 0, "elapsed deadline missed")
}

check("ui8 force mask accepts bit 7 and refuses bit 8", forceMaskType: "ui8 ", fanCount: 9) { smc, controller, _ in
  smc.values["FS! "] = 1
  _ = try controller.setTarget(id: "fan7", rpm: 3000)
  try expect(smc.values["FS! "] == 129, "damaged a representable bit")
  smc.writes.removeAll()
  try expectError("unsupported") { _ = try controller.setTarget(id: "fan8", rpm: 3000) }
  try expectError("unsupported") { _ = try controller.setAuto(id: "fan8") }
  try expect(smc.writes.isEmpty && smc.values["FS! "] == 129 && controller.pendingRestore.isEmpty,
             "wrote an unrepresentable bit or scheduled it for retry")
}

check("mask read failure updates status.lastError", forceMaskType: "ui16") { smc, controller, _ in
  smc.unreadable.insert("FS! ")
  try expectError("smc-error") { _ = try controller.setTarget(id: "fan0", rpm: 3000) }
  try expect(controller.status()["lastError"] as? String == "Cannot read the forced fan mask.", "mask error missing from status")
  try expect(smc.writes.isEmpty, "wrote after a failed mask read")
}

check("a pending fan records unreadable and ceiling as separate events, each once") { smc, controller, _ in
  _ = try controller.setTarget(id: "fan0", rpm: 3000)
  smc.failingWrites["F0Md"] = 0
  smc.unreadable.insert("TC0P")
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(controller.lastRestoreReason == "ceiling-unreadable" && controller.restoreSeq == 1, "missed unreadable")
  smc.unreadable.remove("TC0P")
  smc.values["TC0P"] = 105
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(controller.lastRestoreReason == "ceiling" && controller.restoreSeq == 2, "swallowed the ceiling after unreadable")
  controller.tick(now: controller.lastCommandAt, watchdogSeconds: 15)
  try expect(controller.restoreSeq == 2 && controller.pendingRestore == [0], "repeated the same event")
}

exit(failures == 0 ? 0 : 1)
