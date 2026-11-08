import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: models
    required property var bridge
    signal feedback(string message, bool error)
    readonly property var manager: bridge.modelManager
    readonly property var metrics: bridge.resources.metrics
    readonly property var installed: bridge.localModels.filter(model => model.startsWith("ollama:"))
    readonly property bool ollamaRunning: (bridge.localModels, bridge.discovering, bridge.providerState("ollama").models >= 0)
    readonly property bool anyBusy: manager.busy || bridge.localPerformance.busy
    readonly property bool localWork: bridge.interpretation.busy || bridge.state.tasks.some(task => task.status === "running" && task.request.model.startsWith("ollama:"))
    property string downloading: ""
    property bool managerWasBusy: false
    Connections {
        target: models.manager
        function onChanged() {
            if (models.managerWasBusy && !models.manager.busy)
                models.feedback(models.t(models.manager.error || models.manager.status), !!models.manager.error)
            models.managerWasBusy = models.manager.busy
        }
    }
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function bytes(value) { return (value / 1000000000).toLocaleString(Qt.locale(bridge.state.locale), 'f', 1) + " GB" }
    function modelLabel(id) { const suggested = bridge.resources.localModelSuggestions.find(item => "ollama:" + item.id === id); return suggested ? suggested.name : bridge.shortModelName(id) }
    function download(id) { if (!anyBusy && ollamaRunning) { downloading = id; manager.run(id, false) } }
    Component.onCompleted: bridge.localRuntime.refresh()
    spacing: metrics.inset
    Kit.GlassButton { text: models.t("refreshModels"); icon.source: "icons/refresh.svg"; enabled: !models.bridge.loadingModels; onClicked: { models.bridge.refreshModels("ollama"); models.bridge.localRuntime.refresh() } }
    Kit.CardBox {
        title: models.t("localRuntimes"); Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: 0
            Repeater {
                model: [["ollama", "Ollama"], ["lmstudio", "LM Studio"], ["llamacpp", "llama.cpp"]]
                delegate: Kit.CardRow {
                    required property var modelData
                    required property int index
                    readonly property int count: (models.bridge.localModels, models.bridge.discovering, models.bridge.providerState(modelData[0]).models)
                    title: modelData[1]; detail: modelData[0] === "ollama" ? models.bridge.localRuntime.version : ""; divider: index < 2
                    Kit.StatusBadge { text: count >= 0 ? models.t("runtimeRunning").replace("{count}", count) : models.t("runtimeNotRunning"); idle: count < 0 }
                    Kit.GlassButton { visible: modelData[0] === "ollama" && count < 0; text: models.t("installRuntime"); onClicked: Qt.openUrlExternally("https://ollama.com/download") }
                }
            }
        }
    }
    Kit.CardBox {
        title: models.t("runtimeSettings"); Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: 0
            Kit.CardRow {
                objectName: "settings-device"; title: models.t("thisDevice")
                detail: models.t("deviceProcessors").replace("{count}", models.bridge.localRuntime.processors) + (models.bridge.localRuntime.memoryBytes > 0 ? " · " + models.t("deviceMemory").replace("{size}", models.bytes(models.bridge.localRuntime.memoryBytes)) : "")
            }
            Kit.CardRow {
                title: models.t("runtimeParallel")
                SettingsPicker { objectName: "settings-runtime-parallel"; id: parallel; model: [1,2,4]; currentIndex: model.indexOf(models.bridge.state.runtime?.parallel || 1); onActivated: models.bridge.command("runtime", {parallel:model[currentIndex], context:context.model[context.currentIndex]}); enabled: !models.bridge.loadBlocked && !models.bridge.localRuntime.owned && !models.bridge.localRuntime.busy; Accessible.name: models.t("runtimeParallel") }
            }
            Kit.CardRow {
                title: models.t("runtimeContext"); detail: models.t("runtimeHint"); divider: false
                SettingsPicker { objectName: "settings-runtime-context"; id: context; model: [2048,4096,8192,16384,32768]; currentIndex: model.indexOf(models.bridge.state.runtime?.context || 4096); onActivated: models.bridge.command("runtime", {parallel:parallel.model[parallel.currentIndex], context:model[currentIndex]}); enabled: !models.bridge.loadBlocked && !models.bridge.localRuntime.owned && !models.bridge.localRuntime.busy; Accessible.name: models.t("runtimeContext") }
            }
            Flow {
                Layout.fillWidth: true; spacing: models.metrics.small
                Kit.GlassButton { text: models.t("runtimeStart"); enabled: models.bridge.localRuntime.available && !models.bridge.localRuntime.owned && !models.bridge.localRuntime.busy; onClicked: models.bridge.localRuntime.start(parallel.model[parallel.currentIndex], context.model[context.currentIndex]) }
                SettingsDangerButton { text: models.t("runtimeStop"); visible: models.bridge.localRuntime.owned; onClicked: models.bridge.localRuntime.stop() }
            }
            Label { text: models.t(models.bridge.localRuntime.error); visible: !!models.bridge.localRuntime.error; wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
    }
    Kit.CardBox {
        title: models.t("suggestedModels"); Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: 0
            Repeater {
                model: models.bridge.resources.localModelSuggestions
                delegate: Kit.CardRow {
                    required property var modelData
                    readonly property bool have: models.installed.includes("ollama:" + modelData.id)
                    objectName: "settings-suggestion-" + modelData.id
                    title: modelData.name; detail: models.bytes(modelData.bytes) + " · " + models.t(modelData.note)
                    Kit.StatusBadge { visible: have; text: models.t("modelInstalled") }
                    Label { visible: !have && !models.ollamaRunning; text: models.t("modelWaitingRuntime"); color: palette.placeholderText }
                    Kit.GlassButton { visible: !have && models.ollamaRunning; text: models.t("downloadModel"); enabled: !models.anyBusy; onClicked: models.download(modelData.id) }
                }
            }
            Kit.CardRow {
                title: models.t("otherModel"); divider: false
                TextField { id: modelName; Layout.fillWidth: true; Layout.minimumWidth: models.metrics.control; placeholderText: models.t("modelID"); Accessible.name: placeholderText; maximumLength: 505 }
                Kit.GlassButton { text: models.t("download"); enabled: !!modelName.text.trim() && !models.anyBusy && models.ollamaRunning; onClicked: models.download(modelName.text.trim()) }
            }
            ProgressBar { visible: models.manager.busy; indeterminate: models.manager.progress < 0; value: models.manager.progress; Layout.fillWidth: true }
            Label { textFormat: Text.PlainText; text: models.t(models.manager.status); visible: !!models.manager.status; wrapMode: Text.Wrap; Layout.fillWidth: true }
            SettingsDangerButton { text: models.t("stop"); visible: models.manager.busy; onClicked: models.manager.cancel() }
            Label { textFormat: Text.PlainText; text: models.t(models.manager.error || models.bridge.modelError); visible: !!(models.manager.error || models.bridge.modelError); wrapMode: Text.Wrap; Layout.fillWidth: true }
        }
    }
    Kit.CardBox {
        title: models.t("downloadedModels"); Layout.fillWidth: true
        ColumnLayout {
            width: parent.width; spacing: models.metrics.small
            Label { visible: models.installed.length === 0; text: models.t("noLocalModels"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Repeater {
                model: models.installed
                delegate: ColumnLayout {
                    required property string modelData
                    Layout.fillWidth: true
                    Label { text: models.modelLabel(modelData); wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Flow {
                        Layout.fillWidth: true; spacing: models.metrics.small
                        Kit.GlassButton { text: models.t("runtimeCompare"); enabled: !models.anyBusy && !models.localWork; onClicked: { models.bridge.localPerformance.selectModel(modelData); compare.open() } }
                        SettingsDangerButton { text: models.t("deleteModel"); enabled: !models.anyBusy && !models.localWork; onClicked: { removeModel.modelName = modelData.slice(7); removeModel.open() } }
                    }
                }
            }
        }
    }
    SettingsConfirm {
        id: removeModel; objectName: "settings-delete-model-dialog"; bridge: models.bridge
        property string modelName: ""
        title: models.t("deleteModel"); message: models.t("deleteNamedModelConfirm").replace("{name}", models.modelLabel("ollama:" + modelName))
        actionText: models.t("deleteModel"); actionEnabled: !models.anyBusy && !models.localWork
        onAccepted: if (!models.anyBusy && !models.localWork) models.manager.run(modelName, true)
    }
    SettingsConfirm {
        id: compare; objectName: "settings-compare-dialog"; bridge: models.bridge
        title: models.t("runtimeCompare"); message: models.t("runtimeCompareHint"); destructive: false
        actionText: models.t("start"); actionEnabled: !models.anyBusy && !models.localWork
        onAccepted: if (!models.anyBusy && !models.localWork) models.bridge.localPerformance.compare()
    }
    BusyIndicator { running: models.bridge.localPerformance.busy; visible: running }
    SettingsDangerButton { text: models.t("cancel"); visible: models.bridge.localPerformance.busy; onClicked: models.bridge.localPerformance.cancel() }
    Label { text: models.t(models.bridge.localPerformance.error); visible: !!models.bridge.localPerformance.error; wrapMode: Text.Wrap; Layout.fillWidth: true }
    Label { text: models.modelLabel(models.bridge.localPerformance.model); visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
    Kit.GlassButton { text: models.t("voiceAutomatic"); visible: !!models.bridge.localPerformance.model; enabled: !models.bridge.localPerformance.busy; onClicked: { models.bridge.localPerformance.select("auto"); models.feedback(models.t("succeeded"), false) } }
    Repeater {
        model: models.bridge.localPerformance.results
        delegate: Kit.CardRow {
            required property var modelData
            title: modelData.id === "gpu" ? "GPU" : "CPU + GPU"
            detail: modelData.error ? models.t(modelData.error) : models.t("runtimePerformanceSummary").replace("{rate}", Number(modelData.tokensPerSecond).toFixed(1)).replace("{gpu}", Number(modelData.gpuPercent).toFixed(1))
            Kit.GlassButton { text: models.t("apply"); enabled: !modelData.error && !models.bridge.localPerformance.busy; onClicked: { models.bridge.localPerformance.select(modelData.id); models.feedback(models.t("succeeded"), false) } }
        }
    }
}
