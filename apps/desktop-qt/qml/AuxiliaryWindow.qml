import QtQuick
import QtQuick.Controls

ApplicationWindow {
    id: window
    required property var bridge
    readonly property var metrics: bridge.resources.metrics
    readonly property bool dark: bridge.state.appearance?.preset === "midnight" || bridge.state.appearance?.mode === "dark" || (bridge.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.resources.themePalettes[(bridge.state.appearance?.preset || "graphite") + ":" + (bridge.state.appearance?.accent || "auto")][dark ? "dark" : "light"]
    color: "transparent"
    palette.base: Qt.tint(colors["app-bg"], colors["overlay-material"] || colors["surface-raised"])
    palette.window: Qt.tint(colors["app-bg"], colors["overlay-material"] || colors["surface-raised"])
    palette.alternateBase: Qt.tint(colors["app-bg"], colors.canvas)
    palette.text: colors.text
    palette.windowText: colors.text
    palette.buttonText: colors.text
    palette.placeholderText: colors["text-muted"]
    palette.highlight: colors.action
    palette.highlightedText: colors["action-fg"]
    palette.disabled.buttonText: colors["text-disabled"]
    palette.disabled.button: colors["surface-subtle"]
    palette.mid: colors.border
    palette.midlight: colors.border
    background: Kit.ReadingPanelSurface { radius: window.metrics.largeRadius }
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function tpl(key, values) { let text = t(key); for (const name in values) text = text.split("{" + name + "}").join(values[name]); return text }
}
