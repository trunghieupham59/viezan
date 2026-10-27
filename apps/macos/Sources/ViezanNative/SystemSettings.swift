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
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Toggle(store.text("launchAtLogin"), isOn: Binding(get: { login }, set: { value in
                Task {
                    do {
                        if value { try SMAppService.mainApp.register() } else { try await SMAppService.mainApp.unregister() }
                        login = SMAppService.mainApp.status == .enabled; error = value && !login
                    } catch { self.error = true; login = SMAppService.mainApp.status == .enabled }
                }
            }))
            if error { Text(store.text("startupError")) }
            Button(store.text("openSystemSettings")) { SMAppService.openSystemSettingsLoginItems() }
            NativeFlow(spacing: metric("small")) {
                Button(store.text("microphonePermission")) { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!) }
                Button(store.text("screenPermission")) { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!) }
                Button(store.text("accessibilityPermission")) { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!) }
            }
            Button(store.text("diagnostics")) {
                let info = ProcessInfo.processInfo
                diagnostics = ["Viezan " + (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "development"), info.operatingSystemVersionString,
                    "CPU: \(info.activeProcessorCount) · RAM: \(info.physicalMemory)",
                    "Microphone: \(AVCaptureDevice.authorizationStatus(for: .audio).rawValue) · Accessibility: \(AXIsProcessTrusted()) · Screen: \(CGPreflightScreenCaptureAccess())",
                    "Storage blocked: \(store.loadBlocked) · Ollama: \(store.localRuntime.available)",
                    "Bridge: \(store.extensionBridge.listening)"].joined(separator: "\n")
            }
            if !diagnostics.isEmpty { Text(diagnostics).textSelection(.enabled).font(.system(.caption, design: .monospaced)) }
        }
    }
}
