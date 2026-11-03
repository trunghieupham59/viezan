import QtQuick
import QtQuick.Controls
import QtQuick.Controls.impl
import QtQuick.Layouts
import QtQuick.Shapes
import QtQuick.Effects

// Review 18 page vocabulary shared by the Qt workspaces: intro, eyebrow,
// bounded cards, label rows, key caps and status badges. Every value reads
// generated metrics and the palette set on the application window.
QtObject {
    // A bounded, opaque chrome surface with a fine illuminated rim. Qt does
    // not expose Apple's material or desktop backdrop through this component.
    component ChromeSurface: Rectangle {
        id: chrome
        property color fillColor: "transparent"
        property bool illuminatedFill: false
        property color fillHighlight: fillColor
        property color edgeColor: "transparent"
        property color edgeHighlight: edgeColor
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var themeColors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
        radius: metrics.chromeSurfaceRadius
        gradient: Gradient {
            GradientStop { position: 0; color: chrome.edgeHighlight }
            GradientStop { position: 1; color: chrome.edgeColor }
        }
        Rectangle {
            anchors.fill: parent
            anchors.margins: chrome.metrics.hairline
            radius: Math.max(0, chrome.radius - chrome.metrics.hairline)
            color: chrome.fillColor
            gradient: chrome.illuminatedFill ? illuminatedGradient : null
            Gradient {
                id: illuminatedGradient
                GradientStop { position: 0; color: chrome.fillHighlight }
                GradientStop { position: 1; color: chrome.fillColor }
            }
        }
        Accessible.ignored: true
    }
    // Control material stays translucent over its local surface. The vector
    // rings leave the centre clear; they are not an opaque border rectangle.
    component ControlGlassSurface: Item {
        id: glassSurface
        property real radius: height / 2
        property bool prominent: false
        property bool pressed: false
        property bool hovered: false
        property bool inactive: false
        readonly property var metrics: workbench.resources.metrics
        readonly property bool darkMode: workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
        readonly property color inkShadow: colors[darkMode ? "app-bg" : "chrome-fg-strong"]
        readonly property color tint: colors[darkMode || pressed ? "action-active" : "action"]
        readonly property bool accelerated: GraphicsInfo.api !== GraphicsInfo.Software && GraphicsInfo.api !== GraphicsInfo.Unknown
        // The effect samples only this sibling face, never a parent containing
        // itself. Software rendering keeps the same material and a quiet edge.
        Rectangle {
            id: glassFace
            anchors.fill: parent
            visible: !glassSurface.accelerated
            radius: glassSurface.radius
            gradient: Gradient {
                GradientStop { position: 0; color: glassSurface.inactive ? Qt.alpha(glassSurface.colors["surface-subtle"], 0.72) : glassSurface.prominent ? Qt.alpha(glassSurface.tint, 0.98) : Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? (glassSurface.hovered ? 0.18 : 0.13) : (glassSurface.hovered ? 0.70 : 0.52)) }
                GradientStop { position: 0.28; color: glassSurface.inactive ? Qt.alpha(glassSurface.colors["surface-subtle"], 0.72) : glassSurface.prominent ? Qt.alpha(glassSurface.tint, 0.97) : Qt.alpha(glassSurface.colors["surface-raised"], glassSurface.darkMode ? 0.38 : 0.16) }
                GradientStop { position: 0.64; color: glassSurface.inactive ? Qt.alpha(glassSurface.colors["surface-subtle"], 0.72) : glassSurface.prominent ? Qt.alpha(glassSurface.colors["action-active"], 0.98) : Qt.alpha(glassSurface.colors["primary-nav-material"], glassSurface.darkMode ? 0.48 : 0.38) }
                GradientStop { position: 1; color: glassSurface.inactive ? Qt.alpha(glassSurface.colors["surface-subtle"], 0.72) : glassSurface.prominent ? Qt.alpha(glassSurface.colors["action-active"], 0.98) : Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? 0.08 : 0.26) }
            }
        }
        Loader {
            anchors.fill: parent
            active: glassSurface.visible && glassSurface.accelerated
            sourceComponent: MultiEffect {
                source: glassFace
                shadowEnabled: true
                shadowColor: glassSurface.inkShadow
                shadowOpacity: glassSurface.inactive ? 0.04 : glassSurface.darkMode ? 0.28 : 0.16
                shadowBlur: 0.35
                blurMax: glassSurface.metrics.small
                shadowVerticalOffset: glassSurface.pressed ? glassSurface.metrics.hairline : glassSurface.metrics.hairline * 2
            }
        }
        Rectangle {
            visible: !glassSurface.accelerated
            x: -glassSurface.metrics.hairline
            y: glassSurface.metrics.hairline
            width: parent.width + glassSurface.metrics.hairline * 2
            height: parent.height + glassSurface.metrics.hairline
            radius: glassSurface.radius + glassSurface.metrics.hairline
            color: "transparent"
            border.width: glassSurface.metrics.hairline
            border.color: Qt.alpha(glassSurface.inkShadow, glassSurface.inactive ? 0.03 : 0.10)
        }
        Rectangle {
            anchors.fill: parent
            visible: !glassSurface.inactive && (glassSurface.hovered || glassSurface.pressed)
            radius: glassSurface.radius
            color: Qt.alpha(glassSurface.inkShadow, glassSurface.pressed ? 0.16 : 0.06)
        }
        // Asymmetric upper reflection and lower caustic, with a clear centre.
        Shape {
            anchors.fill: parent
            opacity: glassSurface.inactive ? 0.45 : 1
            ShapePath {
                strokeWidth: 0
                fillRule: ShapePath.OddEvenFill
                fillGradient: LinearGradient {
                    x1: 0; y1: 0; x2: glassSurface.width * 0.22; y2: glassSurface.height
                    GradientStop { position: 0; color: Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? (glassSurface.hovered ? 0.88 : 0.68) : 0.96) }
                    GradientStop { position: 0.32; color: Qt.alpha(glassSurface.colors["material-highlight"], 0.22) }
                    GradientStop { position: 0.62; color: Qt.alpha(glassSurface.colors["material-border"], 0.24) }
                    GradientStop { position: 1; color: Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? 0.42 : 0.78) }
                }
                PathRectangle { width: glassSurface.width; height: glassSurface.height; radius: glassSurface.radius }
                PathRectangle { x: glassSurface.metrics.hairline; y: x; width: Math.max(0, glassSurface.width - x * 2); height: Math.max(0, glassSurface.height - y * 2); radius: Math.max(0, glassSurface.radius - x) }
            }
            ShapePath {
                strokeWidth: 0
                fillRule: ShapePath.OddEvenFill
                fillGradient: LinearGradient {
                    x1: glassSurface.width; y1: 0; x2: 0; y2: glassSurface.height
                    GradientStop { position: 0; color: Qt.alpha(glassSurface.inkShadow, glassSurface.darkMode ? 0.30 : 0.12) }
                    GradientStop { position: 0.5; color: "transparent" }
                    GradientStop { position: 1; color: Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? 0.14 : 0.46) }
                }
                PathRectangle { x: glassSurface.metrics.hairline; y: x; width: Math.max(0, glassSurface.width - x * 2); height: Math.max(0, glassSurface.height - y * 2); radius: Math.max(0, glassSurface.radius - x) }
                PathRectangle { x: glassSurface.metrics.hairline * 2; y: x; width: Math.max(0, glassSurface.width - x * 2); height: Math.max(0, glassSurface.height - y * 2); radius: Math.max(0, glassSurface.radius - x) }
            }
        }
        Accessible.ignored: true
    }
    // Native controls still own input, focus and accessibility. Shared groups
    // use one outer glass object; quiet child controls add only a hover tint.
    component ControlLens: Item {
        id: lens
        required property var control
        property bool active: false
        property bool prominent: false
        property bool destructive: false
        property bool quiet: false
        property bool selectionMarker: true
        anchors.fill: parent
        z: -1
        visible: active
        readonly property var metrics: workbench.resources.metrics
        ControlGlassSurface { anchors.fill: parent; visible: lens.active && !lens.quiet; prominent: lens.prominent && !lens.destructive; pressed: lens.control.down; hovered: lens.control.hovered; inactive: !lens.control.enabled }
        Rectangle { anchors.fill: parent; visible: lens.quiet && (lens.control.hovered || lens.control.down || lens.destructive); radius: height / 2; color: Qt.alpha(lens.control.palette.buttonText, lens.metrics.selectionOpacity); Accessible.ignored: true }
        Binding { target: lens.control.background; property: "visible"; value: false; when: lens.active }
        Rectangle { anchors.fill: parent; color: "transparent"; radius: height / 2; border.width: lens.control.visualFocus ? lens.metrics.hairline * 2 : 0; border.color: lens.control.palette.link; Accessible.ignored: true }
        Rectangle { visible: lens.selectionMarker && !lens.quiet && !!lens.control.checkable && !!lens.control.checked; anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom; anchors.bottomMargin: lens.metrics.tight; width: lens.metrics.small; height: lens.metrics.hairline * 2; radius: height / 2; color: lens.control.palette.link; Accessible.ignored: true }
    }
    // App-wide action primitives. Geometry, native content, shortcuts and
    // disabled semantics are inherited from the active Qt control style.
    component GlassButton: Button {
        id: glassButton
        property bool glassMaterial: true
        property bool glassProminent: highlighted
        readonly property bool usesGlass: glassMaterial && workbench.state.appearance?.preset === "glass"
        ControlLens { control: glassButton; active: glassButton.usesGlass; prominent: glassButton.glassProminent }
    }
    component GlassToolButton: ToolButton {
        id: glassToolButton
        property bool glassMaterial: true
        readonly property bool usesGlass: glassMaterial && workbench.state.appearance?.preset === "glass"
        ControlLens { control: glassToolButton; active: glassToolButton.usesGlass }
    }
    component GlassComboBox: ComboBox {
        id: glassComboBox
        property bool glassMaterial: true
        readonly property bool usesGlass: glassMaterial && workbench.state.appearance?.preset === "glass"
        ControlLens { control: glassComboBox; active: glassComboBox.usesGlass }
    }
    // Search remains a native TextField: composition, selection and its caller's
    // key handlers stay intact. The editing plane is opaque and inset, while
    // the illuminated capsule edge belongs to the Glass control family.
    component SearchField: TextField {
        id: searchField
        property bool compact: false
        property bool embedded: false
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        readonly property real fieldRadius: glass ? height / 2 : metrics.controlRadius
        implicitHeight: compact ? metrics.compactControl : metrics.control
        leftPadding: (embedded ? 0 : metrics.gap) + metrics.icon + metrics.small
        rightPadding: embedded ? 0 : metrics.gap
        selectByMouse: true
        background: Item {
            visible: !searchField.embedded
            ChromeSurface {
                anchors.fill: parent
                radius: searchField.fieldRadius
                fillColor: Qt.tint(searchField.palette.window, searchField.palette.base)
                edgeColor: searchField.palette.midlight
                edgeHighlight: searchField.glass ? themeColors["material-highlight"] : edgeColor
            }
            Rectangle {
                anchors.fill: parent
                radius: searchField.fieldRadius
                color: "transparent"
                border.width: searchField.activeFocus ? searchField.metrics.hairline * 2 : 0
                border.color: searchField.palette.mid
                Accessible.ignored: true
            }
        }
        IconImage {
            x: searchField.embedded ? 0 : searchField.metrics.gap
            anchors.verticalCenter: parent.verticalCenter
            source: "icons/search.svg"
            sourceSize.width: searchField.metrics.icon
            sourceSize.height: searchField.metrics.icon
            color: searchField.enabled ? searchField.palette.placeholderText : searchField.palette.disabled.text
            Accessible.ignored: true
        }
    }
    // Reading panels share one opaque face. Only their rim and bounded local
    // shadow convey elevation; text never competes with a blurred backdrop.
    component ReadingPanelSurface: Item {
        id: readingPanel
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
        property real radius: glass ? metrics.chromeSurfaceRadius : metrics.surfaceRadius
        property color fillColor: Qt.tint(colors["sidebar-bg"], colors["surface"])
        Rectangle {
            visible: readingPanel.glass
            x: -readingPanel.metrics.hairline; y: readingPanel.metrics.hairline * 2
            width: parent.width + readingPanel.metrics.hairline * 2; height: parent.height
            radius: readingPanel.radius + readingPanel.metrics.hairline
            color: "transparent"
            border.width: readingPanel.metrics.hairline * 2
            border.color: Qt.alpha(readingPanel.colors[readingPanel.darkMode ? "app-bg" : "chrome-fg-strong"], readingPanel.darkMode ? 0.28 : 0.10)
        }
        ChromeSurface {
            anchors.fill: parent
            radius: readingPanel.radius
            fillColor: readingPanel.fillColor
            edgeColor: readingPanel.colors["border"]
            edgeHighlight: readingPanel.glass ? readingPanel.colors["material-highlight"] : edgeColor
        }
        Accessible.ignored: true
    }
    // One quiet group, one raised selected segment. Native TabBar/TabButton
    // continue to own mutual exclusion, arrow keys and accessible tab roles.
    component FilterGroup: TabBar {
        id: filterGroup
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        property bool selectionReady: false
        signal selectionChanged(int index)
        Component.onCompleted: selectionReady = true
        onCurrentIndexChanged: if (selectionReady && currentIndex >= 0) selectionChanged(currentIndex)
        padding: glass ? metrics.hairline * 2 : 0
        spacing: glass ? metrics.tight : 0
        implicitHeight: glass ? metrics.compactControl + padding * 2 : Math.max(implicitBackgroundHeight + topInset + bottomInset, implicitContentHeight + topPadding + bottomPadding)
        property Item glassGroupBackground: Item {
            parent: filterGroup
            anchors.fill: parent
            z: -1
            visible: filterGroup.glass
            ChromeSurface {
                anchors.fill: parent
                radius: height / 2
                fillColor: Qt.tint(filterGroup.palette.window, filterGroup.palette.alternateBase)
                edgeColor: filterGroup.palette.midlight
                edgeHighlight: themeColors["material-highlight"]
            }
        }
        Binding { target: filterGroup.background; property: "visible"; value: false; when: filterGroup.glass }
    }
    component FilterButton: TabButton {
        id: filterButton
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        implicitHeight: glass ? metrics.compactControl : metrics.control
        font.weight: checked ? Font.DemiBold : Font.Normal
        ControlLens { control: filterButton; active: filterButton.glass; quiet: !filterButton.checked; selectionMarker: false }
    }
    // Static waveform means the existing record action; it is not a live meter.
    component VoiceGlyph: Item {
        property color color: "transparent"
        readonly property var metrics: workbench.resources.metrics
        implicitWidth: metrics.icon
        implicitHeight: metrics.icon
        Row {
            anchors.centerIn: parent
            spacing: parent.metrics.hairline * 2
            // This icon has five fixed bars. Avoid a deferred delegate inside
            // an inline component, which Qt 6.8 can miscreate during Loader setup.
            Rectangle { width: workbench.resources.metrics.hairline * 2; height: workbench.resources.metrics.icon * 0.4; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
            Rectangle { width: workbench.resources.metrics.hairline * 2; height: workbench.resources.metrics.icon * 0.75; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
            Rectangle { width: workbench.resources.metrics.hairline * 2; height: workbench.resources.metrics.icon; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
            Rectangle { width: workbench.resources.metrics.hairline * 2; height: workbench.resources.metrics.icon * 0.6; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
            Rectangle { width: workbench.resources.metrics.hairline * 2; height: workbench.resources.metrics.icon * 0.35; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
        }
        Accessible.ignored: true
    }
    component PageIntro: ColumnLayout {
        id: intro
        property string title
        property string subtitle
        readonly property var metrics: workbench.resources.metrics
        spacing: metrics.small
        Label { text: intro.title; font.bold: true; font.pointSize: Qt.application.font.pointSize * intro.metrics.headingScale; wrapMode: Text.Wrap; Layout.fillWidth: true; Accessible.role: Accessible.Heading }
        Label { visible: !!intro.subtitle; text: intro.subtitle; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    component Eyebrow: Label {
        font.bold: true
        font.capitalization: Font.AllUppercase
        font.letterSpacing: workbench.resources.metrics.hairline
        font.pointSize: Qt.application.font.pointSize * workbench.resources.metrics.captionScale
        color: palette.placeholderText
        Accessible.role: Accessible.Heading
    }
    component SectionTitle: Label {
        font.bold: true
        font.pointSize: Qt.application.font.pointSize * workbench.resources.metrics.sectionScale
        Accessible.role: Accessible.Heading
    }
    // One bounded surface: no nested frames.
    component Card: Pane {
        id: card
        property bool selected: false
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        padding: metrics.inset
        background: Item {
            Rectangle {
                anchors.fill: parent
                visible: !card.glass
                radius: card.metrics.radius
                color: card.selected ? Qt.tint(card.palette.base, Qt.alpha(card.palette.highlight, card.metrics.selectionOpacity)) : card.palette.base
                border.width: card.metrics.hairline
                border.color: card.selected ? card.palette.highlight : card.palette.midlight
            }
            ChromeSurface {
                anchors.fill: parent
                visible: card.glass
                readonly property color baseColor: Qt.tint(card.palette.window, card.palette.base)
                radius: card.metrics.chromeCardRadius
                fillColor: card.selected ? Qt.tint(baseColor, Qt.alpha(card.palette.highlight, card.metrics.selectionOpacity)) : baseColor
                illuminatedFill: !darkMode && !card.selected
                fillHighlight: Qt.tint(fillColor, themeColors["surface-raised"])
                edgeColor: card.selected ? card.palette.highlight : card.palette.midlight
                edgeHighlight: !card.selected ? themeColors["material-highlight"] : edgeColor
            }
        }
    }
    // GroupBox drawn as a Review 18 settings card: the title is a header bar inside
    // the bounded surface, separated from the rows by an edge-to-edge divider.
    component CardBox: GroupBox {
        id: box
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        readonly property real headerHeight: title ? metrics.navControl + metrics.tight : 0
        padding: metrics.inset
        topPadding: headerHeight + metrics.inset
        label: Item {
            visible: !!box.title
            width: box.width
            height: box.headerHeight
            Label { x: box.metrics.inset; width: parent.width - box.metrics.inset * 2; anchors.verticalCenter: parent.verticalCenter; text: box.title; font.bold: true; elide: Text.ElideRight; Accessible.role: Accessible.Heading }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: box.metrics.hairline; color: box.palette.midlight }
        }
        background: Item {
            Rectangle {
                anchors.fill: parent
                visible: !box.glass
                radius: box.metrics.radius
                color: box.palette.base
                border.width: box.metrics.hairline
                border.color: box.palette.midlight
            }
            ChromeSurface {
                anchors.fill: parent
                visible: box.glass
                radius: box.metrics.chromeCardRadius
                fillColor: Qt.tint(box.palette.window, box.palette.base)
                illuminatedFill: !darkMode
                fillHighlight: Qt.tint(fillColor, themeColors["surface-raised"])
                edgeColor: box.palette.midlight
                edgeHighlight: themeColors["material-highlight"]
            }
        }
    }
    // Label row: title, optional detail, trailing controls; dividers between rows.
    component CardRow: ColumnLayout {
        id: row
        property string title
        property string detail
        property bool divider: true
        default property alias trailing: slot.data
        readonly property var metrics: workbench.resources.metrics
        spacing: 0
        Layout.fillWidth: true
        GridLayout {
            columns: row.width >= row.metrics.sidebar * 2 ? 2 : 1
            columnSpacing: row.metrics.inset
            rowSpacing: row.metrics.small
            Layout.fillWidth: true
            Layout.topMargin: row.metrics.small
            Layout.bottomMargin: row.metrics.small
            ColumnLayout {
                spacing: row.metrics.tight
                Layout.fillWidth: true
                Label { text: row.title; font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Label { visible: !!row.detail; text: row.detail; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
            }
            RowLayout { id: slot; Layout.fillWidth: true; spacing: row.metrics.small }
        }
        Rectangle { visible: row.divider; color: palette.midlight; implicitHeight: row.metrics.hairline; Layout.fillWidth: true }
    }
    component KeyCap: Label {
        id: cap
        readonly property var metrics: workbench.resources.metrics
        leftPadding: metrics.small
        rightPadding: metrics.small
        topPadding: metrics.tight
        bottomPadding: metrics.tight
        color: palette.placeholderText
        background: Rectangle { radius: cap.metrics.controlRadius; color: "transparent"; border.width: cap.metrics.hairline; border.color: cap.palette.mid }
    }
    // The single solid accent action of a region.
    component PrimaryButton: GlassButton {
        id: primary
        glassProminent: true
        readonly property var metrics: workbench.resources.metrics
        implicitHeight: metrics.control
        leftPadding: metrics.inset
        rightPadding: metrics.inset
        icon.color: enabled ? primary.palette.highlightedText : primary.palette.placeholderText
        contentItem: RowLayout {
            spacing: primary.metrics.small
            IconImage { visible: !!primary.icon.source.toString(); source: primary.icon.source; color: primary.icon.color; sourceSize.width: primary.metrics.icon; sourceSize.height: primary.metrics.icon; Accessible.ignored: true }
            Label { text: primary.text; color: primary.enabled ? primary.palette.highlightedText : primary.palette.placeholderText; Accessible.ignored: true }
        }
        background: Rectangle {
            radius: primary.metrics.controlRadius
            color: !primary.enabled ? primary.palette.disabled.button : primary.down ? Qt.darker(primary.palette.highlight) : primary.palette.highlight
            border.width: primary.visualFocus ? primary.metrics.hairline : 0
            border.color: primary.palette.mid
        }
        Accessible.name: text
    }
    // Quiet shared action for raised Glass panels and compact filters.
    component QuietButton: GlassButton {
        id: quiet
        property bool iconBadge: false
        property bool disclosure: false
        property bool outlined: false
        readonly property var metrics: workbench.resources.metrics
        implicitHeight: metrics.control
        leftPadding: metrics.small
        rightPadding: metrics.small
        topPadding: metrics.small
        bottomPadding: metrics.small
        icon.color: enabled ? palette.link : palette.placeholderText
        contentItem: RowLayout {
            spacing: quiet.metrics.gap
            Item {
                visible: !!quiet.icon.source.toString()
                implicitWidth: quiet.iconBadge ? quiet.metrics.control : quiet.metrics.icon
                implicitHeight: implicitWidth
                Rectangle { anchors.fill: parent; visible: quiet.iconBadge; radius: quiet.metrics.controlRadius; color: Qt.tint(quiet.palette.base, Qt.alpha(quiet.enabled ? quiet.palette.highlight : quiet.palette.placeholderText, quiet.metrics.selectionOpacity)) }
                IconImage { anchors.centerIn: parent; source: quiet.icon.source; color: quiet.icon.color; sourceSize.width: quiet.metrics.icon; sourceSize.height: quiet.metrics.icon; Accessible.ignored: true }
            }
            Label { text: quiet.text; color: quiet.enabled ? quiet.palette.buttonText : quiet.palette.placeholderText; font.weight: quiet.checked || quiet.iconBadge ? Font.DemiBold : Font.Normal; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
            IconImage { visible: quiet.disclosure; source: "icons/back.svg"; rotation: 180; color: quiet.palette.placeholderText; sourceSize.width: quiet.metrics.icon; sourceSize.height: quiet.metrics.icon; Accessible.ignored: true }
        }
        background: Rectangle {
            radius: quiet.metrics.chromeControlRadius
            color: quiet.down || quiet.hovered ? quiet.palette.alternateBase : quiet.checked ? quiet.palette.base : "transparent"
            border.width: quiet.visualFocus || quiet.checked || quiet.outlined ? quiet.metrics.hairline : 0
            border.color: quiet.visualFocus ? quiet.palette.highlight : quiet.palette.midlight
        }
        Accessible.name: text
    }
    // Quiet icon-only utility with a tooltip and accessible name.
    component IconButton: GlassToolButton {
        readonly property var metrics: workbench.resources.metrics
        property string iconName
        display: AbstractButton.IconOnly
        icon.source: "icons/" + iconName + ".svg"
        icon.color: palette.buttonText
        icon.width: metrics.icon
        icon.height: metrics.icon
        implicitWidth: metrics.control
        implicitHeight: metrics.control
        Accessible.name: text
        ToolTip.visible: hovered
        ToolTip.text: text
    }
    component StatusDot: Rectangle {
        property string tone: "ready"
        // The palette has no danger role; callers pass the theme's danger color.
        property color failedColor: palette.placeholderText
        implicitWidth: workbench.resources.metrics.small
        implicitHeight: implicitWidth
        radius: implicitWidth / 2
        color: tone === "ready" ? palette.highlight : tone === "failed" ? failedColor : palette.placeholderText
        Accessible.ignored: true
    }
    // Readiness at the point of action, from the bridge's provider discovery (local
    // runtimes that answer, cloud providers with a key). One quiet line; Send stays
    // enabled. Offers a model this device can run, or the settings that fix it.
    component ProviderNotice: RowLayout {
        id: notice
        property string model
        property color dangerColor: palette.placeholderText
        // availability() is a method: read the notifying snapshot properties so the binding re-evaluates.
        readonly property string availability: (workbench.localModels, workbench.providersChecked, workbench.availability(model))
        readonly property bool unavailable: availability !== "available" && availability !== "unknown"
        readonly property string preferred: workbench.preferredModel
        signal openRequested(string section)
        signal useRequested(string model)
        function t(key) { return workbench.resources.locales[workbench.state.locale][key] || key }
        readonly property string reason: t(availability === "offline" ? "modelOfflineReason" : availability === "missingKey" ? "modelMissingKeyReason" : availability === "notInstalled" ? "modelNotInstalledReason" : "modelUnsupportedReason")
        objectName: "provider-notice"
        visible: workbench.providersEmpty || unavailable
        spacing: workbench.resources.metrics.small
        Component.onCompleted: workbench.discoverIfNeeded()
        ModelLabel { id: formatter; visible: false }
        StatusDot { tone: "failed"; failedColor: notice.dangerColor }
        Label { text: workbench.providersEmpty ? notice.t("noProviderNotice") : formatter.format(notice.model) + " — " + notice.reason; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        GlassButton { objectName: "provider-notice-check"; text: notice.t("checkAgain"); flat: true; enabled: !workbench.discovering; onClicked: workbench.discoverProviders() }
        GlassButton {
            objectName: "provider-notice-use"
            visible: !workbench.providersEmpty && !!notice.preferred && notice.preferred !== notice.model
            text: notice.t("useModel") + " " + formatter.format(notice.preferred)
            ToolTip.visible: hovered; ToolTip.text: notice.preferred
            onClicked: notice.useRequested(notice.preferred)
        }
        GlassButton {
            objectName: "provider-notice-open-localModels"
            visible: workbench.providersEmpty || (!(!!notice.preferred && notice.preferred !== notice.model) && notice.availability !== "missingKey")
            text: notice.t("openLocalModels"); onClicked: notice.openRequested("localModels")
        }
        GlassButton {
            objectName: "provider-notice-open-providers"
            visible: workbench.providersEmpty || (!(!!notice.preferred && notice.preferred !== notice.model) && notice.availability === "missingKey")
            text: notice.t("openProviders"); onClicked: notice.openRequested("providers")
        }
    }
    // "provider:model" reads as "Provider · model"; demo IDs read as their names.
    // The raw ID stays in tooltips. The single formatter for every Qt view.
    component ModelLabel: Label {
        property string modelID
        function format(id) {
            if (!id) return ""
            const demo = {"demo.standard": "steady", "demo.slow": "slow", "demo.failure": "failure"}
            if (demo[id]) return workbench.resources.locales[workbench.state.locale][demo[id]] || demo[id]
            const split = id.indexOf(":")
            if (split < 0) return id
            const names = {ollama: "Ollama", lmstudio: "LM Studio", llamacpp: "llama.cpp", openai: "OpenAI", claude: "Claude", gemini: "Gemini", groq: "Groq"}
            // Cloud IDs carry a release date ("claude-haiku-4-5-20251001"); the label drops it.
            return (names[id.slice(0, split)] || id.slice(0, split)) + " · " + id.slice(split + 1).replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, "")
        }
        text: format(modelID)
    }
    // Soft accent pill for live state; the text carries the meaning.
    component StatusBadge: Pane {
        id: badge
        property string text
        // Idle reads neutral (not running, not granted); the text, not only the color, carries meaning.
        property bool idle: false
        readonly property var metrics: workbench.resources.metrics
        leftPadding: metrics.small + metrics.tight
        rightPadding: leftPadding
        topPadding: metrics.tight
        bottomPadding: metrics.tight
        background: Rectangle { radius: height / 2; color: Qt.tint(badge.palette.base, Qt.alpha(badge.idle ? badge.palette.placeholderText : badge.palette.highlight, badge.metrics.selectionOpacity)) }
        contentItem: RowLayout {
            spacing: badge.metrics.small
            Rectangle { implicitWidth: badge.metrics.small; implicitHeight: implicitWidth; radius: implicitWidth / 2; color: badge.idle ? badge.palette.placeholderText : badge.palette.highlight }
            Label { text: badge.text; color: badge.idle ? badge.palette.placeholderText : badge.palette.link }
        }
        Accessible.name: text
    }
    // Two equal columns when wide enough, otherwise one stack.
    component Columns: GridLayout {
        property real threshold: workbench.resources.metrics.reading
        columns: width >= threshold ? 2 : 1
        columnSpacing: workbench.resources.metrics.inset
        rowSpacing: workbench.resources.metrics.inset
        Layout.fillWidth: true
    }
}
