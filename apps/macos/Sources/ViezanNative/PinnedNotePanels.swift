import AppKit
import SwiftUI
import ViezanDomain

@MainActor @Observable final class PinnedNotePanels {
    // DesktopPanels owns the controller shared by the main window and floating panels.
    private(set) static weak var current: PinnedNotePanels?
    private let store: WorkbenchStore
    @ObservationIgnored private var panels: [String: PinnedNotePanel] = [:]
    private(set) var lastDeleted: PinnedNote?

    init(store: WorkbenchStore) {
        self.store = store
        Self.current = self
        guard !store.loadBlocked else { return }
        for note in store.pinnedNotes.notes { open(note) }
    }

    @discardableResult func create(text: String = "", origin: String? = nil, detail: String? = nil) -> Bool {
        guard !store.loadBlocked else { return false }
        guard store.pinnedNotes.notes.count < PinnedNotes.limit else { showLimit(); return false }
        guard let note = store.pinnedNotes.add(text: text, origin: origin, detail: detail) else {
            showStorageError()
            return false
        }
        open(note, focusBody: origin == nil)
        let message = store.text("pinnedNoteCreated")
        if origin == Feature.chat.rawValue {
            ToastCenter.shared.show(message, key: "pinnedNoteCreated")
        } else {
            AccessibilityNotification.Announcement(message).post()
        }
        return true
    }

    func show(_ id: String) { panels[id]?.orderFrontRegardless() }

    func delete(_ id: String) {
        guard let panel = panels[id] else { return }
        // Capture even a drag or keystroke that has not reached its delayed save.
        panel.draft.flush()
        guard !panel.draft.hasPendingText, var removed = store.pinnedNotes.remove(id) else {
            showStorageError()
            return
        }
        removed.frame = panel.noteFrame
        lastDeleted = removed
        panels.removeValue(forKey: id)
        panel.close()
        ToastCenter.shared.show(store.text("pinnedNoteDeleted"), key: "pinnedNoteDeleted",
                                actionLabel: store.text("undo")) { [weak self] in self?.restoreLastDeleted() }
    }

    func restoreLastDeleted() {
        guard let note = lastDeleted, !store.loadBlocked else { return }
        guard store.pinnedNotes.notes.count < PinnedNotes.limit else { showLimit(); return }
        store.pinnedNotes.restore(note)
        guard store.pinnedNotes.notes.contains(where: { $0.id == note.id }) else {
            showStorageError()
            return
        }
        open(note)
        lastDeleted = nil
        if let toast = ToastCenter.shared.toasts.first(where: { $0.key == "pinnedNoteDeleted" }) {
            ToastCenter.shared.dismiss(toast.id)
        }
    }

    private func showLimit() {
        let message = store.text("pinnedNoteLimit").replacingOccurrences(of: "{count}", with: String(PinnedNotes.limit))
        ToastCenter.shared.show(message, key: "pinnedNoteLimit")
    }

    private func showStorageError() {
        if let error = store.pinnedNotes.error { ToastCenter.shared.show(store.text(error), key: error, error: true) }
    }

    private func open(_ note: PinnedNote, focusBody: Bool = false) {
        let frame: CGRect
        if let saved = note.frame {
            let rect = CGRect(x: saved.x, y: saved.y, width: saved.width, height: saved.height)
            // A straddling window belongs to the display with the largest overlap.
            let display = NSScreen.screens.compactMap { screen -> (NSScreen, CGFloat)? in
                let overlap = screen.frame.intersection(rect)
                return overlap.isEmpty ? nil : (screen, overlap.width * overlap.height)
            }.max { $0.1 < $1.1 }?.0
            guard let visible = (display ?? NSScreen.main)?.visibleFrame else { return }
            var sized = rect
            sized.size.width = min(max(rect.width, PinnedNotePanel.minimum.width), PinnedNotePanel.maximum.width)
            sized.size.height = min(max(rect.height, PinnedNotePanel.minimum.height), PinnedNotePanel.maximum.height)
            frame = Self.clamped(sized, to: visible)
        } else {
            let pointer = NSEvent.mouseLocation
            guard let display = NSScreen.screens.first(where: { $0.frame.contains(pointer) }) ?? NSScreen.main else { return }
            let size = CGSize(width: metric("sidebar") + metric("rail"), height: metric("editor") * 2)
            frame = Self.defaultFrame(size: size, in: display.visibleFrame, openCount: panels.count)
        }
        let panel = PinnedNotePanel(note: note, store: store, frame: frame, focusBody: focusBody) { [weak self] in
            self?.delete(note.id)
        }
        panels[note.id] = panel
        if focusBody { panel.makeKeyAndOrderFront(nil) } else { panel.orderFrontRegardless() }
        panel.saveFrame()
    }

