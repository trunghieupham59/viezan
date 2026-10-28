import SwiftUI
import ViezanDomain

struct DesktopWorkspace: View {
    @Bindable var store: WorkbenchStore
    let route: String
    @State private var bridgeOpen = false
    @Environment(\.colorScheme) private var scheme
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
        .sheet(isPresented: $bridgeOpen) {
            VStack(alignment: .leading, spacing: metric("inset")) {
                HStack {
                    Text(store.text("connections")).font(.vzn("titleScale", .bold))
                    Spacer()
                    Button(store.text("close")) { bridgeOpen = false }.keyboardShortcut(.cancelAction)
                }
                ScrollView { BridgeSettings(store: store) }
            }.padding(metric("gutter")).frame(width: metric("reading"), height: metric("editor") * 3)
        }
    }
    @ViewBuilder private var primary: some View {
        if route == "everywhere" {
            CardSection(title: store.text("translateSelection")) {
                DesktopSettings(store: store, route: route)
                CardRow(title: store.text("chromeConnect"), detail: store.text("chromeConnectHint")) {
                    Button(store.text(store.extensionBridge.listening ? "enabled" : "connect")) { bridgeOpen = true }
                }
                Text(store.text("localModelNote")).font(.vzn("labelScale")).fixedSize(horizontal: false, vertical: true)
                    .padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
                    .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("radius")))
                    .padding(.top, metric("small"))
            }
        } else {
            CardSection(title: store.text("allShortcuts")) {
                DesktopSettings(store: store, route: route)
                CardRow(title: store.text("commands"), detail: store.text("shortcutDetail_commands"), divider: false) { KeyCap(text: "⌘ K") }
            }
        }
    }
    @ViewBuilder private var secondary: some View {
        if route == "everywhere" {
            // Illustrative preview of the quick translate window; actions stay real.
            VStack(alignment: .leading, spacing: metric("gap")) {
                Eyebrow(text: store.text("quickPreview"))
                VStack(alignment: .leading, spacing: metric("gap")) {
                    StatusBadge(text: store.text("lang_en") + " → " + store.text("lang_" + store.text("previewTarget")), tone: .ready)
                    Text(store.text("previewSource")).foregroundStyle(.secondary)
                    Text(store.text("previewTranslated")).font(.vzn("titleScale", .bold)).fixedSize(horizontal: false, vertical: true)
                    Text(nativeModelLabel(store.session.model, store: store)).font(.vzn("smallScale")).foregroundStyle(.secondary)
                    HStack(spacing: metric("small")) {
                        Button(store.text("openInTranslate")) {
                            let id = store.createDetachedSession(feature: .translate, draft: store.text("previewSource")); store.select(id); store.setRoute("translate")
                        }.buttonStyle(.vznPrimary)
                        Button(store.text("copy"), systemImage: "doc.on.doc") {
                            NSPasteboard.general.clearContents(); NSPasteboard.general.setString(store.text("previewTranslated"), forType: .string)
                        }.buttonStyle(.vznQuiet)
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
