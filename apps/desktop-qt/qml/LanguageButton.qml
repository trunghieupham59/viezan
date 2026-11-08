import QtQuick
import QtQuick.Controls
import QtQuick.Controls.impl
import QtQuick.Layouts

Kit.QuietButton {
    id: languageButton
    property var shell: null
    property string language: "auto"
    property bool allowAuto: false
    property string label: ""
    property bool compact: false
    signal chosen(string code)
    readonly property var strings: workbench.resources.locales[workbench.state.locale]
    function t(key) { return strings[key] || key }
    function fold(value) { return String(value || "").trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g,"d") }
    function endonym(code) { if (code === "auto") return ""; const own = Qt.locale(code).nativeLanguageName; return own === t("lang_" + code) ? workbench.resources.locales.en["lang_" + code] : own }
    readonly property var rows: {
        if (!languagePanel.visible) return []
        const query = fold(languageSearch.text), codes = workbench.resources.nativeLanguages
        const all = codes.slice().sort((a,b) => t("lang_" + a).localeCompare(t("lang_" + b)) || a.localeCompare(b))
        const matches = code => !query || [t("lang_" + code),endonym(code),code].some(value => fold(value).includes(query))
        if (query) {
            const found = (allowAuto ? ["auto"] : []).concat(all).filter(matches)
            if (!found.includes(language)) found.push(language)
            return found.map(code => ({code:code,group:""}))
        }
        // Explicit index tie-break: QV4's Array.sort is not stable for equal dates.
        const recent = []
        const sessions = workbench.state.sessions.map((item,index) => ({item:item,index:index})).sort((a,b) => (b.item.updated || 0) - (a.item.updated || 0) || a.index - b.index)
        for (const record of sessions) { for (const code of [record.item.target,record.item.source]) if (codes.includes(code) && !recent.includes(code) && recent.length < 3) recent.push(code); if (recent.length === 3) break }
        return (allowAuto ? [{code:"auto",group:""}] : []).concat(recent.map(code => ({code:code,group:t("recentWork")})), all.filter(code => !recent.includes(code)).map(code => ({code:code,group:t("filterAll")})))
    }
    text: t("lang_" + language)
    Accessible.name: label + ": " + text
    contentItem: RowLayout {
        spacing: languageButton.metrics.tight
        Label { objectName: "language-direction"; visible: !languageButton.compact; text: languageButton.label; color: languageButton.palette.placeholderText; Accessible.ignored: true }
        Label { text: languageButton.text; font.weight: Font.DemiBold; color: languageButton.enabled ? languageButton.palette.buttonText : languageButton.palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
        IconImage { objectName: "language-chevron"; source: "icons/back.svg"; rotation: -90; color: languageButton.palette.placeholderText; sourceSize.width: languageButton.metrics.small + languageButton.metrics.tight; sourceSize.height: languageButton.metrics.small + languageButton.metrics.tight; Accessible.ignored: true }
    }
    ToolTip.visible: hovered && !languagePanel.visible; ToolTip.text: Accessible.name
    onClicked: languagePanel.openAt(languageButton)
    Kit.AnchoredPanel {
        id: languagePanel; objectName: "language-panel"; shell: languageButton.shell
        closePolicy: Popup.CloseOnPressOutside | (languageSearch.inputMethodComposing ? 0 : Popup.CloseOnEscape)
        desiredWidth: metrics.sidebar + metrics.editor
        onOpened: {
            languageSearch.text = ""; languageSearch.forceActiveFocus()
            Qt.callLater(function() {
                if (!languagePanel.visible) return
                languageList.currentIndex = Math.max(0,languageButton.rows.findIndex(row => row.code === languageButton.language))
                languageList.positionViewAtIndex(languageList.currentIndex, ListView.Contain)
            })
        }
        contentItem: ColumnLayout {
            spacing: languageButton.metrics.small
            Kit.SearchField {
                id: languageSearch; Layout.fillWidth: true
                placeholderText: languageButton.t("languageSearch"); Accessible.name: placeholderText
                Keys.onEscapePressed: event => { if (!inputMethodComposing) languagePanel.close(); else event.accepted = false }
                onTextChanged: languageList.currentIndex = 0
                Keys.onReturnPressed: event => { if (!inputMethodComposing && languageList.count) { languageButton.chosen(languageList.model[Math.max(0, languageList.currentIndex)].code); languagePanel.close() } else event.accepted = false }
                Keys.onDownPressed: event => { if (!inputMethodComposing) languageList.currentIndex = Math.min(languageList.count - 1, languageList.currentIndex + 1); else event.accepted = false }
                Keys.onUpPressed: event => { if (!inputMethodComposing) languageList.currentIndex = Math.max(0, languageList.currentIndex - 1); else event.accepted = false }
            }
            ListView {
                id: languageList; objectName: "language-list"
                Layout.fillWidth: true; Layout.fillHeight: true
                implicitHeight: Math.min(contentHeight, languageButton.metrics.editor * 2)
                clip: true; currentIndex: 0
                model: languageButton.rows
                section.property: "group"
                section.delegate: Kit.Eyebrow { required property string section; text: section; width: languageList.width; height: section ? languageButton.metrics.compactControl : 0; verticalAlignment: Text.AlignVCenter; leftPadding: languageButton.metrics.small }
                delegate: Kit.PanelRow {
                    required property var modelData
                    width: languageList.width; implicitHeight: languageButton.metrics.control
                    text: languageButton.t("lang_" + modelData.code); detail: languageButton.endonym(modelData.code); highlighted: ListView.isCurrentItem
                    selected: modelData.code === languageButton.language
                    onClicked: { languageButton.chosen(modelData.code); languagePanel.close() }
                }
                ScrollBar.vertical: ScrollBar { policy: languageList.contentHeight > languageList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: languageButton.metrics.small; radius: width / 2; color: palette.mid } }
            }
        }
    }
}
