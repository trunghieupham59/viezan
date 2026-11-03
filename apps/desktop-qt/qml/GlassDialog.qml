import QtQuick
import QtQuick.Controls

// Keep the dialog in its own document: Qt 6.8 creates standard button
// delegates during completion, when sibling inline types in the same
// compilation unit can still be under construction.
// Skin the existing button-box delegate: the Dialog retains its native
// footer, standard button roles, ordering, default action and signals.
Dialog {
    id: glassDialog
    readonly property var metrics: workbench.resources.metrics
    readonly property bool glass: workbench.state.appearance?.preset === "glass"
    property Item glassPanelBackground: Kit.ReadingPanelSurface {
        parent: glassDialog.contentItem.parent
        anchors.fill: parent
        z: -1
        visible: glassDialog.glass
    }
    Binding { target: glassDialog.background; property: "visible"; value: !glassDialog.glass }
    // The native title/button-box backgrounds otherwise cover the rounded
    // shell with square strips. Keep their objects, roles and ordering.
    Binding { target: glassDialog.header?.background; property: "visible"; value: !glassDialog.glass }
    Binding { target: glassDialog.header; property: "padding"; value: glassDialog.metrics.inset; when: glassDialog.glass }
    footer: DialogButtonBox {
        id: dialogButtons
        visible: count > 0
        delegate: Kit.GlassButton {}
        Binding { target: dialogButtons.background; property: "visible"; value: !glassDialog.glass }
    }
}
