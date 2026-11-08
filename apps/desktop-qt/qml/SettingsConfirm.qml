import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Dialog {
    id: dialog
    required property var bridge
    property string message: ""
    property string actionText: ""
    property bool destructive: true
    property bool actionEnabled: true
    readonly property var metrics: bridge.resources.metrics
    readonly property bool dark: bridge.state.appearance?.preset === "midnight" || bridge.state.appearance?.mode === "dark" || (bridge.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.resources.themePalettes[(bridge.state.appearance?.preset || "graphite") + ":" + (bridge.state.appearance?.accent || "auto")][dark ? "dark" : "light"]
    property Item previousFocus: null
    onAboutToShow: previousFocus = parent ? parent.Window.window.activeFocusItem : null
    onOpened: cancelButton.forceActiveFocus(Qt.PopupFocusReason)
    onClosed: if (previousFocus) previousFocus.forceActiveFocus(Qt.PopupFocusReason)
    parent: Overlay.overlay
    popupType: Popup.Item
    modal: true; focus: true
    width: Math.min(metrics.dialog, parent ? parent.width - metrics.large : metrics.dialog)
    implicitHeight: titleLabel.implicitHeight + messageLabel.implicitHeight + buttons.implicitHeight + topPadding + bottomPadding
    x: parent ? (parent.width - width) / 2 : 0
    y: parent ? (parent.height - height) / 2 : 0
    padding: metrics.inset
    leftInset: 0; rightInset: 0; topInset: 0; bottomInset: 0
    contentHeight: messageLabel.implicitHeight
    closePolicy: Popup.CloseOnEscape
    background: Kit.ReadingPanelSurface { radius: dialog.metrics.chromeCardRadius + dialog.metrics.hairline * 2 }
    Overlay.modal: Rectangle { color: Qt.alpha(dialog.colors["shadow-lg-color"], dialog.metrics.overlayShadowOpacity) }
    header: Label { id: titleLabel; text: dialog.title; padding: dialog.metrics.inset; font.bold: true; wrapMode: Text.Wrap; Accessible.role: Accessible.Heading }
    contentItem: Label { id: messageLabel; text: dialog.message; wrapMode: Text.Wrap; Accessible.name: text }
    footer: DialogButtonBox {
        id: buttons
        padding: dialog.metrics.inset
        implicitHeight: Math.max(cancelButton.implicitHeight, acceptButton.implicitHeight) + topPadding + bottomPadding
        background: Item {}
        Kit.GlassButton {
            id: cancelButton
            text: dialog.bridge.resources.locales[dialog.bridge.state.locale].cancel
            DialogButtonBox.buttonRole: DialogButtonBox.RejectRole
        }
        Kit.PrimaryButton {
            id: acceptButton
            objectName: dialog.objectName + "-confirm"
            text: dialog.actionText
            enabled: dialog.actionEnabled
            palette.highlight: dialog.destructive ? dialog.colors.danger : dialog.colors.action
            // PrimaryButton's Glass gradient uses the normal accent; a destructive confirmation is solid.
            background: Rectangle {
                radius: height / 2
                color: acceptButton.enabled ? (dialog.destructive ? dialog.colors.danger : dialog.colors.action) : dialog.colors["surface-muted"]
                border.width: acceptButton.visualFocus ? dialog.metrics.hairline * 2 : 0
                border.color: dialog.colors.text
            }
            DialogButtonBox.buttonRole: DialogButtonBox.AcceptRole
        }
    }
}
