import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
Item {
    id: root
    objectName: "interpret-workspace"
    required property var bridge
    property var shell: null
    readonly property bool glass: bridge.state.appearance?.preset === "glass"
    property string microphonePermission: bridge.audio.microphonePermission()
    readonly property bool permissionMissing: captureMode.currentIndex !== 1 && microphonePermission !== "granted"
    property bool exporting: false
    property bool exportFailed: false
    property string summaryKind: "summary"
    readonly property var segments: live.current.segments || []
    readonly property var speakers: segments.reduce((all, segment) => { if (segment.speaker && !all.includes(segment.speaker)) all.push(segment.speaker); return all }, [])
    function tpl(key, values) { let text = t(key); Object.keys(values).forEach(key => text = text.split("{" + key + "}").join(values[key])); return text }
    function notify(text, undo) { if (shell) shell.notify(text, undo) }
    function recheckPermission() { microphonePermission = bridge.audio.microphonePermission() }
    function begin() { recheckPermission(); bridge.audio.cancel(); live.start(model.text, bridge.state.speechProvider || "auto", ["auto"].concat(languages)[source.currentIndex], languages[target.currentIndex], bridge.state.locale, captureMode.keys[captureMode.currentIndex], inputDevice.devices[inputDevice.currentIndex]?.id || "") }
    function deleteSession(id) {
        const service = live, feedback = shell, restored = t("sessionRestored")
        const removed = service.sessions.find(session => session.id === id)
        if (!removed) return
        service.deleteSession(id)
        if (!service.sessions.some(session => session.id === id)) notify(t("interpretationDeleted"), function() {
            service.restoreSession(removed)
            if (feedback && service.sessions.some(session => session.id === id)) feedback.notify(restored)
        })
    }
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
        inputDevice.currentIndex = Math.max(0, inputDevice.devices.findIndex(device => device.id === (current.deviceID || "")))
    }
    Component.onCompleted: syncSelection()
    // Opened from the shell header's History control (Review 18).
    function openHistory(opener) { historyPopup.openAt(opener || setupTrigger) }
    Connections { target: root.live; function onChanged() { root.syncSelection(); if (root.live.error === "microphoneDenied") root.recheckPermission(); if (root.exporting && root.live.error === "interpretStorageError") root.exportFailed = true } }

    ColumnLayout {
        visible: !root.glass
        anchors.fill: parent; anchors.leftMargin: root.metrics.large; anchors.rightMargin: root.metrics.large; anchors.topMargin: root.metrics.inset; anchors.bottomMargin: root.metrics.inset; spacing: root.metrics.inset
        // Review 18: language row, session bar, then the transcript bar.
        // Language row; below the reading width the model takes its own line (see Main).
        GridLayout {
            Layout.fillWidth: true; columns: width >= root.metrics.reading ? 2 : 1; columnSpacing: root.metrics.small; rowSpacing: root.metrics.tight
            RowLayout {
                Layout.fillWidth: true; spacing: root.metrics.small
                Label { text: root.t("inputLanguage"); color: palette.placeholderText }
                Kit.GlassComboBox { id: source; flat: true; implicitContentWidthPolicy: ComboBox.WidestText; model: ["auto"].concat(root.languages).map(code => root.t("lang_" + code)); enabled: !root.live.busy; Accessible.name: root.t("inputLanguage") }
                Label { text: root.t("outputLanguage"); color: palette.placeholderText }
                Kit.GlassComboBox { id: target; flat: true; implicitContentWidthPolicy: ComboBox.WidestText; model: root.languages.map(code => root.t("lang_" + code)); currentIndex: root.languages.indexOf("vi"); enabled: !root.live.busy; Accessible.name: root.t("outputLanguage") }
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
            Kit.GlassButton { text: root.t("openProviders"); onClicked: root.openSettings("providers") }
        }
        Kit.ProviderNotice { id: notice; model: root.modelID; dangerColor: root.dangerColor; Layout.fillWidth: true; onOpenRequested: section => root.openSettings(section); onUseRequested: id => root.useModel(id) }
        RowLayout {
            Layout.fillWidth: true; spacing: root.metrics.small
            Kit.StatusBadge { visible: root.live.listening; text: root.t("listening") }
            Kit.GlassButton { flat: true; text: root.t("capture_" + captureMode.keys[captureMode.currentIndex]); icon.source: "icons/interpret.svg"; Accessible.name: root.t("captureOptions") + ": " + text; ToolTip.visible: hovered; ToolTip.text: root.t("captureOptions"); onClicked: setupDialog.open() }
            Item { Layout.fillWidth: true }
            Kit.GlassButton { flat: true; text: root.t("subtitles"); checkable: true; checked: subtitles.visible; onClicked: subtitles.visible = !subtitles.visible }
            Kit.GlassButton { visible: root.live.busy && !root.live.listening; text: root.t("cancel"); onClicked: root.live.cancel() }
            Kit.GlassButton { visible: root.live.listening; text: root.t("stop"); onClicked: root.live.stop() }
            Kit.PrimaryButton { visible: !root.live.listening; text: root.t("startInterpretation"); icon.source: "icons/interpret.svg"; enabled: !root.live.busy && !root.bridge.loadBlocked && model.text.includes(":"); onClicked: { root.bridge.audio.cancel(); root.live.start(model.text, root.bridge.state.speechProvider || "auto", ["auto"].concat(root.languages)[source.currentIndex], root.languages[target.currentIndex], root.bridge.state.locale, captureMode.keys[captureMode.currentIndex], inputDevice.devices[inputDevice.currentIndex]?.id || "") } }
        }
        ProgressBar { visible: root.live.listening; value: root.live.level; Layout.fillWidth: true; Accessible.name: root.t("inputLevel") }
        Label { text: root.live.error ? root.t(root.live.error) : ""; visible: !!text; Layout.fillWidth: true; wrapMode: Text.Wrap }
        RowLayout {
            Layout.fillWidth: true; spacing: root.metrics.small
            Kit.SectionTitle { text: root.t("transcript"); Layout.fillWidth: true }
            Repeater {
                model: [[true, root.t("pairedTranscript")], [false, root.t("translationOnly")]]
                delegate: Kit.GlassButton { required property var modelData; text: modelData[1]; flat: !checked; checkable: true; checked: root.showOriginal === modelData[0]; Accessible.checked: checked; onClicked: root.showOriginal = modelData[0] }
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
            Kit.GlassButton { flat: true; text: root.t("copy"); onClicked: root.bridge.copy(root.live.exportText(false)) }
            Kit.GlassButton {
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
                            Kit.GlassButton { visible: ["failed", "interrupted", "cancelled"].includes(modelData.status) && !!modelData.original; text: root.t("retry"); enabled: !root.live.busy; onClicked: root.live.retry(modelData.id) }
                        }
                    }
                    Kit.IconButton { iconName: "interpret"; text: root.t("speak"); enabled: !root.live.listening && !!modelData.translated; Layout.alignment: Qt.AlignTop; onClicked: root.live.speak(modelData.translated) }
                }
                Rectangle { color: palette.midlight; implicitHeight: root.metrics.hairline; Layout.fillWidth: true }
            }
        }
        Kit.GlassToolButton { id: analysisDetails; text: root.t("summarize"); checkable: true; visible: !!(root.live.current.summary || root.live.current.actionItems || root.live.current.decisions || root.live.current.speakerAnalysis) }
        ScrollView { visible: analysisDetails.checked && !!(root.live.current.summary || root.live.current.actionItems || root.live.current.decisions || root.live.current.speakerAnalysis); Layout.fillWidth: true; Layout.preferredHeight: root.metrics.editor * 2; TextArea { text: [root.live.current.summary, root.live.current.actionItems, root.live.current.decisions, root.live.current.speakerAnalysis].filter(Boolean).join("\n\n"); textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap } }
    }
    Kit.AnchoredPanel {
        id: historyPopup; shell: root.shell; objectName: "interpret-history"
        closePolicy: Popup.CloseOnPressOutside
        onOpened: historySearch.forceActiveFocus()
        contentItem: ColumnLayout {
            implicitHeight: root.metrics.editor * 3
            Label { text: root.t("history"); font.bold: true }
            Kit.SearchField {
                id: historySearch; placeholderText: root.t("historySearch"); Accessible.name: placeholderText; Layout.fillWidth: true; selectByMouse: true
                Keys.onEscapePressed: event => { if (!inputMethodComposing) historyPopup.close(); else event.accepted = false }
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
                ScrollBar.vertical: ScrollBar { policy: historyList.contentHeight > historyList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
                delegate: ItemDelegate { required property var modelData; width: ListView.view.width; text: new Date(modelData.created*1000).toLocaleString(); highlighted: ListView.isCurrentItem; onClicked: { root.live.select(modelData.id); historyPopup.close() } }
            }
            Kit.GlassButton { text: root.t("delete"); enabled: !!root.live.current.id && !root.live.busy; onClicked: { historyPopup.close(); root.deleteSession(root.live.current.id) } }
        }
    }
    GlassDialog {
        id: setupDialog; parent: Overlay.overlay; title: root.t("captureOptions"); modal: false
        width: Math.min(root.width, root.metrics.sidebar + root.metrics.editor)
        height: Math.min(root.height, root.metrics.editor * 3)
        standardButtons: Dialog.Close
        x: (parent.width-width)/2; y: (parent.height-height)/2
        contentItem: ScrollView {
            id: setupScroll; contentWidth: availableWidth
            ColumnLayout {
                width: setupScroll.availableWidth; spacing: root.metrics.inset
            Kit.GlassComboBox { id: captureMode; readonly property var keys: ["microphone", "system", "mixed"]; model: keys.map(key => root.t("capture_" + key)); enabled: !root.live.busy; Accessible.name: root.t("captureSource") }
            Kit.GlassComboBox { id: inputDevice; readonly property var devices: [{id:"", name:root.t("voiceAutomatic")}].concat(root.live.inputs); model: devices; textRole: "name"; enabled: !root.live.busy && captureMode.currentIndex !== 1; Accessible.name: root.t("captureDevice") }
            TextField { id: model; text: root.bridge.state.sessions.find(value => value.id === root.bridge.state.active[root.bridge.state.feature])?.model || ""; enabled: !root.live.busy; Accessible.name: root.t("modelID") }
            }
        }
    }
    FileDialog { id: exportDialog; property bool srt: false; fileMode: FileDialog.SaveFile; defaultSuffix: srt ? "srt" : "txt"; nameFilters: srt ? ["SRT (*.srt)"] : ["TXT (*.txt)"]; onAccepted: { root.exportFailed = false; root.exporting = true; root.live.exportFile(selectedFile, srt, !root.showOriginal); root.exporting = false; if (!root.exportFailed) root.notify(root.tpl("fileSaved", {name:decodeURIComponent(selectedFile.toString().split("/").pop())})) } }
    Window {
        id: subtitles
        SystemPalette { id: subtitlePalette }
        width: root.metrics.reading; height: root.metrics.editor * 2; flags: Qt.Tool | Qt.WindowStaysOnTopHint | Qt.WindowTitleHint | Qt.WindowCloseButtonHint; color: subtitlePalette.base; title: root.t("subtitles")
        readonly property var segment: (root.live.current.segments || []).slice(-1)[0]
        Kit.ReadingPanelSurface { visible: root.glass; anchors.fill: parent }
        ColumnLayout {
            anchors.fill: parent; anchors.margins: root.metrics.inset
            Label { visible: root.showOriginal; text: subtitles.segment?.original || ""; textFormat: Text.PlainText; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Label { text: subtitles.segment?.translated || ""; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.fillHeight: true }
            Kit.GlassButton { visible: root.live.listening; text: root.t("stop"); onClicked: root.live.stop() }
        }
    }
    ColumnLayout {
        id: glassWorkspace; objectName: "interpret-glass"
        visible: root.glass; anchors.fill: parent; anchors.margins: root.metrics.inset; spacing: root.metrics.gap
        GridLayout {
            Layout.fillWidth: true; columns: width >= root.metrics.reading ? 2 : 1
            columnSpacing: root.metrics.small; rowSpacing: root.metrics.tight
            RowLayout {
                Layout.fillWidth: true; spacing: root.metrics.small
                LanguageButton { objectName: "interpret-source-language"; shell: root.shell; allowAuto: true; language: ["auto"].concat(root.languages)[source.currentIndex] || "auto"; label: root.t("inputLanguage"); enabled: !root.live.busy; onChosen: code => source.currentIndex = ["auto"].concat(root.languages).indexOf(code) }
                Kit.IconButton { objectName: "interpret-swap"; iconName: "swap"; text: root.t("swap"); enabled: !root.live.busy && source.currentIndex > 0; onClicked: {
                    const previous = ["auto"].concat(root.languages)[source.currentIndex]
                    source.currentIndex = ["auto"].concat(root.languages).indexOf(root.languages[target.currentIndex])
                    target.currentIndex = root.languages.indexOf(previous)
                } }
                LanguageButton { objectName: "interpret-target-language"; shell: root.shell; language: root.languages[target.currentIndex] || "vi"; label: root.t("outputLanguage"); enabled: !root.live.busy; onChosen: code => target.currentIndex = root.languages.indexOf(code) }
                Item { Layout.fillWidth: true }
            }
            RowLayout {
                SessionModelPicker { objectName: "interpret-model-picker"; shell: root.shell; bridge: root.bridge; compact: true; glassFeature: true; selectionOnly: true; selectedModel: root.modelID; enabled: !root.live.busy; onModelChosen: id => root.useModel(id); onConfigureRequested: glassSetup.openAt(setupTrigger) }
                Kit.QuietButton { id: setupTrigger; text: root.t("captureOptions"); icon.source: "icons/settings.svg"; icon.color: palette.buttonText; display: AbstractButton.IconOnly; Accessible.name: text; ToolTip.visible: hovered && !glassSetup.visible; ToolTip.text: text; onClicked: glassSetup.openAt(setupTrigger) }
            }
        }
        Kit.ProviderNotice { model: root.modelID; dangerColor: root.dangerColor; Layout.fillWidth: true; onOpenRequested: section => root.openSettings(section); onUseRequested: id => root.useModel(id) }
        RowLayout {
            readonly property string provider: root.bridge.state.speechProvider || "auto"
            visible: (root.bridge.localModels, root.bridge.providersChecked) && !root.bridge.speechReady(provider)
            Layout.fillWidth: true
            Label { text: root.t(parent.provider === "auto" ? "speechProviderMissing" : "speechProviderKeyMissing"); wrapMode: Text.Wrap; color: palette.placeholderText; Layout.fillWidth: true }
            Kit.QuietButton { text: root.t("openProviders"); onClicked: root.openSettings("providers") }
        }
        Kit.FlatCard {
            objectName: "microphone-permission-card"
            visible: root.permissionMissing
            Layout.fillWidth: true; implicitHeight: permissionContent.implicitHeight + root.metrics.inset * 2
            ColumnLayout {
                id: permissionContent; anchors.fill: parent; anchors.margins: root.metrics.inset
                Label { text: root.t("microphonePermission") + " · " + root.t("permissionMissing"); font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Label { text: root.t(Qt.platform.os === "windows" ? "microphonePermissionHintWindows" : "microphonePermissionHint"); wrapMode: Text.Wrap; Layout.fillWidth: true; color: palette.placeholderText }
                RowLayout {
                    Kit.GlassButton { objectName: "microphone-settings"; text: root.t("openSystemSettings"); onClicked: root.bridge.desktopIntegration.openPrivacySettings() }
                    Kit.GlassButton { objectName: "microphone-recheck"; text: root.t("checkAgain"); onClicked: root.recheckPermission() }
                }
            }
        }
        RowLayout {
            visible: !!root.live.error && root.live.error !== "microphoneDenied"
            Layout.fillWidth: true
            Label { text: root.t(root.live.error); wrapMode: Text.Wrap; Layout.fillWidth: true }
            Kit.QuietButton { objectName: "interpret-reload"; visible: root.live.blocked || root.live.error === "interpretStorageError"; text: root.t("retry"); enabled: !root.live.busy; onClicked: root.live.reload() }
        }
        RowLayout {
            objectName: "interpret-session-actions"; Layout.fillWidth: true
            Kit.StatusBadge { text: root.t(root.live.listening ? "listening" : "speechReady"); idle: !root.live.listening }
            Label { text: root.t("capture_" + captureMode.keys[captureMode.currentIndex]); color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
            Kit.QuietButton { text: root.t("subtitles"); icon.source: "icons/expand.svg"; icon.color: palette.buttonText; display: root.width < root.metrics.reading ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; checkable: true; checked: subtitles.visible; onClicked: subtitles.visible = !subtitles.visible }
            Kit.GlassButton { visible: root.live.busy && !root.live.listening && !root.live.summarizing; text: root.t("cancel"); onClicked: root.live.cancel() }
            Kit.GlassButton { visible: root.live.listening; text: root.t("stop"); icon.source: "icons/stop.svg"; onClicked: root.live.stop() }
            Kit.PrimaryButton { objectName: "interpret-start"; visible: !root.live.listening; text: root.t("startInterpretation"); icon.source: "icons/interpret.svg"; display: root.width < root.metrics.reading ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; enabled: !root.live.busy && !root.live.blocked && !root.bridge.loadBlocked && model.text.includes(":") && (captureMode.currentIndex === 1 || root.microphonePermission !== "denied"); onClicked: root.begin() }
        }
        ProgressBar { visible: root.live.listening; value: root.live.level; Layout.fillWidth: true; Accessible.name: root.t("inputLevel") }
        GridLayout {
            Layout.fillWidth: true; Layout.fillHeight: true; columns: width >= root.metrics.compact ? 2 : 1; columnSpacing: root.metrics.inset + root.metrics.tight; rowSpacing: root.metrics.small
            ColumnLayout {
                Layout.fillWidth: true; Layout.fillHeight: true; Layout.minimumWidth: 0
                RowLayout {
                    visible: root.segments.length > 0; objectName: "interpret-transcript-actions"; Layout.fillWidth: true
                    Label { text: root.t("transcript"); font.bold: true; visible: root.width >= root.metrics.reading }
                    Repeater { model: ["pairedTranscript", "translationOnly"]; delegate: Kit.QuietButton { required property string modelData; required property int index; text: root.t(modelData); checked: root.showOriginal === (index === 0); onClicked: root.showOriginal = index === 0 } }
                    Item { Layout.fillWidth: true }
                    Kit.IconButton { iconName: "copy"; text: root.t("copy"); onClicked: { root.bridge.copy(root.live.exportText(false, !root.showOriginal)); root.notify(root.t("copied")) } }
                    Kit.IconButton { id: exportTrigger; iconName: "export"; text: root.t("exportTranscript"); ToolTip.visible: hovered && !glassExport.visible; onClicked: glassExport.openAt(exportTrigger) }
                }
                EmptyState { visible: !root.segments.length && !root.permissionMissing; heading: root.t("interpretEmpty"); detail: root.t("interpretEmptyHint"); metrics: root.metrics; Layout.fillWidth: true; Layout.fillHeight: true }
                ListView {
                    id: glassTranscript; objectName: "interpret-transcript"; visible: !!root.segments.length
                    Layout.fillWidth: true; Layout.fillHeight: true; Layout.minimumHeight: root.metrics.editor
                    clip: true; model: root.segments; spacing: root.metrics.inset
                    ScrollBar.vertical: ScrollBar { policy: glassTranscript.contentHeight > glassTranscript.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff }
                    delegate: ColumnLayout {
                        required property var modelData
                        width: glassTranscript.width; spacing: root.metrics.small
                        Rectangle { Layout.fillWidth: true; implicitHeight: root.metrics.hairline; color: palette.midlight }
                        RowLayout {
                            Layout.fillWidth: true; spacing: root.metrics.inset
                            Label { text: String(Math.floor(modelData.start / 60)).padStart(2,"0") + ":" + String(Math.floor(modelData.start % 60)).padStart(2,"0"); color: palette.placeholderText; Layout.alignment: Qt.AlignTop }
                            ColumnLayout {
                                Layout.fillWidth: true; Layout.minimumWidth: 0
                                TextField { visible: !!modelData.speaker; text: root.live.current.speakerNameMap?.[modelData.speaker] || modelData.speaker || ""; background: null; font.bold: true; enabled: !root.live.busy; Accessible.name: root.t("speakerName"); Layout.fillWidth: true; onEditingFinished: root.live.renameSpeaker(modelData.speaker, text) }
                                Label { visible: root.showOriginal; text: modelData.original || ""; textFormat: Text.PlainText; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                TextArea { text: modelData.translated || ""; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; padding: 0; Layout.fillWidth: true }
                                Label { visible: modelData.status !== "done" || !!modelData.error; text: root.t(modelData.error || modelData.status); wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Kit.QuietButton { visible: ["failed","interrupted","cancelled"].includes(modelData.status) && !!modelData.original; text: root.t("retry"); enabled: !root.live.busy; onClicked: root.live.retry(modelData.id) }
                            }
                            Kit.IconButton { iconName: "listen"; text: root.t(root.bridge.audio.speakingSource === "interpret:" + modelData.id ? "stopSpeaking" : "speak"); Layout.alignment: Qt.AlignTop; enabled: !root.live.listening && !!modelData.translated; onClicked: root.bridge.audio.speakingSource === "interpret:" + modelData.id ? root.bridge.audio.silence() : root.bridge.audio.speak(modelData.translated, root.live.current.target, "interpret:" + modelData.id) }
                        }
                    }
                }
            }
            ScrollView {
                id: sessionSide; visible: !!root.live.current.id; contentWidth: availableWidth
                ScrollBar.vertical: ScrollBar { policy: sessionSide.contentHeight > sessionSide.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
                Layout.preferredWidth: parent.columns === 2 ? root.metrics.editor * 2 : -1; Layout.fillWidth: parent.columns === 1; Layout.fillHeight: parent.columns === 2; Layout.maximumHeight: parent.columns === 1 ? root.metrics.editor : Infinity
                ColumnLayout {
                    width: sessionSide.availableWidth; spacing: root.metrics.inset
                    Kit.Card {
                    Layout.fillWidth: true
                    contentItem: ColumnLayout {
                    Label { text: root.t("sessionPanel"); font.bold: true }
                    Label { text: new Date((root.live.current.created || 0) * 1000).toLocaleString(); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Label { text: root.tpl("speakersAndLines", {speakers:root.speakers.length, lines:root.segments.length}); color: palette.placeholderText }
                    Kit.ModelLabel { modelID: root.modelID; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Repeater { model: root.speakers; delegate: Label { required property string modelData; text: (root.live.current.speakerNameMap?.[modelData] || modelData) + " · " + root.tpl("speakerLines", {n:root.segments.filter(segment => segment.speaker === modelData).length}); wrapMode: Text.Wrap; Layout.fillWidth: true } }
                    Kit.GlassButton { id: summaryTrigger; icon.source: "icons/reasoning.svg"; text: root.t(root.live.summarizing ? "stop" : "summarize"); enabled: root.live.summarizing || (!root.live.busy && !!root.segments.length); Layout.fillWidth: true; ToolTip.visible: hovered && !glassSummary.visible; ToolTip.text: text; onClicked: root.live.summarizing ? root.live.cancelSummary() : glassSummary.openAt(summaryTrigger) }
                    Label { visible: root.live.summarizing; text: root.t("summarizing"); Layout.fillWidth: true }
                    Label { visible: !!root.live.current[root.summaryKind]; text: root.t("interpret_" + root.summaryKind); font.bold: true }
                    TextArea { visible: !!root.live.current[root.summaryKind]; text: root.live.current[root.summaryKind] || ""; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
                    }
                    }
                    Kit.Card {
                    Layout.fillWidth: true
                    contentItem: ColumnLayout {
                    Label { text: root.t("yourTranscript"); font.bold: true }
                    Label { text: root.t("transcriptSavedHint"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    RowLayout { Repeater { model: ["TXT","SRT"]; delegate: Kit.QuietButton { required property string modelData; text: modelData; enabled: !!root.segments.length; onClicked: { exportDialog.srt = modelData === "SRT"; exportDialog.open() } } } }
                    }
                    }
                    Kit.QuietButton { id: previousTrigger; text: root.t("previousSessions"); icon.source: "icons/history.svg"; icon.color: palette.buttonText; Layout.fillWidth: true; onClicked: root.openHistory(previousTrigger) }
                }
            }
        }
    }
    Kit.AnchoredPanel {
        id: glassSetup; shell: root.shell; objectName: "interpret-setup"
        contentItem: ScrollView {
            id: setupLayerScroll; contentWidth: availableWidth; implicitHeight: root.metrics.editor * 2
            ScrollBar.vertical: ScrollBar { policy: setupLayerScroll.contentHeight > setupLayerScroll.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
            ColumnLayout {
                width: setupLayerScroll.availableWidth
                Label { text: root.t("captureOptions"); font.bold: true }
                Repeater { model: captureMode.keys; delegate: Kit.PanelRow { required property string modelData; required property int index; text: root.t("capture_" + modelData); selected: captureMode.currentIndex === index; enabled: !root.live.busy; Layout.fillWidth: true; onClicked: captureMode.currentIndex = index } }
                Label { text: root.t("captureDevice"); color: palette.placeholderText }
                Repeater { model: inputDevice.devices; delegate: Kit.PanelRow { required property var modelData; required property int index; text: modelData.name; selected: inputDevice.currentIndex === index; enabled: !root.live.busy && captureMode.currentIndex !== 1; Layout.fillWidth: true; onClicked: inputDevice.currentIndex = index } }
                Label { text: root.t("modelID"); color: palette.placeholderText }
                Kit.ModelLabel { id: interpretFormatter; visible: false }
                Repeater { model: root.bridge.localModels.filter(id => root.bridge.chatCapable(id)); delegate: Kit.PanelRow { required property string modelData; text: interpretFormatter.format(modelData); selected: root.modelID === modelData; enabled: !root.live.busy; Layout.fillWidth: true; onClicked: root.useModel(modelData) } }
            }
        }
    }
    Kit.AnchoredPanel {
        id: glassSummary; shell: root.shell; objectName: "interpret-summary-menu"
        contentItem: ColumnLayout { Repeater { model: ["summary","actionItems","decisions","speakerAnalysis"]; delegate: Kit.PanelRow { required property string modelData; text: root.t("interpret_" + modelData); Layout.fillWidth: true; onClicked: { root.summaryKind = modelData; root.live.summarize(modelData); glassSummary.close() } } } }
    }
    Kit.AnchoredPanel {
        id: glassExport; shell: root.shell; objectName: "interpret-export-menu"
        contentItem: ColumnLayout {
            CheckBox { text: root.t("translationOnly"); checked: !root.showOriginal; onToggled: root.showOriginal = !checked }
            Repeater { model: ["TXT","SRT"]; delegate: Kit.PanelRow { required property string modelData; text: modelData; Layout.fillWidth: true; onClicked: { glassExport.close(); exportDialog.srt = modelData === "SRT"; exportDialog.open() } } }
        }
    }
}
