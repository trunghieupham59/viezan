import SwiftUI
import ViezanDomain

struct ChatWorkspace: View {
    @Bindable var store: WorkbenchStore
    var focusEpoch = 0
    @State private var followBottom = true
    @State private var userScrolling = false
    @State private var selectedMessage: String?
    @State private var selectionReset = 0
    private var session: Session { store.session }
    var body: some View {
        let sessionID = session.id
        VStack(spacing: metric("inset")) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: metric("gutter")) {
                        if session.messages.isEmpty {
                            ContentUnavailableView(store.text("emptyChat"), systemImage: "bubble.left.and.bubble.right", description: Text(store.text("emptyHint")))
                        }
                        ForEach(session.messages) { message in
                            VStack(alignment: .leading, spacing: metric("small")) {
                                ForEach(message.images ?? []) { image in
                                    AttachmentPreview(attachment: image)
                                    HStack {
                                        Button(store.text("saveImage")) { saveImage(image) }
                                        Button(store.text("editImage")) { store.addImage(image, sessionID: sessionID); store.setChatMode(sessionID, "image") }
                                    }
                                }
                                if let task = store.workspace.tasks.first(where: { $0.id == message.id }), let research = task.research {
                                    HStack {
                                        if task.status == .running { ProgressView().controlSize(.small) }
                                        Text(store.text("research_" + research.phase))
                                        if !research.queries.isEmpty { Text("\(research.cursor)/\(research.queries.count)").monospacedDigit() }
                                    }.font(.caption).foregroundStyle(.secondary)
                                }
                                if message.role == "assistant" { Label("Viezan", systemImage: "sparkles").font(.caption).foregroundStyle(.secondary) }
                                TranscriptText(text: message.text.isEmpty && (message.images ?? []).isEmpty ? store.text(store.workspace.tasks.first(where: { $0.id == message.id })?.status.rawValue ?? "noContent") : message.text,
                                               font: readingNSFont(store), label: store.text(message.role == "assistant" ? "response" : "you"), markdown: message.role == "assistant" && store.workspace.tasks.first(where: { $0.id == message.id })?.status != .running, resetSelection: selectionReset) { selected in
                                    if selected { selectedMessage = message.id; followBottom = false }
                                    else if selectedMessage == message.id { selectedMessage = nil }
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(message.role == "user" ? metric("inset") : 0)
                                    .background(message.role == "user" ? Color(nsColor: .controlBackgroundColor) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                                if message.role == "assistant", !message.text.isEmpty {
                                    if store.workspace.tasks.first(where: { $0.id == message.id })?.status != .running { ForEach(ChartArtifact.parse(message.text)) { NativeChart(artifact: $0) } }
                                    CopyResponseButton(text: message.text, label: store.text("copyResponse"), copiedLabel: store.text("copied"))
                                }
                            }.id(message.id)
                        }
                    }.frame(maxWidth: metric("reading")).frame(maxWidth: .infinity).padding(metric("gutter"))
                }
                .onScrollGeometryChange(for: Bool.self) { geometry in
                    geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - metric("inset")
                } action: { _, isAtBottom in if userScrolling && selectedMessage == nil { followBottom = isAtBottom } }
                .onScrollPhaseChange { _, phase, context in
                    let wasUserScrolling = userScrolling
                    userScrolling = phase == .interacting || phase == .decelerating || phase == .tracking
                    if (userScrolling || wasUserScrolling) && selectedMessage == nil {
                        let geometry = context.geometry
                        followBottom = geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - metric("inset")
                    }
                }
                .onChange(of: session.messages) { _, messages in
                    if followBottom, let last = messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
                .task(id: sessionID) {
                    followBottom = true; selectedMessage = nil; selectionReset += 1
                    if let last = session.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
                .overlay(alignment: .bottom) {
                    if !followBottom && !session.messages.isEmpty {
                        Button(store.text("returnLatest"), systemImage: "arrow.down") {
                            selectionReset += 1; selectedMessage = nil; followBottom = true
                            if let last = session.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                        }.buttonStyle(.bordered).padding(metric("small"))
                    }
                }
            }
            if let task = store.workspace.tasks.first(where: { $0.request.sessionID == session.id }), [.failed, .interrupted, .cancelled].contains(task.status) {
                HStack {
                    Text(store.text(task.status == .failed ? (task.errorCode ?? "providerError") : task.status.rawValue)).foregroundStyle(.secondary)
                    Button(store.text("retry")) { store.retry(task.id) }.disabled(!store.canRetry(task))
                }.font(.callout)
            }
            VStack(spacing: metric("small")) {
                ComposerEditor(text: Binding(get: { store.session(sessionID)?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("prompt"), font: readingNSFont(store), focusEpoch: focusEpoch, growsWithContent: true) { store.submit(sessionID) }
                    .fixedSize(horizontal: false, vertical: true)
                NativeFlow(spacing: metric("small")) { composerTools }.controlSize(.regular)
                HStack {
                    ModelPicker(store: store)
                    Spacer()
                    if let task = store.running(session.id) {
                        ProgressView().controlSize(.small).accessibilityLabel(store.text("running"))
                        Button(store.text("stop"), role: .destructive) { store.cancel(task.id) }.buttonStyle(.bordered)
                    } else {
                        Button(store.text("send"), systemImage: "arrow.up") { store.submit(session.id) }
                            .buttonStyle(.borderedProminent).disabled(session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (session.images ?? []).isEmpty)
                            .help(store.text("send") + " (⌘↩)")
                    }
                }
            }
            .padding(metric("inset"))
            .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: metric("radius")))
            .overlay(RoundedRectangle(cornerRadius: metric("radius")).stroke(Color(nsColor: .separatorColor)))
            .frame(maxWidth: metric("reading")).padding(.horizontal, metric("gutter")).padding(.bottom, metric("gutter"))
        }
    }
    @ViewBuilder private var composerTools: some View {
        ImageControls(store: store)
        AudioControls(store: store)
        Menu {
            Picker(store.text("chatMode"), selection: Binding(get: { session.chatMode ?? "text" }, set: { store.setChatMode(session.id, $0) })) {
                ForEach(["text", "web", "research", "image"], id: \.self) { Text(store.text("chatMode_" + $0)).tag($0) }
            }
            Toggle(store.text("carefulReasoning"), isOn: Binding(get: { session.carefulReasoning ?? false }, set: { store.setCarefulReasoning(session.id, $0) }))
        } label: { Label(store.text("chatMode_" + (session.chatMode ?? "text")), systemImage: "slider.horizontal.3") }
            .menuStyle(.borderlessButton).fixedSize()
    }
    private func saveImage(_ image: ImageAttachment) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = "image." + (image.mime == "image/jpeg" ? "jpg" : image.mime == "image/webp" ? "webp" : "png")
        panel.begin { response in guard response == .OK, let url = panel.url else { return }; Task { do { try await Task.detached { try Attachments.data(image).write(to: url, options: .atomic) }.value } catch { let alert = NSAlert(); alert.messageText = store.text("exportError"); alert.runModal() } } }
    }

}

