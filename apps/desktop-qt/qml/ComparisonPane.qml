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
    function command(name, payload) { bridge.command(name, Object.assign({sessionID: session.id}, payload || {})) }
    Button { text: root.t("compareModels"); checkable: true; id: toggle; checked: root.candidates.length > 0 }
    ColumnLayout {
        visible: toggle.checked; Layout.fillWidth: true
        TextField { id: modelIDs; placeholderText: root.t("compareModelHint"); Accessible.name: placeholderText; Layout.fillWidth: true }
        RowLayout {
            Button { text: root.t("compareModels"); enabled: !!root.session.draft.trim(); onClicked: root.command("compare", {models: modelIDs.text.split(/[,\n]/).map(value => value.trim()).filter(value => !!value)}) }
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
                        Label { text: modelData.model; textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
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