    static func clamped(_ frame: CGRect, to visible: CGRect) -> CGRect {
        let width = min(frame.width, visible.width), height = min(frame.height, visible.height)
        return CGRect(x: min(max(frame.minX, visible.minX), visible.maxX - width),
                      y: min(max(frame.minY, visible.minY), visible.maxY - height), width: width, height: height)
    }

    static func snapped(_ frame: CGRect, to visible: CGRect) -> CGRect {
        var result = frame
        let left = abs(frame.minX - visible.minX), right = abs(frame.maxX - visible.maxX)
        if min(left, right) < metric("large") {
            result.origin.x = left <= right ? visible.minX + metric("inset") : visible.maxX - metric("inset") - frame.width
        }
        return clamped(result, to: visible)
    }

    static func defaultFrame(size: CGSize, in visible: CGRect, openCount: Int) -> CGRect {
        let top = visible.maxY - metric("inset") - CGFloat(openCount) * (size.height + metric("gap"))
        return clamped(CGRect(x: visible.maxX - metric("inset") - size.width, y: top - size.height,
                              width: size.width, height: size.height), to: visible)
    }

    static func menuTitle(_ text: String, fallback: String) -> String {
        let first = text.prefix { !$0.isNewline }.trimmingCharacters(in: .whitespaces)
        guard !first.isEmpty else { return fallback }
        return first.count > 64 ? String(first.prefix(63)) + "…" : first
    }
}

struct PinAsNoteButton: View {
    let label: String
    let text: String
    let origin: Feature
    var detail: String?
    var onCreate: (() -> Void)?

    var body: some View {
        Button {
            if PinnedNotePanels.current?.create(text: text, origin: origin.rawValue, detail: detail) == true {
                onCreate?()
            }
        } label: { Image(systemName: "pin") }
        .buttonStyle(.vznQuiet).fixedSize()
        .accessibilityLabel(label).help(label)
    }
}

// Each window owns its unsaved edit. The menu sees committed text via the domain store.
@MainActor @Observable final class PinnedNoteDraft {
    let id: String
    private let notes: PinnedNotes
    private var pending: String?
    @ObservationIgnored private(set) var saveTask: Task<Void, Never>?

    init(id: String, notes: PinnedNotes) { self.id = id; self.notes = notes }
    var hasPendingText: Bool { pending != nil }
    var text: String {
        get { pending ?? notes.notes.first(where: { $0.id == id })?.text ?? "" }
        set {
            pending = String(newValue.prefix(PinnedNotes.textLimit))
            saveTask?.cancel()
            saveTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(metric("durationNormal")))
                guard !Task.isCancelled else { return }
                self?.flush()
            }
        }
    }

    func flush() {
        saveTask?.cancel()
        saveTask = nil
        guard let pending, let note = notes.notes.first(where: { $0.id == id }) else { return }
        if note.text != pending { notes.setText(id, pending) }
        if notes.notes.first(where: { $0.id == id })?.text == pending { self.pending = nil }
    }
}

