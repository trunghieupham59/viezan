import Testing
@testable import ViezanNative

@MainActor
struct ToastCenterTests {
    @Test func eachLevelHasItsOwnSymbol() {
        #expect(ToastCenter.indicator(for: .info).symbol == "info.circle.fill")
        #expect(ToastCenter.indicator(for: .success).symbol == "checkmark.circle.fill")
        #expect(ToastCenter.indicator(for: .warning).symbol == "exclamationmark.triangle.fill")
        #expect(ToastCenter.indicator(for: .danger).symbol == "exclamationmark.circle.fill")
    }

    @Test func displayOrderStartsWithNewestToast() {
        let center = ToastCenter()
        center.show("First")
        center.show("Second")
        center.show("Third")
        #expect(center.toastsInDisplayOrder.map(\.text) == ["Third", "Second", "First"])
        #expect(center.toasts.map(\.text) == ["First", "Second", "Third"])
    }

    @Test func explicitLevelOverridesLegacyErrorFlag() {
        let center = ToastCenter()
        center.show("Error", error: true)
        center.show("Default")
        center.show("Warning", error: true, level: .warning)
        #expect(center.toasts.map(\.level) == [.danger, .success, .warning])
    }

    @Test func lifetimeUsesLevelAndActionLabel() throws {
        let cases: [(ToastCenter.Toast.Level, String?, Double?)] = [
            (.info, nil, metric("toastBriefSeconds")),
            (.success, nil, metric("toastBriefSeconds")),
            (.warning, nil, metric("toastWarningSeconds")),
            (.info, "Open", metric("toastActionSeconds")),
            (.success, "Undo", metric("toastActionSeconds")),
            (.warning, "Retry", metric("toastActionSeconds")),
            (.danger, nil, nil),
            (.danger, "Retry", nil)
        ]
        let center = ToastCenter()
        for (level, label, expected) in cases {
            center.show("Result", level: level, actionLabel: label)
            let toast = try #require(center.toasts.last)
            #expect(ToastCenter.lifetime(of: toast) == expected)
        }
    }

    @Test func overflowRemovesOldestExpiringToast() {
        let center = ToastCenter()
        center.show("Danger 1", level: .danger)
        center.show("Success 1")
        center.show("Danger 2", level: .danger)
        center.show("Success 2")
        #expect(center.toasts.map(\.text) == ["Danger 1", "Danger 2", "Success 2"])
    }

    @Test(arguments: [ToastCenter.Toast.Level.danger, .success])
    func fullDangerStackAlwaysKeepsIncomingToast(level: ToastCenter.Toast.Level) {
        let center = ToastCenter()
        center.show("First", level: .danger)
        center.show("Second", level: .danger)
        center.show("Third", level: .danger)
        center.show("Incoming", level: level)
        #expect(center.toasts.map(\.text) == ["Second", "Third", "Incoming"])
    }

    @Test func matchingKeyReplacesDangerEvenAtCapacity() throws {
        let center = ToastCenter()
        center.show("Original", key: "export", level: .danger)
        let original = try #require(center.toasts.first)
        center.show("Saved")
        center.show("Copied")
        center.show("Replacement", key: "export")
        center.dismiss(original.id)
        #expect(center.toasts.map(\.text) == ["Saved", "Copied", "Replacement"])
    }

    @Test func hoverOrKeyboardFocusPausesStack() {
        let center = ToastCenter()
        #expect(!center.paused)
        center.hovered = true
        #expect(center.paused)
        center.focused = true
        #expect(center.paused)
        center.hovered = false
        #expect(center.paused)
        center.focused = false
        #expect(!center.paused)
    }
}

extension ToastCenterTests {
    @Test func dismissingByKeyRemovesOnlyThatToast() {
        let center = ToastCenter()
        center.show("Failed", key: "apps-error", level: .danger)
        center.show("Saved", key: "other")
        center.dismiss(key: "apps-error")
        center.dismiss(key: "missing")
        #expect(center.toasts.map(\.text) == ["Saved"])
    }
}
