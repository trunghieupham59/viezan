import SwiftUI
import AppKit
import UniformTypeIdentifiers
import ViezanDomain

struct InterpretationWorkspace: View {
    static func persistentError(_ key: String) -> Bool { key == "interpretStorageError" || key == "microphoneDenied" }
    let store: WorkbenchStore
    @State private var setupOpen = false
    @State private var historyQuery = ""
    @State private var historyHighlight: String?
    @State private var showOriginal = true
    @State private var summaryTab = "summary"
    @State private var summaryCollapsed = false
    @State private var captureMode = "microphone"
    /// Read on appear, after a start is refused, and on "Kiểm tra lại" (macOS does not notify changes).
    @State private var microphone = MicrophonePermission.status
    @State private var deviceID = ""
    @State private var inputs: [NativeInputDevice] = []
    @State private var source = "auto"
    @State private var target = "vi"
    @State private var model = ""
    @State private var subtitle: NSPanel?
    // Follow new lines while the reader sits at the end; a manual scroll up pauses following.
    @State private var followBottom = true
    @State private var userScrolling = false
    /// Glass: the open floating layer (source, target, setup, analyses, export, history).
    @State private var layer: String?
    @Environment(\.colorScheme) private var scheme
    private func toggle(_ id: String) { layer = layer == id ? nil : id }
    private var live: Interpretation { store.interpretation }
    private var modelChoices: [String] { (store.availableModels + [model]).filter { !$0.isEmpty }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } } }
    private var historyRecords: [InterpretationSession] {
        live.sessions.filter { historyQuery.isEmpty || Date(timeIntervalSince1970: $0.created).formatted().localizedStandardContains(historyQuery) || $0.segments.contains { $0.original.localizedStandardContains(historyQuery) || $0.translated.localizedStandardContains(historyQuery) } }
    }
    private func moveHistory(_ offset: Int) {
        guard !historyRecords.isEmpty else { return }
        let current = historyRecords.firstIndex { $0.id == historyHighlight } ?? (offset > 0 ? -1 : historyRecords.count)
        historyHighlight = historyRecords[min(max(current + offset, 0), historyRecords.count - 1)].id
    }
    private func openHistory() {
        guard let id = historyHighlight, historyRecords.contains(where: { $0.id == id }) else { return }
        live.select(id)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            languageRow
            ProviderNotice(store: store, model: model) { model = $0 }
            SpeechProviderNotice(store: store)
            sessionBar
            CardDivider()
            if live.busy && !live.listening { ProgressView(store.text("running")).controlSize(.small) }
            if let error = live.error, Self.persistentError(error) {
                // A blocked store or a missing permission holds until fixed, so it stays in the page;
                // one failed capture or summary is a toast (shown by the shell, whichever screen is open).
                NoticeBand(role: "danger", edge: false) {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(contentColor("danger", scheme)).accessibilityHidden(true)
                    Text(store.text(error)).foregroundStyle(contentColor("text-strong", scheme)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                    if live.storageBlocked {
                        Spacer(minLength: metric("small"))
                        // Interpret-States: reading the history store again; nothing is overwritten.
                        Button(store.text("retry")) { live.reload() }.buttonStyle(.vznOutline).controlSize(.small).fixedSize().disabled(live.busy)
                            .accessibilityIdentifier("interpret-storage-retry")
                    }
                }
            }
            // Review 18: the transcript keeps the reading column; a session panel sits beside it when there is room.
            GeometryReader { geometry in
                let panelWidth = metric("sidebar") + metric("large") + metric("gap")
                HStack(alignment: .top, spacing: metric("gutter")) {
                    transcriptArea
                    // Glass: the panel joins once the transcript keeps reading - editor (Interpret board at 1280).
                    if geometry.size.width >= (metric("reading") - metric("editor") + metric("gutter") + panelWidth) { sessionPanel.frame(width: panelWidth) }
                }
            }
        }
        .padding(.horizontal, metric("gutter") - metric("tight")).padding(.vertical, metric("inset"))
        // History opens from the header's History control (Review 18).
        .overlay(alignment: .topTrailing) {
            Color.clear.frame(width: metric("hairline"), height: metric("hairline")).layerAnchor("history-head")
        }
        .onReceive(NotificationCenter.default.publisher(for: .viezanInterpretHistory)) { _ in
            guard !live.busy else { return }
            toggle("history-head")
        }
        .floatingLayers($layer, trailing: { !["source", "target", "setup"].contains($0) }) { id, _, height in layerPanel(id, height: height) }
        // The subtitle panel's own close button must not leave a stale reference behind.
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.willCloseNotification)) { notification in
            if let panel = notification.object as? NSPanel, panel === subtitle { subtitle = nil }
        }
        .onAppear { syncSelection(); microphone = MicrophonePermission.status }
        .onChange(of: live.error) { _, error in if error == "microphoneDenied" { microphone = MicrophonePermission.status } }
        .onChange(of: live.selectedID) { _, _ in syncSelection() }
        .onDisappear { live.playback.stopSpeaking(); subtitle?.close(); subtitle = nil }
    }
    // Interpret-States "Thiếu quyền": a card in the transcript column with Open System Settings
    // (primary) and Check again; recording never starts behind the person's back.
    private var microphoneCard: some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            HStack(spacing: metric("small")) {
                Image(systemName: "mic.slash").foregroundStyle(contentColor("warning", scheme)).accessibilityHidden(true)
                Text(store.text("microphonePermission")).font(.vzn("subtitleScale", .semibold)).accessibilityAddTraits(.isHeader)
                StatusBadge(text: store.text("permissionMissing"), tone: .warning)
            }
            Text(store.text("microphonePermissionHint")).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: metric("small")) {
                Button(store.text("checkAgain")) { microphone = MicrophonePermission.status }.buttonStyle(.vznOutline)
                Button(store.text("openSystemSettings")) { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!) }.buttonStyle(.vznPrimary)
            }
        }.padding(metric("inset")).frame(maxWidth: metric("dialog"), alignment: .leading).cardSurface(padded: false)
            .frame(maxWidth: .infinity).accessibilityElement(children: .contain).accessibilityIdentifier("interpret-microphone")
    }
    private var transcriptArea: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            // Interpret-Summary board: the analyses card opens the transcript column.
            if let current = live.current, live.summarizing || !summaryKinds(current).isEmpty { summaryCard(current).padding(.bottom, metric("small")) }
            transcriptBar
            CardDivider()
            ScrollViewReader { proxy in
                let segments = live.current?.segments ?? []
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if segments.isEmpty {
                            if captureMode != "system", microphone == "denied" || live.error == "microphoneDenied" {
                                microphoneCard.padding(.top, metric("large") * 2)
                            } else {
                                GlassEmptyState(symbol: "waveform", tone: "tone-green", title: store.text("interpretEmpty"), hint: store.text("interpretEmptyHint"))
                                    .padding(.top, metric("large") * 3)
                            }
                        }
                        ForEach(segments) { segment in segmentRow(segment).id(segment.id) }
                        if live.listening {
                            HStack(spacing: metric("small")) { StatusDot(tone: .ready); Text(store.text("listening") + "…") }
                                .font(.vzn("smallScale")).foregroundStyle(.secondary).padding(.vertical, metric("inset")).id("listening-tail")
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).frame(maxWidth: .infinity)
                }
                .onScrollGeometryChange(for: Bool.self) { geometry in
                    geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - metric("inset")
                } action: { _, isAtBottom in if userScrolling { followBottom = isAtBottom } }
                .onScrollPhaseChange { _, phase, context in
                    let wasUserScrolling = userScrolling
                    userScrolling = phase == .interacting || phase == .decelerating || phase == .tracking
                    if userScrolling || wasUserScrolling {
                        let geometry = context.geometry
                        followBottom = geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - metric("inset")
                    }
                }
                .onChange(of: segments.count) { _, _ in if followBottom, let last = segments.last { proxy.scrollTo(last.id, anchor: .bottom) } }
                .onChange(of: segments.last?.translated) { _, _ in if followBottom, let last = segments.last { proxy.scrollTo(last.id, anchor: .bottom) } }
                .onChange(of: live.selectedID) { _, _ in followBottom = true }
                .overlay(alignment: .bottom) {
                    if !followBottom, live.listening || live.processing {
                        Button(store.text("jumpToLatest"), systemImage: "arrow.down") { followBottom = true; if let last = segments.last { proxy.scrollTo(last.id, anchor: .bottom) } }
                            .buttonStyle(.vznOutline).padding(.bottom, metric("inset")).accessibilityIdentifier("interpret-jump-latest")
                    }
                }
            }
        }
    }
    private static let summaryOrder = ["summary", "actionItems", "decisions", "speakerAnalysis"]
    private func summaryText(_ session: InterpretationSession, _ kind: String) -> String {
        switch kind { case "actionItems": session.actionItems ?? ""; case "decisions": session.decisions ?? ""; case "speakerAnalysis": session.speakerAnalysis ?? ""; default: session.summary }
    }
    private func summaryKinds(_ session: InterpretationSession) -> [String] { Self.summaryOrder.filter { !summaryText(session, $0).isEmpty } }
    // The four analyses in one card with tabs; each can be copied or run again.
    @ViewBuilder private func summaryCard(_ session: InterpretationSession) -> some View {
        glassSummaryCard(session)
    }
    // `✦ Tổng hợp` + tabs + Copy / Regenerate in the head, the text below, flat card.
    private func glassSummaryCard(_ session: InterpretationSession) -> some View {
        let tab = Self.summaryOrder.contains(summaryTab) ? summaryTab : "summary"
        let text = summaryText(session, tab)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: metric("small")) {
                Image(systemName: "sparkles").imageScale(.small).foregroundStyle(contentColor("action", scheme)).accessibilityHidden(true)
                Text(store.text("summaryTitle")).font(.vzn("subtitleScale", .semibold)).accessibilityAddTraits(.isHeader)
                InterpretationSummaryToolbar(label: store.text("summaryTitle"), tabs: Self.summaryOrder.map { ($0, store.text("interpret_" + $0)) }, selection: $summaryTab) {
                    if live.summarizing {
                        ProgressView().controlSize(.small); Text(store.text("summarizing")).font(.vzn("smallScale")).foregroundStyle(.secondary)
                        Button(store.text("cancel"), role: .destructive) { live.cancelSummary() }.buttonStyle(.vznQuiet)
                    } else {
                        CopyResponseButton(text: text, label: store.text("copy"), copiedLabel: store.text("copied")).disabled(text.isEmpty)
                        Button(store.text(text.isEmpty ? "summarize" : "quickRegenerate"), systemImage: text.isEmpty ? "sparkles" : "arrow.clockwise") { live.summarize(kind: tab) }.buttonStyle(.vznQuiet).disabled(live.busy)
                    }
                }
                // Collapsing leaves the head row, so the transcript gets the whole column back.
                Button { summaryCollapsed.toggle() } label: { Image(systemName: summaryCollapsed ? "chevron.down" : "chevron.up") }.buttonStyle(.vznQuiet)
                    .help(store.text(summaryCollapsed ? "interpretSummaryExpand" : "interpretSummaryCollapse")).accessibilityLabel(store.text(summaryCollapsed ? "interpretSummaryExpand" : "interpretSummaryCollapse")).accessibilityIdentifier("interpret-summary-toggle")
            }.padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            if !summaryCollapsed {
                CardDivider()
                // A long analysis scrolls inside the card, so the transcript below keeps its share of the column.
                ViewThatFits(in: .vertical) {
                    glassSummaryBody(text, tab: tab)
                    ScrollView { glassSummaryBody(text, tab: tab) }
                }
            }
        }.cardSurface(padded: false).accessibilityIdentifier("interpret-summary")
            .onChange(of: summaryTab) { _, _ in summaryCollapsed = false }
            .onChange(of: live.summarizing) { _, running in if running { summaryCollapsed = false } }
    }
    private func glassSummaryBody(_ text: String, tab: String) -> some View {
        Group {
            if text.isEmpty { Text(store.text(live.summarizing ? "summarizing" : "noContent")).foregroundStyle(contentColor("text-muted", scheme)) }
            else { TranscriptText(text: text, font: readingNSFont(store), label: store.text("interpret_" + tab), markdown: !live.summarizing, resetSelection: 0) { _ in } }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(metric("inset"))
    }
    private var words: Int { (live.current?.segments ?? []).reduce(0) { $0 + $1.original.split(whereSeparator: { $0.isWhitespace }).count } }
    private var speakerCounts: [(String, Int)] {
        var counts: [String: Int] = [:], order: [String] = []
        for segment in live.current?.segments ?? [] { let key = segment.speaker ?? ""; if counts[key] == nil { order.append(key) }; counts[key, default: 0] += 1 }
        return order.map { ($0, counts[$0] ?? 0) }
    }
    // "This session": what was recorded, who spoke, and the actions that work on the whole transcript.
    private var sessionPanel: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            CardSection(title: store.text("sessionPanel")) {
                if let current = live.current {
                    let lines = current.segments.count, speakers = speakerCounts.filter { !$0.0.isEmpty }
                    Text(Date(timeIntervalSince1970: current.created).formatted(date: .abbreviated, time: .shortened)).font(.vzn("subtitleScale", .semibold))
                    Text(store.text("speakersAndLines").replacingOccurrences(of: "{speakers}", with: String(speakers.count)).replacingOccurrences(of: "{lines}", with: String(lines))).foregroundStyle(.secondary)
                    HStack(spacing: metric("small")) {
                        Text(store.text("durationLabel") + ": " + elapsed(Date(timeIntervalSince1970: current.created + (current.segments.last?.end ?? 0)))).monospacedDigit()
                        Text("·").foregroundStyle(.secondary)
                        Text(store.text("wordsCount").replacingOccurrences(of: "{n}", with: words.formatted()))
                    }.font(.vzn("smallScale")).foregroundStyle(.secondary)
                    Text(store.text("lang_" + current.source) + " → " + store.text("lang_" + current.target) + " · " + nativeModelLabel(current.model, store: store)).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(2)
                    if !speakers.isEmpty {
                        Divider()
                        ForEach(speakers, id: \.0) { speaker, count in
                            HStack {
                                Text(current.speakerNameMap?[speaker] ?? speaker).font(.vzn("labelScale", .medium))
                                Spacer(minLength: metric("small"))
                                Text(store.text("speakerLines").replacingOccurrences(of: "{n}", with: String(count))).font(.vzn("smallScale")).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button { summaryTab = "summary"; live.summarize(kind: "summary") } label: { Label(store.text("summarize"), systemImage: "sparkles").frame(maxWidth: .infinity) }.buttonStyle(.vznPrimary)
                        .disabled(live.busy || current.segments.isEmpty).padding(.top, metric("small")).accessibilityIdentifier("interpret-panel-summarize")
                } else {
                    Text(store.text("interpretEmptyHint")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            CardSection(title: store.text("yourTranscript")) {
                Text(store.text("transcriptSavedHint")).font(.vzn("smallScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: metric("small")) {
                    Button { export(srt: false) } label: { Label("TXT", systemImage: "square.and.arrow.down").frame(maxWidth: .infinity) }.buttonStyle(.vznOutline)
                    Button { export(srt: true) } label: { Label("SRT", systemImage: "square.and.arrow.down").frame(maxWidth: .infinity) }.buttonStyle(.vznOutline)
                }.disabled(live.current?.segments.isEmpty != false)
            }
            Button { toggle("history") } label: {
                Label(store.text("previousSessions"), systemImage: "clock").frame(maxWidth: .infinity)
            }.buttonStyle(.vznOutline).disabled(live.busy).layerAnchor("history").accessibilityAddTraits(layer == "history" ? .isSelected : [])
                .accessibilityIdentifier("interpret-previous-sessions")
        }
    }
    private func syncSelection() {
        if let current = live.current {
            model = current.model; source = current.source; target = current.target; captureMode = current.captureMode ?? "microphone"; deviceID = current.deviceID ?? ""
        } else if model.isEmpty { model = store.session.model; target = store.session.target }
    }
    // Reversible: the session leaves at once and the toast's Undo puts it back.
    private func deleteWithUndo(_ id: String) {
        guard let session = live.sessions.first(where: { $0.id == id }) else { return }
        live.deleteSession(id)
        ToastCenter.shared.show(store.text("interpretationDeleted"), key: "interpretation-delete", actionLabel: store.text("undo")) { live.restoreSession(session) }
    }
    private func elapsed(_ date: Date) -> String {
        guard let created = live.current?.created else { return "" }
        let seconds = max(0, Int(date.timeIntervalSince1970 - created))
        return seconds >= 3600 ? String(format: "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60) : String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
    private var running: Bool { live.listening || live.starting }
    private func clock(_ seconds: Double) -> String {
        let value = max(0, Int(seconds))
        return value >= 3600 ? String(format: "%d:%02d:%02d", value / 3600, value / 60 % 60, value % 60) : String(format: "%02d:%02d", value / 60, value % 60)
    }
    private var languageRow: some View {
        HStack(spacing: metric("inset")) {
            NativeFlow(spacing: metric("small")) {
                LanguagePill(store: store, role: store.text("inputLanguage"), code: source, open: layer == "source") { toggle("source") }.disabled(live.busy).layerAnchor("source").accessibilityAddTraits(layer == "source" ? .isSelected : [])
                Button { let previous = source; source = target; target = previous } label: { Image(systemName: "arrow.left.arrow.right").foregroundStyle(contentColor("text-muted", scheme)) }
                    .buttonStyle(.vznOutline).disabled(live.busy || source == "auto").help(store.text("swap")).accessibilityLabel(store.text("swap"))
                LanguagePill(store: store, role: store.text("outputLanguage"), code: target, open: layer == "target") { toggle("target") }.disabled(live.busy).layerAnchor("target").accessibilityAddTraits(layer == "target" ? .isSelected : [])
            }
            Spacer(minLength: metric("small"))
            // Real model IDs from provider discovery; the chip opens the list, not a free-text field.
            Menu {
                Picker(store.text("model"), selection: $model) {
                    ForEach(modelChoices, id: \.self) { id in Text(nativeModelLabel(id, store: store)).tag(id) }
                }.pickerStyle(.inline)
                Divider()
                Button(store.text("recordingOptions")) { setupOpen = true }
            } label: {
                // `✦ Haiku 5.5 ⌄` on a glass pill, like the other language pages' model chip.
                HStack(spacing: metric("small") - metric("hairline") * 2) {
                    if modelUnavailable(model, store: store) { StatusDot(tone: .failed) } else { Image(systemName: "sparkles").imageScale(.small).foregroundStyle(contentColor("action", scheme)) }
                    Text(model.isEmpty ? store.text("modelID") : ModelLineup.shortName(model)).foregroundStyle(contentColor("text-strong", scheme))
                    Image(systemName: "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme))
                }.lineLimit(1)
            }
                .menuStyle(.button).buttonStyle(VznButtonStyle(kind: .outline)).menuIndicator(.hidden).fixedSize().foregroundStyle(.secondary).help(model).disabled(live.busy)
                .accessibilityLabel(store.text("model") + ": " + model)
        }
    }
    // Session state, source and the single start/stop action.
    @ViewBuilder private var sessionBar: some View {
        glassSessionBar
    }
    // Interpret board: state chip with time, the capture source, a 7-bar level meter,
    // then Floating subtitles and the single Start / Stop action.
    private var glassSessionBar: some View {
        HStack(spacing: metric("gap")) {
            if running {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    StatusBadge(text: live.listening ? store.text("listeningFor").replacingOccurrences(of: "{time}", with: elapsed(context.date)) : store.text("listening"), tone: .busy)
                }.accessibilityIdentifier("interpret-elapsed")
            } else if let segments = live.current?.segments, let last = segments.last {
                // Interpret-States: a stopped session reads neutral with its recorded length.
                StatusBadge(text: store.text("stoppedFor").replacingOccurrences(of: "{time}", with: clock(last.end)), tone: .idle).accessibilityIdentifier("interpret-stopped")
            } else {
                StatusBadge(text: store.text("runtimeReady"), tone: .ready).accessibilityIdentifier("interpret-ready")
            }
            Button { toggle("setup") } label: {
                HStack(spacing: metric("small") - metric("hairline") * 2) {
                    Image(systemName: captureMode == "system" ? "speaker.wave.2" : "mic")
                    Text(store.text("capture_" + captureMode))
                    Image(systemName: "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme))
                }
            }.buttonStyle(.vznQuiet).fixedSize().layerAnchor("setup").accessibilityAddTraits(layer == "setup" ? .isSelected : [])
                .help(store.text("captureOptions")).accessibilityLabel(store.text("captureOptions") + ": " + store.text("capture_" + captureMode))
            if live.listening { LevelMeter(level: live.level).accessibilityLabel(store.text("inputLevel")) }
            Spacer(minLength: metric("small"))
            Button(store.text("subtitles"), systemImage: "captions.bubble") { toggleSubtitles() }.buttonStyle(.vznOutline).fixedSize()
            if running {
                Button(store.text("stop"), systemImage: "stop.fill", role: .destructive) { live.stop() }.buttonStyle(.vznOutline).fixedSize()
            } else {
                if !(live.current?.segments.isEmpty ?? true) {
                    // Same action as the header's New session; Start keeps listening into this one.
                    Button(store.text("newInterpretation"), systemImage: "arrow.clockwise") { live.clearSelection() }.buttonStyle(.vznOutline).fixedSize()
                        .disabled(live.busy).accessibilityIdentifier("interpret-new-inline")
                }
                Button(store.text("startInterpretation"), systemImage: "mic") { store.audio.cancel(); Task { await live.start(model: model, provider: store.speechProvider, source: source, target: target, locale: store.workspace.locale, captureMode: captureMode, deviceID: deviceID) } }
                    .buttonStyle(.vznPrimary).fixedSize()
                    .disabled(live.busy || store.loadBlocked || live.storageBlocked || !NativeModel.valid(model) || model.hasPrefix("demo."))
            }
        }
    }
    @ViewBuilder private var transcriptBar: some View {
        HStack(spacing: metric("small")) {
            Text(store.text("transcript")).font(.system(size: NSFont.systemFontSize, weight: .semibold)).accessibilityAddTraits(.isHeader)
            FilterTabs(label: store.text("transcriptView"), items: [(true, store.text("pairedTranscript")), (false, store.text("translationOnly"))], selection: $showOriginal)
            Spacer(minLength: metric("small"))
            Button { toggle("analyses") } label: { Image(systemName: "sparkles") }.buttonStyle(.vznQuiet).layerAnchor("analyses").accessibilityAddTraits(layer == "analyses" ? .isSelected : [])
                .disabled(live.busy || live.current?.segments.isEmpty != false).help(store.text("summarize")).accessibilityLabel(store.text("summarize"))
            if live.processing || live.summarizing { Button(store.text("cancel"), role: .destructive) { live.cancel() }.buttonStyle(.vznQuiet) }
            Button { toggle("export") } label: {
                HStack(spacing: metric("small") - metric("hairline") * 2) {
                    Image(systemName: "square.and.arrow.up"); Text(store.text("exportTranscript"))
                    Image(systemName: "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme))
                }
            }.buttonStyle(.vznQuiet).fixedSize().layerAnchor("export").accessibilityAddTraits(layer == "export" ? .isSelected : []).disabled(live.current?.segments.isEmpty != false)
        }
    }
    private var historyPanel: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack {
                Text(store.text("interpret") + " · " + store.text("history")).font(.vzn("labelScale", .semibold))
                Spacer()
                Button { layer = nil } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).help(store.text("close")).accessibilityLabel(store.text("close"))
            }
            SearchBox(query: $historyQuery, label: store.text("historySearch"), move: moveHistory, submit: openHistory, cancel: { layer = nil })
            ScrollView {
                LazyVStack(alignment: .leading, spacing: metric("small")) {
                    if historyRecords.isEmpty { Text(store.text("noHistory")).foregroundStyle(.secondary) }
                    ForEach(historyRecords) { session in
                        Button {
                            live.select(session.id); layer = nil
                        } label: {
                            HStack(alignment: .top, spacing: metric("small")) {
                                VStack(alignment: .leading, spacing: metric("tight")) {
                                    Text(Date(timeIntervalSince1970: session.created).formatted(date: .abbreviated, time: .shortened)).fontWeight(.medium)
                                    Text(session.segments.first?.original ?? session.model).lineLimit(2).foregroundStyle(.secondary)
                                    Text(store.text("lang_" + session.source) + " → " + store.text("lang_" + session.target) + " · " + store.text("speakerLines").replacingOccurrences(of: "{n}", with: String(session.segments.count)))
                                        .font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(1)
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                Button { layer = nil; deleteWithUndo(session.id) } label: { Image(systemName: "trash").foregroundStyle(contentColor("danger", scheme)) }
                                    .buttonStyle(.vznQuiet).help(store.text("deleteSession")).accessibilityLabel(store.text("deleteSession"))
                            }.padding(metric("small"))
                        }.buttonStyle(.plain)
                            .background {
                                if session.id == historyHighlight {
                                    GlassLens(radius: metric("radius"))
                                }
                            }
                            .accessibilityAddTraits(session.id == live.selectedID ? .isSelected : [])
                    }
                }
            }
            Divider()
            Button(store.text("delete"), role: .destructive) { if let id = historyHighlight ?? live.selectedID { layer = nil; deleteWithUndo(id) } }.disabled(historyHighlight == nil && live.selectedID == nil)
                .buttonStyle(VznButtonStyle(kind: .quiet))
        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor") + (metric("large") + metric("gap")), height: metric("editor") * 3)
            .onAppear { historyHighlight = historyRecords.first(where: { $0.id == live.selectedID })?.id ?? historyRecords.first?.id }
            .onChange(of: historyQuery) { _, _ in historyHighlight = historyRecords.first?.id }
    }
    // Time and speaker lead each segment; original then translation on the right.
    @ViewBuilder private func segmentRow(_ segment: InterpretationSegment) -> some View {
        glassSegmentRow(segment)
    }
    // Mono time, then speaker, the original (13, muted) and the translation (14).
    private func glassSegmentRow(_ segment: InterpretationSegment) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: metric("gutter")) {
                Text(String(format: "%02d:%02d", Int(segment.start) / 60, Int(segment.start) % 60))
                    .font(.system(size: NSFont.systemFontSize * metric("smallScale"), design: .monospaced)).foregroundStyle(contentColor("text-muted", scheme))
                    .frame(width: metric("large") + metric("gutter"), alignment: .leading)
                VStack(alignment: .leading, spacing: metric("tight")) {
                    if let speaker = segment.speaker {
                        TextField(speaker, text: Binding(get: { live.current?.speakerNameMap?[speaker] ?? speaker }, set: { live.renameSpeaker(speaker, name: $0) }))
                            .textFieldStyle(.plain).font(.system(size: NSFont.systemFontSize, weight: .semibold)).foregroundStyle(contentColor("text", scheme))
                            .disabled(live.busy).accessibilityLabel(store.text("speakerName"))
                    }
                    if showOriginal { Text(segment.original).font(readingFont(store)).foregroundStyle(contentColor("text-muted", scheme)).textSelection(.enabled) }
                    Text(segment.translated).font(readingFont(store)).foregroundStyle(contentColor("text-strong", scheme)).textSelection(.enabled)
                    if segment.status != "succeeded" || segment.error != nil || ["failed", "interrupted", "cancelled"].contains(segment.status) {
                        HStack(spacing: metric("small")) {
                            Text(store.text(segment.error ?? segment.status)).font(.vzn("captionScale")).foregroundStyle(.secondary)
                            if ["failed", "interrupted", "cancelled"].contains(segment.status), !segment.original.isEmpty { Button(store.text("retry")) { live.retry(segment.id) }.buttonStyle(.vznQuiet).disabled(live.busy) }
                        }
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
                // Overlays-Listen: click reads the translation; secondary click opens the layer (original too).
                ListenSpeakerButton(store: store, label: store.text("speak"),
                                    sources: [ListenSource(id: segment.id + "-translated", title: store.text("result"), text: segment.translated, language: live.current?.target ?? target),
                                              ListenSource(id: segment.id + "-original", title: store.text("source"), text: segment.original, language: live.current?.source == "auto" ? (TextLanguage.detect(segment.original) ?? store.workspace.locale) : (live.current?.source ?? source))],
                                    audio: live.playback)
                    .disabled(live.listening || live.starting || segment.translated.isEmpty)
            }.padding(.vertical, metric("gap"))
            CardDivider()
        }
    }
    @ViewBuilder private func layerPanel(_ id: String, height: CGFloat) -> some View {
        switch id {
        case "source":
            LanguagePickerPanel(store: store, codes: ["auto"] + nativeResources.nativeLanguages, selection: source, choose: { source = $0; layer = nil }, dismiss: { layer = nil }, maxHeight: height)
        case "target":
            LanguagePickerPanel(store: store, codes: nativeResources.nativeLanguages, selection: target, choose: { target = $0; layer = nil }, dismiss: { layer = nil }, maxHeight: height)
        case "setup": setupPanel
        case "analyses":
            // ✦ menu: start one analysis; the ones that already have a result carry a check.
            VStack(alignment: .leading, spacing: metric("tight")) {
                ForEach(Self.summaryOrder, id: \.self) { kind in
                    PanelRow(title: store.text("interpret_" + kind), selected: live.current.map { !summaryText($0, kind).isEmpty } ?? false, identifier: "analysis-" + kind) {
                        summaryTab = kind; live.summarize(kind: kind); layer = nil
                    }
                }
            }.padding(metric("small")).frame(width: metric("sidebar") + metric("large") + metric("gap"))
        case "export":
            VStack(alignment: .leading, spacing: metric("tight")) {
                PanelRow(title: store.text("copy"), detail: store.text(showOriginal ? "pairedTranscript" : "translationOnly"), symbol: "doc.on.doc", identifier: "export-copy") {
                    copyText(live.export(srt: false, translatedOnly: !showOriginal), store: store); layer = nil
                }
                PanelRow(title: "TXT…", symbol: "square.and.arrow.up", identifier: "export-txt") { layer = nil; export(srt: false) }
                PanelRow(title: "SRT…", symbol: "square.and.arrow.up", identifier: "export-srt") { layer = nil; export(srt: true) }
                CardDivider().padding(.vertical, metric("tight"))
                PanelRow(title: store.text("stopSpeaking"), symbol: "speaker.slash", identifier: "export-stop-speaking") { live.playback.stopSpeaking(); layer = nil }
            }.padding(metric("small")).frame(width: metric("sidebar") + metric("large") + metric("gap"))
        case "history", "history-head":
            historyPanel
        default: EmptyView()
        }
    }
    // Interpretation setup as a panel of setting rows (Overlays-Language board).
    private var setupPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(store.text("captureOptions")).font(.vzn("labelScale", .semibold)).accessibilityAddTraits(.isHeader)
                Spacer(minLength: metric("small"))
                Button { layer = nil } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).help(store.text("close")).accessibilityLabel(store.text("close"))
            }.padding(.leading, metric("inset")).padding(.trailing, metric("small")).frame(height: metric("navControl") + metric("small"))
            CardRow(title: store.text("captureSource")) {
                FilterTabs(label: store.text("captureSource"), items: ["microphone", "system", "mixed"].map { ($0, store.text("capture_" + $0)) }, selection: $captureMode)
            }.disabled(live.busy)
            CardRow(title: store.text("captureDevice"), divider: false) {
                Picker(store.text("captureDevice"), selection: $deviceID) {
                    Text(store.text("voiceAutomatic")).tag("")
                    ForEach(inputs) { Text($0.name).tag($0.id) }
                }.labelsHidden().fixedSize()
            }.disabled(live.busy || captureMode == "system").onAppear { inputs = SystemAudioCapture.inputs }
        }.environment(\.cardRowInset, metric("inset")).frame(width: metric("sidebar") + metric("editor") + metric("small"))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("captureOptions"))
    }
    private func export(srt: Bool) {
        let panel = NSSavePanel(); panel.allowedContentTypes = [srt ? (UTType(filenameExtension: "srt") ?? .plainText) : .plainText]; panel.nameFieldStringValue = "interpretation." + (srt ? "srt" : "txt")
        panel.begin { response in guard response == .OK, let url = panel.url else { return }; do { try live.export(srt: srt, translatedOnly: !showOriginal).write(to: url, atomically: true, encoding: .utf8); announceSaved(url, store: store) } catch { ToastCenter.shared.show(store.text("exportFailed"), key: "interpret-export", error: true) } }
    }
    private func toggleSubtitles() {
        if let subtitle { subtitle.close(); self.subtitle = nil; return }
        // Glass (Overlays-Interpret board): a borderless dark card that the background drags.
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: metric("reading"), height: metric("editor")),
                            styleMask: [.borderless, .resizable, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isReleasedWhenClosed = false; panel.level = .floating; panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]; panel.title = store.text("subtitles")
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true; panel.isMovableByWindowBackground = true
        panel.contentView = NSHostingView(rootView: InterpretationSubtitles(store: store, close: { [weak panel] in panel?.close() }))
        // Docked at the bottom of the screen, where captions are read, not in the middle of the work.
        if let screen = NSScreen.main?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: screen.midX - panel.frame.width / 2, y: screen.minY + metric("inset")))
        } else { panel.center() }
        panel.orderFrontRegardless(); subtitle = panel
    }
}
// Keep the analysis tabs and their actions intact when the reading column narrows.
// One layout changes positions without replacing controls or their state on resize.
struct InterpretationSummaryToolbar<Actions: View>: View {
    var label: String
    var tabs: [(String, String)]
    @Binding var selection: String
    @ViewBuilder var actions: Actions
    private var groupHeight: CGFloat {
        metric("compactControl") + metric("tight") * 2
    }
    var body: some View {
        NativeFlow(spacing: metric("small")) {
            FilterTabs(label: label, items: tabs, selection: $selection)
            HStack(spacing: metric("small")) { actions }
                .fixedSize(horizontal: true, vertical: false)
                .frame(minHeight: groupHeight)
        }
    }
}

