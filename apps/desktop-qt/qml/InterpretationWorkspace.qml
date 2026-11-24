import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
Item {
    id: root
    objectName: "interpret-workspace"
    readonly property alias modelControl: interpretPicker.modelControl
    required property var bridge
    // One conversion of the bridge state per change, shared by every binding below.
    // A host that already holds one passes it in.
    property var snapshot: bridge.state
    property var shell: null
    property string microphonePermission: bridge.audio.microphonePermission()
    readonly property bool permissionMissing: root.captureIndex !== 1 && microphonePermission !== "granted"
    property bool exporting: false
    property bool exportFailed: false
    property string summaryKind: "summary"
    readonly property var segments: live.current.segments || []
    readonly property var speakers: segments.reduce((all, segment) => { if (segment.speaker && !all.includes(segment.speaker)) all.push(segment.speaker); return all }, [])
    function tpl(key, values) { let text = t(key); Object.keys(values).forEach(key => text = text.split("{" + key + "}").join(values[key])); return text }
    function notify(text, undo) { if (shell) shell.notify(text, undo) }
    function recheckPermission() { microphonePermission = bridge.audio.microphonePermission() }
    function begin() { recheckPermission(); bridge.audio.cancel(); live.start(root.modelID, snapshot.speechProvider || "auto", ["auto"].concat(languages)[root.sourceIndex], languages[root.targetIndex], bridge.locale, root.captureKeys[root.captureIndex], root.inputDevices[root.inputDeviceIndex]?.id || "") }
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
    property var live: bridge.interpretation
    readonly property string liveError: live.error
    readonly property var metrics: bridge.metrics
    readonly property var languages: bridge.resources.nativeLanguages
    readonly property var localeStrings: bridge.strings
    function t(key) { return localeStrings[key] || key }
    Component.onDestruction: live.silence()
    property bool showOriginal: true
    function copySession() {
        bridge.copy(live.exportText(false, !showOriginal))
        notify(t("copied"))
    }
    function saveSession(url, srt) {
        exportFailed = false
        exporting = true
        live.exportFile(url, srt, !showOriginal)
        exporting = false
        if (!exportFailed) notify(tpl("fileSaved", {name: decodeURIComponent(url.toString().split("/").pop())}))
    }
    component SegmentSpeaker: Kit.IconButton {
        required property var segment
        readonly property string sourceID: "interpret:" + segment.id
        readonly property bool reading: root.live.speakingSource === sourceID
        readonly property bool preparing: reading && root.live.preparing
        objectName: "interpret-speaker-" + segment.id
        iconName: preparing ? "history" : reading ? "stop" : "listen"
        text: root.t(reading ? "stopSpeaking" : "speak")
        Accessible.description: reading ? root.t(preparing ? "preparingVoice" : "readingNow") : ""
        ToolTip.text: reading ? Accessible.description + " · " + text : text
        enabled: !root.live.listening && !!segment.translated
        Layout.alignment: Qt.AlignTop
        onClicked: {
            if (reading) root.live.silence()
            else {
                if (root.bridge.audio.speaking) root.bridge.audio.silence()
                root.live.speak(segment.translated, sourceID)
            }
        }
    }
    property string shownSessionID: ""
    property color dangerColor: palette.placeholderText
    property string modelID: snapshot.sessions.find(value => value.id === snapshot.active[snapshot.feature])?.model || ""
    property int sourceIndex: 0
    property int targetIndex: languages.indexOf("vi")
    readonly property var captureKeys: ["microphone", "system", "mixed"]
    property int captureIndex: 0
    readonly property var inputDevices: [{id:"", name:t("voiceAutomatic")}].concat(Qt.platform.os !== "osx" || microphonePermission === "granted" ? live.inputs : [])
    property int inputDeviceIndex: 0
    onInputDevicesChanged: inputDeviceIndex = 0
    signal openSettings(string section)
    signal notification(string message, bool error, string level, string key)
    // Root scope: inside ProviderNotice handlers "model" names the notice's own property.
    function useModel(id) { root.modelID = id }
    function syncSelection() {
        const current = live.current
        if (!current.id || current.id === shownSessionID) return
        shownSessionID = current.id
        root.sourceIndex = ["auto"].concat(languages).indexOf(current.source)
        root.targetIndex = languages.indexOf(current.target)
        root.modelID = current.model
        root.captureIndex = root.captureKeys.indexOf(current.captureMode || "microphone")
        root.inputDeviceIndex = Math.max(0, root.inputDevices.findIndex(device => device.id === (current.deviceID || "")))
    }
    Component.onCompleted: syncSelection()
    // Opened from the shell header's History control (Review 18).
    readonly property bool historyOpen: historyPopup.visible
    function openHistory(opener) { historyPopup.openAt(opener || setupTrigger) }
    Connections {
        target: root.live
        function onChanged() { root.syncSelection(); if (root.live.error === "microphoneDenied") root.recheckPermission(); if (root.exporting && root.live.error === "interpretStorageError") root.exportFailed = true }
        function onFailed(code) { root.notification(root.t(code), true, "danger", "interpret-error") }
    }

    Kit.AnchoredPanel {
        id: historyPopup; shell: root.shell; objectName: "interpret-history"
        closePolicy: Popup.CloseOnPressOutside | (historySearch.inputMethodComposing ? 0 : Popup.CloseOnEscape)
        onOpened: historySearch.forceActiveFocus()
        contentItem: ColumnLayout {
            implicitHeight: root.metrics.editor * 3
            Label { Accessible.role: Accessible.Heading; text: root.t("history"); font.bold: true }
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
                Accessible.role: Accessible.List
                Accessible.name: root.t("history")
                Layout.fillWidth: true; Layout.fillHeight: true; clip: true
                onCountChanged: currentIndex = count ? 0 : -1
                model: root.live.sessions.filter(value => !historySearch.text.trim() || (new Date(value.created*1000).toLocaleString() + " " + (value.segments || []).map(segment => segment.original + " " + segment.translated).join(" ")).toLocaleLowerCase().includes(historySearch.text.trim().toLocaleLowerCase()))
                ScrollBar.vertical: ScrollBar { Accessible.name: root.t("history"); policy: historyList.contentHeight > historyList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
                delegate: ItemDelegate { required property var modelData; width: ListView.view.width; text: new Date(modelData.created*1000).toLocaleString(); highlighted: ListView.isCurrentItem; Accessible.role: Accessible.ListItem; Accessible.selectable: true; Accessible.selected: modelData.id === root.live.current.id; onClicked: { root.live.select(modelData.id); historyPopup.close() } }
            }
            Kit.GlassButton { text: root.t("delete"); enabled: !!root.live.current.id && !root.live.busy; onClicked: { historyPopup.close(); root.deleteSession(root.live.current.id) } }
        }
    }
    FileDialog { id: exportDialog; property bool srt: false; fileMode: FileDialog.SaveFile; defaultSuffix: srt ? "srt" : "txt"; nameFilters: srt ? ["SRT (*.srt)"] : ["TXT (*.txt)"]; onAccepted: root.saveSession(selectedFile, srt) }
    Window {
        id: subtitles
        SystemPalette { id: subtitlePalette }
        width: root.metrics.reading; height: root.metrics.editor * 2; flags: Qt.Tool | Qt.WindowStaysOnTopHint | Qt.WindowTitleHint | Qt.WindowCloseButtonHint; color: subtitlePalette.base; title: root.t("subtitles")
        readonly property var segment: (root.live.current.segments || []).slice(-1)[0]
        Kit.ReadingPanelSurface { anchors.fill: parent }
        ColumnLayout {
            anchors.fill: parent; anchors.margins: root.metrics.inset
            Label { visible: root.showOriginal; text: subtitles.segment?.original || ""; textFormat: Text.PlainText; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Label { text: subtitles.segment?.translated || ""; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.fillHeight: true }
            Kit.GlassButton { visible: root.live.listening; text: root.t("stop"); onClicked: root.live.stop() }
        }
    }
    ColumnLayout {
        id: glassWorkspace; objectName: "interpret-glass"
        anchors.fill: parent; anchors.margins: root.metrics.inset; spacing: root.metrics.gap
        GridLayout {
            Layout.fillWidth: true; columns: width >= root.metrics.reading ? 2 : 1
            columnSpacing: root.metrics.small; rowSpacing: root.metrics.tight
            RowLayout {
                Layout.fillWidth: true; spacing: root.metrics.small
                LanguageButton { objectName: "interpret-source-language"; shell: root.shell; allowAuto: true; language: ["auto"].concat(root.languages)[root.sourceIndex] || "auto"; label: root.t("inputLanguage"); enabled: !root.live.busy; onChosen: code => root.sourceIndex = ["auto"].concat(root.languages).indexOf(code) }
                Kit.IconButton { objectName: "interpret-swap"; iconName: "swap"; text: root.t("swap"); implicitWidth: root.metrics.compactControl; implicitHeight: implicitWidth; enabled: !root.live.busy && root.sourceIndex > 0; onClicked: {
                    const previous = ["auto"].concat(root.languages)[root.sourceIndex]
                    root.sourceIndex = ["auto"].concat(root.languages).indexOf(root.languages[root.targetIndex])
                    root.targetIndex = root.languages.indexOf(previous)
                } }
                LanguageButton { objectName: "interpret-target-language"; shell: root.shell; language: root.languages[root.targetIndex] || "vi"; label: root.t("outputLanguage"); enabled: !root.live.busy; onChosen: code => root.targetIndex = root.languages.indexOf(code) }
                Item { Layout.fillWidth: true }
            }
            RowLayout {
                SessionModelPicker { id: interpretPicker; objectName: "interpret-model-picker"; shell: root.shell; bridge: root.bridge; glassFeature: true; selectionOnly: true; selectedModel: root.modelID; enabled: !root.live.busy; onModelChosen: id => root.useModel(id); onConfigureRequested: glassSetup.openAt(setupTrigger) }
                Kit.QuietButton { id: setupTrigger; implicitHeight: root.metrics.compactControl; implicitWidth: implicitHeight; leftPadding: (root.metrics.compactControl - root.metrics.icon) / 2; rightPadding: leftPadding; text: root.t("captureOptions"); icon.source: "icons/settings.svg"; icon.color: palette.buttonText; display: AbstractButton.IconOnly; Accessible.name: text; ToolTip.visible: hovered && !glassSetup.visible; ToolTip.text: text; popupOpen: glassSetup.visible; onClicked: glassSetup.openAt(setupTrigger) }
            }
        }
        Kit.ProviderNotice { model: root.modelID; dangerColor: root.dangerColor; Layout.fillWidth: true; onOpenRequested: section => root.openSettings(section); onUseRequested: id => root.useModel(id) }
        RowLayout {
            readonly property string provider: root.snapshot.speechProvider || "auto"
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
        PanelNotice {
            id: storageNotice
            objectName: "interpret-storage-error"
            bridge: root.bridge; danger: true; text: root.t("interpretStorageError")
            visible: root.live.blocked || root.liveError === "interpretStorageError"
            Layout.fillWidth: true
            contentItem: RowLayout {
                Label { text: storageNotice.text; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Kit.QuietButton { objectName: "interpret-reload"; text: root.t("retry"); enabled: !root.live.busy; onClicked: root.live.reload() }
            }
        }
        RowLayout {
            objectName: "interpret-session-actions"; Layout.fillWidth: true
            Kit.StatusBadge { text: root.t(root.live.listening ? "listening" : "speechReady"); idle: !root.live.listening }
            Label { text: root.t("capture_" + root.captureKeys[root.captureIndex]); color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
            Kit.QuietButton { text: root.t("subtitles"); icon.source: "icons/expand.svg"; icon.color: palette.buttonText; display: root.width < root.metrics.reading ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; checkable: true; checked: subtitles.visible; onClicked: subtitles.visible = !subtitles.visible }
            Kit.GlassButton { visible: root.live.busy && !root.live.listening && !root.live.summarizing; text: root.t("cancel"); onClicked: root.live.cancel() }
            Kit.GlassButton { visible: root.live.listening; text: root.t("stop"); icon.source: "icons/stop.svg"; onClicked: root.live.stop() }
            Kit.PrimaryButton { objectName: "interpret-start"; visible: !root.live.listening; text: root.t("startInterpretation"); icon.source: "icons/interpret.svg"; display: root.width < root.metrics.reading ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; enabled: !root.live.busy && !root.live.blocked && !root.bridge.loadBlocked && root.modelID.includes(":") && (root.captureIndex === 1 || root.microphonePermission !== "denied"); onClicked: root.begin() }
        }
        ProgressBar { visible: root.live.listening; value: root.live.level; Layout.fillWidth: true; Accessible.name: root.t("inputLevel") }
        GridLayout {
            Layout.fillWidth: true; Layout.fillHeight: true; columns: width >= root.metrics.compact ? 2 : 1; columnSpacing: root.metrics.inset + root.metrics.tight; rowSpacing: root.metrics.small
            ColumnLayout {
                Layout.fillWidth: true; Layout.fillHeight: true; Layout.minimumWidth: 0
                RowLayout {
                    visible: root.segments.length > 0; objectName: "interpret-transcript-actions"; Layout.fillWidth: true
                    Label { Accessible.role: Accessible.Heading; text: root.t("transcript"); font.bold: true; visible: root.width >= root.metrics.reading }
                    Repeater { model: ["pairedTranscript", "translationOnly"]; delegate: Kit.QuietButton { required property string modelData; required property int index; text: root.t(modelData); checked: root.showOriginal === (index === 0); onClicked: root.showOriginal = index === 0 } }
                    Item { Layout.fillWidth: true }
                    Kit.IconButton { iconName: "copy"; text: root.t("copy"); objectName: "interpret-copy-glass"; onClicked: root.copySession() }
                    Kit.IconButton { id: exportTrigger; iconName: "export"; text: root.t("exportTranscript"); ToolTip.visible: hovered && !glassExport.visible; popupOpen: glassExport.visible; onClicked: glassExport.openAt(exportTrigger) }
                }
                EmptyState { visible: !root.segments.length && !root.permissionMissing; heading: root.t("interpretEmpty"); detail: root.t("interpretEmptyHint"); metrics: root.metrics; Layout.fillWidth: true; Layout.fillHeight: true }
                ListView {
                    id: glassTranscript; objectName: "interpret-transcript"; visible: !!root.segments.length
                    Accessible.role: Accessible.List
                    Accessible.name: root.t("transcript")
                    Layout.fillWidth: true; Layout.fillHeight: true; Layout.minimumHeight: root.metrics.editor
                    clip: true; model: root.segments; spacing: root.metrics.inset
                    ScrollBar.vertical: ScrollBar { Accessible.name: root.t("transcript"); policy: glassTranscript.contentHeight > glassTranscript.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff }
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
                                TextArea { Accessible.name: root.t("result"); text: modelData.translated || ""; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; padding: 0; Layout.fillWidth: true }
                                Label { visible: modelData.status !== "done" || !!modelData.error; Accessible.role: modelData.error || modelData.status === "failed" ? Accessible.AlertMessage : Accessible.StaticText; text: root.t(modelData.error || modelData.status); wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Kit.QuietButton { visible: ["failed","interrupted","cancelled"].includes(modelData.status) && !!modelData.original; text: root.t("retry"); enabled: !root.live.busy; onClicked: root.live.retry(modelData.id) }
                            }
                            SegmentSpeaker { segment: modelData }
                        }
                    }
                }
            }
            NamedScrollView {
                scrollName: root.t("sessionPanel")
                id: sessionSide; visible: !!root.live.current.id; contentWidth: availableWidth
                ScrollBar.vertical: ScrollBar { policy: sessionSide.contentHeight > sessionSide.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
                Layout.preferredWidth: parent.columns === 2 ? root.metrics.editor * 2 : -1; Layout.fillWidth: parent.columns === 1; Layout.fillHeight: parent.columns === 2; Layout.maximumHeight: parent.columns === 1 ? root.metrics.editor : Infinity
                ColumnLayout {
                    width: sessionSide.availableWidth; spacing: root.metrics.inset
                    Kit.Card {
                        Accessible.name: root.t("sessionPanel")
                    Layout.fillWidth: true
                    contentItem: ColumnLayout {
                    Label { Accessible.role: Accessible.Heading; text: root.t("sessionPanel"); font.bold: true }
                    Label { text: new Date((root.live.current.created || 0) * 1000).toLocaleString(); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Label { text: root.tpl("speakersAndLines", {speakers:root.speakers.length, lines:root.segments.length}); color: palette.placeholderText }
                    Kit.ModelLabel { modelID: root.modelID; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Repeater { model: root.speakers; delegate: Label { required property string modelData; text: (root.live.current.speakerNameMap?.[modelData] || modelData) + " · " + root.tpl("speakerLines", {n:root.segments.filter(segment => segment.speaker === modelData).length}); wrapMode: Text.Wrap; Layout.fillWidth: true } }
                    Kit.GlassButton { id: summaryTrigger; icon.source: "icons/reasoning.svg"; text: root.t(root.live.summarizing ? "stop" : "summarize"); enabled: root.live.summarizing || (!root.live.busy && !!root.segments.length); Layout.fillWidth: true; ToolTip.visible: hovered && !glassSummary.visible; ToolTip.text: text; popupOpen: glassSummary.visible; onClicked: root.live.summarizing ? root.live.cancelSummary() : glassSummary.openAt(summaryTrigger) }
                    Label { visible: root.live.summarizing; text: root.t("summarizing"); Layout.fillWidth: true }
                    Label { visible: !!root.live.current[root.summaryKind]; Accessible.role: Accessible.Heading; text: root.t("interpret_" + root.summaryKind); font.bold: true }
                    TextArea { visible: !!body; Accessible.name: root.t("interpret_" + root.summaryKind); readonly property string body: root.live.current[root.summaryKind] || ""; readonly property bool streaming: root.live.summarizing; function updateContent() { if (streaming) text = body; else root.bridge.renderMarkdown(textDocument, body) } onBodyChanged: updateContent(); onStreamingChanged: updateContent(); Component.onCompleted: updateContent(); textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
                    Kit.GlassButton { objectName: "interpret-summary-regenerate"; visible: !!root.live.current[root.summaryKind] && !root.live.summarizing; icon.source: "icons/refresh.svg"; text: root.t("quickRegenerate"); enabled: !root.live.busy; onClicked: root.live.summarize(root.summaryKind) }
                    }
                    }
                    Kit.Card {
                        Accessible.name: root.t("yourTranscript")
                    Layout.fillWidth: true
                    contentItem: ColumnLayout {
                    Label { Accessible.role: Accessible.Heading; text: root.t("yourTranscript"); font.bold: true }
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
        contentItem: NamedScrollView {
            scrollName: root.t("captureOptions")
            id: setupLayerScroll; contentWidth: availableWidth; implicitHeight: root.metrics.editor * 2
            ScrollBar.vertical: ScrollBar { policy: setupLayerScroll.contentHeight > setupLayerScroll.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
            ColumnLayout {
                width: setupLayerScroll.availableWidth
                Label { Accessible.role: Accessible.Heading; text: root.t("captureOptions"); font.bold: true }
                Repeater { model: root.captureKeys; delegate: Kit.PanelRow { required property string modelData; required property int index; text: root.t("capture_" + modelData); selected: root.captureIndex === index; enabled: !root.live.busy; Layout.fillWidth: true; onClicked: root.captureIndex = index } }
                Label { text: root.t("captureDevice"); color: palette.placeholderText }
                Repeater { model: root.inputDevices; delegate: Kit.PanelRow { required property var modelData; required property int index; text: modelData.name; selected: root.inputDeviceIndex === index; enabled: !root.live.busy && root.captureIndex !== 1; Layout.fillWidth: true; onClicked: root.inputDeviceIndex = index } }
                Label { text: root.t("modelID"); color: palette.placeholderText }
                Kit.ModelLabel { id: interpretFormatter; visible: false }
                Repeater { model: root.bridge.localModels.filter(id => root.bridge.chatCapable(id)); delegate: Kit.PanelRow { required property string modelData; text: interpretFormatter.format(modelData); selected: root.modelID === modelData; enabled: !root.live.busy; Layout.fillWidth: true; onClicked: root.useModel(modelData) } }
            }
        }
    }
    Kit.AnchoredPanel {
        id: glassSummary; shell: root.shell; objectName: "interpret-summary-menu"
        contentItem: ColumnLayout { Repeater { model: ["summary","actionItems","decisions","speakerAnalysis"]; delegate: Kit.PanelRow { required property string modelData; text: root.t("interpret_" + modelData); selected: root.summaryKind === modelData && !!root.live.current[modelData]; Layout.fillWidth: true; onClicked: { root.summaryKind = modelData; if (!root.live.current[modelData]) root.live.summarize(modelData); glassSummary.close() } } } }
    }
    Kit.AnchoredPanel {
        id: glassExport; shell: root.shell; objectName: "interpret-export-menu"
        contentItem: ColumnLayout {
            CheckBox { text: root.t("translationOnly"); checked: !root.showOriginal; onToggled: root.showOriginal = !checked }
            Repeater { model: ["TXT","SRT"]; delegate: Kit.PanelRow { required property string modelData; text: modelData; Layout.fillWidth: true; onClicked: { glassExport.close(); exportDialog.srt = modelData === "SRT"; exportDialog.open() } } }
        }
    }
}
