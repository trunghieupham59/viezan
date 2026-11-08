import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: usage
    required property var bridge
    signal feedback(string message, bool error)
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    Kit.ModelLabel { id: modelNames; visible: false }
    readonly property var rows: {
        var totals = {}
        for (var task of bridge.state.tasks || []) {
            var name = task.request.model
            if (!totals[name]) totals[name] = {model: name, input: 0, output: 0}
            totals[name].input += Number((task.usage || {}).input || 0)
            totals[name].output += Number((task.usage || {}).output || 0)
        }
        return Object.values(totals).sort(function(a,b) { return a.model.localeCompare(b.model) })
    }
    readonly property string modelID: {
        var id = bridge.state.active[bridge.state.feature]
        var session = bridge.state.sessions.find(function(s) { return s.id === id })
        return session ? session.model : ""
    }
    Label { text: usage.t("usageHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Repeater {
        model: usage.rows
        delegate: ColumnLayout {
            required property var modelData
            readonly property var rate: (usage.bridge.state.rates || {})[modelData.model]
            Label { textFormat: Text.PlainText; text: modelNames.format(modelData.model); font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Label { text: usage.t("usageInput") + ": " + modelData.input + " · " + usage.t("usageOutput") + ": " + modelData.output }
            Label { visible: !!parent.rate; text: parent.rate ? usage.t("usageEstimate") + ": " + ((modelData.input * parent.rate.input + modelData.output * parent.rate.output) / 1000000).toFixed(6) + " " + parent.rate.currency : "" }
        }
    }
    Label { text: usage.t("usageRate") + " · " + modelNames.format(usage.modelID); wrapMode: Text.Wrap; Layout.fillWidth: true }
    Kit.CardRow { title: usage.t("usageInput"); TextField { Layout.fillWidth: true; Layout.maximumWidth: usage.bridge.resources.metrics.editor; id: incoming; placeholderText: usage.t("usageInput"); Accessible.name: placeholderText; text: String(((usage.bridge.state.rates || {})[usage.modelID] || {}).input ?? "") } }
    Kit.CardRow { title: usage.t("usageOutput"); TextField { Layout.fillWidth: true; Layout.maximumWidth: usage.bridge.resources.metrics.editor; id: outgoing; placeholderText: usage.t("usageOutput"); Accessible.name: placeholderText; text: String(((usage.bridge.state.rates || {})[usage.modelID] || {}).output ?? "") } }
    Kit.CardRow { title: usage.t("usageCurrency"); TextField { Layout.fillWidth: true; Layout.maximumWidth: usage.bridge.resources.metrics.editor; id: currency; placeholderText: usage.t("usageCurrency"); Accessible.name: placeholderText; maximumLength: 3; text: ((usage.bridge.state.rates || {})[usage.modelID] || {}).currency || "USD" } }
    Kit.PrimaryButton { text: usage.t("apply"); enabled: !usage.bridge.loadBlocked && !!usage.modelID; onClicked: {
        var a = Number(incoming.text), b = Number(outgoing.text), code = currency.text.toUpperCase()
        invalid.visible = !incoming.text.trim() || !outgoing.text.trim() || !isFinite(a) || !isFinite(b) || a < 0 || b < 0 || a > 1000000 || b > 1000000 || !/^[A-Z]{3}$/.test(code)
        if (!invalid.visible) { usage.bridge.command("usageRate", {model: usage.modelID, input: a, output: b, currency: code}); usage.feedback(usage.t(usage.bridge.storageError || "succeeded"), !!usage.bridge.storageError) }
    } }
    Label { id: invalid; visible: false; text: usage.t("usageInvalid"); wrapMode: Text.Wrap; Layout.fillWidth: true }
}
