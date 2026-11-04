import SwiftUI
import ViezanDomain

struct NativeSettings: View {
    @Environment(\.colorScheme) private var scheme
    @Bindable var store: WorkbenchStore
    // The search field lives in the shell header (Review 18).
    @Binding var query: String
    @Binding var section: String?
    var current: Binding<String?> = .constant(nil)
    @State private var selected: String? = "general"
    @State private var hoveredSection: String?
    /// Glass: the open picker layer, a section chosen from search results, the pending confirmation.
    @State private var pickerOpen: String?
    @State private var pendingSection: String?
    @State private var confirmRequest: SettingsConfirm?
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var sections: [NativeResources.SettingsSection] { nativeResources.settings(query: query, locale: store.workspace.locale) }

    private var visibleSections: [NativeResources.SettingsSection] {
        guard query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return sections }
        let active = selected ?? sections.first?.id ?? ""
        return sections.filter { $0.id == active }
    }

    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= metric("reading")
            ScrollViewReader { proxy in
                VStack(spacing: 0) {
                    HStack(alignment: .top, spacing: 0) {
                        if wide && !sections.isEmpty {
                            // Glass: a 292 pt section column with lens rows; the save note sits at its foot.
                            VStack(alignment: .leading, spacing: 0) {
                                ScrollView {
                                    VStack(alignment: .leading, spacing: metric("tight")) {
                                        ForEach(groupedSections, id: \.0) { group, items in
                                            Eyebrow(text: store.text(group)).padding(.horizontal, metric("small")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                                            ForEach(items) { section in navigationRow(section, proxy: proxy) }
                                        }
                                    }.padding(glass ? metric("inset") : metric("small"))
                                }.scrollIndicators(glass ? .hidden : .automatic).frame(maxHeight: .infinity)
                                if glass {
                                    Text(store.text("changesImmediately")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                                        .fixedSize(horizontal: false, vertical: true).padding(metric("gutter"))
                                }
                            }.frame(width: glass ? metric("sidebar") + metric("large") + metric("gutter") : metric("sidebar") - metric("large"))
                            if glass { Rectangle().fill(contentColor("divider", scheme)).frame(width: metric("hairline")).accessibilityHidden(true) } else { Divider() }
                        }
                        VStack(spacing: 0) {
                            if !wide && !sections.isEmpty {
                                if glass {
                                    // Below 760 the section column becomes one picker layer.
                                    HStack {
                                        SettingsPicker(id: "section", label: store.text("settings"),
                                                       options: groupedSections.flatMap { group, items in items.map { SettingsPickerOption(id: $0.id, title: store.text($0.title), group: store.text(group), symbol: Self.symbols[$0.id]) } },
                                                       selection: selected ?? sections[0].id, leading: true) { id in selected = id; proxy.scrollTo(id, anchor: .top) }
                                        Spacer(minLength: 0)
                                    }.padding(.horizontal, metric("gutter")).padding(.vertical, metric("gap"))
                                    CardDivider()
                                } else {
                                Picker(store.text("settings"), selection: Binding(get: { selected ?? sections[0].id }, set: { id in selected = id; proxy.scrollTo(id, anchor: .top) })) {
                                    ForEach(sections) { section in Text(store.text(section.title)).tag(section.id) }
                                }.pickerStyle(.menu).padding(metric("inset"))
                                Divider()
                                }
                            }
                            if sections.isEmpty {
                                ContentUnavailableView(store.text("noSettings"), systemImage: "magnifyingglass")
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            } else {
                                ScrollView {
                                    LazyVStack(alignment: .leading, spacing: metric("large")) {
                                        ForEach(visibleSections) { section in
                                            VStack(alignment: .leading, spacing: metric("inset")) {
                                                HStack(alignment: .top, spacing: metric("inset")) {
                                                    VStack(alignment: .leading, spacing: metric("small")) {
                                                        Text(store.text(section.title)).font(.vzn(glass ? "headingScale" : "titleScale", glass ? .semibold : .bold)).accessibilityAddTraits(.isHeader)
                                                        Text(store.text(section.description)).foregroundStyle(glass ? contentColor("text-muted", scheme) : .secondary)
                                                    }
                                                    // Settings-Models board: "Check again" sits in the providers intro.
                                                    if glass && section.id == "providers" {
                                                        Spacer(minLength: metric("small"))
                                                        Button(store.text("checkAgain"), systemImage: "arrow.clockwise") { NotificationCenter.default.post(name: .viezanProviderRecheck, object: nil) }
                                                            .buttonStyle(.vznOutline).fixedSize().disabled(store.discovering).accessibilityIdentifier("provider-check-again")
                                                    }
                                                }
                                                sectionContent(section.id)
                                            }.id(section.id)
                                        }
                                        if !glass || !wide { Text(store.text("changesImmediately")).font(.vzn("captionScale")).foregroundStyle(.secondary) }
                                    }.scrollTargetLayout()
                                        .frame(maxWidth: metric("reading"), alignment: .leading)
                                        .frame(maxWidth: .infinity, alignment: .leading).padding(metric("gutter"))
                                }.id(query.isEmpty ? selected : "search")
                            }
                        }
                    }
                }
            }
        }
        .groupBoxStyle(CardGroupBoxStyle())
        .overlay(alignment: .topTrailing) { if glass && !query.trimmingCharacters(in: .whitespaces).isEmpty { searchResults } }
        .overlay {
            if let request = confirmRequest {
                BlockingDialog(title: request.title, onCancel: { confirmRequest = nil }) {
                    Text(request.title).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(2).accessibilityAddTraits(.isHeader)
                    if !request.message.isEmpty { Text(request.message).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true) }
                    HStack(spacing: metric("small")) {
                        Spacer(minLength: 0)
                        Button(store.text("cancel")) { confirmRequest = nil }.buttonStyle(.vznOutline).keyboardShortcut(.cancelAction).accessibilityIdentifier("confirm-cancel")
                        if request.destructive {
                            Button(request.confirm, role: .destructive) { confirmRequest = nil; request.action() }.buttonStyle(DangerSolidStyle()).accessibilityIdentifier("confirm-destructive")
                        } else {
                            Button(request.confirm) { confirmRequest = nil; request.action() }.buttonStyle(.vznPrimary).accessibilityIdentifier("confirm-primary")
                        }
                    }.padding(.top, metric("tight"))
                }
            }
        }
        .environment(\.settingsConfirm, glass ? { confirmRequest = $0 } : nil)
        .modifier(SettingsPickerHost(open: $pickerOpen))
        .onChange(of: query) { _, _ in selected = pendingSection ?? sections.first?.id; pendingSection = nil }
        .onChange(of: selected, initial: true) { _, value in current.wrappedValue = value }
        .onDisappear { current.wrappedValue = nil }
        .onAppear(perform: openRequestedSection)
        .onChange(of: section) { _, _ in openRequestedSection() }
    }
    // Search drops its matches under the header field (Overlays-Settings board); choosing one
    // opens that section and clears the query.
    private var searchResults: some View {
        VStack(alignment: .leading, spacing: metric("tight")) {
            if sections.isEmpty {
                Text(store.text("noSettings")).foregroundStyle(contentColor("text-muted", scheme)).padding(metric("gap"))
            }
            ForEach(sections.prefix(6)) { item in
                Button { pendingSection = item.id; query = "" } label: {
                    HStack(spacing: metric("gap")) {
                        VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                            Text(store.text(item.title)).font(.vzn("labelScale", .medium)).foregroundStyle(contentColor("text-strong", scheme))
                            Text(store.text(item.description)).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
                        }
                        Spacer(minLength: metric("small"))
                        Image(systemName: "arrow.right").foregroundStyle(contentColor("action-text", scheme)).accessibilityHidden(true)
                    }.padding(.horizontal, metric("gap")).frame(minHeight: metric("navControl") + metric("gap")).contentShape(Rectangle())
                }.buttonStyle(SettingsResultStyle()).accessibilityIdentifier("settings-result-" + item.id)
            }
        }.padding(metric("small")).frame(width: metric("sidebar") + metric("editor") + metric("large"))
            .background { ReadingPanelSurface() }
            .padding(.trailing, metric("inset")).padding(.top, metric("small"))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("settingsSearch"))
    }

    private static let symbols = ["general": "slider.horizontal.3", "appearance": "paintpalette", "providers": "sparkles", "localModels": "cpu", "data": "externaldrive", "about": "info.circle", "voice": "mic", "modules": "square.grid.2x2", "updates": "arrow.triangle.2.circlepath"]
    private var groupedSections: [(String, [NativeResources.SettingsSection])] {
        let application = ["data", "updates", "about"]
        return [("groupCustomize", sections.filter { !application.contains($0.id) }), ("groupApplication", sections.filter { application.contains($0.id) })].filter { !$0.1.isEmpty }
    }
    private func openRequestedSection() {
        guard let section else { return }
        selected = section; self.section = nil
    }
    private func navigationRow(_ section: NativeResources.SettingsSection, proxy: ScrollViewProxy) -> some View {
        let active = selected == section.id
        return Button {
            selected = section.id
            proxy.scrollTo(section.id, anchor: .top)
        } label: {
            Group {
                if glass {
                    // Settings board: icon accent only when selected, the name stays strong and turns semibold.
                    HStack(spacing: metric("gap")) {
                        Image(systemName: Self.symbols[section.id] ?? "circle").frame(width: metric("icon")).foregroundStyle(contentColor(active ? "action-text" : "text-muted", scheme))
                        Text(store.text(section.title)).foregroundStyle(contentColor("text-strong", scheme))
                    }.font(.vzn("labelScale", active ? .semibold : .regular))
                } else {
                    Label(store.text(section.title), systemImage: Self.symbols[section.id] ?? "circle")
                        .foregroundStyle(active ? contentColor("action-text", scheme) : contentColor("text-strong", scheme))
                }
            }
                .fontWeight(active ? .semibold : .regular).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, metric("small")).frame(height: metric("compactControl"))
                .contentShape(Rectangle())
        }.buttonStyle(SettingsNavigationStyle(glass: glass, selected: active, hovered: hoveredSection == section.id))
            .onHover { hoveredSection = $0 ? section.id : nil }
            .foregroundStyle(active ? contentColor("action-text", scheme) : contentColor("text-strong", scheme))
            .background(active && !glass ? contentColor("action-soft", scheme) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
            .accessibilityAddTraits(active ? .isSelected : [])
            .help(store.text(section.description))
    }

    @ViewBuilder private func sectionContent(_ id: String) -> some View {
        if id == "data" {
            // Glass: Data draws its own titled cards (History, Usage, Backup).
            if glass { DataSettings(store: store) } else { CardSection { DataSettings(store: store) } }
        } else if id == "localModels" {
            LocalModelSettings(store: store)
        } else if id == "providers" {
            ProviderSettings(store: store)
        } else if id == "general" {
            VStack(alignment: .leading, spacing: metric("inset")) {
                CardSection(flush: true, title: store.text("groupApplication")) {
                    CardRow(title: store.text("language"), detail: store.text("languageDescription")) {
                        SettingsPicker(id: "language", label: store.text("language"),
                                       options: [SettingsPickerOption(id: "vi", title: "Tiếng Việt"), SettingsPickerOption(id: "en", title: "English"), SettingsPickerOption(id: "ja", title: "日本語")],
                                       selection: store.workspace.locale) { store.setLocale($0) }
                            .accessibilityIdentifier("settings-language")
                    }
                    CardRow(title: store.text("menuBarVisible"), detail: store.text("menuBarVisibleHint")) {
                        Toggle(store.text("menuBarVisible"), isOn: Binding(get: { store.menuBarVisible }, set: { store.menuBarVisible = $0 }))
                            .toggleStyle(.switch).labelsHidden().accessibilityIdentifier("settings-menu-bar-visible")
                    }
                    if glass && store.moduleEnabled("utilities") { hotkeysRow }
                    SystemSettings(store: store)
                }
                CardSection(flush: true, title: store.text("translate")) {
                    CardRow(title: store.text("autoTranslate"), detail: store.text("autoTranslateHint"), divider: store.workspace.autoTranslate == true) {
                        Toggle(store.text("autoTranslate"), isOn: Binding(get: { store.workspace.autoTranslate == true }, set: { store.setAutoTranslate($0) })).toggleStyle(.switch).labelsHidden()
                    }
                    if store.workspace.autoTranslate == true {
                        CardRow(title: store.text("autoTranslateDelay"), divider: false) {
                            SettingsPicker(id: "delay", label: store.text("autoTranslateDelay"), options: [500, 800, 1500].map { SettingsPickerOption(id: String($0), title: "\($0) ms") },
                                           selection: String(store.workspace.autoTranslateDelay ?? 800)) { store.setAutoTranslate(true, delay: Int($0) ?? 800) }
                        }
                    }
                }
                CardSection(flush: true, title: store.text("recoveryTitle")) {
                    CardRow(title: store.text("smartReset"), detail: store.text("smartResetDescription")) {
                        Toggle(store.text("smartReset"), isOn: Binding(get: { store.smartReset }, set: { store.smartReset = $0 })).toggleStyle(.switch).labelsHidden().accessibilityIdentifier("settings-smart-reset")
                    }
                    Text(store.text("recoveryDescription")).font(.vzn("labelScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).padding(metric("inset"))
                }
            }.disabled(store.loadBlocked)
        } else if id == "voice" {
                VoiceSettings(store: store).disabled(store.loadBlocked)
        } else if id == "modules" {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    ForEach([("modulesWorkspaceGroup", WorkbenchStore.workspaceModules), ("modulesSystemGroup", WorkbenchStore.systemModules)], id: \.0) { group, modules in
                        CardSection(flush: true, title: store.text(group)) {
                            ForEach(modules, id: \.self) { module in
                                let locked = store.lockedModule == module
                                CardRow(title: store.text(module == "utilities" ? "launcher" : module), detail: locked ? store.text("modulesLastHint") : store.text("moduleDesc_" + module), divider: module != modules.last) {
                                    Toggle(store.text(module), isOn: Binding(get: { store.moduleEnabled(module) }, set: { store.setModule(module, enabled: $0) }))
                                        .toggleStyle(.switch).labelsHidden().disabled(locked).accessibilityIdentifier("module-" + module)
                                }
                            }
                        }
                    }
                    Text(store.text("modulesDescription")).font(.vzn("captionScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }.disabled(store.loadBlocked)
        } else if id == "updates" {
            UpdateSettings(store: store)
        } else if id == "appearance" {
            VStack(alignment: .leading, spacing: metric("inset")) {
                CardSection(flush: true, title: store.text("appearanceTitle")) {
                    CardRow(title: store.text("themePreset"), detail: store.text("presetDescription")) {
                        SettingsPicker(id: "preset", label: store.text("themePreset"), options: ["graphite", "glass", "paper", "corporate", "midnight"].map { SettingsPickerOption(id: $0, title: store.text("preset_" + $0)) },
                                       selection: store.workspace.preferences.preset ?? "glass") { store.setAppearance(preset: $0) }
                    }
                    CardRow(title: store.text("themeAccent"), detail: store.text("accentDescription")) {
                        SettingsPicker(id: "accent", label: store.text("themeAccent"), options: ["auto", "violet", "pink", "teal", "green", "amber", "red"].map { SettingsPickerOption(id: $0, title: store.text("accent_" + $0)) },
                                       selection: store.workspace.preferences.accent ?? "auto") { store.setAppearance(accent: $0) }
                    }
                    CardRow(title: store.text("themeMode"), detail: store.text("themeDescription")) {
                        if glass {
                            FilterTabs(label: store.text("themeMode"), items: [(AppearanceMode.light, store.text("themeLight")), (.dark, store.text("themeDark")), (.system, store.text("themeSystem"))],
                                       selection: Binding(get: { store.workspace.preferences.mode }, set: { store.setAppearance(mode: $0) })).accessibilityIdentifier("settings-theme")
                        } else {
                        Picker(store.text("themeMode"), selection: Binding(get: { store.workspace.preferences.mode }, set: { store.setAppearance(mode: $0) })) {
                            Text(store.text("themeLight")).tag(AppearanceMode.light)
                            Text(store.text("themeDark")).tag(AppearanceMode.dark)
                            Text(store.text("themeSystem")).tag(AppearanceMode.system)
                        }.pickerStyle(.segmented).labelsHidden().fixedSize().accessibilityIdentifier("settings-theme")
                        }
                    }
                    CardRow(title: store.text("readingSize"), detail: store.text("readingSizeDescription"), divider: false) {
                        if glass {
                            FilterTabs(label: store.text("readingSize"), items: [(ReadingSize.small, store.text("textSmall")), (.medium, store.text("textMedium")), (.large, store.text("textLarge"))],
                                       selection: Binding(get: { store.workspace.preferences.textSize }, set: { store.setAppearance(textSize: $0) })).accessibilityIdentifier("settings-text-size")
                        } else {
                        Picker(store.text("readingSize"), selection: Binding(get: { store.workspace.preferences.textSize }, set: { store.setAppearance(textSize: $0) })) {
                            Text(store.text("textSmall")).tag(ReadingSize.small)
                            Text(store.text("textMedium")).tag(ReadingSize.medium)
                            Text(store.text("textLarge")).tag(ReadingSize.large)
                        }.pickerStyle(.segmented).labelsHidden().fixedSize().accessibilityIdentifier("settings-text-size")
                        }
                    }
                }.disabled(store.loadBlocked)
                CardSection(flush: true, title: store.text("previewHeading")) {
                    Text(store.text("previewUser")).padding(metric("inset"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("radius")))
                        .padding(metric("inset"))
                    Text(store.text("previewAssistant")).frame(maxWidth: .infinity, alignment: .leading)
                        .padding([.horizontal, .bottom], metric("inset"))
                }.font(readingFont(store))
            }
        } else {
            VStack(alignment: .leading, spacing: metric("inset")) {
                CardSection(flush: true, title: "Viezan") {
                    CardRow(title: store.text("currentVersion")) { Text(nativeVersion).foregroundStyle(.secondary).textSelection(.enabled) }
                    CardRow(title: store.text("sourceCode"), divider: false) {
                        Link("GitHub", destination: URL(string: "https://github.com/trunghieupham59/viezan")!)
                    }
                }
                GroupBox {
                    VStack(alignment: .leading, spacing: metric("inset")) {
                        description("previewScopeTitle", "previewScopeDescription")
                        Divider()
                        description("localDataTitle", "settingsInfo")
                    }.padding(metric("small"))
                }
            }
        }
    }

    // General board: the global shortcuts at a glance, managed on the sidebar page.
    private var hotkeysRow: some View {
        let order = ["launcher", "quickChat", "translateSelection"]
        let summary = store.desktopIntegration.shortcuts.filter(\.enabled).sorted { (order.firstIndex(of: $0.id) ?? order.count) < (order.firstIndex(of: $1.id) ?? order.count) }
            .map { store.text($0.id) + " " + shortcutDisplay($0.key) }.joined(separator: " · ")
        return CardRow(title: store.text("hotkeys"), detail: summary) {
            Button(store.text("utilities")) { NotificationCenter.default.post(name: .viezanOpenRoute, object: "utilities") }.buttonStyle(.vznOutline)
                .accessibilityIdentifier("settings-open-utilities")
        }
    }
    private func description(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(store.text(title)).fontWeight(.medium)
            Text(store.text(detail)).font(.vzn("smallScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SettingsResultStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { SettingsResultBody(configuration: configuration) }
}
private struct SettingsResultBody: View {
    var configuration: ButtonStyleConfiguration
    @State private var hovered = false
    var body: some View {
        configuration.label.background { if hovered || configuration.isPressed { GlassLens(radius: metric("radius"), hover: !configuration.isPressed) } }.onHover { hovered = $0 }
    }
}

private struct SettingsNavigationStyle: ButtonStyle {
    var glass: Bool
    var selected: Bool
    var hovered: Bool
    @Environment(\.isEnabled) private var enabled
    @ViewBuilder func makeBody(configuration: Configuration) -> some View {
        if glass {
            NavigationButtonStyle(glass: true, selected: selected, hovered: hovered, radius: metric("radius"))
                .makeBody(configuration: configuration)
        } else { configuration.label.opacity(enabled ? (configuration.isPressed ? 0.8 : 1) : 0.5) }
    }
}

// MARK: - Settings pickers as shell-style floating layers (Overlays-Settings board)
// A glass pill opens a `.float` list anchored under it: rows of 40, the current choice a
// lens with a check, groups with caps headings; ↑↓ Return choose, Escape closes. Other
// presets keep the system popup.

struct SettingsPickerOption: Identifiable {
    let id: String
    let title: String
    var detail = ""
    var group: String? = nil
    var symbol: String? = nil
}

struct SettingsPickerSpec {
    let anchor: Anchor<CGRect>
    let options: [SettingsPickerOption]
    let selection: String
    let leading: Bool
    let choose: (String) -> Void
}

struct SettingsPickerKey: PreferenceKey {
    static var defaultValue: [String: SettingsPickerSpec] { [:] }
    static func reduce(value: inout [String: SettingsPickerSpec], nextValue: () -> [String: SettingsPickerSpec]) { value.merge(nextValue()) { $1 } }
}

/// A request for the settings page's centred blocking dialog.
struct SettingsConfirm {
    var title: String
    var message: String
    var confirm: String
    var destructive = true
    var action: () -> Void
}

private struct SettingsPickerOpenKey: EnvironmentKey { static var defaultValue: Binding<String?>? { nil } }
private struct SettingsConfirmKey: EnvironmentKey { static var defaultValue: ((SettingsConfirm) -> Void)? { nil } }
extension EnvironmentValues {
    var settingsPickerOpen: Binding<String?>? { get { self[SettingsPickerOpenKey.self] } set { self[SettingsPickerOpenKey.self] = newValue } }
    /// Present when the Glass settings page hosts confirmations; nil elsewhere (system dialog).
    var settingsConfirm: ((SettingsConfirm) -> Void)? { get { self[SettingsConfirmKey.self] } set { self[SettingsConfirmKey.self] = newValue } }
}

struct SettingsPicker: View {
    var id: String
    var label: String
    var options: [SettingsPickerOption]
    var selection: String
    var leading = false
    var choose: (String) -> Void
    @Environment(\.settingsPickerOpen) private var open
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var enabled
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var current: SettingsPickerOption? { options.first { $0.id == selection } }
    var body: some View {
        if glass, let open {
            Button { open.wrappedValue = open.wrappedValue == id ? nil : id } label: {
                HStack(spacing: metric("small") - metric("hairline") * 2) {
                    if let symbol = current?.symbol { Image(systemName: symbol).foregroundStyle(contentColor("text-muted", scheme)) }
                    Text(current?.title ?? selection).lineLimit(1)
                    Image(systemName: "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme))
                }
            }.buttonStyle(.vznOutline).fixedSize()
                .anchorPreference(key: SettingsPickerKey.self, value: .bounds) { [id: SettingsPickerSpec(anchor: $0, options: options, selection: selection, leading: leading, choose: choose)] }
                .accessibilityLabel(label + ": " + (current?.title ?? selection))
                .accessibilityIdentifier("settings-picker-" + id)
        } else {
            Picker(label, selection: Binding(get: { selection }, set: choose)) {
                ForEach(options) { Text($0.title).tag($0.id) }
            }.labelsHidden().fixedSize()
        }
    }
}

struct SettingsPickerPanel: View {
    let spec: SettingsPickerSpec
    var close: () -> Void
    @State private var highlighted: String?
    @FocusState private var focused: Bool
    private func move(_ offset: Int) {
        let ids = spec.options.map(\.id)
        guard !ids.isEmpty else { return }
        let index = highlighted.flatMap(ids.firstIndex) ?? ids.firstIndex(of: spec.selection) ?? 0
        highlighted = ids[min(max(index + offset, 0), ids.count - 1)]
    }
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(spec.options.enumerated()), id: \.element.id) { index, option in
                        if let group = option.group, index == 0 || spec.options[index - 1].group != group {
                            Eyebrow(text: group).padding(.horizontal, metric("small")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                        }
                        PanelRow(title: option.title, detail: option.detail, symbol: option.symbol, selected: option.id == spec.selection, highlighted: option.id == highlighted, identifier: "settings-option-" + option.id) {
                            spec.choose(option.id); close()
                        }.id(option.id)
                    }
                }.padding(metric("small"))
            }.scrollIndicators(.hidden)
                .onChange(of: highlighted) { _, id in if let id { proxy.scrollTo(id) } }
        }
        .frame(minWidth: metric("compactSidebar"), idealWidth: metric("sidebar"), maxWidth: metric("sidebar") + metric("editor"))
        .focusable().focused($focused).focusEffectDisabled()
        .onKeyPress(.downArrow) { move(1); return .handled }
        .onKeyPress(.upArrow) { move(-1); return .handled }
        .onKeyPress(.return) { if let id = highlighted { spec.choose(id); close(); return .handled }; return .ignored }
        .onAppear { focused = true; highlighted = spec.selection }
    }
}

/// Draws the open settings picker, anchored to its pill; flips above when there is more room.
struct SettingsPickerHost: ViewModifier {
    @Binding var open: String?
    func body(content: Content) -> some View {
        content
            .environment(\.settingsPickerOpen, $open)
            .overlayPreferenceValue(SettingsPickerKey.self) { specs in
                GeometryReader { proxy in
                    if let id = open, let spec = specs[id] {
                        let rect = proxy[spec.anchor], margin = metric("small")
                        let below = max(0, proxy.size.height - rect.maxY - margin * 2), above = max(0, rect.minY - margin * 2)
                        let down = below >= above, room = down ? below : above
                        let width = max(metric("control"), spec.leading ? proxy.size.width - rect.minX - margin : rect.maxX - margin)
                        ZStack(alignment: .topLeading) {
                            Button { open = nil } label: { Color.clear.contentShape(Rectangle()) }.buttonStyle(.plain).focusable(false).accessibilityHidden(true)
                            SettingsPickerPanel(spec: spec) { open = nil }
                                .frame(maxHeight: room).fixedSize(horizontal: true, vertical: true)
                                .background { ReadingPanelSurface() }
                                .onExitCommand { open = nil }
                                .frame(width: width, alignment: spec.leading ? .leading : .trailing)
                                .frame(height: room, alignment: down ? .top : .bottom)
                                .offset(x: spec.leading ? rect.minX : margin, y: down ? rect.maxY + margin : rect.minY - margin - room)
                        }
                    }
                }
            }
    }
}
