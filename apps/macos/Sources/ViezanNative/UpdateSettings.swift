import SwiftUI
import ViezanDomain
struct UpdateSettings: View {
    let store: WorkbenchStore
    var body: some View {
        let updates = store.updates
        // The page title and hint come from the settings section; this card holds the actions.
        VStack(alignment: .leading, spacing: metric("small")) {
            CardRow(title: store.text("currentVersion"), divider: false) { Text(nativeVersion).foregroundStyle(.secondary).textSelection(.enabled) }
            HStack {
                Button(store.text("checkUpdates")) { updates.check() }.disabled(updates.busy)
                if updates.release != nil { Button(store.text("downloadUpdate")) { updates.download() }.disabled(updates.busy) }
                if updates.busy { Button(store.text("cancel"), role: .destructive) { updates.cancel() } }
                if updates.downloaded != nil { Button(store.text("openUpdate")) { updates.openInstaller() } }
            }
            if updates.busy { ProgressView(value: updates.progress) }
            if !updates.status.isEmpty { Text(store.text(updates.status)) }
            if let release = updates.release { Text(release.version); Text(release.notes).textSelection(.enabled); Link(store.text("releaseNotes"), destination: release.page) }
        }
    }
}

/// The running build's version, e.g. "2.4.2 (1)".
var nativeVersion: String {
    let info = Bundle.main.infoDictionary
    return (info?["CFBundleShortVersionString"] as? String ?? "–") + (info?["CFBundleVersion"] as? String).map { " (" + $0 + ")" }.orEmpty
}
private extension Optional where Wrapped == String { var orEmpty: String { self ?? "" } }
