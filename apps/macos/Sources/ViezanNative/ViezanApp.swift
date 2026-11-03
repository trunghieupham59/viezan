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
    #if DEBUG
    @State private var development = DevelopmentReload()
    #endif
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
                    // Find which local runtimes and keyed cloud providers this device can use.
                    store.discoverProviders()
                    if delegate.desktopPanels == nil {
                        delegate.desktopPanels = DesktopPanels(store: store,
                            openMain: { id in store.select(id); screen = store.session.feature.rawValue; NSApp.activate(); delegate.window?.makeKeyAndOrderFront(nil) },
                            openRoute: { route in screen = route; NSApp.activate(); delegate.window?.makeKeyAndOrderFront(nil) })
                    }
                    NSApp.activate(ignoringOtherApps: true)
                }
        }
        .defaultSize(width: metric("sidebar") + metric("reading") + metric("gutter") * 2, height: metric("reading"))
        .windowResizability(.automatic)
        .windowStyle(.hiddenTitleBar)
        .commands {
            #if DEBUG
            CommandMenu(store.text("devMenu")) {
                Button(store.text(development.building ? "devRebuilding" : "devReload")) {
                    development.reload(store: store)
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
                .disabled(development.building || !development.available)
                Button(store.text("devOpenBuildLog")) { development.openLog() }
                    .disabled(!development.available)
            }
            #endif
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
                    Button(store.text("openThermal")) { delegate.window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); NotificationCenter.default.post(name: .viezanOpenRoute, object: "thermal") }
                    Toggle(store.text("menuBarTemperature"), isOn: Binding(get: { store.menuBarTemperature }, set: { store.menuBarTemperature = $0 }))
                    Divider()
                    Button(store.text(store.thermalMonitor.monitoring ? "stop" : "startMonitoring")) { if store.thermalMonitor.monitoring { store.thermalMonitor.stop() } else { store.thermalMonitor.start() } }
                    ForEach(store.thermalMonitor.profiles) { profile in Button(store.text(profile.name)) { store.thermalMonitor.applyProfile(profile.id) }.disabled(!store.thermalMonitor.monitoring || store.thermalMonitor.calibrating) }
                    Button(store.text("restoreAutomatic")) { store.thermalMonitor.restoreAutomatic() }
                }
            }
            Button(store.text("quit")) { NSApp.terminate(nil) }
        } label: {
            HStack {
                Image(systemName: "bubble.left.and.text.bubble.right")
                if store.menuBarTemperature, store.thermalMonitor.monitoring, let temperature = store.thermalMonitor.snapshot?.sensors?.map(\.celsius).max() { Text(String(format: "%.0f °C", temperature)) }
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
    /// Where the control that asked for the open layer was (window coordinates, AppKit origin).
    @State private var layerAnchor: CGRect?
    @State private var composerFocus = 0
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var glassNavigation: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var lightGlass: Bool { glassNavigation && scheme == .light }
    private var navigationAnimation: Animation? { reduceMotion ? nil : .easeOut(duration: metric("durationNormal")) }
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
            if compact { if shell.overlay == .navigation { dismissOverlay() } else { shell.show(.navigation, from: window?.firstResponder) } }
            else {
                shell.dismiss()
                // The column resizes and labels fade together; Reduce Motion switches at once.
                withAnimation(navigationAnimation) { store.setNavigationCollapsed(!store.workspace.navigationCollapsed) }
            }
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
                            .background {
                                if glassNavigation { SidebarSurface() }
                            }
                            // The temporary pane replaces the rail visually and
                            // in accessibility, avoiding doubled glass and rows.
                            .opacity(glassNavigation && shell.overlay == .navigation ? 0 : 1)
                            .accessibilityHidden(shell.overlay == .navigation)
                            // Explicit value animation: the column and its labels move together on every path (⌘\, menu, button).
                            .animation(navigationAnimation, value: store.workspace.navigationCollapsed)
                        Group {
                            if glassNavigation { Color.clear.frame(width: metric("hairline")) }
                            else { ChromeDivider(vertical: true) }
                        }
                        VStack(spacing: 0) {
                            header(layout)
                            VStack(spacing: 0) {
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
                                if store.recovered { Text(store.text("recovered")).font(.vzn("captionScale")).foregroundStyle(.secondary).padding(.horizontal, metric("gutter")) }
                                Group {
                                    if store.workspace.feature == .chat { ChatWorkspace(store: store, focusEpoch: composerFocus) }
                                    else { TranslationWorkspace(store: store, focusEpoch: composerFocus) }
                                }.disabled(store.loadBlocked)
                            }
                            }.frame(maxWidth: .infinity, maxHeight: .infinity)
                                .modifier(WorkspaceSurface(compact: layout.compact))
                        }.frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    if let overlay = shell.overlay {
                        // Deliberate native hit surface: outside click closes the temporary layer.
                        Button(action: dismissOverlay) { Color.clear.contentShape(Rectangle()) }
                            .buttonStyle(.plain).accessibilityHidden(true).focusable(false)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        if [.models, .tools, .instructions].contains(overlay), let anchor = layerAnchor {
                            // Choose the side with enough space, then bound the
                            // panel to that side. A centred empty composer has
                            // less room below it than the whole stage height.
                            let width = min(metric("sidebar") + metric("editor"), geometry.size.width - metric("inset") * 2)
                            let idealHeight = metric("editor") * 3
                            let top = geometry.size.height - anchor.maxY
                            let above = max(0, top - metric("small") - ShellLayout.headerHeight - metric("inset"))
                            let below = max(0, anchor.minY - metric("small") - metric("inset"))
                            let fitsAbove = above >= idealHeight || above >= below
                            let height = min(idealHeight, fitsAbove ? above : below)
                            // The panel hugs its content inside a slot of the maximum height; the slot is
                            // aligned so the panel's edge stays against the control whatever its height.
                            Group {
                                if overlay == .models {
                                    ModelPanel(store: store, dismiss: dismissOverlay, availableHeight: height)
                                } else if overlay == .instructions {
                                    InstructionsPanel(store: store, dismiss: dismissOverlay, availableHeight: height)
                                } else {
                                    ComposerToolsPanel(store: store, dismiss: dismissOverlay, availableHeight: height)
                                }
                            }
                                // Layers are short lists: no legacy scroller track; the wheel still scrolls.
                                .scrollIndicators(.hidden)
                                .frame(width: width).background { ReadingPanelSurface() }
                                .frame(height: height, alignment: fitsAbove ? .bottom : .top)
                                .offset(x: max(metric("inset"), min(anchor.midX - width / 2, geometry.size.width - width - metric("inset"))),
                                        y: fitsAbove ? top - metric("small") - height : geometry.size.height - anchor.minY + metric("small"))
                        } else if overlay == .navigation {
                            // The first row stays clear for the window controls and the fixed toggle.
                            VStack(spacing: 0) {
                                Color.clear.frame(height: glassNavigation ? ShellLayout.headerHeight : ShellLayout.titlebarHeight)
                                    .background { if !glassNavigation { ChromeSurface() } }
                                NativeNavigation(store: store, screen: screen, expanded: true, select: select, commands: { execute("commands") }, close: dismissOverlay)
                            }.frame(width: layout.navigationOverlayWidth)
                                .frame(maxHeight: .infinity)
                                .background { if glassNavigation { SidebarSurface() } }
                                .overlay(alignment: .trailing) {
                                    if !glassNavigation { ChromeDivider(vertical: true) }
                                }
                                .shadow(color: Color(nsColor: .shadowColor).opacity(glassNavigation ? 0 : metric("overlayShadowOpacity")), radius: metric("inset"), y: metric("small"))
                                .accessibilityIdentifier("navigation-overlay")
                        } else {
                            Group {
                                if overlay == .history {
                                    QuickHistory(store: store, select: { id in store.select(id); shell.dismiss(); }, all: { shell.dismiss(returnFocus: false); shell.library = true }, dismiss: dismissOverlay, availableHeight: layout.panelHeight)
                                } else if overlay == .activity {
                                    ActivityView(store: store, open: { id in store.select(id); screen = store.workspace.feature.rawValue; shell.library = false; shell.dismiss() }, openRoute: { route in shell.dismiss(); select(route) }, dismiss: dismissOverlay, availableHeight: layout.panelHeight)
                                } else { NativeCommands(store: store, historyAvailable: !home && !settings && !shell.library, availableHeight: min(metric("editor") * 3, layout.height + ShellLayout.headerHeight - metric("inset") * 2), execute: execute, dismiss: dismissOverlay) }
                            }.scrollIndicators(.hidden).frame(width: layout.panelWidth, alignment: .top)
                                .background { ReadingPanelSurface() }
                                .offset(x: overlay == .commands ? (geometry.size.width - layout.panelWidth) / 2 : layout.panelX(anchor: overlay == .history ? historyAnchor : nil), y: (overlay == .commands ? 0 : ShellLayout.headerHeight) + metric("inset"))
                        }
                    }
                }
                .background {
                    if lightGlass {
                        LinearGradient(colors: [chromeColor("titlebar-bg", scheme), chromeColor("app-bg", scheme)],
                                       startPoint: .topTrailing, endPoint: .bottomLeading)
                            .allowsHitTesting(false).accessibilityHidden(true)
                    }
                }
                // Transient navigation/panel shadows belong below system chrome.
                .clipped()
                // Finder rule: the toggle keeps one window position whichever column is beneath it.
                .overlay(alignment: .topLeading) { navigationToggle(layout).padding(.leading, Self.toggleLeading).frame(height: ShellLayout.headerHeight) }
                // Feedback for whole actions (Undo, export/backup errors) sits at the bottom-right corner.
                .overlay(alignment: .bottomTrailing) { ToastStack(store: store).padding(metric("inset")) }
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
        .sheet(isPresented: Binding(get: { store.updatePrompt != nil }, set: { if !$0 { store.dismissUpdatePrompt() } })) { UpdatePrompt(store: store) }
        .environment(\.shellLayer, shell.overlay)
        .onReceive(NotificationCenter.default.publisher(for: .viezanOpenModels)) { note in
            if shell.overlay == .models { dismissOverlay(); return }
            layerAnchor = (note.object as? NSValue)?.rectValue
            shell.show(.models, from: window?.firstResponder)
        }
        .onReceive(NotificationCenter.default.publisher(for: .viezanOpenTools)) { note in
            if shell.overlay == .tools { dismissOverlay(); return }
            layerAnchor = (note.object as? NSValue)?.rectValue
            shell.show(.tools, from: window?.firstResponder)
        }
        // Reached from the tools layer, so it keeps that layer's anchor (the "+" control).
        .onReceive(NotificationCenter.default.publisher(for: .viezanOpenInstructions)) { _ in shell.show(.instructions, from: window?.firstResponder) }
        .onReceive(NotificationCenter.default.publisher(for: .viezanOpenRoute)) { notification in
            if let route = notification.object as? String { select(route) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .viezanOpenSettings)) { notification in
            shell.settingsQuery = ""; shell.settingsSection = notification.object as? String
            select("settings")
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didResignKeyNotification)) { notification in
            if let source = notification.object as? NSWindow, source === window { shell.dismiss(returnFocus: false) }
        }
    }
    // The glyph states the column: leading half filled while it shows, outlined once it is hidden.
    static func navigationSymbol(open: Bool) -> String { open ? "rectangle.leadinghalf.inset.filled" : "sidebar.leading" }
    private func navigationToggle(_ layout: ShellLayout) -> some View {
        let open = layout.compact ? shell.overlay == .navigation : !store.workspace.navigationCollapsed
        return ShellToolbarButton(label: store.text(open ? "collapseNavigation" : "expandNavigation"), symbol: Self.navigationSymbol(open: open), identifier: "navigation-toggle", expanded: open, hint: "⌘\\", focusEpoch: shell.focusEpochs["navigation", default: 0]) { execute("navigation") }
                .frame(width: metric("control"), height: metric("control"))
    }
    /// Window x of the toggle: right after the traffic lights, in every state and width.
    static var toggleLeading: CGFloat { metric("trafficLights") + metric("gap") }
    private static var toggleTrailing: CGFloat { toggleLeading + metric("control") }
    private func sidebarTop(_ layout: ShellLayout) -> some View {
        Color.clear.frame(height: ShellLayout.headerHeight)
            .background { if !glassNavigation { ChromeSurface() } }
            .overlay { WindowDragRegion(alignsWindowControls: true) }
    }
    private func header(_ layout: ShellLayout) -> some View {
        HStack(spacing: metric("small")) {
            if shell.library {
                ShellToolbarButton(label: store.text("back"), symbol: "arrow.left", identifier: "history-back", glass: true) {
                    shell.library = false
                    shell.focusEpochs["history", default: 0] += 1
                }
                    .frame(width: metric("control"), height: metric("control"))
            }
            breadcrumb.frame(maxWidth: .infinity, alignment: .leading).help(title)
            HStack(spacing: metric("small")) {
                if screen == "settings" {
                    SearchBox(query: $shell.settingsQuery, label: store.text("settingsSearch"), cancel: { shell.settingsQuery = "" }, autofocus: false, compact: true)
                        .frame(width: metric("sidebar"))
                }
                if workspacePage && store.moduleEnabled("utilities") {
                    ShellToolbarButton(label: store.text("launcher"), symbol: "command", identifier: "launcher-open", showsLabel: !layout.compact, glass: true, enabled: !store.loadBlocked) { store.desktopIntegration.onAction?("launcher") }
                }
                if screen == "interpret" {
                    ShellToolbarButton(label: store.text("summarizeShort"), symbol: "sparkles", identifier: "interpret-summarize", showsLabel: !layout.compact, glass: true, enabled: !store.interpretation.busy && !(store.interpretation.current?.segments.isEmpty ?? true)) { store.interpretation.summarize(kind: "summary") }
                    ShellToolbarButton(label: store.text("history"), symbol: "clock", identifier: "interpret-history", showsLabel: !layout.compact, glass: true, enabled: !store.interpretation.busy) { NotificationCenter.default.post(name: .viezanInterpretHistory, object: nil) }
                    ShellToolbarButton(label: store.text("newInterpretation"), symbol: "plus", identifier: "interpret-new", showsLabel: !layout.compact, glass: true, soft: true, enabled: !store.interpretation.busy) { store.interpretation.clearSelection() }
                    ChromeDivider(vertical: true).frame(height: metric("compactControl"))
                }
                if !home && !settings && !shell.library && store.workspace.feature == .translate {
                    ShellToolbarButton(label: store.text("addImage"), symbol: "photo", identifier: "translate-add-image", showsLabel: !layout.compact, glass: true, enabled: !store.loadBlocked && (store.session.images ?? []).isEmpty) { NotificationCenter.default.post(name: .viezanAttachImage, object: nil) }
                }
                if !home && !settings && !shell.library && store.workspace.feature == .dictionary {
                    ShellToolbarButton(label: store.text("savedWords"), symbol: "books.vertical", identifier: "dictionary-saved", showsLabel: !layout.compact, glass: true, enabled: !store.loadBlocked) { shell.libraryFavorites = true; shell.library = true }
                }
                if !home && !settings && !shell.library {
                    ShellToolbarButton(label: store.text("history"), symbol: "clock", identifier: "history-toggle", showsLabel: !layout.compact, glass: true, expanded: shell.overlay == .history, hint: "⌘⇧H", enabled: !store.loadBlocked, focusEpoch: shell.focusEpochs["history", default: 0]) { execute("history") }
                        .background { GeometryReader { proxy in
                            Color.clear.preference(key: HistoryAnchorPreference.self, value: proxy.frame(in: .named("workbench")).maxX)
                        } }
                    ShellToolbarButton(label: store.text(store.workspace.feature == .chat ? "newChat" : store.workspace.feature == .dictionary ? "newLookup" : "newTranslation"), symbol: "plus", identifier: "new-work", showsLabel: !layout.compact, glass: true, soft: true, hint: "⌘N", enabled: !store.loadBlocked) { execute("new") }
                    ChromeDivider(vertical: true).frame(height: metric("compactControl"))
                }
                ShellToolbarButton(label: store.text("activity"), symbol: "waveform.path.ecg", identifier: "activity-toggle", showsLabel: !layout.compact, glass: true, expanded: shell.overlay == .activity, hint: "⌘⇧A", count: store.workspace.tasks.filter { $0.status == .running }.count + (store.interpretation.busy ? 1 : 0), focusEpoch: shell.focusEpochs["activity", default: 0]) { execute("activity") }
            }.fixedSize(horizontal: true, vertical: false).frame(height: metric("control")).layoutPriority(1)
                .padding(.trailing, metric("inset"))
        }.padding(.leading, max(metric("gutter"), Self.toggleTrailing + metric("small") - layout.navigationWidth - metric("hairline")))
            .frame(height: ShellLayout.headerHeight)
            .foregroundStyle(chromeColor("text-strong", scheme))
            .background {
                Group {
                    if lightGlass {
                        Color.clear
                    } else if glassNavigation {
                        ChromeSurface(titlebar: true)
                    } else {
                        contentColor("surface", scheme).overlay(chromeColor("titlebar-material", scheme))
                    }
                }.overlay { WindowDragRegion() }
            }
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
            .foregroundStyle(contentColor("danger", scheme)).fixedSize(horizontal: false, vertical: true)
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
    // Dense: the one-row chat composer; the model reads at small size and muted colour.
    var dense = false
    var glassChat = false
    @Environment(\.colorScheme) private var scheme
    var body: some View { compactMenu }
    @Environment(\.shellLayer) private var shellLayer
    // The chip: short name (the full ID in help and the accessibility label); it opens the shell's
    // model panel anchored to itself, so the picker is a quiet layer of the app, not a system menu.
    private var compactMenu: some View {
        HStack(spacing: metric("tight")) {
            if modelUnavailable(store.session.model, store: store) { StatusDot(tone: .failed) }
            ShellToolbarButton(label: (store.session.carefulReasoning == true ? store.text("tierCareful") + " · " : "") + ModelLineup.shortName(store.session.model), symbol: badge ? "sparkles" : "chevron.down", identifier: "model-toggle", showsLabel: true, glass: !glassChat, quiet: true, small: (dense || badge) && !glassChat,
                               expanded: shellLayer == .models, hint: store.session.model, enabled: !store.loadingModels,
                               frameAction: { frame in NotificationCenter.default.post(name: .viezanOpenModels, object: NSValue(rect: frame)) }) {}
                .frame(maxWidth: glassChat ? metric("compactSidebar") : nil)
                .frame(height: metric(glassChat ? "control" : dense || badge ? "compactControl" : "control"))
                .accessibilityLabel(store.text("model") + ": " + store.session.model + (modelUnavailable(store.session.model, store: store) ? ", " + store.text("unavailable") : ""))
            if store.loadingModels { ProgressView().controlSize(.small) }
            if let error = store.modelError { Image(systemName: "exclamationmark.triangle").foregroundStyle(.secondary).help(store.text(error)).accessibilityLabel(store.text(error)) }
        }
    }
}

// Chevron before the model label, matching the composer's model control.
struct ModelMenuLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: metric("small")) { configuration.icon.imageScale(.small); configuration.title.lineLimit(1) }
    }
}
