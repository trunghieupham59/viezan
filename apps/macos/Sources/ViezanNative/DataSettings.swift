import SwiftUI
import UniformTypeIdentifiers
import ViezanDomain
struct DataSettings: View {
    @Bindable var store: WorkbenchStore
    @State private var keep = 100
    @State private var trim = false
    @State private var busy = false
    @State private var preview: BackupPreview?
    @State private var error: String?
    @State private var completed = false
    @State private var restorePreferences = false
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            UsageSettings(store: store)
            Picker(store.text("historyKeep"), selection: $keep) { ForEach([20, 100, 500, 1000], id: \.self) { Text(String($0)).tag($0) } }
            Button(store.text("trimHistory"), role: .destructive) { trim = true }.disabled(busy || store.loadBlocked || store.workspace.tasks.contains { $0.status == .running })
                .confirmationDialog(store.text("trimHistoryConfirm"), isPresented: $trim) {
                    Button(store.text("trimHistory"), role: .destructive) { do { try store.trimHistory(keeping: keep); completed = true } catch { self.error = "dataOperationError" } }
                }
            Text(store.text("backupDescription")).foregroundStyle(.secondary)
            HStack {
                Button(store.text("exportBackup"), action: export).disabled(busy || store.loadBlocked)
                Button(store.text("importBackup"), action: inspect).disabled(busy || store.loadBlocked)
                if busy { ProgressView().controlSize(.small) }
            }
            if let preview {
                let known = Set(store.workspace.sessions.map(\.id))
                Text(store.text("newSessions") + ": " + String(preview.sessions.filter { !known.contains($0.id) }.count))
                Text(store.text("interpretation") + ": " + String(preview.interpretation.count))
                Text(store.text("existingSessions") + ": " + String(preview.sessions.filter { known.contains($0.id) }.count))
                Toggle(store.text("restorePreferences"), isOn: $restorePreferences)
                Button(store.text("confirmImport")) {
                    do { try store.importBackup(preview, restorePreferences: restorePreferences); self.preview = nil; completed = true }
                    catch { self.error = "backupError" }
                }
                Button(store.text("close")) { self.preview = nil }
            }
            if completed { Text(store.text("succeeded")) }
            if let error { Text(store.text(error)).foregroundStyle(.secondary) }
        }
    }
    private func export() {
        let panel = NSSavePanel(); panel.allowedContentTypes = [.json]; panel.nameFieldStringValue = "viezan-native-backup.json"
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            let snapshot = store.workspace, meetings = store.interpretation.sessions; busy = true; error = nil; completed = false
            Task {
                do {
                    try await Task.detached { try NativeBackup.export(snapshot, interpretation: meetings).write(to: url, options: .atomic) }.value
                    completed = true
                } catch { self.error = "backupError" }
                busy = false
            }
        }
    }
    private func inspect() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            busy = true; error = nil; completed = false; preview = nil
            Task {
                do {
                    preview = try await Task.detached {
                        guard let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 128_000_000 else { throw StorageFailure.invalidData }
                        return try NativeBackup.preview(Data(contentsOf: url))
                    }.value
                } catch { self.error = "backupError" }
                busy = false
            }
        }
    }
}
