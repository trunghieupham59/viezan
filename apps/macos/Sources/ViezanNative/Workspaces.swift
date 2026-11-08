import SwiftUI
import UniformTypeIdentifiers
import ViezanDomain

struct ChatWorkspace: View {
    @Bindable var store: WorkbenchStore
    @Environment(\.colorScheme) private var scheme
    var focusEpoch = 0
    @State private var followBottom = true
    @State private var userScrolling = false
    @State private var selectedMessage: String?
    @State private var selectionReset = 0
    @State private var draftLines = 1
    @State private var composerFocused = false
    @State private var composerWidth: CGFloat = metric("reading")
    @State private var composerToolsWidth: CGFloat = metric("compactSidebar") + metric("control") + metric("small")
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var session: Session { store.session }
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    private var composerRadius: CGFloat { metric(glass ? "chromeSurfaceRadius" : "largeRadius") }
    /// No messages yet and nothing running: the composer sits mid-stage with a greeting and recent work.
    private var starting: Bool { session.messages.isEmpty && store.running(session.id) == nil }
    /// Tier 1 of the suggestions: the three most recent sessions of any feature, to continue.
    private var recent: [Session] {
        store.workspace.sessions.filter { $0.id != session.id && store.moduleEnabled($0.feature.rawValue) && $0.comparisonParent == nil && $0.archived != true && (!$0.messages.isEmpty || !$0.output.isEmpty) }
            .sorted { ($0.updated ?? 0) > ($1.updated ?? 0) }.prefix(3).map { $0 }
    }
    var body: some View {
        let sessionID = session.id
        VStack(spacing: metric("inset")) {
            if starting {
                Spacer(minLength: 0)
                VStack(spacing: metric("gap")) {
                    if let url = NativeResources.brandURL, let icon = NSImage(contentsOf: url) {
                        Image(nsImage: icon).resizable().scaledToFit().frame(width: metric("hero"), height: metric("hero")).accessibilityHidden(true)
                    }
                    Text(store.text("chatStart")).font(.vzn("headingScale")).accessibilityAddTraits(.isHeader)
                }.padding(.bottom, metric("small")).transition(.opacity)
            } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: metric("gutter")) {
                        ForEach(session.messages) { message in
                            VStack(alignment: .leading, spacing: metric("small")) {
                                ForEach(message.images ?? []) { image in
                                    if glass {
                                        // Chat-States: the image in a 16 pt rounded frame with a soft shadow, its actions beside it.
                                        HStack(alignment: .top, spacing: metric("gap") + metric("hairline") * 2) {
                                            AttachmentPreview(attachment: image, maxSide: metric("editor") + metric("hero") + metric("gutter") + metric("tight"), radius: metric("chromeCardRadius"))
                                            VStack(alignment: .leading, spacing: metric("small")) {
                                                Button(store.text("saveImage"), systemImage: "square.and.arrow.down") { saveImage(image) }
                                                Button(store.text("copyImage"), systemImage: "doc.on.doc") { copyImage(image) }
                                                Button(store.text("editImage"), systemImage: "pencil") { store.addImage(image, sessionID: sessionID); store.setChatMode(sessionID, "image") }
                                            }.buttonStyle(.vznOutline).controlSize(.small).padding(.top, metric("tight"))
                                        }
                                    } else {
                                        AttachmentPreview(attachment: image)
                                        HStack {
                                            Button(store.text("saveImage")) { saveImage(image) }
                                            Button(store.text("copyImage")) { copyImage(image) }
                                            Button(store.text("editImage")) { store.addImage(image, sessionID: sessionID); store.setChatMode(sessionID, "image") }
                                        }
                                    }
                                }
                                // "Đã tạo 1 ảnh 1024×1024": generated images say how many and how large (older ones have no size).
                                if glass, message.role == "assistant", let generated = message.images, !generated.isEmpty, generated.allSatisfy({ $0.generator != nil }) {
                                    Text(generatedImagesCaption(generated, task: store.workspace.tasks.first(where: { $0.id == message.id }))).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                                        .help(generated.first?.generator ?? "")
                                }
                                if let task = store.workspace.tasks.first(where: { $0.id == message.id }), let research = task.research {
                                    ResearchPanel(store: store, task: task, research: research)
                                }
                                if message.role == "user" {
                                    // The person's turn: a bubble that hugs its text, trailing, at most `bubbleFraction`
                                    // of the reading column; the answer stays plain text on the leading edge.
                                    Text(message.text.isEmpty && (message.images ?? []).isEmpty ? store.text("noContent") : message.text)
                                        .font(readingFont(store)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                                        .foregroundStyle(glass ? contentColor("text-strong", scheme) : .primary)
                                        .padding(.vertical, metric(glass ? "small" : "gap") + (glass ? metric("hairline") * 2 : 0))
                                        .padding(.horizontal, metric(glass ? "gap" : "inset") + (glass ? metric("hairline") * 2 : 0))
                                        .background(contentColor("surface-muted", scheme), in: glass ? AnyShape(UserBubbleShape()) : AnyShape(RoundedRectangle(cornerRadius: metric("largeRadius"))))
                                        .frame(maxWidth: metric("reading") * metric("bubbleFraction"), alignment: .trailing)
                                        .frame(maxWidth: .infinity, alignment: .trailing)
                                        .accessibilityLabel(store.text("you") + ": " + message.text)
                                } else {
                                if glass {
                                    // "✦ Viezan": accent sparkle, 12 semibold muted name.
                                    HStack(spacing: metric("small") - metric("hairline") * 2) {
                                        Image(systemName: "sparkles").imageScale(.small).foregroundStyle(contentColor("action", scheme))
                                        Text("Viezan").fontWeight(.semibold).foregroundStyle(contentColor("text-muted", scheme))
                                    }.font(.vzn("smallScale")).accessibilityElement(children: .combine)
                                } else { Label("Viezan", systemImage: "sparkles").font(.vzn("smallScale")).foregroundStyle(.secondary) }
                                TranscriptText(text: message.text.isEmpty && (message.images ?? []).isEmpty ? store.text(store.workspace.tasks.first(where: { $0.id == message.id })?.status.rawValue ?? "noContent") : message.text,
                                               font: readingNSFont(store), label: store.text("response"), markdown: store.workspace.tasks.first(where: { $0.id == message.id })?.status != .running, resetSelection: selectionReset) { selected in
                                    if selected { selectedMessage = message.id; followBottom = false }
                                    else if selectedMessage == message.id { selectedMessage = nil }
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                    .accessibilityAddTraits(store.workspace.tasks.first(where: { $0.id == message.id })?.status == .running ? .updatesFrequently : [])
                                }
                                // Chat-States: a live answer carries an "Answering…" chip until it finishes.
                                if glass, message.role == "assistant", store.workspace.tasks.first(where: { $0.id == message.id })?.status == .running {
                                    StatusBadge(text: store.text("chatAnswering"), tone: .busy).accessibilityIdentifier("chat-answering")
                                }
                                // Chat-States: a failed or stopped turn shows its reason in a soft block, Retry beside the meta.
                                if glass, message.role == "assistant", message.id == session.messages.last?.id,
                                   let task = store.workspace.tasks.first(where: { $0.id == message.id }), [.failed, .interrupted, .cancelled].contains(task.status) {
                                    if task.status == .failed {
                                        InlineFailure(title: store.text("failed"), detail: store.text(task.errorCode ?? "providerError")).help(task.errorDetail ?? "")
                                    }
                                    if message.text.isEmpty {
                                        HStack(spacing: metric("tight")) {
                                            Button(store.text("retry"), systemImage: "arrow.clockwise") { store.retry(task.id) }
                                                .buttonStyle(.vznQuiet).foregroundStyle(contentColor("action-text", scheme)).fontWeight(.semibold).disabled(!store.canRetry(task))
                                            Text(ModelLineup.shortName(task.request.model) + " · " + store.text(task.status == .failed ? "failed" : task.status.rawValue))
                                                .font(.vzn("captionScale", .medium)).foregroundStyle(contentColor(task.status == .failed ? "danger" : "text-muted", scheme)).lineLimit(1)
                                                .padding(.horizontal, metric("small") + metric("hairline") * 2).frame(height: metric("gutter") - metric("hairline") * 2)
                                                .background(contentColor(task.status == .failed ? "danger" : "surface-muted", scheme).opacity(task.status == .failed ? metric("selectionOpacity") : 1), in: Capsule())
                                                .help(task.request.model)
                                        }.padding(.leading, -metric("small"))
                                    }
                                }
                                if message.role == "assistant", !message.text.isEmpty {
                                    if store.workspace.tasks.first(where: { $0.id == message.id })?.status != .running { ForEach(ChartArtifact.parse(message.text)) { NativeChart(artifact: $0) } }
                                    let task = store.workspace.tasks.first(where: { $0.id == message.id })
                                    HStack(spacing: metric("tight")) {
                                        CopyResponseButton(text: message.text, label: store.text("copy"), copiedLabel: store.text("copied"))
                                        // Overlays-Listen: the answer reads at once; while reading the control is a "Reading" pill.
                                        if glass, task?.status != .running {
                                            ListenSpeakerButton(store: store, label: store.text("speak"),
                                                                sources: [ListenSource(id: message.id, title: "Viezan", text: message.text, language: TextLanguage.detect(message.text) ?? store.workspace.locale)])
                                        }
                                        // Glass board order: Copy · Retry · model chip; other presets keep model before Retry.
                                        if glass { retryControl(message, task) }
                                        if let task {
                                            // Which model answered and what it cost in tokens, quietly, after the actions.
                                            // The same short name as the composer chip; the full ID stays in the tooltip.
                                            let meta = ModelLineup.shortName(task.request.model) + (task.usage.map { " · " + store.text("tokensCount").replacingOccurrences(of: "{n}", with: ($0.input + $0.output).formatted()) } ?? "")
                                            if glass {
                                                Text(meta).font(.vzn("captionScale", .medium)).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
                                                    .padding(.horizontal, metric("small") + metric("hairline") * 2).frame(height: metric("gutter") - metric("hairline") * 2)
                                                    .background(contentColor("surface-muted", scheme), in: Capsule()).padding(.leading, metric("tight")).help(task.request.model)
                                            } else {
                                                Text(meta).font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(1).padding(.horizontal, metric("gap")).help(task.request.model)
                                            }
                                        }
                                        if !glass { retryControl(message, task) }
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
                .overlay(alignment: .bottom) {
                    if !followBottom && !session.messages.isEmpty {
                        Button(store.text("returnLatest"), systemImage: "arrow.down") {
                            selectionReset += 1; selectedMessage = nil; followBottom = true
                            if let last = session.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                        }.buttonStyle(.vznOutline).padding(metric("small"))
                    }
                }
            }.transition(.opacity)
            }
            if !glass, let task = store.workspace.tasks.first(where: { $0.request.sessionID == session.id }), [.failed, .interrupted, .cancelled].contains(task.status) {
                HStack {
                    TaskStatusText(store: store, task: task)
                    Button(store.text("retry")) { store.retry(task.id) }.disabled(!store.canRetry(task))
                }.font(.vzn("smallScale"))
            }
            // Same column as the composer it warns about.
            ProviderNotice(store: store, model: session.model)
                .frame(maxWidth: metric("reading")).padding(.horizontal, metric("gutter"))
            // Chat-States: image mode with no OpenAI or Gemini key on this device says so before sending.
            if glass, session.chatMode == "image", store.providers.checked, !["openai", "gemini"].contains(where: store.providers.keyed.contains) {
                HStack(spacing: metric("small")) {
                    StatusDot(tone: .warning)
                    Text(store.text("imageKeyNotice")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                    Spacer(minLength: metric("small"))
                    Button(store.text("addKey")) { NotificationCenter.default.post(name: .viezanOpenSettings, object: "providers") }
                        .modifier(NoticeLinkStyle(glass: true, accent: true)).accessibilityIdentifier("image-key-notice-open")
                }.accessibilityElement(children: .contain)
                    .frame(maxWidth: metric("reading")).padding(.horizontal, metric("gutter"))
            }
            // One composer surface: a single row while the draft is one line; from two lines
            // (or with attachments) the text leads and the controls drop to their own row.
            let narrow = glass && composerWidth < metric("editor") + metric("compactSidebar") + metric("control") * 3 + metric("small") * 4 + metric("small") * 2
            // Decide wrapping against the hypothetical inline editor, not the
            // wider stacked editor. Measuring the current layout caused long
            // sentences to alternate between the two shapes indefinitely.
            let inlineWidth = composerWidth - composerToolsWidth - metric("control") * 2
                - metric("small") * 4 - metric("tight") - ComposerEditor.caretLeading * 2
                - (store.running(session.id) == nil ? 0 : metric("inset") + metric("tight"))
            let naturalTextWidth = (session.draft as NSString).size(withAttributes: [.font: readingNSFont(store)]).width
            let wraps = glass ? naturalTextWidth > max(metric("control"), inlineWidth) : draftLines > 1
            let stacked = wraps || !(session.images ?? []).isEmpty || session.draft.contains("\n")
                || (glass && (store.audio.error != nil || store.pendingTranscript != nil || store.audio.transcribingOwner != nil))
            HStack(alignment: .center, spacing: metric("small")) {
                if !stacked { ImageControls(store: store, compact: true, selected: (session.chatMode ?? "text") != "text" || !(session.systemPrompt ?? "").isEmpty, glassChat: glass).controlSize(.large).imageScale(.large) }
                VStack(alignment: .leading, spacing: metric("small")) {
                    AttachmentChips(store: store)
                    ComposerEditor(text: Binding(get: { store.session(sessionID)?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("prompt"), font: readingNSFont(store), focusEpoch: focusEpoch, growsWithContent: true, submitOnReturn: true, maxLines: Int(metric("composerMaxLines")), onLines: { draftLines = $0 }, onFocus: { composerFocused = $0 }, pasteImages: { urls, data in ImageIntake.attach(urls: urls, data: data, to: sessionID, store: store) }) { store.submit(sessionID) }
                        .fixedSize(horizontal: false, vertical: true)
                        // The placeholder says what the mode does; no chip is added to the row for it.
                        .modifier(EditorPlaceholder(text: store.text((session.chatMode ?? "text") == "text" ? "prompt" : "promptMode_" + (session.chatMode ?? "text")), visible: session.draft.isEmpty, font: readingFont(store), leadingInset: ComposerEditor.caretLeading, topInset: ComposerEditor.verticalInset(for: readingNSFont(store)), textColor: glass ? contentColor("text-muted", scheme) : nil))
                    if stacked {
                        HStack(spacing: metric("small")) {
                            ImageControls(store: store, compact: true, selected: (session.chatMode ?? "text") != "text" || !(session.systemPrompt ?? "").isEmpty, glassChat: glass)
                            composerTrailing(dense: false)
                        }.controlSize(.large).imageScale(.large)
                    }
                    AudioStatus(store: store)
                }
                // The controls keep their natural width; only the editor flexes.
                if !stacked { HStack(spacing: metric("tight")) { composerTrailing(dense: true, iconModel: narrow) }.controlSize(.large).imageScale(.large).fixedSize() }
            }
            .padding(.horizontal, stacked ? metric("inset") - metric("hairline") * 2 : metric("small"))
            // AppKit's editor is control + tight (40 pt); six-point insets make
            // the 52 pt capsule align its 36 pt buttons with eight-point margins.
            .padding(.vertical, stacked ? metric("gap") : glass ? metric("small") - metric("hairline") * 2 : metric("tight"))
            .background {
                if glass { ComposerSurface(radius: stacked ? composerRadius : metric("control") / 2 + metric("small"), focused: composerFocused) }
                else { InsetInputSurface(radius: composerRadius, focused: composerFocused, baseRole: "surface") }
            }
            .modifier(ImageDropTarget(store: store, sessionID: sessionID, radius: composerRadius))
            .frame(maxWidth: metric("reading"))
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { composerWidth = $0 }
            .padding(.horizontal, metric("gutter")).padding(.bottom, starting ? 0 : metric("gutter"))
            if starting {
                if !recent.isEmpty { continueList.transition(.opacity) }
                if !habits.isEmpty { habitList.transition(.opacity) }
                Spacer(minLength: 0); Spacer(minLength: 0)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: metric("durationNormal")), value: starting)
    }
    // Retry under the newest finished answer only.
    @ViewBuilder private func retryControl(_ message: Message, _ task: WorkTask?) -> some View {
        if message.id == session.messages.last?.id, let task, task.status != .running {
            Button(store.text("retry"), systemImage: "arrow.clockwise") { store.retry(task.id) }
                .buttonStyle(.vznQuiet).disabled(!store.canRetry(task))
        }
    }
    // Model, speech, the non-default-mode chip and Send/Stop, in one order for both composer shapes.
    // Dense (one row): the model reads small, Send is a square icon; stacked: labelled Send.
    @ViewBuilder private func composerTrailing(dense: Bool, iconModel: Bool = false) -> some View {
        let canSend = !(session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (session.images ?? []).isEmpty)
        HStack(spacing: glass ? 0 : metric(dense ? "tight" : "small")) {
            // Shell-Minimum: a narrow composer keeps one row; the model folds into its sparkle.
            ModelPicker(store: store, compact: true, dense: dense, glassChat: glass, iconOnly: iconModel)
            if glass { ChromeDivider(vertical: true).frame(height: metric("inset") + metric("hairline") * 2).padding(.horizontal, metric("tight")) }
            AudioControls(store: store, compact: true, glassChat: glass)
        }
        .padding(.horizontal, glass ? metric("tight") : 0)
        .modifier(ControlGlass(active: glass))
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            if glass && width > 0 { composerToolsWidth = width }
        }
        if !dense { Spacer(minLength: metric("small")) }
        if let task = store.running(session.id) {
            // Glass: the answer's chip says it is live; the round Stop is drawn in danger.
            if !glass { ProgressView().controlSize(.small).accessibilityLabel(store.text("running")) }
            if dense {
                Button(role: .destructive) { store.cancel(task.id) } label: { Image(systemName: "stop.fill").imageScale(.small).frame(width: metric("control") - metric("gap") * 2) }
                    .buttonStyle(ChatButtonStyle(glass: glass, kind: .outline, circular: true)).foregroundStyle(glass ? contentColor("danger", scheme) : .primary).accessibilityLabel(store.text("stop")).help(store.text("stop")).accessibilityIdentifier("chat-stop")
            } else { Button(store.text("stop"), systemImage: "stop.fill", role: .destructive) { store.cancel(task.id) }.buttonStyle(ChatButtonStyle(glass: glass, kind: .outline)).accessibilityIdentifier("chat-stop") }
        } else if dense {
            Button { store.submit(session.id) } label: { Image(systemName: "arrow.up").fontWeight(.semibold).frame(width: metric("control") - metric("gap") * 2) }
                .buttonStyle(ChatButtonStyle(glass: glass, kind: .primary, circular: true)).disabled(!canSend).accessibilityLabel(store.text("send")).help(store.text("send") + " (↩)").accessibilityIdentifier("chat-send")
        } else {
            Button(store.text("send"), systemImage: "arrow.up") { store.submit(session.id) }
                .buttonStyle(ChatButtonStyle(glass: glass, kind: .primary)).disabled(!canSend).help(store.text("send") + " (↩)").accessibilityIdentifier("chat-send")
        }
    }
    // Continue: recent sessions of any feature, as quiet rows under the centred composer.
    private var continueList: some View {
        VStack(alignment: .leading, spacing: metric("tight")) {
            Eyebrow(text: store.text("continueRecent")).padding(.horizontal, metric("small"))
            ForEach(recent) { item in
                Button {
                    store.select(item.id)
                    NotificationCenter.default.post(name: .viezanOpenRoute, object: item.feature.rawValue)
                } label: {
                    HStack(spacing: metric("small")) {
                        Image(systemName: item.feature.symbol).foregroundStyle(glass ? contentColor("action-text", scheme) : .secondary).frame(width: metric("icon"))
                        Text(store.title(item)).lineLimit(1)
                        Spacer(minLength: metric("small"))
                        Text(relativeTime(item.updated, store: store)).font(.vzn("smallScale")).foregroundStyle(.secondary).fixedSize()
                    }.padding(.horizontal, metric("small")).frame(height: metric("compactControl")).contentShape(Rectangle())
                }.buttonStyle(.vznQuiet).accessibilityIdentifier("continue-" + item.id)
            }
        }.frame(maxWidth: metric("reading")).padding(.horizontal, metric("gutter"))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("continueRecent"))
    }
    private var habits: [HabitSuggestion] { store.habitSuggestions(for: session.id) }
    private func habitLabel(_ action: HabitAction) -> String {
        switch action {
        case .chatMode(let mode): return store.text("chatMode_" + mode)
        case .translatePair(let source, let target):
            return store.text("habitTranslatePair").replacingOccurrences(of: "{source}", with: store.text("lang_" + source)).replacingOccurrences(of: "{target}", with: store.text("lang_" + target))
        case .dictionary: return store.text("habitDictionary")
        }
    }
    private func habitSymbol(_ action: HabitAction) -> String {
        switch action {
        case .chatMode(let mode): return mode == "web" ? "globe" : mode == "research" ? "sparkle.magnifyingglass" : "photo"
        case .translatePair: return Feature.translate.symbol
        case .dictionary: return Feature.dictionary.symbol
        }
    }
    private func activateHabit(_ action: HabitAction) {
        switch action {
        case .chatMode(let mode): store.setChatMode(session.id, mode)
        case .translatePair(let source, let target):
            store.navigate(.translate)
            if store.session.hasWork { store.newSession() }
            store.setPair(store.session.id, source: source, target: target)
            NotificationCenter.default.post(name: .viezanOpenRoute, object: "translate")
        case .dictionary:
            store.navigate(.dictionary)
            NotificationCenter.default.post(name: .viezanOpenRoute, object: "dictionary")
        }
    }
    private func habitChip(_ suggestion: HabitSuggestion) -> some View {
        Button { activateHabit(suggestion.action) } label: {
            Label(habitLabel(suggestion.action), systemImage: habitSymbol(suggestion.action)).lineLimit(1)
                .frame(height: metric("compactControl"))
        }.buttonStyle(.vznQuiet).accessibilityLabel(habitLabel(suggestion.action)).accessibilityIdentifier("habit-" + suggestion.id)
    }
    private var habitList: some View {
        let suggestions = habits
        return VStack(alignment: .leading, spacing: metric("tight")) {
            Eyebrow(text: store.text("habitSuggestions")).padding(.horizontal, metric("small"))
            ViewThatFits(in: .horizontal) {
                HStack(spacing: metric("small")) { ForEach(suggestions) { habitChip($0) } }.fixedSize(horizontal: true, vertical: false)
                VStack(alignment: .leading, spacing: metric("tight")) {
                    HStack(spacing: metric("small")) { ForEach(Array(suggestions.prefix(2))) { habitChip($0) } }
                    HStack(spacing: metric("small")) { ForEach(Array(suggestions.dropFirst(2))) { habitChip($0) } }
                }
            }
        }.frame(maxWidth: metric("reading"), alignment: .leading).padding(.horizontal, metric("gutter"))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("habitSuggestions"))
    }
    // Chat mode, careful reasoning and speech live in the "+" tools panel (Review 18 shows one
    // attach control). The row never grows a chip for them: the mode shows in the placeholder and
    // on "+", careful reasoning on the model chip ("Kỹ · …").
    /// "Đã tạo 1 ảnh 1024×1024 · GPT Image 1 · 6,2 giây": count, size, the model that drew it, the time it took.
    private func generatedImagesCaption(_ images: [ImageAttachment], task: WorkTask?) -> String {
        let size = images.first.flatMap { image in image.width.flatMap { w in image.height.map { "\(w)×\($0)" } } }
        let count = store.text(size == nil ? "imagesGenerated" : "imagesGeneratedSize").replacingOccurrences(of: "{count}", with: images.count.formatted()).replacingOccurrences(of: "{size}", with: size ?? "")
        let model = images.first?.generator.map { id -> String in
            let name = String(id.split(separator: ":", maxSplits: 1).last ?? "")
            return name.hasPrefix("gpt-image-") ? "GPT Image " + name.dropFirst("gpt-image-".count) : ModelLineup.shortName(id)
        }
        return ([count, model] + [task?.duration.map { durationText($0, store: store) }]).compactMap { $0 }.joined(separator: " · ")
    }
    /// Puts the picture itself on the clipboard (Chat-States "Sao chép ảnh").
    private func copyImage(_ image: ImageAttachment) {
        guard let data = try? Attachments.data(image), let picture = NSImage(data: data) else { ToastCenter.shared.show(store.text("exportError"), key: "copy-image", error: true); return }
        NSPasteboard.general.clearContents(); NSPasteboard.general.writeObjects([picture])
        ToastCenter.shared.show(store.text("copied"), key: "copy-image")
    }
    private func saveImage(_ image: ImageAttachment) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = "image." + (image.mime == "image/jpeg" ? "jpg" : image.mime == "image/webp" ? "webp" : "png")
        panel.begin { response in guard response == .OK, let url = panel.url else { return }; Task { do { try await Task.detached { try Attachments.data(image).write(to: url, options: .atomic) }.value; announceSaved(url, store: store) } catch { let alert = NSAlert(); alert.messageText = store.text("exportError"); alert.runModal() } } }
    }

}

// `.composer`: the raised capsule (surface-raised, light rim, soft shadow). Typing
// strengthens the edge; the caret stays the main focus cue.
struct ComposerSurface: View {
    var radius: CGFloat
    var focused = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let solid = reduceTransparency || contrast == .increased
        shape.fill(solid ? chromeColor("titlebar-bg", scheme) : chromeColor("surface-raised", scheme))
            .overlay {
                if solid || focused { shape.strokeBorder(contentColor(contrast == .increased ? "text-muted" : "border-strong", scheme), lineWidth: metric("hairline")) }
                else { GlassRim(shape: shape, border: "material-highlight") }
            }
            .background { if !solid { OuterShadow(shape: shape, role: "shadow-md-color", blur: metric("shadowSmBlur") * 2 - metric("tight"), y: metric("gap")) } }
            .allowsHitTesting(false).accessibilityHidden(true)
    }
}

// `.bubble`: 18 pt corners with the tail corner (bottom trailing) tightened to 6.
struct UserBubbleShape: Shape {
    func path(in rect: CGRect) -> Path {
        let round = metric("inset") + metric("hairline") * 2, tail = metric("small") - metric("hairline") * 2
        return UnevenRoundedRectangle(topLeadingRadius: round, bottomLeadingRadius: round, bottomTrailingRadius: tail, topTrailingRadius: round, style: .continuous).path(in: rect)
    }
}

struct TranslationWorkspace: View {
    @Bindable var store: WorkbenchStore
    @State private var optionsOpen = false
    @State private var compareOpen = false
    /// Glass: the open floating layer (source, target, options, listen, compare).
    @State private var layer: String?
    var focusEpoch = 0
    @Environment(\.colorScheme) private var scheme
    private var session: Session { store.session }
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            // Review 18 language row: input ⇄ output, session model at the trailing edge.
            HStack(spacing: metric("inset")) {
                // Translate-States: the pair is locked while a request runs.
                NativeFlow(spacing: metric(glass ? "small" : "tight")) { languageControls }.disabled(glass && store.running(session.id) != nil)
                Spacer(minLength: metric("small"))
                ModelPicker(store: store, compact: true, badge: true)
            }
            // Glass Translate has no rule under the language row; Dictionary draws one under its fields.
            if !glass { Divider().padding(.bottom, metric("tight")) }
            ProviderNotice(store: store, model: session.model)
            if glass, let notice = store.resetNotice, notice.feature == session.feature {
                // Translate-States: a quiet 12 pt line — neutral dot, the notice, and a text link back.
                HStack(spacing: metric("small")) {
                    StatusDot(tone: .idle)
                    Text(store.text("resetNotice")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                    Spacer(minLength: metric("small"))
                    Button(store.text("reopenPrevious")) { store.reopenPrevious() }.modifier(NoticeLinkStyle(glass: true, accent: true)).accessibilityIdentifier("reopen-previous")
                    Button { store.dismissResetNotice() } label: { Image(systemName: "xmark").imageScale(.small) }.buttonStyle(.plain)
                        .foregroundStyle(contentColor("text-soft", scheme)).help(store.text("close")).accessibilityLabel(store.text("close"))
                }.padding(.horizontal, metric("tight")).accessibilityElement(children: .contain)
            } else if let notice = store.resetNotice, notice.feature == session.feature {
                HStack(spacing: metric("small")) {
                    Image(systemName: "sparkles").foregroundStyle(.secondary).accessibilityHidden(true)
                    Text(store.text("resetNotice")).font(.vzn("smallScale")).foregroundStyle(.secondary)
                    Spacer(minLength: metric("small"))
                    Button(store.text("reopenPrevious")) { store.reopenPrevious() }.buttonStyle(.vznOutline).accessibilityIdentifier("reopen-previous")
                    Button { store.dismissResetNotice() } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).accessibilityLabel(store.text("close"))
                }.accessibilityElement(children: .contain)
            }
            if session.feature == .dictionary { dictionaryBody } else { panels }
        }.padding(.horizontal, glass ? metric("gutter") - metric("tight") : metric("large") + metric("gap")).padding(.top, metric("gap")).padding(.bottom, metric(glass ? "gutter" : "gap") - (glass ? metric("tight") : 0))
            .onChange(of: session.id) { _, _ in optionsOpen = false; compareOpen = false; layer = nil }
            .floatingLayers($layer, trailing: { ["options", "listen", "compare"].contains($0) }) { id, width, height in layerPanel(id, width: width, height: height) }
    }
    @ViewBuilder private func layerPanel(_ id: String, width: CGFloat, height: CGFloat) -> some View {
        switch id {
        case "source":
            LanguagePickerPanel(store: store, codes: ["auto"] + nativeResources.nativeLanguages, selection: session.source,
                                choose: { store.setPair(session.id, source: $0, target: session.target); layer = nil }, dismiss: { layer = nil }, maxHeight: height)
        case "target":
            LanguagePickerPanel(store: store, codes: nativeResources.nativeLanguages, selection: session.target,
                                choose: { store.setPair(session.id, source: session.source, target: $0); layer = nil }, dismiss: { layer = nil }, maxHeight: height)
        case "options": optionsPanel
        case "listen": listenPanel
        case "compare": ComparisonPane(store: store, sessionID: session.id, maxWidth: width, maxHeight: height, close: { layer = nil })
        default: EmptyView()
        }
    }
    private func toggle(_ id: String) { layer = layer == id ? nil : id }
    // Tuỳ chọn dịch as a panel of setting rows (Overlays-Language board).
    private var optionsPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            panelHead(store.text("translationOptions"))
            CardRow(title: store.text("autoTranslate"), detail: store.text("autoTranslateHint")) {
                Toggle("", isOn: Binding(get: { store.workspace.autoTranslate ?? false }, set: { store.setAutoTranslate($0) })).toggleStyle(.switch).labelsHidden()
                    .accessibilityLabel(store.text("autoTranslate"))
            }
            if store.workspace.autoTranslate == true {
                CardRow(title: store.text("autoTranslateDelay")) {
                    Stepper(value: Binding(get: { store.workspace.autoTranslateDelay ?? 800 }, set: { store.setAutoTranslate(true, delay: $0) }), in: 100...5000, step: 100) {
                        Text(String(store.workspace.autoTranslateDelay ?? 800) + " ms").monospacedDigit()
                    }.accessibilityLabel(store.text("autoTranslateDelay"))
                }
            }
            CardRow(title: store.text("reasoning")) {
                FilterTabs(label: store.text("reasoning"), items: ["auto", "low", "medium", "high"].map { ($0, store.text("reasoning_" + $0)) },
                           selection: Binding(get: { session.reasoningEffort ?? "auto" }, set: { store.setReasoning(session.id, effort: $0) }))
            }
            CardRow(title: store.text("translationStyle")) {
                Picker(store.text("translationStyle"), selection: Binding(get: { session.translationStyle ?? "general" }, set: { store.setTranslationOptions(session.id, style: $0, mode: session.translationMode ?? "translate") })) {
                    ForEach(["general", "formal", "casual", "business", "technical", "natural"], id: \.self) { Text(store.text("style_" + $0)).tag($0) }
                }.labelsHidden().fixedSize()
            }
            CardRow(title: store.text("translationMode"), divider: false) {
                Picker(store.text("translationMode"), selection: Binding(get: { session.translationMode ?? "translate" }, set: { store.setTranslationOptions(session.id, style: session.translationStyle ?? "general", mode: $0) })) {
                    ForEach(["translate", "annotate", "phonetic", "rewrite"], id: \.self) { Text(store.text($0)).tag($0) }
                }.labelsHidden().fixedSize()
            }
        }.environment(\.cardRowInset, metric("inset")).frame(width: metric("sidebar") + metric("editor"))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("translationOptions"))
    }
    // The listen menu as a panel: read the result, stop, and the speech provider.
    // Overlays-Listen: the shared layer with the translation first, then the source text.
    private var listenSources: [ListenSource] {
        let output = (session.images ?? []).isEmpty ? session.output : ImageTranslation.text(session.output)
        // An auto-detected source reads in the language the text is in, falling back to the UI language.
        let source = session.source == "auto" ? (TextLanguage.detect(session.draft) ?? store.workspace.locale) : session.source
        return [ListenSource(id: session.id + "-result", title: store.text("result"), text: output, language: session.target),
                ListenSource(id: session.id + "-source", title: store.text("source"), text: session.draft, language: source)]
    }
    private var listenPanel: some View {
        ListenPanel(store: store, sources: listenSources) { layer = nil }
    }
    private var readingHere: Bool { store.audio.reading(listenSources) }
    private func panelHead(_ title: String) -> some View {
        HStack {
            Text(title).font(.vzn("labelScale", .semibold)).accessibilityAddTraits(.isHeader)
            Spacer(minLength: metric("small"))
            Button { layer = nil } label: { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).help(store.text("close")).accessibilityLabel(store.text("close"))
        }.padding(.leading, metric("inset")).padding(.trailing, metric("small")).frame(height: metric("navControl") + metric("small"))
    }
    private var panels: some View {
        GeometryReader { geometry in
            // Review 18 stacks the editors in its narrow (820 px) preview; two columns
            // below the reading width squeeze the footer actions until they truncate.
            let columns = geometry.size.width >= metric("reading")
            let layout = columns ? AnyLayout(HStackLayout(spacing: 0)) : AnyLayout(VStackLayout(spacing: 0))
            if glass {
                // Translate board: the source is an inset field card, the translation sits flat on the pane.
                let shape = RoundedRectangle(cornerRadius: metric("chromeCardRadius"), style: .continuous)
                // Two equal columns from the container: a wider foot (the "Reading" pill) must not
                // take width from the source pane and move both panes and the Listen layer.
                let half = columns ? max(0, (geometry.size.width - metric("inset")) / 2) : nil
                (columns ? AnyLayout(HStackLayout(spacing: metric("inset"))) : AnyLayout(VStackLayout(spacing: metric("gap")))) {
                    sourcePane.background { InsetInputSurface(radius: metric("chromeCardRadius"), baseRole: "surface") }.clipShape(shape).frame(width: half)
                    if columns { resultPane.frame(width: half) } else { resultPane.cardSurface(padded: false) }
                }
            } else {
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
    }
    @State private var termFocused = false
    @FocusState private var contextFocused: Bool
    /// Dictionary-Empty / Entry: the context line is opened from the field's own toggle.
    @State private var contextOpen = false
    // Dictionary-Empty / Entry: the lookup field is the hero (52 pt, 44 once an entry shows),
    // with the context toggle and Look up inside it; the entry reads in the 760 column below.
    private var glassDictionary: some View {
        let entryShown = !session.output.isEmpty || store.running(session.id) != nil
        return VStack(alignment: .leading, spacing: metric("gap")) {
            VStack(spacing: metric("gap")) {
                if !entryShown {
                    Text(store.text("dictionaryAsk")).font(.vzn("headingScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme))
                        .accessibilityAddTraits(.isHeader).padding(.top, metric("large")).padding(.bottom, metric("tight"))
                }
                dictionaryField(compact: entryShown)
                if contextOpen || !(session.dictionaryContext ?? "").isEmpty { dictionaryContextLine }
                if session.draft.count > 120 {
                    Text(store.text("dictionaryTermLimit")).font(.vzn("smallScale")).foregroundStyle(contentColor("danger", scheme)).frame(maxWidth: .infinity, alignment: .leading)
                } else if !entryShown {
                    HStack(spacing: metric("small")) {
                        KeyCap(text: "↩"); Text(store.text("lookup"))
                        Text("·").accessibilityHidden(true)
                        Text(store.text("dictionaryTermLimit"))
                    }.font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                }
            }.frame(maxWidth: metric("reading")).frame(maxWidth: .infinity)
            if entryShown { CardDivider().frame(maxWidth: metric("reading")).frame(maxWidth: .infinity).padding(.top, metric("tight")) }
            dictionaryResult
        }
        .onChange(of: session.id) { _, _ in contextOpen = false; contextFocused = false }
    }
    private func dictionaryField(compact: Bool) -> some View {
        let sessionID = session.id
        let invalid = session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.draft.count > 120
        let height = compact ? metric("navControl") + metric("tight") : metric("hero") + metric("tight")
        let font = NSFont.systemFont(ofSize: NSFont.systemFontSize * metric("sectionScale"))
        let hasContext = contextOpen || !(session.dictionaryContext ?? "").isEmpty
        return HStack(spacing: metric("gap")) {
            Image(systemName: "magnifyingglass").font(.vzn("subtitleScale")).foregroundStyle(contentColor("text-muted", scheme)).accessibilityHidden(true)
            ComposerEditor(text: Binding(get: { store.session(sessionID)?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("source"), font: font, focusEpoch: focusEpoch, accessibilityID: "dictionary-term", submitOnReturn: true, onFocus: { termFocused = $0 }) { if !invalid { store.submit(sessionID) } }
                .modifier(EditorPlaceholder(text: store.text("dictionaryPlaceholder"), visible: session.draft.isEmpty, font: .vzn("sectionScale"), textColor: contentColor("text-muted", scheme)))
                .frame(height: ComposerEditor.lineHeight(of: font) + metric("tight"))
            // The context toggle: tinted while the context line is open.
            Button { withAnimation(.easeOut(duration: metric("durationFast"))) { contextOpen.toggle() }; if contextOpen { contextFocused = true } } label: {
                Image(systemName: "text.quote").frame(width: metric("control"), height: metric("control"))
                    .background(Circle().fill(contentColor("action", scheme).opacity(hasContext ? metric("selectionOpacity") : 0)))
                    .foregroundStyle(contentColor(hasContext ? "action-text" : "text-muted", scheme)).contentShape(Circle())
            }.buttonStyle(.plain).help(store.text("dictionaryAddContext")).accessibilityLabel(store.text("dictionaryAddContext"))
                .accessibilityAddTraits(hasContext ? .isSelected : []).accessibilityIdentifier("dictionary-context-toggle")
            if let task = store.running(session.id) {
                Button(store.text("stop"), systemImage: "stop.fill", role: .destructive) { store.cancel(task.id) }.buttonStyle(.vznQuiet)
                    .foregroundStyle(contentColor("danger", scheme)).fixedSize()
            } else {
                Button { store.submit(session.id) } label: {
                    HStack(spacing: metric("small")) { Text(store.text("lookup")); if !invalid { KeyCap(text: "↩").accessibilityHidden(true) } }
                }.buttonStyle(.vznPrimary).fixedSize().disabled(invalid).help(store.text("lookup") + " (↩)").accessibilityIdentifier("dictionary-lookup")
            }
        }
        .padding(.leading, metric("gutter") - metric("small") + metric("hairline") * 2).padding(.trailing, metric("small"))
        .frame(height: height)
        .background { InsetInputSurface(radius: height / 2, focused: termFocused) }
    }
    // The context line under the field: caps label, the text, its count and a clear control.
    private var dictionaryContextLine: some View {
        let value = session.dictionaryContext ?? ""
        return HStack(spacing: metric("gap") - metric("hairline") * 2) {
            Text(store.text("dictionaryContextLabel").uppercased(with: Locale(identifier: store.workspace.locale))).font(.system(size: NSFont.systemFontSize * metric("captionScale") * 0.9, weight: .semibold)).foregroundStyle(contentColor("text-muted", scheme)).fixedSize()
            TextField(store.text("dictionaryContext"), text: Binding(get: { session.dictionaryContext ?? "" }, set: { setContext($0, for: session.id) }))
                .textFieldStyle(.plain).focused($contextFocused).accessibilityLabel(store.text("dictionaryContextLabel"))
            Text("\(value.count) / 500").font(.vzn("captionScale")).monospacedDigit().foregroundStyle(contentColor(value.count > 500 ? "danger" : "text-soft", scheme)).fixedSize()
            Button { setContext("", for: session.id); contextOpen = false } label: { Image(systemName: "xmark").imageScale(.small) }
                .buttonStyle(.plain).foregroundStyle(contentColor("text-muted", scheme)).help(store.text("close")).accessibilityLabel(store.text("close"))
        }
        .font(.system(size: NSFont.systemFontSize)).padding(.horizontal, metric("inset") - metric("hairline") * 2).frame(height: metric("navControl"))
        .background { InsetInputSurface(radius: metric("radius"), focused: contextFocused) }
    }
    /// Writes the context only when it really changes, and only to the session on screen. The store
    /// clears the entry on every write (BACKEND-GAPS #21), so a field echoing its value back on focus
    /// or on a session switch must not reach it.
    private func setContext(_ value: String, for id: String) {
        guard id == store.session.id, (store.session(id)?.dictionaryContext ?? "") != value else { return }
        store.setDictionaryContext(id, value)
    }
    /// The five latest finished lookups other than this one.
    private var recentLookups: [Session] {
        // Only real entries: a "not found" reply or a broken answer is not a lookup to return to.
        store.workspace.sessions.filter { $0.feature == .dictionary && $0.id != session.id && $0.archived != true && DictionaryEntry.parse($0.output) != nil }
            .sorted { ($0.updated ?? 0) > ($1.updated ?? 0) }.prefix(5).map { $0 }
    }
    /// Saved words: favourite lookups, newest first.
    private var savedLookups: [Session] {
        store.workspace.sessions.filter { $0.feature == .dictionary && $0.favorite == true && $0.archived != true && DictionaryEntry.parse($0.output) != nil }
            .sorted { ($0.updated ?? 0) > ($1.updated ?? 0) }.prefix(5).map { $0 }
    }
    private func lookupPair(_ item: Session) -> String {
        let source = item.source == "auto" ? (DictionaryEntry.parse(item.output)?.detectedSourceLang ?? "auto") : item.source
        return source.uppercased() + " → " + item.target.uppercased()
    }
    private func lookupMeaning(_ item: Session) -> String {
        guard let entry = DictionaryEntry.parse(item.output) else { return "" }
        let senses = entry.translations.map(\.text).filter { !$0.isEmpty }
        return senses.isEmpty ? entry.meaning : senses.joined(separator: "; ")
    }
    private func lookupWord(_ item: Session) -> String { DictionaryEntry.parse(item.output)?.headword ?? store.title(item) }
    // Home board vocabulary: caps label with its link on one line, then flat 48 pt rows parted by hairlines.
    private func lookupList(_ title: String, count: Int?, link: String, favorites: Bool, rows: [Session], saved: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: metric("small")) {
                Eyebrow(text: title)
                if let count { Text(String(count)).font(.vzn("captionScale")).foregroundStyle(contentColor("text-soft", scheme)) }
                Spacer(minLength: metric("small"))
                Button { NotificationCenter.default.post(name: .viezanOpenLibrary, object: favorites) } label: {
                    HStack(spacing: metric("tight")) { Text(link); Image(systemName: "arrow.right").imageScale(.small) }
                }.buttonStyle(.plain).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme))
            }.padding(.horizontal, metric("gap")).frame(height: metric("gutter") + metric("tight"))
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
                if index > 0 { CardDivider().padding(.horizontal, metric("gap")) }
                Button { store.select(item.id) } label: {
                    HStack(spacing: metric("gap")) {
                        if saved { Image(systemName: "star.fill").foregroundStyle(contentColor("warning", scheme)).accessibilityHidden(true) }
                        VStack(alignment: .leading, spacing: metric("hairline") * 2) {
                            HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                                Text(lookupWord(item)).font(.vzn("labelScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(1)
                                Text(lookupPair(item)).font(.vzn("captionScale")).foregroundStyle(contentColor("text-soft", scheme)).lineLimit(1)
                            }
                            Text(lookupMeaning(item)).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
                        }
                        Spacer(minLength: metric("small"))
                        if saved {
                            Button { store.audio.speak(lookupWord(item), language: item.source == "auto" ? (DictionaryEntry.parse(item.output)?.detectedSourceLang ?? item.target) : item.source) } label: { Image(systemName: "speaker.wave.2").imageScale(.small) }
                                .buttonStyle(.plain).foregroundStyle(contentColor("text-muted", scheme)).help(store.text("speak")).accessibilityLabel(store.text("speak") + " " + lookupWord(item))
                        } else {
                            Text(relativeTime(item.updated, store: store)).font(.vzn("captionScale")).foregroundStyle(contentColor("text-soft", scheme)).fixedSize()
                            Image(systemName: "chevron.right").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme)).accessibilityHidden(true)
                        }
                    }.padding(.horizontal, metric("gap")).frame(minHeight: metric("hero")).contentShape(Rectangle())
                }.buttonStyle(HomeRowLensStyle()).accessibilityIdentifier((saved ? "dictionary-saved-" : "dictionary-recent-") + item.id)
            }
        }.frame(maxWidth: .infinity, alignment: .topLeading)
    }
    private var dictionaryResult: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: metric("inset")) {
                if session.output.isEmpty, store.running(session.id) != nil {
                    // Dictionary-Redesign-States: the headword appears at once with a live chip and placeholder lines.
                    VStack(alignment: .leading, spacing: metric("gap")) {
                        HStack(spacing: metric("gap")) {
                            Text(session.draft.trimmingCharacters(in: .whitespacesAndNewlines)).font(.system(size: NSFont.systemFontSize * metric("displayScale") + metric("tight") / 2, weight: .semibold)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(1)
                            StatusBadge(text: store.text("lookingUp"), tone: .busy)
                        }
                        ForEach([0.36, 1.0, 0.84, 0.48], id: \.self) { fraction in
                            GeometryReader { proxy in
                                RoundedRectangle(cornerRadius: metric("tight")).fill(contentColor("surface-muted", scheme)).frame(width: proxy.size.width * fraction)
                            }.frame(height: metric("small") + metric("hairline") * 2)
                        }
                    }.padding(.top, metric("small")).accessibilityElement(children: .combine).accessibilityLabel(store.text("lookingUp"))
                } else if session.output.isEmpty {
                    // Dictionary-Empty: recent lookups and saved words side by side; one column when narrow.
                    if recentLookups.isEmpty != savedLookups.isEmpty {
                        // Only one of the two lists has rows: it takes the whole column.
                        lookupList(store.text(recentLookups.isEmpty ? "savedWords" : "recentLookups"), count: recentLookups.isEmpty ? savedLookups.count : nil,
                                   link: store.text(recentLookups.isEmpty ? "openLibrary" : "allHistory"), favorites: recentLookups.isEmpty,
                                   rows: recentLookups.isEmpty ? savedLookups : recentLookups, saved: recentLookups.isEmpty).padding(.top, metric("large") - metric("small"))
                    } else if !recentLookups.isEmpty {
                        ViewThatFits(in: .horizontal) {
                            HStack(alignment: .top, spacing: metric("gutter")) {
                                lookupList(store.text("recentLookups"), count: nil, link: store.text("allHistory"), favorites: false, rows: recentLookups, saved: false).frame(minWidth: metric("sidebar") + metric("large") * 2)
                                lookupList(store.text("savedWords"), count: savedLookups.count, link: store.text("openLibrary"), favorites: true, rows: savedLookups, saved: true).frame(minWidth: metric("sidebar") + metric("large") * 2)
                            }
                            lookupList(store.text("recentLookups"), count: nil, link: store.text("allHistory"), favorites: false, rows: recentLookups.isEmpty ? savedLookups : recentLookups, saved: recentLookups.isEmpty)
                        }.padding(.top, metric("large") - metric("small"))
                    }
                } else if let entry = DictionaryEntry.parse(session.output) {
                    DictionaryResultView(entry: entry, store: store)
                } else if store.running(session.id) == nil, let missing = DictionaryEntry.notFound(session.output) {
                    notFound(missing)
                } else {
                    ForEach(Array(DictionaryEntry.preview(session.output).enumerated()), id: \.offset) { _, value in Text(value).textSelection(.enabled) }
                }
                if DictionaryEntry.notFound(session.output) == nil { failure }
            }.frame(maxWidth: metric("reading"), alignment: .leading)
                .frame(maxWidth: .infinity).padding(.vertical, metric("inset"))
        }.frame(maxHeight: .infinity)
    }
    // Dictionary-Redesign-States "Không tìm thấy": the term muted with a warm chip, then three ways
    // out: the closest forms (the first is the lens, ↩), translate it as a phrase, or ask AI.
    private func notFound(_ missing: DictionaryEntry.NotFound) -> some View {
        let term = session.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let language = store.text("lang_" + (session.source == "auto" ? session.target : session.source))
        return VStack(alignment: .leading, spacing: metric("gap")) {
            HStack(spacing: metric("gap")) {
                Text(term).font(.system(size: NSFont.systemFontSize * metric("displayScale") + metric("tight") / 2, weight: .semibold)).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
                StatusBadge(text: store.text("dictionaryNotFound"), tone: .warning)
            }
            Text(store.text(missing.suggestions.isEmpty ? "dictionaryNotFoundNone" : "dictionaryNotFoundHint").replacingOccurrences(of: "{language}", with: language))
                .font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme))
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(missing.suggestions.enumerated()), id: \.offset) { index, item in
                    Button { store.setDraft(session.id, item.word); store.submit(session.id) } label: {
                        HStack(spacing: metric("small")) {
                            Text(item.word).font(.vzn("labelScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme))
                            Text([item.partOfSpeech, item.meaning].compactMap { $0 }.map { "· " + $0 }.joined(separator: " ")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
                            Spacer(minLength: metric("small"))
                            if index == 0 { KeyCap(text: "↩").accessibilityHidden(true) }
                        }.padding(.horizontal, metric("gap")).frame(minHeight: metric("hero")).contentShape(Rectangle())
                    }.buttonStyle(HomeRowLensStyle()).keyboardShortcut(index == 0 ? .defaultAction : nil)
                        .background { if index == 0 { GlassLens(radius: metric("radius")) } }
                        .accessibilityLabel(store.text("lookup") + " " + item.word).accessibilityIdentifier("dictionary-suggestion-\(index)")
                }
            }
            HStack(spacing: metric("small")) {
                Button(store.text("dictionaryTranslatePhrase").replacingOccurrences(of: "{term}", with: term), systemImage: Feature.translate.symbol) {
                    let id = store.createDetachedSession(feature: .translate, draft: term); store.select(id); NotificationCenter.default.post(name: .viezanOpenRoute, object: "translate")
                }.buttonStyle(.vznOutline)
                Button(store.text("dictionaryAskAI"), systemImage: "bubble.left") {
                    let id = store.createDetachedSession(feature: .chat, draft: term); store.select(id); NotificationCenter.default.post(name: .viezanOpenRoute, object: "chat")
                }.buttonStyle(.vznOutline)
            }.padding(.top, metric("tight"))
        }.padding(.top, metric("small"))
    }
    @ViewBuilder private var dictionaryBody: some View {
        if glass { glassDictionary } else { classicDictionary }
    }
    private var classicDictionary: some View {
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
            // Context is a bounded field like the term above it, not a bare line of text.
            TextField(store.text("dictionaryContext"), text: Binding(get: { session.dictionaryContext ?? "" }, set: { setContext($0, for: session.id) }))
                .textFieldStyle(.plain).font(.vzn("labelScale")).padding(.horizontal, metric("gap")).frame(height: metric("control"))
                .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
            if session.draft.count > 120 { Text(store.text("dictionaryTermLimit")).font(.vzn("smallScale")).foregroundStyle(contentColor("danger", scheme)) }
            ScrollView {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    if session.output.isEmpty {
                        // Centered like the Chat/Interpretation empty states, not a stray left-aligned line.
                        VStack(spacing: metric("small")) {
                            Image(systemName: "book.closed").font(.vzn("headingScale", .semibold)).accessibilityHidden(true)
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
                TaskStatusText(store: store, task: task)
                Button(store.text("retry")) { store.retry(task.id) }.disabled(!store.canRetry(task))
            }
        }
    }
    @ViewBuilder private var languageControls: some View {
        if glass {
            LanguagePill(store: store, role: store.text("inputLanguage"), code: session.source, open: layer == "source") { toggle("source") }.layerAnchor("source")
            // Swapping needs a known source; with auto-detect the button waits, like Interpretation.
            Button { store.setPair(session.id, source: session.target, target: session.source) } label: { Image(systemName: "arrow.left.arrow.right").foregroundStyle(contentColor("text-muted", scheme)) }
                .buttonStyle(.vznOutline).disabled(session.source == "auto").help(store.text("swap")).accessibilityLabel(store.text("swap"))
            LanguagePill(store: store, role: store.text("outputLanguage"), code: session.target, open: layer == "target") { toggle("target") }.layerAnchor("target")
        } else { classicLanguageControls }
    }
    private var classicLanguageControls: some View {
        Group {
            LanguageMenu(store: store, label: store.text("inputLanguage"), codes: ["auto"] + nativeResources.nativeLanguages, selection: session.source) { value in
                store.setPair(session.id, source: value, target: session.target)
            }
            // Swapping needs a known source; with auto-detect the button waits, like Interpretation.
            Button { store.setPair(session.id, source: session.target, target: session.source) } label: { Image(systemName: "arrow.left.arrow.right").foregroundStyle(contentColor("text-muted", scheme)) }
                .buttonStyle(.vznQuiet).controlSize(.large).disabled(session.source == "auto").help(store.text("swap")).accessibilityLabel(store.text("swap"))
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
            Text(title).font(.system(size: NSFont.systemFontSize, weight: glass ? .semibold : .bold)).accessibilityAddTraits(.isHeader)
            Spacer(minLength: metric("small"))
            trailing()
        }.frame(height: metric("control")).padding(.horizontal, metric("inset")).padding(.vertical, metric("tight"))
    }
    private var sourcePane: some View {
        let sessionID = session.id
        return VStack(alignment: .leading, spacing: 0) {
            paneHeader(store.text("source")) {
                Text(store.text("lang_" + session.source)).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
            }
            AttachmentChips(store: store).padding(.horizontal, metric("inset"))
            ComposerEditor(text: Binding(get: { store.session(sessionID)?.draft ?? "" }, set: { store.setDraft(sessionID, $0) }), identity: sessionID, label: store.text("source"), font: readingNSFont(store), focusEpoch: focusEpoch, accessibilityID: "translation-source", pasteImages: { urls, data in ImageIntake.attach(urls: urls, data: data, to: sessionID, store: store) }) { store.submit(sessionID) }
                .modifier(EditorPlaceholder(text: store.text("sourcePlaceholder"), visible: session.draft.isEmpty))
                // Same top inset as the result column so both texts start on one line.
                .padding(.horizontal, metric("small")).padding(.top, metric("small"))
            Divider()
            HStack(spacing: metric("small")) {
                ImageControls(store: store, compact: true, acceptsHeaderRequest: true, statusOnly: true)
                AudioControls(store: store, compact: true)
                // Length at a glance; past the provider-safe limit the count turns into the warning.
                let count = session.draft.count
                Text(count > TranslationWorkspace.sourceLimit ? store.text("sourceTooLong") : store.text("charCount").replacingOccurrences(of: "{count}", with: count.formatted()))
                    .font(.vzn("smallScale", glass && count > TranslationWorkspace.sourceLimit ? .semibold : .regular)).foregroundStyle(count > TranslationWorkspace.sourceLimit ? contentColor("danger", scheme) : contentColor("text-muted", scheme)).lineLimit(1)
                    .accessibilityIdentifier("translation-char-count")
                if !session.draft.isEmpty, store.running(session.id) == nil {
                    // Translate board: "× Xoá" — the glyph with its word, as a small quiet action.
                    Button { store.setDraft(sessionID, "") } label: {
                        if glass { Label(store.text("clearSource"), systemImage: "xmark").font(.vzn("smallScale")) } else { Image(systemName: "xmark.circle") }
                    }
                        .buttonStyle(.vznQuiet).fixedSize().help(store.text("clearSource")).accessibilityLabel(store.text("clearSource")).accessibilityIdentifier("translation-clear")
                }
                Spacer(minLength: metric("small"))
                if let task = store.running(session.id) {
                    // Glass: Stop reads in danger as a quiet action in the footer.
                    Button(store.text("stop"), systemImage: "stop.fill", role: .destructive) { store.cancel(task.id) }
                        .buttonStyle(glass ? AnyButtonStyle(.vznQuiet) : AnyButtonStyle(.vznOutline)).foregroundStyle(glass ? contentColor("danger", scheme) : .primary)
                } else if glass {
                    // The primary carries its shortcut inside the control (`.kbd` on the button).
                    Button { store.submit(session.id) } label: {
                        HStack(spacing: metric("small")) { Text(store.text("translateText")); KeyCap(text: "⌘↩").accessibilityHidden(true) }
                    }.buttonStyle(.vznPrimary).fixedSize()
                        .disabled((session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (session.images ?? []).isEmpty) || session.draft.count > Self.sourceLimit)
                        .help(session.draft.count > Self.sourceLimit ? store.text("sourceTooLong") : store.text("translate") + " (⌘↩)").accessibilityLabel(store.text("translateText"))
                } else {
                    Button(store.text("translateText"), systemImage: Feature.translate.symbol) { store.submit(session.id) }.buttonStyle(.vznPrimary).fixedSize()
                        .disabled((session.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (session.images ?? []).isEmpty) || session.draft.count > Self.sourceLimit)
                        .help(session.draft.count > Self.sourceLimit ? store.text("sourceTooLong") : store.text("translate") + " (⌘↩)")
                }
            }.controlSize(.large).frame(height: metric("control")).padding(metric("small"))
            AudioStatus(store: store).padding(.horizontal, metric("small"))
        }.modifier(ImageDropTarget(store: store, sessionID: sessionID, radius: 0))
    }
    /// Characters a single translation request handles well; longer text is split by the user.
    static let sourceLimit = WorkbenchStore.translateLimit
    // The result becomes the next source, read the other way round (Electron's "use as source").
    private func useResultAsSource() {
        let id = session.id, text = session.output
        store.setPair(id, source: session.target, target: session.source == "auto" ? store.workspace.locale : session.source)
        store.setDraft(id, text)
    }
    private var resultPane: some View {
        VStack(alignment: .leading, spacing: 0) {
            paneHeader(store.text("result")) {
                if glass {
                    Button { toggle("options") } label: {
                        HStack(spacing: metric("small") - metric("hairline") * 2) {
                            Text(store.text("style_" + (session.translationStyle ?? "general")))
                            Image(systemName: "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme))
                        }
                    }.buttonStyle(.vznOutline).fixedSize().layerAnchor("options")
                        .help(store.text("translationOptions")).accessibilityLabel(store.text("translationOptions"))
                } else {
                Button { optionsOpen.toggle() } label: {
                    Label(store.text("style_" + (session.translationStyle ?? "general")), systemImage: "chevron.down").labelStyle(ModelMenuLabelStyle())
                }.buttonStyle(.vznQuiet).tint(.primary).foregroundStyle(.primary).help(store.text("translationOptions")).accessibilityLabel(store.text("translationOptions"))
                    .popover(isPresented: $optionsOpen) {
                        ScrollView {
                            VStack(alignment: .leading, spacing: metric("inset")) {
                                Text(store.text("translationOptions")).font(.vzn("labelScale", .semibold))
                                translationOptions
                            }.padding(metric("inset"))
                        }.frame(width: metric("sidebar") + metric("editor"))
                    }
                }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: metric("inset")) {
                    if let image = session.images?.first {
                        ImageTranslationView(store: store, image: image, output: session.output, complete: store.workspace.tasks.first(where: { $0.request.sessionID == session.id && $0.request.revision == session.revision })?.status == .succeeded, resultImage: session.messages.last(where: { $0.role == "assistant" })?.images?.first)
                    } else if glass, session.output.isEmpty, store.running(session.id) != nil {
                        // Translate-States: a live chip and three placeholder lines until text streams in.
                        VStack(alignment: .leading, spacing: metric("gap") - metric("hairline") * 2) {
                            StatusBadge(text: store.text("translating") + "…", tone: .busy)
                            ForEach([1.0, 0.92, 0.64], id: \.self) { fraction in
                                GeometryReader { proxy in
                                    RoundedRectangle(cornerRadius: metric("tight")).fill(contentColor("surface-muted", scheme)).frame(width: proxy.size.width * fraction)
                                }.frame(height: metric("small") + metric("hairline") * 2)
                            }
                        }.accessibilityElement(children: .combine).accessibilityLabel(store.text("translating"))
                    } else if session.output.isEmpty { Text(store.text(store.running(session.id) == nil ? "emptyResult" : "running")).foregroundStyle(glass ? contentColor("text-soft", scheme) : .secondary) }
                    else { Text(session.output).font(readingFont(store)).textSelection(.enabled) }
                    failure
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            }.frame(maxHeight: .infinity)
            Divider()
            HStack(spacing: metric("small")) {
                if !glass, store.running(session.id) != nil { ProgressView().controlSize(.small); Text(store.text("running")).font(.vzn("smallScale")) }
                // The output language never truncates ("Tiến…"); the quiet actions give way first.
                else { Text(store.text("lang_" + session.target)).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1).fixedSize().layoutPriority(1) }
                if !glass { Spacer(minLength: metric("small")) }
                if (session.images ?? []).isEmpty, !session.output.isEmpty, store.running(session.id) == nil {
                    if glass {
                        // The labelled action folds to its icon when the foot is short of room (the wider
                        // "Reading" pill), so the foot never grows past its pane and shifts the page.
                        ViewThatFits(in: .horizontal) {
                            Button(store.text("useAsSource"), systemImage: "arrow.left") { useResultAsSource() }.buttonStyle(.vznQuiet).fixedSize()
                            Button { useResultAsSource() } label: { Image(systemName: "arrow.left") }.buttonStyle(.vznQuiet).fixedSize()
                                .accessibilityLabel(store.text("useAsSource"))
                        }.help(store.text("useAsSource")).accessibilityIdentifier("translation-use-as-source")
                    } else {
                    Button { useResultAsSource() } label: { Image(systemName: "arrow.left") }
                        .buttonStyle(.vznQuiet).help(store.text("useAsSource")).accessibilityLabel(store.text("useAsSource")).accessibilityIdentifier("translation-use-as-source")
                    }
                }
                if glass { Spacer(minLength: metric("small")) }
                if glass {
                    if (session.images ?? []).isEmpty {
                        Button(store.text("compare"), systemImage: "rectangle.split.2x1") { toggle("compare") }.buttonStyle(.vznOutline).fixedSize().layerAnchor("compare")
                            .disabled(store.running(session.id) != nil)
                    }
                    // Overlays-Listen: while this page reads, the speaker is a "Reading" pill that stops on click.
                    Button { if readingHere { store.audio.stopSpeaking() } else { toggle("listen") } } label: {
                        if readingHere {
                            HStack(spacing: metric("small") - metric("hairline") * 2) { ReadingWave(color: contentColor("action-text", scheme)); Text(store.text("readingNow")).fontWeight(.semibold) }
                                .foregroundStyle(contentColor("action-text", scheme))
                        } else { Image(systemName: "speaker.wave.2") }
                    }.buttonStyle(.vznOutline).fixedSize().layerAnchor("listen")
                        .disabled(session.output.isEmpty && session.draft.isEmpty && !readingHere)
                        .help(readingHere ? store.text("stopSpeaking") : store.text("listen"))
                        .accessibilityLabel(readingHere ? store.text("readingNow") + ", " + store.text("stopSpeaking") : store.text("listen"))
                        .accessibilityAddTraits(readingHere ? .isSelected : [])
                } else if (session.images ?? []).isEmpty {
                    Button(store.text("compare")) { compareOpen.toggle() }.buttonStyle(.vznOutline).fixedSize()
                        .popover(isPresented: $compareOpen) {
                            ScrollView { ComparisonPane(store: store, sessionID: session.id).padding(metric("inset")) }
                                .frame(width: metric("sidebar") + metric("editor"), height: metric("editor") * 3)
                        }
                }
                if !glass {
                Menu { AudioControls.speechMenu(store) } label: { Image(systemName: "speaker.wave.2") }
                    .menuStyle(.button).buttonStyle(.vznQuiet).menuIndicator(.hidden).fixedSize().tint(.primary)
                    .disabled(session.output.isEmpty).help(store.text("listen")).accessibilityLabel(store.text("listen"))
                }
                Button { copyText((session.images ?? []).isEmpty ? session.output : ImageTranslation.text(session.output), store: store) } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.vznOutline).disabled(session.output.isEmpty).help(store.text("copy")).accessibilityLabel(store.text("copy"))
            }.controlSize(.large).frame(height: metric("control")).padding(metric("small"))
        }
    }
}

