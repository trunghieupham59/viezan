import Foundation
import Testing
@testable import ViezanDomain

private func bundle(_ root: URL, _ name: String, version: String, identifier: String = "app.viezan.test", marker: String) throws -> URL {
    let app = root.appendingPathComponent(name), contents = app.appendingPathComponent("Contents")
    try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
    try (["CFBundleShortVersionString": version, "CFBundleIdentifier": identifier] as NSDictionary).write(to: contents.appendingPathComponent("Info.plist"))
    try Data(marker.utf8).write(to: contents.appendingPathComponent("marker"))
    return app
}
private func marker(_ app: URL) -> String? { try? String(contentsOf: app.appendingPathComponent("Contents/marker"), encoding: .utf8) }

@Test func updateSwapInstallsOnlyThisAppAtTheVerifiedVersion() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true); defer { try? FileManager.default.removeItem(at: root) }
    let target = try bundle(root, "Viezan.app", version: "1.0.0", marker: "old"), previous = root.appendingPathComponent("previous.app")

    // A different app or another version never replaces the installed one.
    for (version, identifier) in [("2.0.1", "app.viezan.test"), ("2.0.0", "app.other")] {
        let wrong = try bundle(root, "wrong-\(version)-\(identifier).app", version: version, identifier: identifier, marker: "wrong")
        #expect(throws: (any Error).self) { try NativeUpdates.swap(target, with: wrong, previous: previous, version: "2.0.0", identifier: "app.viezan.test") }
        #expect(marker(target) == "old" && !FileManager.default.fileExists(atPath: previous.path))
    }
    #expect(throws: (any Error).self) { try NativeUpdates.swap(target, with: root.appendingPathComponent("missing.app"), previous: previous, version: "2.0.0", identifier: "app.viezan.test") }
    #expect(marker(target) == "old")

    let fresh = try bundle(root, "new.app", version: "2.0.0", marker: "new")
    try NativeUpdates.swap(target, with: fresh, previous: previous, version: "2.0.0", identifier: "app.viezan.test")
    #expect(marker(target) == "new" && marker(previous) == "old" && !FileManager.default.fileExists(atPath: fresh.path))
}

@Test func updateInstallsInPlaceOnlyWhereTheAppCanBeReplaced() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path); try? FileManager.default.removeItem(at: root) }
    let app = try bundle(root, "Viezan.app", version: "1.0.0", marker: "old")
    #expect(NativeUpdates.installTarget(app) == app)
    #expect(NativeUpdates.installTarget(root.appendingPathComponent("Viezan")) == nil)
    #expect(NativeUpdates.installTarget(URL(fileURLWithPath: "/private/var/folders/x/AppTranslocation/1/d/Viezan.app")) == nil)
    try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: root.path)
    #expect(NativeUpdates.installTarget(app) == nil)
}

@Test func updateReplacesTheAppFromADiskImage() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), disk = root.appendingPathComponent("disk")
    try FileManager.default.createDirectory(at: disk, withIntermediateDirectories: true); defer { try? FileManager.default.removeItem(at: root) }
    let target = try bundle(root, "Viezan.app", version: "1.0.0", marker: "old"), image = root.appendingPathComponent("update.dmg")
    _ = try bundle(disk, "Viezan.app", version: "2.0.0", marker: "new")
    #expect(try NativeCommand.run(URL(fileURLWithPath: "/usr/bin/hdiutil"), ["create", "-volname", "Viezan", "-srcfolder", disk.path, "-format", "UDZO", image.path], timeout: 120).status == 0)

    let staging = try NativeUpdates.replace(target, image: image, version: "2.0.0", identifier: "app.viezan.test"); defer { try? FileManager.default.removeItem(at: staging) }
    #expect(marker(target) == "new" && marker(staging.appendingPathComponent("previous.app")) == "old")
    // The image is detached again: nothing is left mounted in the staging folder.
    #expect((try? FileManager.default.contentsOfDirectory(atPath: staging.appendingPathComponent("image").path))?.isEmpty != false)

    // A package for another version leaves the installed app alone and cleans up after itself.
    #expect(throws: (any Error).self) { try NativeUpdates.replace(target, image: image, version: "2.0.1", identifier: "app.viezan.test") }
    #expect(marker(target) == "new")
}

@Test func updateRelaunchWaitsForTheOldProcessBeforeCleaningUp() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), staging = root.appendingPathComponent("staging")
    try FileManager.default.createDirectory(at: staging.appendingPathComponent("previous.app"), withIntermediateDirectories: true); defer { try? FileManager.default.removeItem(at: root) }
    let old = Process(); old.executableURL = URL(fileURLWithPath: "/bin/sleep"); old.arguments = ["60"]; try old.run(); defer { old.terminate() }
    // The target does not exist, so nothing opens on the machine running the test.
    try NativeUpdates.relaunch(root.appendingPathComponent("Missing.app"), removing: staging, after: old.processIdentifier)
    try await Task.sleep(for: .milliseconds(800))
    #expect(FileManager.default.fileExists(atPath: staging.path))
    // Ended here rather than by its own timer: a loaded machine can take longer than the pause above.
    old.terminate(); old.waitUntilExit()
    for _ in 0..<100 where FileManager.default.fileExists(atPath: staging.path) { try await Task.sleep(for: .milliseconds(100)) }
    #expect(!FileManager.default.fileExists(atPath: staging.path))
}
