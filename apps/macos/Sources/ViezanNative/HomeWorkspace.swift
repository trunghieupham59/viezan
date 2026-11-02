import SwiftUI
import ViezanDomain

// Home reads work and native status; the runtime probe never starts Ollama.
struct HomeWorkspace: View {
    @Bindable var store: WorkbenchStore
    var start: (Feature) -> Void
    var resume: (String) -> Void
    var settings: () -> Void
    var interpret: () -> Void
    @State private var filter: String?
    @Environment(\.colorScheme) private var scheme
    // Recent work spans text sessions and recorded interpretation sessions, newest first.
    private enum RecentEntry: Identifiable {
        case work(Session), interpretation(InterpretationSession)
        var id: String { switch self { case .work(let item): "s-" + item.id; case .interpretation(let item): "i-" + item.id } }
        var updated: Double { switch self { case .work(let item): item.updated ?? 0; case .interpretation(let item): item.segments.last.map { item.created + $0.end } ?? item.created } }
        var route: String { switch self { case .work(let item): item.feature.rawValue; case .interpretation: "interpret" } }
    }
    private var recent: [Session] {
        store.workspace.sessions.filter { store.moduleEnabled($0.feature.rawValue) && $0.comparisonParent == nil && $0.archived != true && (!$0.draft.isEmpty || !$0.messages.isEmpty || !$0.output.isEmpty) }.sorted { ($0.updated ?? 0) > ($1.updated ?? 0) }
    }
    private var entries: [RecentEntry] {
        let interpretations = store.moduleEnabled("interpret") ? store.interpretation.sessions.filter { !$0.segments.isEmpty || !$0.summary.isEmpty }.map(RecentEntry.interpretation) : []
        return (recent.map(RecentEntry.work) + interpretations).sorted { $0.updated > $1.updated }
    }
    private var active: [Session] {
        let ids = Set(store.workspace.tasks.filter { $0.status == .running }.map(\.request.sessionID))
        return recent.filter { ids.contains($0.id) }
    }
    var body: some View {
        WorkspacePage {
            PageIntro(title: store.text("workspace"), subtitle: store.text("workspaceSubtitle")) {
                Button(store.text("newWork"), systemImage: "plus") { start(.chat) }
                    .buttonStyle(.vznPrimary).fixedSize()
                    .disabled(store.loadBlocked || !store.moduleEnabled("chat")).help(store.text("newChat") + " (⌘N)")
            }
            if !active.isEmpty {
                VStack(alignment: .leading, spacing: metric("small")) {
                    Eyebrow(text: store.text("inProgress"))
                    UniformGrid(maxColumns: 2, minimum: metric("sidebar") + metric("large")) {
                        ForEach(active.prefix(4)) { item in
                            Button { resume(item.id) } label: {
                                HStack(spacing: metric("gap")) {
                                    Image(systemName: item.feature.symbol).foregroundStyle(contentColor("action-text", scheme)).frame(width: metric("icon"))
                                    VStack(alignment: .leading, spacing: metric("tight")) {
                                        Text(store.title(item)).fontWeight(.semibold).lineLimit(1)
                                        Text(store.text("running")).font(.vzn("smallScale")).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: metric("small"))
                                    Label(store.text("open"), systemImage: "arrow.right").labelStyle(.titleAndIcon).font(.vzn("smallScale")).foregroundStyle(.secondary)
                                }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()).cardSurface()
                            }.buttonStyle(.plain).disabled(store.loadBlocked).help(store.title(item))
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: metric("small")) {
                HStack {
                    Text(store.text("recentWork")).font(.vzn("sectionScale", .bold)).accessibilityAddTraits(.isHeader)
                    Spacer()
                    FilterTabs(label: store.text("recentWork"), items: [(String?.none, store.text("filterAll"))] + ["chat", "translate", "dictionary", "interpret"].filter { store.moduleEnabled($0) }.map { (String?.some($0), store.text($0)) }, selection: $filter)
                }
                let rows = entries.filter { filter == nil || $0.route == filter }
                VStack(spacing: 0) {
                    Divider()
                    if rows.isEmpty { Text(store.text("noRecentWork")).foregroundStyle(.secondary).padding(.vertical, metric("inset")).frame(maxWidth: .infinity, alignment: .leading) }
                    ForEach(rows.prefix(6)) { entry in
                        Button { open(entry) } label: { entryRow(entry) }
                            .buttonStyle(.plain).disabled(store.loadBlocked).help(entryTitle(entry))
                        Divider()
                    }
                }
            }
            VStack(alignment: .leading, spacing: metric("small")) {
                Text(store.text("quickStart")).font(.vzn("sectionScale", .bold)).accessibilityAddTraits(.isHeader)
                NativeFlow(spacing: metric("small")) {
                    if store.moduleEnabled("chat") { Button(store.text("newChat"), systemImage: "plus") { start(.chat) } }
                    if store.moduleEnabled("translate") { Button(store.text("translateText"), systemImage: Feature.translate.symbol) { start(.translate) } }
                    if store.moduleEnabled("interpret") { Button(store.text("interpret"), systemImage: "waveform", action: interpret) }
                    if store.moduleEnabled("dictionary") { Button(store.text("lookup"), systemImage: Feature.dictionary.symbol) { start(.dictionary) } }
                }.buttonStyle(.vznOutline).disabled(store.loadBlocked)
            }
            HStack(spacing: metric("small")) {
                // The active model's real readiness, local or cloud (not only Ollama).
                let model = store.session.model, state = store.providers.availability(model)
                StatusDot(tone: state == .available ? .ready : state == .unknown ? .idle : .failed)
                Text(nativeModelLabel(model, store: store) + (state == .unknown ? "" : " · " + store.text(state == .available ? "runtimeReady" : "unavailable").lowercased())).fontWeight(.medium).lineLimit(1)
                Text(store.text(ProviderDiscovery.localProviders.contains(where: { model.hasPrefix($0 + ":") }) ? "onDevice" : "viaCloud")).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: metric("small"))
                // Manage opens the section that owns the active model: local runtimes or cloud providers.
                Button(store.text("manage")) {
                    NotificationCenter.default.post(name: .viezanOpenSettings, object: ProviderDiscovery.localProviders.contains(where: { model.hasPrefix($0 + ":") }) ? "localModels" : "providers")
                }.buttonStyle(.vznOutline)
            }.font(.vzn("smallScale")).accessibilityElement(children: .contain)
        }.task { store.discoverIfNeeded() }
    }
    private func open(_ entry: RecentEntry) {
        switch entry {
        case .work(let item): resume(item.id)
        case .interpretation(let item): store.interpretation.select(item.id); interpret()
        }
    }
    private func entryTitle(_ entry: RecentEntry) -> String {
        switch entry {
        case .work(let item): store.title(item)
        case .interpretation(let item): Date(timeIntervalSince1970: item.created).formatted(date: .abbreviated, time: .shortened)
        }
    }
    @ViewBuilder private func entryRow(_ entry: RecentEntry) -> some View {
        switch entry {
        case .work(let item): recentRow(item)
        case .interpretation(let item): interpretationRow(item)
        }
    }
    private func interpretationRow(_ item: InterpretationSession) -> some View {
        let title = Date(timeIntervalSince1970: item.created).formatted(date: .abbreviated, time: .shortened)
        let detail = store.text("interpret") + " · " + store.text("lang_" + item.source) + " → " + store.text("lang_" + item.target)
        return HStack(spacing: metric("gap")) {
            Image(systemName: "waveform").imageScale(.large).foregroundStyle(.secondary).frame(width: metric("icon") + metric("tight"))
            VStack(alignment: .leading, spacing: metric("tight")) {
                Text(title).font(.vzn("labelScale", .semibold)).foregroundStyle(.primary).lineLimit(1)
                Text(detail).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: metric("small"))
            if store.interpretation.busy, store.interpretation.current?.id == item.id { Text(store.text("listening")).font(.vzn("smallScale")).foregroundStyle(contentColor("action-text", scheme)) }
            Text(relativeTime(RecentEntry.interpretation(item).updated, store: store)).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1).fixedSize()
            Image(systemName: "arrow.right").fontWeight(.semibold).foregroundStyle(.primary).accessibilityHidden(true)
        }.padding(.vertical, metric("gap")).padding(.horizontal, metric("small"))
            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
    }
    private func recentRow(_ item: Session) -> some View {
        let detail = item.feature == .chat ? store.text("chat") : store.text(item.feature.rawValue) + " · " + store.text("lang_" + item.source) + " → " + store.text("lang_" + item.target)
        return HStack(spacing: metric("gap")) {
            Image(systemName: item.feature.symbol).imageScale(.large).foregroundStyle(.secondary).frame(width: metric("icon") + metric("tight"))
            VStack(alignment: .leading, spacing: metric("tight")) {
                Text(store.title(item)).font(.vzn("labelScale", .semibold)).foregroundStyle(.primary).lineLimit(1)
                Text(detail).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: metric("small"))
            if store.running(item.id) != nil { Text(store.text("running")).font(.vzn("smallScale")).foregroundStyle(contentColor("action-text", scheme)) }
            else if item.favorite == true { Text(store.text("favorite")).font(.vzn("smallScale")).foregroundStyle(.secondary) }
            Text(relativeTime(item.updated, store: store)).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1).fixedSize()
            Image(systemName: "arrow.right").fontWeight(.semibold).foregroundStyle(.primary).accessibilityHidden(true)
        }.padding(.vertical, metric("gap")).padding(.horizontal, metric("small"))
            .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
    }
}

