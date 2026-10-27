import SwiftUI
import ViezanDomain

struct NativeSettings: View {
    @Bindable var store: WorkbenchStore
    @State private var query = ""
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
                    HStack {
                        HistorySearch(query: $query, label: store.text("settingsSearch"), cancel: { query = "" })
                            .frame(maxWidth: metric("sidebar") + metric("editor"))
                            .frame(height: metric("control"))
                        Spacer(minLength: 0)
                    }.padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
                    Divider()
                    HStack(alignment: .top, spacing: 0) {
                        if wide && !sections.isEmpty {
                            VStack(alignment: .leading, spacing: metric("small")) {
                                ForEach(sections) { section in
                                    Button {
                                        selected = section.id
                                        proxy.scrollTo(section.id, anchor: .top)
                                    } label: {
                                        Text(store.text(section.title)).fontWeight(selected == section.id ? .semibold : .regular)
                                            .frame(maxWidth: .infinity, alignment: .leading).padding(metric("small"))
                                    }.buttonStyle(.plain)
                                        .background(selected == section.id ? Color(nsColor: .unemphasizedSelectedContentBackgroundColor) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                                        .accessibilityAddTraits(selected == section.id ? .isSelected : [])
                                        .help(store.text(section.description))
                                }
                                Spacer()
                            }.padding(metric("inset")).frame(width: metric("sidebar") - metric("large"))
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
                                                    Text(store.text(section.title)).font(.title2).fontWeight(.semibold)
                                                    Text(store.text(section.description)).foregroundStyle(.secondary)
                                                }
                                                sectionContent(section.id)
                                            }.id(section.id)
                                        }
                                        Text(store.text("changesImmediately")).font(.caption).foregroundStyle(.secondary)
                                    }.scrollTargetLayout()
                                        .frame(maxWidth: metric("reading"), alignment: .leading)
                                        .frame(maxWidth: .infinity).padding(metric("gutter"))
                                }.id(query.isEmpty ? selected : "search")
                            }
                        }
                    }
                }
            }
        }
        .onChange(of: query) { _, _ in selected = sections.first?.id }
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
            GroupBox {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    Picker(store.text("language"), selection: Binding(get: { store.workspace.locale }, set: { store.setLocale($0) })) {
                        Text("Tiếng Việt").tag("vi"); Text("English").tag("en"); Text("日本語").tag("ja")
                    }.pickerStyle(.menu).accessibilityIdentifier("settings-language")
                    Text(store.text("speechAutoHint")).font(.caption).foregroundStyle(.secondary)
                    Picker(store.text("speechProvider"), selection: $store.speechProvider) {
                        Text(store.text("reasoning_auto")).tag("auto"); Text("OpenAI").tag("openai"); Text("Groq").tag("groq"); Text("Gemini").tag("gemini")
                    }
                    Divider()
                    VoiceSettings(store: store)
                    SystemSettings(store: store)
                    DisclosureGroup(store.text("modulesTitle")) {
                        ForEach(["chat", "translate", "dictionary", "interpret", "thermal", "apps", "utilities", "bridge"], id: \.self) { module in
                            Toggle(store.text(module == "bridge" ? "browserBridge" : module), isOn: Binding(get: { store.moduleEnabled(module) }, set: { store.setModule(module, enabled: $0) }))
                        }
                    }
                    description("recoveryTitle", "recoveryDescription")
                }.padding(metric("small"))
            }.disabled(store.loadBlocked)
        } else if id == "appearance" {
            GroupBox {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    Picker(store.text("themePreset"), selection: Binding(get: { store.workspace.preferences.preset ?? "glass" }, set: { store.setAppearance(preset: $0) })) {
                        ForEach(["graphite", "glass", "paper", "corporate", "midnight"], id: \.self) { Text(store.text("preset_" + $0)).tag($0) }
                    }
                    Picker(store.text("themeAccent"), selection: Binding(get: { store.workspace.preferences.accent ?? "auto" }, set: { store.setAppearance(accent: $0) })) {
                        ForEach(["auto", "violet", "pink", "teal", "green", "amber", "red"], id: \.self) { Text(store.text("accent_" + $0)).tag($0) }
                    }
                    description("themeMode", "themeDescription")
                    Picker(store.text("themeMode"), selection: Binding(get: { store.workspace.preferences.mode }, set: { store.setAppearance(mode: $0) })) {
                        Text(store.text("themeLight")).tag(AppearanceMode.light)
                        Text(store.text("themeDark")).tag(AppearanceMode.dark)
                        Text(store.text("themeSystem")).tag(AppearanceMode.system)
                    }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("settings-theme")
                    Divider()
                    description("readingSize", "readingSizeDescription")
                    Picker(store.text("readingSize"), selection: Binding(get: { store.workspace.preferences.textSize }, set: { store.setAppearance(textSize: $0) })) {
                        Text(store.text("textSmall")).tag(ReadingSize.small)
                        Text(store.text("textMedium")).tag(ReadingSize.medium)
                        Text(store.text("textLarge")).tag(ReadingSize.large)
                    }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("settings-text-size")
                }.padding(metric("small"))
            }.disabled(store.loadBlocked)
            GroupBox(store.text("previewHeading")) {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    Text(store.text("previewUser")).padding(metric("inset"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: metric("radius")))
                    Text(store.text("previewAssistant")).frame(maxWidth: .infinity, alignment: .leading)
                }.font(readingFont(store)).padding(metric("small"))
            }
        } else {
            GroupBox {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    UpdateSettings(store: store)
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