@MainActor private final class PinnedNotePanel: NSPanel, NSWindowDelegate {
    static var minimum: CGSize { CGSize(width: metric("sidebar"), height: metric("editor")) }
    static var maximum: CGSize { CGSize(width: metric("notificationInline"), height: metric("editor") * 3) }
    let draft: PinnedNoteDraft
    private let notes: PinnedNotes
    private let deleteNote: () -> Void
    private var frameTask: Task<Void, Never>?
    private var snapOnRelease = false
    private var applyingFrame = false
    override var canBecomeKey: Bool { true }

    init(note: PinnedNote, store: WorkbenchStore, frame: CGRect, focusBody: Bool, delete: @escaping () -> Void) {
        notes = store.pinnedNotes
        draft = PinnedNoteDraft(id: note.id, notes: store.pinnedNotes)
        deleteNote = delete
        super.init(contentRect: frame, styleMask: [.borderless, .resizable, .nonactivatingPanel], backing: .buffered, defer: false)
        level = .floating
        hidesOnDeactivate = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = true
        becomesKeyOnlyIfNeeded = true
        sharingType = .none
        isReleasedWhenClosed = false
        minSize = Self.minimum
        maxSize = Self.maximum

        let host = PinnedNoteHostingView(rootView: PinnedNoteCard(store: store, note: note, draft: draft,
                                                                 focusBody: focusBody, panel: self, delete: delete))
        host.sizingOptions = []
        host.wantsLayer = true
        host.layer?.backgroundColor = NSColor.clear.cgColor
        host.layer?.cornerRadius = metric("surfaceRadius")
        host.layer?.cornerCurve = .continuous
        host.layer?.masksToBounds = true
        contentView = host
        setFrame(frame, display: true)
        invalidateShadow()
        delegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(flushBeforeQuit(_:)),
                                               name: NSApplication.willTerminateNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(screenLayoutChanged(_:)),
                                               name: NSApplication.didChangeScreenParametersNotification, object: nil)
    }

    var noteFrame: PinnedNote.Frame {
        .init(x: frame.origin.x, y: frame.origin.y, width: frame.width, height: frame.height)
    }

    func saveFrame() {
        guard let note = notes.notes.first(where: { $0.id == draft.id }), note.frame != noteFrame else { return }
        notes.setFrame(note.id, noteFrame)
    }

    @objc private func flushBeforeQuit(_ notification: Notification) { draft.flush(); saveFrame() }
    @objc private func screenLayoutChanged(_ notification: Notification) { schedulePlacement() }
    func windowDidResignKey(_ notification: Notification) { draft.flush() }
    func windowWillMove(_ notification: Notification) { if !applyingFrame { snapOnRelease = true } }
    func windowDidMove(_ notification: Notification) { schedulePlacement() }
    func windowDidResize(_ notification: Notification) {
        invalidateShadow()
        if !inLiveResize { schedulePlacement() }
    }
    func windowDidEndLiveResize(_ notification: Notification) {
        snapOnRelease = false
        settleFrame()
    }

    private func schedulePlacement() {
        guard !applyingFrame, !inLiveResize, frameTask == nil else { return }
        frameTask = Task { [weak self] in
            // AppKit can move a window in the WindowServer without delivering mouseUp to its view.
            repeat {
                try? await Task.sleep(for: .seconds(metric("durationFast")))
                guard !Task.isCancelled else { return }
            } while NSEvent.pressedMouseButtons & 1 != 0
            self?.settleFrame()
        }
    }

    private func settleFrame() {
        frameTask?.cancel()
        frameTask = nil
        guard !inLiveResize, let visible = (screen ?? NSScreen.main)?.visibleFrame else { return }
        let snap = snapOnRelease
        snapOnRelease = false
        let target = snap ? PinnedNotePanels.snapped(frame, to: visible) : PinnedNotePanels.clamped(frame, to: visible)
        if frame != target {
            applyingFrame = true
            setFrame(target, display: true, animate: snap && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion)
            applyingFrame = false
        }
        saveFrame()
    }

    override func animationResizeTime(_ newFrame: NSRect) -> TimeInterval { metric("durationFast") }

    private var composing: Bool { (firstResponder as? NSTextView)?.hasMarkedText() == true }
    private func isCloseShortcut(_ event: NSEvent) -> Bool {
        event.modifierFlags.intersection([.command, .option, .control, .shift]) == .command
            && event.charactersIgnoringModifiers?.lowercased() == "w"
    }
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if !composing, isCloseShortcut(event) { deleteNote(); return true }
        return super.performKeyEquivalent(with: event)
    }
    override func performClose(_ sender: Any?) { if !composing { deleteNote() } }
    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown, !composing {
            if isCloseShortcut(event) { deleteNote(); return }
            if event.keyCode == 53 {
                makeFirstResponder(nil)
                // Relinquish the nonactivating panel's key status and keep it visible.
                orderOut(nil)
                orderFrontRegardless()
                return
            }
        }
        super.sendEvent(event)
    }

    func windowWillClose(_ notification: Notification) {
        frameTask?.cancel()
        NotificationCenter.default.removeObserver(self)
    }
}

