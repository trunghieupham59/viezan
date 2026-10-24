// Shared SMC access for Viezan's native helpers: the AppleSMC user-client call, key
// enumeration, and value encoding/decoding. Compiled into both `viezan-smc` (read-only
// sensor reader) and `viezan-fan-helper` (privileged fan writer). Declarations only;
// each binary's `main.swift` holds the program.
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
  case writeKey = 6
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

  /// Write raw bytes to a key. The caller encodes the value for the key's type; the byte
  /// count must match the key's reported size, or the SMC rejects the write.
  func writeKey(_ key: UInt32, info: SMCKeyInfoData, bytes: [UInt8]) throws {
    guard bytes.count == Int(info.dataSize), bytes.count <= 32 else {
      throw SMCError(description: "write size \(bytes.count) does not match key size \(info.dataSize) for \(fourCCString(key))")
    }
    var input = SMCParamStruct()
    input.key = key
    input.keyInfo = info
    input.data8 = SMCCommand.writeKey.rawValue
    withUnsafeMutableBytes(of: &input.bytes) { raw in
      for (offset, byte) in bytes.enumerated() { raw[offset] = byte }
    }
    _ = try call(&input)
  }
}

// MARK: - Value encoding and decoding

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


/// Encodes a number for the SMC data types fan targets and modes use. Returns nil for other types.
func encodeNumber(type: String, value: Double, size: Int) -> [UInt8]? {
  switch type {
  case "flt ":
    let bits = Float(value).bitPattern
    return [UInt8(bits & 0xFF), UInt8(bits >> 8 & 0xFF), UInt8(bits >> 16 & 0xFF), UInt8(bits >> 24 & 0xFF)] // little-endian
  case "fpe2":
    let raw = UInt16(max(0, min(65535, (value * 4).rounded())))
    return [UInt8(raw >> 8), UInt8(raw & 0xFF)]
  case "ui8 ":
    return [UInt8(max(0, min(255, value.rounded())))]
  case "ui16":
    let raw = UInt16(max(0, min(65535, value.rounded())))
    return [UInt8(raw >> 8), UInt8(raw & 0xFF)]
  case "ui32":
    let raw = UInt32(max(0, min(4294967295, value.rounded())))
    return [UInt8(raw >> 24 & 0xFF), UInt8(raw >> 16 & 0xFF), UInt8(raw >> 8 & 0xFF), UInt8(raw & 0xFF)]
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

/// Look a key up by name and accept it only when its type is one the caller can decode.
func lookupKey(_ smc: SMC, _ name: String, allowedTypes: Set<String>) -> SensorKey? {
  let key = fourCC(name)
  guard let info = try? smc.keyInfo(key) else { return nil }
  let type = fourCCString(info.dataType)
  guard allowedTypes.contains(type) else { return nil }
  return SensorKey(key: key, name: name, type: type, info: info)
}

func readNumber(_ smc: SMC, _ sensor: SensorKey?) -> Double? {
  guard let sensor else { return nil }
  guard let bytes = try? smc.readKey(sensor.key, info: sensor.info) else { return nil }
  return decodeNumber(type: sensor.type, bytes: bytes)
}
