import Foundation
import CryptoKit

public struct BackupPreview: Sendable {
    public internal(set) var migratedAppearance = false
    public let preferences: Workspace
    public let interpretation: [InterpretationSession]
    public let tasks: [WorkTask]
    public let prompts: [SavedPrompt]
    public let sessions: [Session]
    public let attachments: [ImageAttachment]
    let bytes: [String: Data]
}
public enum NativeBackup {
    private static let limit = 128_000_000
    private static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    public static func export(_ workspace: Workspace, interpretation: [InterpretationSession] = []) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        var exported = workspace
        // An explicit empty list can be restored. Older archives without the field preserve local pins.
        exported.pinnedModels = workspace.pinnedModels ?? []
        let snapshot = try encoder.encode(exported)
        try Interpretation.validateArchive(interpretation)
        let meetingData = try encoder.encode(interpretation)
        var images: [String: ImageAttachment] = [:]
        for session in workspace.sessions {
            for image in (session.images ?? []) + session.messages.flatMap({ $0.images ?? [] }) { images[image.id] = image }
        }
        for task in workspace.tasks { for image in task.request.messages?.flatMap({ $0.images ?? [] }) ?? [] { images[image.id] = image } }
        var records: [[String: Any]] = [], size = snapshot.count + meetingData.count
        for image in images.values.sorted(by: { $0.id < $1.id }) {
            let data = try Attachments.data(image); size += data.count
            guard size <= limit / 2 else { throw StorageFailure.invalidData }
            records.append(["id": image.id, "name": image.name, "mime": image.mime, "data": data.base64EncodedString(), "sha256": hash(data)])
        }
        let data = try JSONSerialization.data(withJSONObject: ["format": "viezan-native-backup", "version": 1,
            "interpretation": meetingData.base64EncodedString(), "interpretationSHA256": hash(meetingData), "workspace": snapshot.base64EncodedString(), "sha256": hash(snapshot), "attachments": records], options: [.sortedKeys])
        guard data.count <= limit else { throw StorageFailure.invalidData }; return data
    }
    public static func preview(_ data: Data) throws -> BackupPreview {
        guard data.count <= limit, let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              root["format"] as? String == "viezan-native-backup", root["version"] as? Int == 1,
              let encoded = root["workspace"] as? String, let snapshot = Data(base64Encoded: encoded),
              hash(snapshot) == root["sha256"] as? String, let records = root["attachments"] as? [[String: Any]] else { throw StorageFailure.invalidData }
        var meetings: [InterpretationSession] = []
        if root["interpretation"] != nil {
            guard let encoded = root["interpretation"] as? String, let bytes = Data(base64Encoded: encoded), hash(bytes) == root["interpretationSHA256"] as? String else { throw StorageFailure.invalidData }
            meetings = try JSONDecoder().decode([InterpretationSession].self, from: bytes); try Interpretation.validateArchive(meetings)
        }
        let original = try JSONDecoder().decode(Workspace.self, from: snapshot)
        let workspace = try original.upgrading().validated()
        let changedAppearance = original.appearance?.preset.map { $0 != workspace.preferences.preset } ?? false
        var images: [ImageAttachment] = [], bytes: [String: Data] = [:]
        for record in records {
            guard let id = record["id"] as? String, UUID(uuidString: id) != nil, bytes[id] == nil,
                  let name = record["name"] as? String, let mime = record["mime"] as? String,
                  ["image/jpeg", "image/png", "image/webp", "image/gif"].contains(mime),
                  let encoded = record["data"] as? String, let data = Data(base64Encoded: encoded),
                  !data.isEmpty, data.count <= 20_000_000, hash(data) == record["sha256"] as? String else { throw StorageFailure.invalidData }
            images.append(ImageAttachment(id: id, name: name, mime: mime)); bytes[id] = data
        }
        for session in workspace.sessions {
            for image in (session.images ?? []) + session.messages.flatMap({ $0.images ?? [] }) {
                guard images.contains(where: image.sameFile) else { throw StorageFailure.invalidData }
            }
        }
        for task in workspace.tasks { for image in task.request.messages?.flatMap({ $0.images ?? [] }) ?? [] { guard images.contains(where: image.sameFile) else { throw StorageFailure.invalidData } } }
        return BackupPreview(migratedAppearance: changedAppearance, preferences: workspace, interpretation: meetings, tasks: workspace.tasks.map { task in var copy = task; if copy.status == .running { copy.status = .interrupted }; return copy }, prompts: workspace.prompts ?? [], sessions: workspace.sessions, attachments: images, bytes: bytes)
    }
    public static func materialize(_ preview: BackupPreview) throws {
        var installed: [Attachments.InstalledFile] = []
        do { try materialize(preview, in: Attachments.directory, installed: &installed) }
        catch { try discard(installed); throw error }
    }
    static func materialize(_ preview: BackupPreview, in directory: URL, installed: inout [Attachments.InstalledFile]) throws {
        for image in preview.attachments {
            guard let data = preview.bytes[image.id] else { throw StorageFailure.invalidData }
            if let file = try Attachments.restore(image, data: data, in: directory) { installed.append(file) }
        }
    }
    static func discard(_ installed: [Attachments.InstalledFile]) throws {
        var failure: Error?
        for file in installed {
            do { try file.discard() }
            catch { failure = error }
        }
        if let failure { throw failure }
    }
}
