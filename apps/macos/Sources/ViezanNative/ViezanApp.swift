import SwiftUI
import Darwin
import ViezanDomain

let nativeResources = NativeResources.shared
func metric(_ key: String) -> CGFloat { nativeResources.metric(key) }
@MainActor func readingNSFont(_ store: WorkbenchStore) -> NSFont {
    // Reading text is the "lg" role (14 at medium), scaled by the text-size setting.
    .systemFont(ofSize: NSFont.systemFontSize * metric("labelScale") * nativeResources.textScales[store.workspace.preferences.textSize.rawValue]!)
}
@MainActor func readingFont(_ store: WorkbenchStore) -> Font { Font(readingNSFont(store)) }

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    var store: WorkbenchStore?
    var desktopPanels: DesktopPanels?
    var window: NSWindow?
    func applicationWillFinishLaunching(_ notification: Notification) {
        guard let identifier = Bundle.main.bundleIdentifier,
              let other = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) else { return }
        other.activate(options: [.activateAllWindows]); NSApp.terminate(nil)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window?.makeKeyAndOrderFront(nil) }; return true
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if store?.localPerformance.busy == true { store?.localPerformance.cancel(); return .terminateCancel }
        store?.shutdown()
        return store?.storageError != nil && store?.loadBlocked == false ? .terminateCancel : .terminateNow
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

@main struct ViezanApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var store: WorkbenchStore
    init() {
        if let identifier = Bundle.main.bundleIdentifier, let other = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            other.activate(options: [.activateAllWindows]); Darwin.exit(0)
        }
        _store = State(initialValue: WorkbenchStore(persistence: FilePersistence(url: FilePersistence.previewURL())))
    }
    @State private var screen = "home"
    @State private var shell = ShellPresentation()
    var body: some Scene {
        Window("Viezan", id: "workbench") {
            WorkbenchView(store: store, screen: $screen, shell: shell) { window in delegate.window = window; window.isReleasedWhenClosed = false }
                .preferredColorScheme(store.workspace.preferences.preset == "midnight" ? .dark : store.workspace.preferences.mode == .system ? nil : store.workspace.preferences.mode == .dark ? .dark : .light)
                .onChange(of: store.workspace.preferences, initial: true) { _, value in NativeTheme.shared.preferences = value }
                .onReceive(NotificationCenter.default.publisher(for: NSWindow.willCloseNotification)) { notification in
                    guard let closing = notification.object as? NSWindow, closing === delegate.window else { return }
                    store.interpretation.stop(); store.audio.cancel()
                }
                .onAppear {
                    delegate.store = store
                    if delegate.desktopPanels == nil { delegate.desktopPanels = DesktopPanels(store: store) { id in store.select(id); screen = store.session.feature.rawValue; delegate.window?.makeKeyAndOrderFront(nil) } }
                    NSApp.activate(ignoringOtherApps: true)
                }
        }
        .defaultSize(width: metric("sidebar") + metric("reading") + metric("gutter") * 2, height: metric("reading"))
        .windowResizability(.automatic)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button(store.text("settings")) { shell.issue("settings") }.keyboardShortcut(",")
            }
            CommandGroup(replacing: .newItem) {
                Button(store.text("newWork")) { shell.issue("new") }.keyboardShortcut("n")
                    .disabled(store.loadBlocked)
            }
            CommandMenu(store.text("commands")) {
                Button(store.text("commands")) { shell.issue("commands") }.keyboardShortcut("k")
                Button(store.text("toggleNavigation")) { shell.issue("navigation") }.keyboardShortcut("\\")
                Divider()
                Button(store.text("home")) { shell.issue("home") }.keyboardShortcut("0").disabled(store.loadBlocked)
                Button(store.text("chat")) { shell.issue("chat") }.keyboardShortcut("1").disabled(store.loadBlocked)
                Button(store.text("translate")) { shell.issue("translate") }.keyboardShortcut("2").disabled(store.loadBlocked)
                Button(store.text("dictionary")) { shell.issue("dictionary") }.keyboardShortcut("3").disabled(store.loadBlocked)
                Divider()
                Button(store.text("history")) { shell.issue("history") }.keyboardShortcut("h", modifiers: [.command, .shift]).disabled(store.loadBlocked || (screen == "settings" || screen == "home") || shell.library)
                Button(store.text("activity")) { shell.issue("activity") }.keyboardShortcut("a", modifiers: [.command, .shift])
            }

        }
        MenuBarExtra {
            Button(store.text("openMain")) { delegate.window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
            ForEach(["quickChat", "translateSelection", "launcher"], id: \.self) { action in
                Button(store.text(action)) { store.desktopIntegration.onAction?(action) }
            }
            Divider()
            if store.moduleEnabled("thermal") {
                Menu(store.text("thermal")) {
                    Button(store.text(store.thermalMonitor.monitoring ? "stop" : "startMonitoring")) { if store.thermalMonitor.monitoring { store.thermalMonitor.stop() } else { store.thermalMonitor.start() } }
                    ForEach(store.thermalMonitor.profiles) { profile in Button(store.text(profile.name)) { store.thermalMonitor.applyProfile(profile.id) }.disabled(!store.thermalMonitor.monitoring || store.thermalMonitor.calibrating) }
                    Button(store.text("restoreAutomatic")) { store.thermalMonitor.restoreAutomatic() }
                }
            }
            Button(store.text("quit")) { NSApp.terminate(nil) }
        } label: {
            HStack {
                Image(systemName: "bubble.left.and.text.bubble.right")
                if store.thermalMonitor.monitoring, let temperature = store.thermalMonitor.snapshot?.sensors?.map(\.celsius).max() { Text(String(format: "%.0f °C", temperature)) }
            }.accessibilityLabel("Viezan")
        }
    }
}

