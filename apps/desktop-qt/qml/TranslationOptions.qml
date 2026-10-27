import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ColumnLayout {
    id: options
    required property var bridge
    required property var session
    readonly property var workspace: bridge.state
    readonly property var metrics: bridge.resources.metrics
    spacing: metrics.inset
    function t(key) { return bridge.resources.locales[workspace.locale][key] || key }
    function command(name, payload) { bridge.command(name, Object.assign({sessionID: session.id}, payload || {})) }
    Flow {
        visible: session.feature === "translate"
        Layout.fillWidth: true; spacing: metrics.small
        ComboBox {
            readonly property var styles: ["general", "formal", "casual", "business", "technical", "natural"]
            model: styles.map(value => t("style_" + value)); currentIndex: styles.indexOf(session.translationStyle || "general")
            Accessible.name: t("translationStyle")
            onActivated: command("translationOptions", {style: styles[currentIndex], mode: session.translationMode || "translate"})
        }
        ComboBox {
            readonly property var modes: ["translate", "annotate", "phonetic", "rewrite"]
            model: modes.map(value => t(value)); currentIndex: modes.indexOf(session.translationMode || "translate")
            Accessible.name: t("translationMode")
            onActivated: command("translationOptions", {style: session.translationStyle || "general", mode: modes[currentIndex]})
        }
    }
    ComboBox {
        visible: session.feature === "translate"
        readonly property var efforts: ["auto", "low", "medium", "high"]
        model: efforts.map(value => t("reasoning_" + value))
        currentIndex: efforts.indexOf(session.reasoningEffort || "auto")
        Accessible.name: t("reasoning")
        onActivated: command("reasoning", {value: efforts[currentIndex]})
    }
    RowLayout {
        visible: session.feature === "translate" && workspace.autoTranslate === true
        Label { text: t("autoTranslateDelay") }
        SpinBox { from: 100; to: 5000; stepSize: 100; value: workspace.autoTranslateDelay || 800; Accessible.name: t("autoTranslateDelay"); onValueModified: command("autoTranslate", {enabled: true, delay: value}) }
    }
    CheckBox { visible: session.feature === "translate"; text: t("autoTranslate"); checked: workspace.autoTranslate || false; onToggled: command("autoTranslate", {enabled: checked, delay: workspace.autoTranslateDelay || 800}); ToolTip.visible: hovered; ToolTip.text: t("autoTranslateHint") }
    ComparisonPane { visible: session.feature === "translate" && !(session.images || []).length; bridge: options.bridge; session: options.session; Layout.fillWidth: true }
}
