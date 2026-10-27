import SwiftUI
import ViezanDomain
struct LocalModelSettings: View {
    @Bindable var store: WorkbenchStore
    @State private var name = ""
    private var parallel: Int { store.workspace.runtime?.parallel ?? 1 }
    private var context: Int { store.workspace.runtime?.context ?? 4096 }
    @State private var confirmComparison = false
    @State private var deletion: String?
    private func resultSummary(id: String, tokens: Double?, gpu: Double?) -> String {
        let speed = (tokens ?? 0).formatted(.number.precision(.fractionLength(1)))
        let percentage = (gpu ?? 0).formatted(.number.precision(.fractionLength(1)))
        return "\(id) · \(speed) token/s · GPU \(percentage)%"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            Button(store.text("installRuntime")) { NSWorkspace.shared.open(URL(string: "https://ollama.com/download")!) }
            Text(store.text("runtimeHint")).foregroundStyle(.secondary)
            Text("CPU: \(store.localRuntime.processors) · " + ByteCountFormatter.string(fromByteCount: Int64(store.localRuntime.memory), countStyle: .memory))
            Picker(store.text("runtimeParallel"), selection: Binding(get: { parallel }, set: { store.setRuntime(parallel: $0, context: context) })) { ForEach([1, 2, 4], id: \.self) { Text(String($0)).tag($0) } }.disabled(store.localRuntime.owned || store.localRuntime.busy)
            Picker(store.text("runtimeContext"), selection: Binding(get: { context }, set: { store.setRuntime(parallel: parallel, context: $0) })) { ForEach([2048, 4096, 8192, 16384, 32768], id: \.self) { Text(String($0)).tag($0) } }.disabled(store.localRuntime.owned || store.localRuntime.busy)
            HStack {
                Button(store.text("runtimeStart")) { Task { await store.localRuntime.start(parallel: parallel, context: context); await store.refreshModels(provider: "ollama") } }.disabled(store.localRuntime.owned || store.localRuntime.busy)
                if store.localRuntime.owned { Button(store.text("runtimeStop"), role: .destructive) { store.localRuntime.stop() } }
                Text(store.localRuntime.version)
            }
            if let error = store.localRuntime.error { Text(store.text(error)).foregroundStyle(.secondary) }
            Divider()
            Text(store.text("localModelsHint")).foregroundStyle(.secondary)
            TextField(store.text("modelID"), text: $name).textFieldStyle(.roundedBorder)
            HStack {
                Button(store.text("downloadModel")) { store.modelManager.run(model: name) { await store.refreshModels(provider: "ollama") } }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.modelManager.busy)
                Button(store.text("refreshModels")) { Task { await store.refreshModels(provider: "ollama") } }.disabled(store.loadingModels)
                if store.modelManager.busy { Button(store.text("stop"), role: .destructive) { store.modelManager.cancel() } }
            }
            if store.modelManager.busy {
                if let progress = store.modelManager.progress { ProgressView(value: progress) } else { ProgressView() }
            }
            if !store.modelManager.status.isEmpty { Text(store.text(store.modelManager.status)).textSelection(.enabled) }
            if let error = store.modelManager.error ?? store.modelError { Text(store.text(error)).foregroundStyle(.secondary) }
            if store.localPerformance.busy {
                ProgressView(); Button(store.text("cancel"), role: .destructive) { store.localPerformance.cancel() }
            }
            if let error = store.localPerformance.error { Text(store.text(error)) }
            if !store.localPerformance.results.isEmpty {
                Text(store.localPerformance.model).font(.headline)
                Button(store.text("voiceAutomatic")) { store.localPerformance.select("auto") }.disabled(store.localPerformance.busy)
                ForEach(store.localPerformance.results) { result in
                    if let error = result.error { Text(result.id + ": " + store.text(error)) }
                    else {
                        HStack {
                            Text(resultSummary(id: result.id, tokens: result.tokensPerSecond, gpu: result.gpuPercent))
                            Button(store.text("apply")) { store.localPerformance.select(result.id) }.disabled(store.localPerformance.busy)
                        }
                    }
                }
            }
            ForEach(store.localModels.filter { $0.hasPrefix("ollama:") }, id: \.self) { model in
                HStack {
                    Text(model).textSelection(.enabled); Spacer()
                    Button(store.text("runtimeCompare")) { store.localPerformance.selectModel(model); confirmComparison = true }.disabled(store.localPerformance.busy || store.modelManager.busy || store.interpretation.busy || store.workspace.tasks.contains { $0.status == .running && $0.request.model.hasPrefix("ollama:") })
                    Button(store.text("deleteModel"), role: .destructive) { deletion = String(model.dropFirst(7)) }.disabled(store.modelManager.busy)
                }
            }
        }
        .confirmationDialog(store.text("runtimeCompare"), isPresented: $confirmComparison) {
            Button(store.text("start")) { store.localPerformance.compare() }
        } message: { Text(store.text("runtimeCompareHint")) }
        .task { await store.localRuntime.refresh() }
        .confirmationDialog(store.text("deleteModelConfirm"), isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), titleVisibility: .visible) {
            Button(store.text("deleteModel"), role: .destructive) {
                if let model = deletion { store.modelManager.run(model: model, delete: true) { await store.refreshModels(provider: "ollama") } }; deletion = nil
            }
        } message: { Text(deletion ?? "") }
    }
}