extension Notification.Name {
    /// Dictionary-Empty links: open the history library (object: true for saved words).
    static let viezanOpenLibrary = Notification.Name("viezan.openLibrary")
}

// A flat list row that turns into a lens on hover or press (Home and Dictionary lists).
struct HomeRowLensStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { HomeRowLensBody(configuration: configuration) }
}
private struct HomeRowLensBody: View {
    var configuration: ButtonStyleConfiguration
    @State private var hovered = false
    var body: some View {
        configuration.label
            .background { if hovered || configuration.isPressed { GlassLens(radius: metric("radius")) } }
            .onHover { hovered = $0 }
    }
}

// NSTextView has no placeholder; draw one beneath the caret while empty.
struct EditorPlaceholder: ViewModifier {
    var text: String
    var visible: Bool
    var font: Font = .body
    /// Where the editor draws its first line, so the placeholder sits exactly under the caret.
    var leadingInset: CGFloat = metric("small")
    var topInset: CGFloat = metric("tight") / 2
    var textColor: Color? = nil
    func body(content: Content) -> some View {
        content.overlay(alignment: .topLeading) {
            if visible {
                Text(text).font(font).foregroundStyle(textColor.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.tertiary)).padding(.leading, leadingInset).padding(.top, topInset)
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
    /// Grow to this many lines, then scroll inside (chat composer); nil keeps the `editor` height cap.
    var maxLines: Int? = nil
    /// How many lines the text wraps to at the current width, for layouts that change shape at two.
    var onLines: ((Int) -> Void)? = nil
    var onFocus: ((Bool) -> Void)? = nil
    /// Pasted images (file URLs or bitmap data) go here instead of into the text.
    var pasteImages: (([URL], [Data]) -> Void)? = nil
    var submit: () -> Void
    private var lineHeight: CGFloat { Self.lineHeight(of: font) }
    static func lineHeight(of font: NSFont) -> CGFloat { ceil(font.ascender - font.descender + font.leading) }
    /// Line-capped editors centre a single line in one control height; the inset is symmetric, so
    /// every further line adds exactly one line height.
    static func verticalInset(for font: NSFont) -> CGFloat { max(0, ((metric("control") + metric("tight") - lineHeight(of: font)) / 2).rounded()) }
    static var caretLeading: CGFloat { metric("tight") + metric("hairline") }
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
        guard growsWithContent else { return nil }
        let width = proposal.width ?? metric("reading")
        let inset = (nsView.documentView as? NSTextView)?.textContainerInset ?? .zero
        let padding = (nsView.documentView as? NSTextView)?.textContainer?.lineFragmentPadding ?? 0
        let available = max(metric("control"), width - inset.width * 2 - padding * 2)
        let measured = ((text.isEmpty ? " " : text) as NSString).boundingRect(with: NSSize(width: available, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font]).height
        let fit = Self.fit(measured: measured, lineHeight: lineHeight, insetHeight: inset.height, maxLines: maxLines)
        // A rounding slip must never show a scroller on a one-line draft: it exists only past the cap.
        if let maxLines { let scrolls = fit.lines > maxLines; if nsView.hasVerticalScroller != scrolls { nsView.hasVerticalScroller = scrolls } }
        if let onLines, context.coordinator.lines != fit.lines {
            context.coordinator.lines = fit.lines
            DispatchQueue.main.async { onLines(fit.lines) }
        }
        return CGSize(width: width, height: fit.height)
    }
    /// Height for a measured text block: one control row at least, `maxLines` lines at most (else the
    /// `editor` cap), plus the container insets; and how many lines the text wraps to.
    static func fit(measured: CGFloat, lineHeight: CGFloat, insetHeight: CGFloat, maxLines: Int?) -> (height: CGFloat, lines: Int) {
        let lines = max(1, Int((measured / lineHeight).rounded()))
        let chrome = insetHeight * 2 + (maxLines == nil ? metric("small") : 0)
        let cap = maxLines.map { lineHeight * CGFloat($0) + chrome } ?? metric("editor")
        return (min(cap, max(metric("control") + metric("tight"), ceil(measured) + chrome)), lines)
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
        if maxLines != nil { editor.textContainerInset = NSSize(width: 0, height: Self.verticalInset(for: font)) }
        editor.delegate = context.coordinator; editor.submit = submit; editor.submitOnReturn = submitOnReturn; editor.pasteImages = pasteImages
        editor.focusChanged = { [weak coordinator = context.coordinator] focused in
            DispatchQueue.main.async { coordinator?.parent.onFocus?(focused) }
        }
        editor.setAccessibilityLabel(label); editor.setAccessibilityIdentifier(accessibilityID)
        scroll.documentView = editor; scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true; scroll.drawsBackground = false
        // Past the line cap the composer scrolls with a thin overlay scroller, whatever the system setting.
        scroll.scrollerStyle = .overlay
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
        if maxLines != nil { let inset = NSSize(width: 0, height: Self.verticalInset(for: font)); if editor.textContainerInset != inset { editor.textContainerInset = inset } }
        editor.submit = submit; editor.pasteImages = pasteImages; editor.setAccessibilityLabel(label)
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
        var lines = 0
        var parent: ComposerEditor
        init(_ parent: ComposerEditor) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let editor = notification.object as? NSTextView else { return }
            parent.text = editor.string
        }
    }
    class CommandTextView: NSTextView {
        private let sessionUndoManager = UndoManager()
        var focusChanged: ((Bool) -> Void)?
        override func becomeFirstResponder() -> Bool {
            let accepted = super.becomeFirstResponder()
            if accepted { focusChanged?(true) }
            return accepted
        }
        override func resignFirstResponder() -> Bool {
            let accepted = super.resignFirstResponder()
            if accepted { focusChanged?(false) }
            return accepted
        }
        override var undoManager: UndoManager? { sessionUndoManager }
        @objc func undo(_ sender: Any?) { sessionUndoManager.undo() }
        @objc func redo(_ sender: Any?) { sessionUndoManager.redo() }
        override func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
            if menuItem.action == #selector(undo(_:)) { return sessionUndoManager.canUndo }
            if menuItem.action == #selector(redo(_:)) { return sessionUndoManager.canRedo }
            // A plain-text view would disable Paste for an image-only pasteboard; the composer accepts it.
            if menuItem.action == #selector(paste(_:)), pasteImages != nil, Self.imagePayload(NSPasteboard.general) != nil { return true }
            return super.validateMenuItem(menuItem)
        }
        override func validateUserInterfaceItem(_ item: NSValidatedUserInterfaceItem) -> Bool {
            if item.action == #selector(undo(_:)) { return sessionUndoManager.canUndo }
            if item.action == #selector(redo(_:)) { return sessionUndoManager.canRedo }
            if item.action == #selector(paste(_:)), pasteImages != nil, Self.imagePayload(NSPasteboard.general) != nil { return true }
            return super.validateUserInterfaceItem(item)
        }
        /// Image files or a bitmap on a pasteboard; nil when it carries text (text wins for a web selection).
        static func imagePayload(_ board: NSPasteboard) -> (urls: [URL], data: [Data])? {
            let urls = (board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true, .urlReadingContentsConformToTypes: [UTType.image.identifier]]) as? [URL]) ?? []
            if !urls.isEmpty { return (urls, []) }
            guard board.string(forType: .string) == nil, let image = (board.readObjects(forClasses: [NSImage.self], options: nil) as? [NSImage])?.first,
                  let tiff = image.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else { return nil }
            return ([], [png])
        }
        // Dropping onto the text itself: images attach instead of pasting a file path.
        override func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
            if pasteImages != nil, Self.imagePayload(sender.draggingPasteboard) != nil { return .copy }
            return super.draggingEntered(sender)
        }
        override func draggingUpdated(_ sender: any NSDraggingInfo) -> NSDragOperation {
            if pasteImages != nil, Self.imagePayload(sender.draggingPasteboard) != nil { return .copy }
            return super.draggingUpdated(sender)
        }
        override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
            if let pasteImages, let payload = Self.imagePayload(sender.draggingPasteboard) { pasteImages(payload.urls, payload.data); return true }
            return super.performDragOperation(sender)
        }
        var submit: (() -> Void)?
        var submitOnReturn = false
        var pasteImages: (([URL], [Data]) -> Void)?
        // ⌘V with an image on the pasteboard attaches it; text pastes as before.
        override func paste(_ sender: Any?) {
            if let pasteImages, let payload = Self.imagePayload(NSPasteboard.general) { pasteImages(payload.urls, payload.data); return }
            super.paste(sender)
        }
        override func keyDown(with event: NSEvent) {
            let plainReturn = submitOnReturn && !event.modifierFlags.contains(.shift)
            if [36, 76].contains(event.keyCode), event.modifierFlags.contains(.command) || plainReturn, !hasMarkedText() { submit?() }
            else { super.keyDown(with: event) }
        }
    }
}

