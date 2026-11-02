import SwiftUI
import ViezanDomain

// Local AI: which runtimes answer, the runtime's own settings, a short list of
// suggested Ollama models with live download progress, and what is installed.
struct LocalModelSettings: View {
    @Bindable var store: WorkbenchStore
    @State private var name = ""
    @State private var confirmComparison = false
    @State private var deletion: String?
    @State private var downloading: String?
    @Environment(\.colorScheme) private var scheme
    private var parallel: Int { store.workspace.runtime?.parallel ?? 1 }
    private var context: Int { store.workspace.runtime?.context ?? 4096 }
    private struct Suggestion: Identifiable { let id: String; let name: String; let note: String; let bytes: Int64 }
    private static let suggestions = [
        Suggestion(id: "qwen3:4b", name: "Qwen3 4B", note: "suggestion_balanced", bytes: 2_600_000_000),
        Suggestion(id: "gemma3:4b", name: "Gemma 3 4B", note: "suggestion_vision", bytes: 3_300_000_000),
        Suggestion(id: "llama3.2:3b", name: "Llama 3.2 3B", note: "suggestion_light", bytes: 2_000_000_000),
        Suggestion(id: "qwen2.5:7b", name: "Qwen2.5 7B", note: "suggestion_quality", bytes: 4_700_000_000),
    ]
    private var installed: [String] { store.localModels.filter { $0.hasPrefix("ollama:") } }
    private var ollamaRunning: Bool { store.providers.models["ollama"] != nil }
    private var anyBusy: Bool { store.modelManager.busy || store.localPerformance.busy }
    private func resultSummary(id: String, tokens: Double?, gpu: Double?) -> String {
        let speed = (tokens ?? 0).formatted(.number.precision(.fractionLength(1)))
        let percentage = (gpu ?? 0).formatted(.number.precision(.fractionLength(1)))
        return "\(id) · \(speed) token/s · GPU \(percentage)%"
    }
    private func download(_ model: String) {
        downloading = model
        store.modelManager.run(model: model) {
            downloading = nil
            ToastCenter.shared.show(store.text("modelDownloaded").replacingOccurrences(of: "{model}", with: model), key: "local-model")
            store.discoverProviders()
        }
    }
    private func remove(_ model: String) {
        store.modelManager.run(model: model, delete: true) {
            ToastCenter.shared.show(store.text("modelRemoved").replacingOccurrences(of: "{model}", with: model), key: "local-model")
            store.discoverProviders()
        }
    }
    var body: some View {
        // Split into cards so an older Xcode can type-check each part on its own (CI uses latest-stable).
        VStack(alignment: .leading, spacing: metric("inset")) {
            runtimesCard
            runtimeCard
            suggestionsCard
            installedCard
            performanceCard
        }
        .confirmationDialog(store.text("runtimeCompare"), isPresented: $confirmComparison) {
            Button(store.text("start")) { store.localPerformance.compare() }
        } message: { Text(store.text("runtimeCompareHint")) }
        .task { await store.localRuntime.refresh() }
        .confirmationDialog(store.text("deleteModelConfirm"), isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), titleVisibility: .visible) {
            Button(store.text("deleteModel"), role: .destructive) { if let model = deletion { remove(model) }; deletion = nil }
        } message: { Text(deletion ?? "") }
    }
    private var runtimesCard: some View {
        CardSection(flush: true, title: store.text("localRuntimes")) {
            let runtimes = [("ollama", "Ollama"), ("lmstudio", "LM Studio"), ("llamacpp", "llama.cpp")]
            ForEach(runtimes, id: \.0) { id, name in
                let models = store.providers.models[id]
                CardRow(title: name, detail: id == "ollama" ? store.localRuntime.version : "", divider: id != runtimes.last?.0) {
                    StatusBadge(text: models.map { store.text("runtimeRunning").replacingOccurrences(of: "{count}", with: String($0.count)) } ?? store.text("runtimeNotRunning"), tone: models == nil ? .idle : .ready)
                    if id == "ollama" && models == nil && !store.localRuntime.available {
                        Button(store.text("installRuntime")) { NSWorkspace.shared.open(URL(string: "https://ollama.com/download")!) }.buttonStyle(.vznOutline)
                    }
                }
            }
        }
    }
    private var runtimeCard: some View {
        CardSection(flush: true, title: store.text("runtimeSettings")) {
            CardRow(title: store.text("thisDevice"), detail: store.text("runtimeHint")) {
                Text("CPU \(store.localRuntime.processors) · " + ByteCountFormatter.string(fromByteCount: Int64(store.localRuntime.memory), countStyle: .memory)).foregroundStyle(.secondary)
            }
            CardRow(title: store.text("runtimeParallel")) {
                Picker(store.text("runtimeParallel"), selection: Binding(get: { parallel }, set: { store.setRuntime(parallel: $0, context: context) })) { ForEach([1, 2, 4], id: \.self) { Text(String($0)).tag($0) } }
                    .labelsHidden().fixedSize().disabled(store.localRuntime.owned || store.localRuntime.busy)
            }
            CardRow(title: store.text("runtimeContext"), divider: false) {
                Picker(store.text("runtimeContext"), selection: Binding(get: { context }, set: { store.setRuntime(parallel: parallel, context: $0) })) { ForEach([2048, 4096, 8192, 16384, 32768], id: \.self) { Text(String($0)).tag($0) } }
                    .labelsHidden().fixedSize().disabled(store.localRuntime.owned || store.localRuntime.busy)
                Button(store.text("runtimeStart")) { Task { await store.localRuntime.start(parallel: parallel, context: context); store.discoverProviders() } }
                    .buttonStyle(.vznOutline).disabled(store.localRuntime.owned || store.localRuntime.busy || !store.localRuntime.available)
                if store.localRuntime.owned { Button(store.text("runtimeStop"), role: .destructive) { store.localRuntime.stop(); store.discoverProviders() }.buttonStyle(.vznOutline) }
            }
            if let error = store.localRuntime.error { Text(store.text(error)).font(.vzn("smallScale")).foregroundStyle(.secondary).padding(.horizontal, metric("inset")).padding(.bottom, metric("inset")) }
        }
        // Suggested models: one Download per row; the row that is downloading shows its progress.
    }
    private var suggestionsCard: some View {
        CardSection(flush: true, title: store.text("suggestedModels")) {
            ForEach(Self.suggestions) { item in
                let have = installed.contains("ollama:" + item.id)
                let active = store.modelManager.busy && downloading == item.id
                CardRow(title: item.name + " · " + item.id, detail: store.text(item.note) + " · " + ByteCountFormatter.string(fromByteCount: item.bytes, countStyle: .file)) {
                    if have { StatusBadge(text: store.text("modelInstalled"), tone: .ready) }
                    else if active {
                        VStack(alignment: .trailing, spacing: metric("tight")) {
                            HStack(spacing: metric("small")) {
                                Text(store.text(store.modelManager.status) + (store.modelManager.progress.map { " · " + String(Int($0 * 100)) + "%" } ?? "")).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
                                Button(store.text("stop"), role: .destructive) { store.modelManager.cancel() }.buttonStyle(.vznQuiet)
                            }
                            if let progress = store.modelManager.progress { ProgressView(value: progress).frame(width: metric("sidebar") - metric("large")) } else { ProgressView().controlSize(.small) }
                        }
                    } else if !ollamaRunning { Text(store.text("modelWaitingRuntime")).font(.vzn("smallScale")).foregroundStyle(.secondary) }
                    else { Button(store.text("download"), systemImage: "arrow.down.circle") { download(item.id) }.buttonStyle(.vznOutline).disabled(anyBusy).accessibilityIdentifier("download-" + item.id) }
                }
            }
            CardRow(title: store.text("otherModel"), detail: store.text("modelID"), divider: false) {
                TextField(store.text("modelID"), text: $name).textFieldStyle(.roundedBorder).frame(width: metric("sidebar") - metric("large"))
                Button(store.text("download"), systemImage: "arrow.down.circle") { download(name.trimmingCharacters(in: .whitespacesAndNewlines)) }
                    .buttonStyle(.vznOutline).disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || anyBusy || !ollamaRunning)
            }
            if store.modelManager.busy, let model = downloading, !Self.suggestions.contains(where: { $0.id == model }) {
                HStack(spacing: metric("small")) {
                    Text(model + " · " + store.text(store.modelManager.status) + (store.modelManager.progress.map { " · " + String(Int($0 * 100)) + "%" } ?? "")).font(.vzn("smallScale")).foregroundStyle(.secondary)
                    Spacer(); Button(store.text("stop"), role: .destructive) { store.modelManager.cancel() }.buttonStyle(.vznQuiet)
                }.padding(.horizontal, metric("inset")).padding(.bottom, metric("inset"))
            }
            if let error = store.modelManager.error ?? store.modelError { Text(store.text(error)).font(.vzn("smallScale")).foregroundStyle(.secondary).padding(.horizontal, metric("inset")).padding(.bottom, metric("inset")) }
        }
    }
    private var installedCard: some View {
        CardSection(flush: true, title: store.text("downloadedModels")) {
            if installed.isEmpty { Text(store.text("noLocalModels")).foregroundStyle(.secondary).padding(metric("inset")) }
            ForEach(installed, id: \.self) { model in
                CardRow(title: nativeModelLabel(model, store: store), detail: model, divider: model != installed.last) {
                    Button(store.text("runtimeCompare")) { store.localPerformance.selectModel(model); confirmComparison = true }
                        .buttonStyle(.vznOutline).disabled(anyBusy || store.interpretation.busy || store.workspace.tasks.contains { $0.status == .running && $0.request.model.hasPrefix("ollama:") })
                    Button(store.text("deleteModel"), role: .destructive) { deletion = String(model.dropFirst(7)) }.buttonStyle(.vznQuiet).disabled(store.modelManager.busy)
                }
            }
            HStack {
                Button(store.text("refreshModels")) { Task { await store.refreshModels(provider: "ollama") } }.buttonStyle(.vznQuiet).disabled(store.loadingModels)
                if store.loadingModels { ProgressView().controlSize(.small) }
            }.padding(.horizontal, metric("small")).padding(.vertical, metric("small"))
        }
    }
    @ViewBuilder private var performanceCard: some View {
        if store.localPerformance.busy || store.localPerformance.error != nil || !store.localPerformance.results.isEmpty {
            CardSection(title: store.text("benchmarkResults")) {
                if store.localPerformance.busy {
                    HStack(spacing: metric("small")) { ProgressView().controlSize(.small); Text(store.text("running")).foregroundStyle(.secondary); Spacer(); Button(store.text("cancel"), role: .destructive) { store.localPerformance.cancel() }.buttonStyle(.vznOutline) }
                }
                if let error = store.localPerformance.error { Text(store.text(error)).foregroundStyle(.secondary) }
                if !store.localPerformance.results.isEmpty {
                    let performance = store.localPerformance, mode = performance.selectedMode
                    Text(nativeModelLabel(performance.model, store: store)).font(.vzn("labelScale", .semibold))
                    // One table: mode, speed, first token, GPU share; the mode in use is marked, not only colored.
                    Grid(alignment: .leading, horizontalSpacing: metric("inset"), verticalSpacing: metric("small")) {
                        GridRow {
                            ForEach([store.text("modeLabel"), store.text("tokensPerSecond"), store.text("firstToken"), store.text("gpuShare"), ""], id: \.self) { Text($0).font(.vzn("captionScale")).foregroundStyle(.secondary) }
                        }
                        GridRow {
                            HStack(spacing: metric("small")) { Text(store.text("voiceAutomatic")); if mode == "auto" { StatusBadge(text: store.text("inUse"), tone: .ready) } }
                            Text("–").foregroundStyle(.secondary); Text("–").foregroundStyle(.secondary); Text("–").foregroundStyle(.secondary)
                            Button(store.text("apply")) { performance.select("auto") }.buttonStyle(.vznOutline).disabled(performance.busy || mode == "auto")
                        }
                        ForEach(performance.results) { result in
                            GridRow {
                                HStack(spacing: metric("small")) { Text(result.id); if mode == result.id { StatusBadge(text: store.text("inUse"), tone: .ready) } }
                                if let error = result.error {
                                    Text(store.text(error)).foregroundStyle(contentColor("danger", scheme)).gridCellColumns(3)
                                    Text("")
                                } else {
                                    Text((result.tokensPerSecond ?? 0).formatted(.number.precision(.fractionLength(1)))).monospacedDigit()
                                    Text(result.firstTokenMilliseconds.map { $0.formatted(.number.precision(.fractionLength(0))) + " ms" } ?? "–").monospacedDigit()
                                    Text((result.gpuPercent ?? 0).formatted(.number.precision(.fractionLength(0))) + "%").monospacedDigit()
                                    Button(store.text("apply")) { performance.select(result.id) }.buttonStyle(.vznOutline).disabled(performance.busy || mode == result.id)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
