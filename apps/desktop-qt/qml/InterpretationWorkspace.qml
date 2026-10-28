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
    property color dangerColor: palette.placeholderText
    // Named here: inside ProviderNotice, "model" would resolve to its own property.
    readonly property string modelID: model.text
    signal openSettings(string section)
    // Root scope: inside ProviderNotice handlers "model" names the notice's own property.
    function useModel(id) { model.text = id }
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
    // Opened from the shell header's History control (Review 18).
    function openHistory() { historyPopup.open() }
    Connections { target: root.live; function onChanged() { root.syncSelection() } }

    ColumnLayout {
        anchors.fill: parent; anchors.leftMargin: root.metrics.large; anchors.rightMargin: root.metrics.large; anchors.topMargin: root.metrics.inset; anchors.bottomMargin: root.metrics.inset; spacing: root.metrics.inset
        // Review 18: language row, session bar, then the transcript bar.
        // Language row; below the reading width the model takes its own line (see Main).
        GridLayout {
            Layout.fillWidth: true; columns: width >= root.metrics.reading ? 2 : 1; columnSpacing: root.metrics.small; rowSpacing: root.metrics.tight
            RowLayout {
                Layout.fillWidth: true; spacing: root.metrics.small
                Label { text: root.t("inputLanguage"); color: palette.placeholderText }
                ComboBox { id: source; flat: true; implicitContentWidthPolicy: ComboBox.WidestText; model: ["auto"].concat(root.languages).map(code => root.t("lang_" + code)); enabled: !root.live.busy; Accessible.name: root.t("inputLanguage") }
                Label { text: root.t("outputLanguage"); color: palette.placeholderText }
                ComboBox { id: target; flat: true; implicitContentWidthPolicy: ComboBox.WidestText; model: root.languages.map(code => root.t("lang_" + code)); currentIndex: root.languages.indexOf("vi"); enabled: !root.live.busy; Accessible.name: root.t("outputLanguage") }
                Item { Layout.fillWidth: true }
            }
            RowLayout {
                spacing: root.metrics.small
                Kit.StatusDot { visible: notice.unavailable; tone: "failed"; failedColor: root.dangerColor }
                Kit.ModelLabel { modelID: root.modelID; text: root.modelID ? format(root.modelID) : root.t("modelID"); color: palette.placeholderText; elide: Text.ElideRight; Layout.maximumWidth: root.metrics.sidebar; ToolTip.visible: modelHover.hovered && !!root.modelID; ToolTip.text: root.modelID; HoverHandler { id: modelHover } }
            }
        }
        Rectangle { color: palette.midlight; implicitHeight: root.metrics.hairline; Layout.fillWidth: true }
        // Transcription runs in the cloud: warn before recording when no speech provider has a key.
        RowLayout {
            objectName: "speech-notice"
            readonly property string provider: root.bridge.state.speechProvider || "auto"
            visible: (root.bridge.localModels, root.bridge.providersChecked) && !root.bridge.speechReady(provider)
            Layout.fillWidth: true; spacing: root.metrics.small
            Kit.StatusDot { tone: "failed"; failedColor: root.dangerColor }
            Label { text: root.t(parent.provider === "auto" ? "speechProviderMissing" : "speechProviderKeyMissing"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Button { text: root.t("openProviders"); onClicked: root.openSettings("providers") }
        }
        Kit.ProviderNotice { id: notice; model: root.modelID; dangerColor: root.dangerColor; Layout.fillWidth: true; onOpenRequested: section => root.openSettings(section); onUseRequested: id => root.useModel(id) }
        RowLayout {
            Layout.fillWidth: true; spacing: root.metrics.small
            Kit.StatusBadge { visible: root.live.listening; text: root.t("listening") }
            Button { flat: true; text: root.t("capture_" + captureMode.keys[captureMode.currentIndex]); icon.source: "icons/interpret.svg"; Accessible.name: root.t("captureOptions") + ": " + text; ToolTip.visible: hovered; ToolTip.text: root.t("captureOptions"); onClicked: setupDialog.open() }
            Item { Layout.fillWidth: true }
            Button { flat: true; text: root.t("subtitles"); checkable: true; checked: subtitles.visible; onClicked: subtitles.visible = !subtitles.visible }
            Button { visible: root.live.busy && !root.live.listening; text: root.t("cancel"); onClicked: root.live.cancel() }
            Button { visible: root.live.listening; text: root.t("stop"); onClicked: root.live.stop() }
            Kit.PrimaryButton { visible: !root.live.listening; text: root.t("startInterpretation"); icon.source: "icons/interpret.svg"; enabled: !root.live.busy && !root.bridge.loadBlocked && model.text.includes(":"); onClicked: { root.bridge.audio.cancel(); root.live.start(model.text, root.bridge.state.speechProvider || "auto", ["auto"].concat(root.languages)[source.currentIndex], root.languages[target.currentIndex], root.bridge.state.locale, captureMode.keys[captureMode.currentIndex], inputDevice.devices[inputDevice.currentIndex]?.id || "") } }
        }
        ProgressBar { visible: root.live.listening; value: root.live.level; Layout.fillWidth: true; Accessible.name: root.t("inputLevel") }
        Label { text: root.live.error ? root.t(root.live.error) : ""; visible: !!text; Layout.fillWidth: true; wrapMode: Text.Wrap }
        RowLayout {
            Layout.fillWidth: true; spacing: root.metrics.small
            Kit.SectionTitle { text: root.t("transcript"); Layout.fillWidth: true }
            Repeater {
                model: [[true, root.t("pairedTranscript")], [false, root.t("translationOnly")]]
                delegate: Button { required property var modelData; text: modelData[1]; flat: !checked; checkable: true; checked: root.showOriginal === modelData[0]; Accessible.checked: checked; onClicked: root.showOriginal = modelData[0] }
            }
            Kit.IconButton {
                iconName: "settings"; text: root.t("summarize")
                enabled: !root.live.busy && !!root.live.current.segments?.length
                onClicked: analysisMenu.open()
                Menu {
                    id: analysisMenu
                    Repeater { model: ["summary", "actionItems", "decisions", "speakerAnalysis"]; delegate: MenuItem { required property string modelData; text: root.t("interpret_" + modelData); onTriggered: root.live.summarize(modelData) } }
                    MenuSeparator {}
                    MenuItem { text: root.t("stopSpeaking"); onTriggered: root.live.silence() }
                }
            }
            Button { flat: true; text: root.t("copy"); onClicked: root.bridge.copy(root.live.exportText(false)) }
            Button {
                flat: true; text: root.t("export"); enabled: !!root.live.current.segments?.length; onClicked: exportMenu.open()
                Menu {
                    id: exportMenu
                    MenuItem { text: "TXT"; onTriggered: { exportDialog.srt = false; exportDialog.open() } }
                    MenuItem { text: "SRT"; onTriggered: { exportDialog.srt = true; exportDialog.open() } }
                }
            }
        }
        Rectangle { color: palette.midlight; implicitHeight: root.metrics.hairline; Layout.fillWidth: true }
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
                spacing: root.metrics.small
                RowLayout {
                    spacing: root.metrics.gutter
                    Layout.fillWidth: true
                    ColumnLayout {
                        Layout.preferredWidth: root.metrics.sidebar / 2; Layout.alignment: Qt.AlignTop
                        Label { text: String(Math.floor(modelData.start / 60)).padStart(2, "0") + ":" + String(Math.floor(modelData.start % 60)).padStart(2, "0"); color: palette.placeholderText }
                        TextField { visible: !!modelData.speaker; text: root.live.current.speakerNameMap?.[modelData.speaker] || modelData.speaker || ""; font.bold: true; background: null; enabled: !root.live.busy; Accessible.name: root.t("speakerName"); Layout.fillWidth: true; onEditingFinished: root.live.renameSpeaker(modelData.speaker, text) }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        Label { visible: root.showOriginal; text: modelData.original || ""; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        TextArea { text: modelData.translated || ""; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; color: root.showOriginal ? palette.placeholderText : palette.text; padding: 0; Layout.fillWidth: true }
                        RowLayout {
                            visible: ["queued", "transcribing", "translating", "failed", "interrupted", "cancelled"].includes(modelData.status) || !!modelData.error
                            Label { text: root.t(modelData.error || modelData.status); color: palette.placeholderText; Layout.fillWidth: true }
                            Button { visible: ["failed", "interrupted", "cancelled"].includes(modelData.status) && !!modelData.original; text: root.t("retry"); enabled: !root.live.busy; onClicked: root.live.retry(modelData.id) }
                        }
                    }
                    Kit.IconButton { iconName: "interpret"; text: root.t("speak"); enabled: !root.live.listening && !!modelData.translated; Layout.alignment: Qt.AlignTop; onClicked: root.live.speak(modelData.translated) }
                }
                Rectangle { color: palette.midlight; implicitHeight: root.metrics.hairline; Layout.fillWidth: true }
            }
        }
        ToolButton { id: analysisDetails; text: root.t("summarize"); checkable: true; visible: !!(root.live.current.summary || root.live.current.actionItems || root.live.current.decisions || root.live.current.speakerAnalysis) }
        ScrollView { visible: analysisDetails.checked && !!(root.live.current.summary || root.live.current.actionItems || root.live.current.decisions || root.live.current.speakerAnalysis); Layout.fillWidth: true; Layout.preferredHeight: root.metrics.editor * 2; TextArea { text: [root.live.current.summary, root.live.current.actionItems, root.live.current.decisions, root.live.current.speakerAnalysis].filter(Boolean).join("\n\n"); textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap } }
    }
    Popup {
        id: historyPopup; parent: Overlay.overlay; modal: false; focus: true
        width: Math.min(root.width, root.metrics.sidebar + root.metrics.editor)
        height: Math.min(root.height, root.metrics.editor * 3)
        x: Math.max(0, parent.width - width - root.metrics.inset)
        y: root.metrics.navControl + root.metrics.small
        closePolicy: Popup.CloseOnPressOutside
        Keys.onEscapePressed: event => { if (!historySearch.inputMethodComposing) historyPopup.close(); else event.accepted = false }
        onOpened: historySearch.forceActiveFocus()
        onClosed: root.forceActiveFocus()
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
