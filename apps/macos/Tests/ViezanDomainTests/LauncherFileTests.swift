import Foundation
import Testing
@testable import ViezanDomain

@Test func launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens() throws {
    let manager = FileManager.default
    let home = manager.temporaryDirectory.appendingPathComponent("viezan-launcher-" + UUID().uuidString).resolvingSymlinksInPath()
    defer { try? manager.removeItem(at: home) }
    for folder in ["Documents/Reports", ".cache", "project/node_modules"] { try manager.createDirectory(at: home.appendingPathComponent(folder), withIntermediateDirectories: true) }
    for file in ["Documents/plan.md", ".cache/plan.md", "project/node_modules/plan.md"] { try Data("x".utf8).write(to: home.appendingPathComponent(file)) }
    let stamp = Date(timeIntervalSince1970: 1_700_000_000)
    try manager.setAttributes([.modificationDate: stamp], ofItemAtPath: home.appendingPathComponent("Documents/plan.md").path)
    try manager.createSymbolicLink(at: home.appendingPathComponent("Documents/link.md"), withDestinationURL: home.appendingPathComponent("Documents/plan.md"))
    func file(_ relative: String) -> LauncherFile? { LauncherFiles.file(at: home.appendingPathComponent(relative).path, home: home.path) }
    let plan = try #require(file("Documents/plan.md"))
    #expect(plan.name == "plan.md" && !plan.isDirectory && plan.modified == 1_700_000_000)
    #expect(file("Documents/Reports")?.isDirectory == true)
    #expect(file(".cache/plan.md") == nil)
    #expect(file("project/node_modules/plan.md") == nil)
    #expect(file("Documents/link.md") == nil)
    #expect(file("Documents/missing.md") == nil)
    // A package opens like a file; a home folder whose own path has a skipped name still lists files.
    try manager.createDirectory(at: home.appendingPathComponent("Documents/Notes.rtfd"), withIntermediateDirectories: true)
    #expect(file("Documents/Notes.rtfd")?.isDirectory == false)
    let odd = home.appendingPathComponent("build")
    try manager.createDirectory(at: odd.appendingPathComponent("Documents"), withIntermediateDirectories: true)
    try Data("x".utf8).write(to: odd.appendingPathComponent("Documents/a.txt"))
    #expect(LauncherFiles.file(at: odd.appendingPathComponent("Documents/a.txt").path, home: odd.path) != nil)
    // Outside the home folder is never a result.
    #expect(LauncherFiles.file(at: "/etc/hosts", home: home.path) == nil)
}
