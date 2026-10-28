import SwiftUI
import ViezanDomain

struct ChatWorkspace: View {
    @Bindable var store: WorkbenchStore
    @Environment(\.colorScheme) private var scheme
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
                                if message.role == "assistant" { Label("Viezan", systemImage: "sparkles").font(.vzn("smallScale")).foregroundStyle(.secondary) }
                                TranscriptText(text: message.text.isEmpty && (message.images ?? []).isEmpty ? store.text(store.workspace.tasks.first(where: { $0.id == message.id })?.status.rawValue ?? "noContent") : message.text,
                                               font: readingNSFont(store), label: store.text(message.role == "assistant" ? "response" : "you"), markdown: message.role == "assistant" && store.workspace.tasks.first(where: { $0.id == message.id })?.status != .running, resetSelection: selectionReset) { selected in
                                    if selected { selectedMessage = message.id; followBottom = false }
                                    else if selectedMessage == message.id { selectedMessage = nil }
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                    // Review 18 user message: muted surface, inset from the reading column.
                                    .padding(.vertical, message.role == "user" ? metric("gap") : 0).padding(.horizontal, message.role == "user" ? metric("inset") : 0)
                                    .background(message.role == "user" ? contentColor("surface-muted", scheme) : Color.clear, in: RoundedRectangle(cornerRadius: metric("radius")))
                                    .padding(.leading, message.role == "user" ? metric("large") : 0)
                                if message.role == "assistant", !message.text.isEmpty {
                                    if store.workspace.tasks.first(where: { $0.id == message.id })?.status != .running { ForEach(ChartArtifact.parse(message.text)) { NativeChart(artifact: $0) } }
                                    HStack(spacing: metric("tight")) {
                                        CopyResponseButton(text: message.text, label: store.text("copy"), copiedLabel: store.text("copied"))
                                        if message.id == session.messages.last?.id, let task = store.workspace.tasks.first(where: { $0.id == message.id }), task.status != .running {
                                            Button(store.text("retry"), systemImage: "arrow.clockwise") { store.retry(task.id) }
                                                .buttonStyle(.vznQuiet).disabled(!store.canRetry(task))
                                        }
                                    }
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
                .overlay {
                    if session.messages.isEmpty {
                        // Centered on the same axis as the composer, not the leading reading edge.
                        ContentUnavailableView(store.text("emptyChat"), systemImage: "bubble.left.and.bubble.right", description: Text(store.text("emptyHint")))
                            .frame(maxWidth: metric("reading"))
                    }
                }
                .overlay(alignment: .bottom) {
                    if !followBottom && !session.messages.isEmpty {
                        Button(store.text("returnLatest"), systemImage: "arrow.down") {
                            selectionReset += 1; selectedMessage = nil; followBottom = true
                            if let last = session.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                        }.buttonStyle(.vznOutline).padding(metric("small"))
                    }
                }
            }
            if let task = store.workspace.tasks.first(where: { $0.request.sessionID == session.id }), [.failed, .interrupted, .cancelled].contains(task.status) {
                HStack {
                    Text(store.text(task.status == .failed ? (task.errorCode ?? "providerError") : task.status.rawValue)).foregroundStyle(.secondary)
                    Button(store.text("retry")) { store.retry(task.id) }.disabled(!store.canRetry(task))
                }.font(.callout)
            }
            // Same column as the composer it warns about.
            ProviderNotice(store: store, model: session.model)
                .frame(maxWidth: metric("reading")).padding(.horizontal, metric("gutter"))
            // Review 18: one opaque composer; the editor leads, one control row follows.
            VStack(alignment: .leading, spacing: metric("small")) {
                AttachmentChips(store: store)
                ComposerEditor(text: Binding(get: { store.session(sessionID)?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("prompt"), font: readingNSFont(store), focusEpoch: focusEpoch, growsWithContent: true) { store.submit(sessionID) }
                    .fixedSize(horizontal: false, vertical: true)
                    .modifier(EditorPlaceholder(text: store.text("prompt"), visible: session.draft.isEmpty))
                HStack(spacing: metric("small")) {
                    ImageControls(store: store, compact: true, extraMenu: AnyView(composerModes))
                    ModelPicker(store: store, compact: true)
                    AudioControls(store: store, compact: true)
                    if (session.chatMode ?? "text") != "text" || session.carefulReasoning == true { modeChip }
                    Spacer(minLength: metric("small"))
                    if let task = store.running(session.id) {
                        ProgressView().controlSize(.small).accessibilityLabel(store.text("running"))
                        Button(store.text("stop"), systemImage: "stop.fill", role: .destructive) { store.cancel(task.id) }.buttonStyle(.vznOutline)
                    } else {
                        Button(store.text("send"), systemImage: "arrow.up") { store.submit(session.id) }
                            .buttonStyle(.vznPrimary).disabled(session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (session.images ?? []).isEmpty)
                            .help(store.text("send") + " (⌘↩)")
                    }
                }.controlSize(.large).imageScale(.large)
                AudioStatus(store: store)
            }
            .padding(.horizontal, metric("inset") - metric("hairline") * 2).padding(.vertical, metric("gap"))
            .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("largeRadius")))
            .overlay(RoundedRectangle(cornerRadius: metric("largeRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
            .shadow(color: Color(nsColor: .shadowColor).opacity(metric("overlayShadowOpacity")), radius: metric("tight") / 2, y: metric("hairline"))
            .frame(maxWidth: metric("reading")).padding(.horizontal, metric("gutter")).padding(.bottom, metric("gutter"))
        }
    }
    // Chat mode, careful reasoning and speech ride in the "+" menu (Review 18
    // shows one attach control); a chip keeps a non-default mode visible.
    @ViewBuilder private var composerModes: some View {
        Picker(store.text("chatMode"), selection: Binding(get: { session.chatMode ?? "text" }, set: { store.setChatMode(session.id, $0) })) {
            ForEach(["text", "web", "research", "image"], id: \.self) { Text(store.text("chatMode_" + $0)).tag($0) }
        }
        Toggle(store.text("carefulReasoning"), isOn: Binding(get: { session.carefulReasoning ?? false }, set: { store.setCarefulReasoning(session.id, $0) }))
        Divider()
        AudioControls.speechMenu(store)
    }
    private var modeChip: some View {
        Button { store.setChatMode(session.id, "text"); store.setCarefulReasoning(session.id, false) } label: {
            HStack(spacing: metric("tight")) {
                Text([(session.chatMode ?? "text") != "text" ? store.text("chatMode_" + (session.chatMode ?? "text")) : nil, session.carefulReasoning == true ? store.text("carefulReasoning") : nil].compactMap { $0 }.joined(separator: " · "))
                Image(systemName: "xmark").imageScale(.small)
            }.font(.vzn("smallScale"))
        }.buttonStyle(.vznQuiet).foregroundStyle(contentColor("action-text", scheme))
            .help(store.text("chatMode")).accessibilityLabel(store.text("chatMode") + ": " + store.text("chatMode_" + (session.chatMode ?? "text")))
    }
    private func saveImage(_ image: ImageAttachment) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = "image." + (image.mime == "image/jpeg" ? "jpg" : image.mime == "image/webp" ? "webp" : "png")
        panel.begin { response in guard response == .OK, let url = panel.url else { return }; Task { do { try await Task.detached { try Attachments.data(image).write(to: url, options: .atomic) }.value } catch { let alert = NSAlert(); alert.messageText = store.text("exportError"); alert.runModal() } } }
    }

}

struct TranslationWorkspace: View {
    @Bindable var store: WorkbenchStore
    @State private var optionsOpen = false
    @State private var compareOpen = false
    var focusEpoch = 0
    @Environment(\.colorScheme) private var scheme
    private var session: Session { store.session }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            // Review 18 language row: input ⇄ output, session model at the trailing edge.
            HStack(spacing: metric("inset")) {
                NativeFlow(spacing: metric("tight")) { languageControls }
                Spacer(minLength: metric("small"))
                ModelPicker(store: store, compact: true, badge: true)
            }
            Divider().padding(.bottom, metric("tight"))
            ProviderNotice(store: store, model: session.model)
            if session.feature == .dictionary { dictionaryBody } else { panels }
        }.padding(.horizontal, metric("large") + metric("gap")).padding(.top, metric("gap")).padding(.bottom, metric("gap"))
            .onChange(of: session.id) { _, _ in optionsOpen = false; compareOpen = false }
    }
    private var panels: some View {
        GeometryReader { geometry in
            // Review 18 stacks the editors in its narrow (820 px) preview; two columns
            // below the reading width squeeze the footer actions until they truncate.
            let columns = geometry.size.width >= metric("reading")
            let layout = columns ? AnyLayout(HStackLayout(spacing: 0)) : AnyLayout(VStackLayout(spacing: 0))
            layout {
                sourcePane
                if columns { Divider() } else { Divider() }
                resultPane
            }
            .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("largeRadius")))
            .overlay(RoundedRectangle(cornerRadius: metric("largeRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
            .clipShape(RoundedRectangle(cornerRadius: metric("largeRadius")))
        }
    }
    private var dictionaryBody: some View {
        let sessionID = session.id
        let invalid = session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.draft.count > 120
        return VStack(alignment: .leading, spacing: metric("inset")) {
            HStack(spacing: metric("small")) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
                ComposerEditor(text: Binding(get: { store.session(sessionID)?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("source"), font: .systemFont(ofSize: NSFont.systemFontSize * metric("sectionScale")), focusEpoch: focusEpoch, accessibilityID: "dictionary-term", submitOnReturn: true) { if !invalid { store.submit(sessionID) } }
                    .modifier(EditorPlaceholder(text: store.text("dictionaryPlaceholder"), visible: session.draft.isEmpty, font: .vzn("sectionScale")))
                    .frame(height: metric("control"))
                if let task = store.running(session.id) {
                    ProgressView().controlSize(.small).accessibilityLabel(store.text("running"))
                    Button(store.text("stop"), role: .destructive) { store.cancel(task.id) }.buttonStyle(.vznOutline)
                } else {
                    Button(store.text("lookup")) { store.submit(session.id) }.buttonStyle(.vznPrimary).disabled(invalid).font(.vzn("labelScale"))
                }
            }.padding(.horizontal, metric("gap")).padding(.vertical, metric("small"))
                .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("largeRadius")))
                .overlay(RoundedRectangle(cornerRadius: metric("largeRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
            TextField(store.text("dictionaryContext"), text: Binding(get: { session.dictionaryContext ?? "" }, set: { store.setDictionaryContext(session.id, $0) }))
                .textFieldStyle(.plain).font(.callout).padding(.horizontal, metric("gap"))
            if session.draft.count > 120 { Text(store.text("dictionaryTermLimit")).font(.callout).foregroundStyle(Color(nsColor: .systemRed)) }
            ScrollView {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    if session.output.isEmpty {
                        // Centered like the Chat/Interpretation empty states, not a stray left-aligned line.
                        VStack(spacing: metric("small")) {
                            Image(systemName: "book.closed").font(.title2).accessibilityHidden(true)
                            Text(store.text(store.running(session.id) == nil ? "dictionaryEmpty" : "running")).multilineTextAlignment(.center)
                        }.foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, metric("large"))
                    } else if let entry = DictionaryEntry.parse(session.output) {
                        DictionaryResultView(entry: entry, store: store)
                    } else {
                        ForEach(Array(DictionaryEntry.preview(session.output).enumerated()), id: \.offset) { _, value in Text(value).textSelection(.enabled) }
                    }
                    failure
                }.frame(maxWidth: metric("reading"), alignment: .leading)
                    .frame(maxWidth: .infinity).padding(.vertical, metric("inset"))
            }.frame(maxHeight: .infinity)
        }
    }
    @ViewBuilder private var failure: some View {
        if let task = store.workspace.tasks.first(where: { $0.request.sessionID == session.id }), [.failed, .interrupted, .cancelled].contains(task.status) {
            HStack(spacing: metric("small")) {
                Image(systemName: "exclamationmark.triangle").foregroundStyle(Color(nsColor: task.status == .failed ? .systemRed : .secondaryLabelColor)).accessibilityHidden(true)
                Text(store.text(task.status == .failed ? (task.errorCode ?? "providerError") : task.status.rawValue)).foregroundStyle(.secondary)
                Button(store.text("retry")) { store.retry(task.id) }.disabled(!store.canRetry(task))
            }
        }
    }
    private var languageControls: some View {
        Group {
            LanguageMenu(store: store, label: store.text("inputLanguage"), codes: ["auto"] + nativeResources.nativeLanguages, selection: session.source) { value in
                store.setPair(session.id, source: value, target: session.target)
            }
            Button { store.setPair(session.id, source: session.target, target: session.source == "auto" ? "en" : session.source) } label: { Image(systemName: "arrow.left.arrow.right").foregroundStyle(contentColor("text-muted", scheme)) }
                .buttonStyle(.vznQuiet).controlSize(.large).help(store.text("swap")).accessibilityLabel(store.text("swap"))
            LanguageMenu(store: store, label: store.text("outputLanguage"), codes: nativeResources.nativeLanguages, selection: session.target) { value in
                store.setPair(session.id, source: session.source, target: value)
            }
        }
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
    private func paneHeader<Trailing: View>(_ title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: metric("small")) {
            Text(title).font(.system(size: NSFont.systemFontSize, weight: .bold)).accessibilityAddTraits(.isHeader)
            Spacer(minLength: metric("small"))
            trailing()
        }.frame(height: metric("control")).padding(.horizontal, metric("inset")).padding(.vertical, metric("tight"))
    }
    private var sourcePane: some View {
        let sessionID = session.id
        return VStack(alignment: .leading, spacing: 0) {
            paneHeader(store.text("source")) {
                Text(store.text("lang_" + session.source)).font(.callout).foregroundStyle(.secondary).lineLimit(1)
            }
            AttachmentChips(store: store).padding(.horizontal, metric("inset"))
            ComposerEditor(text: Binding(get: { store.session(sessionID)?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("source"), font: readingNSFont(store), focusEpoch: focusEpoch, accessibilityID: "translation-source") { store.submit(sessionID) }
                .modifier(EditorPlaceholder(text: store.text("sourcePlaceholder"), visible: session.draft.isEmpty))
                // Same top inset as the result column so both texts start on one line.
                .padding(.horizontal, metric("small")).padding(.top, metric("small"))
            Divider()
            HStack(spacing: metric("small")) {
                ImageControls(store: store, compact: true, acceptsHeaderRequest: true, statusOnly: true)
                AudioControls(store: store, compact: true)
                Text(store.text("draft")).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: metric("small"))
                if let task = store.running(session.id) {
                    Button(store.text("stop"), systemImage: "stop.fill", role: .destructive) { store.cancel(task.id) }.buttonStyle(.vznOutline)
                } else {
                    Button(store.text("translateText"), systemImage: Feature.translate.symbol) { store.submit(session.id) }.buttonStyle(.vznPrimary).fixedSize()
                        .disabled(session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (session.images ?? []).isEmpty)
                        .help(store.text("translate") + " (⌘↩)")
                }
            }.controlSize(.large).frame(height: metric("control")).padding(metric("small"))
            AudioStatus(store: store).padding(.horizontal, metric("small"))
        }
    }
    private var resultPane: some View {
        VStack(alignment: .leading, spacing: 0) {
            paneHeader(store.text("result")) {
                Button { optionsOpen.toggle() } label: {
                    Label(store.text("style_" + (session.translationStyle ?? "general")), systemImage: "chevron.down").labelStyle(ModelMenuLabelStyle())
                }.buttonStyle(.vznQuiet).tint(.primary).foregroundStyle(.primary).help(store.text("translationOptions")).accessibilityLabel(store.text("translationOptions"))
                    .popover(isPresented: $optionsOpen) {
                        ScrollView {
                            VStack(alignment: .leading, spacing: metric("inset")) {
                                Text(store.text("translationOptions")).font(.headline)
                                translationOptions
                            }.padding(metric("inset"))
                        }.frame(width: metric("sidebar") + metric("editor"))
                    }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    if let image = session.images?.first {
                        ImageTranslationView(store: store, image: image, output: session.output, complete: store.workspace.tasks.first(where: { $0.request.sessionID == session.id && $0.request.revision == session.revision })?.status == .succeeded, resultImage: session.messages.last(where: { $0.role == "assistant" })?.images?.first)
                    } else if session.output.isEmpty { Text(store.text(store.running(session.id) == nil ? "emptyResult" : "running")).foregroundStyle(.secondary) }
                    else { Text(session.output).font(readingFont(store)).textSelection(.enabled) }
                    failure
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            }.frame(maxHeight: .infinity)
            Divider()
            HStack(spacing: metric("small")) {
                if store.running(session.id) != nil { ProgressView().controlSize(.small); Text(store.text("running")).font(.vzn("smallScale")) }
                else { Text(store.text("lang_" + session.target)).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1) }
                Spacer(minLength: metric("small"))
                if (session.images ?? []).isEmpty {
                    Button(store.text("compare")) { compareOpen.toggle() }.buttonStyle(.vznOutline).fixedSize()
                        .popover(isPresented: $compareOpen) {
                            ScrollView { ComparisonPane(store: store, sessionID: session.id).padding(metric("inset")) }
                                .frame(width: metric("sidebar") + metric("editor"), height: metric("editor") * 3)
                        }
                }
                Menu { AudioControls.speechMenu(store) } label: { Image(systemName: "speaker.wave.2") }
                    .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().tint(.primary)
                    .disabled(session.output.isEmpty).help(store.text("listen")).accessibilityLabel(store.text("listen"))
                Button { NSPasteboard.general.clearContents(); NSPasteboard.general.setString((session.images ?? []).isEmpty ? session.output : ImageTranslation.text(session.output), forType: .string) } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.vznOutline).disabled(session.output.isEmpty).help(store.text("copy")).accessibilityLabel(store.text("copy"))
            }.controlSize(.large).frame(height: metric("control")).padding(metric("small"))
        }
    }
}