struct TranslationWorkspace: View {
    @Bindable var store: WorkbenchStore
    @State private var optionsOpen = false
    var focusEpoch = 0
    private var session: Session { store.session }
    var body: some View {
        VStack(spacing: metric("inset")) {
            NativeFlow(spacing: metric("small")) { languageControls; ModelPicker(store: store) }
            NativeFlow(spacing: metric("small")) { languageTools }.controlSize(.small)
            if session.feature == .dictionary {
                HStack(alignment: .top) {
                    ComposerEditor(text: Binding(get: { session.draft }, set: { store.setDraft(session.id, $0) }), identity: session.id, label: store.text("source"), font: readingNSFont(store), focusEpoch: focusEpoch, accessibilityID: "dictionary-term") { store.submit(session.id) }
                        .frame(height: metric("control") * 2)
                    if let task = store.running(session.id) {
                        Button(store.text("stop"), role: .destructive) { store.cancel(task.id) }
                    } else {
                        Button(store.text("lookup")) { store.submit(session.id) }.buttonStyle(.borderedProminent)
                            .disabled(session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.draft.count > 120)
                    }
                }
                TextField(store.text("dictionaryContext"), text: Binding(get: { session.dictionaryContext ?? "" }, set: { store.setDictionaryContext(session.id, $0) }))
                    .textFieldStyle(.roundedBorder)
                if session.draft.count > 120 { Text(store.text("dictionaryTermLimit")).foregroundStyle(.secondary) }
            }
            GeometryReader { geometry in
                let columns = geometry.size.width >= metric("sidebar") * 2
                let layout = columns ? AnyLayout(HStackLayout(spacing: 0)) : AnyLayout(VStackLayout(spacing: 0))
                layout {
                    if session.feature != .dictionary { sourcePane; Divider() }
                    resultPane
                }
                .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: metric("radius")))
                .overlay(RoundedRectangle(cornerRadius: metric("radius")).stroke(Color(nsColor: .separatorColor)))
                .clipShape(RoundedRectangle(cornerRadius: metric("radius")))
            }
        }.padding(metric("gutter"))
            .onChange(of: session.id) { _, _ in optionsOpen = false }
    }
    @ViewBuilder private var languageTools: some View {
        ImageControls(store: store)
        AudioControls(store: store)
        if session.feature == .translate {
            Button { optionsOpen.toggle() } label: { Label(store.text("translationOptions"), systemImage: "slider.horizontal.3") }
                .popover(isPresented: $optionsOpen) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: metric("inset")) {
                            HStack {
                                Text(store.text("translationOptions")).font(.headline)
                                Spacer()
                                Button { optionsOpen = false } label: { Image(systemName: "xmark") }
                                    .buttonStyle(.borderless).accessibilityLabel(store.text("close"))
                            }
                            translationOptions
                            if (session.images ?? []).isEmpty { Divider(); ComparisonPane(store: store, sessionID: session.id) }
                        }.padding(metric("inset"))
                    }.frame(width: metric("sidebar") + metric("editor"), height: metric("editor") * 3)
                }
        }
    }
    private var languageControls: some View {
        HStack(spacing: metric("small")) {
            languagePicker(source: true)
            Button { store.setPair(session.id, source: session.target, target: session.source == "auto" ? "en" : session.source) } label: { Image(systemName: "arrow.left.arrow.right") }
                .help(store.text("swap")).accessibilityLabel(store.text("swap"))
            languagePicker(source: false)
        }
    }
    private func languagePicker(source: Bool) -> some View {
        Picker(store.text(source ? "inputLanguage" : "outputLanguage"), selection: Binding(get: { source ? session.source : session.target }, set: { value in
            store.setPair(session.id, source: source ? value : session.source, target: source ? session.target : value)
        })) {
            ForEach((source ? ["auto"] : []) + nativeResources.nativeLanguages, id: \.self) { code in Text(store.text("lang_" + code)).tag(code) }
        }.pickerStyle(.menu).fixedSize(horizontal: true, vertical: false)
    }
    @ViewBuilder private var translationOptions: some View {
        Toggle(store.text("autoTranslate"), isOn: Binding(get: { store.workspace.autoTranslate ?? false }, set: { store.setAutoTranslate($0) })).help(store.text("autoTranslateHint"))
        if store.workspace.autoTranslate == true {
            Stepper(value: Binding(get: { store.workspace.autoTranslateDelay ?? 800 }, set: { store.setAutoTranslate(true, delay: $0) }), in: 100...5000, step: 100) {
                Text(store.text("autoTranslateDelay") + ": " + String(store.workspace.autoTranslateDelay ?? 800))
            }
        }
        Picker(store.text("reasoning"), selection: Binding(get: { session.reasoningEffort ?? "auto" }, set: { store.setReasoning(session.id, effort: $0) })) {
            ForEach(["auto", "low", "medium", "high"], id: \.self) { Text(store.text("reasoning_" + $0)).tag($0) }
        }
        Picker(store.text("translationStyle"), selection: Binding(get: { session.translationStyle ?? "general" }, set: { store.setTranslationOptions(session.id, style: $0, mode: session.translationMode ?? "translate") })) {
            ForEach(["general", "formal", "casual", "business", "technical", "natural"], id: \.self) { Text(store.text("style_" + $0)).tag($0) }
        }
        Picker(store.text("translationMode"), selection: Binding(get: { session.translationMode ?? "translate" }, set: { store.setTranslationOptions(session.id, style: session.translationStyle ?? "general", mode: $0) })) {
            ForEach(["translate", "annotate", "phonetic", "rewrite"], id: \.self) { Text(store.text($0)).tag($0) }
        }
    }
    private var sourcePane: some View {
        let sessionID = session.id
        return VStack(alignment: .leading, spacing: 0) {
            Text(store.text("source")).font(.headline).frame(height: metric("control"), alignment: .leading).padding(.horizontal, metric("inset"))
            Divider()
            ComposerEditor(text: Binding(get: { store.session(sessionID)?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("source"), font: readingNSFont(store), focusEpoch: focusEpoch, accessibilityID: "translation-source") { store.submit(sessionID) }
                .padding(metric("small"))
            Divider()
            HStack {
                Text(store.text("draft")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                if let task = store.running(session.id) {
                    Button(store.text("stop"), role: .destructive) { store.cancel(task.id) }
                } else {
                    Button(store.text(session.feature == .dictionary ? "lookup" : "translate")) { store.submit(session.id) }.buttonStyle(.borderedProminent)
                        .disabled(session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (session.images ?? []).isEmpty)
                }
            }.frame(height: metric("control")).padding(metric("small"))
        }
    }
    private var resultPane: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(store.text("result")).font(.headline)
                Spacer()
                if session.feature == .dictionary {
                    Button { store.toggleFavorite(session.id) } label: { Image(systemName: session.favorite == true ? "star.fill" : "star") }
                        .accessibilityLabel(store.text("favorite")).help(store.text("favorite"))
                }
            }.frame(height: metric("control")).padding(.horizontal, metric("inset"))
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    if session.feature == .translate, let image = session.images?.first {
                        ImageTranslationView(store: store, image: image, output: session.output, complete: store.workspace.tasks.first(where: { $0.request.sessionID == session.id && $0.request.revision == session.revision })?.status == .succeeded, resultImage: session.messages.last(where: { $0.role == "assistant" })?.images?.first)
                    } else if session.output.isEmpty { Text(store.text(store.running(session.id) == nil ? "emptyResult" : "running")).foregroundStyle(.secondary) }
                    else if session.feature == .dictionary, let entry = DictionaryEntry.parse(session.output) {
                        DictionaryResultView(entry: entry, store: store)
                    } else if session.feature == .dictionary {
                        ForEach(Array(DictionaryEntry.preview(session.output).enumerated()), id: \.offset) { _, value in Text(value).textSelection(.enabled) }
                    } else if session.feature != .dictionary {
                        Text(session.output).font(readingFont(store)).textSelection(.enabled)
                    }
                    if let task = store.workspace.tasks.first(where: { $0.request.sessionID == session.id }), [.failed, .interrupted, .cancelled].contains(task.status) {
                        Text(store.text(task.status == .failed ? (task.errorCode ?? "providerError") : task.status.rawValue)).foregroundStyle(.secondary)
                        Button(store.text("retry")) { store.retry(task.id) }.disabled(!store.canRetry(task))
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(metric("inset"))
            }.frame(maxHeight: .infinity)
            Divider()
            HStack {
                if store.running(session.id) != nil { ProgressView().controlSize(.small); Text(store.text("running")).font(.caption) }
                Spacer()
                Button(store.text("copy"), systemImage: "doc.on.doc") {
                    NSPasteboard.general.clearContents(); NSPasteboard.general.setString((session.images ?? []).isEmpty ? session.output : ImageTranslation.text(session.output), forType: .string)
                }.disabled(session.output.isEmpty)
            }.frame(height: metric("control")).padding(metric("small"))
        }.background(Color(nsColor: .controlBackgroundColor))
    }
}

