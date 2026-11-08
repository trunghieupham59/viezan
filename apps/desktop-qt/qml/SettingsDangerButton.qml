import QtQuick
import QtQuick.Controls

Kit.QuietButton {
    id: button
    readonly property bool dark: workbench.state.appearance?.preset === "midnight" || workbench.state.appearance?.mode === "dark" || (workbench.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: workbench.resources.themePalettes[(workbench.state.appearance?.preset || "graphite") + ":" + (workbench.state.appearance?.accent || "auto")][dark ? "dark" : "light"]
    palette.buttonText: enabled ? colors.danger : colors["text-disabled"]
    icon.color: enabled ? colors.danger : colors["text-disabled"]
    Accessible.name: text
}
