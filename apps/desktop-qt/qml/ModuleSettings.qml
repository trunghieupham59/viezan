import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: modules
    required property var bridge
    readonly property var workspaceModules: ["chat","translate","interpret","dictionary","thermal","apps"]
    readonly property var disabledModules: bridge.state.disabledModules || []
    readonly property var enabledModules: workspaceModules.filter(id => !disabledModules.includes(id))
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    spacing: bridge.resources.metrics.inset
    Repeater {
        model: [{title:"modulesWorkspaceGroup", ids:modules.workspaceModules}, {title:"modulesSystemGroup", ids:["utilities"]}]
        delegate: Kit.CardBox {
            required property var modelData
            title: modules.t(modelData.title); Layout.fillWidth: true
            ColumnLayout {
                width: parent.width; spacing: 0
                Repeater {
                    model: modelData.ids
                    delegate: Kit.CardRow {
                        id: moduleRow
                        required property string modelData
                        readonly property bool locked: modelData !== "utilities" && modules.enabledModules.length === 1 && modules.enabledModules[0] === modelData
                        title: modules.t(modelData === "utilities" ? "launcher" : modelData)
                        detail: modules.t(locked ? "modulesLastHint" : "moduleDesc_" + modelData)
                        Switch { objectName: "settings-module-" + modelData; checked: !modules.disabledModules.includes(modelData); enabled: !modules.bridge.loadBlocked && !locked; Accessible.name: moduleRow.title; onToggled: modules.bridge.command("module", {id:modelData, enabled:checked}) }
                    }
                }
            }
        }
    }
    Label { text: modules.t("modulesLastHint"); wrapMode: Text.Wrap; Layout.fillWidth: true; color: palette.placeholderText }
}
