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
        VStack(spacing: metric("inset")) {
            captureControls
            if live.listening { ProgressView(value: live.level).accessibilityLabel(store.text("inputLevel")) }
            else if live.busy { ProgressView(store.text("running")).controlSize(.small) }
            if let error = live.error { Text(store.text(error)).foregroundStyle(.red).textSelection(.enabled) }
            NativeFlow(spacing: metric("small")) {
                Button(store.text("history"), systemImage: "clock") { historyOpen.toggle() }.disabled(live.busy)
                    .popover(isPresented: $historyOpen) {
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
                Picker(store.text("transcriptView"), selection: $showOriginal) {
                    Text(store.text("pairedTranscript")).tag(true)
                    Text(store.text("translationOnly")).tag(false)
                }.labelsHidden().pickerStyle(.menu).accessibilityLabel(store.text("transcriptView"))
                Button(store.text("subtitles")) { toggleSubtitles() }
                Button(store.text("copy")) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(live.export(srt: false), forType: .string) }
                Menu(store.text("export")) {
                    Button("TXT") { export(srt: false) }
                    Button("SRT") { export(srt: true) }
                }
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: metric("inset")) {
                    if (live.current?.segments ?? []).isEmpty {
                        ContentUnavailableView(store.text("interpretEmpty"), systemImage: "waveform", description: Text(store.text("interpretEmptyHint")))
                            .frame(maxWidth: .infinity)
                    }
                    ForEach(live.current?.segments ?? []) { segment in
                        VStack(alignment: .leading, spacing: metric("small")) {
                            if let speaker = segment.speaker {
                                TextField(speaker, text: Binding(get: { live.current?.speakerNameMap?[speaker] ?? speaker }, set: { live.renameSpeaker(speaker, name: $0) })).disabled(live.busy).accessibilityLabel(store.text("speakerName"))
                            }
                            if showOriginal { Text(segment.original).foregroundStyle(.secondary).textSelection(.enabled) }
                            Text(segment.translated).textSelection(.enabled)
                            HStack {
                                Text(store.text(segment.error ?? segment.status)).font(.caption).foregroundStyle(.secondary)
                                Spacer()
                                if ["failed", "interrupted", "cancelled"].contains(segment.status), !segment.original.isEmpty { Button(store.text("retry")) { live.retry(segment.id) }.disabled(live.busy) }
                                Button(store.text("speak")) { live.playback.speak(segment.translated, language: live.current?.target ?? target) }.disabled(live.listening || live.starting || segment.translated.isEmpty)
                            }
                        }
                        Divider()
                    }
                    if let current = live.current {
                        ForEach(Array(zip(["summary", "actionItems", "decisions", "speakerAnalysis"], [current.summary, current.actionItems ?? "", current.decisions ?? "", current.speakerAnalysis ?? ""])), id: \.0) { kind, content in
                            if !content.isEmpty { DisclosureGroup(store.text("interpret_" + kind)) { Text(content).textSelection(.enabled) } }
                        }
                    }
                }.frame(maxWidth: metric("reading"), alignment: .leading).frame(maxWidth: .infinity)
            }
            NativeFlow(spacing: metric("small")) {
                Menu(store.text("summarize")) {
                    ForEach(["summary", "actionItems", "decisions", "speakerAnalysis"], id: \.self) { kind in
                        Button(store.text("interpret_" + kind)) { live.summarize(kind: kind) }
                    }
                }.disabled(live.busy || live.current?.segments.isEmpty != false)
                Button(store.text("stopSpeaking")) { live.playback.stopSpeaking() }
                if live.processing || live.summarizing { Button(store.text("cancel"), role: .destructive) { live.cancel() } }
            }
        }
        .padding(metric("inset"))
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
    private var captureControls: some View {
        NativeFlow(spacing: metric("small")) {
            Picker(store.text("inputLanguage"), selection: $source) { ForEach(["auto"] + nativeResources.nativeLanguages, id: \.self) { code in Text(store.text("lang_" + code)).tag(code) } }.disabled(live.busy)
            Picker(store.text("outputLanguage"), selection: $target) { ForEach(nativeResources.nativeLanguages, id: \.self) { code in Text(store.text("lang_" + code)).tag(code) } }.disabled(live.busy)
            Button { setupOpen.toggle() } label: { Label(store.text("captureOptions"), systemImage: "slider.horizontal.3") }
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
            Button(store.text(live.listening || live.starting ? "stop" : "startInterpretation"), role: live.listening || live.starting ? .destructive : nil) {
                if live.listening || live.starting { live.stop() }
                else { store.audio.cancel(); Task { await live.start(model: model, provider: store.speechProvider, source: source, target: target, locale: store.workspace.locale, captureMode: captureMode, deviceID: deviceID) } }
            }.disabled((live.busy && !live.listening && !live.starting) || store.loadBlocked || live.storageBlocked || !NativeModel.valid(model) || model.hasPrefix("demo."))
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
