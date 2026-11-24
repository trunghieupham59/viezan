import Foundation
import Testing
@testable import ViezanDomain

@Test func localCatalogReadsSizesAndKeepsOnlyValidModels() throws {
    let data = Data(#"{"models":[{"name":"qwen3:4b","size":2600000000},{"name":"gemma3:1b"},{"name":"bad\nname","size":5},{"name":"neg:1","size":-4},{"name":"qwen3:4b","size":2600000000}]}"#.utf8)
    let sizes = try LocalProvider.parseCatalog(data)
    #expect(sizes == ["ollama:qwen3:4b": 2_600_000_000, "ollama:gemma3:1b": 0, "ollama:neg:1": 0])
    // A size of the wrong type keeps the model; a repeated name keeps its largest size; 1e15 is out of range.
    let odd = try LocalProvider.parseCatalog(Data(#"{"models":[{"name":"a:1","size":"big"},{"name":"b:1","size":7},{"name":"b:1"},{"name":"c:1","size":1e15}]}"#.utf8))
    #expect(odd == ["ollama:a:1": 0, "ollama:b:1": 7, "ollama:c:1": 0])
    #expect(throws: (any Error).self) { try LocalProvider.parseCatalog(Data("{}".utf8)) }
}

@Test func launcherSettingsJumpMatchesTitleAndTermWordsOnly() {
    let resource = NativeResources.shared
    #expect(resource.settingsJump(query: "c", locale: "vi").isEmpty)
    #expect(resource.settingsJump(query: "giao", locale: "vi").map(\.id) == ["appearance", "general"])
    #expect(resource.settingsJump(query: "sao luu", locale: "vi").map(\.id) == ["data"])
    #expect(resource.settingsJump(query: "du lieu", locale: "vi").first?.id == "data")
    #expect(resource.settingsJump(query: "appear", locale: "en").first?.id == "appearance")
    #expect(resource.settingsJump(query: "zzzz", locale: "vi").isEmpty)
    // Every hit names the query in its title or a search term, never only in a description.
    for query in ["ch", "co", "te", "du"] {
        #expect(resource.settingsJump(query: query, locale: "vi").count <= 3)
    }
}

@Test func localModelHeadlineIsTheAppliedProfileOrTheFastest() {
    let gpu = LocalProfile(layers: 99, context: 4096), cpu = LocalProfile(layers: 1, context: 4096)
    let results = [
        LocalMeasurement(id: "cpu", profile: cpu, tokensPerSecond: 12.5),
        LocalMeasurement(id: "gpu", profile: gpu, tokensPerSecond: 48.2),
        LocalMeasurement(id: "mixed", profile: LocalProfile(layers: 20, context: 4096), tokensPerSecond: 90, error: "runtimeComparisonError"),
        LocalMeasurement(id: "zero", profile: LocalProfile(layers: 2, context: 4096), tokensPerSecond: 0),
    ]
    #expect(LocalPerformance.headline(results, selected: nil)?.id == "gpu")
    #expect(LocalPerformance.headline(results, selected: cpu)?.id == "cpu")
    // An applied profile no usable result matches falls back to the fastest; nothing usable is nil.
    #expect(LocalPerformance.headline(results, selected: LocalProfile(layers: 7, context: 2048))?.id == "gpu")
    #expect(LocalPerformance.headline([results[2], results[3]], selected: nil) == nil)
    #expect(LocalPerformance.headline([], selected: gpu) == nil)
}
