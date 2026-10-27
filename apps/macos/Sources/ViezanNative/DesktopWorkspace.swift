import SwiftUI
import ViezanDomain

struct DesktopWorkspace: View {
    let store: WorkbenchStore
    let route: String
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metric("gutter")) {
                Text(store.text(route == "everywhere" ? "everywhereSubtitle" : "utilitiesSubtitle")).foregroundStyle(.secondary)
                GroupBox(store.text("allShortcuts")) {
                    DesktopSettings(store: store, route: route).frame(maxWidth: .infinity, alignment: .leading).padding(metric("small"))
                }
                if route == "everywhere" {
                    GroupBox(store.text("connections")) {
                        BridgeSettings(store: store).frame(maxWidth: .infinity, alignment: .leading).padding(metric("small"))
                    }
                }
            }.frame(maxWidth: metric("reading"), alignment: .leading).frame(maxWidth: .infinity).padding(metric("gutter"))
        }
    }
}
