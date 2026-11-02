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
            if let error = store.localRuntime.error { noteText(error) }
        }
    }
    // Download status as one string so the row's view tree stays small.
    private var managerProgressText: String {
        var text = store.text(store.modelManager.status)
        if let progress = store.modelManager.progress { text += " · " + String(Int(progress * 100)) + "%" }
        return text
    }
    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var customDownload: String? {
        guard store.modelManager.busy, let model = downloading else { return nil }
        return Self.suggestions.contains(where: { $0.id == model }) ? nil : model
    }
    private var suggestionsCard: some View {
        CardSection(flush: true, title: store.text("suggestedModels")) {
            ForEach(Self.suggestions) { item in suggestionRow(item) }
            otherModelRow
            if let model = customDownload { customDownloadRow(model) }
            if let error = store.modelManager.error ?? store.modelError { noteText(error) }
        }
    }
    private func suggestionRow(_ item: Suggestion) -> some View {
        let have = installed.contains("ollama:" + item.id)
        let active = store.modelManager.busy && downloading == item.id
        let detail = store.text(item.note) + " · " + ByteCountFormatter.string(fromByteCount: item.bytes, countStyle: .file)
        return CardRow(title: item.name + " · " + item.id, detail: detail) {
            if have { StatusBadge(text: store.text("modelInstalled"), tone: .ready) }
            else if active { downloadProgress }
            else if !ollamaRunning { Text(store.text("modelWaitingRuntime")).font(.vzn("smallScale")).foregroundStyle(.secondary) }
            else { downloadButton(item.id).accessibilityIdentifier("download-" + item.id) }
        }
    }
    private func downloadButton(_ model: String) -> some View {
        Button(store.text("download"), systemImage: "arrow.down.circle") { download(model) }.buttonStyle(.vznOutline).disabled(anyBusy)
    }
    private var stopButton: some View {
        Button(store.text("stop"), role: .destructive) { store.modelManager.cancel() }.buttonStyle(.vznQuiet)
    }
    private var downloadProgress: some View {
        VStack(alignment: .trailing, spacing: metric("tight")) {
            HStack(spacing: metric("small")) {
                Text(managerProgressText).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
                stopButton
            }
            if let progress = store.modelManager.progress { ProgressView(value: progress).frame(width: metric("sidebar") - metric("large")) } else { ProgressView().controlSize(.small) }
        }
    }
    private var otherModelRow: some View {
        CardRow(title: store.text("otherModel"), detail: store.text("modelID"), divider: false) {
            TextField(store.text("modelID"), text: $name).textFieldStyle(.roundedBorder).frame(width: metric("sidebar") - metric("large"))
            Button(store.text("download"), systemImage: "arrow.down.circle") { download(trimmedName) }
                .buttonStyle(.vznOutline).disabled(trimmedName.isEmpty || anyBusy || !ollamaRunning)
        }
    }
    private func customDownloadRow(_ model: String) -> some View {
        HStack(spacing: metric("small")) {
            Text(model + " · " + managerProgressText).font(.vzn("smallScale")).foregroundStyle(.secondary)
            Spacer()
            stopButton
        }.padding(.horizontal, metric("inset")).padding(.bottom, metric("inset"))
    }
    private func noteText(_ key: String) -> some View {
        Text(store.text(key)).font(.vzn("smallScale")).foregroundStyle(.secondary).padding(.horizontal, metric("inset")).padding(.bottom, metric("inset"))
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
    private var performance: LocalPerformance { store.localPerformance }
    @ViewBuilder private var performanceCard: some View {
        if performance.busy || performance.error != nil || !performance.results.isEmpty {
            CardSection(title: store.text("benchmarkResults")) {
                if performance.busy { performanceBusyRow }
                if let error = performance.error { Text(store.text(error)).foregroundStyle(.secondary) }
                if !performance.results.isEmpty {
                    Text(nativeModelLabel(performance.model, store: store)).font(.vzn("labelScale", .semibold))
                    performanceTable
                }
            }
        }
    }
    private var performanceBusyRow: some View {
        HStack(spacing: metric("small")) {
            ProgressView().controlSize(.small)
            Text(store.text("running")).foregroundStyle(.secondary)
            Spacer()
            Button(store.text("cancel"), role: .destructive) { performance.cancel() }.buttonStyle(.vznOutline)
        }
    }
    // One table: mode, speed, first token, GPU share; the mode in use is marked, not only colored.
    private var performanceTable: some View {
        Grid(alignment: .leading, horizontalSpacing: metric("inset"), verticalSpacing: metric("small")) {
            GridRow {
                ForEach([store.text("modeLabel"), store.text("tokensPerSecond"), store.text("firstToken"), store.text("gpuShare"), ""], id: \.self) { Text($0).font(.vzn("captionScale")).foregroundStyle(.secondary) }
            }
            GridRow {
                modeCell("auto", label: store.text("voiceAutomatic"))
                dash; dash; dash
                applyButton("auto")
            }
            ForEach(performance.results) { result in resultRow(result) }
        }
    }
    private var dash: some View { Text("–").foregroundStyle(.secondary) }
    private func modeCell(_ mode: String, label: String) -> some View {
        HStack(spacing: metric("small")) {
            Text(label)
            if performance.selectedMode == mode { StatusBadge(text: store.text("inUse"), tone: .ready) }
        }
    }
    private func applyButton(_ mode: String) -> some View {
        Button(store.text("apply")) { performance.select(mode) }.buttonStyle(.vznOutline).disabled(performance.busy || performance.selectedMode == mode)
    }
    private static func number(_ value: Double?, digits: Int) -> String { (value ?? 0).formatted(.number.precision(.fractionLength(digits))) }
    private func resultRow(_ result: LocalMeasurement) -> some View {
        GridRow {
            modeCell(result.id, label: result.id)
            if let error = result.error {
                Text(store.text(error)).foregroundStyle(contentColor("danger", scheme)).gridCellColumns(3)
                Text("")
            } else {
                Text(Self.number(result.tokensPerSecond, digits: 1)).monospacedDigit()
                Text(result.firstTokenMilliseconds.map { Self.number($0, digits: 0) + " ms" } ?? "–").monospacedDigit()
                Text(Self.number(result.gpuPercent, digits: 0) + "%").monospacedDigit()
                applyButton(result.id)
            }
        }
    }
}
