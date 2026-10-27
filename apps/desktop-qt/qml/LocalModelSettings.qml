import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: models
    required property var bridge
    readonly property var manager: bridge.modelManager
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Component.onCompleted: bridge.localRuntime.refresh()
    Button { text: models.t("installRuntime"); onClicked: Qt.openUrlExternally("https://ollama.com/download") }
    Label { text: models.t("runtimeHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Label { text: "CPU: " + models.bridge.localRuntime.processors + " · " + models.bridge.localRuntime.version }
    RowLayout {
        Label { text: models.t("runtimeParallel") }
        ComboBox { id: parallel; model: [1, 2, 4]; currentIndex: model.indexOf(models.bridge.state.runtime?.parallel || 1); onActivated: models.bridge.command("runtime", {parallel:model[currentIndex], context:context.model[context.currentIndex]}); enabled: !models.bridge.localRuntime.owned && !models.bridge.localRuntime.busy; Accessible.name: models.t("runtimeParallel") }
        Label { text: models.t("runtimeContext") }
        ComboBox { id: context; model: [2048, 4096, 8192, 16384, 32768]; currentIndex: model.indexOf(models.bridge.state.runtime?.context || 4096); onActivated: models.bridge.command("runtime", {parallel:parallel.model[parallel.currentIndex], context:model[currentIndex]}); enabled: !models.bridge.localRuntime.owned && !models.bridge.localRuntime.busy; Accessible.name: models.t("runtimeContext") }
    }
    RowLayout {
        Button { text: models.t("runtimeStart"); enabled: !models.bridge.localRuntime.owned && !models.bridge.localRuntime.busy; onClicked: models.bridge.localRuntime.start(parallel.model[parallel.currentIndex], context.model[context.currentIndex]) }
        Button { text: models.t("runtimeStop"); visible: models.bridge.localRuntime.owned; onClicked: models.bridge.localRuntime.stop() }
    }
    Label { text: models.bridge.localRuntime.error ? models.t(models.bridge.localRuntime.error) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    Label { textFormat: Text.PlainText; text: models.t("localModelsHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    TextField { id: modelName; placeholderText: models.t("modelID"); Accessible.name: placeholderText; Layout.fillWidth: true; maximumLength: 505 }
    Flow {
        Layout.fillWidth: true; spacing: models.bridge.resources.metrics.small
        Button { text: models.t("downloadModel"); enabled: !!modelName.text.trim() && !models.manager.busy; onClicked: models.manager.run(modelName.text, false) }
        Button { text: models.t("refreshModels"); enabled: !models.bridge.loadingModels; onClicked: models.bridge.refreshModels("ollama") }
        Button { text: models.t("stop"); visible: models.manager.busy; onClicked: models.manager.cancel() }
    }
    ProgressBar { visible: models.manager.busy; indeterminate: models.manager.progress < 0; value: models.manager.progress; Layout.fillWidth: true }
    Label { textFormat: Text.PlainText; text: models.t(models.manager.status); visible: !!models.manager.status; wrapMode: Text.Wrap; Layout.fillWidth: true }
    Label { textFormat: Text.PlainText; text: models.t(models.manager.error || models.bridge.modelError); visible: !!(models.manager.error || models.bridge.modelError); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Repeater {
        model: models.bridge.localModels.filter(function(model) { return model.startsWith("ollama:") })
        delegate: RowLayout {
            required property string modelData
            Label { textFormat: Text.PlainText; text: modelData; elide: Text.ElideMiddle; Layout.fillWidth: true }
            Button { text: models.t("runtimeCompare"); enabled: !models.bridge.localPerformance.busy && !models.manager.busy && !models.bridge.interpretation.busy && !models.bridge.state.tasks.some(task => task.status === "running" && task.request.model.startsWith("ollama:")); onClicked: { models.bridge.localPerformance.selectModel(modelData); compare.open() } }
            Button { text: models.t("deleteModel"); enabled: !models.manager.busy; onClicked: { removeModel.modelName = modelData.slice(7); removeModel.open() } }
        }
    }
    Dialog {
        id: removeModel
        property string modelName
        title: models.t("deleteModelConfirm"); modal: true; standardButtons: Dialog.Yes | Dialog.Cancel
        Label { textFormat: Text.PlainText; text: removeModel.modelName }
        onAccepted: models.manager.run(modelName, true)
    }
    BusyIndicator { running: models.bridge.localPerformance.busy; visible: running }
    Button { text: models.t("cancel"); visible: models.bridge.localPerformance.busy; onClicked: models.bridge.localPerformance.cancel() }
    Label { text: models.t(models.bridge.localPerformance.error); visible: !!models.bridge.localPerformance.error; wrapMode: Text.Wrap; Layout.fillWidth: true }
    Label { text: models.bridge.localPerformance.model; visible: !!text }
    Button { text: models.t("voiceAutomatic"); visible: !!models.bridge.localPerformance.model; enabled: !models.bridge.localPerformance.busy; onClicked: models.bridge.localPerformance.select("auto") }
    Repeater {
        model: models.bridge.localPerformance.results
        delegate: RowLayout {
            required property var modelData
            Label { text: modelData.id + " · " + (modelData.error ? models.t(modelData.error) : Number(modelData.tokensPerSecond).toFixed(1) + " token/s · GPU " + Number(modelData.gpuPercent).toFixed(1) + "%"); wrapMode: Text.Wrap; Layout.fillWidth: true }
            Button { text: models.t("apply"); enabled: !modelData.error && !models.bridge.localPerformance.busy; onClicked: models.bridge.localPerformance.select(modelData.id) }
        }
    }
    Dialog { id: compare; title: models.t("runtimeCompare"); modal: true; standardButtons: Dialog.Yes | Dialog.Cancel; Label { text: models.t("runtimeCompareHint"); wrapMode: Text.Wrap; width: models.bridge.resources.metrics.sidebar }; onAccepted: models.bridge.localPerformance.compare() }
}
