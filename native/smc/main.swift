// viezan-smc — read temperature sensors and fan speeds from the Apple System
// Management Controller (SMC). Read-only: reading SMC keys needs no privileges, so
// this binary runs as the user next to the app. It prints one JSON document to
// stdout, or, with `--watch <ms>`, one JSON line per interval until its parent exits.
//
// Output:
//   {"ok":true,"timestamp":1730000000000,"sensors":[{"key":"Tp01","type":"flt ","celsius":45.2}],
//    "fans":[{"index":0,"rpm":1203,"min":1200,"max":6000,"target":1203}]}
//   {"ok":false,"error":"..."}
//
// Labels and grouping of sensor keys live in the app (apps/macos/Sources/ViezanDomain/ThermalMonitor.swift);
// this binary only reports keys, types and values. SMC access is shared with the fan
// helper through native/common/SMC.swift.
import Foundation
import IOKit

struct FanKeys {
  let index: Int
  let actual: SensorKey?
  let min: SensorKey?
  let max: SensorKey?
  let target: SensorKey?
  /// Description from `F%dID` (Intel Macs: `{fds` struct whose tail is a C string such as "Left side"). Absent on Apple Silicon.
  let name: String?
}

/// `hw.model` (e.g. `MacBookPro18,2`), so the app can name fans on machines without `F%dID`.
func hardwareModel() -> String? {
  var size = 0
  guard sysctlbyname("hw.model", nil, &size, nil, 0) == 0, size > 0 else { return nil }
  var buffer = [CChar](repeating: 0, count: size)
  guard sysctlbyname("hw.model", &buffer, &size, nil, 0) == 0 else { return nil }
  return String(cString: buffer)
}

/// Read a fan description key: `{fds` keeps the text after a 4-byte header, `ch8*` is plain text.
func readFanName(_ smc: SMC, _ index: Int) -> String? {
  let key = fourCC("F\(index)ID")
  guard let info = try? smc.keyInfo(key), let bytes = try? smc.readKey(key, info: info) else { return nil }
  let type = fourCCString(info.dataType)
  let text = type == "{fds" ? Array(bytes.dropFirst(4)) : bytes
  let printable = text.prefix { $0 != 0 }.filter { $0 >= 32 && $0 < 127 }
  let name = String(bytes: printable, encoding: .ascii)?.trimmingCharacters(in: .whitespaces) ?? ""
  return name.isEmpty ? nil : name
}

final class Reader {
  let smc: SMC
  private(set) var temperatureKeys: [SensorKey] = []
  private(set) var fans: [FanKeys] = []

  init() throws {
    smc = try SMC()
    try discover()
  }

  private func lookup(_ name: String, allowedTypes: Set<String>) -> SensorKey? {
    lookupKey(smc, name, allowedTypes: allowedTypes)
  }

  /// Enumerate every key once; keep the temperature-shaped ones ("T..." with a numeric type
  /// and a plausible value) and the fan keys. Later reads only touch these keys.
  private func discover() throws {
    let count = try smc.keyCount()
    var temps: [SensorKey] = []
    for index in 0..<count {
      guard let key = try? smc.key(at: index) else { continue }
      let name = fourCCString(key)
      guard name.hasPrefix("T"), name.count == 4 else { continue }
      guard let info = try? smc.keyInfo(key) else { continue }
      let type = fourCCString(info.dataType)
      guard temperatureTypes.contains(type) else { continue }
      let sensor = SensorKey(key: key, name: name, type: type, info: info)
      guard let value = read(sensor), value > 0, value < 150 else { continue }
      temps.append(sensor)
    }
    temperatureKeys = temps.sorted { $0.name < $1.name }

    var fanList: [FanKeys] = []
    if let countKey = lookup("FNum", allowedTypes: ["ui8 ", "ui16", "ui32"]), let fanCount = read(countKey) {
      for index in 0..<Int(min(fanCount, 16)) {
        let actual = lookup("F\(index)Ac", allowedTypes: fanTypes)
        if actual == nil { continue }
        fanList.append(FanKeys(
          index: index,
          actual: actual,
          min: lookup("F\(index)Mn", allowedTypes: fanTypes),
          max: lookup("F\(index)Mx", allowedTypes: fanTypes),
          target: lookup("F\(index)Tg", allowedTypes: fanTypes),
          name: readFanName(smc, index)
        ))
      }
    }
    fans = fanList
  }

  func read(_ sensor: SensorKey?) -> Double? {
    readNumber(smc, sensor)
  }

  func snapshot() -> [String: Any] {
    var sensors: [[String: Any]] = []
    for sensor in temperatureKeys {
      guard let value = read(sensor), value > 0, value < 150 else { continue }
      sensors.append(["key": sensor.name, "type": sensor.type, "celsius": (value * 10).rounded() / 10])
    }
    var fanRows: [[String: Any]] = []
    for fan in fans {
      guard let rpm = read(fan.actual) else { continue }
      var row: [String: Any] = ["index": fan.index, "rpm": rpm.rounded()]
      if let name = fan.name { row["name"] = name }
      if let value = read(fan.min) { row["min"] = value.rounded() }
      if let value = read(fan.max) { row["max"] = value.rounded() }
      if let value = read(fan.target) { row["target"] = value.rounded() }
      fanRows.append(row)
    }
    var document: [String: Any] = [
      "ok": true,
      "timestamp": Int64(Date().timeIntervalSince1970 * 1000),
      "sensors": sensors,
      "fans": fanRows,
    ]
    if let model = hardwareModel() { document["model"] = model }
    return document
  }
}

// MARK: - Output

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func emitError(_ message: String) {
  emit(["ok": false, "error": message])
}

// MARK: - Main

let arguments = CommandLine.arguments
var watchIntervalMs: Int? = nil
if let flagIndex = arguments.firstIndex(of: "--watch") {
  let raw = flagIndex + 1 < arguments.count ? arguments[flagIndex + 1] : "2000"
  watchIntervalMs = max(250, Int(raw) ?? 2000)
}

do {
  let reader = try Reader()
  if let interval = watchIntervalMs {
    let parent = getppid()
    while true {
      emit(reader.snapshot())
      // Stop when the parent app is gone (re-parented to launchd) so no orphan keeps polling.
      if getppid() != parent || getppid() == 1 { break }
      usleep(useconds_t(interval) * 1000)
    }
  } else {
    emit(reader.snapshot())
  }
} catch {
  emitError("\(error)")
  exit(1)
}
