import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ColumnLayout {
    id: habits
    objectName: "habit-chips"
    required property var bridge
    required property string sessionID
    readonly property var suggestions: sessionID ? (bridge.historyRevision, bridge.habitSuggestions(sessionID)) : []
    signal activated(var action)
    readonly property var strings: workbench.strings
    readonly property var metrics: workbench.metrics
    visible: suggestions.length > 0
    spacing: metrics.tight
    Layout.fillWidth: true
    Accessible.role: Accessible.Grouping
    Accessible.name: strings.habitSuggestions
    Kit.Eyebrow { text: habits.strings.habitSuggestions }
    Flow {
        Layout.fillWidth: true
        Layout.preferredHeight: childrenRect.height
        spacing: habits.metrics.small
        Repeater {
            model: habits.suggestions
            delegate: Kit.QuietButton {
                required property var modelData
                objectName: "habit-" + modelData.id
                text: modelData.feature === "chat" ? habits.strings["chatMode_" + modelData.mode]
                    : modelData.feature === "dictionary" ? habits.strings.habitDictionary
                    : habits.strings.habitTranslatePair.replace("{source}", habits.strings["lang_" + modelData.source])
                                                       .replace("{target}", habits.strings["lang_" + modelData.target])
                icon.source: "icons/" + (modelData.feature === "chat" ? ({web:"search", research:"dictionary", image:"image"})[modelData.mode] : modelData.feature) + ".svg"
                icon.color: palette.buttonText
                height: Math.max(habits.metrics.compactControl, implicitContentHeight + 2 * habits.metrics.tight)
                width: Math.min(implicitWidth, parent.width)
                Accessible.name: text
                onClicked: habits.activated(modelData)
            }
        }
    }
}
