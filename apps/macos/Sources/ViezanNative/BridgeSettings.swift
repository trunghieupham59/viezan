import SwiftUI
import ViezanDomain
struct BridgeSettings: View {
    @Bindable var store: WorkbenchStore
    @State private var name = "Chrome"
    @State private var days = 30
    @State private var revokeID: String?
    @State private var automatic = false
    @State private var origins = ""
    @State private var invalidOrigins = false
    var body: some View {
        let bridge = store.extensionBridge
        VStack(alignment: .leading, spacing: metric("inset")) {
            Text(store.text("bridgeDescription")).foregroundStyle(.secondary)
            Text("127.0.0.1:39875").textSelection(.enabled)
            Toggle(store.text("bridgeAutomatic"), isOn: $automatic)
            Text(store.text("bridgeOrigins"))
            TextEditor(text: $origins).accessibilityLabel(store.text("bridgeOrigins"))
            Text(store.text("bridgeOriginsHint")).font(.caption).foregroundStyle(.secondary)
            Button(store.text("apply")) {
                invalidOrigins = !store.setBridge(automatic: automatic, origins: origins.split(whereSeparator: \.isNewline).map(String.init).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
            }
            if invalidOrigins { Text(store.text("bridgeOriginsInvalid")).foregroundStyle(.red) }
            Button(store.text(bridge.listening ? "stop" : "startBridge")) { if bridge.listening { bridge.stop() } else { bridge.model = store.session.model; bridge.start() } }
            Text(store.text("model") + ": " + store.session.model).textSelection(.enabled)
            TextField(store.text("tokenName"), text: $name).textFieldStyle(.roundedBorder)
            Stepper(store.text("tokenDays") + ": " + String(days), value: $days, in: 1...365)
            Button(store.text("createToken")) { bridge.createToken(name: name, days: days) }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if !bridge.revealedToken.isEmpty {
                Text(store.text("tokenOnce"))
                Text(bridge.revealedToken).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                Button(store.text("copy")) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(bridge.revealedToken, forType: .string) }
                Button(store.text("close")) { bridge.dismissToken() }
            }
            ForEach(bridge.tokens) { token in
                HStack {
                    VStack(alignment: .leading) { Text(token.name); Text(Date(timeIntervalSince1970: token.expiresAt), style: .date).font(.caption) }
                    Spacer()
                    Button(store.text("revokeToken"), role: .destructive) { revokeID = token.id }
                }
            }
            if let error = bridge.error { Text(store.text(error)).foregroundStyle(.secondary) }
        }.onAppear { automatic = store.workspace.bridge?.automatic ?? false; origins = (store.workspace.bridge?.origins ?? []).joined(separator: "\n") }
        .onDisappear { bridge.dismissToken() }
        .confirmationDialog(store.text("revokeTokenConfirm"), isPresented: Binding(get: { revokeID != nil }, set: { if !$0 { revokeID = nil } })) {
            Button(store.text("revokeToken"), role: .destructive) { if let id = revokeID { bridge.revoke(id) }; revokeID = nil }
        }
    }
}
