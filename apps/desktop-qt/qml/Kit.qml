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
        readonly property var metrics: workbench.resources.metrics
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
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
        readonly property var metrics: workbench.resources.metrics
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
        readonly property var metrics: workbench.resources.metrics
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
        readonly property bool accelerated: GraphicsInfo.api !== GraphicsInfo.Software && GraphicsInfo.api !== GraphicsInfo.Unknown
        // Outer shadow: a blurred silhouette drawn behind the face.
        Rectangle { id: shadowShape; visible: false; anchors.fill: parent; radius: pane.radius; color: pane.colors[pane.shadowRole] }
        // Qt 6.8.3 crashes when an imported inline component instantiates a
        // Loader's nested sourceComponent (even Rectangle). Keep the effect
        // declarative, with no source on software. Keep the GPU source stable
        // while hidden so a preset change does not invalidate its texture.
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
        // 1 pt inner highlight along the top edge (`inset 0 1px 0`).
        Rectangle {
            objectName: "glass-pane-highlight"
            visible: !pane.solid
            x: pane.radius / 2; y: pane.metrics.hairline
            width: Math.max(0, pane.width - pane.radius); height: pane.metrics.hairline
            color: pane.colors["material-highlight"]
        }
        Accessible.ignored: true
    }
    // `.lens`: the selected row, a bright raised glass; `hover` is the softer flat state.
    component GlassLens: Rectangle {
        id: glassLens
        property QtObject appearance: SurfaceAppearance {}
        property bool hover: false
        readonly property var metrics: workbench.resources.metrics
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
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
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var themeColors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
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
            visible: !glassSurface.solid && !glassSurface.accelerated
            radius: glassSurface.radius
            gradient: Gradient {
                GradientStop { position: 0; color: glassSurface.inactive ? glassSurface.colors["surface-subtle"] : glassSurface.prominent ? Qt.alpha(glassSurface.tint, 0.98) : Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? (glassSurface.hovered ? 0.18 : 0.13) : (glassSurface.hovered ? 0.70 : 0.52)) }
                GradientStop { position: 0.28; color: glassSurface.inactive ? glassSurface.colors["surface-subtle"] : glassSurface.prominent ? Qt.alpha(glassSurface.tint, 0.97) : Qt.alpha(glassSurface.colors["surface-raised"], glassSurface.darkMode ? 0.38 : 0.16) }
                GradientStop { position: 0.64; color: glassSurface.inactive ? glassSurface.colors["surface-subtle"] : glassSurface.prominent ? Qt.alpha(glassSurface.colors["action-active"], 0.98) : Qt.alpha(glassSurface.colors["primary-nav-material"], glassSurface.darkMode ? 0.48 : 0.38) }
                GradientStop { position: 1; color: glassSurface.inactive ? glassSurface.colors["surface-subtle"] : glassSurface.prominent ? Qt.alpha(glassSurface.colors["action-active"], 0.98) : Qt.alpha(glassSurface.colors["material-highlight"], glassSurface.darkMode ? 0.08 : 0.26) }
            }
        }
        // As in GlassPane, avoid a Loader sourceComponent nested in an imported
        // inline component on Qt 6.8.3. The GPU shadow and sizing stay unchanged.
        MultiEffect {
            objectName: "glass-control-shadow"
            anchors.fill: parent
            visible: glassSurface.accelerated && !glassSurface.solid
            source: glassSurface.accelerated ? glassFace : null
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
        property bool glassSelectionMarker: true
        readonly property bool usesGlass: glassMaterial && workbench.state.appearance?.preset === "glass"
        ControlLens { control: glassButton; active: glassButton.usesGlass && !glassButton.paintedPrimary; prominent: glassButton.glassProminent; selectionMarker: glassButton.glassSelectionMarker }
        /// Set by PrimaryButton on Glass: its own gradient face replaces the lens.
        property bool paintedPrimary: false
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
        property QtObject appearance: SurfaceAppearance {}
        property bool compact: false
        property bool embedded: false
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        readonly property real fieldRadius: glass ? height / 2 : metrics.controlRadius
        implicitHeight: compact ? metrics.compactControl : metrics.control
        leftPadding: (embedded ? 0 : metrics.gap) + metrics.icon + metrics.small
        rightPadding: embedded ? 0 : metrics.gap
        selectByMouse: true
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
        background: Item {
            visible: !searchField.embedded
            // `.field` (Glass): a recessed white capsule, hairline at rest, the stronger edge while typing.
            Rectangle {
                objectName: "search-field-face"
                anchors.fill: parent
                visible: searchField.glass
                radius: searchField.fieldRadius
                color: searchField.appearance.solid ? searchField.appearance.reading : searchField.colors["surface-subtle"]
                border.width: searchField.metrics.hairline
                border.color: searchField.activeFocus ? searchField.colors["border-strong"] : searchField.appearance.solid ? searchField.appearance.edge : searchField.colors.border
            }
            ChromeSurface {
                anchors.fill: parent
                visible: !searchField.glass
                radius: searchField.fieldRadius
                fillColor: Qt.tint(searchField.palette.window, searchField.palette.base)
                edgeColor: searchField.palette.midlight
                edgeHighlight: edgeColor
            }
            Rectangle {
                anchors.fill: parent
                radius: searchField.fieldRadius
                color: "transparent"
                border.width: searchField.activeFocus && !searchField.glass ? searchField.metrics.hairline * 2 : 0
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
        property real radius: metrics.surfaceRadius
        property color fillColor: Qt.tint(colors["sidebar-bg"], colors["surface"])
        // Glass exports surface-raised with exactly the overlay-material value.
        // Composite on the scene token: Qt has no backdrop blur to hide text below.
        readonly property color overlayColor: Qt.tint(colors["app-bg"], colors["overlay-material"] || colors["surface-raised"])
        // `.float` (Glass): the raised white layer with a bright rim and the large shadow.
        GlassPane {
            anchors.fill: parent
            visible: readingPanel.glass
            radius: readingPanel.radius
            solidRole: "raised"
            shadowRole: "shadow-lg-color"
            startColor: readingPanel.overlayColor
            endColor: readingPanel.overlayColor
        }
        Rectangle {
            visible: false
            x: -readingPanel.metrics.hairline; y: readingPanel.metrics.hairline * 2
            width: parent.width + readingPanel.metrics.hairline * 2; height: parent.height
            radius: readingPanel.radius + readingPanel.metrics.hairline
            color: "transparent"
            border.width: readingPanel.metrics.hairline * 2
            border.color: Qt.alpha(readingPanel.colors[readingPanel.darkMode ? "app-bg" : "chrome-fg-strong"], readingPanel.darkMode ? 0.28 : 0.10)
        }
        ChromeSurface {
            anchors.fill: parent
            visible: !readingPanel.glass
            radius: readingPanel.radius
            fillColor: readingPanel.fillColor
            edgeColor: readingPanel.colors["border"]
            edgeHighlight: edgeColor
        }
        Accessible.ignored: true
    }
    // One quiet group, one raised selected segment. Native TabBar/TabButton
    // continue to own mutual exclusion, arrow keys and accessible tab roles.
    component FilterGroup: TabBar {
        id: filterGroup
        property QtObject appearance: SurfaceAppearance {}
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        property bool selectionReady: false
        signal selectionChanged(int index)
        Component.onCompleted: selectionReady = true
        onCurrentIndexChanged: if (selectionReady && currentIndex >= 0) selectionChanged(currentIndex)
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
        // `.seg` (Glass): a recessed 32 pt track; the selected segment is a lens.
        padding: glass ? metrics.tight - metrics.hairline : 0
        spacing: glass ? metrics.hairline * 2 : 0
        implicitHeight: glass ? metrics.compactControl : Math.max(implicitBackgroundHeight + topInset + bottomInset, implicitContentHeight + topPadding + bottomPadding)
        property Item glassGroupBackground: Rectangle {
            parent: filterGroup
            anchors.fill: parent
            z: -1
            visible: filterGroup.glass
            radius: height / 2
            color: filterGroup.appearance.solid ? Qt.tint(filterGroup.appearance.control, filterGroup.colors["surface-muted"]) : filterGroup.colors["surface-muted"]
            border.width: filterGroup.metrics.hairline
            border.color: filterGroup.appearance.solid ? filterGroup.appearance.edge : filterGroup.colors["border"]
            Accessible.ignored: true
        }
        Binding { target: filterGroup.background; property: "visible"; value: false; when: filterGroup.glass }
    }
    component FilterButton: TabButton {
        id: filterButton
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        implicitHeight: glass ? metrics.compactControl - (metrics.tight - metrics.hairline) * 2 : metrics.control
        font.weight: checked ? Font.DemiBold : glass ? Font.Medium : Font.Normal
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        // Idle Glass segments read muted, the selected one strong (read from the theme, not
        // from this control's own palette, which would loop).
        palette.buttonText: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"][glass && !checked ? "text-muted" : "text"]
        // Glass segments hug their label instead of TabBar's equal split, so labels never truncate.
        width: glass ? implicitWidth : undefined
        ControlLens { control: filterButton; active: filterButton.glass && !filterButton.checked; quiet: true; selectionMarker: false }
        Binding { target: filterButton.background; property: "visible"; value: false; when: filterButton.glass }
        GlassLens { anchors.fill: parent; z: -1; visible: filterButton.glass && filterButton.checked; radius: height / 2 }
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
        property real titleScale: metrics.headingScale
        readonly property var metrics: workbench.resources.metrics
        spacing: metrics.small
        Label { text: intro.title; font.bold: true; font.pointSize: Qt.application.font.pointSize * intro.titleScale; wrapMode: Text.Wrap; Layout.fillWidth: true; Accessible.role: Accessible.Heading }
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
            // `.card` (Glass): a flat hairline surface on the reading pane; no nested pane.
            FlatCard { anchors.fill: parent; visible: card.glass; selected: card.selected }
        }
    }
    component FlatCard: Rectangle {
        property QtObject appearance: SurfaceAppearance {}
        property bool selected: false
        readonly property var metrics: workbench.resources.metrics
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
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
            FlatCard { anchors.fill: parent; visible: box.glass }
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
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        GridLayout {
            columns: row.width >= row.metrics.sidebar * 2 ? 2 : 1
            // `.srow` (Glass): at least 48 pt, label 14, description 12.
            Layout.minimumHeight: row.glass ? row.metrics.navControl + row.metrics.small - row.metrics.small * 2 : 0
            columnSpacing: row.metrics.inset
            rowSpacing: row.metrics.small
            Layout.fillWidth: true
            Layout.topMargin: row.metrics.small
            Layout.bottomMargin: row.metrics.small
            ColumnLayout {
                spacing: row.metrics.tight
                Layout.fillWidth: true
                Label { text: row.title; font.bold: !row.glass; font.weight: row.glass ? Font.Medium : Font.Bold; font.pointSize: Qt.application.font.pointSize * (row.glass ? row.metrics.labelScale : 1); wrapMode: Text.Wrap; Layout.fillWidth: true }
                Label { visible: !!row.detail; text: row.detail; color: palette.placeholderText; font.pointSize: Qt.application.font.pointSize * (row.glass ? row.metrics.smallScale : 1); wrapMode: Text.Wrap; Layout.fillWidth: true }
            }
            RowLayout { id: slot; Layout.fillWidth: true; spacing: row.metrics.small }
        }
        Rectangle { visible: row.divider; color: palette.midlight; implicitHeight: row.metrics.hairline; Layout.fillWidth: true }
    }
    component KeyCap: Label {
        id: cap
        readonly property var metrics: workbench.resources.metrics
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
        // `.kbd` (Glass): a 20 pt mono cap, raised white with a hairline.
        leftPadding: glass ? metrics.small - metrics.hairline * 2 : metrics.small
        rightPadding: leftPadding
        // Glass: padding brings the cap to exactly 20 pt around the text.
        topPadding: glass ? Math.max(0, (metrics.icon - contentHeight) / 2) : metrics.tight
        bottomPadding: topPadding
        verticalAlignment: Text.AlignVCenter
        font.family: glass ? "monospace" : Qt.application.font.family
        font.pointSize: Qt.application.font.pointSize * (glass ? metrics.captionScale : 1)
        color: palette.placeholderText
        background: Rectangle {
            radius: cap.glass ? cap.metrics.chromeShortcutRadius : cap.metrics.controlRadius
            color: cap.glass ? cap.colors.surface : "transparent"
            border.width: cap.metrics.hairline
            border.color: cap.glass ? cap.colors.border : cap.palette.mid
        }
    }
    // The single solid accent action of a region.
    component PrimaryButton: GlassButton {
        id: primary
        property QtObject appearance: SurfaceAppearance {}
        property string shortcutText: ""
        readonly property real expandedWidth: primaryLabel.implicitWidth + metrics.icon + metrics.small + leftPadding + rightPadding + (shortcutText ? primaryShortcut.implicitWidth + metrics.small : 0)
        glassProminent: true
        paintedPrimary: glass
        readonly property var metrics: workbench.resources.metrics
        implicitHeight: metrics.control
        leftPadding: metrics.inset
        rightPadding: metrics.inset
        icon.color: enabled ? primary.palette.highlightedText : primary.palette.placeholderText
        contentItem: RowLayout {
            spacing: primary.metrics.small
            IconImage { visible: !!primary.icon.source.toString(); source: primary.icon.source; color: primary.icon.color; sourceSize.width: primary.metrics.icon; sourceSize.height: primary.metrics.icon; Accessible.ignored: true }
            Label { id: primaryLabel; visible: primary.display !== AbstractButton.IconOnly; text: primary.text; color: primary.enabled ? primary.palette.highlightedText : primary.palette.placeholderText; Accessible.ignored: true }
            KeyCap { id: primaryShortcut; objectName: "primary-shortcut"; visible: !!primary.shortcutText && primary.display !== AbstractButton.IconOnly; text: primary.shortcutText; Accessible.ignored: true }
        }
        readonly property bool glass: workbench.state.appearance?.preset === "glass"
        readonly property bool darkMode: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && workbench.state.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][darkMode ? "dark" : "light"]
        // `.btn.primary` (Glass): the accent gradient pill; the focus ring is a separate 2 pt edge.
        background: Rectangle {
            radius: primary.glass ? height / 2 : primary.metrics.controlRadius
            color: !primary.enabled ? primary.palette.disabled.button : primary.down ? Qt.darker(primary.palette.highlight) : primary.palette.highlight
            gradient: primary.glass && primary.enabled && !primary.appearance.solid ? primaryFill : null
            Gradient {
                id: primaryFill
                GradientStop { position: 0; color: primary.colors["action-fill-top"] }
                GradientStop { position: 1; color: primary.down || primary.hovered ? primary.colors["action-active"] : primary.colors["action-fill-bottom"] }
            }
            border.width: primary.visualFocus ? primary.metrics.hairline * (primary.glass ? 2 : 1) : primary.appearance.solid ? primary.metrics.hairline : 0
            border.color: primary.appearance.solid && !primary.visualFocus ? primary.appearance.edge : primary.glass ? primary.colors["action-text"] : primary.palette.mid
        }
        Accessible.name: text
    }
    // Quiet shared action for raised Glass panels and compact filters.
    component QuietButton: GlassButton {
        id: quiet
        readonly property real expandedWidth: quietLabel.implicitWidth + metrics.icon + metrics.gap + leftPadding + rightPadding
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
            Label { id: quietLabel; visible: quiet.display !== AbstractButton.IconOnly; text: quiet.text; color: quiet.enabled ? quiet.palette.buttonText : quiet.palette.placeholderText; font.weight: quiet.checked || quiet.iconBadge ? Font.DemiBold : Font.Normal; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
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
    // A native focusable row shared by the Glass shell panels.
    component PanelRow: ItemDelegate {
        id: panelRow
        property string detail: ""
        property bool selected: false
        property string iconName: ""
        property bool disclosure: false
        readonly property var metrics: workbench.resources.metrics
        readonly property bool dark: workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
        readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][dark ? "dark" : "light"]
        implicitHeight: metrics.navControl
        leftPadding: metrics.gap; rightPadding: metrics.gap
        Accessible.selected: selected
        Accessible.name: text
        contentItem: RowLayout {
            spacing: panelRow.metrics.small
            IconImage { visible: !!panelRow.iconName; source: panelRow.iconName ? "icons/" + panelRow.iconName + ".svg" : ""; sourceSize.width: panelRow.metrics.icon; sourceSize.height: panelRow.metrics.icon; color: panelRow.colors["text-muted"]; Accessible.ignored: true }
            Label { text: panelRow.text; elide: Text.ElideRight; font.weight: panelRow.selected ? Font.DemiBold : Font.Normal; color: panelRow.enabled ? panelRow.colors.text : panelRow.colors["text-disabled"]; Layout.fillWidth: true; Accessible.ignored: true }
            Label { visible: !!panelRow.detail; text: panelRow.detail; elide: Text.ElideRight; Layout.maximumWidth: panelRow.availableWidth * panelRow.metrics.skeletonShort; color: panelRow.colors["text-muted"]; font.pointSize: Qt.application.font.pointSize * panelRow.metrics.smallScale; Accessible.ignored: true }
            Label { text: "✓"; visible: panelRow.selected; color: panelRow.colors.action; Accessible.ignored: true }
            IconImage { visible: panelRow.disclosure; source: "icons/back.svg"; rotation: -90; color: panelRow.colors["text-muted"]; sourceSize.width: panelRow.metrics.icon; sourceSize.height: panelRow.metrics.icon; Accessible.ignored: true }
        }
        background: Item {
            GlassLens { anchors.fill: parent; visible: panelRow.selected || panelRow.hovered || panelRow.highlighted; hover: !panelRow.selected; radius: panelRow.metrics.radius }
            Rectangle { anchors.fill: parent; color: "transparent"; radius: panelRow.metrics.radius; border.width: panelRow.visualFocus ? panelRow.metrics.hairline : 0; border.color: panelRow.colors.action }
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
            if (demo[id]) return workbench.resources.locales[workbench.state.locale][demo[id]] || demo[id]
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
        readonly property var metrics: workbench.resources.metrics
        leftPadding: metrics.small + metrics.tight
        rightPadding: leftPadding
        topPadding: metrics.tight
        bottomPadding: metrics.tight
        // `.chip`: 24 pt.
        implicitHeight: workbench.state.appearance?.preset === "glass" ? metrics.gutter : implicitContentHeight + topPadding + bottomPadding
        background: Rectangle { radius: height / 2; color: Qt.tint(badge.palette.base, Qt.alpha(badge.idle ? badge.palette.placeholderText : badge.palette.highlight, badge.metrics.selectionOpacity)) }
        contentItem: RowLayout {
            spacing: badge.metrics.small
            Rectangle { implicitWidth: badge.metrics.small; implicitHeight: implicitWidth; radius: implicitWidth / 2; color: badge.idle ? badge.palette.placeholderText : badge.palette.highlight }
            Label { text: badge.text; color: badge.idle ? badge.palette.placeholderText : badge.palette.highlight }
        }
        Accessible.name: text
    }
    // Shared W2 layers use the same opaque surface as W1. Geometry is measured in
    // the overlay's coordinate space, with room reserved for the opening control.
    component AnchoredPanel: Popup {
        id: panel
        property var shell: null
        property Item opener: null
        property real desiredWidth: workbench.resources.metrics.sidebar + workbench.resources.metrics.editor
        readonly property var metrics: workbench.resources.metrics
        parent: Overlay.overlay
        modal: false; focus: true
        padding: metrics.small
        // Fluent's default implicitWidth reads the content's implicit width;
        // a wrapping ScrollView already sizes its content from this layer.
        implicitWidth: desiredWidth
        width: Math.min(desiredWidth, (parent ? parent.width : desiredWidth) - metrics.inset * 2)
        height: Math.min(implicitContentHeight + padding * 2, Math.max(metrics.control, availableSpace))
        property point origin: Qt.point(metrics.inset, metrics.inset)
        property string ownerID: ""
        function updateAnchor() { if (opener && parent) origin = opener.mapToItem(parent, 0, 0) }
        readonly property real below: parent ? parent.height - origin.y - (opener ? opener.height : 0) - metrics.inset - metrics.small : metrics.editor * 3
        readonly property real above: origin.y - metrics.inset - metrics.small
        readonly property bool placeBelow: below >= implicitContentHeight + padding * 2 || below >= above
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
        property real threshold: workbench.resources.metrics.reading
        columns: width >= threshold ? 2 : 1
        columnSpacing: workbench.resources.metrics.inset
        rowSpacing: workbench.resources.metrics.inset
        Layout.fillWidth: true
    }
}
