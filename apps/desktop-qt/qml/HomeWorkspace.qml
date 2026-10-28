import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Home reads work and native status; the runtime probe never starts Ollama.
ScrollView {
    id: home
    required property var bridge
    property color dangerColor: palette.placeholderText
    signal start(string feature)
    signal resume(string sessionID)
    signal settings()
    Component.onCompleted: bridge.localRuntime.refresh()
    readonly property var metrics: bridge.resources.metrics
    property string filter: ""
    readonly property var features: ["chat", "translate", "dictionary"].filter(feature => !(home.bridge.state.disabledModules || []).includes(feature))
    readonly property var recentAll: bridge.state.sessions.filter(item => !(home.bridge.state.disabledModules || []).includes(item.feature) && !item.comparisonParent && !item.archived && (item.draft.length || item.messages.length || item.output.length)).sort((a,b) => (b.updated || 0) - (a.updated || 0))
    readonly property var recent: recentAll.filter(item => !filter || item.feature === filter).slice(0, 6)
    readonly property var running: recentAll.filter(item => home.bridge.state.tasks.some(task => task.status === "running" && task.request.sessionID === item.id)).slice(0, 4)
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function titleFor(item) { return item.title || t(item.feature === "chat" ? "newChat" : item.feature === "dictionary" ? "newLookup" : "newTranslation") }
    function detailFor(item) { return item.feature === "chat" ? t("chat") : t(item.feature) + " · " + t("lang_" + item.source) + " → " + t("lang_" + item.target) }
    function since(seconds) {
        if (!seconds) return ""
        return new Date(seconds * 1000).toLocaleDateString(Qt.locale(bridge.state.locale), Locale.ShortFormat)
    }
    contentWidth: availableWidth
    ColumnLayout {
        width: home.availableWidth - home.metrics.gap * 2
        x: home.metrics.gap
        spacing: home.metrics.gutter
        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: home.metrics.inset
            Kit.PageIntro { title: home.t("workspace"); subtitle: home.t("workspaceSubtitle"); Layout.fillWidth: true }
            Kit.PrimaryButton {
                text: home.t("newWork"); icon.source: "icons/new.svg"
                Layout.alignment: Qt.AlignTop
                enabled: !home.bridge.loadBlocked && home.features.includes("chat")
                ToolTip.visible: hovered; ToolTip.text: home.t("newChat")
                onClicked: home.start("chat")
            }
        }
        ColumnLayout {
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
                            Image { source: "icons/" + modelData.feature + ".svg"; sourceSize.width: home.metrics.icon; sourceSize.height: home.metrics.icon }
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
        ColumnLayout {
            spacing: home.metrics.small
            Layout.fillWidth: true
            RowLayout {
                Layout.fillWidth: true
                Kit.SectionTitle { text: home.t("recentWork"); Layout.fillWidth: true }
                Repeater {
                    model: [""].concat(home.features)
                    delegate: Button {
                        required property string modelData
                        text: modelData ? home.t(modelData) : home.t("filterAll")
                        flat: true; checkable: true; checked: home.filter === modelData
                        implicitHeight: home.metrics.compactControl
                        Accessible.checked: checked
                        onClicked: home.filter = modelData
                    }
                }
            }
            Rectangle { color: palette.midlight; implicitHeight: home.metrics.hairline; Layout.fillWidth: true }
            Label { visible: home.recent.length === 0; text: home.t("noRecentWork"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.topMargin: home.metrics.small }
            Repeater {
                model: home.recent
                delegate: ColumnLayout {
                    required property var modelData
                    spacing: 0
                    Layout.fillWidth: true
                    ItemDelegate {
                        Layout.fillWidth: true
                        text: home.titleFor(modelData)
                        Accessible.name: text + ", " + home.detailFor(modelData)
                        ToolTip.visible: hovered; ToolTip.text: text
                        enabled: !home.bridge.loadBlocked
                        contentItem: RowLayout {
                            spacing: home.metrics.gap
                            Image { source: "icons/" + modelData.feature + ".svg"; sourceSize.width: home.metrics.icon; sourceSize.height: home.metrics.icon }
                            ColumnLayout {
                                spacing: home.metrics.tight; Layout.fillWidth: true
                                Label { textFormat: Text.PlainText; text: home.titleFor(modelData); font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
                                Label { textFormat: Text.PlainText; text: home.detailFor(modelData); color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
                            }
                            Label { visible: !!modelData.favorite; text: home.t("favorite"); color: palette.placeholderText }
                            Label { text: home.since(modelData.updated); color: palette.placeholderText }
                            Label { text: "→"; Accessible.ignored: true }
                        }
                        onClicked: home.resume(modelData.id)
                    }
                    Rectangle { color: palette.midlight; implicitHeight: home.metrics.hairline; Layout.fillWidth: true }
                }
            }
        }
        ColumnLayout {
            spacing: home.metrics.small
            Layout.fillWidth: true
            Kit.SectionTitle { text: home.t("quickStart") }
            Flow {
                Layout.fillWidth: true
                spacing: home.metrics.small
                Repeater {
                    model: ["chat", "translate", "interpret", "dictionary"].filter(feature => !(home.bridge.state.disabledModules || []).includes(feature))
                    delegate: Button {
                        required property string modelData
                        text: home.t(modelData === "chat" ? "newChat" : modelData === "translate" ? "translateText" : modelData === "dictionary" ? "lookup" : "interpret")
                        icon.source: "icons/" + (modelData === "chat" ? "new" : modelData) + ".svg"
                        implicitHeight: home.metrics.navControl
                        enabled: !home.bridge.loadBlocked
                        onClicked: home.start(modelData)
                    }
                }
            }
        }
        RowLayout {
            spacing: home.metrics.small
            Layout.fillWidth: true
            Layout.bottomMargin: home.metrics.inset
            // The active model's real readiness, local or cloud (not only Ollama).
            readonly property string activeModel: home.bridge.state.sessions.find(item => item.id === home.bridge.state.active[home.bridge.state.feature])?.model || ""
            readonly property string availability: (home.bridge.localModels, home.bridge.providersChecked, home.bridge.availability(activeModel))
            Kit.StatusDot { tone: parent.availability === "available" ? "ready" : parent.availability === "unknown" ? "idle" : "failed"; failedColor: home.dangerColor }
            Kit.ModelLabel { modelID: parent.activeModel; text: format(modelID) + (parent.availability === "unknown" ? "" : " · " + home.t(parent.availability === "available" ? "runtimeReady" : "unavailable").toLowerCase()); font.bold: true; elide: Text.ElideRight }
            Label { text: home.t(["ollama", "lmstudio", "llamacpp"].includes(parent.activeModel.split(":")[0]) ? "onDevice" : "viaCloud"); color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
            Button { text: home.t("manage"); onClicked: home.settings() }
        }
    }
}
