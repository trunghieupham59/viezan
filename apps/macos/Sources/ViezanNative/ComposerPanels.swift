import SwiftUI
import ViezanDomain

// One row of a shell panel list (model picker, composer tools): leading check, title,
// trailing detail, hover/keyboard highlight, muted for rows that only lead somewhere.
struct PanelRow: View {
    var title: String
    var detail: String = ""
    var symbol: String? = nil
    var selected = false
    var highlighted = false
    var muted = false
    /// A switch at the trailing edge for on/off rows; the whole row toggles it.
    var toggle: Bool? = nil
    var identifier: String
    var action: () -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var hovered = false
    var body: some View {
        Button(action: action) {
            HStack(spacing: metric("small")) {
                if let symbol { Image(systemName: symbol).imageScale(.medium).frame(width: metric("icon")).foregroundStyle(.secondary).accessibilityHidden(true) }
                else { Image(systemName: "checkmark").imageScale(.small).opacity(selected ? 1 : 0).frame(width: metric("icon") - metric("tight")).accessibilityHidden(true) }
                Text(title).lineLimit(1).foregroundStyle(muted ? contentColor("text-muted", scheme) : contentColor("text", scheme))
                Spacer(minLength: metric("small"))
                if symbol != nil, selected { Image(systemName: "checkmark").imageScale(.small).accessibilityHidden(true) }
                if !detail.isEmpty { Text(detail).font(.vzn("captionScale")).monospacedDigit().foregroundStyle(.secondary).lineLimit(1) }
                if let toggle { Toggle("", isOn: .constant(toggle)).toggleStyle(.switch).labelsHidden().controlSize(.mini).allowsHitTesting(false).accessibilityHidden(true) }
            }
            .padding(.horizontal, metric("small")).frame(height: metric("compactControl")).frame(maxWidth: .infinity, alignment: .leading)
            .background(highlighted || hovered ? contentColor("surface-hover", scheme) : .clear, in: RoundedRectangle(cornerRadius: metric("radius")))
            .contentShape(Rectangle())
        }.buttonStyle(.plain).onHover { hovered = $0 }
            .accessibilityLabel(title + (detail.isEmpty ? "" : " · " + detail)).accessibilityAddTraits(selected || toggle == true ? .isSelected : [])
            .accessibilityIdentifier(identifier)
    }
}

// What the composer's "+" offers, as data so the panel and its test share one source.
enum ComposerTools {
    struct Row: Equatable, Identifiable {
        enum Kind: Equatable { case attach, capture, ocr, mode(String), careful, instructions, listen, stopSpeaking }
        var kind: Kind
        var enabled = true
        var selected = false
        var id: String {
            switch kind {
            case .attach: return "attach"
            case .capture: return "capture"
            case .ocr: return "ocr"
            case .mode(let mode): return "mode-" + mode
            case .careful: return "careful"
            case .instructions: return "instructions"
            case .listen: return "listen"
            case .stopSpeaking: return "stop-speaking"
            }
        }
    }
    struct Section: Equatable { var key: String; var rows: [Row] }
    static let modes = ["text", "web", "research", "image"]
    static func sections(feature: Feature, imageCount: Int, chatMode: String, careful: Bool, hasInstructions: Bool = false, speaking: Bool, hasAnswer: Bool) -> [Section] {
        let roomForImages = [.chat, .translate].contains(feature) && imageCount < (feature == .translate ? 1 : 4)
        var sections = [Section(key: "attach", rows: [Row(kind: .attach, enabled: roomForImages), Row(kind: .capture, enabled: roomForImages), Row(kind: .ocr)])]
        if feature == .chat {
            sections.append(Section(key: "chatMode", rows: modes.map { Row(kind: .mode($0), selected: chatMode == $0) }))
            sections.append(Section(key: "reasoning", rows: [Row(kind: .careful, selected: careful), Row(kind: .instructions, selected: hasInstructions)]))
        }
        // Speech-to-text provider lives in Settings › Voice; the panel keeps only what acts on this session.
        sections.append(Section(key: "voice", rows: [Row(kind: .listen, enabled: hasAnswer && !speaking), Row(kind: .stopSpeaking, enabled: speaking)]))
        return sections
    }
}

