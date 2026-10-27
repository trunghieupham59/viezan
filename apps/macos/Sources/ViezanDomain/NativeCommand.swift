import Foundation
import Darwin

struct NativeCommandResult: Sendable { let status: Int32; let output: Data; let diagnostics: Data }
enum NativeCommand {
    /// Arguments are passed directly to a fixed executable, never through a shell.
    static func run(_ executable: URL, _ arguments: [String], timeout: TimeInterval = 30) throws -> NativeCommandResult {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: directory) }
        let output = directory.appendingPathComponent("output")
        FileManager.default.createFile(atPath: output.path, contents: nil, attributes: [.posixPermissions: 0o600])
        let handle = try FileHandle(forWritingTo: output); defer { try? handle.close() }
        let errors = directory.appendingPathComponent("errors")
        FileManager.default.createFile(atPath: errors.path, contents: nil, attributes: [.posixPermissions: 0o600])
        let errorHandle = try FileHandle(forWritingTo: errors); defer { try? errorHandle.close() }
        let process = Process(); process.executableURL = executable; process.arguments = arguments; process.standardOutput = handle; process.standardError = errorHandle; process.standardInput = FileHandle.nullDevice
        try process.run(); let deadline = ProcessInfo.processInfo.systemUptime + timeout
        while process.isRunning {
            let size = (try? output.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            let errorSize = (try? errors.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if errorSize > 1_048_576 || Task.isCancelled || ProcessInfo.processInfo.systemUptime > deadline || size > 1_048_576 {
                process.terminate()
                let grace = ProcessInfo.processInfo.systemUptime + 2
                while process.isRunning && ProcessInfo.processInfo.systemUptime < grace { Thread.sleep(forTimeInterval: 0.02) }
                if process.isRunning { kill(process.processIdentifier, SIGKILL) }
                process.waitUntilExit(); throw StorageFailure.invalidData
            }
            Thread.sleep(forTimeInterval: 0.02)
        }
        process.waitUntilExit(); let data = try Data(contentsOf: output)
        guard data.count <= 1_048_576 else { throw StorageFailure.invalidData }
        let diagnostics = try Data(contentsOf: errors); guard diagnostics.count <= 1_048_576 else { throw StorageFailure.invalidData }
        return NativeCommandResult(status: process.terminationStatus, output: data, diagnostics: diagnostics)
    }
}
