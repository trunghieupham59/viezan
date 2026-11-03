import SwiftUI
import ViezanDomain

struct DesktopWorkspace: View {
    @Bindable var store: WorkbenchStore
    let route: String
    @Environment(\.colorScheme) private var scheme
    /// Glass: the shortcut whose recorder is open as the page's blocking dialog.
    @State private var recording: String?
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private func keyDisplay(_ id: String) -> String {
        (store.desktopIntegration.shortcuts.first { $0.id == id }?.key ?? "").split(separator: "+").map { part -> String in
            switch part { case "Control": "⌃"; case "Option": "⌥"; case "Shift": "⇧"; case "Command": "⌘"; default: String(part) }
        }.joined(separator: " ")
    }
    var body: some View {
        WorkspacePage {
            if route == "everywhere" {
                PageIntro(title: store.text("everywhereTitle"), subtitle: store.text("everywhereHint").replacingOccurrences(of: "{key}", with: keyDisplay("translateSelection")))
            } else {
                PageIntro(title: store.text("utilitiesTitle"), subtitle: store.text("utilitiesIntro"))
            }
            AdaptiveColumns { primary; secondary }
        }
        .overlay { if glass, let id = recording { ShortcutRecorderDialog(store: store, shortcutID: id) { recording = nil } } }
        .onChange(of: route) { _, _ in recording = nil }
    }
    @ViewBuilder private var primary: some View {
        if route == "everywhere" {
            // Everywhere board: a titled settings card with edge-to-edge rows and the privacy note inside.
            CardSection(flush: glass, title: store.text("translateSelection")) {
                DesktopSettings(store: store, route: route, recording: glass ? $recording : nil)
                Text(store.text("localModelNote")).font(.vzn(glass ? "smallScale" : "labelScale")).foregroundStyle(glass ? contentColor("text-muted", scheme) : .primary).fixedSize(horizontal: false, vertical: true)
                    .padding(glass ? metric("gap") : metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
                    .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric(glass ? "controlRadius" : "radius")))
                    .padding(glass ? metric("inset") : 0).padding(.top, glass ? 0 : metric("small"))
            }
        } else {
            CardSection(flush: glass, title: store.text("allShortcuts")) {
                DesktopSettings(store: store, route: route, recording: glass ? $recording : nil)
                CardRow(title: store.text("commands"), detail: store.text("shortcutDetail_commands"), divider: false) {
                    if glass { KeyCaps(key: "Command+K") } else { KeyCap(text: "⌘ K") }
                }
            }
        }
    }
    @ViewBuilder private var secondary: some View {
        if glass { glassSecondary } else { classicSecondary }
    }
    // Everywhere: the quick-translate window drawn on a patch of the scene, illustration only.
    // Shortcuts: the Launcher pitch with a preview of its search field and the one primary action.
    @ViewBuilder private var glassSecondary: some View {
        if route == "everywhere" {
            VStack(alignment: .leading, spacing: metric("gap")) {
                Eyebrow(text: store.text("quickPreview"))
                VStack(alignment: .leading, spacing: metric("gap")) {
                    Text(store.text("lang_en") + " → " + store.text("lang_" + store.text("previewTarget"))).font(.vzn("smallScale", .medium))
                        .foregroundStyle(contentColor("action-text", scheme)).padding(.horizontal, metric("small") + metric("hairline") * 2).frame(height: metric("gutter"))
                        .background(contentColor("action-soft", scheme), in: Capsule())
                    Text(store.text("previewSource")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                    Text(store.text("previewTranslated")).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).fixedSize(horizontal: false, vertical: true)
                    Text(ModelLineup.shortName(store.session.model)).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).help(store.session.model)
                }.padding(metric("inset") + metric("tight")).frame(maxWidth: .infinity, alignment: .leading)
                    .background { ReadingPanelSurface() }
                    .padding(metric("gutter"))
                    .background { AppBackdrop().clipShape(RoundedRectangle(cornerRadius: metric("chromeCardRadius"), style: .continuous)) }
                    .accessibilityElement(children: .combine)
                HStack(spacing: metric("small")) {
                    Text(store.text("previewIllustrative")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
                    Button(store.text("openInTranslate")) { NotificationCenter.default.post(name: .viezanOpenRoute, object: "translate") }
                        .buttonStyle(.plain).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme)).disabled(!store.moduleEnabled("translate"))
                }
            }
        } else {
            VStack(alignment: .leading, spacing: metric("inset")) {
                Text(store.text("launcherPitch")).font(.vzn("titleScale", .semibold)).accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: metric("tight")) {
                    ForEach(store.text("launcherPitchDetail").split(separator: "\n").map(String.init), id: \.self) { line in
                        HStack(alignment: .firstTextBaseline, spacing: metric("small")) { Text("•").accessibilityHidden(true); Text(line) }
                    }
                }.font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme))
                HStack(spacing: metric("small")) {
                    Image(systemName: "magnifyingglass").foregroundStyle(contentColor("text-muted", scheme)).accessibilityHidden(true)
                    Text(store.text("launcher_placeholder")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(2)
                    Spacer(minLength: metric("small"))
                    if let key = store.desktopIntegration.shortcuts.first(where: { $0.id == "launcher" })?.key { KeyCaps(key: key) }
                }.padding(.horizontal, metric("gap")).frame(minHeight: metric("navControl") + metric("gap"))
                    .background { GlassLens(radius: metric("radius")) }.accessibilityHidden(true)
                Button(store.text("openLauncher"), systemImage: "command") { store.desktopIntegration.onAction?("launcher") }.buttonStyle(.vznPrimary).fixedSize()
            }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
        }
    }
    @ViewBuilder private var classicSecondary: some View {
        if route == "everywhere" {
            // Illustrative preview of the quick translate window. The sample text is never
            // copied or seeded into a session; the only action opens the real Translate page.
            VStack(alignment: .leading, spacing: metric("gap")) {
                Eyebrow(text: store.text("quickPreview"))
                VStack(alignment: .leading, spacing: metric("gap")) {
                    StatusBadge(text: store.text("lang_en") + " → " + store.text("lang_" + store.text("previewTarget")), tone: .ready)
                    Text(store.text("previewSource")).foregroundStyle(.secondary)
                    Text(store.text("previewTranslated")).font(.vzn("titleScale", .bold)).fixedSize(horizontal: false, vertical: true)
                    Text(nativeModelLabel(store.session.model, store: store)).font(.vzn("smallScale")).foregroundStyle(.secondary)
                    HStack(spacing: metric("small")) {
                        Button(store.text("openInTranslate")) { NotificationCenter.default.post(name: .viezanOpenRoute, object: "translate") }
                            .buttonStyle(.vznOutline).disabled(!store.moduleEnabled("translate"))
                    }
                }.padding(metric("gutter")).frame(maxWidth: .infinity, alignment: .leading)
                    .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("largeRadius")))
                    .overlay(RoundedRectangle(cornerRadius: metric("largeRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
                    .shadow(color: Color(nsColor: .shadowColor).opacity(metric("overlayShadowOpacity")), radius: metric("small"), y: metric("tight"))
            }.padding(.top, metric("gap"))
        } else {
            VStack(alignment: .leading, spacing: metric("inset")) {
                Text(store.text("launcherPitch")).font(.vzn("titleScale", .bold))
                Text(store.text("launcherPitchDetail")).font(.vzn("labelScale")).foregroundStyle(.secondary).lineSpacing(metric("tight")).fixedSize(horizontal: false, vertical: true)
                Button(store.text("openLauncher"), systemImage: "magnifyingglass") { store.desktopIntegration.onAction?("launcher") }.buttonStyle(.vznPrimary)
            }.padding(metric("gutter")).frame(maxWidth: .infinity, alignment: .leading)
                .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("largeRadius")))
                .overlay(RoundedRectangle(cornerRadius: metric("largeRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
                .padding(.top, metric("gutter"))
        }
    }
}