struct AudioControls: View {
    @Bindable var store: WorkbenchStore
    @Environment(\.colorScheme) private var scheme
    // Compact: icon record/stop only; speech output lives in the options menu.
    var compact = false
    var glassChat = false
    var body: some View {
        if compact {
            HStack(spacing: metric("tight")) {
                if store.audio.recordingOwner != nil {
                    Button { store.stopRecording() } label: { Image(systemName: "stop.circle.fill").foregroundStyle(contentColor("danger", scheme)) }
                        .help(store.text("stopRecording")).accessibilityLabel(store.text("stopRecording"))
                } else {
                    Button { Task { await store.startRecording() } } label: { Image(systemName: glassChat ? "waveform" : "mic") }
                        .disabled(store.audio.transcribingOwner != nil || store.audio.permissionPending)
                        .help(store.text("record")).accessibilityLabel(store.text("record"))
                }
                if store.audio.transcribingOwner != nil {
                    ProgressView().controlSize(.small).accessibilityLabel(store.text("running"))
                    Button { store.audio.cancel() } label: { Image(systemName: "xmark.circle") }.help(store.text("stop")).accessibilityLabel(store.text("stop"))
                }
            }.buttonStyle(VznButtonStyle(kind: .quiet, allowsGlass: !glassChat))
        } else { full }
    }
    private var full: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            ViewThatFits(in: .horizontal) {
                HStack { actions }
                VStack(alignment: .leading, spacing: metric("small")) { actions }
            }
            if let error = store.audio.error { Text(store.text(error)).font(.vzn("captionScale")).foregroundStyle(.secondary) }
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
                    .menuStyle(.button).buttonStyle(.vznQuiet).fixedSize().accessibilityLabel(store.text("speechProvider")).tint(.primary)

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
                if let error = store.audio.error { Text(store.text(error)).font(.vzn("captionScale")).foregroundStyle(.secondary) }
                if store.pendingTranscript != nil { Button(store.text("insertTranscript")) { store.usePendingTranscript() }.controlSize(.small) }
            }
        }
    }
}

