import QtQuick

// Shared fallback for Shell-Solid. OS flags notify independently;
// isolated QtTest engines may intentionally omit the context service.
QtObject {
    readonly property bool highContrast: typeof systemAppearance !== "undefined" && !!systemAppearance && systemAppearance.highContrast
    readonly property bool reduceTransparency: typeof systemAppearance !== "undefined" && !!systemAppearance && systemAppearance.reduceTransparency
    // Qt exposes motionPreference from 6.12. Earlier releases use the platform reader.
    readonly property bool reduceMotion: (typeof systemAppearance !== "undefined" && !!systemAppearance?.reduceMotion)
            || (Qt.styleHints.accessibility?.motionPreference !== undefined
                && Qt.styleHints.accessibility.motionPreference === Qt.ReducedMotion)
    readonly property bool solid: (reduceTransparency || highContrast)
    readonly property bool dark: workbench.appearance?.mode === "dark" || (workbench.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: workbench.palettes[dark ? "dark" : "light"]
    // Composite existing semantic tokens on opaque bases. Token colours
    // take precedence over the light-only literal swatches in the board.
    readonly property color reading: dark ? Qt.tint(colors["app-bg"], colors.canvas) : Qt.alpha(colors.surface, 1)
    readonly property color pane: Qt.tint(colors["titlebar-bg"], colors["sidebar-bg"])
    readonly property color control: Qt.tint(pane, colors.surface)
    readonly property color raised: dark ? Qt.tint(colors["app-bg"], colors["surface-raised"]) : reading
    readonly property color edge: colors[highContrast ? "border-strong" : "border"]
}
