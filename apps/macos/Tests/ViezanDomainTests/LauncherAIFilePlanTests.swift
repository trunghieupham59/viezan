import Foundation
import Testing
@testable import ViezanDomain

struct LauncherAIFilePlanTests {
    @Test func sendsOnlyInstructionAndTrimmedDescription() {
        let term = String(repeating: "見", count: 500)
        for (input, expected) in [("  ngân sách \n", "ngân sách"), ("\n" + term + "余 ", term)] {
            let request = FileSearchPlanner.request(input, model: "ollama:custom:latest")
            #expect(request.model == "ollama:custom:latest")
            #expect(ProviderPrompt.messages(request) == [
                ProviderMessage(role: "system", content: FileSearchPlan.instruction),
                ProviderMessage(role: "user", content: expected)
            ])
        }
    }

    @Test func acceptsExactlyFourThousandCharactersAcrossChunks() async throws {
        let json = #"{"keywords":["budget"]}"#
        let plan = try await FileSearchPlanner.run(FileSearchPlanner.request("budget", model: "ollama:test")) { _, receive in
            await receive(json)
            await receive(String(repeating: " ", count: 4000 - json.count))
        }
        #expect(plan.keywords == ["budget"])
    }

    @Test func stopsReadingAsSoonAsReplyIsTooLong() async {
        await #expect(throws: FileSearchPlanningError.badResponse) {
            try await FileSearchPlanner.run(FileSearchPlanner.request("budget", model: "ollama:test")) { _, receive in
                await receive(String(repeating: "a", count: 4000))
                await receive("x")
                #expect(Task.isCancelled)
                try Task.checkCancellation()
            }
        }
    }

    @Test func rejectsUnusableReplyAndDeadline() async {
        let request = FileSearchPlanner.request("budget", model: "openai:test")
        await #expect(throws: FileSearchPlanningError.badResponse) {
            try await FileSearchPlanner.run(request) { _, receive in await receive("{}") }
        }
        await #expect(throws: FileSearchPlanningError.badResponse) {
            try await FileSearchPlanner.run(request, timeout: .milliseconds(10)) { _, _ in
                try await Task.sleep(for: .seconds(30))
            }
        }
    }

    @Test func preservesProviderFailureAndDistinguishesMissingKey() async {
        let request = FileSearchPlanner.request("budget", model: "openai:test")
        for (failure, expected) in [(CloudFailure.authentication, FileSearchPlanningError.provider("providerAuthError")),
                                    (.network, .provider("providerNetworkError")), (.missingKey, .noModel)] {
            await #expect(throws: expected) {
                try await FileSearchPlanner.run(request) { _, _ in throw failure }
            }
        }
        await #expect(throws: FileSearchPlanningError.provider("providerNetworkError")) {
            try await FileSearchPlanner.run(request) { _, _ in throw URLError(.notConnectedToInternet) }
        }
    }

    @Test func cancellingTheCallerStopsTheProvider() async {
        let (started, signal) = AsyncStream<Void>.makeStream()
        let task = Task {
            try await FileSearchPlanner.run(FileSearchPlanner.request("budget", model: "ollama:test")) { _, _ in
                signal.yield(())
                signal.finish()
                try await Task.sleep(for: .seconds(30))
            }
        }
        for await _ in started { break }
        task.cancel()
        await #expect(throws: CancellationError.self) { try await task.value }
    }

    @MainActor @Test func missingModelLeavesWorkspaceUntouched() async {
        let store = WorkbenchStore(persistence: MemoryPersistence(), automaticProvider: false,
                                   listModels: { _ in [] }, hasKey: { _ in false })
        await store.discoverProviders().value
        let original = store.workspace
        await #expect(throws: FileSearchPlanningError.noModel) {
            try await store.planFileSearch("budget", model: "openai:test")
        }
        #expect(store.workspace == original)
    }

    @Test func summaryOmitsAbsentFilters() throws {
        let en = { (key: String) in NativeResources.shared.text(key, locale: "en") }
        for (filters, expected) in [
            (#","kinds":["pdf","image"],"within_days":14"#, "budget, 見積 · PDF, Images · last 14 days"),
            (#","within_days":14"#, "budget, 見積 · last 14 days"),
            (#","kinds":["pdf"]"#, "budget, 見積 · PDF"),
            ("", "budget, 見積")
        ] {
            let plan = try #require(FileSearchPlan.parse(#"{"keywords":["budget","見積"]\#(filters)}"#))
            #expect(plan.summary(text: en) == expected)
        }
    }

    @Test func generatedLauncherStringsCoverEveryLanguageAndPlaceholder() throws {
        let placeholders = ["launcher_file_content_match": "{meta}", "launcher_ai_files_cloud_note": "{model}",
                            "launcher_ai_files_local_note": "{model}", "launcher_ai_files_thinking": "{model}",
                            "launcher_ai_files_understood": "{summary}", "launcher_ai_files_empty": "{summary}",
                            "launcher_ai_files_announced_done": "{count}", "launcher_ai_files_days": "{count}"]
        let labels = ["launcher_ai_files", "launcher_ai_files_searching", "launcher_ai_files_bad_response",
                      "launcher_ai_files_no_model", "launcher_ai_files_spotlight_unavailable", "quickOpenSettings", "launcher_retry"]
        for locale in ["vi", "en", "ja"] {
            let strings = try #require(NativeResources.shared.locales[locale])
            for key in labels + FileSearchPlan.Kind.allCases.map({ $0 == .folder ? "launcher_folder" : "fileKind_" + $0.rawValue }) {
                #expect(strings[key]?.isEmpty == false, "\(locale) \(key)")
            }
            for (key, placeholder) in placeholders {
                #expect(strings[key]?.contains(placeholder) == true, "\(locale) \(key)")
            }
        }
    }
}