// MARK: - Glass floating layers inside a workspace (Liquid Glass 2.0)
// Language pickers, translation options, the listen menu and model comparison open
// as `.float` panels anchored to their control, like the shell's ModelPanel: the
// same reading surface, outside click and Escape close them, and the panel flips
// above its control when there is more room there.

struct LayerAnchorKey: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] { [:] }
    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) { value.merge(nextValue()) { $1 } }
}

extension View {
    /// Names this control as the anchor of floating layer `id`.
    func layerAnchor(_ id: String) -> some View { anchorPreference(key: LayerAnchorKey.self, value: .bounds) { [id: $0] } }
    /// Hosts the open layer: `panel(id, maxWidth, maxHeight)` sizes itself within the room it is given.
    func floatingLayers<Panel: View>(_ open: Binding<String?>, trailing: @escaping (String) -> Bool = { _ in false },
                                     @ViewBuilder panel: @escaping (String, CGFloat, CGFloat) -> Panel) -> some View {
        modifier(FloatingLayers(open: open, trailing: trailing, panel: panel))
    }
}

struct FloatingLayers<Panel: View>: ViewModifier {
    @Binding var open: String?
    var trailing: (String) -> Bool
    var panel: (String, CGFloat, CGFloat) -> Panel
    func body(content: Content) -> some View {
        content
            .overlayPreferenceValue(LayerAnchorKey.self) { anchors in
                GeometryReader { proxy in
                    if let id = open, let anchor = anchors[id] {
                        let rect = proxy[anchor], margin = metric("small")
                        let below = max(0, proxy.size.height - rect.maxY - margin * 2)
                        let above = max(0, rect.minY - margin * 2)
                        let down = below >= above
                        let room = down ? below : above
                        let alignedTrailing = trailing(id)
                        let width = max(metric("control"), alignedTrailing ? rect.maxX - margin : proxy.size.width - rect.minX - margin)
                        ZStack(alignment: .topLeading) {
                            // Deliberate hit surface: an outside click closes the layer.
                            Button { open = nil } label: { Color.clear.contentShape(Rectangle()) }
                                .buttonStyle(.plain).focusable(false).accessibilityHidden(true)
                            panel(id, width, room)
                                .frame(maxHeight: room).fixedSize(horizontal: true, vertical: true)
                                .background { ReadingPanelSurface() }
                                .onExitCommand { open = nil }
                                .frame(width: width, alignment: alignedTrailing ? .trailing : .leading)
                                .frame(height: room, alignment: down ? .top : .bottom)
                                .offset(x: alignedTrailing ? margin : rect.minX, y: down ? rect.maxY + margin : rect.minY - margin - room)
                        }
                    }
                }
            }
    }
}

