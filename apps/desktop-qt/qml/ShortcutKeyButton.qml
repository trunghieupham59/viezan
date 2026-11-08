import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Independent document: its delegate must not live in an imported inline type.
Kit.GlassButton {
    id: button
    property string sequence: ""
    text: sequence.replace(/\+/g, " + ")
    contentItem: RowLayout {
        spacing: workbench.resources.metrics.tight
        Repeater {
            model: button.sequence.split("+")
            delegate: Kit.KeyCap { required property string modelData; text: modelData; Accessible.ignored: true }
        }
    }
}
