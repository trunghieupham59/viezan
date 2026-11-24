import QtQuick
import QtQuick.Controls

Dialog {
    id: dialog
    readonly property var metrics: workbench.metrics
    property QtObject appearance: SurfaceAppearance {}
    property bool useGlassScrim: true
    readonly property real panelRadius: metrics.chromeCardRadius + metrics.hairline * 2
    property real preferredDialogWidth: metrics.dialogSmall
    property Item initialFocusItem: null
    property Item returnFocusTo: null
    property Item fallbackFocusItem: null

    parent: Overlay.overlay
    popupType: Popup.Item
    modal: true
    focus: true
    anchors.centerIn: parent
    width: Math.min(preferredDialogWidth, parent ? Math.max(0, parent.width - metrics.inset * 2) : preferredDialogWidth)
    Binding { target: dialog.Overlay; property: "modal"; value: glassScrim; when: dialog.useGlassScrim }
    Component {
        id: glassScrim
        Rectangle {
            objectName: "blocking-dialog-scrim"
            color: Qt.alpha(dialog.appearance.colors["shadow-lg-color"], dialog.metrics.overlayShadowOpacity)
        }
    }
    function openFrom(button) {
        returnFocusTo = button
        open()
    }
    onAboutToShow: if (!returnFocusTo) returnFocusTo = parent?.Window.window?.activeFocusItem || null
    onOpened: if (initialFocusItem) initialFocusItem.forceActiveFocus(Qt.TabFocusReason)
    onClosed: {
        const opener = returnFocusTo
        returnFocusTo = null
        // The accepted handler can disable or remove the opener in this same event.
        Qt.callLater(function() {
            if (dialog.visible) return
            const target = opener?.visible && opener.enabled ? opener : dialog.fallbackFocusItem
            if (target?.visible && target.enabled) target.forceActiveFocus(Qt.TabFocusReason)
        })
    }
}