struct DictionaryResultView: View {
    let entry: DictionaryEntry
    @Bindable var store: WorkbenchStore
    @Environment(\.colorScheme) private var scheme
    @State private var selectedTab = "meaning"
    private var examples: [String] { (entry.examples ?? []) + entry.translations.flatMap { $0.examples ?? [] } }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack(alignment: .firstTextBaseline, spacing: metric("inset")) {
                Text(entry.headword).font(.vzn("heroScale", .bold)).accessibilityAddTraits(.isHeader)
                Spacer(minLength: metric("small"))
                Button { store.toggleFavorite(store.session.id) } label: {
                    Label(store.text(store.session.favorite == true ? "savedWord" : "saveWord"), systemImage: store.session.favorite == true ? "star.fill" : "star")
                }.buttonStyle(.vznQuiet).accessibilityAddTraits(store.session.favorite == true ? .isSelected : [])
            }
            HStack(spacing: metric("small")) {
                if !entry.pronunciation.isEmpty { Text(entry.pronunciation).foregroundStyle(.secondary) }
                if let language = entry.detectedSourceLang, nativeResources.nativeLanguages.contains(language) {
                    Text(store.text("lang_" + language)).font(.vzn("smallScale")).padding(.horizontal, metric("small")).padding(.vertical, metric("tight"))
                        .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                }
                Button { store.audio.speak(entry.headword, language: store.session.source == "auto" ? store.session.target : store.session.source) } label: { Image(systemName: "speaker.wave.2") }
                    .buttonStyle(.vznQuiet).help(store.text("speak")).accessibilityLabel(store.text("speak"))
                Spacer(minLength: 0)
                Button(store.text("translate")) { let id = store.createDetachedSession(feature: .translate, draft: entry.headword); store.select(id); NotificationCenter.default.post(name: .viezanOpenRoute, object: "translate") }.buttonStyle(.vznOutline)
                Button(store.text("chat")) { let id = store.createDetachedSession(feature: .chat, draft: entry.headword + "\n" + entry.meaning); store.select(id); NotificationCenter.default.post(name: .viezanOpenRoute, object: "chat") }.buttonStyle(.vznOutline)
            }
            FilterTabs(label: store.text("dictionary"), items: [("meaning", store.text("dictionaryMeaning")), ("examples", store.text("dictionaryExamples"))], selection: $selectedTab)
            Divider()
            if selectedTab == "meaning" {
                if !entry.meaning.isEmpty { Text(entry.meaning) }
                ForEach(Array(entry.translations.enumerated()), id: \.offset) { index, translation in
                    HStack(alignment: .firstTextBaseline, spacing: metric("inset")) {
                        Text(String(format: "%02d", index + 1)).font(.vzn("smallScale")).monospacedDigit().foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: metric("small")) {
                            HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                                Text(translation.text).font(.vzn("titleScale", .bold))
                                if !translation.pronunciation.isEmpty { Text(translation.pronunciation).foregroundStyle(.secondary) }
                                Button { store.audio.speak(translation.text, language: store.session.target) } label: { Image(systemName: "speaker.wave.2") }
                                    .buttonStyle(.vznQuiet).help(store.text("speak")).accessibilityLabel(store.text("speak") + " " + translation.text)
                            }
                            ForEach(Array([translation.partOfSpeech, translation.meaning].compactMap { $0 }.enumerated()), id: \.offset) { _, value in Text(value).foregroundStyle(.secondary) }
                            if translation.usage != nil || translation.nuance != nil || !((translation.examples ?? []) + (translation.collocations ?? []) + (translation.notes ?? [])).isEmpty {
                                DisclosureGroup(store.text("dictionaryDetails")) {
                                    VStack(alignment: .leading, spacing: metric("small")) {
                                        ForEach(Array([translation.usage, translation.nuance].compactMap { $0 }.enumerated()), id: \.offset) { _, value in Text(value) }
                                        ForEach(Array(((translation.examples ?? []) + (translation.collocations ?? []) + (translation.notes ?? [])).enumerated()), id: \.offset) { _, value in Text(value) }
                                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, metric("small"))
                                }
                            }
                        }
                    }
                }
                if let notes = entry.notes, !notes.isEmpty {
                    ForEach(Array(notes.enumerated()), id: \.offset) { _, value in Text(value).foregroundStyle(.secondary) }
                }
            }
            if selectedTab == "examples" && examples.isEmpty {
                Text(store.text("dictionaryNoExamples")).foregroundStyle(.secondary)
            }
            if !examples.isEmpty {
                VStack(alignment: .leading, spacing: metric("small")) {
                    Eyebrow(text: store.text("dictionaryExamples"))
                    ForEach(Array((selectedTab == "meaning" ? Array(examples.prefix(1)) : examples).enumerated()), id: \.offset) { _, value in Text(value) }
                }.padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
                    .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("radius")))
            }
        }.font(readingFont(store)).textSelection(.enabled)
            .onChange(of: store.session.id) { _, _ in selectedTab = "meaning" }
            .onChange(of: entry.headword) { _, _ in selectedTab = "meaning" }
    }
}
