import SwiftUI
import ViezanDomain

/// The running build's version, e.g. "2.4.2 (1)".
var nativeVersion: String {
    let info = Bundle.main.infoDictionary
    return (info?["CFBundleShortVersionString"] as? String ?? "–") + (info?["CFBundleVersion"] as? String).map { " (" + $0 + ")" }.orEmpty
}
private extension Optional where Wrapped == String { var orEmpty: String { self ?? "" } }
private var shortVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "–" }

// One sentence for where the update stands, shared by Settings and the prompt.
@MainActor private func updateStatusText(_ store: WorkbenchStore) -> String {
    let updates = store.updates
    if updates.busy && updates.release == nil { return store.text("updateChecking") }
    if updates.busy, let release = updates.release { return store.text("updateDownloading").replacingOccurrences(of: "{percent}", with: String(Int(updates.progress * 100))) + " · v" + release.version }
    if updates.downloaded != nil, let release = updates.release { return store.text("updateReadyVersion").replacingOccurrences(of: "{version}", with: release.version) }
    if let release = updates.release { return store.text("updateAvailableVersion").replacingOccurrences(of: "{version}", with: release.version) }
    if updates.status == "updateCurrent" { return store.text("updateLatestVersion").replacingOccurrences(of: "{version}", with: shortVersion) }
    if updates.status == "updateError" { return store.text("updateError") }
    return ""
}

struct UpdateSettings: View {
    @Bindable var store: WorkbenchStore
    var body: some View {
        let updates = store.updates
        VStack(alignment: .leading, spacing: metric("inset")) {
            CardSection(flush: true, title: store.text("updatesTitle")) {
                CardRow(title: store.text("currentVersion")) {
                    Text(nativeVersion).foregroundStyle(.secondary).textSelection(.enabled)
                    Link(store.text("releaseNotes"), destination: updates.release?.page ?? URL(string: "https://github.com/trunghieupham59/viezan/releases")!).buttonStyle(.vznQuiet)
                }
                CardRow(title: store.text("autoCheckUpdates"), detail: store.text("autoCheckUpdatesDescription")) {
                    Toggle(store.text("autoCheckUpdates"), isOn: Binding(get: { store.autoCheckUpdates }, set: { store.autoCheckUpdates = $0 })).toggleStyle(.switch).labelsHidden().accessibilityIdentifier("settings-auto-update")
                }
                CardRow(title: store.text("updateStatus"), detail: updateStatusText(store), divider: false) {
                    if updates.busy { Button(store.text("cancel"), role: .destructive) { updates.cancel() }.buttonStyle(.vznOutline) }
                    else {
                        Button(store.text("checkUpdates")) { updates.check() }.buttonStyle(.vznOutline).accessibilityIdentifier("settings-check-updates")
                        if updates.downloaded != nil { Button(store.text("openUpdate")) { updates.openInstaller() }.buttonStyle(.vznPrimary) }
                        else if updates.release != nil { Button(store.text("downloadUpdate")) { updates.download() }.buttonStyle(.vznPrimary) }
                    }
                }
                if updates.busy, updates.release != nil {
                    ProgressView(value: updates.progress).padding(.horizontal, metric("inset")).padding(.bottom, metric("inset")).accessibilityLabel(store.text("updateStatus"))
                }
            }
            if let release = updates.release, !release.notes.isEmpty {
                CardSection(title: "v" + release.version) {
                    Text(release.notes).font(readingFont(store)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// Bounded dialog for a version found in the background: read the notes, download
// now, or be reminded tomorrow. Escape is "later"; nothing installs on its own.
struct UpdatePrompt: View {
    @Bindable var store: WorkbenchStore
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let updates = store.updates
        VStack(alignment: .leading, spacing: metric("inset")) {
            VStack(alignment: .leading, spacing: metric("small")) {
                Text(store.text("updateTitle")).font(.vzn("headingScale", .semibold)).accessibilityAddTraits(.isHeader)
                Text(updateStatusText(store)).foregroundStyle(.secondary)
            }
            if let release = updates.release ?? store.updatePrompt, !release.notes.isEmpty {
                ScrollView {
                    Text(release.notes).font(readingFont(store)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                }.frame(maxHeight: metric("editor") * 2).padding(metric("inset")).cardSurface(padded: false)
            }
            if updates.busy, updates.release != nil { ProgressView(value: updates.progress) }
            HStack(spacing: metric("small")) {
                if let page = (updates.release ?? store.updatePrompt)?.page { Link(store.text("viewChanges"), destination: page).buttonStyle(.vznQuiet) }
                Spacer()
                Button(store.text("remindLater")) { store.snoozeUpdate() }.buttonStyle(.vznOutline).keyboardShortcut(.cancelAction).accessibilityIdentifier("update-later")
                if updates.busy { Button(store.text("cancel"), role: .destructive) { updates.cancel() }.buttonStyle(.vznOutline) }
                else if updates.downloaded != nil { Button(store.text("openUpdate")) { updates.openInstaller(); store.dismissUpdatePrompt() }.buttonStyle(.vznPrimary) }
                else { Button(store.text("downloadUpdate")) { updates.download() }.buttonStyle(.vznPrimary).keyboardShortcut(.defaultAction).accessibilityIdentifier("update-download") }
            }
        }.padding(metric("gutter")).frame(width: metric("sidebar") + metric("reading") / 2)
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("updateTitle"))
    }
}
