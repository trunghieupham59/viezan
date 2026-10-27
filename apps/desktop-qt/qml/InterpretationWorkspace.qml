import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
Item {
    id: root
    required property var bridge
    readonly property var live: bridge.interpretation
    readonly property var metrics: bridge.resources.metrics
    readonly property var languages: bridge.resources.nativeLanguages
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Component.onDestruction: live.silence()
    property bool showOriginal: true
    property string shownSessionID: ""
    function syncSelection() {
        const current = live.current
        if (!current.id || current.id === shownSessionID) return
        shownSessionID = current.id
        source.currentIndex = ["auto"].concat(languages).indexOf(current.source)
        target.currentIndex = languages.indexOf(current.target)
        model.text = current.model
        captureMode.currentIndex = captureMode.keys.indexOf(current.captureMode || "microphone")
    }
    Component.onCompleted: syncSelection()
    Connections { target: root.live; function onChanged() { root.syncSelection() } }

    ColumnLayout {
        anchors.fill: parent; anchors.margins: root.metrics.inset; spacing: root.metrics.inset
        Flow {
            Layout.fillWidth: true; Layout.preferredHeight: implicitHeight; spacing: root.metrics.small
            ComboBox { id: source; model: ["auto"].concat(root.languages).map(code => root.t("lang_" + code)); enabled: !root.live.busy; Accessible.name: root.t("inputLanguage") }
            ComboBox { id: target; model: root.languages.map(code => root.t("lang_" + code)); currentIndex: root.languages.indexOf("vi"); enabled: !root.live.busy; Accessible.name: root.t("outputLanguage") }
            Button { text: root.t("captureOptions"); icon.source: "icons/settings.svg"; onClicked: setupDialog.open() }
            Button { text: root.t(root.live.listening ? "stop" : "startInterpretation"); enabled: root.live.listening || (!root.live.busy && !root.bridge.loadBlocked && model.text.includes(":")); onClicked: { if (root.live.listening) root.live.stop(); else { root.bridge.audio.cancel(); root.live.start(model.text, root.bridge.state.speechProvider || "openai", ["auto"].concat(root.languages)[source.currentIndex], root.languages[target.currentIndex], root.bridge.state.locale, captureMode.keys[captureMode.currentIndex], inputDevice.devices[inputDevice.currentIndex]?.id || "") } } }
            Button { visible: root.live.busy; text: root.t("cancel"); onClicked: root.live.cancel() }
        }
        ProgressBar { visible: root.live.listening; value: root.live.level; Layout.fillWidth: true; Accessible.name: root.t("inputLevel") }
        Label { text: root.live.error ? root.t(root.live.error) : ""; visible: !!text; Layout.fillWidth: true; wrapMode: Text.Wrap }
        Flow {
            Layout.fillWidth: true; Layout.preferredHeight: implicitHeight; spacing: root.metrics.small
            Button { id: historyTrigger; text: root.t("history"); enabled: !root.live.busy; onClicked: historyPopup.open() }
            ComboBox { model: [root.t("pairedTranscript"), root.t("translationOnly")]; Accessible.name: root.t("transcriptView"); currentIndex: root.showOriginal ? 0 : 1; onActivated: root.showOriginal = currentIndex === 0 }
            Button { text: root.t("subtitles"); checkable: true; checked: subtitles.visible; onClicked: subtitles.visible = !subtitles.visible }
            Button { text: root.t("copy"); onClicked: root.bridge.copy(root.live.exportText(false)) }
            Button {
                text: root.t("export"); enabled: !!root.live.current.segments?.length; onClicked: exportMenu.open()
                Menu {
                    id: exportMenu
                    MenuItem { text: "TXT"; onTriggered: { exportDialog.srt = false; exportDialog.open() } }
                    MenuItem { text: "SRT"; onTriggered: { exportDialog.srt = true; exportDialog.open() } }
                }
            }
        }
        EmptyState {
            visible: !(root.live.current.segments || []).length
            Layout.fillWidth: true; Layout.fillHeight: true
            heading: root.t("interpretEmpty"); detail: root.t("interpretEmptyHint"); metrics: root.metrics
        }
        ListView {
            visible: !!(root.live.current.segments || []).length
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; spacing: root.metrics.inset
            model: root.live.current.segments || []
            ScrollBar.vertical: ScrollBar {}
            delegate: ColumnLayout {
                required property var modelData
                width: ListView.view.width
                TextField { visible: !!modelData.speaker; text: root.live.current.speakerNameMap?.[modelData.speaker] || modelData.speaker || ""; enabled: !root.live.busy; Accessible.name: root.t("speakerName"); onEditingFinished: root.live.renameSpeaker(modelData.speaker, text) }
                Label { visible: root.showOriginal; text: modelData.original || ""; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                TextArea { text: modelData.translated || ""; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; Layout.fillWidth: true }
                RowLayout {
                    Label { text: root.t(modelData.error || modelData.status); Layout.fillWidth: true }
                    Button { visible: ["failed", "interrupted", "cancelled"].includes(modelData.status) && !!modelData.original; text: root.t("retry"); enabled: !root.live.busy; onClicked: root.live.retry(modelData.id) }
                    Button { text: root.t("speak"); enabled: !root.live.listening && !!modelData.translated; onClicked: root.live.speak(modelData.translated) }
                }
            }
        }
        ToolButton { id: analysisDetails; text: root.t("summarize"); checkable: true; visible: !!(root.live.current.summary || root.live.current.actionItems || root.live.current.decisions || root.live.current.speakerAnalysis) }
        ScrollView { visible: analysisDetails.checked && !!(root.live.current.summary || root.live.current.actionItems || root.live.current.decisions || root.live.current.speakerAnalysis); Layout.fillWidth: true; Layout.preferredHeight: root.metrics.editor * 2; TextArea { text: [root.live.current.summary, root.live.current.actionItems, root.live.current.decisions, root.live.current.speakerAnalysis].filter(Boolean).join("\n\n"); textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap } }
        RowLayout {
            ComboBox { id: analysis; readonly property var keys: ["summary", "actionItems", "decisions", "speakerAnalysis"]; model: keys.map(key => root.t("interpret_" + key)); Accessible.name: root.t("summarize") }
            Button { text: root.t("summarize"); enabled: !root.live.busy && !!root.live.current.segments?.length; onClicked: root.live.summarize(analysis.keys[analysis.currentIndex]) }
            Item { Layout.fillWidth: true }
            Button { text: root.t("stopSpeaking"); onClicked: root.live.silence() }
        }
    }
    Popup {
        id: historyPopup; parent: Overlay.overlay; modal: false; focus: true
        width: Math.min(root.width, root.metrics.sidebar + root.metrics.editor)
        height: Math.min(root.height, root.metrics.editor * 3)
        x: Math.max(0, Math.min(historyTrigger.mapToItem(parent, 0, 0).x, parent.width-width))
        y: Math.max(0, Math.min(historyTrigger.mapToItem(parent, 0, historyTrigger.height).y, parent.height-height))
        closePolicy: Popup.CloseOnPressOutside
        Keys.onEscapePressed: event => { if (!historySearch.inputMethodComposing) historyPopup.close(); else event.accepted = false }
        onOpened: historySearch.forceActiveFocus()
        onClosed: historyTrigger.forceActiveFocus()
        contentItem: ColumnLayout {
            Label { text: root.t("history"); font.bold: true }
            TextField {
                id: historySearch; placeholderText: root.t("historySearch"); Accessible.name: placeholderText; Layout.fillWidth: true; selectByMouse: true
                background: Rectangle { color: palette.base; radius: root.metrics.radius; border.width: root.metrics.hairline; border.color: historySearch.activeFocus ? palette.text : palette.mid }
                Keys.onDownPressed: event => { if (!inputMethodComposing) historyList.currentIndex = Math.min(historyList.count-1, historyList.currentIndex+1); else event.accepted = false }
                Keys.onUpPressed: event => { if (!inputMethodComposing) historyList.currentIndex = Math.max(0, historyList.currentIndex-1); else event.accepted = false }
                Keys.onReturnPressed: event => { if (!inputMethodComposing && historyList.currentIndex >= 0 && historyList.currentIndex < historyList.count) { root.live.select(historyList.model[historyList.currentIndex].id); historyPopup.close() } else event.accepted = false }
            }
            Label { visible: historyList.count === 0; text: root.t("noHistory"); wrapMode: Text.Wrap; Layout.fillWidth: true }
            ListView {
                id: historyList
                Layout.fillWidth: true; Layout.fillHeight: true; clip: true
                onCountChanged: currentIndex = count ? 0 : -1
                model: root.live.sessions.filter(value => !historySearch.text.trim() || (new Date(value.created*1000).toLocaleString() + " " + (value.segments || []).map(segment => segment.original + " " + segment.translated).join(" ")).toLocaleLowerCase().includes(historySearch.text.trim().toLocaleLowerCase()))
                ScrollBar.vertical: ScrollBar {}
                delegate: ItemDelegate { required property var modelData; width: ListView.view.width; text: new Date(modelData.created*1000).toLocaleString(); highlighted: ListView.isCurrentItem; onClicked: { root.live.select(modelData.id); historyPopup.close() } }
            }
            Button { text: root.t("delete"); enabled: !!root.live.current.id; onClicked: { historyPopup.close(); deleteMeeting.sessionID = root.live.current.id; deleteMeeting.open() } }
        }
    }
    Dialog {
        id: setupDialog; parent: Overlay.overlay; title: root.t("captureOptions"); modal: false
        width: Math.min(root.width, root.metrics.sidebar + root.metrics.editor)
        height: Math.min(root.height, root.metrics.editor * 3)
        standardButtons: Dialog.Close
        x: (parent.width-width)/2; y: (parent.height-height)/2
        contentItem: ScrollView {
            id: setupScroll; contentWidth: availableWidth
            ColumnLayout {
                width: setupScroll.availableWidth; spacing: root.metrics.inset
            ComboBox { id: captureMode; readonly property var keys: ["microphone", "system", "mixed"]; model: keys.map(key => root.t("capture_" + key)); enabled: !root.live.busy; Accessible.name: root.t("captureSource") }
            ComboBox { id: inputDevice; readonly property var devices: [{id:"", name:root.t("voiceAutomatic")}].concat(root.live.inputs); model: devices; textRole: "name"; enabled: !root.live.busy && captureMode.currentIndex !== 1; Accessible.name: root.t("captureDevice") }
            TextField { id: model; text: root.bridge.state.sessions.find(value => value.id === root.bridge.state.active[root.bridge.state.feature])?.model || ""; enabled: !root.live.busy; Accessible.name: root.t("modelID") }
            }
        }
    }
    FileDialog { id: exportDialog; property bool srt: false; fileMode: FileDialog.SaveFile; defaultSuffix: srt ? "srt" : "txt"; nameFilters: srt ? ["SRT (*.srt)"] : ["TXT (*.txt)"]; onAccepted: root.live.exportFile(selectedFile, srt) }
    Window {
        id: subtitles
        SystemPalette { id: subtitlePalette }
        width: root.metrics.reading; height: root.metrics.editor * 2; flags: Qt.Tool | Qt.WindowStaysOnTopHint | Qt.WindowTitleHint | Qt.WindowCloseButtonHint; color: subtitlePalette.base; title: root.t("subtitles")
        readonly property var segment: (root.live.current.segments || []).slice(-1)[0]
        ColumnLayout {
            anchors.fill: parent; anchors.margins: root.metrics.inset
            Label { text: subtitles.segment?.original || ""; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Label { text: subtitles.segment?.translated || ""; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.fillHeight: true }
            Button { visible: root.live.listening; text: root.t("stop"); onClicked: root.live.stop() }
        }
    }
    Dialog { id: deleteMeeting; property string sessionID; title: root.t("deleteInterpretation"); modal: true; standardButtons: Dialog.Yes | Dialog.Cancel; onAccepted: root.live.deleteSession(sessionID) }
}