// AppKit text input retains native selection, undo and marked-text composition.
struct ComposerEditor: NSViewRepresentable {
    @Binding var text: String
    var identity: String
    var label: String
    var font: NSFont
    var focusEpoch = 0
    var accessibilityID = "chat-draft"
    var growsWithContent = false
    var submit: () -> Void
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
        guard growsWithContent else { return nil }
        let width = proposal.width ?? metric("reading")
        let inset = (nsView.documentView as? NSTextView)?.textContainerInset ?? .zero
        let padding = (nsView.documentView as? NSTextView)?.textContainer?.lineFragmentPadding ?? 0
        let available = max(metric("control"), width - inset.width * 2 - padding * 2)
        let measured = ((text.isEmpty ? " " : text) as NSString).boundingRect(with: NSSize(width: available, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font]).height
        return CGSize(width: width, height: min(metric("editor"), max(metric("composerMinimum") - metric("control"), ceil(measured) + inset.height * 2 + metric("small"))))
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        let editor = CommandTextView()
        editor.isRichText = false; editor.isAutomaticQuoteSubstitutionEnabled = false
        editor.allowsUndo = true
        editor.isVerticallyResizable = true; editor.isHorizontallyResizable = false
        editor.autoresizingMask = [.width]; editor.textContainer?.widthTracksTextView = true
        editor.font = font; editor.textColor = .textColor
        editor.backgroundColor = .textBackgroundColor; editor.focusRingType = .none
        editor.delegate = context.coordinator; editor.submit = submit
        editor.setAccessibilityLabel(label); editor.setAccessibilityIdentifier(accessibilityID)
        scroll.documentView = editor; scroll.hasVerticalScroller = true; scroll.drawsBackground = false
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let editor = scroll.documentView as? CommandTextView else { return }
        // Finish marked text under the previous session binding before rebinding the editor.
        if context.coordinator.parent.identity != identity {
            editor.unmarkText(); editor.string = text
            editor.breakUndoCoalescing()
            editor.undoManager?.removeAllActions()
        }
        context.coordinator.parent = self
        if !editor.hasMarkedText(), editor.font != font { editor.font = font }
        editor.submit = submit; editor.setAccessibilityLabel(label)
        if context.coordinator.focusEpoch != focusEpoch {
            context.coordinator.focusEpoch = focusEpoch
            DispatchQueue.main.async { [weak editor] in
                if let editor { editor.window?.makeFirstResponder(editor) }
            }
        }
        if !editor.hasMarkedText(), editor.string != text { editor.string = text }
    }
    class Coordinator: NSObject, NSTextViewDelegate {
        var focusEpoch = 0
        var parent: ComposerEditor
        init(_ parent: ComposerEditor) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let editor = notification.object as? NSTextView else { return }
            parent.text = editor.string
        }
    }
    class CommandTextView: NSTextView {
        private let sessionUndoManager = UndoManager()
        override var undoManager: UndoManager? { sessionUndoManager }
        @objc func undo(_ sender: Any?) { sessionUndoManager.undo() }
        @objc func redo(_ sender: Any?) { sessionUndoManager.redo() }
        override func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
            if menuItem.action == #selector(undo(_:)) { return sessionUndoManager.canUndo }
            if menuItem.action == #selector(redo(_:)) { return sessionUndoManager.canRedo }
            return super.validateMenuItem(menuItem)
        }
        override func validateUserInterfaceItem(_ item: NSValidatedUserInterfaceItem) -> Bool {
            if item.action == #selector(undo(_:)) { return sessionUndoManager.canUndo }
            if item.action == #selector(redo(_:)) { return sessionUndoManager.canRedo }
            return super.validateUserInterfaceItem(item)
        }
        var submit: (() -> Void)?
        override func keyDown(with event: NSEvent) {
            if [36, 76].contains(event.keyCode), event.modifierFlags.contains(.command), !hasMarkedText() { submit?() }
            else { super.keyDown(with: event) }
        }
    }
}

