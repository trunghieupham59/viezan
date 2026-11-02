import SwiftUI
import Observation
import ViezanDomain

// The shell's one place for feedback on a whole action: reversible deletes show
// Undo here, errors about an action (export, backup, login item) show their
// message here. Field errors stay under their field; copy buttons change label.
@MainActor @Observable final class ToastCenter {
    static let shared = ToastCenter()
    struct Toast: Identifiable {
        let id = UUID()
        /// Same key replaces the earlier toast (e.g. repeated archive actions).
        let key: String
        let text: String
        let actionLabel: String?
        let action: (() -> Void)?
        let error: Bool
    }
    /// Seconds before an untouched toast leaves (token `--vzn-native-toast-seconds`); hovering the stack pauses it.
    static var seconds: Double { metric("toastSeconds") }
    static let maximum = 3
    private(set) var toasts: [Toast] = []
    var paused = false
    func show(_ text: String, key: String? = nil, error: Bool = false, actionLabel: String? = nil, action: (() -> Void)? = nil) {
        let toast = Toast(key: key ?? UUID().uuidString, text: text, actionLabel: actionLabel, action: action, error: error)
        withAnimation {
            toasts.removeAll { $0.key == toast.key }
            toasts.append(toast)
            if toasts.count > Self.maximum { toasts.removeFirst(toasts.count - Self.maximum) }
        }
    }
    func dismiss(_ id: UUID) { withAnimation { toasts.removeAll { $0.id == id } } }
    func run(_ id: UUID) {
        guard let toast = toasts.first(where: { $0.id == id }) else { return }
        dismiss(id); toast.action?()
    }
}

struct ToastStack: View {
    let store: WorkbenchStore
    var center = ToastCenter.shared
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(alignment: .trailing, spacing: metric("small")) {
            ForEach(center.toasts) { toast in ToastCard(store: store, center: center, toast: toast) }
        }
        .frame(maxWidth: metric("notificationInline"), alignment: .trailing)
        .onHover { center.paused = $0 }
        .accessibilityElement(children: .contain).accessibilityLabel(store.text("notifications"))
    }
}

private struct ToastCard: View {
    let store: WorkbenchStore
    var center: ToastCenter
    let toast: ToastCenter.Toast
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        HStack(alignment: .center, spacing: metric("gap")) {
            if toast.error { StatusDot(tone: .failed) }
            Text(toast.text).font(.vzn("labelScale")).foregroundStyle(contentColor("text-strong", scheme))
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            if let label = toast.actionLabel {
                Button(label) { center.run(toast.id) }.buttonStyle(.vznOutline).tint(contentColor("action-text", scheme))
                    .accessibilityIdentifier("toast-action")
            }
            Button { center.dismiss(toast.id) } label: { Image(systemName: "xmark") }
                .buttonStyle(.vznQuiet).help(store.text("close")).accessibilityLabel(store.text("close")).accessibilityIdentifier("toast-close")
        }
        .padding(.vertical, metric("gap")).padding(.leading, metric("inset")).padding(.trailing, metric("small"))
        .background { ReadingPanelSurface() }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .accessibilityElement(children: .contain).accessibilityLabel(toast.text)
        .task(id: toast.id) {
            // Count only while the pointer is away; every tick re-checks the pause.
            var remaining = ToastCenter.seconds
            while remaining > 0 {
                try? await Task.sleep(for: .milliseconds(500))
                if Task.isCancelled { return }
                if !center.paused { remaining -= 0.5 }
            }
            center.dismiss(toast.id)
        }
    }
}
