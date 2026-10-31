import SwiftUI
import AppKit
import ViezanDomain

/// Quick translate: select text in any app, press the shortcut, and the translation replaces
/// it in place. A small indicator beside the pointer reports progress without taking focus
/// from that app. When the text cannot be replaced (read-only text, or an app that only
/// gives the selection through copy), the indicator becomes a card with the translation.
@MainActor final class QuickTranslate {
    enum Phase: Equatable {
        case reading
        case translating(String)                  // target language code
        case replaced
        case result(String, paste: Bool)          // translation, whether pasting is possible
        case noSelection, needsAccess
        case failed(String, String?)              // error code, provider detail
    }
    @MainActor @Observable final class Model {
        var phase: Phase = .reading
        var sessionID: String?
        var language = ""
    }
    private let store: WorkbenchStore
    private let openMain: (String) -> Void
    private let model = Model()
    private var panel: NSPanel?
    private var run: Task<Void, Never>?
    private var hide: Task<Void, Never>?
    init(store: WorkbenchStore, openMain: @escaping (String) -> Void) { self.store = store; self.openMain = openMain }

    func start() {
        run?.cancel(); hide?.cancel()
        guard let application = NSWorkspace.shared.frontmostApplication, application.processIdentifier != ProcessInfo.processInfo.processIdentifier else {
            // Pressed while Viezan itself is in front: there is no other app's selection.
            show(.noSelection); return
        }
        store.desktopIntegration.refreshAccessibility()
        guard store.desktopIntegration.accessibilityGranted else { show(.needsAccess); return }
        show(.reading)
        run = Task { [weak self] in await self?.translate(from: application) }
    }

    private func translate(from application: NSRunningApplication) async {
        // Accessibility gives the exact range to replace; apps without it fall back to copy.
        let target = try? SelectedTextTarget.capture()
        var text = target?.text
        if text == nil { text = await SelectionClipboard.copy(from: application) }
        guard !Task.isCancelled else { return }
        guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { show(.noSelection, hideAfter: 2.5); return }
        let language = store.quickTranslate.target(detected: TextLanguage.detect(text))
        let id = store.createDetachedSession(feature: .translate, draft: text)
        store.setPair(id, source: "auto", target: language)
        model.sessionID = id; model.language = language
        show(.translating(language))
        guard let task = store.submit(id) else { show(.failed("providerError", nil)); return }
        while !Task.isCancelled, store.workspace.tasks.first(where: { $0.id == task.id })?.status == .running { try? await Task.sleep(for: .milliseconds(100)) }
        guard !Task.isCancelled, let finished = store.workspace.tasks.first(where: { $0.id == task.id }) else { return }
        let output = store.session(id)?.output.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard finished.status == .succeeded, !output.isEmpty else { show(.failed(finished.errorCode ?? "providerError", finished.errorDetail)); return }
        if let target, (try? target.replace(with: output)) != nil { show(.replaced, hideAfter: 1.5); return }
        // Read-only text, or text we could only copy: show it, and offer to paste when we copied it.
        show(.result(output, paste: target == nil))
    }

    private func show(_ phase: Phase, hideAfter seconds: Double? = nil) {
        model.phase = phase
        let window = panel ?? makePanel()
        panel = window
        // The view fixes its width per phase; measure its height and keep the top edge in place.
        let top = window.isVisible ? window.frame.maxY : nil
        let width = QuickTranslateView.width(phase)
        // The live view has not re-rendered for the new phase yet; measure a fresh one.
        let measure = NSHostingController(rootView: QuickTranslateView(store: store, model: model, actions: .init(close: {}, open: {}, settings: {}, paste: { _ in })))
        let fitting = measure.sizeThatFits(in: NSSize(width: width, height: metric("reading")))
        window.setContentSize(NSSize(width: width, height: ceil(fitting.height)))
        if let top { window.setFrameTopLeftPoint(NSPoint(x: window.frame.minX, y: top)); keepOnScreen(window) } else { place(window) }
        window.orderFrontRegardless()
        hide?.cancel()
        if let seconds { hide = Task { [weak self] in try? await Task.sleep(for: .seconds(seconds)); guard !Task.isCancelled else { return }; self?.dismiss() } }
    }
    func dismiss() { run?.cancel(); hide?.cancel(); panel?.orderOut(nil) }

