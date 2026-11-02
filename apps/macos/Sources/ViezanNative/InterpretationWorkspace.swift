import SwiftUI
import AppKit
import UniformTypeIdentifiers
import ViezanDomain

struct InterpretationWorkspace: View {
    let store: WorkbenchStore
    @State private var setupOpen = false
    @State private var historyOpen = false
    @State private var historyQuery = ""
    @State private var historyHighlight: String?
    @State private var showOriginal = true
    @State private var summaryTab = "summary"
    @State private var captureMode = "microphone"
    @State private var deviceID = ""
    @State private var inputs: [NativeInputDevice] = []
    @State private var source = "auto"
    @State private var target = "vi"
    @State private var model = ""
    @State private var subtitle: NSPanel?
    // Follow new lines while the reader sits at the end; a manual scroll up pauses following.
    @State private var followBottom = true
    @State private var userScrolling = false
    @Environment(\.colorScheme) private var scheme
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
        live.select(id); historyOpen = false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            languageRow
            Divider()
            ProviderNotice(store: store, model: model) { model = $0 }
            SpeechProviderNotice(store: store)
            sessionBar
            if live.listening { ProgressView(value: live.level).progressViewStyle(.linear).accessibilityLabel(store.text("inputLevel")) }
            else if live.busy { ProgressView(store.text("running")).controlSize(.small) }
            if let error = live.error { Label(store.text(error), systemImage: "exclamationmark.triangle").foregroundStyle(contentColor("danger", scheme)).textSelection(.enabled) }
            // Review 18: the transcript keeps the reading column; a session panel sits beside it when there is room.
            GeometryReader { geometry in
                HStack(alignment: .top, spacing: metric("gutter")) {
                    transcriptArea
                    if geometry.size.width >= metric("reading") + metric("sidebar") { sessionPanel.frame(width: metric("sidebar")) }
                }
            }
        }
        .padding(.horizontal, metric("large") + metric("gap")).padding(.vertical, metric("inset"))
        // History opens from the header's History control (Review 18).
        .overlay(alignment: .topTrailing) { Color.clear.frame(width: metric("hairline"), height: metric("hairline")).popover(isPresented: $historyOpen, arrowEdge: .top) { historyPanel } }
        .onReceive(NotificationCenter.default.publisher(for: .viezanInterpretHistory)) { _ in if !live.busy { historyOpen.toggle() } }
        // The subtitle panel's own close button must not leave a stale reference behind.
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.willCloseNotification)) { notification in
            if let panel = notification.object as? NSPanel, panel === subtitle { subtitle = nil }
        }
        .onAppear { syncSelection() }
        .onChange(of: live.selectedID) { _, _ in syncSelection() }
        .onDisappear { live.playback.stopSpeaking(); subtitle?.close(); subtitle = nil }
    }
    private var transcriptArea: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            transcriptBar
            Divider()
            ScrollViewReader { proxy in
                let segments = live.current?.segments ?? []
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if segments.isEmpty {
                            ContentUnavailableView(store.text("interpretEmpty"), systemImage: "waveform", description: Text(store.text("interpretEmptyHint")))
                                .frame(maxWidth: .infinity).padding(.top, metric("large"))
                        }
                        ForEach(segments) { segment in segmentRow(segment).id(segment.id) }
                        if live.listening {
                            HStack(spacing: metric("small")) { StatusDot(tone: .ready); Text(store.text("listening") + "…") }
                                .font(.vzn("smallScale")).foregroundStyle(.secondary).padding(.vertical, metric("inset")).id("listening-tail")
                        }
                        if let current = live.current, live.summarizing || !summaryKinds(current).isEmpty { summaryCard(current).padding(.vertical, metric("inset")) }
                    }.frame(maxWidth: metric("reading"), alignment: .leading).frame(maxWidth: .infinity)
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
    private func summaryCard(_ session: InterpretationSession) -> some View {
        let kinds = summaryKinds(session)
        let tab = kinds.contains(summaryTab) ? summaryTab : (kinds.first ?? "summary")
        let text = summaryText(session, tab)
        return CardSection(title: store.text("summaryTitle")) {
            HStack(spacing: metric("small")) {
                FilterTabs(label: store.text("summaryTitle"), items: Self.summaryOrder.map { ($0, store.text("interpret_" + $0)) }, selection: $summaryTab, accent: true)
                Spacer(minLength: metric("small"))
                if live.summarizing {
                    ProgressView().controlSize(.small); Text(store.text("summarizing")).font(.vzn("smallScale")).foregroundStyle(.secondary)
                    Button(store.text("cancel"), role: .destructive) { live.cancel() }.buttonStyle(.vznOutline)
                } else {
                    CopyResponseButton(text: text, label: store.text("copy"), copiedLabel: store.text("copied")).disabled(text.isEmpty)
                    Button(store.text("quickRegenerate"), systemImage: "arrow.clockwise") { live.summarize(kind: tab) }.buttonStyle(.vznQuiet).disabled(live.busy)
                }
            }
            if text.isEmpty {
                Text(store.text("interpretEmptyHint")).foregroundStyle(.secondary)
            } else {
                Text(text).font(readingFont(store)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            }
        }.accessibilityIdentifier("interpret-summary")
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
                    Button(store.text("summarize"), systemImage: "sparkles") { live.summarize(kind: "summary") }.buttonStyle(.vznPrimary)
                        .disabled(live.busy || current.segments.isEmpty).padding(.top, metric("small")).accessibilityIdentifier("interpret-panel-summarize")
                } else {
                    Text(store.text("interpretEmptyHint")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            CardSection(title: store.text("yourTranscript")) {
                Text(store.text("transcriptSavedHint")).font(.vzn("smallScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: metric("small")) {
                    Button("TXT", systemImage: "square.and.arrow.down") { export(srt: false) }.buttonStyle(.vznOutline)
                    Button("SRT", systemImage: "square.and.arrow.down") { export(srt: true) }.buttonStyle(.vznOutline)
                }.disabled(live.current?.segments.isEmpty != false)
            }
            Button(store.text("previousSessions"), systemImage: "clock") { historyOpen = true }.buttonStyle(.vznOutline).disabled(live.busy)
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
    private var languageRow: some View {
        HStack(spacing: metric("inset")) {
            NativeFlow(spacing: metric("inset")) {
                LanguageMenu(store: store, label: store.text("inputLanguage"), codes: ["auto"] + nativeResources.nativeLanguages, selection: source, choose: { source = $0 }, disabled: live.busy)
                Button { let previous = source; source = target; target = previous } label: { Image(systemName: "arrow.left.arrow.right") }
                    .buttonStyle(.vznQuiet).tint(.primary).disabled(live.busy || source == "auto").help(store.text("swap")).accessibilityLabel(store.text("swap"))
                LanguageMenu(store: store, label: store.text("outputLanguage"), codes: nativeResources.nativeLanguages, selection: target, choose: { target = $0 }, disabled: live.busy)
            }
            Spacer(minLength: metric("small"))
            // Real model IDs from provider discovery; the chip opens the list, not a free-text field.
            Menu {
                Picker(store.text("model"), selection: $model) {
                    ForEach(modelChoices, id: \.self) { id in Text(nativeModelLabel(id, store: store)).tag(id) }
                }.pickerStyle(.inline)
                Divider()
                Button(store.text("recordingOptions")) { setupOpen = true }
            } label: { ModelBadgeLabel(text: model.isEmpty ? store.text("modelID") : nativeModelLabel(model, store: store), offline: modelUnavailable(model, store: store)) }
                .menuStyle(.button).buttonStyle(.vznQuiet).menuIndicator(.hidden).fixedSize().foregroundStyle(.secondary).help(model).disabled(live.busy)
                .accessibilityLabel(store.text("model") + ": " + model)
        }
    }
    // Session state, source and the single start/stop action.
    private var sessionBar: some View {
        HStack(spacing: metric("inset")) {
            if running {
                // Elapsed time ticks beside the state so a long session reads as alive.
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    StatusBadge(text: live.listening ? store.text("listeningFor").replacingOccurrences(of: "{time}", with: elapsed(context.date)) : store.text("listening"), tone: .ready)
                }.accessibilityIdentifier("interpret-elapsed")
            }
            Button { setupOpen.toggle() } label: { Label(store.text("capture_" + captureMode), systemImage: captureMode == "system" ? "speaker.wave.2" : "mic") }
                .buttonStyle(.vznQuiet).tint(.primary).help(store.text("captureOptions")).accessibilityLabel(store.text("captureOptions") + ": " + store.text("capture_" + captureMode))
                .popover(isPresented: $setupOpen) {
                    VStack(alignment: .leading, spacing: metric("inset")) {
                        HStack { Text(store.text("captureOptions")).font(.vzn("labelScale", .semibold)); Spacer(); Button(store.text("close")) { setupOpen = false } }
                        Picker(store.text("captureSource"), selection: $captureMode) { ForEach(["microphone", "system", "mixed"], id: \.self) { Text(store.text("capture_" + $0)).tag($0) } }.disabled(live.busy)
                        Picker(store.text("captureDevice"), selection: $deviceID) {
                            Text(store.text("voiceAutomatic")).tag("")
                            ForEach(inputs) { Text($0.name).tag($0.id) }
                        }.disabled(live.busy || captureMode == "system").onAppear { inputs = SystemAudioCapture.inputs }
                    }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"))
                }
            Spacer(minLength: metric("small"))
            Button(store.text("subtitles"), systemImage: "captions.bubble") { toggleSubtitles() }.buttonStyle(.vznQuiet).tint(.primary)
            if running {
                Button(store.text("stop"), systemImage: "stop.fill", role: .destructive) { live.stop() }.buttonStyle(.vznOutline).controlSize(.large)
            } else {
                Button(store.text("startInterpretation"), systemImage: "waveform") { store.audio.cancel(); Task { await live.start(model: model, provider: store.speechProvider, source: source, target: target, locale: store.workspace.locale, captureMode: captureMode, deviceID: deviceID) } }
                    .buttonStyle(.vznPrimary)
                    .disabled(live.busy || store.loadBlocked || live.storageBlocked || !NativeModel.valid(model) || model.hasPrefix("demo."))
            }
        }
    }
    private var transcriptBar: some View {
        HStack(spacing: metric("small")) {
            Text(store.text("transcript")).font(.vzn("titleScale", .semibold)).fontWeight(.semibold).accessibilityAddTraits(.isHeader)
            Spacer(minLength: metric("small"))
            FilterTabs(label: store.text("transcriptView"), items: [(true, store.text("pairedTranscript")), (false, store.text("translationOnly"))], selection: $showOriginal, accent: true)
            Menu {
                ForEach(["summary", "actionItems", "decisions", "speakerAnalysis"], id: \.self) { kind in
                    Button(store.text("interpret_" + kind)) { live.summarize(kind: kind) }
                }
            } label: { Image(systemName: "sparkles") }
                .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().tint(.primary).disabled(live.busy || live.current?.segments.isEmpty != false)
                .help(store.text("summarize")).accessibilityLabel(store.text("summarize"))
            if live.processing || live.summarizing { Button(store.text("cancel"), role: .destructive) { live.cancel() } }
            Menu {
                Button(store.text("copy")) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(live.export(srt: false), forType: .string) }
                Divider()
                Button("TXT") { export(srt: false) }
                Button("SRT") { export(srt: true) }
                Divider()
                Button(store.text("stopSpeaking")) { live.playback.stopSpeaking() }
            } label: { Label(store.text("exportTranscript"), systemImage: "square.and.arrow.down").font(.vzn("labelScale")) }
                .menuStyle(.button).buttonStyle(.vznQuiet).menuIndicator(.hidden).fixedSize().disabled(live.current?.segments.isEmpty != false)
        }
    }
    private var historyPanel: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack { Text(store.text("history")).font(.vzn("labelScale", .semibold)); Spacer(); Button(store.text("close")) { historyOpen = false } }
            HistorySearch(query: $historyQuery, label: store.text("historySearch"), move: moveHistory, submit: openHistory, cancel: { historyOpen = false }).frame(height: metric("control"))
            ScrollView {
                LazyVStack(alignment: .leading, spacing: metric("small")) {
                    if historyRecords.isEmpty { Text(store.text("noHistory")).foregroundStyle(.secondary) }
                    ForEach(historyRecords) { session in
                        Button {
                            live.select(session.id); historyOpen = false
                        } label: {
                            HStack(alignment: .top, spacing: metric("small")) {
                                VStack(alignment: .leading, spacing: metric("tight")) {
                                    Text(Date(timeIntervalSince1970: session.created).formatted(date: .abbreviated, time: .shortened)).fontWeight(.medium)
                                    Text(session.segments.first?.original ?? session.model).lineLimit(2).foregroundStyle(.secondary)
                                    Text(store.text("lang_" + session.source) + " → " + store.text("lang_" + session.target) + " · " + store.text("speakerLines").replacingOccurrences(of: "{n}", with: String(session.segments.count)))
                                        .font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(1)
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                Button { historyOpen = false; deleteWithUndo(session.id) } label: { Image(systemName: "trash") }
                                    .buttonStyle(.vznQuiet).help(store.text("deleteSession")).accessibilityLabel(store.text("deleteSession"))
                            }.padding(metric("small"))
                        }.buttonStyle(.plain)
                            .background(session.id == historyHighlight ? contentColor("action-soft", scheme) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                            .accessibilityAddTraits(session.id == live.selectedID ? .isSelected : [])
                    }
                }
            }
            Divider()
            Button(store.text("delete"), role: .destructive) { if let id = historyHighlight ?? live.selectedID { historyOpen = false; deleteWithUndo(id) } }.disabled(historyHighlight == nil && live.selectedID == nil)
        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"), height: metric("editor") * 3)
            .onAppear { historyHighlight = historyRecords.first(where: { $0.id == live.selectedID })?.id ?? historyRecords.first?.id }
            .onChange(of: historyQuery) { _, _ in historyHighlight = historyRecords.first?.id }
    }
    // Time and speaker lead each segment; original then translation on the right.
    private func segmentRow(_ segment: InterpretationSegment) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: metric("gutter")) {
                VStack(alignment: .leading, spacing: metric("small")) {
                    Text(String(format: "%02d:%02d", Int(segment.start) / 60, Int(segment.start) % 60)).font(.vzn("smallScale")).monospacedDigit().foregroundStyle(.secondary)
                    if let speaker = segment.speaker {
                        TextField(speaker, text: Binding(get: { live.current?.speakerNameMap?[speaker] ?? speaker }, set: { live.renameSpeaker(speaker, name: $0) }))
                            .textFieldStyle(.plain).fontWeight(.semibold).disabled(live.busy).accessibilityLabel(store.text("speakerName"))
                    }
                }.frame(width: metric("sidebar") / 2, alignment: .leading)
                VStack(alignment: .leading, spacing: metric("small")) {
                    if showOriginal { Text(segment.original).textSelection(.enabled) }
                    Text(segment.translated).foregroundStyle(showOriginal ? .secondary : .primary).textSelection(.enabled)
                    if segment.status != "succeeded" || segment.error != nil || ["failed", "interrupted", "cancelled"].contains(segment.status) {
                        HStack(spacing: metric("small")) {
                            Text(store.text(segment.error ?? segment.status)).font(.vzn("captionScale")).foregroundStyle(.secondary)
                            if ["failed", "interrupted", "cancelled"].contains(segment.status), !segment.original.isEmpty { Button(store.text("retry")) { live.retry(segment.id) }.disabled(live.busy) }
                        }
                    }
                }.font(readingFont(store)).frame(maxWidth: .infinity, alignment: .leading)
                Button { live.playback.speak(segment.translated, language: live.current?.target ?? target) } label: { Image(systemName: "speaker.wave.2") }
                    .buttonStyle(.vznQuiet).disabled(live.listening || live.starting || segment.translated.isEmpty)
                    .help(store.text("speak")).accessibilityLabel(store.text("speak"))
            }.padding(.vertical, metric("inset"))
            Divider()
        }
    }
    private func export(srt: Bool) {
        let panel = NSSavePanel(); panel.allowedContentTypes = [srt ? (UTType(filenameExtension: "srt") ?? .plainText) : .plainText]; panel.nameFieldStringValue = "interpretation." + (srt ? "srt" : "txt")
        panel.begin { response in guard response == .OK, let url = panel.url else { return }; do { try live.export(srt: srt).write(to: url, atomically: true, encoding: .utf8) } catch { ToastCenter.shared.show(store.text("exportFailed"), key: "interpret-export", error: true) } }
    }
    private func toggleSubtitles() {
        if let subtitle { subtitle.close(); self.subtitle = nil; return }
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: metric("reading"), height: metric("editor") * 2), styleMask: [.titled, .closable, .resizable, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isReleasedWhenClosed = false; panel.level = .floating; panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]; panel.title = store.text("subtitles")
        panel.contentView = NSHostingView(rootView: InterpretationSubtitles(store: store))
        // Docked at the bottom of the screen, where captions are read, not in the middle of the work.
        if let screen = NSScreen.main?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: screen.midX - panel.frame.width / 2, y: screen.minY + metric("inset")))
        } else { panel.center() }
        panel.orderFrontRegardless(); subtitle = panel
    }
}
private struct InterpretationSubtitles: View {
    let store: WorkbenchStore
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metric("small")) {
                if let segment = store.interpretation.current?.segments.last {
                    if let speaker = segment.speaker {
                                Text(store.interpretation.current?.speakerNameMap?[speaker] ?? speaker).font(.vzn("captionScale")).foregroundStyle(.secondary)
                            }
                            Text(segment.original).foregroundStyle(.secondary)
                    Text(segment.translated).font(.vzn("headingScale", .semibold))
                }
                if store.interpretation.listening { Button(store.text("stop"), role: .destructive) { store.interpretation.stop() } }
            }.padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