// NSTextView has no placeholder; draw one beneath the caret while empty.
struct EditorPlaceholder: ViewModifier {
    var text: String
    var visible: Bool
    var font: Font = .body
    func body(content: Content) -> some View {
        content.overlay(alignment: .topLeading) {
            if visible {
                Text(text).font(font).foregroundStyle(.tertiary).padding(.leading, metric("small")).padding(.top, metric("tight") / 2)
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
        }
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
    var submitOnReturn = false
    var submit: () -> Void
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
        guard growsWithContent else { return nil }
        let width = proposal.width ?? metric("reading")
        let inset = (nsView.documentView as? NSTextView)?.textContainerInset ?? .zero
        let padding = (nsView.documentView as? NSTextView)?.textContainer?.lineFragmentPadding ?? 0
        let available = max(metric("control"), width - inset.width * 2 - padding * 2)
        let measured = ((text.isEmpty ? " " : text) as NSString).boundingRect(with: NSSize(width: available, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font]).height
        return CGSize(width: width, height: min(metric("editor"), max(metric("control") + metric("tight"), ceil(measured) + inset.height * 2 + metric("small"))))
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
        editor.drawsBackground = false; editor.focusRingType = .none
        editor.delegate = context.coordinator; editor.submit = submit; editor.submitOnReturn = submitOnReturn
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
        var submitOnReturn = false
        override func keyDown(with event: NSEvent) {
            let plainReturn = submitOnReturn && !event.modifierFlags.contains(.shift)
            if [36, 76].contains(event.keyCode), event.modifierFlags.contains(.command) || plainReturn, !hasMarkedText() { submit?() }
            else { super.keyDown(with: event) }
        }
    }
}

struct AudioControls: View {
    @Bindable var store: WorkbenchStore
    // Compact: icon record/stop only; speech output lives in the options menu.
    var compact = false
    var body: some View {
        if compact {
            HStack(spacing: metric("tight")) {
                if store.audio.recordingOwner != nil {
                    Button { store.stopRecording() } label: { Image(systemName: "stop.circle.fill").foregroundStyle(Color(nsColor: .systemRed)) }
                        .help(store.text("stopRecording")).accessibilityLabel(store.text("stopRecording"))
                } else {
                    Button { Task { await store.startRecording() } } label: { Image(systemName: "mic") }
                        .disabled(store.audio.transcribingOwner != nil || store.audio.permissionPending)
                        .help(store.text("record")).accessibilityLabel(store.text("record"))
                }
                if store.audio.transcribingOwner != nil {
                    ProgressView().controlSize(.small).accessibilityLabel(store.text("running"))
                    Button { store.audio.cancel() } label: { Image(systemName: "xmark.circle") }.help(store.text("stop")).accessibilityLabel(store.text("stop"))
                }
            }.buttonStyle(.vznQuiet)
        } else { full }
    }
    private var full: some View {
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
                    .menuStyle(.borderlessButton).fixedSize().accessibilityLabel(store.text("speechProvider")).tint(.primary)

    }
    // Speech output and STT provider, embedded in another menu.
    @ViewBuilder static func speechMenu(_ store: WorkbenchStore) -> some View {
        Picker(store.text("speechProvider"), selection: Binding(get: { store.workspace.speechProvider ?? "openai" }, set: { store.speechProvider = $0 })) {
            ForEach(["auto", "openai", "gemini", "groq"], id: \.self) { Text($0 == "auto" ? store.text("reasoning_auto") : $0).tag($0) }
        }
        Button(store.text("listen"), systemImage: "speaker.wave.2") {
            let text = store.session.feature == .chat ? store.session.messages.last(where: { $0.role == "assistant" })?.text ?? "" : store.session.feature == .dictionary ? DictionaryEntry.parse(store.session.output).map { $0.headword + ". " + $0.meaning } ?? "" : (store.session.images ?? []).isEmpty ? store.session.output : ImageTranslation.text(store.session.output)
            store.audio.speak(text, language: store.session.target)
        }
        Button(store.text("stopSpeaking"), systemImage: "speaker.slash") { store.audio.stopSpeaking() }
    }
}

// Audio errors and a transcript that arrived after the draft changed.
struct AudioStatus: View {
    @Bindable var store: WorkbenchStore
    var body: some View {
        if store.audio.error != nil || store.pendingTranscript != nil {
            HStack(spacing: metric("small")) {
                if let error = store.audio.error { Text(store.text(error)).font(.caption).foregroundStyle(.secondary) }
                if store.pendingTranscript != nil { Button(store.text("insertTranscript")) { store.usePendingTranscript() }.controlSize(.small) }
            }
        }
    }
}