// `Đầu vào · Tiếng Anh ▾`: the role, the language and a chevron on a 32 pt glass pill.
struct LanguagePill: View {
    let store: WorkbenchStore
    var role: String
    var code: String
    var open = false
    var action: () -> Void
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Button(action: action) {
            HStack(spacing: metric("small") - metric("hairline") * 2) {
                Text(role).foregroundStyle(contentColor("text-muted", scheme))
                Text(store.text("lang_" + code)).fontWeight(.semibold).foregroundStyle(contentColor("text-strong", scheme))
                Image(systemName: "chevron.down").imageScale(.small).foregroundStyle(contentColor("text-soft", scheme)).accessibilityHidden(true)
            }.font(.system(size: NSFont.systemFontSize)).lineLimit(1)
        }.buttonStyle(.vznOutline).fixedSize()
            .accessibilityLabel(role + ": " + store.text("lang_" + code)).accessibilityValue(open ? store.text("selected") : "")
    }
}

/// Languages the person used most recently (sources and targets of recent sessions).
@MainActor func recentLanguages(_ store: WorkbenchStore, limit: Int = 3) -> [String] {
    var seen: [String] = []
    for item in store.workspace.sessions.sorted(by: { ($0.updated ?? 0) > ($1.updated ?? 0) }) {
        for code in [item.target, item.source] where code != "auto" && !seen.contains(code) && nativeResources.nativeLanguages.contains(code) { seen.append(code) }
        if seen.count >= limit { break }
    }
    return Array(seen.prefix(limit))
}

