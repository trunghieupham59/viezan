import SwiftUI
import ViezanDomain

// Home reads work and native status; the runtime probe never starts Ollama.
struct HomeWorkspace: View {
    @Bindable var store: WorkbenchStore
    var start: (Feature) -> Void
    var resume: (String) -> Void
    var settings: () -> Void
    var interpret: () -> Void
    private var recent: [Session] {
        store.workspace.sessions.filter { store.moduleEnabled($0.feature.rawValue) && $0.comparisonParent == nil && $0.archived != true && (!$0.draft.isEmpty || !$0.messages.isEmpty || !$0.output.isEmpty) }.sorted { ($0.updated ?? 0) > ($1.updated ?? 0) }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metric("gutter")) {
                VStack(alignment: .leading, spacing: metric("small")) {
                    Text(store.text("home")).font(.title2).fontWeight(.semibold)
                    Text(store.text("homeSubtitle")).foregroundStyle(.secondary)
                }
                Text(store.text("quickStart")).font(.headline)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: metric("sidebar")), spacing: metric("inset"))], spacing: metric("inset")) {
                    ForEach(Feature.allCases.filter { store.moduleEnabled($0.rawValue) }, id: \.self) { feature in
                        Button { start(feature) } label: {
                            Label(store.text(feature.rawValue), systemImage: feature == .chat ? "bubble.left.and.bubble.right" : feature == .dictionary ? "book.closed" : "character.bubble")
                                .frame(maxWidth: .infinity, alignment: .leading).padding(metric("inset"))
                        }.buttonStyle(.bordered).disabled(store.loadBlocked)
                    }
                    if store.moduleEnabled("interpret") {
                        Button(action: interpret) {
                            Label(store.text("interpret"), systemImage: "waveform")
                                .frame(maxWidth: .infinity, alignment: .leading).padding(metric("inset"))
                        }.buttonStyle(.bordered).disabled(store.loadBlocked)
                    }
                }
                GroupBox(store.text("continueWork")) {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        if recent.isEmpty { Text(store.text("noRecentWork")).foregroundStyle(.secondary) }
                        ForEach(recent.prefix(6)) { item in
                            Button { resume(item.id) } label: {
                                HStack(spacing: metric("inset")) {
                                    VStack(alignment: .leading, spacing: metric("small")) {
                                        Text(store.title(item)).lineLimit(1)
                                        Text(store.text(item.feature.rawValue) + " · " + item.model).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                    Spacer()
                                    if store.running(item.id) != nil { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
                                    Image(systemName: "chevron.right").accessibilityHidden(true)
                                }.frame(maxWidth: .infinity, alignment: .leading).padding(metric("small"))
                            }.buttonStyle(.plain).disabled(store.loadBlocked).help(store.title(item))
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(metric("small"))
                }
                DisclosureGroup(store.text("systemStatus")) {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        Text("CPU: " + String(store.localRuntime.processors) + " · RAM: " + ByteCountFormatter.string(fromByteCount: Int64(store.localRuntime.memory), countStyle: .memory))
                        Text("Ollama · " + store.text(store.localRuntime.available ? "available" : "unavailable") + " " + store.localRuntime.version)
                        if let value = store.thermalMonitor.snapshot?.sensors?.map(\.celsius).max() { Text(String(format: "%.0f °C", value)) }
                        ForEach(store.desktopIntegration.shortcuts) { shortcut in
                            Text(store.text(shortcut.id) + " · " + shortcut.key + " · " + store.text(shortcut.enabled ? "enabled" : "disabled"))
                        }
                        Button(store.text("settings"), action: settings)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(metric("small"))
                }
                GroupBox(store.text("model")) {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        Text(store.session.model).textSelection(.enabled)
                        Button(store.text("settings"), action: settings)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(metric("small"))
                }
            }.frame(maxWidth: metric("reading"), alignment: .leading).frame(maxWidth: .infinity).padding(metric("gutter"))
        }.task { await store.localRuntime.refresh() }
    }
}

struct DictionaryResultView: View {
    let entry: DictionaryEntry
    let store: WorkbenchStore
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            Text(entry.headword).font(.title2).fontWeight(.semibold)
            Text(entry.pronunciation).foregroundStyle(.secondary)
            HStack {
                Button(store.text("speak")) { store.audio.speak(entry.headword, language: store.session.source == "auto" ? store.session.target : store.session.source) }
                Button(store.text("translate")) { let id = store.createDetachedSession(feature: .translate, draft: entry.headword); store.select(id); store.setRoute("translate") }
                Button(store.text("chat")) { let id = store.createDetachedSession(feature: .chat, draft: entry.headword + "\n" + entry.meaning); store.select(id); store.setRoute("chat") }
            }
            if let language = entry.detectedSourceLang, nativeResources.nativeLanguages.contains(language) { Text(store.text("lang_" + language)).font(.caption).foregroundStyle(.secondary) }
            Text(entry.meaning)
            ForEach(Array(entry.translations.enumerated()), id: \.offset) { _, translation in
                GroupBox {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        Text(translation.text).fontWeight(.semibold)
                        Text(translation.pronunciation).foregroundStyle(.secondary)
                        DisclosureGroup(store.text("dictionaryDetails")) {
                        ForEach(Array([translation.partOfSpeech, translation.meaning, translation.usage, translation.nuance].compactMap { $0 }.enumerated()), id: \.offset) { _, value in Text(value) }
                        ForEach(Array(((translation.examples ?? []) + (translation.collocations ?? []) + (translation.notes ?? [])).enumerated()), id: \.offset) { _, value in Text(value) }
                        }
                        Button(store.text("speak")) { store.audio.speak(translation.text, language: store.session.target) }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            ForEach(Array(((entry.examples ?? []) + (entry.notes ?? [])).enumerated()), id: \.offset) { _, value in Text(value) }
        }.font(readingFont(store)).textSelection(.enabled)
    }
}
