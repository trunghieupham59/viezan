import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Own the popup/delegates in this document (Qt 6.8 imported-inline limitation).
Kit.GlassComboBox {
    id: picker
    readonly property var metrics: workbench.resources.metrics
    property string detailRole: "detail"
    property string groupRole: "group"
    readonly property var options: {
        const result = []
        for (let i = 0; i < count; ++i) {
            const item = model[i]
            result.push({label: textAt(i), detail: item && typeof item === "object" ? (item[detailRole] || "") : "",
                group: item && typeof item === "object" ? (item[groupRole] || "") : ""})
        }
        return result
    }
    implicitContentWidthPolicy: ComboBox.WidestText
    Layout.maximumWidth: Math.max(metrics.editor, parent ? parent.width : metrics.sidebar)
    ToolTip.visible: hovered && !popup.visible
    ToolTip.text: displayText
    onPopupChanged: if (popup && popup !== glassPopup) popup.parent = picker
    Binding { target: picker; property: "popup"; value: glassPopup; when: picker.usesGlass }
    property Popup glassPopup: Popup {
        id: glassPopup
        objectName: picker.objectName + "-popup"
        parent: Overlay.overlay
        popupType: Popup.Item
        modal: false; focus: true; padding: picker.metrics.small
        leftInset: 0; rightInset: 0; topInset: 0; bottomInset: 0
        implicitWidth: picker.metrics.sidebar + picker.metrics.large
        width: Math.min(Math.max(picker.width, implicitWidth), parent ? parent.width - picker.metrics.inset * 2 : implicitWidth)
        property point origin: Qt.point(0, 0)
        readonly property real below: parent ? parent.height - origin.y - picker.height - picker.metrics.inset : 0
        readonly property real above: origin.y - picker.metrics.inset
        readonly property bool downwards: below >= implicitContentHeight + padding * 2 || below >= above
        height: Math.min(implicitContentHeight + padding * 2, Math.max(picker.metrics.control, (downwards ? below : above) - picker.metrics.small))
        x: Math.max(picker.metrics.inset, Math.min(origin.x, parent ? parent.width - width - picker.metrics.inset : origin.x))
        y: downwards ? origin.y + picker.height + picker.metrics.small : origin.y - height - picker.metrics.small
        background: Kit.ReadingPanelSurface { radius: picker.metrics.controlRadius + picker.metrics.tight }
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        onAboutToShow: { origin = picker.mapToItem(parent, 0, 0); list.currentIndex = Math.max(0, picker.currentIndex) }
        onOpened: { list.positionViewAtIndex(list.currentIndex, ListView.Contain); list.forceActiveFocus(Qt.PopupFocusReason) }
        onClosed: picker.forceActiveFocus(Qt.PopupFocusReason)
        contentItem: ListView {
            id: list
            objectName: picker.objectName + "-list"
            implicitHeight: contentHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            model: picker.options
            keyNavigationEnabled: true
            function choose() {
                if (currentIndex < 0 || currentIndex >= count) return
                picker.currentIndex = currentIndex
                picker.activated(currentIndex)
                glassPopup.close()
            }
            Keys.onReturnPressed: choose()
            Keys.onEnterPressed: choose()
            Keys.onSpacePressed: choose()
            onCurrentIndexChanged: positionViewAtIndex(currentIndex, ListView.Contain)
            ScrollBar.vertical: ScrollBar {
                id: bar
                policy: list.contentHeight > list.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
                contentItem: Rectangle { implicitWidth: picker.metrics.tight; radius: width / 2; color: picker.palette.placeholderText }
            }
            delegate: Column {
                required property var modelData
                required property int index
                width: list.width - (bar.visible ? bar.width + picker.metrics.tight : 0)
                Kit.Eyebrow {
                    visible: !!modelData.group && (index === 0 || picker.options[index - 1].group !== modelData.group)
                    text: modelData.group; width: parent.width
                    padding: picker.metrics.small
                }
                Kit.PanelRow {
                    width: parent.width
                    implicitHeight: Math.max(picker.metrics.compactControl + picker.metrics.hairline * 2, implicitContentHeight + topPadding + bottomPadding)
                    text: modelData.label; detail: modelData.detail
                    selected: picker.currentIndex === index
                    highlighted: list.activeFocus && list.currentIndex === index
                    Accessible.name: text + (detail ? ", " + detail : "")
                    onClicked: { list.currentIndex = index; list.choose() }
                }
            }
        }
    }
}