// Searchable language list (Overlays-Language board): Auto-detect for an input, Recent,
// then All; the trailing detail is the language's own name. ↑↓ move, Return picks.
struct LanguagePickerPanel: View {
    let store: WorkbenchStore
    var codes: [String]
    var selection: String
    var choose: (String) -> Void
    var dismiss: () -> Void
    var maxHeight: CGFloat
    @State private var query = ""
    @State private var highlighted: String?
    private func name(_ code: String) -> String { store.text("lang_" + code) }
    private func endonym(_ code: String) -> String {
        guard code != "auto" else { return "" }
        let own = Locale(identifier: code).localizedString(forIdentifier: code)?.capitalized(with: Locale(identifier: code)) ?? ""
        // When the UI already speaks the language, its English name tells more.
        return own == name(code) ? (Locale(identifier: "en").localizedString(forIdentifier: code) ?? "") : own
    }
    private func matches(_ code: String) -> Bool {
        let needle = query.trimmingCharacters(in: .whitespaces)
        guard !needle.isEmpty else { return true }
        return [name(code), endonym(code), code].contains { $0.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
    }
    private var groups: [(String?, [String])] {
        let all = codes.filter { $0 != "auto" && matches($0) }.sorted { name($0).localizedStandardCompare(name($1)) == .orderedAscending }
        guard query.trimmingCharacters(in: .whitespaces).isEmpty else { return [(nil, (codes.contains("auto") && matches("auto") ? ["auto"] : []) + all)] }
        let recent = recentLanguages(store).filter(codes.contains)
        return [(nil, codes.contains("auto") ? ["auto"] : []), (store.text("recentWork"), recent), (store.text("filterAll"), all.filter { !recent.contains($0) })].filter { !$0.1.isEmpty }
    }
    private var flat: [String] { groups.flatMap(\.1) }
    private func move(_ offset: Int) {
        let list = flat
        guard !list.isEmpty else { return }
        let index = highlighted.flatMap(list.firstIndex) ?? (offset > 0 ? -1 : list.count)
        highlighted = list[min(max(index + offset, 0), list.count - 1)]
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            SearchBox(query: $query, label: store.text("languageSearch"), move: move, submit: { if let code = highlighted ?? flat.first { choose(code) } }, cancel: dismiss)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if flat.isEmpty { Text(store.text("noModelMatch")).foregroundStyle(.secondary).padding(metric("small")) }
                        ForEach(groups, id: \.1) { title, items in
                            if let title { Eyebrow(text: title).padding(.horizontal, metric("small")).padding(.top, metric("gap")).padding(.bottom, metric("tight")) }
                            ForEach(items, id: \.self) { code in
                                PanelRow(title: name(code), detail: endonym(code), selected: code == selection, highlighted: code == highlighted, identifier: "language-" + code) { choose(code) }.id(code)
                            }
                        }
                    }
                }.scrollIndicators(.hidden)
                    .onChange(of: highlighted) { _, code in if let code { proxy.scrollTo(code) } }
            }
        }.padding(metric("gap")).frame(width: metric("sidebar") + metric("editor"))
            .onAppear { highlighted = selection }
            .onChange(of: query) { _, _ in highlighted = flat.first }
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("languageSearch"))
    }
}
