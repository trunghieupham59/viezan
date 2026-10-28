import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
Window {
    id: panel
    required property var bridge
    signal openMainRequested(string sessionID)
    readonly property var metrics: bridge.resources.metrics
    readonly property var desktop: bridge.desktopIntegration
    property string mode: "quickChat"
    property string ownerID: ""
    property string chatID: ""
    property string query: ""
    onQueryChanged: fileDelay.restart()
    Timer { id: fileDelay; interval: 250; onTriggered: panel.desktop.searchFiles(panel.query) }
    readonly property var session: bridge.state.sessions.find(value => value.id === ownerID)
    readonly property var task: bridge.state.tasks.find(value => value.request.sessionID === ownerID && value.status === "running")
    readonly property var apps: desktop.applications.filter(value => !query || value.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    width: metrics.reading
    height: metrics.reading
    minimumWidth: metrics.sidebar + metrics.editor
    minimumHeight: metrics.editor * 3
    flags: Qt.Tool | Qt.WindowStaysOnTopHint | Qt.WindowCloseButtonHint | Qt.WindowTitleHint
    SystemPalette { id: panelPalette }
    color: panelPalette.base
    title: t(mode)
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function command(name, values) { const payload = Object.assign({sessionID: ownerID}, values || {}); bridge.command(name, payload) }
    Connections {
        target: panel.desktop
        function onActivated(action, selectedText) {
            if (!panel.bridge.moduleEnabled(action === "launcher" ? "utilities" : action === "quickChat" ? "chat" : "translate")) return
            panel.mode = action
            if (action === "launcher") panel.desktop.refreshApplications()
            else if (action === "translateSelection") {
                // Translate right away into quick translate's own pair (same as macOS).
                panel.ownerID = panel.bridge.createDetachedSession("translate", selectedText)
                if (selectedText.trim()) { panel.command("pair", {source: "auto", target: panel.bridge.quickTranslateTarget(selectedText)}); panel.command("submit") }
            }
            else {
                if (!panel.chatID || panel.bridge.state.sessions.find(value => value.id === panel.chatID)?.archived) panel.chatID = panel.bridge.createDetachedSession("chat", "")
                panel.ownerID = panel.chatID
            }
            panel.show(); panel.raise(); panel.requestActivate()
        }
    }
    Shortcut { sequence: "Escape"; onActivated: panel.hide() }
    ColumnLayout {
        anchors.fill: parent; anchors.margins: panel.metrics.inset; spacing: panel.metrics.inset
        TextField { visible: panel.mode === "launcher"; text: panel.query; onTextEdited: panel.query = text; placeholderText: panel.t("searchLabel"); Layout.fillWidth: true; onAccepted: { if (panel.apps.length) { panel.desktop.launch(panel.apps[0].id); panel.hide() } } }
        RowLayout {
            visible: panel.mode === "launcher"
            Repeater {
                model: ["chat", "translate", "dictionary"]
                delegate: Button { required property string modelData; text: panel.t(modelData); onClicked: { panel.openMainRequested(panel.bridge.state.active[modelData]); panel.hide() } }
            }
        }
        Button { visible: panel.mode === "launcher"; text: panel.t("searchWeb"); enabled: panel.query.trim().length > 0; onClicked: panel.desktop.searchWeb(panel.query) }
        Button {
            readonly property string result: panel.desktop.currency || panel.desktop.calculate(panel.query)
            visible: panel.mode === "launcher" && !!result
            text: result; Accessible.name: panel.t("copyResponse") + " " + result
            onClicked: panel.bridge.copy(result)
        }
        ListView {
            visible: panel.mode === "launcher" && panel.desktop.files.length > 0
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true
            model: panel.desktop.files
            delegate: ItemDelegate { required property var modelData; width: ListView.view.width; text: modelData.name; ToolTip.text: modelData.id; ToolTip.visible: hovered; onClicked: { panel.desktop.openFile(modelData.id); panel.hide() }
                onPressAndHold: fileMenu.open()
                Menu { id: fileMenu; MenuItem { text: panel.t("revealFile"); onTriggered: panel.desktop.revealFile(modelData.id) } }
            }
        }
        ListView {
            visible: panel.mode === "launcher"; Layout.fillWidth: true; Layout.fillHeight: true; clip: true
            model: panel.apps
            delegate: ItemDelegate { required property var modelData; width: ListView.view.width; text: modelData.name; onClicked: { panel.desktop.launch(modelData.id); panel.hide() } }
        }
        ColumnLayout {
            visible: panel.mode !== "launcher" && !!panel.session
            Layout.fillWidth: true; Layout.fillHeight: true
            RowLayout {
                Label { textFormat: Text.PlainText; text: panel.session?.title || panel.t(panel.mode); font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
                Button { text: panel.t("open"); onClicked: { panel.openMainRequested(panel.ownerID); panel.hide() } }
            }
            ScrollView {
                Layout.fillWidth: true; Layout.fillHeight: true
                TextArea { text: panel.session?.feature === "chat" ? (panel.session.messages || []).map(value => value.text).join("\n\n") : panel.session?.output || ""; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; textFormat: TextEdit.PlainText }
            }
            ScrollView {
                contentWidth: availableWidth
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(panel.metrics.editor, Math.max(panel.metrics.composerMinimum, quickDraft.contentHeight + panel.metrics.inset * 2))
                TextArea {
                    id: quickDraft
                    text: panel.session?.draft || ""
                    onTextChanged: { if (panel.session && text !== panel.session.draft) panel.command("draft", {value: text}) }
                    placeholderText: panel.t("prompt"); Accessible.name: panel.t("prompt")
                    wrapMode: TextEdit.Wrap; selectByMouse: true
                    padding: panel.metrics.inset
                    background: Rectangle { color: palette.base; radius: panel.metrics.radius; border.width: panel.metrics.hairline; border.color: quickDraft.activeFocus ? palette.text : palette.mid }
                    function sendKey(event) {
                        if (!inputMethodComposing && (event.modifiers & (Qt.ControlModifier | Qt.MetaModifier))) {
                            event.accepted = true
                            if (!panel.task && text.trim()) panel.command("submit")
                        } else event.accepted = false
                    }
                    Keys.onReturnPressed: event => sendKey(event)
                    Keys.onEnterPressed: event => sendKey(event)
                }
            }
            ComboBox {
                visible: panel.session?.feature === "translate"
                readonly property var codes: panel.bridge.resources.nativeLanguages
                model: codes.map(value => panel.t("lang_" + value))
                currentIndex: codes.indexOf(panel.session?.target || "vi")
                Accessible.name: panel.t("outputLanguage")
                onActivated: panel.command("pair", {source: "auto", target: codes[currentIndex]})
            }
            TextField { text: panel.session?.model || ""; onEditingFinished: panel.command("model", {value: text}); Accessible.name: panel.t("modelID"); Layout.fillWidth: true }
            RowLayout {
                Button { text: panel.t(panel.task ? "stop" : "send"); highlighted: !panel.task; enabled: !!panel.task || !!panel.session?.draft.trim(); onClicked: panel.task ? panel.bridge.command("cancel", {taskID: panel.task.id}) : panel.command("submit") }
                Item { Layout.fillWidth: true }
                Button { text: panel.t("copy"); onClicked: panel.bridge.copy(panel.session?.feature === "chat" ? panel.session.messages.slice(-1)[0]?.text || "" : panel.session?.output || "") }
            }
            RowLayout {
                visible: panel.mode === "translateSelection"
                Button {
                    visible: panel.desktop.canReplaceSelection
                    text: panel.t("replaceSelection")
                    enabled: !panel.task && !!panel.session?.output && panel.bridge.state.tasks.some(value => value.request.sessionID === panel.ownerID && value.request.revision === panel.session.revision && value.status === "succeeded")
                    onClicked: panel.desktop.replaceSelection(panel.session.output)
                }
                Button { visible: panel.desktop.canUndoSelection; text: panel.t("undoSelection"); onClicked: panel.desktop.undoSelection() }
            }
            Label { visible: panel.mode === "translateSelection"; text: panel.t("selectionCopyHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
        Label { text: panel.desktop.error ? panel.t(panel.desktop.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
}
