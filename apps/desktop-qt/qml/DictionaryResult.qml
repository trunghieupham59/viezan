import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: result
    required property string output
    required property var bridge
    readonly property var metrics: bridge.resources.metrics
    readonly property var entry: {
        try {
            const data = JSON.parse(output)
            if (!data || typeof data.headword !== "string" || typeof data.meaning !== "string" || !Array.isArray(data.translations)) return null
            const list = value => Array.isArray(value) ? value.filter(item => typeof item === "string") : []
            data.translations = data.translations.filter(item => item && typeof item.text === "string" && typeof item.pronunciation === "string").slice(0, 6).map(item => Object.assign({}, item, {examples: list(item.examples), collocations: list(item.collocations), notes: list(item.notes)}))
            data.examples = list(data.examples); data.notes = list(data.notes)
            return data
        } catch (_) { return null }
    }
    readonly property var preview: {
        if (entry || output.length > 1048576) return []
        const fields = {}, pattern = /"(headword|pronunciation|meaning)"\s*:\s*("(?:[^"\\]|\\.)*")/g
        let match
        while ((match = pattern.exec(output)) !== null) { if (fields[match[1]] === undefined) { try { fields[match[1]] = JSON.parse(match[2]) } catch (_) {} } }
        return ["headword", "pronunciation", "meaning"].map(key => fields[key]).filter(value => typeof value === "string")
    }
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    readonly property var session: bridge.state.sessions.find(item => item.id === bridge.state.active.dictionary)
    function handoff(feature) {
        const id = bridge.createDetachedSession(feature, entry.headword + (feature === "chat" ? "\n" + entry.meaning : ""))
        bridge.command("select", {sessionID:id}); bridge.command("route", {value:feature})
    }
    property int selectedTab: 0
    // Qt's JS engine has no Array.prototype.flatMap; reduce/concat flatten instead.
    readonly property var examples: (entry?.translations || []).reduce((all, item) => all.concat(item.examples || []), (entry?.examples || []).slice())
    readonly property string entryIdentity: (session?.id || "") + ":" + (entry?.headword || "")
    onEntryIdentityChanged: selectedTab = 0
    contentWidth: availableWidth
    ColumnLayout {
        width: result.availableWidth
        spacing: result.metrics.inset
        Repeater { model: result.preview; delegate: TextArea { required property string modelData; text: modelData; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true } }
        Label { visible: !!result.entry?.detectedSourceLang && result.bridge.resources.nativeLanguages.includes(result.entry.detectedSourceLang); text: result.t("lang_" + (result.entry?.detectedSourceLang || "")); textFormat: Text.PlainText }
        Label { textFormat: Text.PlainText; text: result.entry?.headword || ""; font.bold: true; font.pointSize: Qt.application.font.pointSize * result.metrics.heroScale; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Label { textFormat: Text.PlainText; text: result.entry?.pronunciation || ""; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        RowLayout {
            visible: !!result.entry
            Button { text: result.t("speak"); onClicked: result.bridge.audio.speak(result.entry.headword, result.session.source === "auto" ? result.session.target : result.session.source) }
            Button { text: result.t("translate"); onClicked: result.handoff("translate") }
            Button { text: result.t("chat"); onClicked: result.handoff("chat") }
        }
        RowLayout {
            visible: !!result.entry
            Repeater {
                model: ["dictionaryMeaning", "dictionaryExamples"]
                delegate: Button {
                    required property string modelData
                    required property int index
                    text: result.t(modelData)
                    flat: true; checkable: true; checked: result.selectedTab === index
                    onClicked: result.selectedTab = index
                }
            }
        }
        TextArea { visible: result.selectedTab === 0; text: result.entry?.meaning || ""; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
        Repeater {
            model: result.selectedTab === 0 ? result.entry?.translations || [] : []
            delegate: GroupBox {
                required property var modelData
                title: modelData.text || ""
                Layout.fillWidth: true
                ColumnLayout {
                    width: parent.width
                    Label { textFormat: Text.PlainText; text: modelData.pronunciation || ""; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    TextArea { text: [modelData.partOfSpeech, modelData.meaning].filter(value => typeof value === "string").join("\n"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
                    Button { id: details; text: result.t("dictionaryDetails"); checkable: true; Accessible.role: Accessible.CheckBox }
                    Button { text: result.t("speak"); onClicked: result.bridge.audio.speak(modelData.text, result.session.target) }
                    TextArea {
                        visible: details.checked
                        text: [modelData.usage, modelData.nuance].filter(value => typeof value === "string").concat(modelData.examples || [], modelData.collocations || [], modelData.notes || []).join("\n\n")
                        readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true
                    }
                }
            }
        }
        Label { visible: result.selectedTab === 1 && !!result.entry && !result.examples.length; text: result.t("dictionaryNoExamples"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        TextArea { visible: result.selectedTab === 0 && !!result.entry?.notes?.length; text: (result.entry?.notes || []).join("\n\n"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
        Kit.Eyebrow { visible: !!result.examples.length; text: result.t("dictionaryExamples") }
        TextArea { visible: !!result.examples.length; text: (result.selectedTab === 0 ? result.examples.slice(0, 1) : result.examples).join("\n\n"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
    }
}
