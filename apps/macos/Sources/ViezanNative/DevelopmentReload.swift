#if DEBUG
import AppKit
import Observation
import ViezanDomain

/// Available only in Debug bundles made by scripts/native/dev.py.
@MainActor @Observable final class DevelopmentReload {
    private(set) var building = false
    private let configuration: [String: String]?
    private var worker: Process?
    private var monitor: Task<Void, Never>?

    init(configuration: [String: String]? = Bundle.main.object(forInfoDictionaryKey: "ViezanDevelopment") as? [String: String]) {
        self.configuration = configuration
    }

    var available: Bool {
        guard let root = configuration?["root"], let python = configuration?["python"] else { return false }
        return FileManager.default.isExecutableFile(atPath: python)
            && FileManager.default.fileExists(atPath: root + "/scripts/native/dev.py")
    }

    private var directory: URL? {
        configuration?["root"].map { URL(fileURLWithPath: $0).appendingPathComponent(".native-build/dev") }
    }

    func openLog() {
        guard let directory else { return }
        NSWorkspace.shared.open(directory.appendingPathComponent("build.log"))
    }

    func reload(store: WorkbenchStore) {
        guard !building, available, let configuration, let directory else { return }
        // Let the input method finish composing before attempting a restart.
        if let editor = NSApp.keyWindow?.firstResponder as? NSTextView, editor.hasMarkedText() { return }
        guard canRestart(store) else { showFailure(store); return }
        let request = UUID().uuidString
        let process = Process()
        process.executableURL = URL(fileURLWithPath: configuration["python"]!)
        process.arguments = [configuration["root"]! + "/scripts/native/dev.py",
                             "--reload-pid", String(ProcessInfo.processInfo.processIdentifier),
                             "--request-id", request]
        process.currentDirectoryURL = URL(fileURLWithPath: configuration["root"]!)
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = configuration["path"]
        if let developer = configuration["developerDir"], !developer.isEmpty { environment["DEVELOPER_DIR"] = developer }
        process.environment = environment
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do { try process.run() }
        catch { showFailure(store); return }
        worker = process
        building = true
        monitor = Task { [weak self] in
            var requestedQuit = false
            reloadMonitor: while process.isRunning {
                if !requestedQuit,
                   let data = try? Data(contentsOf: directory.appendingPathComponent("reload-status.json")),
                   let status = try? JSONDecoder().decode(ReloadStatus.self, from: data),
                   status.request == request, status.state == "ready" {
                    switch self?.readyAction(store: store, firstResponder: NSApp.keyWindow?.firstResponder) ?? .cancel {
                    case .wait:
                        // Composition can start while the build runs. Leave the
                        // current app/editor alive and retry on the next poll.
                        break
                    case .cancel:
                        process.terminate()
                        break reloadMonitor
                    case .restart:
                        requestedQuit = true
                        NSApp.terminate(nil) // Normal delegate shutdown flushes drafts and interrupts active tasks.
                    }
                }
                do { try await Task.sleep(for: .milliseconds(250)) }
                catch { return }
            }
            self?.building = false
            self?.worker = nil
            self?.monitor = nil
            // A successful reload exits this process. If it survives, show the failure.
            self?.showFailure(store)
        }
    }

    enum ReadyAction { case wait, cancel, restart }

    func readyAction(store: WorkbenchStore, firstResponder: NSResponder?) -> ReadyAction {
        if let editor = firstResponder as? NSTextView, editor.hasMarkedText() { return .wait }
        return canRestart(store) ? .restart : .cancel
    }

    private func canRestart(_ store: WorkbenchStore) -> Bool {
        guard !store.loadBlocked, !store.localPerformance.busy else { return false }
        store.save()
        return store.storageError == nil
    }

    private func showFailure(_ store: WorkbenchStore) {
        let alert = NSAlert()
        alert.messageText = store.text("devReloadFailed")
        alert.informativeText = store.text("devReloadFailedHint")
        alert.addButton(withTitle: store.text("close"))
        alert.addButton(withTitle: store.text("devOpenBuildLog"))
        if let window = NSApp.keyWindow {
            alert.beginSheetModal(for: window) { response in
                if response == .alertSecondButtonReturn { self.openLog() }
            }
        } else if alert.runModal() == .alertSecondButtonReturn { openLog() }
    }
}

private struct ReloadStatus: Decodable {
    let request: String
    let state: String
}
#endif
