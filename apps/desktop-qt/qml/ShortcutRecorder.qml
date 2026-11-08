import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

GlassDialog {
    id: recorder
    required property var bridge
    property var desktop: bridge.desktopIntegration
    property var shortcut: null
    property Item opener: null
    property string candidate: ""
    property string failure: ""
    property bool waiting: false
    readonly property string defaultKey: ({launcher: "Alt+Space", quickChat: "Ctrl+Alt+Space", translateSelection: "Alt+T"})[shortcut?.id] || ""
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function tpl(key, values) { let text = t(key); for (const name in values) text = text.split("{" + name + "}").join(values[name]); return text }
    function begin(row, button) { shortcut = row; candidate = row.key; failure = ""; waiting = false; opener = button; open() }
    function capture(key, modifiers) {
        if (waiting || desktop.busy) return
        if ([Qt.Key_Control, Qt.Key_Alt, Qt.Key_Shift, Qt.Key_Meta].includes(key)) return
        const parts = []
        if (modifiers & Qt.ControlModifier) parts.push("Ctrl")
        if (modifiers & Qt.AltModifier) parts.push("Alt")
        if (modifiers & Qt.ShiftModifier) parts.push("Shift")
        if (modifiers & Qt.MetaModifier) parts.push("Meta")
        if (!(modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier)) || !((key >= Qt.Key_A && key <= Qt.Key_Z) || (key >= Qt.Key_0 && key <= Qt.Key_9) || key === Qt.Key_Space)) {
            candidate = ""; failure = t("shortcutRecorderHint"); return
        }
        parts.push(key === Qt.Key_Space ? "Space" : String.fromCharCode(key))
        candidate = parts.join("+"); failure = ""
        const conflict = desktop.shortcuts.find(row => row.id !== shortcut.id && row.enabled && row.key.toLowerCase() === candidate.toLowerCase())
        if (conflict) failure = tpl("shortcutConflict", {name: t(conflict.id)})
    }
    function apply() {
        if (!candidate || failure || waiting || desktop.busy) return
        waiting = true
        desktop.configure(shortcut.id, candidate, shortcut.enabled)
    }
    parent: Overlay.overlay
    objectName: "shortcut-recorder"
    modal: true; focus: true
    closePolicy: waiting ? Popup.NoAutoClose : Popup.CloseOnEscape
    title: tpl("shortcutFor", {name: shortcut ? t(shortcut.id) : ""})
    width: Math.min(parent.width - metrics.inset * 2, metrics.dialog)
    x: (parent.width - width) / 2; y: (parent.height - height) / 2
    onOpened: captureField.forceActiveFocus(Qt.TabFocusReason)
    onClosed: if (opener) opener.forceActiveFocus(Qt.TabFocusReason)
    Connections {
        target: recorder.desktop
        function onChanged() {
            if (!recorder.waiting || recorder.desktop.busy) return
            recorder.waiting = false
            if (recorder.desktop.error) recorder.failure = recorder.t(recorder.desktop.error)
            else recorder.close()
        }
    }
    contentItem: ColumnLayout {
        spacing: recorder.metrics.small
        Label { text: recorder.t("shortcutRecorderHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
        TextField {
            id: captureField
            objectName: "shortcut-capture"
            Layout.fillWidth: true
            readOnly: true; text: recorder.candidate.replace(/\+/g, " + ")
            Accessible.name: recorder.title
            Accessible.description: recorder.t("shortcutRecorderHint")
            horizontalAlignment: TextInput.AlignHCenter
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Escape || event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) return
                if (!event.isAutoRepeat) recorder.capture(event.key, event.modifiers)
                event.accepted = true
            }
        }
        Label { objectName: "shortcut-error"; visible: !!text; text: recorder.failure; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    footer: DialogButtonBox {
        background: Item {}
        Kit.GlassButton { text: recorder.t("shortcutDefault") + " · " + recorder.defaultKey.replace(/\+/g, " + "); enabled: !recorder.waiting && !recorder.desktop.busy; onClicked: { recorder.candidate = recorder.defaultKey; recorder.failure = ""; captureField.forceActiveFocus(Qt.TabFocusReason) } }
        Kit.GlassButton { text: recorder.t("close"); enabled: !recorder.waiting; onClicked: recorder.close() }
        Kit.PrimaryButton { objectName: "shortcut-apply"; text: recorder.t("apply"); enabled: !!recorder.candidate && !recorder.failure && !recorder.waiting && !recorder.desktop.busy; onClicked: recorder.apply() }
    }
}
