import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Pane {
    id: strip
    required property var bridge
    property var audio: bridge.audio
    readonly property var metrics: bridge.metrics
    readonly property bool dark: bridge.appearance?.mode === "dark" || (bridge.appearance?.mode !== "light" && bridge.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.palettes[dark ? "dark" : "light"]
    readonly property bool active: audio.recordingStarted > 0
    property real clock: Date.now() / 1000
    readonly property int elapsed: active ? Math.max(0, Math.floor(clock - audio.recordingStarted)) : 0
    readonly property string timeText: String(Math.floor(elapsed / 60)).padStart(2, "0") + ":" + String(elapsed % 60).padStart(2, "0")
    readonly property var localeStrings: bridge.strings
    function t(key) { return localeStrings[key] || key }
    function tpl(key, values) { let text = t(key); for (const name in values) text = text.split("{" + name + "}").join(values[name]); return text }
    visible: active
    objectName: "recording-strip"
    padding: metrics.tight
    leftPadding: metrics.inset; rightPadding: metrics.inset
    implicitHeight: Math.max(metrics.navControl + metrics.tight, contentItem.implicitHeight + topPadding + bottomPadding)
    background: Rectangle { color: Qt.alpha(strip.palette.highlight, strip.metrics.selectionOpacity) }
    onActiveChanged: if (active) clock = Date.now() / 1000
    Connections { target: strip.audio; function onChanged() { if (strip.active) strip.clock = Date.now() / 1000 } }
    Timer { interval: 1000; repeat: true; running: strip.active; onTriggered: strip.clock = Date.now() / 1000 }
    contentItem: RowLayout {
        Kit.StatusBadge { objectName: "recording-elapsed"; Accessible.name: strip.t("recordingDraftHint"); text: strip.tpl("recordingElapsed", {time: strip.timeText}) }
        Label { visible: strip.width > strip.metrics.reading; text: strip.t("recordingDraftHint"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Item { Layout.fillWidth: true }
        Kit.GlassButton { objectName: "recording-stop"; implicitHeight: strip.metrics.compactControl; palette.buttonText: strip.colors.danger; icon.source: "icons/stop.svg"; text: strip.t("stop"); onClicked: strip.audio.cancel() }
    }
}