struct WorkbenchView: View {
    @Bindable var store: WorkbenchStore
    @Binding var screen: String
    @Bindable var shell: ShellPresentation
    var windowReady: (NSWindow) -> Void = { _ in }
    @State private var window: NSWindow?
    @State private var compact = false
    @State private var historyAnchor: CGFloat?
    @State private var composerFocus = 0
    @Environment(\.colorScheme) private var scheme
    private var settings: Bool { ["settings", "utilities", "everywhere", "thermal", "interpret", "apps"].contains(screen) }
    private var home: Bool { screen == "home" }
    private var workspacePage: Bool { home || ["everywhere", "apps", "thermal", "utilities"].contains(screen) }
    private var title: String { home ? store.text("home") : screen == "interpret" ? store.text("interpret") + " / " + (store.interpretation.current.map { Date(timeIntervalSince1970: $0.created).formatted(date: .abbreviated, time: .shortened) } ?? store.text("newInterpretation")) : settings ? store.text(screen) : shell.library ? store.text("history") : store.text(store.workspace.feature.rawValue) + " / " + store.title(store.session) }
    private func dismissOverlay() {
        if let editor = window?.firstResponder as? NSTextView, editor.hasMarkedText() { return }
        shell.dismiss()
    }
    private func select(_ route: String) {
        guard store.moduleEnabled(route) else { return }
        shell.dismiss(returnFocus: shell.overlay == .navigation)
        shell.library = false; screen = route
    }
    private func execute(_ command: String) {
        if nativeResources.navigation.contains(where: { $0.id == command }) { if !store.loadBlocked || command == "settings" { select(command) } }
        else if command == "navigation" {
            if compact { shell.show(.navigation, from: window?.firstResponder) }
            else { shell.dismiss(); store.setNavigationCollapsed(!store.workspace.navigationCollapsed) }
        } else if command == "commands" { shell.show(.commands, from: window?.firstResponder) }
        else if command == "new", !store.loadBlocked {
            shell.dismiss(returnFocus: false); shell.library = false; if home || settings { store.navigate(.chat) }; store.newSession(); screen = store.workspace.feature.rawValue; composerFocus += 1
        } else if command == "history", !home, !settings, !shell.library, !store.loadBlocked { shell.show(.history, from: window?.firstResponder) }
        else if command == "activity" { shell.show(.activity, from: window?.firstResponder) }
    }
    var body: some View {
        GeometryReader { geometry in
            let layout = ShellLayout(width: geometry.size.width, height: geometry.size.height - ShellLayout.headerHeight, collapsed: store.workspace.navigationCollapsed)
            // Review 18: no titlebar band. Window controls and the navigation toggle
            // share the sidebar's first row; the context header aligns with it.
            VStack(spacing: 0) {
                ZStack(alignment: .topLeading) {
                    HStack(spacing: 0) {
                        VStack(spacing: 0) {
                            sidebarTop(layout)
                            NativeNavigation(store: store, screen: screen, expanded: !layout.compact && !store.workspace.navigationCollapsed, select: select, commands: { execute("commands") })
                        }.frame(width: layout.navigationWidth)
                        ChromeDivider(vertical: true)
                        VStack(spacing: 0) {
                            header(layout)
                            if let error = store.storageError {
                                ViewThatFits(in: .horizontal) {
                                    HStack(alignment: .top, spacing: metric("inset")) { storageMessage(error); Spacer(minLength: metric("small")); retryStorage }
                                    VStack(alignment: .leading, spacing: metric("small")) { storageMessage(error); retryStorage }
                                }.padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading).background(contentColor("canvas", scheme)).accessibilityElement(children: .contain)
                                Divider()
                            }
                            if store.audio.recordingOwner != nil || store.audio.transcribingOwner != nil {
                                HStack { Text(store.text(store.audio.recordingOwner != nil ? "record" : "running")); Spacer(); Button(store.text("stop"), role: .destructive) { store.audio.cancel() } }.padding(metric("small"))
                            }
                            if store.interpretation.busy && screen != "interpret" {
                                HStack {
                                    Label(store.text("interpret"), systemImage: "waveform")
                                    Text(store.text(store.interpretation.listening || store.interpretation.starting ? "record" : "running")).foregroundStyle(.secondary)
                                    Spacer()
                                    Button(store.text("open")) { select("interpret") }
                                    Button(store.text("stop"), role: .destructive) {
                                        if store.interpretation.listening || store.interpretation.starting { store.interpretation.stop() } else { store.interpretation.cancel() }
                                    }
                                }.padding(metric("small"))
                            }
                            if home {
                                HomeWorkspace(store: store, start: { feature in
                                    store.navigate(feature); store.newSession(); screen = feature.rawValue; composerFocus += 1
                                }, resume: { id in
                                    store.select(id); screen = store.workspace.feature.rawValue; composerFocus += 1
                                }, settings: { select("settings") }, interpret: { select("interpret") })
                            }
                            else if screen == "apps" { ApplicationsWorkspace(store: store) }
                            else if screen == "interpret" {
                                    InterpretationWorkspace(store: store)
                                } else if screen == "thermal" { ThermalWorkspace(store: store) }
                            else if screen == "utilities" || screen == "everywhere" { DesktopWorkspace(store: store, route: screen) }
                            else if settings { NativeSettings(store: store, query: $shell.settingsQuery, section: $shell.settingsSection) }
                            else if shell.library { HistoryLibrary(store: store, initialFavorites: shell.libraryFavorites) { shell.library = false; shell.libraryFavorites = false } }
                            else {
                                if store.recovered { Text(store.text("recovered")).font(.caption).foregroundStyle(.secondary).padding(.horizontal, metric("gutter")) }
                                Group {
                                    if store.workspace.feature == .chat { ChatWorkspace(store: store, focusEpoch: composerFocus) }
                                    else { TranslationWorkspace(store: store, focusEpoch: composerFocus) }
                                }.disabled(store.loadBlocked)
                            }
                        }.frame(maxWidth: .infinity, maxHeight: .infinity).background(contentColor("surface", scheme))
                    }
                    if let overlay = shell.overlay {
                        // Deliberate native hit surface: outside click closes the temporary layer.
                        Button(action: dismissOverlay) { Color.clear.contentShape(Rectangle()) }
                            .buttonStyle(.plain).accessibilityHidden(true).focusable(false)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        if overlay == .navigation {
                            NativeNavigation(store: store, screen: screen, expanded: true, select: select, commands: { execute("commands") }, close: dismissOverlay)
                                .frame(width: layout.navigationOverlayWidth)
                                .frame(maxHeight: .infinity)
                                .overlay(alignment: .trailing) { ChromeDivider(vertical: true) }
                                .shadow(color: Color(nsColor: .shadowColor).opacity(metric("overlayShadowOpacity")), radius: metric("inset"), y: metric("small"))
                                .accessibilityIdentifier("navigation-overlay")
                        } else {
                            Group {
                                if overlay == .history {
                                    QuickHistory(store: store, select: { id in store.select(id); shell.dismiss(); }, all: { shell.dismiss(returnFocus: false); shell.library = true }, dismiss: dismissOverlay, availableHeight: layout.panelHeight)
                                } else if overlay == .activity {
                                    ActivityView(store: store, open: { id in store.select(id); screen = store.workspace.feature.rawValue; shell.library = false; shell.dismiss() }, dismiss: dismissOverlay, availableHeight: layout.panelHeight)
                                } else { NativeCommands(store: store, historyAvailable: !home && !settings && !shell.library, availableHeight: min(metric("editor") * 3, layout.height + ShellLayout.headerHeight - metric("inset") * 2), execute: execute, dismiss: dismissOverlay) }
                            }.frame(width: layout.panelWidth, alignment: .top)
                                .background { ReadingPanelSurface() }
                                .offset(x: overlay == .commands ? (geometry.size.width - layout.panelWidth) / 2 : layout.panelX(anchor: overlay == .history ? historyAnchor : nil), y: (overlay == .commands ? 0 : ShellLayout.headerHeight) + metric("inset"))
                        }
                    }
                }
                // Transient navigation/panel shadows belong below system chrome.
                .clipped()
            }
            .onAppear { compact = layout.compact }
            .onChange(of: layout.compact) { _, value in compact = value; if shell.overlay == .navigation { shell.dismiss() } }
        }
        .coordinateSpace(name: "workbench")
        .onPreferenceChange(HistoryAnchorPreference.self) { historyAnchor = $0 }
        .frame(minWidth: metric("minWindowWidth"), minHeight: metric("minWindowHeight"))
        .ignoresSafeArea(.container, edges: .top)
        // Launch without a focused toolbar control; Tab still enters the shell.
        .background(WindowReference { window in self.window = window; windowReady(window); if window.firstResponder is NSButton { window.makeFirstResponder(nil) } })
        .buttonStyle(.vznOutline)
        .tint(chromeColor("action", scheme))
        .navigationTitle(title)
        .onExitCommand(perform: dismissOverlay)
        .onChange(of: shell.request) { _, request in if let request { execute(request.command) } }
        .onChange(of: screen) { _, value in
            shell.dismiss(returnFocus: false); shell.library = false
            store.setRoute(value)
            if let feature = Feature(rawValue: value) { store.navigate(feature) }
        }
        .onAppear { screen = store.workspace.shell?.lastRoute ?? "home" }
        .onChange(of: store.workspace.feature) { _, value in screen = value.rawValue }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.willCloseNotification)) { notification in
            if let source = notification.object as? NSWindow, source === window { store.interpretation.cancel(); store.audio.cancel(); store.thermalMonitor.stop() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .viezanOpenSettings)) { notification in
            shell.settingsQuery = ""; shell.settingsSection = notification.object as? String
            select("settings")
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didResignKeyNotification)) { notification in
            if let source = notification.object as? NSWindow, source === window { shell.dismiss(returnFocus: false) }
        }
    }
    private func navigationToggle(_ layout: ShellLayout) -> some View {
            ShellToolbarButton(label: store.text((layout.compact ? shell.overlay != .navigation : store.workspace.navigationCollapsed) ? "expandNavigation" : "collapseNavigation"), symbol: "sidebar.left", identifier: "navigation-toggle", expanded: layout.compact ? shell.overlay == .navigation : !store.workspace.navigationCollapsed, hint: "⌘\\", focusEpoch: shell.focusEpochs["navigation", default: 0]) { execute("navigation") }
                .frame(width: metric("control"), height: metric("control"))
    }
    // Rail widths cannot hold the window controls; the toggle then leads the header.
    private func railChrome(_ layout: ShellLayout) -> Bool { layout.navigationWidth < metric("trafficLights") + metric("control") + metric("small") }
    private func sidebarTop(_ layout: ShellLayout) -> some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            if !railChrome(layout) { navigationToggle(layout).padding(.trailing, metric("small")) }
        }.frame(height: ShellLayout.headerHeight)
            .background { ChromeSurface().overlay { WindowDragRegion() } }
    }
    private func header(_ layout: ShellLayout) -> some View {
        HStack(spacing: metric("small")) {
            if railChrome(layout) { navigationToggle(layout) }
            if shell.library {
                ShellToolbarButton(label: store.text("back"), symbol: "arrow.left", identifier: "history-back") {
                    shell.library = false
                    shell.focusEpochs["history", default: 0] += 1
                }
                    .frame(width: metric("control"), height: metric("control"))
            }
            breadcrumb.frame(maxWidth: .infinity, alignment: .leading).help(title)
            HStack(spacing: metric("small")) {
                if screen == "settings" {
                    HistorySearch(query: $shell.settingsQuery, label: store.text("settingsSearch"), cancel: { shell.settingsQuery = "" }, autofocus: false)
                        .frame(width: metric("sidebar"), height: metric("compactControl"))
                }
                if workspacePage && store.moduleEnabled("utilities") {
                    ShellToolbarButton(label: store.text("launcher"), symbol: "command", identifier: "launcher-open", showsLabel: !layout.compact, enabled: !store.loadBlocked) { store.desktopIntegration.onAction?("launcher") }
                }
                if screen == "interpret" {
                    ShellToolbarButton(label: store.text("summarizeShort"), symbol: "sparkles", identifier: "interpret-summarize", showsLabel: !layout.compact, enabled: !store.interpretation.busy && !(store.interpretation.current?.segments.isEmpty ?? true)) { store.interpretation.summarize(kind: "summary") }
                    ShellToolbarButton(label: store.text("history"), symbol: "clock", identifier: "interpret-history", showsLabel: !layout.compact, enabled: !store.interpretation.busy) { NotificationCenter.default.post(name: .viezanInterpretHistory, object: nil) }
                    ShellToolbarButton(label: store.text("newInterpretation"), symbol: "plus", identifier: "interpret-new", showsLabel: !layout.compact, soft: true, enabled: !store.interpretation.busy) { store.interpretation.clearSelection() }
                    ChromeDivider(vertical: true).frame(height: metric("compactControl"))
                }
                if !home && !settings && !shell.library && store.workspace.feature == .translate {
                    ShellToolbarButton(label: store.text("addImage"), symbol: "photo", identifier: "translate-add-image", showsLabel: !layout.compact, enabled: !store.loadBlocked && (store.session.images ?? []).isEmpty) { NotificationCenter.default.post(name: .viezanAttachImage, object: nil) }
                }
                if !home && !settings && !shell.library && store.workspace.feature == .dictionary {
                    ShellToolbarButton(label: store.text("savedWords"), symbol: "books.vertical", identifier: "dictionary-saved", showsLabel: !layout.compact, enabled: !store.loadBlocked) { shell.libraryFavorites = true; shell.library = true }
                }
                if !home && !settings && !shell.library {
                    ShellToolbarButton(label: store.text("history"), symbol: "clock", identifier: "history-toggle", showsLabel: !layout.compact, expanded: shell.overlay == .history, hint: "⌘⇧H", enabled: !store.loadBlocked, focusEpoch: shell.focusEpochs["history", default: 0]) { execute("history") }
                        .background { GeometryReader { proxy in
                            Color.clear.preference(key: HistoryAnchorPreference.self, value: proxy.frame(in: .named("workbench")).maxX)
                        } }
                    ShellToolbarButton(label: store.text(store.workspace.feature == .chat ? "newChat" : store.workspace.feature == .dictionary ? "newLookup" : "newTranslation"), symbol: "plus", identifier: "new-work", showsLabel: !layout.compact, soft: true, hint: "⌘N", enabled: !store.loadBlocked) { execute("new") }
                    ChromeDivider(vertical: true).frame(height: metric("compactControl"))
                }
                ShellToolbarButton(label: store.text("activity"), symbol: "waveform.path.ecg", identifier: "activity-toggle", showsLabel: !layout.compact, expanded: shell.overlay == .activity, hint: "⌘⇧A", count: store.workspace.tasks.filter { $0.status == .running }.count, focusEpoch: shell.focusEpochs["activity", default: 0]) { execute("activity") }
            }.fixedSize(horizontal: true, vertical: false).frame(height: metric("control")).layoutPriority(1)
                .padding(.trailing, metric("inset"))
        }.padding(.leading, railChrome(layout) ? max(metric("gutter"), metric("trafficLights") - layout.navigationWidth + metric("small")) : metric("gutter"))
            .frame(height: ShellLayout.headerHeight)
            .foregroundStyle(chromeColor("text-strong", scheme))
            .background { contentColor("surface", scheme).overlay(chromeColor("titlebar-material", scheme)).overlay { WindowDragRegion() } }
            .accessibilityElement(children: .contain)
    }
    // Workspace pages read "Workspace / Page"; feature pages read "Feature / Session".
    @ViewBuilder private var breadcrumb: some View {
        if workspacePage {
            HStack(spacing: metric("small")) {
                Text(store.text("workspace")).foregroundStyle(chromeColor("text-muted", scheme))
                Text("/").foregroundStyle(chromeColor("text-soft", scheme)).accessibilityHidden(true)
                Text(store.text(screen)).fontWeight(.semibold)
            }.lineLimit(1).accessibilityElement(children: .combine).accessibilityAddTraits(.isHeader)
        } else {
            Text(title).fontWeight(.semibold).lineLimit(1).truncationMode(.tail).accessibilityAddTraits(.isHeader)
        }
    }
    private func storageMessage(_ key: String) -> some View {
        Label(store.text(key), systemImage: "exclamationmark.triangle.fill")
            .foregroundStyle(Color(nsColor: .systemRed)).fixedSize(horizontal: false, vertical: true)
    }
    private var retryStorage: some View {
        NativePanelButton(label: store.text(store.loadBlocked ? "retryLoad" : "retrySave"),
                          identifier: "storage-retry", role: .primary) { store.loadBlocked ? store.reload() : store.save() }
    }
}

