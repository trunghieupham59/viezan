import QtQuick
import QtQuick.Controls

Kit.QuietButton {
    id: button
    readonly property bool dark: workbench.appearance?.preset === "midnight" || workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: workbench.palettes[dark ? "dark" : "light"]
    palette.buttonText: enabled ? colors.danger : colors["text-disabled"]
    icon.color: enabled ? colors.danger : colors["text-disabled"]
    Accessible.name: text
}
