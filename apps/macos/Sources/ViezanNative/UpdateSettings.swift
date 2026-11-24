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
/// UpdateSheet board, before anything is downloaded: "Viezan 2.6.0 · 48 MB · bạn đang dùng 2.5.2".
@MainActor private func updateSheetSummary(_ store: WorkbenchStore) -> String? {
    let updates = store.updates
    // A failed check or download keeps its own message.
    guard !updates.busy, updates.downloaded == nil, updates.status != "updateError", let release = updates.release ?? store.updatePrompt else { return nil }
    return UpdateSummary.text(version: release.version, size: release.size, current: shortVersion) { store.text($0) }
}
enum UpdateSummary {
    static func text(version: String, size: Int64?, current: String, text: (String) -> String) -> String {
        let sized = size.flatMap { $0 > 0 ? ByteCountFormatter.string(fromByteCount: $0, countStyle: .file) : nil }
        return text(sized == nil ? "updateSheetSummaryNoSize" : "updateSheetSummary")
            .replacingOccurrences(of: "{version}", with: version).replacingOccurrences(of: "{size}", with: sized ?? "").replacingOccurrences(of: "{current}", with: current)
    }
}
@MainActor private func updateStatusText(_ store: WorkbenchStore) -> String {
    let updates = store.updates
    if updates.busy && updates.release == nil { return store.text("updateChecking") }
    if updates.busy, let release = updates.release {
        // UpdateSheet-States: "… · khoảng 20 giây nữa" once the estimate settles.
        let remaining = updates.remainingSeconds.map { seconds in
            seconds < 60 ? store.text("updateRemainingSeconds").replacingOccurrences(of: "{n}", with: max(1, Int(seconds.rounded())).formatted())
                         : store.text("updateRemainingMinutes").replacingOccurrences(of: "{n}", with: Int((seconds / 60).rounded(.up)).formatted())
        }
        return ([store.text("updateDownloading").replacingOccurrences(of: "{percent}", with: String(Int(updates.progress * 100))), "v" + release.version] + [remaining].compactMap { $0 }).joined(separator: " · ")
    }
    if updates.installing { return store.text("updateInstalling") }
    if updates.status == "updateInstallError" { return store.text("updateInstallError") }
    if updates.downloaded != nil, let release = updates.release { return store.text("updateReadyVersion").replacingOccurrences(of: "{version}", with: release.version) }
    // Settings-Update: the package size and when Viezan last checked.
    let checked = updates.checkedAt.map { store.text("updateCheckedAgo").replacingOccurrences(of: "{time}", with: relativeTime($0, store: store)) }
    if let release = updates.release {
        let size = release.size.map { ByteCountFormatter.string(fromByteCount: $0, countStyle: .file) }
        return ([store.text("updateAvailableVersion").replacingOccurrences(of: "{version}", with: release.version)] + [size, checked].compactMap { $0 }).joined(separator: " · ")
    }
    if updates.status == "updateCurrent" { return ([store.text("updateLatestVersion").replacingOccurrences(of: "{version}", with: shortVersion)] + [checked].compactMap { $0 }).joined(separator: " · ") }
    if updates.status == "updateError" { return store.text("updateError") }
    return ""
}

/// The ready state's primary action: install in place when the app can replace itself, otherwise hand over the package.
private struct InstallUpdateButton: View {
    let store: WorkbenchStore
    var dismisses = false
    var body: some View {
        let updates = store.updates
        if updates.canInstall, updates.status != "updateInstallError" {
            Button(store.text("installUpdate")) { install() }.buttonStyle(.vznPrimary).disabled(updates.installing || store.localPerformance.busy).accessibilityIdentifier("update-install")
        } else {
            Button(store.text("openUpdate")) { updates.openInstaller(); if dismisses { store.dismissUpdatePrompt() } }.buttonStyle(.vznPrimary)
        }
    }
    private func install() {
        // Save first, as quitting does: the app is never replaced under a process that then refuses to quit.
        store.save(); guard store.storageError == nil || store.loadBlocked else { return }
        Task { if await store.updates.install() { NSApp.terminate(nil) } }
    }
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
                        if updates.downloaded != nil { InstallUpdateButton(store: store) }
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
        glassBody
    }
    // UpdateSheet board, inside the window's centred blocking dialog: app icon, title and state,
    // the notes as bullets, a meter while downloading, then View changes · Later · the one action.
    private var glassBody: some View {
        let updates = store.updates
        let release = updates.release ?? store.updatePrompt
        let notes = (release?.notes ?? "").split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "-*• ")) }.filter { !$0.isEmpty }
        return VStack(alignment: .leading, spacing: metric("inset")) {
            HStack(alignment: .center, spacing: metric("inset")) {
                if let url = NativeResources.brandURL, let icon = NSImage(contentsOf: url) {
                    Image(nsImage: icon).resizable().scaledToFit().frame(width: metric("hero") + metric("small"), height: metric("hero") + metric("small")).accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: metric("tight")) {
                    Text(store.text("updateTitle") + " Viezan").font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).accessibilityAddTraits(.isHeader)
                    Text(updateSheetSummary(store) ?? updateStatusText(store)).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).monospacedDigit()
                }
            }
            if updates.busy, updates.release != nil {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(contentColor("surface-muted", scheme))
                        Capsule().fill(contentColor("action", scheme)).frame(width: proxy.size.width * max(0, min(1, updates.progress)))
                    }
                }.frame(height: metric("small")).accessibilityLabel(store.text("updateDownloading").replacingOccurrences(of: "{percent}", with: String(Int(updates.progress * 100))))
            } else if !notes.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: metric("tight")) {
                        ForEach(Array(notes.prefix(12).enumerated()), id: \.offset) { _, line in
                            HStack(alignment: .firstTextBaseline, spacing: metric("small")) { Text("•").accessibilityHidden(true); Text(line).fixedSize(horizontal: false, vertical: true) }
                        }
                    }.font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text", scheme)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                }.frame(maxHeight: metric("editor")).scrollIndicators(.hidden)
            }
            HStack(spacing: metric("small")) {
                if let page = release?.page {
                    Link(destination: page) { Label(store.text("viewChanges"), systemImage: "arrow.up.right").labelStyle(TrailingIconLabelStyle()) }
                        .font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme))
                }
                Spacer()
                Button(store.text("remindLater")) { store.snoozeUpdate() }.buttonStyle(.vznOutline).keyboardShortcut(.cancelAction).accessibilityIdentifier("update-later")
                if updates.busy { Button(store.text("cancel"), role: .destructive) { updates.cancel() }.buttonStyle(.vznOutline) }
                else if updates.downloaded != nil { InstallUpdateButton(store: store, dismisses: true) }
                else { Button(store.text("downloadUpdate")) { updates.download() }.buttonStyle(.vznPrimary).keyboardShortcut(.defaultAction).accessibilityIdentifier("update-download") }
            }
        }
    }
}
