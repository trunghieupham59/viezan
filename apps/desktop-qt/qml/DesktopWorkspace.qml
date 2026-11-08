import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: page
    required property var bridge
    required property string route
    signal routeRequested(string value)
    signal newTranslation()
    property var desktop: bridge.desktopIntegration
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
                    Label { text: page.t("translateSelection"); font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.subtitleScale; Layout.bottomMargin: page.metrics.small }
                    Kit.CardRow {
                        title: page.t("replaceSelection"); detail: page.t("selectionReplacementHint")
                        Kit.StatusBadge { objectName: "selection-capability"; idle: !page.desktop.canReplaceSelection; text: page.t(page.desktop.canReplaceSelection ? "selectionReplacementAvailable" : "selectionReplacementUnavailable") }
                    }
                    DesktopSettings { bridge: page.bridge; desktop: page.desktop; route: "everywhere"; Layout.fillWidth: true }
                    // Quick translate's own pair and the model it uses (the app's current choice).
                    Kit.CardRow {
                        id: primaryRow
                        readonly property var pair: (page.bridge.state, page.bridge.quickTranslate())
                        title: page.t("quickPrimary"); detail: page.t(pair.secondary ? "quickPairOn" : "quickPairOff")
                        Kit.GlassComboBox {
                            readonly property var codes: page.bridge.resources.nativeLanguages
                            model: codes.map(value => page.t("lang_" + value)); currentIndex: codes.indexOf(primaryRow.pair.primary)
                            implicitContentWidthPolicy: ComboBox.WidestText; Accessible.name: page.t("quickPrimary"); onActivated: page.bridge.command("quickTranslatePrimary", {value: codes[currentIndex]})
                        }
                    }
                    Kit.CardRow {
                        id: secondaryRow
                        readonly property var pair: (page.bridge.state, page.bridge.quickTranslate())
                        title: page.t("quickSecondary"); detail: page.t("quickSecondaryHint")
                        Kit.GlassComboBox {
                            readonly property var codes: [""].concat(page.bridge.resources.nativeLanguages.filter(value => value !== secondaryRow.pair.primary))
                            model: codes.map(value => value ? page.t("lang_" + value) : page.t("quickSecondaryOff")); currentIndex: Math.max(0, codes.indexOf(secondaryRow.pair.secondary || ""))
                            implicitContentWidthPolicy: ComboBox.WidestText; Accessible.name: page.t("quickSecondary"); onActivated: page.bridge.command("quickTranslateSecondary", {value: codes[currentIndex]})
                        }
                    }
                    Kit.CardRow { title: page.t("quickModel"); detail: page.t("quickModelHint"); divider: false; Label { text: page.bridge.shortModelName(page.session?.model || ""); color: palette.placeholderText; elide: Text.ElideMiddle } }
                }
            }
            ColumnLayout {
                visible: page.route === "everywhere"
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                spacing: page.metrics.small
                Kit.Eyebrow { text: page.t("quickPreview") }
                Item {
                    Layout.fillWidth: true
                    implicitHeight: previewCard.implicitHeight + page.metrics.gutter * 2
                    Kit.AppBackdrop { anchors.fill: parent }
                    Kit.Card {
                        id: previewCard
                        x: page.metrics.gutter; y: page.metrics.gutter
                        width: parent.width - page.metrics.gutter * 2
                        ColumnLayout {
                            width: parent.width; spacing: page.metrics.inset
                            Kit.StatusBadge { text: page.t("lang_en") + " → " + page.t("lang_" + page.t("previewTarget")) }
                            Label { text: page.t("previewSource"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                            Label { text: page.t("previewTranslated"); font.weight: Font.Medium; wrapMode: Text.Wrap; Layout.fillWidth: true }
                            Label { text: page.bridge.shortModelName(page.session?.model || ""); color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
                        }
                    }
                }
                Label { text: page.t("previewIllustrative"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Kit.GlassButton { text: page.t("openInTranslate"); onClicked: page.newTranslation() }
            }
            Kit.Card {
                visible: page.route === "utilities"
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                ColumnLayout {
                    anchors.fill: parent; spacing: 0
                    Label { text: page.t("allShortcuts"); font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.subtitleScale; Layout.bottomMargin: page.metrics.small }
                    DesktopSettings { Layout.fillWidth: true; bridge: page.bridge; desktop: page.desktop; route: page.route }
                    Kit.CardRow { title: page.t("commands"); detail: page.t("shortcutDetail_commands"); divider: false; Kit.KeyCap { text: Qt.platform.os === "osx" ? "⌘ K" : "Ctrl + K" } }
                }
            }
            Kit.Card {
                visible: page.route === "utilities"
                padding: page.metrics.gutter
                Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                ColumnLayout {
                    anchors.fill: parent; spacing: page.metrics.inset
                    Label { text: page.t("launcherPitch"); Layout.fillWidth: true; wrapMode: Text.Wrap; font.bold: true; font.pointSize: Qt.application.font.pointSize * page.metrics.titleScale }
                    Label { text: page.t("launcherPitchDetail"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Kit.PrimaryButton { text: page.t("openLauncher"); icon.source: "icons/search.svg"; onClicked: page.bridge.desktopIntegration.trigger("launcher") }
                }
            }
        }
    }
}
