import QtQuick
import QtQuick.Controls
import QtQuick.Controls.impl
import QtQuick.Layouts

Kit.QuietButton {
    id: listenButton
    property var shell: null
    // {id,title,text,language}; the id is shared by all controls for this text.
    property var sources: []
    readonly property string contentOwner: sources.map(source => source.id).join("\n")
    onContentOwnerChanged: if (listenPanel.visible) listenPanel.close()
    property var audio: workbench.audio
    readonly property var voice: workbench.state.voice || {provider:"system", voice:"", rate:1}
    readonly property bool readingHere: audio.speaking && sources.some(source => source.id === audio.speakingSource)
    readonly property string providerName: ({system:t("voiceSystem"), edge:"Microsoft Edge", openai:"OpenAI", gemini:"Gemini", elevenlabs:"ElevenLabs"})[voice.provider] || t("voiceSystem")
    readonly property string chosenVoiceName: listenPanel.visible && voice.provider === "system" ? (audio.voiceList || []).find(item => item.name === voice.voice)?.name || "" : ""
    readonly property var strings: workbench.resources.locales[workbench.state.locale]
    function t(key) { return strings[key] || key }
    function tpl(key, values) { let text = t(key); Object.keys(values).forEach(key => text = text.split("{" + key + "}").join(values[key])); return text }
    function read(source, provider) { audio.speak(source.text, source.language, source.id, provider || "") }
    text: t(readingHere ? "readingNow" : "listen")
    checked: readingHere
    Accessible.checked: readingHere
    icon.source: "icons/listen.svg"; icon.color: readingHere ? palette.highlight : palette.buttonText
    enabled: sources.some(source => !!source.text.trim())
    ToolTip.visible: hovered && !listenPanel.visible; ToolTip.text: text
    onClicked: listenPanel.openAt(listenButton)
    Kit.AnchoredPanel {
        id: listenPanel; objectName: "listen-panel"; shell: listenButton.shell
        desiredWidth: metrics.dialog - metrics.compactSidebar
        onOpened: listenScroll.forceActiveFocus()
        contentItem: ScrollView {
            id: listenScroll; contentWidth: availableWidth
            implicitHeight: listenContents.implicitHeight
            Keys.onReturnPressed: event => { if (listenButton.sources.length && listenButton.sources[0].text.trim()) listenButton.read(listenButton.sources[0]); event.accepted = true }
            ScrollBar.vertical: ScrollBar { policy: listenScroll.contentHeight > listenScroll.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: listenButton.metrics.small; radius: width / 2; color: palette.mid } }
            ColumnLayout {
                id: listenContents; width: listenScroll.availableWidth; spacing: listenButton.metrics.small
                RowLayout { Layout.fillWidth: true; Label { text: listenButton.t("listen"); font.bold: true; Layout.fillWidth: true } Kit.IconButton { iconName: "close"; text: listenButton.t("close"); onClicked: listenPanel.close() } }
                Repeater {
                    model: listenPanel.visible ? listenButton.sources : []
                    delegate: RowLayout {
                        id: listenRow; required property var modelData; required property int index
                        readonly property bool reading: listenButton.audio.speaking && listenButton.audio.speakingSource === modelData.id
                        objectName: "listen-source-" + modelData.id
                        Layout.fillWidth: true; Layout.minimumHeight: listenButton.metrics.hero; Layout.maximumHeight: listenButton.metrics.hero; spacing: 0
                        ItemDelegate {
                            id: readSource
                            Layout.fillWidth: true; Layout.fillHeight: true
                            enabled: !!listenRow.modelData.text.trim()
                            Accessible.name: listenButton.t("listen") + ": " + listenRow.modelData.title
                            onClicked: listenButton.read(listenRow.modelData)
                            background: Item {
                                Kit.GlassLens { anchors.fill: parent; visible: listenRow.index === 0 && !listenRow.reading || readSource.hovered; radius: listenButton.metrics.radius }
                                Rectangle { anchors.fill: parent; color: "transparent"; radius: listenButton.metrics.radius; border.width: readSource.visualFocus ? listenButton.metrics.hairline : 0; border.color: palette.highlight }
                            }
                            contentItem: RowLayout {
                                IconImage { source: "icons/listen.svg"; sourceSize.width: listenButton.metrics.icon; sourceSize.height: listenButton.metrics.icon; color: palette.buttonText; Accessible.ignored: true }
                                ColumnLayout {
                                    Layout.fillWidth: true; spacing: listenButton.metrics.hairline
                                    Label { text: listenRow.modelData.title; elide: Text.ElideRight; Layout.fillWidth: true }
                                    Label { objectName: "listen-detail-" + listenRow.modelData.id; text: listenRow.reading ? listenButton.audio.preparing ? listenButton.t("preparingVoice") : listenButton.tpl("readingCount", {count:Array.from(listenRow.modelData.text).length}) : listenButton.t("lang_" + listenRow.modelData.language) + " · " + (listenButton.audio.voiceFor(listenRow.modelData.language) || listenButton.providerName); color: palette.placeholderText; font.pointSize: Qt.application.font.pointSize * listenButton.metrics.smallScale; elide: Text.ElideRight; Layout.fillWidth: true }
                                }
                            }
                        }
                        Kit.IconButton { visible: listenRow.reading; iconName: "restore"; text: listenButton.t("readAgain"); onClicked: listenButton.read(listenRow.modelData) }
                        Kit.IconButton { objectName: "listen-stop"; visible: listenRow.reading; iconName: "stop"; text: listenButton.t("stopSpeaking"); onClicked: listenButton.audio.silence() }
                    }
                }
                Label { visible: !!listenButton.audio.error; text: listenButton.t(listenButton.audio.error); wrapMode: Text.Wrap; Layout.fillWidth: true }
                Kit.QuietButton { objectName: "listen-system-fallback"; visible: !!listenButton.audio.error && listenButton.voice.provider !== "system"; text: listenButton.t("readWithSystemVoice"); Layout.fillWidth: true; onClicked: { const source = listenButton.sources.find(source => source.id === listenButton.audio.lastSource) || listenButton.sources[0]; if (source) listenButton.read(source, "system") } }
                Rectangle { Layout.fillWidth: true; implicitHeight: listenButton.metrics.hairline; color: palette.midlight }
                RowLayout {
                    Label { text: listenButton.t("voiceShort"); color: palette.placeholderText }
                    Label { text: listenButton.providerName + (listenButton.chosenVoiceName ? " · " + listenButton.chosenVoiceName : ""); Layout.fillWidth: true; elide: Text.ElideRight }
                    Kit.QuietButton { text: listenButton.t("changeVoice"); Accessible.name: listenButton.t("openVoiceSettings"); onClicked: { listenPanel.close(); if (listenButton.shell) listenButton.shell.openSettingsSection("voice") } }
                }
                RowLayout {
                    Label { text: listenButton.t("rateShort"); color: palette.placeholderText }
                    Item { Layout.fillWidth: true }
                    Repeater { model: [0.75, 1, 1.25, 1.5]; delegate: Kit.QuietButton { objectName: "listen-rate-" + modelData; required property real modelData; text: modelData + "×"; enabled: workbench.rateSupported(listenButton.voice.provider); opacity: enabled ? 1 : 0.45; checkable: true; checked: (listenButton.voice.rate || 1) === modelData; Accessible.name: listenButton.t("voiceRate") + " " + text; onClicked: workbench.command("voice", {provider:listenButton.voice.provider, voice:listenButton.voice.voice || "", rate:modelData}) } }
                }
            }
        }
    }
}
