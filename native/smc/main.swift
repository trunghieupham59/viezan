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
// Labels and grouping of sensor keys live in the app (electron/thermal/smcKeys.ts);
// this binary only reports keys, types and values.
import Foundation
import IOKit

// MARK: - SMC user-client structures (80 bytes, matching AppleSMC's expectations)

typealias SMCBytes = (
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8
)

struct SMCVersion {
  var major: UInt8 = 0
  var minor: UInt8 = 0
  var build: UInt8 = 0
  var reserved: UInt8 = 0
  var release: UInt16 = 0
}

struct SMCPLimitData {
  var version: UInt16 = 0
  var length: UInt16 = 0
  var cpuPLimit: UInt32 = 0
  var gpuPLimit: UInt32 = 0
  var memPLimit: UInt32 = 0
}

struct SMCKeyInfoData {
  var dataSize: UInt32 = 0
  var dataType: UInt32 = 0
  var dataAttributes: UInt8 = 0
}

struct SMCParamStruct {
  var key: UInt32 = 0
  var vers = SMCVersion()
  var pLimitData = SMCPLimitData()
  var keyInfo = SMCKeyInfoData()
  var padding: UInt16 = 0
  var result: UInt8 = 0
  var status: UInt8 = 0
  var data8: UInt8 = 0
  var data32: UInt32 = 0
  var bytes: SMCBytes = (
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  )
}

enum SMCCommand: UInt8 {
  case readKey = 5
  case keyFromIndex = 8
  case keyInfo = 9
}

let kSMCHandleYPCEvent: UInt32 = 2
let kSMCSuccess: UInt8 = 0

struct SMCError: Error, CustomStringConvertible {
  let description: String
}

// MARK: - Four-character codes

func fourCC(_ text: String) -> UInt32 {
  var value: UInt32 = 0
  for scalar in text.utf8.prefix(4) {
    value = (value << 8) | UInt32(scalar)
  }
  return value
}

func fourCCString(_ value: UInt32) -> String {
  let bytes = [UInt8(value >> 24 & 0xFF), UInt8(value >> 16 & 0xFF), UInt8(value >> 8 & 0xFF), UInt8(value & 0xFF)]
  return String(bytes: bytes, encoding: .ascii) ?? ""
}

// MARK: - Connection

final class SMC {
  private var connection: io_connect_t = 0

  init() throws {
    precondition(MemoryLayout<SMCParamStruct>.stride == 80, "SMCParamStruct must be 80 bytes")
    let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSMC"))
    guard service != 0 else { throw SMCError(description: "AppleSMC service not found") }
    defer { IOObjectRelease(service) }
    let result = IOServiceOpen(service, mach_task_self_, 0, &connection)
    guard result == kIOReturnSuccess else { throw SMCError(description: "IOServiceOpen failed: \(result)") }
  }

  deinit {
    if connection != 0 { IOServiceClose(connection) }
  }

  private func call(_ input: inout SMCParamStruct) throws -> SMCParamStruct {
    var output = SMCParamStruct()
    var outputSize = MemoryLayout<SMCParamStruct>.stride
    let result = IOConnectCallStructMethod(connection, kSMCHandleYPCEvent, &input, MemoryLayout<SMCParamStruct>.stride, &output, &outputSize)
    guard result == kIOReturnSuccess else { throw SMCError(description: "IOConnectCallStructMethod failed: \(result)") }
    guard output.result == kSMCSuccess else { throw SMCError(description: "SMC result \(output.result) for key \(fourCCString(input.key))") }
    return output
  }

  func keyCount() throws -> UInt32 {
    let info = try keyInfo(fourCC("#KEY"))
    let bytes = try readKey(fourCC("#KEY"), info: info)
    return UInt32(bytes[0]) << 24 | UInt32(bytes[1]) << 16 | UInt32(bytes[2]) << 8 | UInt32(bytes[3])
  }

  func key(at index: UInt32) throws -> UInt32 {
    var input = SMCParamStruct()
    input.data8 = SMCCommand.keyFromIndex.rawValue
    input.data32 = index
    return try call(&input).key
  }

