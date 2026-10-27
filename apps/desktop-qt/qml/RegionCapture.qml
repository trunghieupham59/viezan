import QtQuick
import QtQuick.Controls
Window {
    id: capture
    required property var bridge
    visible: false
    flags: Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    color: "transparent"
    property point startPoint
    property rect selection: Qt.rect(0,0,0,0)
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Connections {
        target: capture.bridge
        function onCaptureReady(image, x, y, width, height) {
            capture.x = x; capture.y = y; capture.width = width; capture.height = height
            preview.source = image; capture.selection = Qt.rect(0,0,0,0)
            capture.show(); capture.raise(); capture.requestActivate(); keys.forceActiveFocus()
        }
        function onCaptureFinished() { capture.hide(); preview.source = "" }
    }
    Image { id: preview; anchors.fill: parent; cache: false; fillMode: Image.Stretch }
    Rectangle {
        x: capture.selection.x; y: capture.selection.y; width: capture.selection.width; height: capture.selection.height
        color: Qt.alpha(palette.highlight, capture.bridge.resources.metrics.selectionOpacity)
        border.width: capture.bridge.resources.metrics.hairline; border.color: palette.highlight
        SystemPalette { id: palette }
    }
    MouseArea {
        anchors.fill: parent; cursorShape: Qt.CrossCursor
        onPressed: mouse => { capture.startPoint = Qt.point(mouse.x,mouse.y); capture.selection = Qt.rect(mouse.x,mouse.y,0,0) }
        onPositionChanged: mouse => { if (pressed) { var x = Math.max(0,Math.min(width,mouse.x)), y = Math.max(0,Math.min(height,mouse.y)); capture.selection = Qt.rect(Math.min(x,capture.startPoint.x),Math.min(y,capture.startPoint.y),Math.abs(x-capture.startPoint.x),Math.abs(y-capture.startPoint.y)) } }
        onReleased: {
            if (capture.selection.width > 0 && capture.selection.height > 0) capture.bridge.finishCapture(capture.selection.x/width,capture.selection.y/height,capture.selection.width/width,capture.selection.height/height)
            else capture.bridge.cancelCapture()
        }
    }
    Item {
        id: keys; anchors.fill: parent; focus: true
        Accessible.name: capture.t("captureRegionHint")
        Keys.onEscapePressed: capture.bridge.cancelCapture()
        Keys.onReturnPressed: capture.bridge.finishCapture(0,0,1,1)
    }
    onClosing: event => { event.accepted = false; capture.bridge.cancelCapture() }
}
