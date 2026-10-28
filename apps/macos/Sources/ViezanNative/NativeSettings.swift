import SwiftUI
import ViezanDomain

struct NativeSettings: View {
    @Bindable var store: WorkbenchStore
    // The search field lives in the shell header (Review 18).
    @Binding var query: String
    @Binding var section: String?
    @State private var selected: String? = "general"
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
                            ScrollView {
                                VStack(alignment: .leading, spacing: metric("tight")) {
                                    ForEach(groupedSections, id: \.0) { group, items in
                                        Eyebrow(text: store.text(group)).padding(.horizontal, metric("small")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                                        ForEach(items) { section in navigationRow(section, proxy: proxy) }
                                    }
                                }.padding(metric("small"))
                            }.frame(width: metric("sidebar") - metric("large"))
                            Divider()
                        }
                        VStack(spacing: 0) {
                            if !wide && !sections.isEmpty {
                                Picker(store.text("settings"), selection: Binding(get: { selected ?? sections[0].id }, set: { id in selected = id; proxy.scrollTo(id, anchor: .top) })) {
                                    ForEach(sections) { section in Text(store.text(section.title)).tag(section.id) }
                                }.pickerStyle(.menu).padding(metric("inset"))
                                Divider()
                            }
                            if sections.isEmpty {
                                ContentUnavailableView(store.text("noSettings"), systemImage: "magnifyingglass")
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            } else {
                                ScrollView {
                                    LazyVStack(alignment: .leading, spacing: metric("large")) {
                                        ForEach(visibleSections) { section in
                                            VStack(alignment: .leading, spacing: metric("inset")) {
                                                VStack(alignment: .leading, spacing: metric("small")) {
                                                    Text(store.text(section.title)).font(.vzn("titleScale", .bold))
                                                    Text(store.text(section.description)).foregroundStyle(.secondary)
                                                }
                                                sectionContent(section.id)
                                            }.id(section.id)
                                        }
                                        Text(store.text("changesImmediately")).font(.caption).foregroundStyle(.secondary)
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
        .onChange(of: query) { _, _ in selected = sections.first?.id }
        .onAppear(perform: openRequestedSection)
        .onChange(of: section) { _, _ in openRequestedSection() }
    }

    private static let symbols = ["general": "slider.horizontal.3", "appearance": "paintpalette", "providers": "sparkles", "localModels": "cpu", "desktop": "command", "bridge": "globe", "data": "externaldrive", "about": "info.circle", "voice": "mic", "modules": "square.grid.2x2", "updates": "arrow.triangle.2.circlepath"]
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
            Label(store.text(section.title), systemImage: Self.symbols[section.id] ?? "circle")
                .fontWeight(active ? .semibold : .regular).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, metric("small")).frame(height: metric("compactControl"))
                .contentShape(Rectangle())
        }.buttonStyle(.plain).foregroundStyle(active ? Color.accentColor : Color.primary)
            .background(active ? Color.accentColor.opacity(metric("selectionOpacity")) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
            .accessibilityAddTraits(active ? .isSelected : [])
            .help(store.text(section.description))
    }

    @ViewBuilder private func sectionContent(_ id: String) -> some View {
        if id == "desktop" {
            DesktopSettings(store: store)
        } else if id == "bridge" {
            BridgeSettings(store: store)
        } else if id == "data" {
            DataSettings(store: store)
        } else if id == "localModels" {
            LocalModelSettings(store: store)
        } else if id == "providers" {
            ProviderSettings(store: store)
        } else if id == "general" {
            VStack(alignment: .leading, spacing: metric("inset")) {
                CardSection(flush: true, title: store.text("groupApplication")) {
                    CardRow(title: store.text("language"), detail: store.text("languageDescription")) {
                        Picker(store.text("language"), selection: Binding(get: { store.workspace.locale }, set: { store.setLocale($0) })) {
                            Text("Tiếng Việt").tag("vi"); Text("English").tag("en"); Text("日本語").tag("ja")
                        }.pickerStyle(.menu).labelsHidden().fixedSize().accessibilityIdentifier("settings-language")
                    }
                    SystemSettings(store: store)
                }
                CardSection(flush: true, title: store.text("translate")) {
                    CardRow(title: store.text("autoTranslate"), detail: store.text("autoTranslateHint"), divider: store.workspace.autoTranslate == true) {
                        Toggle(store.text("autoTranslate"), isOn: Binding(get: { store.workspace.autoTranslate == true }, set: { store.setAutoTranslate($0) })).toggleStyle(.switch).labelsHidden()
                    }
                    if store.workspace.autoTranslate == true {
                        CardRow(title: store.text("autoTranslateDelay"), divider: false) {
                            Picker(store.text("autoTranslateDelay"), selection: Binding(get: { store.workspace.autoTranslateDelay ?? 800 }, set: { store.setAutoTranslate(true, delay: $0) })) {
                                ForEach([500, 800, 1500], id: \.self) { Text("\($0) ms").tag($0) }
                            }.labelsHidden().fixedSize()
                        }
                    }
                }
                CardSection(flush: true, title: store.text("recoveryTitle")) {
                    Text(store.text("recoveryDescription")).font(.vzn("labelScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).padding(metric("inset"))
                }
            }.disabled(store.loadBlocked)
        } else if id == "voice" {
                CardSection(flush: true, title: store.text("voiceTitle")) {
                    CardRow(title: store.text("speechProvider"), detail: store.text("speechAutoHint")) {
                        Picker(store.text("speechProvider"), selection: $store.speechProvider) {
                            Text(store.text("reasoning_auto")).tag("auto"); Text("OpenAI").tag("openai"); Text("Groq").tag("groq"); Text("Gemini").tag("gemini")
                        }.labelsHidden().fixedSize()
                    }
                    VoiceSettings(store: store)
                }.disabled(store.loadBlocked)
        } else if id == "modules" {
                CardSection(flush: true, title: store.text("modulesTitle")) {
                    let modules = ["chat", "translate", "dictionary", "interpret", "thermal", "apps", "utilities", "bridge"]
                    ForEach(modules, id: \.self) { module in
                        CardRow(title: store.text(module == "bridge" ? "browserBridge" : module), divider: module != modules.last) {
                            Toggle(store.text(module == "bridge" ? "browserBridge" : module), isOn: Binding(get: { store.moduleEnabled(module) }, set: { store.setModule(module, enabled: $0) }))
                                .toggleStyle(.switch).labelsHidden()
                        }
                    }
                }.disabled(store.loadBlocked)
        } else if id == "updates" {
            CardSection { UpdateSettings(store: store) }
        } else if id == "appearance" {
            VStack(alignment: .leading, spacing: metric("inset")) {
                CardSection(flush: true, title: store.text("appearanceTitle")) {
                    CardRow(title: store.text("themePreset"), detail: store.text("presetDescription")) {
                        Picker(store.text("themePreset"), selection: Binding(get: { store.workspace.preferences.preset ?? "glass" }, set: { store.setAppearance(preset: $0) })) {
                            ForEach(["graphite", "glass", "paper", "corporate", "midnight"], id: \.self) { Text(store.text("preset_" + $0)).tag($0) }
                        }.labelsHidden().fixedSize()
                    }
                    CardRow(title: store.text("themeAccent"), detail: store.text("accentDescription")) {
                        Picker(store.text("themeAccent"), selection: Binding(get: { store.workspace.preferences.accent ?? "auto" }, set: { store.setAppearance(accent: $0) })) {
                            ForEach(["auto", "violet", "pink", "teal", "green", "amber", "red"], id: \.self) { Text(store.text("accent_" + $0)).tag($0) }
                        }.labelsHidden().fixedSize()
                    }
                    CardRow(title: store.text("themeMode"), detail: store.text("themeDescription")) {
                        Picker(store.text("themeMode"), selection: Binding(get: { store.workspace.preferences.mode }, set: { store.setAppearance(mode: $0) })) {
                            Text(store.text("themeLight")).tag(AppearanceMode.light)
                            Text(store.text("themeDark")).tag(AppearanceMode.dark)
                            Text(store.text("themeSystem")).tag(AppearanceMode.system)
                        }.pickerStyle(.segmented).labelsHidden().fixedSize().accessibilityIdentifier("settings-theme")
                    }
                    CardRow(title: store.text("readingSize"), detail: store.text("readingSizeDescription"), divider: false) {
                        Picker(store.text("readingSize"), selection: Binding(get: { store.workspace.preferences.textSize }, set: { store.setAppearance(textSize: $0) })) {
                            Text(store.text("textSmall")).tag(ReadingSize.small)
                            Text(store.text("textMedium")).tag(ReadingSize.medium)
                            Text(store.text("textLarge")).tag(ReadingSize.large)
                        }.pickerStyle(.segmented).labelsHidden().fixedSize().accessibilityIdentifier("settings-text-size")
                    }
                }.disabled(store.loadBlocked)
                CardSection(flush: true, title: store.text("previewHeading")) {
                    Text(store.text("previewUser")).padding(metric("inset"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: metric("radius")))
                        .padding(metric("inset"))
                    Text(store.text("previewAssistant")).frame(maxWidth: .infinity, alignment: .leading)
                        .padding([.horizontal, .bottom], metric("inset"))
                }.font(readingFont(store))
            }
        } else {
            GroupBox {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    description("previewScopeTitle", "previewScopeDescription")
                    Divider()
                    description("localDataTitle", "settingsInfo")
                }.padding(metric("small"))
            }
        }
    }

    private func description(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(store.text(title)).fontWeight(.medium)
            Text(store.text(detail)).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
