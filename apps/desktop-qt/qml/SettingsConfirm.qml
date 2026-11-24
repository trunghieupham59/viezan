import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

BlockingDialog {
    id: dialog
    required property var bridge
    property string message: ""
    property string actionText: ""
    property bool destructive: true
    property bool actionEnabled: true
    readonly property bool dark: bridge.appearance?.mode === "dark" || (bridge.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.palettes[dark ? "dark" : "light"]
    useGlassScrim: true
    initialFocusItem: cancelButton
    implicitHeight: titleLabel.implicitHeight + messageLabel.implicitHeight + buttons.implicitHeight + topPadding + bottomPadding
    padding: metrics.inset
    leftInset: 0; rightInset: 0; topInset: 0; bottomInset: 0
    contentHeight: messageLabel.implicitHeight
    closePolicy: Popup.CloseOnEscape
    background: Kit.ReadingPanelSurface { radius: dialog.panelRadius }
    header: Label { id: titleLabel; text: dialog.title; padding: dialog.metrics.inset; font.bold: true; wrapMode: Text.Wrap; Accessible.role: Accessible.Heading }
    contentItem: Label { id: messageLabel; text: dialog.message; wrapMode: Text.Wrap; Accessible.name: text }
    footer: DialogButtonBox {
        id: buttons
        padding: dialog.metrics.inset
        implicitHeight: Math.max(cancelButton.implicitHeight, acceptButton.implicitHeight) + topPadding + bottomPadding
        background: Item {}
        Kit.GlassButton {
            id: cancelButton
            text: dialog.bridge.strings.cancel
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
                border.width: acceptButton.visualFocus ? dialog.metrics.focusRingWidth : 0
                border.color: dialog.colors.text
            }
            DialogButtonBox.buttonRole: DialogButtonBox.AcceptRole
        }
    }
}
