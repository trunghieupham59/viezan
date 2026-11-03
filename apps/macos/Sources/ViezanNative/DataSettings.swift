import SwiftUI
import UniformTypeIdentifiers
import ViezanDomain
struct DataSettings: View {
    @Bindable var store: WorkbenchStore
    @State private var keep = 100
    @State private var trim = false
    @State private var clearAll = false
    @State private var busy = false
    @State private var preview: BackupPreview?
    @State private var restorePreferences = false
    @Environment(\.settingsConfirm) private var confirm
    private func done() { ToastCenter.shared.show(store.text("succeeded"), key: "data") }
    private func fail(_ key: String) { ToastCenter.shared.show(store.text(key), key: "data", error: true) }
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        if glass { glassBody } else { classicBody }
    }
    private func trimAction() {
        if let confirm {
            confirm(SettingsConfirm(title: store.text("trimHistory"), message: store.text("trimHistoryConfirm"), confirm: store.text("trimHistory")) {
                do { try store.trimHistory(keeping: keep); done() } catch { fail("dataOperationError") }
            })
        } else { trim = true }
    }
    private var clearConfirm: String { store.text("clearHistoryConfirm").replacingOccurrences(of: "{count}", with: store.clearableHistoryCount.formatted()) }
    private var clearDisabled: Bool { busy || store.loadBlocked || store.clearableHistoryCount == 0 || store.interpretation.busy || store.workspace.tasks.contains { $0.status == .running } }
    private func runClear() { do { try store.clearHistory(); done() } catch { fail("dataOperationError") } }
    /// Removes every history entry; it cannot be undone, so it always asks first with the count.
    private func clearAction() {
        if let confirm {
            confirm(SettingsConfirm(title: store.text("clearHistory"), message: clearConfirm, confirm: store.text("clearHistoryAction"), action: runClear))
        } else { clearAll = true }
    }
    // Settings-Data board: History, Usage and Backup as titled cards of rows.
    private var glassBody: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            CardSection(flush: true, title: store.text("history")) {
                CardRow(title: store.text("historyKeep")) {
                    SettingsPicker(id: "history-keep", label: store.text("historyKeep"), options: [20, 100, 500, 1000].map { SettingsPickerOption(id: String($0), title: String($0)) },
                                   selection: String(keep)) { keep = Int($0) ?? 100 }
                }
                CardRow(title: store.text("trimHistory"), detail: store.text("trimHistoryConfirm")) {
                    Button(store.text("trimHistory"), role: .destructive, action: trimAction).buttonStyle(.vznQuiet)
                        .disabled(busy || store.loadBlocked || store.workspace.tasks.contains { $0.status == .running })
                }
                CardRow(title: store.text("clearHistory"), detail: store.text("clearHistoryDetail"), divider: false) {
                    Button(store.text("clearHistoryAction"), role: .destructive, action: clearAction).buttonStyle(.vznQuiet).disabled(clearDisabled)
                        .accessibilityIdentifier("settings-clear-history")
                }
            }
            CardSection { UsageSettings(store: store) }
            CardSection(flush: true, title: store.text("backupTitle")) {
                CardRow(title: store.text("exportBackup")) { Button(store.text("exportBackup"), action: export).buttonStyle(.vznOutline).disabled(busy || store.loadBlocked) }
                CardRow(title: store.text("importBackup"), divider: preview != nil) {
                    if busy { ProgressView().controlSize(.small) }
                    Button(store.text("importBackup"), action: inspect).buttonStyle(.vznOutline).disabled(busy || store.loadBlocked)
                }
                if let preview {
                    let known = Set(store.workspace.sessions.map(\.id))
                    VStack(alignment: .leading, spacing: metric("small")) {
                        Text(store.text("newSessions") + ": " + String(preview.sessions.filter { !known.contains($0.id) }.count))
                        Text(store.text("interpretation") + ": " + String(preview.interpretation.count))
                        Text(store.text("existingSessions") + ": " + String(preview.sessions.filter { known.contains($0.id) }.count))
                        Toggle(store.text("restorePreferences"), isOn: $restorePreferences).toggleStyle(.switch)
                        HStack {
                            Spacer()
                            Button(store.text("close")) { self.preview = nil }.buttonStyle(.vznQuiet)
                            Button(store.text("confirmImport")) {
                                do { try store.importBackup(preview, restorePreferences: restorePreferences); self.preview = nil; done() }
                                catch { fail("backupError") }
                            }.buttonStyle(.vznPrimary)
                        }
                    }.padding(metric("inset"))
                }
            }
        }.disabled(store.loadBlocked)
    }
    private var classicBody: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            UsageSettings(store: store)
            HStack(spacing: metric("small")) {
                Text(store.text("historyKeep"))
                SettingsPicker(id: "history-keep", label: store.text("historyKeep"), options: [20, 100, 500, 1000].map { SettingsPickerOption(id: String($0), title: String($0)) },
                               selection: String(keep)) { keep = Int($0) ?? 100 }
            }
            Button(store.text("trimHistory"), role: .destructive, action: trimAction).disabled(busy || store.loadBlocked || store.workspace.tasks.contains { $0.status == .running })
                .confirmationDialog(store.text("trimHistoryConfirm"), isPresented: $trim) {
                    Button(store.text("trimHistory"), role: .destructive) { do { try store.trimHistory(keeping: keep); done() } catch { fail("dataOperationError") } }
                }
            Button(store.text("clearHistoryAction"), role: .destructive, action: clearAction).disabled(clearDisabled)
                .confirmationDialog(clearConfirm, isPresented: $clearAll) { Button(store.text("clearHistoryAction"), role: .destructive, action: runClear) }
            Divider()
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
                    do { try store.importBackup(preview, restorePreferences: restorePreferences); self.preview = nil; done() }
                    catch { fail("backupError") }
                }
                Button(store.text("close")) { self.preview = nil }
            }
        }
    }
    private func export() {
        let panel = NSSavePanel(); panel.allowedContentTypes = [.json]; panel.nameFieldStringValue = "viezan-native-backup.json"
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            let snapshot = store.workspace, meetings = store.interpretation.sessions; busy = true
            Task {
                do {
                    try await Task.detached { try NativeBackup.export(snapshot, interpretation: meetings).write(to: url, options: .atomic) }.value
                    done()
                } catch { fail("backupError") }
                busy = false
            }
        }
    }
    private func inspect() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            busy = true; preview = nil
            Task {
                do {
                    preview = try await Task.detached {
                        guard let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 128_000_000 else { throw StorageFailure.invalidData }
                        return try NativeBackup.preview(Data(contentsOf: url))
                    }.value
                } catch { fail("backupError") }
                busy = false
            }
        }
    }
}
