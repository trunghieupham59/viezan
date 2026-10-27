import SwiftUI
import ViezanDomain
struct UpdateSettings: View {
    let store: WorkbenchStore
    var body: some View {
        let updates = store.updates
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(store.text("updatesTitle")).font(.headline)
            Text(store.text("updatesHint")).foregroundStyle(.secondary)
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
