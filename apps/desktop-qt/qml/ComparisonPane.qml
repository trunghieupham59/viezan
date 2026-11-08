import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: root
    objectName: "comparison-pane"
    required property var bridge
    required property var session
    property var shell: null
    readonly property bool glass: bridge.state.appearance?.preset === "glass"
    property bool choosing: candidates.length === 0
    function tpl(key, values) { let text = t(key); Object.keys(values).forEach(key => text = text.split("{" + key + "}").join(values[key])); return text }
    readonly property var candidates: bridge.state.sessions.filter(value => value.comparisonParent === session.id)
    readonly property var sourceRows: bridge.sentences(session.draft)
    readonly property bool parentRunning: bridge.state.tasks.some(task => task.request.sessionID === session.id && task.status === "running")
    readonly property bool sentenceRows: !!bridge.state.compareBySentence && sourceRows.length > 0 && candidates.length > 0 && candidates.every(item => bridge.state.tasks.find(task => task.request.sessionID === item.id)?.status === "succeeded" && bridge.sentences(item.output).length === sourceRows.length)
    readonly property var metrics: bridge.resources.metrics
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    // Pick 2–3 models this device can run (discovery), instead of typing raw model IDs.
    property var selected: []
    readonly property string selectionOwner: session.id + ":" + session.model
    function resetSelection() { selected = [session.model].concat(candidates.map(item => item.model).filter(model => model !== session.model)).slice(0,3); choosing = candidates.length === 0 }
    onSelectionOwnerChanged: resetSelection()
    readonly property var choices: [session.model].concat(bridge.localModels.filter(model => model !== session.model && bridge.chatCapable(model))).filter(model => !filter.text.trim() || formatter.format(model).toLowerCase().includes(filter.text.trim().toLowerCase()))
    function toggleModel(model, on) {
        if (model === session.model) return
        const next = selected.filter(value => value !== model)
        if (on && next.length < 3) next.push(model)
        selected = next
    }
    Component.onCompleted: resetSelection()
    function command(name, payload) { bridge.command(name, Object.assign({sessionID: session.id}, payload || {})) }
    Kit.GlassButton { text: root.t("compareModels"); checkable: true; id: toggle; checked: root.glass || root.candidates.length > 0; visible: !root.glass }
    ColumnLayout {
        visible: toggle.checked; Layout.fillWidth: true
        Kit.ModelLabel { id: formatter; visible: false }
        RowLayout {
            visible: root.glass; Layout.fillWidth: true
            Label { text: root.t(root.choosing ? "compareChooseTitle" : "compareModels"); font.bold: true; Layout.fillWidth: true }
            Label { visible: !root.choosing; text: root.tpl("compareProgress",{done:root.candidates.filter(item => ["succeeded","failed","cancelled","interrupted"].includes(root.bridge.state.tasks.find(task => task.request.sessionID === item.id)?.status)).length,total:root.candidates.length}); color: palette.placeholderText }
            Kit.IconButton { iconName: "close"; text: root.t("close"); onClicked: { if (root.shell?.composerPopup) root.shell.composerPopup.close() } }
        }
        Label { visible: root.glass && root.choosing; text: root.tpl("compareChooseHint", {max:3}); wrapMode: Text.Wrap; Layout.fillWidth: true }
        Kit.SearchField { id: filter; visible: !root.glass || root.choosing; placeholderText: root.t("compareModelHint"); Accessible.name: placeholderText; Layout.fillWidth: true }
        ListView {
            id: modelChoices
            visible: !root.glass || root.choosing
            objectName: "compare-model-choices"
            Layout.fillWidth: true; Layout.preferredHeight: Math.min(contentHeight, root.metrics.editor)
            clip: true; model: root.choices
            delegate: CheckBox {
                required property string modelData
                width: modelChoices.width
                text: formatter.format(modelData) + (modelData === root.session.model ? " Â· " + root.t("compareInUse") : "")
                checked: root.selected.includes(modelData)
                enabled: modelData !== root.session.model && (checked || root.selected.length < 3)
                ToolTip.visible: hovered; ToolTip.text: formatter.format(modelData)
                onToggled: root.toggleModel(modelData, checked)
            }
            ScrollBar.vertical: ScrollBar { policy: modelChoices.contentHeight > modelChoices.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
        }
        RowLayout {
            Kit.GlassButton { visible: !root.glass || root.choosing; text: root.tpl("compareRun", {count:root.selected.length}); enabled: !!root.session.draft.trim() && Array.from(root.session.draft).length <= 5000 && root.selected.length >= 2; onClicked: { root.command("compare", {models:[root.session.model].concat(root.selected.filter(model => model !== root.session.model))}); root.choosing = false } }
            Kit.QuietButton { visible: root.glass && !root.choosing; text: root.t("compareChange"); onClicked: root.choosing = true }
            CheckBox { id: sentenceMode; visible: !root.glass || !root.choosing; objectName: "compare-sentence-mode"; text: root.t("compareSentences"); checked: !!root.bridge.state.compareBySentence; onToggled: root.bridge.command("compareBySentence", {value:checked}) }
        }
        ScrollView {
            id: columnResults
            visible: !root.glass || (!root.choosing && !root.sentenceRows)
            Layout.fillWidth: true; Layout.preferredHeight: root.metrics.editor * 2
            ScrollBar.horizontal: ScrollBar { policy: columnResults.contentWidth > columnResults.width ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitHeight: root.metrics.small; radius: height / 2; color: palette.mid } }
            ScrollBar.vertical: ScrollBar { policy: columnResults.contentHeight > columnResults.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
            RowLayout {
                spacing: root.metrics.inset
                Repeater {
                    model: root.candidates
                    delegate: ColumnLayout {
                        id: candidate
                        required property var modelData
                        readonly property var task: root.bridge.state.tasks.find(value => value.request.sessionID === modelData.id)
                        readonly property bool current: modelData.comparisonRevision === root.session.revision
                        readonly property var rows: root.bridge.sentences(modelData.output)
                        Layout.preferredWidth: Math.max(root.metrics.sidebar, (root.width - root.metrics.inset * (root.candidates.length - 1)) / Math.max(1,root.candidates.length)); Layout.alignment: Qt.AlignTop
                        Label { text: formatter.format(modelData.model); textFormat: Text.PlainText; font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true; ToolTip.visible: titleHover.hovered; ToolTip.text: text; HoverHandler { id: titleHover } }
                        Label { visible: candidate.current && !!candidate.task?.errorDetail; text: candidate.task?.errorDetail || ""; textFormat: Text.PlainText; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        Label { text: root.t(candidate.current ? candidate.task?.errorCode || candidate.task?.status || "queued" : "comparisonStale"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                        TextArea { visible: !sentenceMode.checked || candidate.rows.length !== root.sourceRows.length; text: modelData.output; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; Layout.fillWidth: true }
                        Repeater {
                            model: sentenceMode.checked && candidate.rows.length === root.sourceRows.length ? candidate.rows : []
                            delegate: ColumnLayout {
                                required property string modelData
                                required property int index
                                Label { text: modelData; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Kit.GlassButton { text: root.t("useSentence"); enabled: !root.parentRunning && candidate.current && candidate.task?.status === "succeeded"; onClicked: root.command("useSentence", {childID: candidate.modelData.id, index: index}) }
                            }
                        }
                        Kit.GlassButton { text: root.t("adoptTranslation"); enabled: !root.parentRunning && candidate.current && candidate.task?.status === "succeeded"; onClicked: root.command("adoptComparison", {childID: modelData.id}) }
                        Kit.GlassButton { visible: candidate.task?.status === "running"; text: root.t("stop"); onClicked: root.bridge.command("cancel", {taskID: candidate.task.id}) }
                        Kit.GlassButton { visible: !!candidate.task && ["failed", "cancelled", "interrupted"].includes(candidate.task.status); enabled: candidate.current; text: root.t("retry"); onClicked: root.bridge.command("retry", {taskID: candidate.task.id}) }
                            Kit.GlassButton { text: root.t("copy"); enabled: !!modelData.output; onClicked: { root.bridge.copy(modelData.output); if (root.shell) root.shell.notify(root.t("copied")) } }
                    }
                }
            }
        }
        ScrollView {
            id: sentenceResults; objectName: "compare-sentence-results"
            visible: root.glass && !root.choosing && root.sentenceRows
            Layout.fillWidth: true; Layout.preferredHeight: root.metrics.editor * 2
            implicitWidth: 0
            contentWidth: Math.max(root.width, root.candidates.length * root.metrics.sidebar)
            ScrollBar.horizontal: ScrollBar { policy: sentenceResults.contentWidth > sentenceResults.width ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitHeight: root.metrics.small; radius: height / 2; color: palette.mid } }
            ScrollBar.vertical: ScrollBar { policy: sentenceResults.contentHeight > sentenceResults.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff; contentItem: Rectangle { implicitWidth: root.metrics.small; radius: width / 2; color: palette.mid } }
            ColumnLayout {
                width: sentenceResults.contentWidth; spacing: root.metrics.gap
                Repeater {
                    model: root.sourceRows
                    delegate: ColumnLayout {
                        id: sentenceRow; required property string modelData; required property int index
                        Layout.fillWidth: true
                        Label { text: String(sentenceRow.index + 1).padStart(2,"0") + " Â· " + sentenceRow.modelData; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        GridLayout {
                            columns: Math.max(1,root.candidates.length); uniformCellWidths: true; Layout.fillWidth: true; columnSpacing: root.metrics.small
                            Repeater {
                                model: root.candidates
                                delegate: Kit.Card {
                                    id: cell; required property var modelData
                                    readonly property string sentence: root.bridge.sentences(modelData.output)[sentenceRow.index] || ""
                                    selected: !!sentence && root.session.assemblyParts?.[String(sentenceRow.index)] === sentence
                                    Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 0
                                    contentItem: ColumnLayout {
                                        Label { text: formatter.format(cell.modelData.model); font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                        TextArea { text: cell.sentence; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; background: null; Layout.fillWidth: true; Layout.fillHeight: true }
                                        Kit.QuietButton { text: root.t(cell.selected ? "compareInUse" : "useSentence"); enabled: !root.parentRunning && !cell.selected && cell.modelData.comparisonRevision === root.session.revision; onClicked: root.command("useSentence",{childID:cell.modelData.id,index:sentenceRow.index}) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        TextArea { visible: !!root.session.assemblyParts; text: Object.keys(root.session.assemblyParts || {}).sort((a,b) => Number(a)-Number(b)).map(key => root.session.assemblyParts[key]).join("\n"); textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; Layout.fillWidth: true; Accessible.name: root.t("assembly") }
        Kit.GlassButton { visible: !!root.session.assemblyParts; text: root.t("adoptTranslation"); enabled: !root.parentRunning && Object.keys(root.session.assemblyParts || {}).length === root.sourceRows.length; onClicked: root.command("adoptAssembly") }
    }
}
