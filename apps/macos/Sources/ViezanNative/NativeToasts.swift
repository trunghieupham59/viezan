import SwiftUI
import Observation
import ViezanDomain

// The shell's one place for feedback on a whole action: reversible deletes show
// Undo here, errors about an action (export, backup, login item) show their
// message here. Field errors stay under their field; copy buttons change label.
@MainActor @Observable final class ToastCenter {
    static let shared = ToastCenter()
    struct Toast: Identifiable {
        enum Level { case info, success, warning, danger }

        let id = UUID()
        /// Same key replaces the earlier toast (e.g. repeated archive actions).
        let key: String
        let text: String
        let actionLabel: String?
        let action: (() -> Void)?
        let level: Level
    }
    static let maximum = 3
    private(set) var toasts: [Toast] = []
    var toastsInDisplayOrder: ReversedCollection<[Toast]> { toasts.reversed() }
    var hovered = false
    var focused = false
    var paused: Bool { hovered || focused }

    static func indicator(for level: Toast.Level) -> (symbol: String, colorRole: String) {
        switch level {
        case .info: ("info.circle.fill", "action-text")
        case .success: ("checkmark.circle.fill", "success")
        case .warning: ("exclamationmark.triangle.fill", "warning")
        case .danger: ("exclamationmark.circle.fill", "danger")
        }
    }

    static func lifetime(of toast: Toast) -> Double? {
        guard toast.level != .danger else { return nil }
        if toast.actionLabel != nil { return metric("toastActionSeconds") }
        return toast.level == .warning ? metric("toastWarningSeconds") : metric("toastBriefSeconds")
    }

    func show(_ text: String, key: String? = nil, error: Bool = false, level: Toast.Level? = nil,
              actionLabel: String? = nil, action: (() -> Void)? = nil) {
        let toast = Toast(key: key ?? UUID().uuidString, text: text, actionLabel: actionLabel,
                          action: action, level: level ?? (error ? .danger : .success))
        var announcement = AttributedString(text)
        if toast.level == .warning || toast.level == .danger {
            announcement.accessibilitySpeechAnnouncementPriority = .high
        }
        AccessibilityNotification.Announcement(announcement).post()
        withAnimation(NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? nil : .default) {
            toasts.removeAll { $0.key == toast.key }
            if toasts.count == Self.maximum {
                let oldest = toasts.firstIndex { Self.lifetime(of: $0) != nil } ?? toasts.startIndex
                toasts.remove(at: oldest)
            }
            toasts.append(toast)
        }
    }
    func dismiss(_ id: UUID) { withAnimation(NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? nil : .default) { toasts.removeAll { $0.id == id } } }
    /// Takes back a toast that no longer holds, e.g. a failure once the retry went through.
    func dismiss(key: String) { if let toast = toasts.first(where: { $0.key == key }) { dismiss(toast.id) } }
    func run(_ id: UUID) {
        guard let toast = toasts.first(where: { $0.id == id }) else { return }
        dismiss(id); toast.action?()
    }
}

struct ToastStack: View {
    let store: WorkbenchStore
    var center = ToastCenter.shared
    /// Each button reports its own focus: a container's focus state does not follow its children.
    enum Control: Hashable { case action(UUID), close(UUID) }
    @FocusState private var focus: Control?
    var body: some View {
        VStack(alignment: .trailing, spacing: metric("small")) {
            ForEach(center.toastsInDisplayOrder) { toast in ToastCard(store: store, center: center, toast: toast, focus: $focus) }
        }
        .frame(maxWidth: metric("notificationInline"), alignment: .trailing)
        .onHover { center.hovered = $0 }
        .onKeyPress(.escape, phases: .down) { _ in
            guard focus != nil, let newest = center.toastsInDisplayOrder.first else { return .ignored }
            center.dismiss(newest.id)
            return .handled
        }
        .onChange(of: focus) { _, focus in center.focused = focus != nil }
        .onDisappear {
            center.hovered = false
            center.focused = false
        }
        .accessibilityElement(children: .contain).accessibilityLabel(store.text("notifications"))
    }
}

private struct ToastCard: View {
    let store: WorkbenchStore
    var center: ToastCenter
    let toast: ToastCenter.Toast
    var focus: FocusState<ToastStack.Control?>.Binding
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        let indicator = ToastCenter.indicator(for: toast.level)
        let tint = contentColor(indicator.colorRole, scheme)
        HStack(alignment: .center, spacing: metric("gap")) {
            Image(systemName: indicator.symbol).foregroundStyle(tint).accessibilityHidden(true)
            Text(toast.text).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-strong", scheme))
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            if let label = toast.actionLabel {
                Button(label) { center.run(toast.id) }.buttonStyle(.vznOutline).tint(contentColor("action-text", scheme))
                    .focused(focus, equals: .action(toast.id)).accessibilityIdentifier("toast-action")
            }
            Button { center.dismiss(toast.id) } label: { Image(systemName: "xmark") }
                .buttonStyle(.vznQuiet).help(store.text("close")).accessibilityLabel(store.text("close")).accessibilityIdentifier("toast-close")
                .focused(focus, equals: .close(toast.id))
        }
        .padding(.vertical, metric("gap")).padding(.leading, metric("inset")).padding(.trailing, metric("small"))
        .frame(minHeight: metric("navControl") + metric("tight"))
        .background { ReadingPanelSurface() }
        .overlay {
            if toast.level == .danger {
                RoundedRectangle(cornerRadius: metric("surfaceRadius"), style: .continuous)
                    // Same weight as an in-page failure band; solid when the system asks for more contrast.
                    .strokeBorder(contrast == .increased ? tint : tint.opacity(metric("selectionOpacity") * 2), lineWidth: metric("hairline"))
                    .allowsHitTesting(false).accessibilityHidden(true)
            }
        }
        .transition(reduceMotion
            ? .opacity.animation(.easeOut(duration: metric("durationFast")))
            : .offset(y: -metric("small")).combined(with: .opacity))
        // The icon is decorative, so a failure says so in words for VoiceOver.
        .accessibilityElement(children: .contain).accessibilityLabel(toast.text)
        .accessibilityValue(toast.level == .danger ? store.text("failed") : "")
        .task(id: toast.id) {
            guard var remaining = ToastCenter.lifetime(of: toast) else { return }
            while remaining > 0 {
                try? await Task.sleep(for: .milliseconds(500))
                if Task.isCancelled { return }
                if !center.paused { remaining -= 0.5 }
            }
            center.dismiss(toast.id)
        }
    }
}
