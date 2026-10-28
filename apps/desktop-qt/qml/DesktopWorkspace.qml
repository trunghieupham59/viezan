import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: page
    required property var bridge
    required property string route
    signal routeRequested(string value)
    signal newTranslation()
    readonly property bool linux: Qt.platform.os === "linux"
    readonly property var metrics: bridge.resources.metrics
    readonly property var session: bridge.state.sessions.find(item => item.id === bridge.state.active[bridge.state.feature])
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function shortcutKey(id) { return (bridge.desktopIntegration.shortcuts.find(item => item.id === id)?.key || "").replace(/\+/g, " + ") }
    contentWidth: availableWidth
    ColumnLayout {
        width: Math.min(page.availableWidth - page.metrics.large * 2, page.metrics.reading + page.metrics.sidebar)
        x: (page.availableWidth - width) / 2
        spacing: page.metrics.gutter
        Kit.PageIntro {
            title: page.t(page.route === "everywhere" ? "qtEverywhereTitle" : "utilitiesTitle")
            subtitle: page.t(page.route === "everywhere" ? "qtEverywhereSubtitle" : "utilitiesIntro")
            Layout.fillWidth: true; Layout.topMargin: page.metrics.gutter
        }
        Kit.Columns {
            // Windows/Linux Everywhere (Review 18): how text comes in, and verified permissions.
            Kit.Card {
                visible: page.route === "everywhere"
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                ColumnLayout {
                    anchors.fill: parent; spacing: 0
                    Label { text: page.t("contentSources"); font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.subtitleScale; Layout.bottomMargin: page.metrics.small }
                    Kit.CardRow { title: page.t("pasteText"); detail: page.t("pasteTextHint"); Kit.PrimaryButton { text: page.t("openInTranslate"); onClicked: page.newTranslation() } }
                    Kit.CardRow { title: page.t("browserExtension"); detail: page.t("browserExtensionHint"); Button { text: page.t(page.bridge.extensionBridge.listening ? "enabled" : "connect"); onClicked: bridgeDialog.open() } }
                    Kit.CardRow { title: page.t("globalShortcut"); detail: page.t(page.linux ? "globalShortcutHintLinux" : "globalShortcutHintWindows"); divider: false; Button { text: page.t("setUp"); onClicked: page.routeRequested("utilities") } }
                }
            }
            Kit.Card {
                visible: page.route === "everywhere"
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                ColumnLayout {
                    anchors.fill: parent; spacing: page.metrics.gap
                    Label { text: page.t("permissionStatus"); font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.subtitleScale }
                    Kit.StatusBadge { text: page.t("notVerified") }
                    Label { text: page.t(page.linux ? "permissionHintLinux" : "permissionHintWindows"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Button { text: page.t("viewPermissions"); onClicked: page.bridge.desktopIntegration.openPrivacySettings() }
                }
            }
            Kit.Card {
                visible: page.route === "utilities"
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                ColumnLayout {
                    anchors.fill: parent; spacing: 0
                    Label { text: page.t("allShortcuts"); font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.subtitleScale; Layout.bottomMargin: page.metrics.small }
                    DesktopSettings { Layout.fillWidth: true; bridge: page.bridge; route: page.route }
                    Kit.CardRow { title: page.t("commands"); detail: page.t("shortcutDetail_commands"); divider: false; Kit.KeyCap { text: Qt.platform.os === "osx" ? "⌘ K" : "Ctrl + K" } }
                }
            }
            Kit.Card {
                visible: page.route === "utilities"
                padding: page.metrics.gutter
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop; Layout.topMargin: page.metrics.gutter
                ColumnLayout {
                    anchors.fill: parent; spacing: page.metrics.inset
                    Label { text: page.t("launcherPitch"); font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.titleScale }
                    Label { text: page.t("launcherPitchDetail"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Kit.PrimaryButton { text: page.t("openLauncher"); icon.source: "icons/search.svg"; onClicked: page.bridge.desktopIntegration.trigger("launcher") }
                }
            }
        }
    }
    Dialog {
        id: bridgeDialog
        parent: Overlay.overlay
        title: page.t("connections")
        modal: true
        standardButtons: Dialog.Close
        width: Math.min(parent.width - page.metrics.inset * 2, page.metrics.reading)
        height: Math.min(parent.height - page.metrics.inset * 2, page.metrics.editor * 3)
        x: (parent.width - width) / 2; y: (parent.height - height) / 2
        contentItem: ScrollView {
            id: bridgeScroll
            contentWidth: availableWidth
            BridgeSettings { width: bridgeScroll.availableWidth; bridge: page.bridge }
        }
    }
}
