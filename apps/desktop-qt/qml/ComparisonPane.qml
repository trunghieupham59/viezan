import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: root
    required property var bridge
    required property var session
    readonly property var candidates: bridge.state.sessions.filter(value => value.comparisonParent === session.id)
    readonly property var sourceRows: bridge.sentences(session.draft)
    readonly property var metrics: bridge.resources.metrics
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    // Pick 2–3 models this device can run (discovery), instead of typing raw model IDs.
    property var selected: []
    readonly property var choices: bridge.localModels.filter(model => bridge.chatCapable(model) && (!filter.text.trim() || formatter.format(model).toLowerCase().includes(filter.text.trim().toLowerCase())))
    function toggleModel(model, on) {
        const next = selected.filter(value => value !== model)
        if (on && next.length < 3) next.push(model)
        selected = next
    }
    Component.onCompleted: if (bridge.localModels.includes(session.model)) selected = [session.model]
    function command(name, payload) { bridge.command(name, Object.assign({sessionID: session.id}, payload || {})) }
    Button { text: root.t("compareModels"); checkable: true; id: toggle; checked: root.candidates.length > 0 }
    ColumnLayout {
        visible: toggle.checked; Layout.fillWidth: true
        Kit.ModelLabel { id: formatter; visible: false }
        TextField { id: filter; placeholderText: root.t("compareModelHint"); Accessible.name: placeholderText; Layout.fillWidth: true }
        ListView {
            id: modelChoices
            objectName: "compare-model-choices"
            Layout.fillWidth: true; Layout.preferredHeight: Math.min(contentHeight, root.metrics.editor)
            clip: true; model: root.choices
            delegate: CheckBox {
                required property string modelData
                width: modelChoices.width
                text: formatter.format(modelData)
                checked: root.selected.includes(modelData)
                enabled: checked || root.selected.length < 3
                ToolTip.visible: hovered; ToolTip.text: modelData
                onToggled: root.toggleModel(modelData, checked)
            }
            ScrollBar.vertical: ScrollBar {}
        }
        RowLayout {
            Button { text: root.t("compareModels"); enabled: !!root.session.draft.trim() && root.selected.length >= 2; onClicked: root.command("compare", {models: root.selected}) }
            CheckBox { id: sentenceMode; text: root.t("compareSentences") }
        }
        ScrollView {
            Layout.fillWidth: true; Layout.preferredHeight: root.metrics.editor * 2
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
                        Layout.preferredWidth: root.metrics.sidebar; Layout.alignment: Qt.AlignTop
                        Label { text: formatter.format(modelData.model); textFormat: Text.PlainText; font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true; ToolTip.visible: titleHover.hovered; ToolTip.text: modelData.model; HoverHandler { id: titleHover } }
                        Label { visible: candidate.current && !!candidate.task?.errorDetail; text: candidate.task?.errorDetail || ""; textFormat: Text.PlainText; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        Label { text: root.t(candidate.current ? candidate.task?.errorCode || candidate.task?.status || "queued" : "comparisonStale"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                        TextArea { visible: !sentenceMode.checked || candidate.rows.length !== root.sourceRows.length; text: modelData.output; textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; Layout.fillWidth: true }
                        Repeater {
                            model: sentenceMode.checked && candidate.rows.length === root.sourceRows.length ? candidate.rows : []
                            delegate: ColumnLayout {
                                required property string modelData
                                required property int index
                                Label { text: modelData; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Button { text: root.t("useSentence"); enabled: candidate.current && candidate.task?.status === "succeeded"; onClicked: root.command("useSentence", {childID: candidate.modelData.id, index: index}) }
                            }
                        }
                        Button { text: root.t("adoptTranslation"); enabled: candidate.current && candidate.task?.status === "succeeded"; onClicked: root.command("adoptComparison", {childID: modelData.id}) }
                        Button { visible: candidate.task?.status === "running"; text: root.t("stop"); onClicked: root.bridge.command("cancel", {taskID: candidate.task.id}) }
                        Button { visible: !!candidate.task && ["failed", "cancelled", "interrupted"].includes(candidate.task.status); enabled: candidate.current; text: root.t("retry"); onClicked: root.bridge.command("retry", {taskID: candidate.task.id}) }
                        Button { text: root.t("copy"); onClicked: root.bridge.copy(modelData.output) }
                    }
                }
            }
        }
        TextArea { visible: !!root.session.assemblyParts; text: Object.keys(root.session.assemblyParts || {}).sort((a,b) => Number(a)-Number(b)).map(key => root.session.assemblyParts[key]).join("\n"); textFormat: TextEdit.PlainText; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; Layout.fillWidth: true; Accessible.name: root.t("assembly") }
        Button { visible: !!root.session.assemblyParts; text: root.t("adoptTranslation"); enabled: Object.keys(root.session.assemblyParts || {}).length === root.sourceRows.length; onClicked: root.command("adoptAssembly") }
    }
}