    private func makePanel() -> NSPanel {
        // Non-activating so the selection's app keeps focus and its text can be replaced.
        let window = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.level = .floating; window.hidesOnDeactivate = false
        window.isOpaque = false; window.backgroundColor = .clear; window.hasShadow = true; window.isMovableByWindowBackground = true
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        let host = NSHostingController(rootView: QuickTranslateView(store: store, model: model, actions: .init(
            close: { [weak self] in self?.dismiss() },
            open: { [weak self] in guard let self, let id = self.model.sessionID else { return }; self.dismiss(); self.openMain(id) },
            settings: { [weak self] in self?.store.desktopIntegration.requestAccessibility(); self?.dismiss() },
            paste: { [weak self] text in
                guard let self, let application = NSWorkspace.shared.frontmostApplication else { return }
                Task { if await SelectionClipboard.paste(text, into: application) { self.show(.replaced, hideAfter: 1.5) } }
            })))
        host.sizingOptions = []; window.contentViewController = host
        return window
    }
    /// Below and to the right of the pointer, flipped above or left when the screen ends.
    private func place(_ window: NSWindow) {
        let pointer = NSEvent.mouseLocation, offset = metric("inset")
        window.setFrameTopLeftPoint(NSPoint(x: pointer.x + offset, y: pointer.y - offset))
        keepOnScreen(window, pointer: pointer)
    }
    private func keepOnScreen(_ window: NSWindow, pointer: NSPoint? = nil) {
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(pointer ?? window.frame.origin) }) ?? window.screen ?? NSScreen.main else { return }
        let bounds = screen.visibleFrame, gap = metric("inset")
        var frame = window.frame
        if frame.maxX > bounds.maxX { frame.origin.x = (pointer.map { $0.x - gap - frame.width } ?? bounds.maxX - frame.width) }
        if frame.minY < bounds.minY { frame.origin.y = (pointer.map { $0.y + gap } ?? bounds.minY) }
        frame.origin.x = min(max(frame.origin.x, bounds.minX), bounds.maxX - frame.width)
        frame.origin.y = min(max(frame.origin.y, bounds.minY), bounds.maxY - frame.height)
        window.setFrame(frame, display: true)
    }
}

struct QuickTranslateView: View {
    struct Actions { var close: () -> Void; var open: () -> Void; var settings: () -> Void; var paste: (String) -> Void }
    let store: WorkbenchStore
    let model: QuickTranslate.Model
    let actions: Actions
    @Environment(\.colorScheme) private var scheme
    private var language: String { store.text("lang_" + model.language) }
    static func width(_ phase: QuickTranslate.Phase) -> CGFloat {
        switch phase { case .result, .failed, .needsAccess: metric("reading") * 0.6; default: metric("sidebar") + metric("rail") }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            switch model.phase {
            case .reading: status(store.text("quickReading"), busy: true)
            case .translating(let target): status(store.text("quickTranslating").replacingOccurrences(of: "{lang}", with: store.text("lang_" + target)), busy: true)
            case .replaced: status(store.text("quickReplaced"), symbol: "checkmark.circle.fill", tone: Color(nsColor: .systemGreen))
            case .noSelection: status(store.text("quickNoSelection"), symbol: "exclamationmark.circle", tone: Color(nsColor: .systemOrange))
            case .needsAccess:
                header(store.text("quickNeedsAccessibility"), symbol: "lock.shield", tone: Color(nsColor: .systemOrange))
                HStack { Spacer(); Button(store.text("openSystemSettings"), action: actions.settings).buttonStyle(.vznPrimary) }
            case .failed(let code, let detail):
                header(store.text("quickFailed"), symbol: "exclamationmark.triangle", tone: contentColor("danger", scheme))
                Text(store.text(code)).font(.vzn("smallScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if let detail { Text(detail).font(.vzn("captionScale")).foregroundStyle(.secondary).lineLimit(3).textSelection(.enabled) }
                HStack { Spacer(); Button(store.text("openInTranslate"), action: actions.open).buttonStyle(.vznOutline) }
            case .result(let text, let paste):
                header(store.text("quickResultTitle").replacingOccurrences(of: "{lang}", with: language), symbol: "character.bubble", tone: contentColor("action-text", scheme))
                // Quick results are short; a long one stays whole in Translate ("Open in Translate").
                Text(text).font(.vzn("labelScale")).textSelection(.enabled).lineLimit(12).fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading).help(text)
                if !paste { Text(store.text("quickReadOnly")).font(.vzn("smallScale")).foregroundStyle(.secondary) }
                HStack(spacing: metric("small")) {
                    if paste { Button(store.text("quickPaste")) { actions.paste(text) }.buttonStyle(.vznPrimary) }
                    Button(store.text("copy"), systemImage: "doc.on.doc") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string); actions.close() }
                        .buttonStyle(paste ? .vznOutline : .vznPrimary)
                    Button(store.text("openInTranslate"), action: actions.open).buttonStyle(.vznQuiet)
                }
            }
        }
        .padding(metric("inset"))
        .frame(width: Self.width(model.phase), alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("largeRadius")))
        .overlay(RoundedRectangle(cornerRadius: metric("largeRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
        .overlay(alignment: .topTrailing) {
            Button(action: actions.close) { Image(systemName: "xmark").font(.vzn("captionScale")) }
                .buttonStyle(.plain).foregroundStyle(.secondary).padding(metric("small"))
                .help(store.text("close")).accessibilityLabel(store.text("close"))
        }
        .accessibilityElement(children: .contain)
    }
    private func status(_ text: String, busy: Bool = false, symbol: String = "", tone: Color = .accentColor) -> some View {
        HStack(spacing: metric("small")) {
            if busy { ProgressView().controlSize(.small) } else { Image(systemName: symbol).foregroundStyle(tone) }
            Text(text).font(.vzn("labelScale")).lineLimit(2).fixedSize(horizontal: false, vertical: true)
        }.padding(.trailing, metric("gutter")).accessibilityElement(children: .combine).accessibilityAddTraits(.updatesFrequently)
    }
    private func header(_ text: String, symbol: String, tone: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
            Image(systemName: symbol).foregroundStyle(tone)
            Text(text).font(.vzn("labelScale", .semibold)).fixedSize(horizontal: false, vertical: true)
        }.padding(.trailing, metric("gutter"))
    }
}