struct AudioControls: View {
    @Bindable var store: WorkbenchStore
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            ViewThatFits(in: .horizontal) {
                HStack { actions }
                VStack(alignment: .leading, spacing: metric("small")) { actions }
            }
            if let error = store.audio.error { Text(store.text(error)).font(.caption).foregroundStyle(.secondary) }
            if store.pendingTranscript != nil { Button(store.text("insertTranscript")) { store.usePendingTranscript() } }
        }
    }
    @ViewBuilder private var actions: some View {
                if store.audio.recordingOwner != nil {
                    Button(store.text("stopRecording"), systemImage: "stop.circle", role: .destructive) { store.stopRecording() }
                } else {
                    Button(store.text("record"), systemImage: "mic") { Task { await store.startRecording() } }
                        .disabled(store.audio.transcribingOwner != nil || store.audio.permissionPending)
                }
                if store.audio.transcribingOwner != nil {
                    ProgressView().controlSize(.small)
                    Button(store.text("stop"), role: .destructive) { store.audio.cancel() }
                }
                Menu {
                    Picker(store.text("speechProvider"), selection: Binding(get: { store.workspace.speechProvider ?? "openai" }, set: { store.speechProvider = $0 })) {
                        ForEach(["auto", "openai", "gemini", "groq"], id: \.self) { Text($0 == "auto" ? store.text("reasoning_auto") : $0).tag($0) }
                    }
                    if store.workspace.speechProvider == "auto" { Text(store.text("speechAutoHint")) }
                    Button(store.text("listen"), systemImage: "speaker.wave.2") {
                        let text = store.session.feature == .chat ? store.session.messages.last(where: { $0.role == "assistant" })?.text ?? "" : store.session.feature == .dictionary ? DictionaryEntry.parse(store.session.output).map { $0.headword + ". " + $0.meaning } ?? "" : (store.session.images ?? []).isEmpty ? store.session.output : ImageTranslation.text(store.session.output)
                        store.audio.speak(text, language: store.session.target)
                    }
                    Button(store.text("stopSpeaking"), systemImage: "speaker.slash") { store.audio.stopSpeaking() }
                } label: { Image(systemName: "speaker.wave.2") }
                    .menuStyle(.borderlessButton).fixedSize().accessibilityLabel(store.text("speechProvider"))

    }

}
