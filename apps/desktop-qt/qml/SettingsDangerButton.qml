import QtQuick
import QtQuick.Controls

Kit.QuietButton {
    id: button
    readonly property bool dark: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: workbench.palettes[dark ? "dark" : "light"]
    palette.active.buttonText: colors.danger
    palette.inactive.buttonText: colors.danger
    icon.color: enabled ? colors.danger : palette.disabled.buttonText
    Accessible.name: text
}
