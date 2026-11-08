import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: result
    objectName: "dictionary-result"
    required property string output
    required property var bridge
    property var shell: null
    readonly property bool glass: bridge.state.appearance?.preset === "glass"
    readonly property bool running: bridge.state.tasks.some(task => task.request.sessionID === session?.id && task.status === "running")
    readonly property string sourceLanguage: bridge.speechLanguage(entry?.headword || session?.draft || "", entry?.detectedSourceLang || session?.source || "auto")
    readonly property var listenSources: [{id:(session?.id || "dictionary") + ":headword", title:t("dictionaryHeadword"), text:entry?.headword || "", language:sourceLanguage}].concat((entry?.translations || []).slice(0,3).map((item,index) => ({id:(session?.id || "dictionary") + ":sense:" + index, title:tpl("dictionaryMeaningN",{n:String(index+1).padStart(2,"0")}), text:item.text, language:session?.target || "vi"})))
    readonly property var suggestions: bridge.dictionarySuggestions(output)
    readonly property bool notFound: suggestions !== null && suggestions !== undefined
    function tpl(key, values) { let text = t(key); Object.keys(values).forEach(key => text = text.split("{" + key + "}").join(values[key])); return text }
    function lookup(word) { bridge.command("draft", {sessionID:session.id, value:word}); bridge.command("submit", {sessionID:session.id}) }
    readonly property var metrics: bridge.resources.metrics
    readonly property var entry: {
        try {
            const data = JSON.parse(output)
            if (!data || typeof data.headword !== "string" || typeof data.meaning !== "string" || !Array.isArray(data.translations)) return null
            const list = value => Array.isArray(value) ? value.filter(item => typeof item === "string") : []
            data.translations = data.translations.filter(item => item && typeof item.text === "string" && typeof item.pronunciation === "string").slice(0, 6).map(item => Object.assign({}, item, {examples: list(item.examples), exampleRegisters: list(item.exampleRegisters), collocations: list(item.collocations), notes: list(item.notes)}))
            data.examples = list(data.examples); data.notes = list(data.notes)
            if (data.related) data.related = {derived:list(data.related.derived), synonyms:list(data.related.synonyms), antonyms:list(data.related.antonyms)}
            if (!Number.isInteger(data.contextSense) || data.contextSense < 1 || data.contextSense > data.translations.length) delete data.contextSense
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
    property var session: bridge.state.sessions.find(item => item.id === bridge.state.active.dictionary)
    function handoff(feature, text) {
        const id = bridge.createDetachedSession(feature, text || (entry?.headword || session.draft) + (feature === "chat" ? "\n" + (entry?.meaning || "") : ""))
        bridge.command("select", {sessionID:id}); bridge.command("route", {value:feature})
    }
    property int selectedTab: 0
    // Qt's JS engine has no Array.prototype.flatMap; reduce/concat flatten instead.
    readonly property var examples: (entry?.translations || []).reduce((all, item) => all.concat(item.examples || []), (entry?.examples || []).slice())
    readonly property string entryIdentity: (session?.id || "") + ":" + (entry?.headword || "")
    onEntryIdentityChanged: selectedTab = 0
    contentWidth: availableWidth
    ScrollBar.vertical: ScrollBar { policy: result.glass && result.contentHeight > result.height ? ScrollBar.AlwaysOn : ScrollBar.AsNeeded; contentItem: Rectangle { implicitWidth: result.metrics.small; radius: width / 2; color: palette.mid } }
    ColumnLayout {
        width: result.availableWidth
        spacing: result.metrics.inset
        Label { visible: result.notFound; text: result.t("dictionaryNotFound"); font.bold: true; font.pointSize: Qt.application.font.pointSize * result.metrics.sectionScale }
        Label { visible: result.notFound; text: result.tpl(result.suggestions?.length ? "dictionaryNotFoundHint" : "dictionaryNotFoundNone", {language:result.t("lang_" + (!result.session?.source || result.session.source === "auto" ? result.sourceLanguage : result.session.source))}); wrapMode: Text.Wrap; Layout.fillWidth: true }
        Repeater { model: result.notFound ? result.suggestions || [] : []; delegate: Kit.PanelRow { required property var modelData; objectName: "dictionary-suggestion-" + modelData.word; Layout.fillWidth: true; text: modelData.word; detail: [modelData.partOfSpeech, modelData.meaning].filter(Boolean).join(" · "); enabled: !result.running; onClicked: result.lookup(modelData.word) } }
        Kit.QuietButton { visible: result.notFound; text: result.tpl("dictionaryTranslatePhrase", {term:result.session?.draft || ""}); onClicked: result.handoff("translate") }
        Kit.QuietButton { visible: result.notFound; text: result.t("dictionaryAskAI"); onClicked: result.handoff("chat") }
        Repeater { model: result.preview; delegate: TextArea { required property string modelData; text: modelData; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true } }
        Label { visible: !!result.entry?.detectedSourceLang && result.bridge.resources.nativeLanguages.includes(result.entry.detectedSourceLang); text: result.t("lang_" + (result.entry?.detectedSourceLang || "")); textFormat: Text.PlainText }
        RowLayout {
            Layout.fillWidth: true
            Label { textFormat: Text.PlainText; text: result.entry?.headword || ""; font.bold: true; font.pointSize: Qt.application.font.pointSize * result.metrics.heroScale; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.minimumWidth: 0 }
            ListenButton { visible: result.glass && !!result.entry; shell: result.shell; display: AbstractButton.IconOnly; sources: result.listenSources }
            Kit.QuietButton { visible: result.glass && !!result.entry; text: result.t(result.session?.favorite ? "savedWord" : "saveWord"); icon.source: "icons/star.svg"; icon.color: palette.buttonText; display: result.width < result.metrics.reading ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; checkable: true; checked: !!result.session?.favorite; onClicked: { const saved = !result.session.favorite; result.bridge.command("favorite",{sessionID:result.session.id}); if (result.shell) result.shell.notify(result.tpl(saved ? "wordSavedToast" : "wordUnsavedToast",{word:result.entry.headword})) } }
            Kit.QuietButton { visible: result.glass && !!result.entry; text: result.t(result.session?.dictionaryContext ? "dictionaryTranslateSentence" : "translate"); icon.source: "icons/translate.svg"; icon.color: palette.buttonText; display: result.width < result.metrics.reading ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; onClicked: result.handoff("translate", result.session?.dictionaryContext || "") }
            Kit.IconButton { visible: result.glass && !!result.entry; iconName: "chat"; text: result.t("dictionaryAskAI"); onClicked: result.handoff("chat") }
        }
        Label { textFormat: Text.PlainText; text: result.entry?.pronunciation || ""; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        RowLayout {
            visible: !!result.entry && !result.glass
            ListenButton { shell: result.shell; sources: [{id:(result.session?.id || "dictionary") + ":headword", title:result.t("dictionaryHeadword"), text:result.entry?.headword || "", language:result.bridge.speechLanguage(result.entry?.headword || "", result.entry?.detectedSourceLang || result.session?.source || "auto")}] }
            Kit.GlassButton { text: result.t(result.session?.dictionaryContext ? "dictionaryTranslateSentence" : "translate"); onClicked: result.handoff("translate", result.session?.dictionaryContext || "") }
            Kit.GlassButton { text: result.t("chat"); onClicked: result.handoff("chat") }
        }
        RowLayout {
            visible: !!result.entry
            Repeater {
                model: result.entry?.related ? ["dictionaryMeaning", "dictionaryExamples", "dictionaryRelated"] : ["dictionaryMeaning", "dictionaryExamples"]
                delegate: Kit.GlassButton {
                    required property string modelData
                    required property int index
                    text: result.t(modelData) + (result.glass ? " · " + (index === 0 ? result.entry?.translations?.length || 0 : index === 1 ? result.examples.length : ["derived","synonyms","antonyms"].reduce((n,key) => n + (result.entry?.related?.[key]?.length || 0),0)) : "")
                    flat: true; checkable: true; checked: result.selectedTab === index
                    onClicked: result.selectedTab = index
                }
            }
        }
        Label { visible: !!result.entry && !!result.session?.dictionaryContext; text: result.tpl(result.entry?.contextSense ? "dictionaryContextSenseLine" : "dictionaryContextLine", {context:result.session?.dictionaryContext || "", n:String(result.entry?.contextSense || 1).padStart(2, "0")}); wrapMode: Text.Wrap; color: palette.placeholderText; Layout.fillWidth: true }
        Repeater {
            model: result.selectedTab === 2 ? ["derived", "synonyms", "antonyms"] : []
            delegate: ColumnLayout {
                required property string modelData
                Layout.fillWidth: true
                visible: !!result.entry?.related?.[modelData]?.length
                Label { text: result.t({derived:"relatedDerived", synonyms:"relatedSynonyms", antonyms:"relatedAntonyms"}[modelData]); font.bold: true }
                Flow { Layout.fillWidth: true; spacing: result.metrics.small; Repeater { model: result.entry?.related?.[modelData] || []; delegate: Kit.QuietButton { required property string modelData; objectName: "dictionary-related-" + modelData; text: modelData; outlined: true; enabled: !result.running; onClicked: result.lookup(modelData) } } }
            }
        }
        TextArea { visible: result.selectedTab === 0 && (!result.glass || !result.entry?.translations?.length); text: result.entry?.meaning || ""; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
        Repeater {
            model: result.selectedTab === 0 ? result.entry?.translations || [] : []
            delegate: GroupBox {
                required property var modelData
                required property int index
                title: result.glass ? "" : modelData.text || ""
                padding: result.glass ? 0 : result.metrics.inset
                background: Rectangle { visible: !result.glass; color: "transparent"; border.width: result.metrics.hairline; border.color: palette.midlight; radius: result.metrics.radius }
                Layout.fillWidth: true
                ColumnLayout {
                    width: parent.width
                    Rectangle { visible: result.glass; Layout.fillWidth: true; implicitHeight: result.metrics.hairline; color: palette.midlight }
                    RowLayout { visible: result.glass; Layout.fillWidth: true; Label { text: String(index + 1).padStart(2,"0"); color: palette.placeholderText } Label { text: modelData.text; font.bold: true; font.pointSize: Qt.application.font.pointSize * result.metrics.sectionScale; wrapMode: Text.Wrap; Layout.fillWidth: true } }
                    Label { textFormat: Text.PlainText; text: modelData.pronunciation || ""; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    TextArea { text: [modelData.partOfSpeech, modelData.meaning].filter(value => typeof value === "string").join("\n"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
                    Kit.GlassButton { id: details; visible: !result.glass; text: result.t("dictionaryDetails"); checkable: true; Accessible.role: Accessible.CheckBox }
                    ListenButton { visible: !result.glass; shell: result.shell; sources: [{id:(result.session?.id || "dictionary") + ":meaning:" + modelData.text, title:modelData.text, text:modelData.text, language:result.session?.target || "vi"}] }
                    TextArea {
                        visible: result.glass || details.checked
                        text: [modelData.usage, modelData.nuance].filter(value => typeof value === "string").concat(modelData.examples || [], modelData.collocations || [], modelData.notes || []).join("\n\n")
                        readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true
                    }
                }
            }
        }
        Label { visible: result.selectedTab === 1 && !!result.entry && !result.examples.length; text: result.t("dictionaryNoExamples"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        TextArea { visible: result.selectedTab === 0 && !!result.entry?.notes?.length; text: (result.entry?.notes || []).join("\n\n"); readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
        Kit.Eyebrow { visible: result.selectedTab !== 2 && !!result.examples.length; text: result.t("dictionaryExamples") }
        Repeater {
            model: result.selectedTab === 1 ? (result.entry?.translations || []).reduce((all, item, sense) => all.concat((item.examples || []).map((text, index) => ({text:text, register:(item.exampleRegisters || [])[index] || "", sense:sense + 1}))), (result.entry?.examples || []).map(text => ({text:text, register:"", sense:0}))) : result.selectedTab === 0 ? result.examples.slice(0, 1).map(text => ({text:text, register:"", sense:0})) : []
            delegate: ColumnLayout {
                required property var modelData
                Layout.fillWidth: true
                Label { visible: !!modelData.register || !!modelData.sense; text: [modelData.sense ? result.tpl("dictionaryExampleSense", {n:String(modelData.sense).padStart(2, "0")}) : "", modelData.register].filter(Boolean).join(" · "); color: palette.placeholderText }
                TextArea { text: modelData.text; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true }
                RowLayout {
                    visible: result.selectedTab === 1
                    Kit.IconButton { iconName: "listen"; text: result.t("speak"); onClicked: result.bridge.audio.speak(modelData.text.split(" → ")[0], result.sourceLanguage, (result.session?.id || "dictionary") + ":example:" + modelData.text) }
                    Kit.IconButton { iconName: "copy"; text: result.t("copy"); onClicked: { result.bridge.copy(modelData.text); if (result.shell) result.shell.notify(result.t("copied")) } }
                }
            }
        }
        RowLayout {
            visible: result.glass && !!result.entry; Layout.fillWidth: true
            Kit.ModelLabel { modelID: result.session?.model || ""; elide: Text.ElideRight; Layout.fillWidth: true }
            Kit.QuietButton { text: result.t("copy"); icon.source: "icons/copy.svg"; icon.color: palette.buttonText; display: result.width < result.metrics.reading ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; onClicked: { result.bridge.copy([result.entry.headword,result.entry.pronunciation].concat(result.entry.translations.map(item => item.text + (item.meaning ? " — " + item.meaning : ""))).filter(Boolean).join("\n")); if (result.shell) result.shell.notify(result.t("copied")) } }
            Kit.QuietButton { text: result.t("lookupAgain"); icon.source: "icons/refresh.svg"; icon.color: palette.buttonText; enabled: !result.running; display: result.width < result.metrics.reading ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon; onClicked: result.bridge.command("submit",{sessionID:result.session.id}) }
        }
    }
}