  func keyInfo(_ key: UInt32) throws -> SMCKeyInfoData {
    var input = SMCParamStruct()
    input.key = key
    input.data8 = SMCCommand.keyInfo.rawValue
    return try call(&input).keyInfo
  }

  func readKey(_ key: UInt32, info: SMCKeyInfoData) throws -> [UInt8] {
    var input = SMCParamStruct()
    input.key = key
    input.keyInfo = info
    input.data8 = SMCCommand.readKey.rawValue
    var output = try call(&input)
    let size = Int(min(info.dataSize, 32))
    return withUnsafeBytes(of: &output.bytes) { Array($0.prefix(size)) }
  }
}

// MARK: - Value decoding

/// Decodes the SMC data types that carry temperatures and fan speeds. Returns nil for other types.
func decodeNumber(type: String, bytes: [UInt8]) -> Double? {
  func be16() -> UInt16 { bytes.count >= 2 ? UInt16(bytes[0]) << 8 | UInt16(bytes[1]) : 0 }
  func be32() -> UInt32 { bytes.count >= 4 ? UInt32(bytes[0]) << 24 | UInt32(bytes[1]) << 16 | UInt32(bytes[2]) << 8 | UInt32(bytes[3]) : 0 }
  switch type {
  case "flt ":
    guard bytes.count >= 4 else { return nil }
    let bits = UInt32(bytes[3]) << 24 | UInt32(bytes[2]) << 16 | UInt32(bytes[1]) << 8 | UInt32(bytes[0]) // little-endian
    let value = Double(Float(bitPattern: bits))
    return value.isFinite ? value : nil
  case "sp78":
    return Double(Int16(bitPattern: be16())) / 256
  case "sp87":
    return Double(Int16(bitPattern: be16())) / 128
  case "fpe2":
    return Double(be16()) / 4
  case "fp88":
    return Double(be16()) / 256
  case "ui8 ":
    return bytes.isEmpty ? nil : Double(bytes[0])
  case "ui16":
    return Double(be16())
  case "ui32":
    return Double(be32())
  case "ioft":
    guard bytes.count >= 8 else { return nil }
    var raw: UInt64 = 0
    for byte in bytes.prefix(8) { raw = raw << 8 | UInt64(byte) }
    return Double(raw) / 65536
  default:
    return nil
  }
}

let temperatureTypes: Set<String> = ["flt ", "sp78", "sp87", "fp88", "ui8 ", "ui16"]
let fanTypes: Set<String> = ["flt ", "fpe2", "ui16", "ui8 "]

struct SensorKey {
  let key: UInt32
  let name: String
  let type: String
  let info: SMCKeyInfoData
}

struct FanKeys {
  let index: Int
  let actual: SensorKey?
  let min: SensorKey?
  let max: SensorKey?
  let target: SensorKey?
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
    let key = fourCC(name)
    guard let info = try? smc.keyInfo(key) else { return nil }
    let type = fourCCString(info.dataType)
    guard allowedTypes.contains(type) else { return nil }
    return SensorKey(key: key, name: name, type: type, info: info)
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
          target: lookup("F\(index)Tg", allowedTypes: fanTypes)
        ))
      }
    }
    fans = fanList
  }

  func read(_ sensor: SensorKey?) -> Double? {
    guard let sensor else { return nil }
    guard let bytes = try? smc.readKey(sensor.key, info: sensor.info) else { return nil }
    return decodeNumber(type: sensor.type, bytes: bytes)
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
      if let value = read(fan.min) { row["min"] = value.rounded() }
      if let value = read(fan.max) { row["max"] = value.rounded() }
      if let value = read(fan.target) { row["target"] = value.rounded() }
      fanRows.append(row)
    }
    return [
      "ok": true,
      "timestamp": Int64(Date().timeIntervalSince1970 * 1000),
      "sensors": sensors,
      "fans": fanRows,
    ]
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