private final class PinnedNoteHostingView<Content: View>: NSHostingView<Content> {
    override var isOpaque: Bool { false }
}

private struct PinnedNoteCard: View {
    let store: WorkbenchStore
    let note: PinnedNote
    @Bindable var draft: PinnedNoteDraft
    let focusBody: Bool
    weak var panel: PinnedNotePanel?
    let delete: () -> Void
    @Environment(\.colorScheme) private var scheme

    private var source: String {
        if let detail = note.detail?.trimmingCharacters(in: .whitespacesAndNewlines), !detail.isEmpty { return detail }
        if let origin = note.origin, nativeResources.locales["en"]?[origin] != nil { return store.text(origin) }
        return store.text("pinnedNote")
    }
    private var windowTitle: String { store.text("pinnedNoteWindow").replacingOccurrences(of: "{source}", with: source) }

    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            HStack(spacing: metric("tight")) {
                Text(source).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("text-muted", scheme))
                    .lineLimit(1).frame(maxWidth: .infinity, minHeight: metric("compactControl"), alignment: .leading)
                    .overlay { WindowDragRegion().accessibilityHidden(true) }
                action("pinnedNoteCopy", symbol: "doc.on.doc") { copyText(draft.text, store: store) }
                action("pinnedNoteDelete", symbol: "trash", perform: delete)
            }
            ComposerEditor(text: $draft.text, identity: note.id, label: store.text("pinnedNoteBody"), font: readingNSFont(store),
                           focusEpoch: focusBody ? 1 : 0, accessibilityID: "pinned-note-body",
                           onFocus: { focused in if !focused { draft.flush() } }, submit: {})
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .modifier(EditorPlaceholder(text: store.text("pinnedNotePlaceholder"), visible: draft.text.isEmpty,
                                            font: readingFont(store), leadingInset: ComposerEditor.caretLeading,
                                            topInset: 0, textColor: contentColor("text-muted", scheme)))
        }
        .padding(metric("inset"))
        .background {
            ReadingPanelSurface()
        }
        .onChange(of: windowTitle, initial: true) { _, title in
            panel?.title = title
            panel?.setAccessibilityLabel(title)
        }
        .onChange(of: store.workspace.preferences, initial: true) { _, preferences in
            panel?.appearance = preferences.mode == .dark ? NSAppearance(named: .darkAqua)
                : preferences.mode == .light ? NSAppearance(named: .aqua) : nil
            panel?.contentView?.layer?.cornerRadius = metric("surfaceRadius")
            panel?.invalidateShadow()
        }
    }

    private func action(_ key: String, symbol: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) { Image(systemName: symbol).frame(width: metric("icon"), height: metric("icon")) }
            .buttonStyle(.vznQuiet).controlSize(.small)
            .accessibilityLabel(store.text(key)).help(store.text(key))
    }
}
