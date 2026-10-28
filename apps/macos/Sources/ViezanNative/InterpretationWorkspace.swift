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
    @State private var deleteID: String?
    @State private var captureMode = "microphone"
    @State private var deviceID = ""
    @State private var inputs: [NativeInputDevice] = []
    @State private var source = "auto"
    @State private var target = "vi"
    @State private var model = ""
    @State private var subtitle: NSPanel?
    @State private var exportError = false
    private var live: Interpretation { store.interpretation }
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
            sessionBar
            if live.listening { ProgressView(value: live.level).progressViewStyle(.linear).accessibilityLabel(store.text("inputLevel")) }
            else if live.busy { ProgressView(store.text("running")).controlSize(.small) }
            if let error = live.error { Label(store.text(error), systemImage: "exclamationmark.triangle").foregroundStyle(Color(nsColor: .systemRed)).textSelection(.enabled) }
            transcriptBar
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if (live.current?.segments ?? []).isEmpty {
                        ContentUnavailableView(store.text("interpretEmpty"), systemImage: "waveform", description: Text(store.text("interpretEmptyHint")))
                            .frame(maxWidth: .infinity).padding(.top, metric("large"))
                    }
                    ForEach(live.current?.segments ?? []) { segment in segmentRow(segment) }
                    if live.listening {
                        HStack(spacing: metric("small")) { StatusDot(tone: .ready); Text(store.text("listening") + "…") }
                            .font(.callout).foregroundStyle(.secondary).padding(.vertical, metric("inset"))
                    }
                    if let current = live.current {
                        ForEach(Array(zip(["summary", "actionItems", "decisions", "speakerAnalysis"], [current.summary, current.actionItems ?? "", current.decisions ?? "", current.speakerAnalysis ?? ""])), id: \.0) { kind, content in
                            if !content.isEmpty { DisclosureGroup(store.text("interpret_" + kind)) { Text(content).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }.padding(.vertical, metric("small")) }
                        }
                    }
                }.frame(maxWidth: metric("reading"), alignment: .leading).frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, metric("large") + metric("gap")).padding(.vertical, metric("inset"))
        // History opens from the header's History control (Review 18).
        .overlay(alignment: .topTrailing) { Color.clear.frame(width: metric("hairline"), height: metric("hairline")).popover(isPresented: $historyOpen, arrowEdge: .top) { historyPanel } }
        .onReceive(NotificationCenter.default.publisher(for: .viezanInterpretHistory)) { _ in if !live.busy { historyOpen.toggle() } }
        .confirmationDialog(store.text("deleteInterpretation"), isPresented: Binding(get: { deleteID != nil }, set: { if !$0 { deleteID = nil } })) {
            Button(store.text("delete"), role: .destructive) { if let id = deleteID { live.deleteSession(id) }; deleteID = nil }
        }
        .onAppear { syncSelection() }
        .onChange(of: live.selectedID) { _, _ in syncSelection() }
        .onDisappear { live.playback.stopSpeaking(); subtitle?.close(); subtitle = nil }
        .alert(store.text("interpretStorageError"), isPresented: $exportError) { Button(store.text("close"), role: .cancel) {} }
    }
    private func syncSelection() {
        if let current = live.current {
            model = current.model; source = current.source; target = current.target; captureMode = current.captureMode ?? "microphone"
        } else if model.isEmpty { model = store.session.model; target = store.session.target }
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
            Button { setupOpen = true } label: { ModelBadgeLabel(text: model.isEmpty ? store.text("modelID") : nativeModelLabel(model, store: store), offline: modelUnavailable(model, store: store)) }
                .buttonStyle(.vznQuiet).foregroundStyle(.secondary).help(model).disabled(live.busy)
        }
    }
    // Session state, source and the single start/stop action.
    private var sessionBar: some View {
        HStack(spacing: metric("inset")) {
            if running { StatusBadge(text: store.text("listening"), tone: .ready) }
            Button { setupOpen.toggle() } label: { Label(store.text("capture_" + captureMode), systemImage: captureMode == "system" ? "speaker.wave.2" : "mic") }
                .buttonStyle(.vznQuiet).tint(.primary).help(store.text("captureOptions")).accessibilityLabel(store.text("captureOptions") + ": " + store.text("capture_" + captureMode))
                .popover(isPresented: $setupOpen) {
                    VStack(alignment: .leading, spacing: metric("inset")) {
                        HStack { Text(store.text("captureOptions")).font(.headline); Spacer(); Button(store.text("close")) { setupOpen = false } }
                        Picker(store.text("captureSource"), selection: $captureMode) { ForEach(["microphone", "system", "mixed"], id: \.self) { Text(store.text("capture_" + $0)).tag($0) } }.disabled(live.busy)
                        Picker(store.text("captureDevice"), selection: $deviceID) {
                            Text(store.text("voiceAutomatic")).tag("")
                            ForEach(inputs) { Text($0.name).tag($0.id) }
                        }.disabled(live.busy || captureMode == "system").onAppear { inputs = SystemAudioCapture.inputs }
                        TextField(store.text("modelID"), text: $model).disabled(live.busy)
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
            Text(store.text("transcript")).font(.title3).fontWeight(.semibold).accessibilityAddTraits(.isHeader)
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
            HStack { Text(store.text("history")).font(.headline); Spacer(); Button(store.text("close")) { historyOpen = false } }
            HistorySearch(query: $historyQuery, label: store.text("historySearch"), move: moveHistory, submit: openHistory, cancel: { historyOpen = false }).frame(height: metric("control"))
            ScrollView {
                LazyVStack(alignment: .leading, spacing: metric("small")) {
                    if historyRecords.isEmpty { Text(store.text("noHistory")).foregroundStyle(.secondary) }
                    ForEach(historyRecords) { session in
                        Button {
                            live.select(session.id); historyOpen = false
                        } label: {
                            VStack(alignment: .leading, spacing: metric("small")) {
                                Text(Date(timeIntervalSince1970: session.created).formatted(date: .abbreviated, time: .shortened)).fontWeight(.medium)
                                Text(session.segments.first?.original ?? session.model).lineLimit(2).foregroundStyle(.secondary)
                            }.frame(maxWidth: .infinity, alignment: .leading).padding(metric("small"))
                        }.buttonStyle(.plain)
                            .background(session.id == historyHighlight ? Color.accentColor.opacity(metric("selectionOpacity")) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                            .accessibilityAddTraits(session.id == live.selectedID ? .isSelected : [])
                    }
                }
            }
            Divider()
            Button(store.text("delete"), role: .destructive) { historyOpen = false; deleteID = live.selectedID }.disabled(live.selectedID == nil)
        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"), height: metric("editor") * 3)
            .onAppear { historyHighlight = historyRecords.first(where: { $0.id == live.selectedID })?.id ?? historyRecords.first?.id }
            .onChange(of: historyQuery) { _, _ in historyHighlight = historyRecords.first?.id }
    }
    // Time and speaker lead each segment; original then translation on the right.
    private func segmentRow(_ segment: InterpretationSegment) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: metric("gutter")) {
                VStack(alignment: .leading, spacing: metric("small")) {
                    Text(String(format: "%02d:%02d", Int(segment.start) / 60, Int(segment.start) % 60)).font(.callout).monospacedDigit().foregroundStyle(.secondary)
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
                            Text(store.text(segment.error ?? segment.status)).font(.caption).foregroundStyle(.secondary)
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
        let panel = NSSavePanel(); panel.allowedContentTypes = [.plainText]; panel.nameFieldStringValue = "interpretation." + (srt ? "srt" : "txt")
        panel.begin { response in guard response == .OK, let url = panel.url else { return }; do { try live.export(srt: srt).write(to: url, atomically: true, encoding: .utf8) } catch { exportError = true } }
    }
    private func toggleSubtitles() {
        if let subtitle { subtitle.close(); self.subtitle = nil; return }
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: metric("reading"), height: metric("editor") * 2), styleMask: [.titled, .closable, .resizable, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isReleasedWhenClosed = false; panel.level = .floating; panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]; panel.title = store.text("subtitles")
        panel.contentView = NSHostingView(rootView: InterpretationSubtitles(store: store)); panel.center(); panel.orderFrontRegardless(); subtitle = panel
    }
}
private struct InterpretationSubtitles: View {
    let store: WorkbenchStore
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metric("small")) {
                if let segment = store.interpretation.current?.segments.last {
                    if let speaker = segment.speaker {
                                Text(store.interpretation.current?.speakerNameMap?[speaker] ?? speaker).font(.caption).foregroundStyle(.secondary)
                            }
                            Text(segment.original).foregroundStyle(.secondary)
                    Text(segment.translated).font(.title2)
                }
                if store.interpretation.listening { Button(store.text("stop"), role: .destructive) { store.interpretation.stop() } }
            }.padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
