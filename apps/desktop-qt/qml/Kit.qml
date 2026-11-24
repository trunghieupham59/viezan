import "PopupAccessibility.js" as PopupAccessibility
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
    // Liquid Glass 2.0 scene, layer 1 (`.win`): the 150° champagne → taupe →
    // lavender → steel gradient with a cream glow top-leading and a steel glow
    // bottom-trailing, read from the generated `backdrop-*` roles and metrics.
    // Painted in the scene; it does not sample the desktop.
    component AppBackdrop: Item {
        id: backdrop
        readonly property var metrics: workbench.metrics
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        // CSS gradient line through the centre: both corners land on the end stops.
        readonly property real angle: metrics.backdropAngle * Math.PI / 180
        readonly property real dx: Math.sin(angle)
        readonly property real dy: -Math.cos(angle)
        readonly property real reach: (Math.abs(width * dx) + Math.abs(height * dy)) / 2
        clip: true
        Shape {
            anchors.fill: parent
            ShapePath {
                strokeWidth: 0
                fillGradient: LinearGradient {
                    x1: backdrop.width / 2 - backdrop.dx * backdrop.reach; y1: backdrop.height / 2 - backdrop.dy * backdrop.reach
                    x2: backdrop.width / 2 + backdrop.dx * backdrop.reach; y2: backdrop.height / 2 + backdrop.dy * backdrop.reach
                    GradientStop { position: 0; color: backdrop.colors["backdrop-0"] }
                    GradientStop { position: backdrop.metrics.backdropStop1; color: backdrop.colors["backdrop-1"] }
                    GradientStop { position: backdrop.metrics.backdropStop2; color: backdrop.colors["backdrop-2"] }
                    GradientStop { position: 1; color: backdrop.colors["backdrop-3"] }
                }
                PathRectangle { width: backdrop.width; height: backdrop.height }
            }
        }
        BackdropGlow { prefix: "backdropGlowLead"; glowColor: backdrop.colors["backdrop-glow-lead"] }
        BackdropGlow { prefix: "backdropGlowTrail"; glowColor: backdrop.colors["backdrop-glow-trail"] }
        Accessible.ignored: true
    }
    // `radial-gradient(W H at X Y, colour, transparent extent)`: a circle squashed to the ellipse.
    component BackdropGlow: Shape {
        id: glow
        property string prefix
        property color glowColor
        readonly property var metrics: workbench.metrics
        readonly property real radiusX: metrics[prefix + "Width"]
        width: radiusX * 2; height: width
        x: parent.width * metrics[prefix + "X"] - radiusX
        y: parent.height * metrics[prefix + "Y"] - radiusX
        transform: Scale { origin.x: glow.radiusX; origin.y: glow.radiusX; yScale: glow.metrics[glow.prefix + "Height"] / glow.radiusX }
        ShapePath {
            strokeWidth: 0
            fillGradient: RadialGradient {
                centerX: glow.radiusX; centerY: glow.radiusX; centerRadius: glow.radiusX * glow.metrics[glow.prefix + "Extent"]
                focalX: centerX; focalY: centerY
                GradientStop { position: 0; color: glow.glowColor }
                GradientStop { position: 1; color: Qt.alpha(glow.glowColor, 0) }
            }
            PathRectangle { width: glow.width; height: glow.height }
        }
    }
    // Scene layer 3 (`.pane`): a translucent white pane with a bright rim, a top
    // inner highlight and a low outer shadow. SurfaceAppearance supplies the
    // opaque fallback when either system accessibility flag is enabled.
    component GlassPane: Item {
        id: pane
        property QtObject appearance: SurfaceAppearance {}
        readonly property bool solid: appearance.solid
        property string solidRole: startRole === "canvas" ? "reading" : "pane"
        readonly property color solidColor: appearance[solidRole]
        property real radius: metrics.chromeSurfaceRadius
        property string shadowRole: "shadow-md-color"
        property string startRole: "primary-nav-material"
        property string endRole: "sidebar-bg"
        property string borderRole: "material-border"
        property color startColor: colors[startRole]
        property color endColor: colors[endRole]
        readonly property real shadowBlurRadius: shadowRole === "shadow-lg-color" ? metrics.shadowLgBlur : shadowRole === "shadow-sm-color" ? metrics.shadowSmBlur : metrics.shadowMdBlur
        readonly property real shadowOffset: shadowRole === "shadow-lg-color" ? metrics.shadowLgY : shadowRole === "shadow-sm-color" ? metrics.shadowSmY : metrics.shadowMdY
        readonly property var metrics: workbench.metrics
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        readonly property bool accelerated: GraphicsInfo.api !== GraphicsInfo.Software && GraphicsInfo.api !== GraphicsInfo.Unknown
        // Outer shadow: a blurred silhouette drawn behind the face.
        Rectangle { id: shadowShape; visible: false; anchors.fill: parent; radius: pane.radius; color: pane.colors[pane.shadowRole] }
        // Qt 6.8.3 crashes when an imported inline component instantiates a
        // Loader's nested sourceComponent (even Rectangle). Keep the effect
        // declarative, with no source on software. Keep the GPU source stable
        // while hidden so its texture remains valid when shown again.
        // Repro/evidence: native-migration-report-20261106-glass2-win-W0.md.
        Item {
            x: -pane.shadowBlurRadius; y: -pane.shadowBlurRadius + pane.shadowOffset
            width: pane.width + pane.shadowBlurRadius * 2; height: pane.height + pane.shadowBlurRadius * 2
            visible: pane.accelerated && !pane.solid
            MultiEffect { objectName: "glass-pane-shadow"; source: pane.accelerated ? shadowShape : null; anchors.fill: parent; anchors.margins: pane.shadowBlurRadius; blurEnabled: true; blur: 1; blurMax: pane.shadowBlurRadius; autoPaddingEnabled: true }
        }
        Rectangle {
            objectName: "glass-pane-face"
            anchors.fill: parent
            radius: pane.radius
            gradient: Gradient {
                orientation: Gradient.Vertical
                GradientStop { position: 0; color: pane.solid ? pane.solidColor : pane.startColor }
                GradientStop { position: 1; color: pane.solid ? pane.solidColor : pane.endColor }
            }
            border.width: pane.metrics.hairline
            border.color: pane.solid ? pane.appearance.edge : pane.colors[pane.borderRole]
        }
        // 1 pt inner highlight along the top edge (`inset 0 1px 0`). It fades out
        // before the corners: a straight line there leaves the rounded face and
        // reads as a second border.
        Rectangle {
            id: paneHighlight
            objectName: "glass-pane-highlight"
            visible: !pane.solid
            x: pane.radius / 2; y: pane.metrics.hairline
            width: Math.max(0, pane.width - pane.radius); height: pane.metrics.hairline
            readonly property real fade: width > 0 ? Math.min(0.5, pane.radius / 2 / width) : 0.5
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: Qt.alpha(pane.colors["material-highlight"], 0) }
                GradientStop { position: paneHighlight.fade; color: pane.colors["material-highlight"] }
                GradientStop { position: 1 - paneHighlight.fade; color: pane.colors["material-highlight"] }
                GradientStop { position: 1; color: Qt.alpha(pane.colors["material-highlight"], 0) }
            }
        }
        Accessible.ignored: true
    }
    // `.lens`: the selected row, a bright raised glass; `hover` is the softer flat state.
    component GlassLens: Rectangle {
        id: glassLens
        property QtObject appearance: SurfaceAppearance {}
        property bool hover: false
        readonly property var metrics: workbench.metrics
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        radius: metrics.radius
        color: appearance.solid ? Qt.tint(appearance.pane, colors[hover ? "chrome-item-hover" : "chrome-item-active"]) : colors[hover ? "chrome-item-hover" : "chrome-item-active"]
        border.width: hover ? 0 : metrics.hairline
        border.color: appearance.solid ? appearance.edge : colors["material-highlight"]
        Rectangle {
            visible: !glassLens.hover && !glassLens.appearance.solid
            anchors.left: parent.left; anchors.right: parent.right; anchors.top: parent.bottom
            anchors.leftMargin: glassLens.radius; anchors.rightMargin: glassLens.radius
            height: glassLens.metrics.hairline
            color: glassLens.colors["shadow-sm-color"]
        }
        Accessible.ignored: true
    }
    // A bounded, opaque chrome surface with a fine illuminated rim. Qt does
    // not expose Apple's material or desktop backdrop through this component.
    component ChromeSurface: Rectangle {
        id: chrome
        property QtObject appearance: SurfaceAppearance {}
        property color fillColor: "transparent"
        property bool illuminatedFill: false
        property color fillHighlight: fillColor
        property color edgeColor: "transparent"
        property color edgeHighlight: edgeColor
        readonly property var metrics: workbench.metrics
        radius: metrics.chromeSurfaceRadius
        gradient: Gradient {
            GradientStop { position: 0; color: chrome.appearance.solid ? chrome.appearance.edge : chrome.edgeHighlight }
            GradientStop { position: 1; color: chrome.appearance.solid ? chrome.appearance.edge : chrome.edgeColor }
        }
        Rectangle {
            anchors.fill: parent
            anchors.margins: chrome.metrics.hairline
            radius: Math.max(0, chrome.radius - chrome.metrics.hairline)
            color: chrome.appearance.solid ? chrome.appearance.raised : chrome.fillColor
            gradient: chrome.illuminatedFill && !chrome.appearance.solid ? illuminatedGradient : null
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
        property QtObject appearance: SurfaceAppearance {}
        readonly property bool solid: appearance.solid
        property real radius: height / 2
        property bool prominent: false
        property bool pressed: false
        property bool hovered: false
        property bool inactive: false
        readonly property var metrics: workbench.metrics
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        readonly property color inkShadow: colors[darkMode ? "app-bg" : "chrome-fg-strong"]
        readonly property color tint: colors[darkMode || pressed ? "action-active" : "action"]
        readonly property bool accelerated: GraphicsInfo.api !== GraphicsInfo.Software && GraphicsInfo.api !== GraphicsInfo.Unknown
        // Qt 6.8 keeps the old blur texture when a control shrinks (label -> icon-only),
        // leaving a ghost cap beside it. Re-attaching the source rebuilds the effect.
        property bool settled: true
        onWidthChanged: if (accelerated && settled) { settled = false; settle.restart() }
        Timer { id: settle; interval: 1; onTriggered: glassSurface.settled = true }
        // The effect samples only this sibling face, never a parent containing
        // itself. Software rendering keeps the same material and a quiet edge.
        Rectangle {
            id: glassFace
            anchors.fill: parent
            visible: !glassSurface.solid && !glassSurface.accelerated
            radius: glassSurface.radius
            gradient: Gradient {
                GradientStop { position: 0; color: glassSurface.inactive ? glassSurface.colors["surface-subtle"] : glassSurface.prominent ? Qt.alpha(glassSurface.tint, 0.98) : Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? (glassSurface.hovered ? 0.18 : 0.13) : (glassSurface.hovered ? 0.70 : 0.52)) }
                GradientStop { position: 0.28; color: glassSurface.inactive ? glassSurface.colors["surface-subtle"] : glassSurface.prominent ? Qt.alpha(glassSurface.tint, 0.97) : glassSurface.darkMode ? Qt.alpha(glassSurface.colors["material-highlight"], 0.11) : Qt.alpha(glassSurface.colors["surface-raised"], 0.16) }
                GradientStop { position: 0.64; color: glassSurface.inactive ? glassSurface.colors["surface-subtle"] : glassSurface.prominent ? Qt.alpha(glassSurface.colors["action-active"], 0.98) : Qt.alpha(glassSurface.colors["primary-nav-material"], glassSurface.darkMode ? 0.08 : 0.38) }
                GradientStop { position: 1; color: glassSurface.inactive ? glassSurface.colors["surface-subtle"] : glassSurface.prominent ? Qt.alpha(glassSurface.colors["action-active"], 0.98) : Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? 0.06 : 0.26) }
            }
        }
        // As in GlassPane, avoid a Loader sourceComponent nested in an imported
        // inline component on Qt 6.8.3. The GPU shadow and sizing stay unchanged.
        MultiEffect {
            objectName: "glass-control-shadow"
            anchors.fill: parent
            visible: glassSurface.accelerated && !glassSurface.solid
            source: glassSurface.accelerated && glassSurface.settled ? glassFace : null
            shadowEnabled: true
            shadowColor: glassSurface.inkShadow
            shadowOpacity: glassSurface.inactive ? 0.04 : glassSurface.darkMode ? 0.28 : 0.16
            shadowBlur: 0.35
            blurMax: glassSurface.metrics.small
            shadowVerticalOffset: glassSurface.pressed ? glassSurface.metrics.hairline : glassSurface.metrics.hairline * 2
        }
        Rectangle {
            visible: !glassSurface.accelerated && !glassSurface.solid
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
            visible: !glassSurface.solid && !glassSurface.inactive && (glassSurface.hovered || glassSurface.pressed)
            radius: glassSurface.radius
            color: Qt.alpha(glassSurface.inkShadow, glassSurface.pressed ? 0.16 : 0.06)
        }
        // Asymmetric upper reflection and lower caustic, with a clear centre.
        Shape {
            objectName: "glass-control-reflections"
            anchors.fill: parent
            visible: !glassSurface.solid && !glassSurface.inactive && !glassSurface.darkMode
            ShapePath {
                strokeWidth: 0
                fillRule: ShapePath.OddEvenFill
                fillGradient: LinearGradient {
                    x1: 0; y1: 0; x2: glassSurface.width * 0.22; y2: glassSurface.height
                    GradientStop { position: 0; color: glassSurface.darkMode ? glassSurface.colors["material-highlight"] : Qt.alpha(glassSurface.colors["material-highlight"], 0.96) }
                    GradientStop { position: 0.32; color: glassSurface.darkMode ? glassSurface.colors["material-border"] : Qt.alpha(glassSurface.colors["material-highlight"], 0.22) }
                    GradientStop { position: 0.62; color: glassSurface.darkMode ? glassSurface.colors["border"] : Qt.alpha(glassSurface.colors["material-border"], 0.24) }
                    GradientStop { position: 1; color: glassSurface.darkMode ? glassSurface.colors["surface"] : Qt.alpha(glassSurface.colors["material-highlight"], 0.78) }
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
                    GradientStop { position: 1; color: glassSurface.darkMode ? glassSurface.colors["surface"] : Qt.alpha(glassSurface.colors["material-highlight"], 0.46) }
                }
                PathRectangle { x: glassSurface.metrics.hairline; y: x; width: Math.max(0, glassSurface.width - x * 2); height: Math.max(0, glassSurface.height - y * 2); radius: Math.max(0, glassSurface.radius - x) }
                PathRectangle { x: glassSurface.metrics.hairline * 2; y: x; width: Math.max(0, glassSurface.width - x * 2); height: Math.max(0, glassSurface.height - y * 2); radius: Math.max(0, glassSurface.radius - x) }
            }
        }
        // A single antialiased edge avoids overlapping subpixel rings in dark
        // and disabled controls, including the software scene graph.
        Rectangle {
            objectName: "glass-control-quiet-rim"
            anchors.fill: parent
            visible: !glassSurface.solid && (glassSurface.inactive || glassSurface.darkMode)
            radius: glassSurface.radius
            color: "transparent"
            border.width: glassSurface.metrics.hairline
            border.color: glassSurface.colors[glassSurface.inactive ? "border" : "material-border"]
        }
        Rectangle {
            objectName: "glass-control-solid-face"
            anchors.fill: parent
            visible: glassSurface.solid
            radius: glassSurface.radius
            color: glassSurface.inactive ? Qt.tint(glassSurface.appearance.control, glassSurface.colors["surface-subtle"])
                : glassSurface.prominent ? glassSurface.tint
                : glassSurface.hovered || glassSurface.pressed ? Qt.tint(glassSurface.appearance.control, glassSurface.colors["surface-muted"]) : glassSurface.appearance.control
            border.width: glassSurface.metrics.hairline
            border.color: glassSurface.appearance.edge
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
        readonly property var metrics: workbench.metrics
        ControlGlassSurface { anchors.fill: parent; visible: lens.active && !lens.quiet; prominent: lens.prominent && !lens.destructive; pressed: lens.control.down; hovered: lens.control.hovered; inactive: !lens.control.enabled }
        Rectangle { anchors.fill: parent; visible: lens.quiet && (lens.control.hovered || lens.control.down || lens.destructive); radius: height / 2; color: Qt.alpha(lens.control.palette.buttonText, lens.metrics.selectionOpacity); Accessible.ignored: true }
        Binding { target: lens.control.background; property: "visible"; value: false; when: lens.active }
        Rectangle { anchors.fill: parent; color: "transparent"; radius: height / 2; border.width: lens.control.visualFocus ? lens.metrics.focusRingWidth : 0; border.color: lens.control.palette.link; Accessible.ignored: true }
        Rectangle { visible: lens.selectionMarker && !lens.quiet && !!lens.control.checkable && !!lens.control.checked; anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom; anchors.bottomMargin: lens.metrics.tight; width: lens.metrics.small; height: lens.metrics.hairline * 2; radius: height / 2; color: lens.control.palette.link; Accessible.ignored: true }
    }
    // App-wide action primitives. Geometry, native content, shortcuts and
    // disabled semantics are inherited from the active Qt control style.
    component GlassButton: Button {
        id: glassButton
        // Qt 6.8 leaves some buttons without the implicit name taken from `text`.
        Accessible.name: text
        property var popupOpen
        Component.onCompleted: if (popupOpen !== undefined) PopupAccessibility.bindState(glassButton, Accessible)
        property bool glassMaterial: true
        property bool glassProminent: highlighted
        property bool glassSelectionMarker: true
        ControlLens { control: glassButton; active: glassButton.glassMaterial && !glassButton.paintedPrimary; prominent: glassButton.glassProminent; selectionMarker: glassButton.glassSelectionMarker }
        /// Set by PrimaryButton: its own gradient face replaces the lens.
        property bool paintedPrimary: false
    }
    component GlassToolButton: ToolButton {
        id: glassToolButton
        property var popupOpen
        Component.onCompleted: if (popupOpen !== undefined) PopupAccessibility.bindState(glassToolButton, Accessible)
        property bool glassMaterial: true
        ControlLens { control: glassToolButton; active: glassToolButton.glassMaterial }
    }
    component GlassComboBox: ComboBox {
        id: glassComboBox
        property bool glassMaterial: true
        ControlLens { control: glassComboBox; active: glassComboBox.glassMaterial }
    }
    component GlassField: TextField {
        id: field
        property QtObject appearance: SurfaceAppearance {}
        readonly property var metrics: workbench.metrics
        implicitHeight: Math.max(metrics.control, contentHeight + topPadding + bottomPadding)
        leftPadding: metrics.gap; rightPadding: metrics.gap
        Binding { target: field.background; property: "visible"; value: false }
        Rectangle {
            anchors.fill: parent; z: -1; radius: field.metrics.controlRadius; Accessible.ignored: true
            color: field.appearance.solid ? field.appearance.control : field.appearance.colors["surface-subtle"]
            border.width: field.activeFocus ? field.metrics.focusRingWidth : field.metrics.hairline
            border.color: field.activeFocus ? field.palette.highlight : field.appearance.edge
        }
    }
    // Search remains a native TextField: composition, selection and its caller's
    // key handlers stay intact. The editing plane is opaque and inset, while
    // the illuminated capsule edge belongs to the Glass control family.
    component SearchField: TextField {
        id: searchField
        property QtObject appearance: SurfaceAppearance {}
        property bool compact: false
        property bool embedded: false
        readonly property var metrics: workbench.metrics
        readonly property real fieldRadius: height / 2
        implicitHeight: compact ? metrics.compactControl : metrics.control
        leftPadding: (embedded ? 0 : metrics.gap) + metrics.icon + metrics.small
        rightPadding: embedded ? 0 : metrics.gap
        selectByMouse: true
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        background: Item {
            visible: !searchField.embedded
            // `.field` (Glass): a recessed white capsule, hairline at rest, the stronger edge while typing.
            Rectangle {
                objectName: "search-field-face"
                anchors.fill: parent
                radius: searchField.fieldRadius
                color: searchField.appearance.solid ? searchField.appearance.reading : searchField.colors["surface-subtle"]
                border.width: searchField.metrics.hairline
                border.color: searchField.activeFocus ? searchField.colors["border-strong"] : searchField.appearance.solid ? searchField.appearance.edge : searchField.colors.border
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
        readonly property var metrics: workbench.metrics
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        property real radius: metrics.surfaceRadius
        // Glass exports surface-raised with exactly the overlay-material value.
        // Composite on the scene token: Qt has no backdrop blur to hide text below.
        readonly property color overlayColor: Qt.tint(colors["app-bg"], colors["overlay-material"] || colors["surface-raised"])
        // `.float` (Glass): the raised white layer with a bright rim and the large shadow.
        GlassPane {
            anchors.fill: parent
            radius: readingPanel.radius
            solidRole: "raised"
            shadowRole: "shadow-lg-color"
            startColor: readingPanel.overlayColor
            endColor: readingPanel.overlayColor
        }
        Accessible.ignored: true
    }
    // One quiet group, one raised selected segment. Native TabBar/TabButton
    // continue to own mutual exclusion, arrow keys and accessible tab roles.
    component FilterGroup: TabBar {
        id: filterGroup
        property QtObject appearance: SurfaceAppearance {}
        readonly property var metrics: workbench.metrics
        property bool selectionReady: false
        signal selectionChanged(int index)
        Component.onCompleted: selectionReady = true
        onCurrentIndexChanged: if (selectionReady && currentIndex >= 0) selectionChanged(currentIndex)
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        // `.seg` (Glass): a recessed 32 pt track; the selected segment is a lens.
        padding: metrics.tight - metrics.hairline
        spacing: metrics.hairline * 2
        implicitHeight: metrics.compactControl
        implicitWidth: contentWidth + leftPadding + rightPadding
        property Item glassGroupBackground: Rectangle {
            parent: filterGroup
            anchors.fill: parent
            z: -1
            radius: height / 2
            color: filterGroup.appearance.solid ? Qt.tint(filterGroup.appearance.control, filterGroup.colors["surface-muted"]) : filterGroup.colors["surface-muted"]
            border.width: filterGroup.metrics.hairline
            border.color: filterGroup.appearance.solid ? filterGroup.appearance.edge : filterGroup.colors["border"]
            Accessible.ignored: true
        }
        Binding { target: filterGroup.background; property: "visible"; value: false }
    }
    component FilterButton: TabButton {
        id: filterButton
        Accessible.name: text
        readonly property var metrics: workbench.metrics
        implicitHeight: metrics.compactControl - (metrics.tight - metrics.hairline) * 2
        // The style's vertical padding leaves the 26 pt Glass segment less than a text line.
        topPadding: 0
        bottomPadding: 0
        font.weight: checked ? Font.DemiBold : Font.Medium
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        // Idle Glass segments read muted, the selected one strong (read from the theme, not
        // from this control's own palette, which would loop).
        readonly property color labelColor: workbench.palettes[darkMode ? "dark" : "light"][checked ? "text" : "text-muted"]
        palette.active.buttonText: labelColor
        palette.inactive.buttonText: labelColor
        // Glass segments hug their label instead of TabBar's equal split, so labels never truncate.
        width: implicitWidth
        ControlLens { control: filterButton; active: !filterButton.checked; quiet: true; selectionMarker: false }
        Binding { target: filterButton.background; property: "visible"; value: false }
        GlassLens { anchors.fill: parent; z: -1; visible: filterButton.checked; radius: height / 2 }
        Rectangle { objectName: "checked-filter-focus"; anchors.fill: parent; visible: filterButton.checked && filterButton.visualFocus; radius: height / 2; color: "transparent"; border.width: filterButton.metrics.focusRingWidth; border.color: filterButton.palette.link; Accessible.ignored: true }
    }
    // `.tog` (Glass): the native Switch keeps input, focus and semantics; only
    // its indicator is repainted so the track follows the theme, not the OS accent.
    component GlassSwitch: Switch {
        id: glassSwitch
        readonly property var metrics: workbench.metrics
        property QtObject appearance: SurfaceAppearance {}
        readonly property var colors: appearance.colors
        Binding { target: glassSwitch.indicator; property: "opacity"; value: 0 }
        Rectangle {
            objectName: "glass-switch-track"
            parent: glassSwitch.indicator ? glassSwitch.indicator.parent : glassSwitch
            x: glassSwitch.indicator ? glassSwitch.indicator.x + (glassSwitch.indicator.width - width) / 2 : 0
            y: glassSwitch.indicator ? glassSwitch.indicator.y + (glassSwitch.indicator.height - height) / 2 : 0
            width: glassSwitch.metrics.control
            height: glassSwitch.metrics.icon + glassSwitch.metrics.hairline * 2
            radius: height / 2
            opacity: glassSwitch.enabled || glassSwitch.appearance.solid ? 1 : glassSwitch.metrics.disabledOpacity
            color: {
                if (!glassSwitch.enabled) {
                    const disabled = glassSwitch.palette.disabled.button
                    return glassSwitch.appearance.solid ? Qt.tint(glassSwitch.appearance.control, disabled) : disabled
                }
                if (glassSwitch.checked) return glassSwitch.colors.action
                return glassSwitch.appearance.solid ? glassSwitch.appearance.control : Qt.alpha(glassSwitch.colors["text-disabled"], glassSwitch.metrics.disabledOpacity)
            }
            border.width: glassSwitch.appearance.solid ? glassSwitch.metrics.hairline : 0
            border.color: glassSwitch.appearance.edge
            Rectangle {
                objectName: "glass-switch-focus"
                anchors.fill: parent
                anchors.margins: -2 * glassSwitch.metrics.focusRingWidth
                radius: height / 2
                color: "transparent"
                border.width: glassSwitch.metrics.focusRingWidth
                border.color: glassSwitch.palette.text
                visible: glassSwitch.visualFocus
                Accessible.ignored: true
            }
            Rectangle {
                objectName: "glass-switch-thumb"
                width: parent.height - glassSwitch.metrics.tight; height: width; radius: width / 2
                y: glassSwitch.metrics.hairline * 2
                x: glassSwitch.checked ? parent.width - width - y : y
                color: glassSwitch.enabled ? "white" : glassSwitch.palette.disabled.buttonText
                Behavior on x {
                    enabled: !glassSwitch.appearance.reduceMotion
                    NumberAnimation { duration: glassSwitch.metrics.durationFast * 1000 }
                }
            }
            Accessible.ignored: true
        }
    }
    component Chevron: IconImage {
        source: "icons/back.svg"
        rotation: -90
        color: palette.placeholderText
        sourceSize.width: workbench.metrics.small + workbench.metrics.tight
        sourceSize.height: workbench.metrics.small + workbench.metrics.tight
        Accessible.ignored: true
    }
    // Static waveform means the existing record action; it is not a live meter.
    component VoiceGlyph: Item {
        property color color: "transparent"
        readonly property var metrics: workbench.metrics
        implicitWidth: metrics.icon
        implicitHeight: metrics.icon
        Row {
            anchors.centerIn: parent
            spacing: parent.metrics.hairline * 2
            // This icon has five fixed bars. Avoid a deferred delegate inside
            // an inline component, which Qt 6.8 can miscreate during Loader setup.
            Rectangle { width: workbench.metrics.hairline * 2; height: workbench.metrics.icon * 0.4; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
            Rectangle { width: workbench.metrics.hairline * 2; height: workbench.metrics.icon * 0.75; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
            Rectangle { width: workbench.metrics.hairline * 2; height: workbench.metrics.icon; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
            Rectangle { width: workbench.metrics.hairline * 2; height: workbench.metrics.icon * 0.6; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
            Rectangle { width: workbench.metrics.hairline * 2; height: workbench.metrics.icon * 0.35; radius: width / 2; anchors.verticalCenter: parent.verticalCenter; color: parent.parent.color }
        }
        Accessible.ignored: true
    }
    component PageIntro: ColumnLayout {
        id: intro
        property string title
        property string subtitle
        property real titleScale: metrics.headingScale
        readonly property var metrics: workbench.metrics
        spacing: metrics.small
        Label { text: intro.title; font.bold: true; font.pointSize: Qt.application.font.pointSize * intro.titleScale; wrapMode: Text.Wrap; Layout.fillWidth: true; Accessible.role: Accessible.Heading }
        Label { visible: !!intro.subtitle; text: intro.subtitle; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    component Eyebrow: Label {
        font.bold: true
        font.capitalization: Font.AllUppercase
        font.letterSpacing: workbench.metrics.hairline
        font.pointSize: Qt.application.font.pointSize * workbench.metrics.captionScale
        color: palette.placeholderText
        Accessible.role: Accessible.Heading
    }
    // One bounded surface: no nested frames.
    component Card: Pane {
        id: card
        Accessible.role: Accessible.Grouping
        property bool selected: false
        readonly property var metrics: workbench.metrics
        padding: metrics.inset
        background: Item {
            // `.card` (Glass): a flat hairline surface on the reading pane; no nested pane.
            FlatCard { anchors.fill: parent; selected: card.selected }
        }
    }
    component FlatCard: Rectangle {
        property QtObject appearance: SurfaceAppearance {}
        property bool selected: false
        readonly property var metrics: workbench.metrics
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        radius: metrics.chromeCardRadius
        color: appearance.solid ? Qt.tint(appearance.reading, colors[selected ? "action-soft" : "surface"]) : colors[selected ? "action-soft" : "surface"]
        border.width: metrics.hairline
        border.color: selected ? Qt.alpha(colors.action, metrics.selectionOpacity * 4) : appearance.solid ? appearance.edge : colors.border
        Accessible.ignored: true
    }
    // GroupBox drawn as a Review 18 settings card: the title is a header bar inside
    // the bounded surface, separated from the rows by an edge-to-edge divider.
    component CardBox: GroupBox {
        id: box
        readonly property var metrics: workbench.metrics
        readonly property real headerHeight: title ? metrics.navControl + metrics.tight : 0
        padding: metrics.inset
        topPadding: headerHeight + metrics.inset
        // FluentWinUI3 insets the frame below the label; this header sits inside the card.
        topInset: 0
        label: Item {
            visible: !!box.title
            width: box.width
            height: box.headerHeight
            Label { x: box.metrics.inset; width: parent.width - box.metrics.inset * 2; anchors.verticalCenter: parent.verticalCenter; text: box.title; font.weight: Font.DemiBold; font.pointSize: Qt.application.font.pointSize * box.metrics.subtitleScale; elide: Text.ElideRight; Accessible.role: Accessible.Heading }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: box.metrics.hairline; color: box.palette.midlight }
        }
        background: Item {
            FlatCard { anchors.fill: parent }
        }
    }
    // Label row: title, optional detail, trailing controls; dividers between rows.
    component CardRow: ColumnLayout {
        id: row
        property string title
        property string detail
        property alias detailFont: detailLabel.font
        property bool divider: true
        // Only dividers in a settings card extend through the card's content padding.
        readonly property real dividerBleed: {
            let item = parent
            while (item && !(item instanceof Control)) item = item.parent
            return item instanceof GroupBox ? item.leftPadding : 0
        }
        default property alias trailing: slot.data
        readonly property var metrics: workbench.metrics
        spacing: 0
        Layout.fillWidth: true
        GridLayout {
            // Narrow cards keep the control trailing while the label still has a readable column.
            columns: row.width >= row.metrics.sidebar * 2 || row.width >= slot.implicitWidth + row.metrics.inset + row.metrics.editor ? 2 : 1
            // `.srow` (Glass): at least 48 pt, label 14, description 12.
            Layout.minimumHeight: row.metrics.navControl + row.metrics.small - row.metrics.small * 2
            columnSpacing: row.metrics.inset
            rowSpacing: row.metrics.small
            Layout.fillWidth: true
            Layout.topMargin: row.metrics.small
            Layout.bottomMargin: row.metrics.small
            ColumnLayout {
                spacing: row.metrics.tight
                Layout.fillWidth: true
                Accessible.role: Accessible.StaticText
                Accessible.name: row.title
                Accessible.description: row.detail
                Label { Accessible.ignored: true; text: row.title; textFormat: Text.PlainText; font.weight: Font.Medium; font.pointSize: Qt.application.font.pointSize * row.metrics.labelScale; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Label { id: detailLabel; Accessible.ignored: true; visible: !!row.detail; text: row.detail; textFormat: Text.PlainText; color: palette.placeholderText; font.pointSize: Qt.application.font.pointSize * row.metrics.smallScale; wrapMode: Text.Wrap; Layout.fillWidth: true }
            }
            RowLayout { id: slot; Layout.fillWidth: true; spacing: row.metrics.small }
        }
        Rectangle { visible: row.divider; Layout.leftMargin: -row.dividerBleed; Layout.rightMargin: -row.dividerBleed; color: palette.midlight; implicitHeight: row.metrics.hairline; Layout.fillWidth: true }
    }
    component KeyCap: Label {
        id: cap
        readonly property var metrics: workbench.metrics
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        // `.kbd` (Glass): a 20 pt mono cap, raised white with a hairline.
        leftPadding: metrics.small - metrics.hairline * 2
        rightPadding: leftPadding
        // Glass: padding brings the cap to exactly 20 pt around the text.
        topPadding: Math.max(0, (metrics.icon - contentHeight) / 2)
        bottomPadding: topPadding
        verticalAlignment: Text.AlignVCenter
        font.family: "monospace"
        font.pointSize: Qt.application.font.pointSize * metrics.captionScale
        color: palette.placeholderText
        background: Rectangle {
            radius: cap.metrics.chromeShortcutRadius
            color: cap.colors.surface
            border.width: cap.metrics.hairline
            border.color: cap.colors.border
        }
    }
    // The single solid accent action of a region.
    component PrimaryButton: GlassButton {
        id: primary
        property QtObject appearance: SurfaceAppearance {}
        property string shortcutText: ""
        readonly property real expandedWidth: primaryLabel.implicitWidth + metrics.icon + metrics.small + leftPadding + rightPadding + (shortcutText ? primaryShortcut.implicitWidth + metrics.small : 0)
        glassProminent: true
        paintedPrimary: true
        readonly property var metrics: workbench.metrics
        implicitHeight: metrics.control
        leftPadding: metrics.inset
        rightPadding: metrics.inset
        icon.color: enabled ? primary.palette.highlightedText : primary.palette.disabled.buttonText
        contentItem: RowLayout {
            spacing: primary.metrics.small
            IconImage { visible: !!primary.icon.source.toString(); source: primary.icon.source; color: primary.icon.color; sourceSize.width: primary.metrics.icon; sourceSize.height: primary.metrics.icon; Accessible.ignored: true }
            Label { id: primaryLabel; font.weight: Font.DemiBold; visible: primary.display !== AbstractButton.IconOnly; text: primary.text; color: primary.enabled ? primary.palette.highlightedText : primary.palette.disabled.buttonText; Accessible.ignored: true }
            KeyCap { id: primaryShortcut; objectName: "primary-shortcut"; visible: !!primary.shortcutText && primary.display !== AbstractButton.IconOnly; text: primary.shortcutText; color: primary.enabled ? primary.palette.placeholderText : primary.palette.disabled.buttonText; Accessible.ignored: true }
        }
        readonly property bool darkMode: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && workbench.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[darkMode ? "dark" : "light"]
        // `.btn.primary` (Glass): the accent gradient pill; the focus ring is a separate 2 pt edge.
        background: Rectangle {
            radius: height / 2
            color: !primary.enabled ? primary.palette.disabled.button : primary.down ? Qt.darker(primary.palette.highlight) : primary.palette.highlight
            gradient: primary.enabled && !primary.appearance.solid ? primaryFill : null
            Gradient {
                id: primaryFill
                GradientStop { position: 0; color: primary.colors["action-fill-top"] }
                GradientStop { position: 1; color: primary.down || primary.hovered ? primary.colors["action-active"] : primary.colors["action-fill-bottom"] }
            }
            border.width: primary.visualFocus ? primary.metrics.focusRingWidth : primary.metrics.hairline
            border.color: primary.visualFocus ? primary.colors["action-text"] : primary.appearance.solid ? primary.appearance.edge : primary.colors["material-border"]
            Rectangle {
                visible: primary.enabled && !primary.down && !primary.appearance.solid
                z: -1; x: 0; y: primary.metrics.hairline * 2
                width: parent.width; height: parent.height; radius: height / 2
                color: Qt.alpha(primary.colors.action, primary.metrics.selectionOpacity)
                Accessible.ignored: true
            }
        }
        Accessible.name: text
    }
    // Quiet shared action for raised Glass panels and compact filters.
    component QuietButton: GlassButton {
        id: quiet
        glassMaterial: false
        readonly property real expandedWidth: quietLabel.implicitWidth + metrics.icon + metrics.gap + leftPadding + rightPadding
        property bool outlined: false
        readonly property var metrics: workbench.metrics
        implicitHeight: metrics.control
        leftPadding: metrics.small
        rightPadding: metrics.small
        // Compact heights (32 pt headers, chat actions) keep a full line for the
        // icon and label; a fixed 8 pt would squeeze the row and push it off centre.
        topPadding: Math.max(0, Math.min(metrics.small, (height - implicitContentHeight) / 2))
        bottomPadding: topPadding
        icon.color: enabled ? palette.link : palette.disabled.buttonText
        contentItem: RowLayout {
            spacing: quiet.metrics.gap
            Item {
                visible: !!quiet.icon.source.toString()
                implicitWidth: quiet.metrics.icon
                implicitHeight: implicitWidth
                IconImage { anchors.centerIn: parent; source: quiet.icon.source; color: quiet.icon.color; sourceSize.width: quiet.metrics.icon; sourceSize.height: quiet.metrics.icon; Accessible.ignored: true }
            }
            Label { id: quietLabel; visible: quiet.display !== AbstractButton.IconOnly; text: quiet.text; color: quiet.enabled ? quiet.palette.buttonText : quiet.palette.disabled.buttonText; font.weight: quiet.checked ? Font.DemiBold : Font.Normal; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
        }
        background: Rectangle {
            radius: height / 2
            color: quiet.down || quiet.hovered ? quiet.palette.alternateBase : quiet.checked ? quiet.palette.base : "transparent"
            border.width: quiet.visualFocus ? quiet.metrics.focusRingWidth : quiet.checked || quiet.outlined ? quiet.metrics.hairline : 0
            border.color: quiet.visualFocus ? quiet.palette.highlight : quiet.palette.midlight
        }
        Accessible.name: text
    }
    // Quiet icon-only utility with a tooltip and accessible name.
    component IconButton: GlassToolButton {
        readonly property var metrics: workbench.metrics
        property string iconName
        display: AbstractButton.IconOnly
        icon.source: "icons/" + iconName + ".svg"
        icon.color: enabled ? palette.buttonText : palette.disabled.buttonText
        icon.width: metrics.icon
        icon.height: metrics.icon
        implicitWidth: metrics.control
        implicitHeight: metrics.control
        // A 32 pt caller keeps the full 20 pt glyph; the style's padding would squeeze it.
        readonly property real glyphPadding: Math.max(0, Math.min(metrics.small, (Math.min(width, height) - metrics.icon) / 2))
        topPadding: glyphPadding; bottomPadding: glyphPadding; leftPadding: glyphPadding; rightPadding: glyphPadding
        Accessible.name: text
        ToolTip.visible: hovered
        ToolTip.text: text
    }
    component SpeakButton: IconButton {
        required property string speechText
        required property string language
        required property string sourceID
        property var audio: workbench.audio
        property string label: workbench.strings.speak
        readonly property bool reading: !!audio?.speaking && audio.speakingSource === sourceID
        implicitWidth: metrics.compactControl; implicitHeight: metrics.compactControl
        iconName: reading ? "stop" : "listen"
        text: reading ? workbench.strings.stopSpeaking : label
        enabled: !!speechText.trim()
        checked: reading
        onClicked: reading ? audio.silence() : audio.speak(speechText, language, sourceID)
    }
    component StatusDot: Rectangle {
        property string tone: "ready"
        // Older callers supply their own failed colour. Explicit tones use the theme.
        property color failedColor: palette.placeholderText
        implicitWidth: workbench.metrics.small
        implicitHeight: implicitWidth
        radius: implicitWidth / 2
        readonly property bool dark: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[dark ? "dark" : "light"]
        color: tone === "busy" ? colors["action-text"] : ["success", "warning", "danger"].includes(tone) ? colors[tone] : tone === "ready" ? palette.highlight : tone === "failed" ? failedColor : palette.placeholderText
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
        readonly property var localeStrings: workbench.strings
        function t(key) { return localeStrings[key] || key }
        readonly property string reason: t(availability === "offline" ? "modelOfflineReason" : availability === "missingKey" ? "modelMissingKeyReason" : availability === "notInstalled" ? "modelNotInstalledReason" : "modelUnsupportedReason")
        objectName: "provider-notice"
        visible: workbench.providersEmpty || unavailable
        spacing: workbench.metrics.small
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
    // A native focusable row shared by the Glass shell panels.
    component PanelRow: ItemDelegate {
        id: panelRow
        property string detail: ""
        property bool selected: false
        property string iconName: ""
        property bool disclosure: false
        readonly property var metrics: workbench.metrics
        readonly property bool dark: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.palettes[dark ? "dark" : "light"]
        implicitHeight: metrics.navControl
        leftPadding: metrics.gap; rightPadding: metrics.gap
        Accessible.selected: selected
        Accessible.name: text
        contentItem: RowLayout {
            spacing: panelRow.metrics.small
            IconImage { visible: !!panelRow.iconName; source: panelRow.iconName ? "icons/" + panelRow.iconName + ".svg" : ""; sourceSize.width: panelRow.metrics.icon; sourceSize.height: panelRow.metrics.icon; color: panelRow.enabled ? panelRow.colors["text-muted"] : panelRow.palette.disabled.buttonText; Accessible.ignored: true }
            Label { text: panelRow.text; elide: Text.ElideRight; font.weight: panelRow.selected ? Font.DemiBold : Font.Normal; color: panelRow.enabled ? panelRow.colors.text : panelRow.palette.disabled.buttonText; Layout.fillWidth: true; Accessible.ignored: true }
            Label { visible: !!panelRow.detail; text: panelRow.detail; elide: Text.ElideRight; Layout.maximumWidth: panelRow.availableWidth * panelRow.metrics.skeletonShort; color: panelRow.enabled ? panelRow.colors["text-muted"] : panelRow.palette.disabled.buttonText; font.pointSize: Qt.application.font.pointSize * panelRow.metrics.smallScale; Accessible.ignored: true }
            Label { text: "✓"; visible: panelRow.selected; color: panelRow.enabled ? panelRow.colors.action : panelRow.palette.disabled.buttonText; Accessible.ignored: true }
            IconImage { visible: panelRow.disclosure; source: "icons/back.svg"; rotation: -90; color: panelRow.enabled ? panelRow.colors["text-muted"] : panelRow.palette.disabled.buttonText; sourceSize.width: panelRow.metrics.icon; sourceSize.height: panelRow.metrics.icon; Accessible.ignored: true }
        }
        background: Item {
            GlassLens { anchors.fill: parent; visible: panelRow.selected || panelRow.hovered || panelRow.highlighted; hover: !panelRow.selected; radius: panelRow.metrics.radius }
            Rectangle { anchors.fill: parent; color: "transparent"; radius: panelRow.metrics.radius; border.width: panelRow.visualFocus ? panelRow.metrics.focusRingWidth : 0; border.color: panelRow.colors.action }
        }
    }
    // "provider:model" reads as "Provider · model"; demo IDs read as their names.
    // The raw ID stays in tooltips. The single formatter for every Qt view.
    component ModelLabel: Label {
        property string modelID
        function providerName(id) {
            const names = {ollama: "Ollama", lmstudio: "LM Studio", llamacpp: "llama.cpp", openai: "OpenAI", claude: "Claude", gemini: "Gemini", groq: "Groq"}
            return names[id] || id
        }
        function format(id) {
            if (!id) return ""
            const demo = {"demo.standard": "steady", "demo.slow": "slow", "demo.failure": "failure"}
            if (demo[id]) return workbench.strings[demo[id]] || demo[id]
            const split = id.indexOf(":")
            if (split < 0) return id
            // Cloud IDs carry a release date ("claude-haiku-4-5-20251001"); the label drops it.
            return providerName(id.slice(0, split)) + " · " + id.slice(split + 1).replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, "")
        }
        text: format(modelID)
    }
    // Soft accent pill for live state; the text carries the meaning.
    component StatusBadge: Pane {
        id: badge
        property string text
        // Idle reads neutral (not running, not granted); the text, not only the color, carries meaning.
        property bool idle: false
        property string tone: "ready"
        readonly property var metrics: workbench.metrics
        leftPadding: metrics.small + metrics.tight
        rightPadding: leftPadding
        // The 24 pt Glass chip keeps a full text line; a fixed 4 pt would push the label down.
        topPadding: Math.max(0, Math.min(metrics.tight, (height - implicitContentHeight) / 2))
        bottomPadding: topPadding
        implicitHeight: Math.max(metrics.gutter, implicitContentHeight + 2 * metrics.hairline)
        SurfaceAppearance { id: badgeAppearance }
        background: Rectangle {
            radius: height / 2
            color: badge.tone !== "busy" ? Qt.tint(badge.palette.base, Qt.alpha(badgeDot.color, badge.metrics.selectionOpacity))
                 : badgeAppearance.solid ? Qt.tint(badgeAppearance.reading, badgeDot.colors["action-soft"])
                 : badgeDot.colors["action-soft"]
        }
        contentItem: RowLayout {
            spacing: badge.metrics.small
            StatusDot { id: badgeDot; tone: badge.idle ? "idle" : badge.tone }
            Label {
                text: badge.text; color: badgeDot.color
                font.pointSize: Qt.application.font.pointSize * badge.metrics.smallScale
                font.weight: Font.Medium
                font.features: badge.tone === "busy" ? {"tnum": 1} : ({})
                Accessible.ignored: true
            }
        }
        Accessible.role: Accessible.StaticText
        Accessible.name: text
    }
    // Shared W2 layers use the same opaque surface as W1. Geometry is measured in
    // the overlay's coordinate space, with room reserved for the opening control.
    component AnchoredPanel: Popup {
        id: panel
        property var shell: null
        property Item opener: null
        property real desiredWidth: workbench.metrics.sidebar + workbench.metrics.editor
        readonly property var metrics: workbench.metrics
        parent: Overlay.overlay
        modal: false; focus: true
        padding: metrics.small
        // Fluent's default implicitWidth reads the content's implicit width;
        // a wrapping ScrollView already sizes its content from this layer.
        implicitWidth: desiredWidth
        width: Math.min(desiredWidth, (parent ? parent.width : desiredWidth) - metrics.inset * 2)
        height: Math.min(implicitContentHeight + topPadding + bottomPadding, Math.max(metrics.control, availableSpace))
        property point origin: Qt.point(metrics.inset, metrics.inset)
        property string ownerID: ""
        function updateAnchor() { if (opener && parent) origin = opener.mapToItem(parent, 0, 0) }
        readonly property real below: parent ? parent.height - origin.y - (opener ? opener.height : 0) - metrics.inset - metrics.small : metrics.editor * 3
        readonly property real above: origin.y - metrics.inset - metrics.small
        readonly property bool placeBelow: below >= implicitContentHeight + topPadding + bottomPadding || below >= above
        readonly property real availableSpace: placeBelow ? below : above
        x: Math.max(metrics.inset, Math.min(origin.x, (parent ? parent.width : width) - width - metrics.inset))
        y: placeBelow ? origin.y + (opener ? opener.height : 0) + metrics.small : origin.y - height - metrics.small
        background: ReadingPanelSurface {}
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        function openAt(item) { opener = item; updateAnchor(); if (shell) shell.showComposerPanel(panel, item); else open() }
        onOpened: { ownerID = shell?.session?.id || ""; updateAnchor() }
        Connections { target: panel.parent; function onWidthChanged() { if (panel.visible) Qt.callLater(panel.updateAnchor) } function onHeightChanged() { if (panel.visible) Qt.callLater(panel.updateAnchor) } }
        Connections { target: panel.shell; ignoreUnknownSignals: true; function onSessionChanged() { if (panel.visible && panel.ownerID !== (panel.shell?.session?.id || "")) panel.close() } }
        onClosed: { if (shell) shell.restoreOverlayFocus(); else if (opener) opener.forceActiveFocus() }
    }
    // Two equal columns when wide enough, otherwise one stack.
    component Columns: GridLayout {
        property real threshold: workbench.metrics.reading
        columns: width >= threshold ? 2 : 1
        columnSpacing: workbench.metrics.inset
        rowSpacing: workbench.metrics.inset
        Layout.fillWidth: true
    }
}
