import SwiftUI
import AppKit
import ViezanDomain

/// The launcher's quick AI conversation: one detached chat session that the launcher reuses
/// for 30 minutes ("Ask AI again") and that "Open in Chat" hands to the main window as is.
@MainActor enum QuickAISession {
    static let key = "launcher.quickSession"
    static let maxQuestion = 3000
    static func current(_ store: WorkbenchStore) -> Session? {
        guard let id = UserDefaults.standard.string(forKey: key), let session = store.session(id), session.feature == .chat, session.archived != true, !session.messages.isEmpty else { return nil }
        return session
    }
    /// Updated within the last 30 minutes: new questions continue it instead of starting over.
    static func fresh(_ store: WorkbenchStore, now: Date = Date()) -> Bool {
        guard let session = current(store) else { return false }
        return now.timeIntervalSince1970 - (session.updated ?? 0) < 1800
    }
    static func forget() { UserDefaults.standard.removeObject(forKey: key) }
}

struct LauncherChatView: View {
    @Bindable var store: WorkbenchStore
    let keys: Launcher.Keys
    /// Nil until the first question is sent, so an unused visit leaves no empty chat in history.
    @Binding var sessionID: String?
    @Binding var question: String
    /// Set when search handed over a question: it is sent once the conversation shows,
    /// unless the model cannot answer — then it stays typed.
    @Binding var sendOnOpen: Bool
    var back: () -> Void
    var dismiss: () -> Void
    /// A session to continue in AI Chat, or nil for the AI Chat page alone.
    var openInChat: (String?) -> Void
    var openSettings: (String) -> Void
    @State private var focusEpoch = 1
    @Environment(\.colorScheme) private var scheme
    private func t(_ key: String) -> String { store.text(key) }
    private var session: Session? { sessionID.flatMap(store.session) }
    private var model: String {
        session?.model ?? (store.providers.availability(store.session.model) == .available ? store.session.model : store.preferredModel ?? store.session.model)
    }
    private var ready: Bool { !store.providers.empty && !modelUnavailable(model, store: store) }
    private var running: WorkTask? { sessionID.flatMap(store.running) }
    private var trimmed: String { question.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var tooLong: Bool { trimmed.count > QuickAISession.maxQuestion }
    private struct Turn: Identifiable { let id: String; let question: String; let answer: Message? }
    private var turns: [Turn] {
        let messages = session?.messages ?? []
        return messages.indices.compactMap { index in
            guard messages[index].role == "user" else { return nil }
            let next = messages.indices.contains(index + 1) && messages[index + 1].role == "assistant" ? messages[index + 1] : nil
            return Turn(id: messages[index].id, question: messages[index].text, answer: next)
        }
    }
    private func task(_ id: String?) -> WorkTask? { id.flatMap { id in store.workspace.tasks.first { $0.id == id } } }

    var body: some View {
        let turns = turns
        VStack(spacing: 0) {
            header(empty: turns.isEmpty)
            Divider()
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: metric("gap")) {
                        if !ready { missingModel }
                        else if turns.isEmpty { emptyState }
                        else {
                            ForEach(turns) { turn in card(turn, active: turn.id == turns.last?.id).id(turn.id) }
                        }
                    }.padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(contentColor("surface-muted", scheme))
                // A new question takes the frame; earlier turns stay above it.
                .onChange(of: turns.count, initial: true) { _, _ in if let last = turns.last { withAnimation { proxy.scrollTo(last.id, anchor: .top) } } }
            }
            Divider()
            footer(turns: turns.count)
        }
        .onAppear { if sendOnOpen { sendOnOpen = false; send() } }
        .onChange(of: keys.last?.serial) { _, _ in
            switch keys.last?.key {
            case .escape: dismiss()
            case .openInChat: handOff()
            case .newChat: if !turns.isEmpty || !question.isEmpty { newConversation() }
            default: break
            }
        }
    }

    private var questionFont: NSFont { .systemFont(ofSize: NSFont.systemFontSize * metric("subtitleScale"), weight: .medium) }
    private func header(empty: Bool) -> some View {
        // Top-aligned so a growing question pushes the body down while the buttons stay put;
        // the first line sits on the buttons' centre line.
        let line = ceil(questionFont.ascender - questionFont.descender + questionFont.leading)
        return HStack(alignment: .top, spacing: metric("small")) {
            Button(t("launcher_back"), systemImage: "chevron.left", action: back).buttonStyle(.vznQuiet)
            Button(action: newConversation) {
                Image(systemName: empty ? "sparkles" : "plus").frame(width: metric("icon"), height: metric("icon"))
            }
            .buttonStyle(.vznQuiet).disabled(empty && question.isEmpty)
            .help(t("ai_chat_popup_new_conversation").replacingOccurrences(of: "{shortcut}", with: "⌘N"))
            .accessibilityLabel(empty ? t("ai_chat_popup_short_label") : t("ai_chat_popup_new_conversation").replacingOccurrences(of: "{shortcut}", with: "⌘N"))
            ComposerEditor(text: $question, identity: "launcher-quick-ai", label: t("ai_chat_popup_title"),
                           font: questionFont,
                           focusEpoch: focusEpoch, accessibilityID: "launcher-quick-ai", growsWithContent: true, submitOnReturn: true) { send() }
                .fixedSize(horizontal: false, vertical: true)
                .modifier(EditorPlaceholder(text: t(empty ? "ai_chat_popup_placeholder" : "ai_chat_popup_followup_placeholder"), visible: question.isEmpty, font: .vzn("subtitleScale")))
                .padding(.top, max(0, (metric("control") - line) / 2))
            if !question.isEmpty && running == nil {
                Button { question = ""; focusEpoch += 1 } label: { Image(systemName: "xmark.circle.fill") }
                    .buttonStyle(.vznQuiet).foregroundStyle(.secondary).accessibilityLabel(t("quickClear")).help(t("quickClear"))
            }
            Button(action: send) {
                if running != nil { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.up") }
            }
            .buttonStyle(.vznPrimary).disabled(trimmed.isEmpty || tooLong || running != nil || !ready)
            .accessibilityLabel(t("send")).help(t("send") + " (↵)")
        }
        .controlSize(.large)
        .padding(.horizontal, metric("gap")).padding(.vertical, metric("small"))
        .overlay(alignment: .bottomTrailing) {
            if tooLong {
                Text("\(trimmed.count) / \(QuickAISession.maxQuestion) · " + t("ai_chat_popup_input_too_long"))
                    .font(.vzn("captionScale")).foregroundStyle(contentColor("danger", scheme)).padding(.trailing, metric("inset")).padding(.bottom, metric("hairline"))
            }
        }
    }

    private var missingModel: some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            Label(t("ai_chat_popup_title"), systemImage: "sparkles").font(.vzn("subtitleScale", .semibold))
            ProviderNotice(store: store, model: model) { replacement in if let sessionID { store.setModel(sessionID, replacement) } }
        }.padding(.top, metric("small"))
    }

    private var emptyState: some View {
        VStack(spacing: metric("small")) {
            Image(systemName: "sparkles").font(.vzn("headingScale")).foregroundStyle(contentColor("action-text", scheme))
                .frame(width: metric("large") * 2, height: metric("large") * 2)
                .background(contentColor("action-soft", scheme), in: Circle())
            Text(t("ai_chat_popup_short_label").uppercased(with: Locale(identifier: store.workspace.locale))).font(.vzn("captionScale", .semibold)).foregroundStyle(.secondary)
            Text(t("ai_chat_popup_title")).font(.vzn("titleScale", .semibold))
            Text(t("ai_chat_popup_empty_desc")).foregroundStyle(.secondary).multilineTextAlignment(.center)
            HStack(spacing: metric("gap")) {
                keyHint("↵", t("send")); keyHint("⇧ ↵", t("ai_chat_popup_new_line"))
                keyHint("⌘ ↵", t("ai_chat_popup_open_in_chat")); keyHint("Esc", t("ai_chat_popup_close"))
            }.font(.vzn("smallScale")).foregroundStyle(.secondary).padding(.top, metric("small"))
        }.frame(maxWidth: .infinity).padding(.top, metric("large"))
    }
    private func keyHint(_ key: String, _ label: String) -> some View { HStack(spacing: metric("tight")) { KeyCap(text: key); Text(label) } }

    private func card(_ turn: Turn, active: Bool) -> some View {
        let task = task(turn.answer?.id), answer = turn.answer?.text ?? ""
        let thinking = task?.status == .running && answer.isEmpty
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                Text(t("ai_chat_popup_question_badge")).font(.vzn("captionScale", .semibold)).foregroundStyle(contentColor("action-text", scheme))
                    .padding(.horizontal, metric("tight") + metric("hairline")).background(contentColor("action-soft", scheme), in: RoundedRectangle(cornerRadius: metric("tight")))
                Text(turn.question).font(.vzn("smallScale")).foregroundStyle(.secondary).textSelection(.enabled).lineLimit(active ? nil : 2)
            }
            .padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            Divider()
            VStack(alignment: .leading, spacing: metric("small")) {
                if thinking {
                    Label(t("quickThinking"), systemImage: "sparkles").font(.vzn("smallScale")).foregroundStyle(.secondary)
                    ForEach(0..<3, id: \.self) { line in
                        RoundedRectangle(cornerRadius: metric("tight")).fill(contentColor("surface-muted", scheme))
                            .frame(height: metric("gap")).frame(maxWidth: line == 2 ? metric("reading") * 0.4 : .infinity)
                    }
                } else if !answer.isEmpty {
                    TranscriptText(text: answer, font: readingNSFont(store), label: t("response"), markdown: task?.status != .running, resetSelection: 0) { _ in }
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if let task, [.failed, .interrupted].contains(task.status) {
                    TaskStatusText(store: store, task: task).font(.callout)
                        .padding(metric("small")).frame(maxWidth: .infinity, alignment: .leading)
                        .background(contentColor("danger", scheme).opacity(metric("selectionOpacity")), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                }
            }
            .padding(.horizontal, metric("inset")).padding(.vertical, metric("gap"))
            .accessibilityElement(children: .contain)
            if let task, task.status != .running {
                Divider()
                HStack(spacing: metric("tight")) {
                    CopyResponseButton(text: answer, label: t("copy"), copiedLabel: t("copied"))
                    // Regenerate only the newest answer: an earlier one would rewrite history the later turns used.
                    if active { Button(t("quickRegenerate"), systemImage: "arrow.clockwise") { store.retry(task.id) }.buttonStyle(.vznQuiet).disabled(!store.canRetry(task)) }
                }.font(.vzn("smallScale")).padding(.horizontal, metric("small")).padding(.vertical, metric("tight"))
            }
        }
        .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("radius")))
        .overlay(RoundedRectangle(cornerRadius: metric("radius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
        .opacity(active ? 1 : 0.7)
    }

    private func footer(turns count: Int) -> some View {
        let answer = turns.last?.answer?.text ?? ""
        return HStack(spacing: metric("small")) {
            Button { openSettings("providers") } label: {
                HStack(spacing: metric("tight")) {
                    StatusDot(tone: ready ? .ready : .failed)
                    Text(nativeModelLabel(model, store: store)).lineLimit(1)
                    if count > 0 { Text("· " + t("ai_chat_popup_turns").replacingOccurrences(of: "{count}", with: String(count))).foregroundStyle(.secondary) }
                }
            }
            .buttonStyle(.vznQuiet).help(t("ai_chat_popup_change_model"))
            .accessibilityLabel(nativeModelLabel(model, store: store) + (ready ? ", " + t("ai_chat_popup_model_ready") : ""))
            Spacer(minLength: metric("small"))
            if let running { Button(t("stop"), systemImage: "stop.fill", role: .destructive) { store.cancel(running.id) }.buttonStyle(.vznQuiet) }
            CopyResponseButton(text: answer, label: t("copy"), copiedLabel: t("copied"))
            Divider().frame(height: metric("icon"))
            Button(action: handOff) { HStack(spacing: metric("tight")) { Text(t("ai_chat_popup_open_in_chat")); KeyCap(text: "⌘ ↵") } }
                .buttonStyle(.vznQuiet)
        }
        .font(.vzn("smallScale"))
        .padding(.horizontal, metric("gap")).padding(.vertical, metric("tight"))
        .background(contentColor("surface", scheme))
    }

    private func send() {
        guard !trimmed.isEmpty, !tooLong, running == nil, ready else { return }
        let id = sessionID ?? store.createDetachedSession(feature: .chat)
        if sessionID == nil { sessionID = id; UserDefaults.standard.set(id, forKey: QuickAISession.key) }
        store.setDraft(id, trimmed)
        if store.submit(id) != nil { question = "" }
        focusEpoch += 1
    }
    /// Starts over: the current answer stops, the next question opens a new conversation.
    private func newConversation() {
        if let running { store.cancel(running.id) }
        sessionID = nil; question = ""; QuickAISession.forget(); focusEpoch += 1
    }
    /// The conversation continues in AI Chat with an unsent question as its draft;
    /// the launcher starts fresh next time.
    private func handOff() {
        if sessionID == nil && trimmed.isEmpty { openInChat(nil); return }
        let id = sessionID ?? store.createDetachedSession(feature: .chat)
        if !trimmed.isEmpty { store.setDraft(id, trimmed) }
        QuickAISession.forget(); sessionID = nil; question = ""
        openInChat(id)
    }
}
