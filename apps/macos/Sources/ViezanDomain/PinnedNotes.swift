import Foundation
import Observation

public struct PinnedNote: Codable, Equatable, Identifiable, Sendable {
    public struct Frame: Codable, Equatable, Sendable {
        public let x, y, width, height: Double

        public init(x: Double, y: Double, width: Double, height: Double) {
            self.x = x
            self.y = y
            self.width = width
            self.height = height
        }

        fileprivate var isValid: Bool {
            x.isFinite && y.isFinite && width.isFinite && height.isFinite && width > 0 && height > 0
        }
    }

    public let id: String
    public var text: String
    public let origin: String?
    public let detail: String?
    public var frame: Frame?
    public let created: Double
    public var updated: Double
}

@MainActor @Observable public final class PinnedNotes {
    public static let limit = 5
    public static let textLimit = 20_000
    public private(set) var notes: [PinnedNote] = []
    public private(set) var error: String?

    private let file: URL
    @ObservationIgnored private var loadBlocked = false
    @ObservationIgnored private var savedData: Data?

    public init(file: URL? = nil) {
        self.file = file ?? FilePersistence.previewURL().deletingLastPathComponent().appendingPathComponent("notes.json")
        do {
            guard let data = try Self.read(self.file) else { return }
            let stored = try JSONDecoder().decode([PinnedNote].self, from: data)
            guard Self.isValid(stored) else { throw StorageFailure.invalidData }
            notes = stored.filter { $0.origin != nil || !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                .sorted { $0.created < $1.created }
            savedData = data
        } catch {
            loadBlocked = true
            self.error = "storageLoadError"
        }
    }

    @discardableResult public func add(text: String, origin: String? = nil, detail: String? = nil) -> PinnedNote? {
        guard !loadBlocked, notes.count < Self.limit else { return nil }
        let text = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.textLimit))
        guard origin == nil || !text.isEmpty else { return nil }
        let now = Date().timeIntervalSince1970
        let created = max(now, notes.last?.created.nextUp ?? now)
        let note = PinnedNote(id: UUID().uuidString, text: text, origin: origin, detail: detail,
                              frame: nil, created: created, updated: created)
        return save(notes + [note]) ? note : nil
    }

    public func setText(_ id: String, _ text: String) {
        update(id) { $0.text = String(text.prefix(Self.textLimit)) }
    }

    public func setFrame(_ id: String, _ frame: PinnedNote.Frame) {
        guard frame.isValid else { return }
        update(id) { $0.frame = frame }
    }

    private func update(_ id: String, _ edit: (inout PinnedNote) -> Void) {
        guard let index = notes.firstIndex(where: { $0.id == id }) else { return }
        var next = notes
        edit(&next[index])
        next[index].updated = max(notes[index].updated, Date().timeIntervalSince1970)
        save(next)
    }

    @discardableResult public func remove(_ id: String) -> PinnedNote? {
        guard let index = notes.firstIndex(where: { $0.id == id }) else { return nil }
        var next = notes
        let removed = next.remove(at: index)
        return save(next) ? removed : nil
    }

    public func restore(_ note: PinnedNote) {
        let next = notes + [note]
        guard !loadBlocked, Self.isValid(next) else { return }
        save(next.sorted { $0.created < $1.created })
    }

    private static func isValid(_ notes: [PinnedNote]) -> Bool {
        var ids = Set<UUID>()
        return notes.count <= limit && notes.allSatisfy { note in
            guard let id = UUID(uuidString: note.id), ids.insert(id).inserted else { return false }
            return note.text.count <= textLimit && note.frame?.isValid != false
                && note.created.isFinite && note.updated.isFinite
        }
    }

    private static func read(_ file: URL) throws -> Data? {
        let attributes: [FileAttributeKey: Any]
        do { attributes = try FileManager.default.attributesOfItem(atPath: file.path) }
        catch let error as CocoaError where error.code == .fileReadNoSuchFile { return nil }
        guard attributes[.type] as? FileAttributeType == .typeRegular else { throw StorageFailure.invalidData }
        return try Data(contentsOf: file)
    }

    @discardableResult private func save(_ next: [PinnedNote]) -> Bool {
        guard !loadBlocked else { return false }
        let manager = FileManager.default
        let directory = file.deletingLastPathComponent()
        do {
            let data = try JSONEncoder().encode(next)
            try manager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            // Write privately, then publish the complete file in a single rename.
            let pending = directory.appendingPathComponent(UUID().uuidString)
            let descriptor = open(pending.path, O_WRONLY | O_CREAT | O_EXCL, 0o600)
            guard descriptor >= 0 else { throw StorageFailure.invalidData }
            defer { try? manager.removeItem(at: pending) }
            let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
            try handle.write(contentsOf: data)
            try handle.close()
            guard try Self.read(file) == savedData, rename(pending.path, file.path) == 0 else { throw StorageFailure.invalidData }
            savedData = data
            notes = next
            error = nil
            return true
        } catch {
            self.error = "storageError"
            return false
        }
    }
}
