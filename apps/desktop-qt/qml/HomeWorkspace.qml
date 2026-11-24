import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Home reads work and native status; the runtime probe never starts Ollama.
NamedScrollView {
    scrollName: home.t("home")
    id: home
    objectName: "home-workspace"
    required property var bridge
    // One conversion of the bridge state per change, shared by every binding below.
    // A host that already holds one passes it in.
    property var snapshot: bridge.state
    property color dangerColor: palette.placeholderText
    signal start(string feature)
    signal resume(string sessionID)
    signal settings()
    signal habitActivated(var action)
    component HomeHabits: HabitChips {
        bridge: home.bridge
        sessionID: home.snapshot.active.chat
        onActivated: action => home.habitActivated(action)
    }
    Component.onCompleted: bridge.localRuntime.refresh()
    readonly property var metrics: bridge.metrics
    readonly property bool darkMode: bridge.appearance?.mode === "dark" || (bridge.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    property bool compact: width < metrics.reading
    readonly property string activeModel: snapshot.defaultModel || snapshot.sessions.find(item => item.id === snapshot.active[snapshot.feature])?.model || ""
    readonly property string modelAvailability: (bridge.localModels, bridge.providersChecked, bridge.availability(activeModel))
    readonly property var colors: bridge.palettes[darkMode ? "dark" : "light"]
    property string filter: ""
    readonly property var features: ["chat", "translate", "dictionary"].filter(feature => !home.bridge.disabledModules.includes(feature))
    readonly property var recentAll: snapshot.sessions.filter(item => !home.bridge.disabledModules.includes(item.feature) && !item.comparisonParent && !item.archived && (item.draft.length || item.messages.length || item.output.length)).sort((a,b) => (b.updated || 0) - (a.updated || 0))
    readonly property var recent: recentAll.filter(item => !filter || item.feature === filter).slice(0, 6)
    readonly property var running: recentAll.filter(item => home.snapshot.tasks.some(task => task.status === "running" && task.request.sessionID === item.id)).slice(0, 4)
    readonly property var localeStrings: bridge.strings
    function t(key) { return localeStrings[key] || key }
    function titleFor(item) { return item.title || t(item.feature === "chat" ? "newChat" : item.feature === "dictionary" ? "newLookup" : "newTranslation") }
    function detailFor(item) { return item.feature === "chat" ? t("chat") : t(item.feature) + " · " + t("lang_" + item.source) + " → " + t("lang_" + item.target) }
    function since(seconds) {
        if (!seconds) return ""
        return new Date(seconds * 1000).toLocaleDateString(Qt.locale(bridge.locale), Locale.ShortFormat)
    }
    contentWidth: availableWidth
    contentHeight: homeBody.implicitHeight
    Loader {
        id: homeBody
        width: home.availableWidth - home.metrics.gap * 2
        x: home.metrics.gap
        sourceComponent: glassLayout
    }
    // Home board (Liquid Glass 2.0): intro with the model strip and the primary action,
    // four glass quick-start tiles, then Recent as a flat list with a `.seg` filter.
    Component {
        id: glassLayout
        ColumnLayout {
            spacing: home.metrics.large - home.metrics.tight
            GlassIntro {}
            RunningSection {}
            ColumnLayout {
                spacing: home.metrics.gap
                Layout.fillWidth: true
                Kit.Eyebrow { text: home.t("quickStart") }
                GridLayout {
                    id: tiles
                    objectName: "home-quick-grid"
                    readonly property int count: ["chat", "translate", "interpret", "dictionary"].filter(feature => !home.bridge.disabledModules.includes(feature)).length
                    columns: home.compact ? Math.min(2, count) : width + home.metrics.gap >= count * (home.metrics.compactSidebar - home.metrics.gutter + home.metrics.gap) ? count : width + home.metrics.gap >= 2 * (home.metrics.compactSidebar - home.metrics.gutter + home.metrics.gap) ? 2 : 1
                    columnSpacing: home.metrics.gap; rowSpacing: home.metrics.gap
                    Layout.fillWidth: true
                    Repeater {
                        model: ["chat", "translate", "interpret", "dictionary"].filter(feature => !home.bridge.disabledModules.includes(feature))
                        delegate: GlassTile { required property string modelData; feature: modelData }
                    }
                }
            }
            GlassRecent {}
            HomeHabits {}
        }
    }
    component GlassIntro: RowLayout {
        Layout.fillWidth: true
        spacing: home.compact ? home.metrics.small : home.metrics.gutter
        Kit.PageIntro { objectName: "home-intro"; titleScale: home.compact ? (home.metrics.headingScale + home.metrics.titleScale) / 2 : home.metrics.headingScale; title: home.t("workspace"); subtitle: home.t("workspaceSubtitle"); Layout.fillWidth: true; Layout.minimumWidth: 0; Layout.alignment: Qt.AlignTop }
        Kit.QuietButton {
            objectName: "home-model-pill"
            visible: home.compact
            Layout.alignment: Qt.AlignTop
            Layout.maximumWidth: home.metrics.editor + home.metrics.control
            text: home.bridge.shortModelName(home.activeModel) || home.t("model")
            Accessible.name: home.t("model") + ": " + text + ", " + home.t(home.modelAvailability === "available" ? "runtimeReady" : home.modelAvailability === "unknown" ? "model" : "unavailable") + ". " + home.t("manage")
            ToolTip.visible: hovered; ToolTip.text: Accessible.name
            contentItem: RowLayout {
                spacing: home.metrics.small
                Kit.StatusDot { tone: home.modelAvailability === "available" ? "ready" : home.modelAvailability === "unknown" ? "idle" : "failed"; failedColor: home.dangerColor }
                Label { text: home.bridge.shortModelName(home.activeModel) || home.t("model"); elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                Kit.Chevron {}
            }
            onClicked: home.settings()
        }
        // One glass strip: readiness dot, provider · model, its state and a quiet Manage.
        Item {
            id: strip
            visible: !home.compact
            readonly property string activeModel: home.activeModel
            readonly property string availability: (home.bridge.localModels, home.bridge.providersChecked, home.bridge.availability(activeModel))
            Layout.alignment: Qt.AlignTop
            implicitWidth: stripRow.implicitWidth + home.metrics.gap + home.metrics.tight
            implicitHeight: home.metrics.control
            Kit.ControlGlassSurface { anchors.fill: parent; radius: height / 2 }
            RowLayout {
                id: stripRow
                anchors.verticalCenter: parent.verticalCenter
                x: home.metrics.gap + home.metrics.hairline * 2
                spacing: home.metrics.small + home.metrics.hairline * 2
                Kit.StatusDot { tone: strip.availability === "available" ? "ready" : strip.availability === "unknown" ? "idle" : "failed"; failedColor: home.dangerColor }
                Kit.ModelLabel { modelID: strip.activeModel; font.weight: Font.Medium; color: home.colors["text-strong"]; Layout.maximumWidth: home.metrics.sidebar; elide: Text.ElideRight }
                Label {
                    text: (strip.availability === "unknown" ? "" : home.t(strip.availability === "available" ? "runtimeReady" : "unavailable").toLowerCase() + " · ") + home.t(["ollama", "lmstudio", "llamacpp"].includes(strip.activeModel.split(":")[0]) ? "onDevice" : "viaCloud")
                    color: palette.placeholderText; visible: home.width >= home.metrics.reading + home.metrics.sidebar
                }
                ToolButton {
                    text: home.t("manage"); flat: true
                    font.pointSize: Qt.application.font.pointSize * home.metrics.smallScale; font.weight: Font.Medium
                    palette.buttonText: home.colors["action-text"]
                    onClicked: home.settings()
                }
            }
        }
        Kit.PrimaryButton {
            text: home.t("newWork"); icon.source: "icons/new.svg"
            display: home.width < home.metrics.dialog ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon
            Layout.alignment: Qt.AlignTop
            enabled: !home.bridge.loadBlocked && home.features.includes("chat")
            ToolTip.visible: hovered; ToolTip.text: home.t("newChat")
            onClicked: home.start("chat")
        }
    }
    // `.tile.glass`: a 56 pt glass tile with a toned 36 pt icon tile.
    component GlassTile: AbstractButton {
        id: tile
        property string feature
        readonly property string tone: feature === "chat" ? "tone-blue" : feature === "translate" ? "tone-violet" : feature === "interpret" ? "tone-green" : "tone-orange"
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        implicitHeight: home.metrics.navControl + home.metrics.inset
        enabled: !home.bridge.loadBlocked
        text: home.t(feature === "chat" ? "newChat" : feature === "translate" ? "translateText" : feature === "dictionary" ? "lookup" : "interpret")
        Accessible.name: text
        background: Item {
            // A wide tile uses the pane material (translucent face, light rim); hover lifts it to a lens.
            Kit.GlassPane { solidRole: "control"; startRole: "surface-raised"; endRole: "surface"; anchors.fill: parent; radius: home.metrics.gap + home.metrics.hairline * 2; shadowRole: "shadow-sm-color"; visible: !tile.hovered && !tile.down; opacity: tile.enabled ? 1 : 0.5 }
            Kit.GlassLens { anchors.fill: parent; radius: home.metrics.gap + home.metrics.hairline * 2; visible: tile.hovered || tile.down }
            Rectangle { anchors.fill: parent; radius: home.metrics.gap + home.metrics.hairline * 2; color: "transparent"; visible: tile.visualFocus; border.width: home.metrics.focusRingWidth; border.color: home.colors["action-text"] }
        }
        contentItem: RowLayout {
            spacing: home.metrics.gap
            Rectangle {
                Layout.leftMargin: home.metrics.small + home.metrics.hairline * 2
                implicitWidth: home.metrics.control; implicitHeight: home.metrics.control
                radius: home.metrics.controlRadius
                color: Qt.alpha(home.colors[tile.tone], home.metrics.selectionOpacity * 1.5)
                Image { Accessible.ignored: true; anchors.centerIn: parent; source: "icons/" + (tile.feature === "chat" ? "new" : tile.feature) + ".svg"; sourceSize.width: home.metrics.icon; sourceSize.height: home.metrics.icon }
            }
            Label { text: tile.text; font.weight: Font.Medium; font.pointSize: Qt.application.font.pointSize * home.metrics.labelScale; color: home.colors["text-strong"]; elide: Text.ElideRight; Layout.fillWidth: true }
            Label { text: "→"; color: palette.placeholderText; Layout.rightMargin: home.metrics.gap; Accessible.ignored: true }
        }
        onClicked: home.start(feature)
    }
    // `.row` list: accent icon, title 14 medium, 12 pt detail, time and arrow; hover is a lens.
    component GlassRecent: ColumnLayout {
        Accessible.role: Accessible.Grouping
        Accessible.name: home.t("recentWork")
        spacing: home.metrics.small
        Layout.fillWidth: true
        GridLayout {
            id: recentHeader
            Layout.fillWidth: true
            columns: width >= recentTitle.implicitWidth + recentFilters.implicitWidth + columnSpacing ? 2 : 1
            columnSpacing: home.metrics.gap
            rowSpacing: home.metrics.small
            Kit.Eyebrow { id: recentTitle; objectName: "home-recent-title"; text: home.t("recentWork"); Layout.fillWidth: true }
            Kit.FilterGroup {
                id: recentFilters
                Layout.alignment: recentHeader.columns === 2 ? Qt.AlignRight : Qt.AlignLeft
                Layout.maximumWidth: recentHeader.width
                objectName: "home-recent-filters"
                readonly property var keys: [""].concat(home.features)
                currentIndex: keys.indexOf(home.filter)
                onSelectionChanged: index => home.filter = keys[index]
                Repeater {
                    model: [""].concat(home.features)
                    delegate: Kit.FilterButton { required property string modelData; text: modelData ? home.t(modelData) : home.t("filterAll") }
                }
            }
        }
        Label { visible: home.recent.length === 0; text: home.t("noRecentWork"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.margins: home.metrics.gap }
        Repeater {
            model: home.recent
            delegate: ColumnLayout {
                required property var modelData
                required property int index
                spacing: 0
                Layout.fillWidth: true
                Rectangle { visible: index > 0; color: home.colors.divider; implicitHeight: home.metrics.hairline; Layout.fillWidth: true; Layout.leftMargin: home.metrics.gap; Layout.rightMargin: home.metrics.gap }
                ItemDelegate {
                    id: recentRow
                    Layout.fillWidth: true
                    implicitHeight: home.metrics.navControl + home.metrics.gap
                    text: home.titleFor(modelData)
                    Accessible.name: text + ", " + home.detailFor(modelData)
                    ToolTip.visible: hovered; ToolTip.text: text
                    enabled: !home.bridge.loadBlocked
                    leftPadding: home.metrics.gap; rightPadding: home.metrics.gap
                    background: Item {
                        Kit.GlassLens { anchors.fill: parent; visible: recentRow.hovered || recentRow.down || recentRow.visualFocus; hover: !recentRow.down }
                        Rectangle { anchors.fill: parent; visible: recentRow.visualFocus; radius: home.metrics.radius; color: "transparent"; border.width: home.metrics.focusRingWidth; border.color: recentRow.palette.highlight; Accessible.ignored: true }
                    }
                    contentItem: RowLayout {
                        spacing: home.metrics.gap
                        Image { Accessible.ignored: true; source: "icons/" + modelData.feature + ".svg"; sourceSize.width: home.metrics.icon; sourceSize.height: home.metrics.icon }
                        ColumnLayout {
                            spacing: home.metrics.hairline * 2; Layout.fillWidth: true
                            Label { textFormat: Text.PlainText; text: home.titleFor(modelData); font.weight: Font.Medium; font.pointSize: Qt.application.font.pointSize * home.metrics.labelScale; color: home.colors["text-strong"]; elide: Text.ElideRight; Layout.fillWidth: true }
                            Label { textFormat: Text.PlainText; text: home.detailFor(modelData); color: palette.placeholderText; font.pointSize: Qt.application.font.pointSize * home.metrics.smallScale; elide: Text.ElideRight; Layout.fillWidth: true }
                        }
                        Label { visible: !!modelData.favorite; text: home.t("favorite"); color: home.colors["action-text"]; font.pointSize: Qt.application.font.pointSize * home.metrics.smallScale }
                        Label { text: home.since(modelData.updated); color: home.colors["text-soft"]; font.pointSize: Qt.application.font.pointSize * home.metrics.smallScale }
                        Label { text: "→"; color: palette.placeholderText; Accessible.ignored: true }
                    }
                    onClicked: home.resume(modelData.id)
                }
            }
        }
    }


    component RunningSection: ColumnLayout {
        Accessible.role: Accessible.Grouping
        Accessible.name: home.t("inProgress")
        visible: home.running.length > 0
        spacing: home.metrics.small
        Layout.fillWidth: true
        Kit.Eyebrow { text: home.t("inProgress") }
        GridLayout {
            columns: width >= home.metrics.sidebar * 3 ? 2 : 1
            columnSpacing: home.metrics.small; rowSpacing: home.metrics.small
            Layout.fillWidth: true
            Repeater {
                model: home.running
                delegate: ItemDelegate {
                    required property var modelData
                    Layout.fillWidth: true
                    text: home.titleFor(modelData)
                    Accessible.name: text + ", " + home.t("running")
                    enabled: !home.bridge.loadBlocked
                    padding: home.metrics.inset
                    background: Rectangle { radius: home.metrics.surfaceRadius; color: parent.hovered ? palette.alternateBase : palette.base; border.width: home.metrics.hairline; border.color: palette.midlight }
                    contentItem: RowLayout {
                        spacing: home.metrics.gap
                        Image { Accessible.ignored: true; source: "icons/" + modelData.feature + ".svg"; sourceSize.width: home.metrics.icon; sourceSize.height: home.metrics.icon }
                        ColumnLayout {
                            spacing: home.metrics.tight; Layout.fillWidth: true
                            Label { text: home.titleFor(modelData); font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
                            Label { text: home.t("running"); color: palette.placeholderText }
                        }
                        Label { text: home.t("open") + " →"; color: palette.placeholderText }
                    }
                    onClicked: home.resume(modelData.id)
                }
            }
        }
    }
}