struct ModelPicker: View {
    @Bindable var store: WorkbenchStore
    // Compact: one menu showing the session model; refresh/configure live inside it.
    var compact = false
    // Badge: quiet trailing "✦ Provider · model" (language pages); otherwise composer style.
    var badge = false
    @Environment(\.colorScheme) private var scheme
    @State private var customModel = ""
    @State private var configuring = false
    @State private var modelSessionID = ""
    @State private var customPrompt = ""
    var body: some View {
        if compact { compactMenu.popover(isPresented: $configuring) { configuration } } else { full }
    }
    private var compactMenu: some View {
        HStack(spacing: metric("tight")) {
            Menu {
                Picker(store.text("model"), selection: Binding(get: { store.session.model }, set: { store.setModel(store.session.id, $0) })) {
                    ForEach(store.availableModels, id: \.self) { id in Text(nativeModelLabel(id, store: store)).tag(id) }
                }.pickerStyle(.inline)
                Divider()
                Menu(store.text("refreshModels")) {
                    ForEach(["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"], id: \.self) { provider in
                        Button(provider) { Task { await store.refreshModels(provider: provider) } }
                    }
                }.disabled(store.loadingModels)
                Button(store.text("configureModel")) { modelSessionID = store.session.id; customPrompt = store.session.systemPrompt ?? ""; customModel = store.session.model; configuring = true }
            } label: {
                // An offline local runtime shows a red dot inside the chip; ProviderNotice carries the words.
                if badge { ModelBadgeLabel(text: nativeModelLabel(store.session.model, store: store), offline: runtimeOffline(store.session.model, store: store)).foregroundStyle(contentColor("text-muted", scheme)) }
                else {
                    HStack(spacing: metric("small")) {
                        if runtimeOffline(store.session.model, store: store) { StatusDot(tone: .failed) }
                        Label(nativeModelLabel(store.session.model, store: store), systemImage: "chevron.down").labelStyle(ModelMenuLabelStyle()).font(.vzn("labelScale"))
                    }
                }
            }.menuStyle(.button).buttonStyle(.vznQuiet).menuIndicator(.hidden).fixedSize()
                .help(store.session.model).accessibilityLabel(store.text("model") + ": " + store.session.model + (runtimeOffline(store.session.model, store: store) ? ", " + store.text("unavailable") : ""))

            if store.loadingModels { ProgressView().controlSize(.small) }
            if let error = store.modelError { Image(systemName: "exclamationmark.triangle").foregroundStyle(.secondary).help(store.text(error)).accessibilityLabel(store.text(error)) }
        }
    }
    private var full: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            HStack(spacing: metric("small")) {
                Picker(store.text("model"), selection: Binding(get: { store.session.model }, set: { store.setModel(store.session.id, $0) })) {
                    ForEach(store.availableModels, id: \.self) { id in
                        Text(nativeModelLabel(id, store: store)).tag(id)
                    }
                }.labelsHidden().pickerStyle(.menu)
                    .help(store.session.model).accessibilityLabel(store.text("model"))
                Menu {
                    ForEach(["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"], id: \.self) { provider in
                        Button(provider) { Task { await store.refreshModels(provider: provider) } }
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }.disabled(store.loadingModels).help(store.text("refreshModels"))
                    .accessibilityLabel(store.text("refreshModels"))
                Button { modelSessionID = store.session.id; customPrompt = store.session.systemPrompt ?? ""; customModel = store.session.model; configuring = true } label: { Image(systemName: "slider.horizontal.3") }
                    .buttonStyle(.vznQuiet).help(store.text("configureModel")).accessibilityLabel(store.text("configureModel"))
                if store.loadingModels { ProgressView().controlSize(.small) }
            }
            if let error = store.modelError {
                Text(store.text(error)).font(.caption).foregroundStyle(.secondary)
            }
        }.frame(maxWidth: metric("sidebar"))
            .popover(isPresented: $configuring) { configuration }
    }
    private var configuration: some View {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    TextField(store.text("modelID"), text: $customModel)
                    Text(store.text("modelIDHint")).font(.caption)
                    Button(store.text("apply")) {
                        store.setModel(modelSessionID, customModel.trimmingCharacters(in: .whitespacesAndNewlines)); store.setSystemPrompt(modelSessionID, customPrompt); configuring = false
                    }.disabled(!NativeModel.valid(customModel.trimmingCharacters(in: .whitespacesAndNewlines)))
                    TextField(store.text("systemPrompt"), text: $customPrompt, axis: .vertical)
                    PromptLibrary(store: store, text: $customPrompt)
                }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"))
    }
}

// Chevron before the model label, matching the composer's model control.
struct ModelMenuLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: metric("small")) { configuration.icon.imageScale(.small); configuration.title.lineLimit(1) }
    }
}
