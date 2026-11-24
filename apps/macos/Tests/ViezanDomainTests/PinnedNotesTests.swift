import Foundation
import Testing
@testable import ViezanDomain

@Suite @MainActor final class PinnedNotesTests {
    private let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    private var file: URL { directory.appendingPathComponent("notes.json") }
    deinit { try? FileManager.default.removeItem(at: directory) }

    @Test func roundTripPreservesCreationOrderMetadataAndPermissions() throws {
        let store = PinnedNotes(file: file)
        #expect(store.notes.isEmpty && store.error == nil)
        #expect(!FileManager.default.fileExists(atPath: file.path))
        let first = try #require(store.add(text: "  Xin chào!\n", origin: "translate", detail: "Nhật → Việt"))
        let second = try #require(store.add(text: "My note"))
        let frame = PinnedNote.Frame(x: -140, y: 20, width: 180, height: 120)
        store.setFrame(first.id, frame)

        let notes = PinnedNotes(file: file).notes
        #expect(notes == store.notes)
        #expect(notes.map(\.id) == [first.id, second.id])
        #expect(UUID(uuidString: first.id) != nil)
        #expect(first.text == "Xin chào!" && first.origin == "translate" && first.detail == "Nhật → Việt")
        #expect(notes.first?.frame == frame)
        #expect(second.origin == nil && second.detail == nil && second.frame == nil)
        #expect(try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? Int == 0o600)
        #expect(try FileManager.default.attributesOfItem(atPath: directory.path)[.posixPermissions] as? Int == 0o700)
    }

    @Test func addBoundsCharactersAndKeepsAllFiveNotes() throws {
        let store = PinnedNotes(file: file)
        #expect(PinnedNotes.limit == 5)
        let boundary = String(repeating: "👩🏽‍💻", count: 20_000)
        let first = try #require(store.add(text: " \n" + boundary + "X "))
        #expect(first.text == boundary)
        for index in 2...5 { try #require(store.add(text: String(index)) != nil) }
        let previous = store.notes
        #expect(store.add(text: "6") == nil)
        #expect(store.notes == previous && previous.count == 5)
        #expect(PinnedNotes(file: file).notes == previous)
    }

    @Test func onlyManualNotesCanStartEmpty() throws {
        let store = PinnedNotes(file: file)
        let note = try #require(store.add(text: " \t\n"))
        #expect(note.text.isEmpty)
        #expect(store.add(text: " \n ", origin: "translate") == nil)
        #expect(store.notes == [note] && store.error == nil)
    }

    @Test func reloadDropsBlankManualNotesAndRemainsWritable() throws {
        let store = PinnedNotes(file: file)
        let blank = try #require(store.add(text: "Initial"))
        let kept = try #require(store.add(text: "Keep"))
        store.setText(blank.id, " \n\t")
        let reloaded = PinnedNotes(file: file)
        #expect(reloaded.notes == [kept] && reloaded.error == nil)
        let next = try #require(reloaded.add(text: "Next"))
        #expect(PinnedNotes(file: file).notes == [kept, next])
    }

    @Test func sourcedEditsPersistIncludingEmptyText() throws {
        let store = PinnedNotes(file: file)
        let note = try #require(store.add(text: "Before", origin: "chat"))
        let boundary = "  " + String(repeating: "界", count: 19_998)
        store.setText(note.id, boundary + "X")
        let edited = try #require(PinnedNotes(file: file).notes.first)
        #expect(edited.text == boundary && edited.updated >= note.updated)
        store.setText(note.id, "")
        let frame = PinnedNote.Frame(x: 400, y: -200, width: 300, height: 150)
        store.setFrame(note.id, frame)
        let moved = try #require(PinnedNotes(file: file).notes.first)
        #expect(moved.text == "" && moved.frame == frame)
        #expect(moved.created == note.created && moved.updated >= edited.updated)
    }

    @Test func undoRestoresPositionOnceAndRespectsCapacity() throws {
        let store = PinnedNotes(file: file)
        let original = try ["First", "Middle", "Last"].map { text in try #require(store.add(text: text)) }
        let removed = try #require(store.remove(original[1].id))
        #expect(removed == original[1])
        #expect(PinnedNotes(file: file).notes == [original[0], original[2]])
        store.restore(removed)
        store.restore(removed)
        #expect(PinnedNotes(file: file).notes == original)
        _ = store.remove(removed.id)
        for index in 3...5 { try #require(store.add(text: String(index)) != nil) }
        let full = store.notes
        store.restore(removed)
        #expect(store.notes == full && PinnedNotes(file: file).notes == full)
    }

    @Test func corruptFilesStayUntouchedAndWritesStayBlockedUntilRestart() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let id = UUID().uuidString
        func object(_ id: String, text: String = "original", width: String = "100") -> String {
            #"{"id":"\#(id)","text":"\#(text)","created":1,"updated":1,"frame":{"x":0,"y":0,"width":\#(width),"height":60}}"#
        }
        let valid = object(id)
        let tooMany = (0..<6).map { _ in object(UUID().uuidString) }.joined(separator: ",")
        let cases = ["garbage", "[\(valid),\(valid)]", "[\(object("invalid UUID"))]",
                     "[\(object(id, width: "0"))]", "[\(object(id, width: "NaN"))]",
                     "[\(object(id, text: String(repeating: "x", count: 20_001)))]", "[\(tooMany)]"]
        for json in cases {
            let original = Data(json.utf8)
            try original.write(to: file)
            let store = PinnedNotes(file: file)
            #expect(store.notes.isEmpty && store.error == "storageLoadError")
            #expect(store.add(text: "New") == nil)
            let note = try JSONDecoder().decode(PinnedNote.self, from: Data(valid.utf8))
            store.restore(note)
            #expect(store.notes.isEmpty)
            #expect(try Data(contentsOf: file) == original)
        }
        let blocked = PinnedNotes(file: file)
        try Data("[]".utf8).write(to: file)
        #expect(blocked.add(text: "Still blocked") == nil)
        #expect(PinnedNotes(file: file).add(text: "After restart") != nil)
    }

    @Test func failedWritesPreserveMemoryAndCanBeRetried() throws {
        let store = PinnedNotes(file: file)
        let note = try #require(store.add(text: "Keep"))
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: directory.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path) }
        store.setText(note.id, "Failed edit")
        #expect(store.error == "storageError" && store.notes == [note])
        #expect(store.add(text: "Failed add") == nil)
        #expect(store.remove(note.id) == nil)
        #expect(PinnedNotes(file: file).notes == [note])
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        store.setText(note.id, "Retry")
        #expect(store.error == nil && PinnedNotes(file: file).notes.first?.text == "Retry")
    }

    @Test func unreadableDataIsPreservedEvenWhenTheDirectoryIsWritable() throws {
        let store = PinnedNotes(file: file)
        let note = try #require(store.add(text: "Original"))
        let original = try Data(contentsOf: file)
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: file.path)
        let blocked = PinnedNotes(file: file)
        #expect(blocked.notes.isEmpty && blocked.error == "storageLoadError")
        #expect(blocked.add(text: "Blocked") == nil)
        #expect(store.remove(note.id) == nil && store.notes == [note])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        #expect(try Data(contentsOf: file) == original)
    }
}