private struct InterpretationSubtitles: View {
    let store: WorkbenchStore
    var close: () -> Void = {}
    var body: some View {
        card.environment(\.colorScheme, .dark)
    }
    // Speaker · time with Stop and Close, the original muted, the translation large.
    private var card: some View {
        let shape = RoundedRectangle(cornerRadius: metric("surfaceRadius"), style: .continuous)
        let segment = store.interpretation.current?.segments.last
        return VStack(alignment: .leading, spacing: metric("small")) {
            HStack(spacing: metric("small")) {
                if store.interpretation.listening { StatusDot(tone: .busy) }
                if let segment {
                    Text([segment.speaker.map { store.interpretation.current?.speakerNameMap?[$0] ?? $0 }, String(format: "%02d:%02d", Int(segment.start) / 60, Int(segment.start) % 60)].compactMap { $0 }.joined(separator: " · "))
                        .font(.vzn("smallScale", .medium)).foregroundStyle(chromeColor("text-muted", .dark))
                }
                Spacer(minLength: metric("small"))
                if store.interpretation.listening {
                    Button(store.text("stop")) { store.interpretation.stop() }.buttonStyle(.plain).font(.vzn("smallScale", .medium)).foregroundStyle(chromeColor("text", .dark))
                }
                Button(action: close) { Image(systemName: "xmark") }.buttonStyle(.plain).foregroundStyle(chromeColor("text-muted", .dark))
                    .help(store.text("close")).accessibilityLabel(store.text("close"))
            }
            if let segment {
                Text(segment.original).font(readingFont(store)).foregroundStyle(chromeColor("text-muted", .dark)).lineLimit(2)
                Text(segment.translated).font(.vzn("titleScale", .semibold)).foregroundStyle(chromeColor("text-strong", .dark)).lineLimit(3)
            } else {
                Text(store.text(store.interpretation.listening ? "listening" : "interpretEmpty")).foregroundStyle(chromeColor("text-muted", .dark))
            }
        }.padding(.horizontal, metric("gutter") - metric("tight")).padding(.vertical, metric("inset"))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(shape.fill(chromeColor("surface-raised", .dark)))
            .overlay(shape.strokeBorder(chromeColor("border", .dark), lineWidth: metric("hairline")))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("subtitles"))
    }
}

// Seven-bar input level for the session bar (Interpret board); decorative, the label carries it.
private struct LevelMeter: View {
    var level: Double
    @Environment(\.colorScheme) private var scheme
    // A fixed waveform silhouette scaled by the live input level.
    private static let profile: [Double] = [0.45, 0.75, 1, 0.8, 0.6, 0.9, 0.5]
    var body: some View {
        HStack(alignment: .center, spacing: metric("hairline") * 2) {
            ForEach(Array(Self.profile.enumerated()), id: \.offset) { _, shape in
                Capsule().fill(contentColor("action", scheme))
                    .frame(width: metric("hairline") * 3, height: max(metric("tight"), (metric("gutter") - metric("tight")) * shape * min(1, max(0, level))))
            }
        }.frame(height: metric("gutter")).accessibilityElement()
    }
}