// The "+" layer: attachments, chat mode, careful reasoning and voice, one panel instead of a
// system menu with submenus. ↑↓ move, Return activates, Escape closes (shell), focus returns.
struct ComposerToolsPanel: View {
    @Bindable var store: WorkbenchStore
    var dismiss: () -> Void
    var availableHeight: CGFloat
    @State private var highlighted: String?
    @FocusState private var focused: Bool
    private var session: Session { store.session }
    private var sections: [ComposerTools.Section] {
        ComposerTools.sections(feature: session.feature, imageCount: session.images?.count ?? 0, chatMode: session.chatMode ?? "text",
                               careful: session.carefulReasoning ?? false, hasInstructions: !(session.systemPrompt ?? "").isEmpty, speaking: store.audio.speaking,
                               hasAnswer: session.feature == .chat ? session.messages.contains { $0.role == "assistant" && !$0.text.isEmpty } : !session.output.isEmpty)
    }
    private var rows: [ComposerTools.Row] { sections.flatMap(\.rows).filter(\.enabled) }
    private func label(_ row: ComposerTools.Row) -> (title: String, detail: String, symbol: String?) {
        switch row.kind {
        case .attach: return (store.text("attachImage"), "", "photo")
        case .capture: return (store.text("captureImage"), "", "camera.viewfinder")
        case .ocr: return (store.text("extractImageText"), "", "text.viewfinder")
        case .mode(let mode):
            // Image mode names who will draw (OpenAI/Gemini with a key), whatever the chat model is.
            if mode == "image" {
                let provider = ImageGeneration.provider(for: session.model, hasKey: { store.providers.keyed.contains($0) })
                return (store.text("chatMode_image"), provider.map { $0 == "openai" ? "OpenAI" : "Gemini" } ?? store.text("imageProviderNone"), nil)
            }
            return (store.text("chatMode_" + mode), store.text("chatModeHint_" + mode), nil)
        case .careful: return (store.text("carefulReasoning"), store.text("carefulReasoningHint"), nil)
        case .instructions:
            let text = session.systemPrompt ?? ""
            let name = store.workspace.prompts?.first { $0.text == text }?.name
            return (store.text("systemPrompt"), text.isEmpty ? store.text("noInstruction") : name ?? String(text.prefix(40)), nil)
        case .listen: return (store.text("listen"), "", "speaker.wave.2")
        case .stopSpeaking: return (store.text("stopSpeaking"), "", "speaker.slash")
        }
    }
    private func activate(_ row: ComposerTools.Row) {
        guard row.enabled else { return }
        switch row.kind {
        case .attach: dismiss(); NotificationCenter.default.post(name: .viezanComposerAction, object: "attach")
        case .capture: dismiss(); NotificationCenter.default.post(name: .viezanComposerAction, object: "capture")
        case .ocr: dismiss(); NotificationCenter.default.post(name: .viezanComposerAction, object: "ocr")
        case .mode(let mode): store.setChatMode(session.id, mode); dismiss()
        case .careful: store.setCarefulReasoning(session.id, !(session.carefulReasoning ?? false)); dismiss()
        case .instructions: dismiss(); NotificationCenter.default.post(name: .viezanOpenInstructions, object: nil)
        case .listen:
            let text = session.feature == .chat ? session.messages.last(where: { $0.role == "assistant" })?.text ?? "" : session.feature == .dictionary ? DictionaryEntry.parse(session.output).map { $0.headword + ". " + $0.meaning } ?? "" : (session.images ?? []).isEmpty ? session.output : ImageTranslation.text(session.output)
            store.audio.speak(text, language: session.target); dismiss()
        case .stopSpeaking: store.audio.stopSpeaking(); dismiss()
        }
    }
    private func move(_ offset: Int) {
        let list = rows
        guard !list.isEmpty else { return }
        let index = highlighted.flatMap { id in list.firstIndex { $0.id == id } } ?? (offset > 0 ? -1 : list.count)
        highlighted = list[min(max(index + offset, 0), list.count - 1)].id
    }
    var body: some View {
        // Groups read by their hairlines, not headers: attachments, mode (one checked), reasoning
        // (a switch), voice. Short enough to never scroll at the stage heights the shell allows.
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(sections.enumerated()), id: \.element.key) { index, section in
                        if index > 0 { Divider().padding(.vertical, metric("small")) }
                        ForEach(section.rows) { row in
                            let text = label(row)
                            PanelRow(title: text.title, detail: text.detail, symbol: row.kind == .instructions ? "text.quote" : text.symbol, selected: row.selected, highlighted: highlighted == row.id, muted: !row.enabled,
                                     toggle: row.kind == .careful ? row.selected : nil, identifier: "tool-" + row.id) { activate(row) }
                                .id(row.id).disabled(!row.enabled)
                        }
                    }
                }.padding(.vertical, metric("small"))
            }
            .onChange(of: highlighted) { _, id in if let id { proxy.scrollTo(id) } }
        }
        .focusable().focused($focused).focusEffectDisabled()
        .onKeyPress(.downArrow) { move(1); return .handled }
        .onKeyPress(.upArrow) { move(-1); return .handled }
        .onKeyPress(.return) { if let row = rows.first(where: { $0.id == highlighted }) { activate(row); return .handled }; return .ignored }
        .onAppear { focused = true; highlighted = rows.first?.id }
        .padding(.horizontal, metric("small")).frame(maxHeight: availableHeight).fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .contain).accessibilityLabel(store.text("attachImage"))
        .accessibilityIdentifier("tools-panel")
    }
}

