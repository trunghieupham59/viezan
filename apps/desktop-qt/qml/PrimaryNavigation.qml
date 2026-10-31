import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Controls.impl

Pane {
    id: navigation
    required property var bridge
    required property string route
    property bool expanded: false
    property bool dismissible: false
    signal selected(string route)
    signal commands(var opener)
    signal dismissed()
    signal toggleRequested(var opener)
    readonly property var metrics: bridge.resources.metrics
    function focusInitial() { search.forceActiveFocus() }
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    readonly property var systemIDs: ["apps", "thermal", "utilities", "settings"]
    function available(id) { return id === "settings" || !(bridge.state.disabledModules || []).includes(id === "everywhere" ? "translate" : id) }
    padding: metrics.small
    background: Rectangle { color: navigation.palette.window }
    component NavigationContent: RowLayout {
        required property var control
        spacing: navigation.metrics.small
        Item { visible: !navigation.expanded; Layout.fillWidth: true }
        // Reuse the control icon renderer; the label is independently left aligned.
        IconImage { visible: !(navigation.expanded && control === search); source: control.icon.source; color: control.checked ? control.palette.link : control.palette.buttonText; sourceSize.width: navigation.metrics.icon; sourceSize.height: navigation.metrics.icon; Layout.preferredWidth: navigation.metrics.icon; Layout.preferredHeight: navigation.metrics.icon }
        Label { visible: navigation.expanded; text: control.text; Accessible.ignored: true; color: control.checked ? control.palette.link : control.palette.buttonText; font.weight: control.checked ? Font.DemiBold : Font.Normal; elide: Text.ElideRight; Layout.fillWidth: true }
        Label { visible: navigation.expanded && control === search; Accessible.ignored: true; text: Qt.platform.os === "osx" ? "⌘ K" : "Ctrl+K"; color: control.palette.placeholderText }
        Item { visible: !navigation.expanded; Layout.fillWidth: true }
    }
    component NavigationBackground: Rectangle {
        required property var control
        radius: navigation.metrics.controlRadius
        color: control.checked ? Qt.tint(control.palette.window, Qt.alpha(control.palette.highlight, navigation.metrics.selectionOpacity)) : control.hovered ? control.palette.midlight : "transparent"
        border.width: control.visualFocus ? navigation.metrics.hairline : 0
        border.color: control.palette.highlight
    }
    Accessible.name: t("primaryNavigation")
    ColumnLayout {
        anchors.fill: parent
        spacing: navigation.metrics.small
        // Review 18: the collapse control owns the sidebar's first row.
        RowLayout {
            visible: navigation.expanded && !navigation.dismissible
            Layout.fillWidth: true
            Layout.preferredHeight: navigation.metrics.navControl
            Item { Layout.fillWidth: true }
            ToolButton { id: collapseToggle; objectName: "navigation-collapse"; implicitWidth: navigation.metrics.control; implicitHeight: navigation.metrics.control; icon.source: "icons/collapse.svg"; icon.color: palette.buttonText; text: navigation.t("collapseNavigation"); display: AbstractButton.IconOnly; Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text; onClicked: navigation.toggleRequested(collapseToggle) }
        }
        RowLayout {
            Layout.fillWidth: true
            Layout.minimumHeight: navigation.metrics.navControl + navigation.metrics.inset
            Image { source: "brand.png"; sourceSize.width: navigation.metrics.brand; sourceSize.height: navigation.metrics.brand; fillMode: Image.PreserveAspectFit; Layout.alignment: Qt.AlignHCenter }
            Label { visible: navigation.expanded; text: "viezan"; font.bold: true; Layout.fillWidth: true; elide: Text.ElideRight }
            ToolButton { visible: navigation.dismissible; implicitWidth: navigation.metrics.control; implicitHeight: navigation.metrics.control; icon.source: "icons/close.svg"; icon.color: palette.buttonText; Accessible.name: navigation.t("close"); onClicked: navigation.dismissed() }
        }
        Button {
            id: search
            leftPadding: navigation.metrics.small
            rightPadding: navigation.metrics.small
            contentItem: NavigationContent { control: search }
            background: NavigationBackground { control: search }
            Layout.fillWidth: true
            Layout.preferredHeight: navigation.metrics.navControl
            display: navigation.expanded ? AbstractButton.TextBesideIcon : AbstractButton.IconOnly
            text: navigation.t("searchEverything")
            icon.source: "icons/search.svg"
            icon.color: palette.buttonText
            flat: true
            Accessible.name: text
            ToolTip.visible: hovered
            ToolTip.text: text
            onClicked: navigation.commands(search)
        }
        // Review 18: one workspace list, then a system group that ends in Settings.
        Repeater {
            model: navigation.bridge.resources.navigation.filter(item => !navigation.systemIDs.includes(item.id) && navigation.available(item.id))
            delegate: NavItem { required property var modelData; entry: modelData }
        }
        Kit.Eyebrow { visible: navigation.expanded; text: navigation.t("groupSystem"); Layout.leftMargin: navigation.metrics.small; Layout.topMargin: navigation.metrics.gap }
        Rectangle { visible: !navigation.expanded; color: palette.midlight; implicitHeight: navigation.metrics.hairline; Layout.fillWidth: true; Layout.topMargin: navigation.metrics.small; Layout.bottomMargin: navigation.metrics.small }
        Repeater {
            model: navigation.bridge.resources.navigation.filter(item => navigation.systemIDs.includes(item.id) && navigation.available(item.id))
            delegate: NavItem { required property var modelData; entry: modelData }
        }
        Item { Layout.fillHeight: true }
        // Local-first reminder; content stays on the device unless a provider is chosen.
        RowLayout {
            visible: navigation.expanded
            spacing: navigation.metrics.small
            Layout.fillWidth: true
            Layout.margins: navigation.metrics.small
            Kit.StatusDot { Layout.alignment: Qt.AlignTop; Layout.topMargin: navigation.metrics.tight }
            ColumnLayout {
                spacing: 0
                Layout.fillWidth: true
                Label { text: navigation.t("privacyTitle"); color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
                Label { text: navigation.t("privacyHint"); color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
            }
        }
    }
    component NavItem: Button {
        id: navItem
        leftPadding: navigation.metrics.small
        rightPadding: navigation.metrics.small
        contentItem: NavigationContent { control: navItem }
        background: NavigationBackground { control: navItem }
        required property var entry
        Layout.fillWidth: true
        Layout.preferredHeight: navigation.metrics.navControl
        display: navigation.expanded ? AbstractButton.TextBesideIcon : AbstractButton.IconOnly
        text: navigation.t(entry.title)
        icon.source: "icons/" + entry.icon + ".svg"
        icon.color: palette.buttonText
        checkable: true
        autoExclusive: true
        checked: navigation.route === entry.id
        enabled: !navigation.bridge.loadBlocked || entry.id === "settings"
        flat: true
        Accessible.name: text
        Accessible.selected: checked
        ToolTip.visible: hovered
        ToolTip.text: text
        onClicked: navigation.selected(entry.id)
    }
}
