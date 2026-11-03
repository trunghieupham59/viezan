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
    readonly property bool glass: bridge.state.appearance?.preset === "glass"
    readonly property bool darkMode: bridge.state.appearance?.mode === "dark" || (bridge.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property bool lightGlass: glass && !darkMode
    readonly property real headerHeight: metrics.navControl + metrics.small
    readonly property var chromeColors: bridge.resources.themePalettes[(bridge.state.appearance?.preset || "graphite") + ":" + (bridge.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
    function focusInitial() { search.forceActiveFocus() }
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    readonly property var systemIDs: ["apps", "thermal", "utilities", "settings"]
    function available(id) { return id === "settings" || !(bridge.state.disabledModules || []).includes(id === "everywhere" ? "translate" : id) }
    padding: glass ? metrics.small + metrics.tight : metrics.small
    background: Item {
        Rectangle { anchors.fill: parent; color: navigation.lightGlass ? "transparent" : navigation.palette.window }
        Kit.ChromeSurface {
            objectName: "navigation-glass-pane"
            visible: navigation.glass
            anchors.fill: parent
            anchors.margins: navigation.metrics.small
            anchors.topMargin: navigation.lightGlass && !navigation.dismissible ? navigation.headerHeight + navigation.metrics.small : navigation.metrics.small
            radius: navigation.metrics.chromeSurfaceRadius
            fillColor: Qt.tint(navigation.chromeColors["sidebar-bg"], navigation.chromeColors["primary-nav-material"])
            edgeColor: navigation.chromeColors["material-border"]
            edgeHighlight: navigation.chromeColors["material-highlight"]
        }
    }
    component NavigationContent: RowLayout {
        required property var control
        spacing: navigation.metrics.small
        Item { visible: !navigation.expanded; Layout.fillWidth: true }
        // Reuse the control icon renderer; the label is independently left aligned.
        IconImage { visible: navigation.glass || !(navigation.expanded && control === search); source: control.icon.source; color: !control.enabled ? control.palette.placeholderText : control.checked ? control.palette.link : control.palette.buttonText; sourceSize.width: navigation.metrics.icon; sourceSize.height: navigation.metrics.icon; Layout.preferredWidth: navigation.metrics.icon; Layout.preferredHeight: navigation.metrics.icon }
        Label { visible: navigation.expanded; text: control.text; Accessible.ignored: true; color: !control.enabled ? control.palette.placeholderText : control.checked ? (navigation.glass ? navigation.chromeColors["chrome-item-active-fg"] : control.palette.link) : control.palette.buttonText; font.weight: control.checked ? Font.DemiBold : Font.Normal; elide: Text.ElideRight; Layout.fillWidth: true }
        Label { visible: navigation.expanded && control === search; Accessible.ignored: true; text: Qt.platform.os === "osx" ? "⌘ K" : "Ctrl+K"; color: control.palette.placeholderText }
        Item { visible: !navigation.expanded; Layout.fillWidth: true }
    }
    component NavigationBackground: Rectangle {
        required property var control
        readonly property bool restingLens: control.checked || control === search
        readonly property bool interacting: control.enabled && (control.hovered || control.down)
        readonly property bool glassSurface: navigation.glass && (restingLens || interacting)
        // The shared pane stays quiet; selection is a persistent capsule lens,
        // while hover reveals a softer one without moving the row or its label.
        radius: navigation.glass ? height / 2 : navigation.metrics.controlRadius
        color: navigation.glass ? "transparent" : control.checked ? Qt.tint(control.palette.window, Qt.alpha(control.palette.highlight, navigation.metrics.selectionOpacity)) : control.hovered ? control.palette.midlight : "transparent"
        Kit.ControlGlassSurface {
            anchors.fill: parent
            visible: parent.glassSurface
            radius: parent.radius
            opacity: parent.restingLens || parent.control.down ? 1 : navigation.metrics.selectionOpacity * 4
            pressed: parent.control.enabled && parent.control.down
            hovered: parent.control.enabled && parent.control.hovered
            inactive: !parent.control.enabled
        }
        // Keep native keyboard focus above the decorative rim.
        Rectangle {
            anchors.fill: parent
            radius: parent.radius
            color: "transparent"
            visible: parent.control.visualFocus
            border.width: navigation.metrics.hairline
            border.color: parent.control.palette.highlight
        }
        border.width: !navigation.glass && control.visualFocus ? navigation.metrics.hairline : 0
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
            Kit.GlassToolButton { id: collapseToggle; objectName: "navigation-collapse"; implicitWidth: navigation.metrics.control; implicitHeight: navigation.metrics.control; icon.source: "icons/collapse.svg"; icon.color: palette.buttonText; text: navigation.t("collapseNavigation"); display: AbstractButton.IconOnly; Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text; onClicked: navigation.toggleRequested(collapseToggle) }
        }
        RowLayout {
            Layout.fillWidth: true
            // The light pane starts below the fixed header; keep the brand
            // inside its rounded shoulder in expanded, rail and overlay modes.
            Layout.topMargin: navigation.lightGlass ? (navigation.expanded || navigation.dismissible ? navigation.metrics.small : navigation.headerHeight + navigation.metrics.small) : 0
            Layout.minimumHeight: navigation.metrics.compactControl
            Image { source: "brand.png"; sourceSize.width: navigation.metrics.brand; sourceSize.height: navigation.metrics.brand; fillMode: Image.PreserveAspectFit; Layout.alignment: Qt.AlignHCenter }
            Label { visible: navigation.expanded; text: "Viezan"; font.bold: true; Layout.fillWidth: true; elide: Text.ElideRight }
            Kit.GlassToolButton { visible: navigation.dismissible; implicitWidth: navigation.metrics.control; implicitHeight: navigation.metrics.control; icon.source: "icons/close.svg"; icon.color: palette.buttonText; Accessible.name: navigation.t("close"); onClicked: navigation.dismissed() }
        }
        Kit.GlassButton {
            id: search
            glassMaterial: false
            objectName: "navigation-search"
            leftPadding: navigation.glass ? navigation.metrics.tight : navigation.metrics.small
            rightPadding: leftPadding
            contentItem: NavigationContent { control: search }
            background: NavigationBackground { control: search }
            Layout.fillWidth: navigation.expanded || !navigation.glass
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredWidth: navigation.glass && !navigation.expanded ? navigation.metrics.navControl : -1
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
        Rectangle {
            visible: navigation.expanded
            color: navigation.palette.midlight
            implicitHeight: navigation.metrics.hairline
            Layout.fillWidth: true
            Layout.leftMargin: navigation.metrics.small
            Layout.rightMargin: navigation.metrics.small
        }
        // Storage information is static; a neutral device icon keeps it distinct
        // from live activity indicators and the hint explains AI processing.
        RowLayout {
            visible: navigation.expanded
            spacing: navigation.metrics.small
            Layout.fillWidth: true
            Layout.margins: navigation.metrics.small
            IconImage {
                source: "icons/localModels.svg"
                color: navigation.palette.placeholderText
                sourceSize.width: navigation.metrics.icon
                sourceSize.height: navigation.metrics.icon
                Layout.preferredWidth: navigation.metrics.icon
                Layout.preferredHeight: navigation.metrics.icon
                Layout.alignment: Qt.AlignTop
                Accessible.ignored: true
            }
            Label {
                text: navigation.t("privacyTitle")
                color: navigation.palette.placeholderText
                wrapMode: Text.Wrap
                Layout.fillWidth: true
                Layout.minimumWidth: 0
                Accessible.description: navigation.t("privacyHint")
            }
            ToolTip.visible: storageHover.hovered
            ToolTip.text: navigation.t("privacyHint")
            HoverHandler { id: storageHover }
        }
    }
    component NavItem: Kit.GlassButton {
        id: navItem
        glassMaterial: false
        leftPadding: navigation.glass ? navigation.metrics.tight : navigation.metrics.small
        rightPadding: leftPadding
        contentItem: NavigationContent { control: navItem }
        background: NavigationBackground { control: navItem }
        required property var entry
        Layout.fillWidth: navigation.expanded || !navigation.glass
        Layout.alignment: Qt.AlignHCenter
        Layout.preferredWidth: navigation.glass && !navigation.expanded ? navigation.metrics.navControl : -1
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