// Session instructions as a shell layer: a multi-line editor that applies as you type, the saved
// instructions as rows (the applied one checked), save-as and delete with Undo. No Apply button.
struct InstructionsPanel: View {
    @Bindable var store: WorkbenchStore
    var dismiss: () -> Void
    var availableHeight: CGFloat
    @Environment(\.colorScheme) private var scheme
    @State private var naming = false
    @State private var name = ""
    @State private var editing = false
    @FocusState private var nameFocused: Bool
    private var session: Session { store.session }
    private var text: String { session.systemPrompt ?? "" }
    private var prompts: [SavedPrompt] { store.workspace.prompts ?? [] }
    private var applied: SavedPrompt? { prompts.first { $0.text == text && !text.isEmpty } }
    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !text.isEmpty else { return }
        store.savePrompt(name: trimmed, text: text); naming = false; name = ""
        ToastCenter.shared.show(store.text("promptSaved") + ": " + trimmed, key: "prompt-save")
    }
    private func deleteApplied() {
        guard let prompt = applied else { return }
        store.deletePrompt(prompt.id)
        ToastCenter.shared.show(store.text("promptDeleted") + ": " + prompt.name, key: "prompt-" + prompt.id, actionLabel: store.text("undo")) { store.savePrompt(name: prompt.name, text: prompt.text) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            HStack { Text(store.text("systemPrompt")).font(.vzn("labelScale", .semibold)); Spacer(); ShellCloseButton(label: store.text("close"), action: dismiss) }
                .frame(height: metric("control"))
            ComposerEditor(text: Binding(get: { store.session.systemPrompt ?? "" }, set: { store.setSystemPrompt(store.session.id, $0) }), identity: "instructions-" + session.id, label: store.text("systemPrompt"), font: readingNSFont(store), focusEpoch: 1, accessibilityID: "instructions-editor", growsWithContent: true, maxLines: 8, onFocus: { editing = $0 }) {}
                .fixedSize(horizontal: false, vertical: true)
                .modifier(EditorPlaceholder(text: store.text("instructionsHint"), visible: text.isEmpty, font: readingFont(store), leadingInset: ComposerEditor.caretLeading, topInset: ComposerEditor.verticalInset(for: readingNSFont(store))))
                .padding(.horizontal, metric("small"))
                .background(contentColor("surface-subtle", scheme), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(contentColor(editing ? "border-strong" : "border", scheme), lineWidth: metric("hairline")))
            Divider().padding(.vertical, metric("tight"))
            Eyebrow(text: store.text("promptLibrary")).padding(.horizontal, metric("small"))
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(prompts) { prompt in
                        PanelRow(title: prompt.name, selected: applied?.id == prompt.id, identifier: "prompt-" + prompt.id) { store.setSystemPrompt(store.session.id, prompt.text) }
                    }
                    if naming {
                        HStack(spacing: metric("small")) {
                            Image(systemName: "plus").imageScale(.small).foregroundStyle(.secondary).frame(width: metric("icon") - metric("tight")).accessibilityHidden(true)
                            TextField(store.text("promptName"), text: $name).textFieldStyle(.plain).font(.vzn("labelScale")).focused($nameFocused)
                                .onSubmit(save).onExitCommand { naming = false; name = "" }.accessibilityIdentifier("prompt-name")
                            Button(store.text("savePrompt")) { save() }.buttonStyle(.vznOutline).controlSize(.small).disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }.padding(.horizontal, metric("small")).frame(height: metric("compactControl")).onAppear { nameFocused = true }
                    } else {
                        PanelRow(title: store.text("savePromptAs"), symbol: "plus", muted: text.isEmpty, identifier: "prompt-save-as") { if !text.isEmpty { naming = true } }.disabled(text.isEmpty)
                    }
                }.padding(.bottom, metric("small"))
            }.frame(maxHeight: .infinity)
            if let applied {
                Divider()
                Button(store.text("deletePrompt"), systemImage: "trash", role: .destructive) { deleteApplied() }
                    .buttonStyle(.vznQuiet).font(.vzn("smallScale")).help(applied.name)
            }
        }
        .padding(metric("inset")).frame(maxHeight: availableHeight).fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .contain).accessibilityLabel(store.text("systemPrompt"))
        .accessibilityIdentifier("instructions-panel")
    }
}
