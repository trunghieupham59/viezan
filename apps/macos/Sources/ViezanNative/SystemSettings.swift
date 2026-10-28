import SwiftUI
import ServiceManagement
import AVFoundation
import ApplicationServices
import ViezanDomain
struct SystemSettings: View {
    let store: WorkbenchStore
    @State private var login = SMAppService.mainApp.status == .enabled
    @State private var error = false
    @State private var diagnostics = ""
    @State private var granted: [String: Bool] = [:]
    /// Read again whenever Viezan comes back from System Settings.
    private func refresh() {
        granted = ["microphonePermission": AVCaptureDevice.authorizationStatus(for: .audio) == .authorized,
                   "screenPermission": CGPreflightScreenCaptureAccess(), "accessibilityPermission": AXIsProcessTrusted()]
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardRow(title: store.text("launchAtLogin"), detail: error ? store.text("startupError") : store.text("launchDescription")) {
                Toggle(store.text("launchAtLogin"), isOn: Binding(get: { login }, set: { value in
                    Task {
                        do {
                            if value { try SMAppService.mainApp.register() } else { try await SMAppService.mainApp.unregister() }
                            login = SMAppService.mainApp.status == .enabled; error = value && !login
                        } catch { self.error = true; login = SMAppService.mainApp.status == .enabled }
                    }
                })).toggleStyle(.switch).labelsHidden()
                Button(store.text("openSystemSettings")) { SMAppService.openSystemSettingsLoginItems() }
            }
            ForEach([("microphonePermission", "Privacy_Microphone"), ("screenPermission", "Privacy_ScreenCapture"), ("accessibilityPermission", "Privacy_Accessibility")], id: \.0) { key, pane in
                CardRow(title: store.text(key)) {
                    let allowed = granted[key] == true
                    StatusBadge(text: store.text(allowed ? "permissionGranted" : "permissionMissing"), tone: allowed ? .ready : .idle)
                    Button(store.text("openShort")) { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?" + pane)!) }
                }
            }
            CardRow(title: store.text("diagnostics"), divider: false) {
                Button(store.text("openShort")) {
                    let info = ProcessInfo.processInfo
                    diagnostics = ["Viezan " + (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "development"), info.operatingSystemVersionString,
                        "CPU: \(info.activeProcessorCount) · RAM: \(info.physicalMemory)",
                        "Microphone: \(AVCaptureDevice.authorizationStatus(for: .audio).rawValue) · Accessibility: \(AXIsProcessTrusted()) · Screen: \(CGPreflightScreenCaptureAccess())",
                        "Storage blocked: \(store.loadBlocked) · Ollama: \(store.localRuntime.available)",
                        "Bridge: \(store.extensionBridge.listening)"].joined(separator: "\n")
                }
            }
            if !diagnostics.isEmpty { Text(diagnostics).textSelection(.enabled).font(.system(.caption, design: .monospaced)).padding(metric("inset")) }
        }
        .onAppear(perform: refresh)
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in refresh() }
    }
}
