import QtQuick
import QtQuick.Controls
import QtQuick.Controls.impl
import QtQuick.Layouts

Item {
    id: root
    required property var bridge
    property var removalService: typeof appUninstall !== "undefined" ? appUninstall : null
    // QtTest injects this boundary; it never opens system Settings.
    property var openSettings: function() { return Qt.openUrlExternally("ms-settings:appsfeatures") }
    readonly property var metrics: bridge.metrics
    readonly property bool dark: bridge.appearance?.mode === "dark" || (bridge.appearance?.mode !== "light" && bridge.appearance?.mode !== "dark" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.palettes[dark ? "dark" : "light"]
    readonly property bool busy: removalService ? removalService.busy : false
    readonly property var apps: removalService ? removalService.apps : []
    property string selectedID: ""
    property string query: ""
    property var result: removalService ? removalService.lastResult : ({})
    property var pending: null
    readonly property var filtered: apps.filter(row => !query || (row.name || "").toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    readonly property var selected: filtered.find(row => row.id === selectedID) || null
    readonly property bool canRemove: allowed(selected)
    readonly property bool verified: result.status === "removed" && result.verifiedRemoved === true
    signal notification(string message, bool error, string level, var key)
    property bool scanning: false
    property bool announceScan: false
    readonly property bool removalBusy: busy && !scanning
    readonly property bool trashUndo: result.canUndo === true && result.undoKind === "systemTrash"
    readonly property string resultText: result.status && result.status !== "scanned" ? message(result.status === "removed" && !verified ? "unverified" : result.status) : ""
    readonly property var localeStrings: bridge.strings
    function t(key) { return localeStrings[key] || key }
    function tpl(key, values) { let text = t(key); for (const name in values) text = text.split("{" + name + "}").join(values[name]); return text }
    readonly property var messageKeys: ({
        "source_registry": "appsSourceRegistry",
        "source_msix": "appsSourceMsix",
        "flatpak_user": "appsSourceFlatpakUser",
        "flatpak_system": "appsSourceFlatpakSystem",
        "source_snap": "appsSourceSnap",
        "source_deb": "appsSourceDeb",
        "source_rpm": "appsSourceRpm",
        "source_appimage": "appsSourceAppImage",
        "effect_registry": "appsUninstallRegistryHint",
        "effect_msix": "appsUninstallMsixHint",
        "effect_flatpak_user": "appsUninstallFlatpakUserHint",
        "effect_flatpak_system": "appsUninstallFlatpakSystemHint",
        "effect_snap": "appsUninstallSnapHint",
        "effect_deb": "appsUninstallDebHint",
        "effect_rpm": "appsUninstallRpmHint",
        "effect_appimage": "appsUninstallAppImageHint",
        "removed": "appsUninstallVerified",
        "scanned": "appsInventoryUpdated",
        "stillInstalled": "appsStillInstalled",
        "unverified": "appsUninstallUnverified",
        "restartRequired": "appsUninstallRestartRequired",
        "cancelled": "appsUninstallCancelled",
        "startFailed": "appsUninstallStartFailed",
        "failed": "appsUninstallFailed",
        "staleInventory": "appsInventoryStale",
        "inventoryIncomplete": "appsInventoryIncomplete",
        "notAllowed": "appsUninstallNotAllowed",
        "authorizationRequired": "appsUninstallAuthorizationRequired",
        "operationUnverified": "appsUninstallOperationUnverified",
        "openSettings": "appsManageInSettingsHint",
        "trashUndo": "appsSystemTrashUndoHint",
        "invalidUninstallCommand": "appsUninstallCommandInvalid",
        "toolUnavailable": "appsUninstallToolUnavailable",
        "authorizationUnavailable": "appsUninstallAuthorizationUnavailable",
        "unknown": "appsUninstallUnknown",
        "unsupportedPlatform": "appsUninstallUnsupported",
        "hklm64:registryUnavailable": "appsRegistryMachine64Unavailable",
        "hklm32:registryUnavailable": "appsRegistryMachine32Unavailable",
        "hkcu64:registryUnavailable": "appsRegistryUserUnavailable",
        "registry:enumerationFailed": "appsRegistryEnumerationFailed",
        "registry:entryUnavailable": "appsRegistryEntryUnavailable",
        "desktop:directoryUnreadable": "appsLauncherDirectoryUnreadable",
        "desktop:entryUnreadable": "appsLauncherEntryUnreadable",
        "flatpak:user:scanFailed": "appsFlatpakUserScanFailed",
        "flatpak:system:scanFailed": "appsFlatpakSystemScanFailed",
        "flatpak:invalidRecord": "appsFlatpakRecordInvalid",
        "snap:scanFailed": "appsSnapScanFailed",
        "snap:invalidRecord": "appsSnapRecordInvalid",
        "packages:ownerQueryFailed": "appsPackageOwnerQueryFailed",
        "packages:ambiguousOwner": "appsPackageOwnerAmbiguous",
        "packages:invalidOwner": "appsPackageOwnerInvalid",
        "packages:verificationFailed": "appsPackageVerificationFailed"
    })
    function messageKey(code) { return messageKeys[code] || "appsUninstallUnknown" }
    function message(code) { return t(messageKey(code)) }
    function source(row) { return row ? message(row.source === "flatpak" ? "flatpak_" + row.scope : "source_" + row.source) : "" }
    function consequence(row) { return row ? message("effect_" + (row.source === "flatpak" ? "flatpak_" + row.scope : row.source)) : "" }
    function allowed(row) { return !!(row && removalService && !busy && removalService.inventoryComplete && !removalService.operationUnverified && row.canUninstall) }
    function requestRemoval() {
        if (!canRemove) return
        pending = Object.assign({}, selected)
        confirm.openFrom(uninstallButton)
    }
    function confirmRemoval() {
        const current = apps.find(row => pending && row.id === pending.id)
        if (!allowed(current) || JSON.stringify(current) !== JSON.stringify(pending)) { confirm.close(); pending = null; return }
        const id = pending.id, authorize = pending.requiresAuthorization === true
        confirm.close(); pending = null
        removalService.uninstall(id, authorize)
    }
    function scan(announce) { if (removalService && !busy) { scanning = true; announceScan = announce === true; removalService.inventory() } }
    Component.onCompleted: scan()
    onFilteredChanged: if (selectedID && !filtered.some(row => row.id === selectedID)) selectedID = ""
    Connections {
        target: root.removalService
        function onFinished(value) {
            root.result = value
            if (root.scanning) {
                if (root.announceScan && value.status === "scanned")
                    root.notification(root.message("scanned"), false, "success", null)
            } else if (root.resultText && (value.status !== "inventoryIncomplete" || value.id)) {
                root.notification(root.resultText, !root.verified, root.verified ? "success" : "danger", "apps-result")
            }
            root.scanning = false
            root.announceScan = false
        }
    }
    component ResultMessage: Label {
        Accessible.role: Accessible.AlertMessage
        readonly property string announcement: visible && !root.scanning ? text : ""
        onAnnouncementChanged: if (announcement) Accessible.announce(announcement)
        wrapMode: Text.Wrap; Layout.fillWidth: true
    }
    ColumnLayout {
        anchors.fill: parent; anchors.margins: root.metrics.large; spacing: root.metrics.inset
        Kit.PageIntro { title: root.t("appsTitle"); subtitle: root.t("appsUninstallIntro"); Layout.fillWidth: true }
        Label { text: root.t("appsDataCleanupPlatformHint"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Kit.Card {
            Accessible.name: root.t("appsUninstall")
            visible: root.removalBusy || !!root.removalService?.operationUnverified || root.trashUndo || !!inventoryErrors.text
            Layout.fillWidth: true
            ColumnLayout {
                width: parent.width
                ResultMessage { objectName: "apps-result"; visible: root.removalBusy; text: root.t("running"); Accessible.name: text }
                ResultMessage { objectName: "apps-unverified"; visible: !!root.removalService?.operationUnverified; text: root.message("operationUnverified") }
                ResultMessage { objectName: "apps-trash-undo"; visible: root.trashUndo; text: root.message("trashUndo") }
                Label { id: inventoryErrors; objectName: "apps-errors"; Accessible.role: Accessible.AlertMessage; visible: !!text; text: (root.removalService?.errors || []).map(code => root.message(code)).join("\n"); wrapMode: Text.Wrap; Layout.fillWidth: true }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Kit.SearchField { objectName: "apps-search"; text: root.query; onTextChanged: root.query = text; placeholderText: root.t("searchLabel"); Accessible.name: placeholderText; Layout.fillWidth: true; enabled: !root.busy }
            Kit.IconButton { objectName: "apps-refresh"; iconName: "refresh"; text: root.t("refresh"); enabled: !!root.removalService && !root.busy; onClicked: root.scan(true); ToolTip.visible: hovered && !confirm.opened }
            BusyIndicator { objectName: "apps-busy"; Accessible.name: root.t(root.scanning ? "refresh" : "appsUninstall"); running: root.busy; visible: running; implicitWidth: root.metrics.control; implicitHeight: root.metrics.control }
        }
        GridLayout {
            id: split
            columns: width >= root.metrics.reading ? 2 : 1
            Layout.fillWidth: true; Layout.fillHeight: true; columnSpacing: root.metrics.gutter
            ListView {
                id: inventory
                objectName: "apps-inventory"
                visible: split.columns === 2 || !root.selected
                Layout.preferredWidth: root.metrics.sidebar + root.metrics.large * 2
                Layout.fillWidth: true; Layout.fillHeight: true
                clip: true; spacing: root.metrics.tight; model: root.filtered
                activeFocusOnTab: true
                keyNavigationEnabled: true
                Accessible.role: Accessible.List
                Accessible.name: root.t("apps")
                function choose(index) {
                    if (root.busy || index < 0 || index >= count) return
                    currentIndex = index
                    root.selectedID = model[index].id
                    if (split.columns === 1) backButton.forceActiveFocus(Qt.TabFocusReason)
                }
                Keys.onReturnPressed: choose(currentIndex)
                Keys.onEnterPressed: choose(currentIndex)
                Keys.onSpacePressed: choose(currentIndex)
                ScrollBar.vertical: ScrollBar { Accessible.name: root.t("apps"); policy: inventory.contentHeight > inventory.height ? ScrollBar.AlwaysOn : ScrollBar.AsNeeded }
                delegate: ItemDelegate {
                    id: row
                    required property var modelData
                    required property int index
                    focusPolicy: Qt.NoFocus
                    width: ListView.view.width
                    // Qt 6.8 Fluent disabled ItemDelegate references a missing verticalOffset.
                    topPadding: root.metrics.small; bottomPadding: root.metrics.small
                    leftPadding: root.metrics.gap; rightPadding: root.metrics.gap
                    implicitHeight: Math.max(root.metrics.navControl + root.metrics.small, contentItem.implicitHeight + topPadding + bottomPadding)
                    enabled: !root.busy; highlighted: root.selectedID === modelData.id
                    Accessible.role: Accessible.ListItem; Accessible.selectable: true; Accessible.name: modelData.name; Accessible.selected: highlighted
                    background: Rectangle { radius: root.metrics.radius; color: row.highlighted ? row.palette.alternateBase : "transparent"; border.width: inventory.activeFocus && row.ListView.isCurrentItem ? root.metrics.focusRingWidth : 0; border.color: row.palette.highlight }
                    contentItem: RowLayout {
                        IconImage { color: row.enabled ? row.palette.text : row.palette.disabled.text; source: "icons/apps.svg"; sourceSize.width: root.metrics.icon; sourceSize.height: root.metrics.icon; Accessible.ignored: true }
                        ColumnLayout {
                            Layout.fillWidth: true; spacing: root.metrics.tight
                            Label { text: row.modelData.name; font.bold: row.highlighted; elide: Text.ElideRight; Layout.fillWidth: true }
                            Label { text: [row.modelData.version, root.source(row.modelData)].filter(Boolean).join(" · "); color: palette.placeholderText; elide: Text.ElideRight; Layout.fillWidth: true }
                        }
                    }
                    onClicked: inventory.choose(index)
                }
                EmptyState { anchors.fill: parent; visible: !root.filtered.length && !root.busy; heading: root.t("appsEmpty"); detail: root.t("appsEmptyHint"); metrics: root.metrics }
            }
            NamedScrollView {
                scrollName: root.selected?.name || root.t("apps")
                id: details
                objectName: "apps-details"
                visible: split.columns === 2 || !!root.selected
                Layout.preferredWidth: root.metrics.reading; Layout.fillWidth: true; Layout.fillHeight: true
                contentWidth: availableWidth
                ColumnLayout {
                    width: details.availableWidth; spacing: root.metrics.inset; visible: !!root.selected
                    Kit.GlassButton { id: backButton; objectName: "apps-back"; icon.source: "icons/back.svg"; visible: split.columns === 1; text: root.t("apps"); enabled: !root.busy; onClicked: { root.selectedID = ""; inventory.forceActiveFocus(Qt.TabFocusReason) } }
                    Label { Accessible.role: Accessible.Heading; text: root.selected?.name || ""; font.bold: true; font.pointSize: Qt.application.font.pointSize * root.metrics.titleScale; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Label { text: [root.selected?.version, root.selected?.publisher].filter(Boolean).join(" · "); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Kit.Card {
                        Accessible.name: root.selected?.name || root.t("apps")
                        Layout.fillWidth: true
                        ColumnLayout {
                            width: parent.width; spacing: root.metrics.small
                            Kit.CardRow { title: root.t("installSource"); detail: root.source(root.selected) }
                            Label { text: root.selected?.installLocation || ""; visible: !!text; wrapMode: Text.WrapAnywhere; Layout.fillWidth: true; font.family: "monospace" }
                            Label { text: root.selected?.estimatedBytes ? root.tpl("appsEstimatedSize", {size: (root.selected.estimatedBytes / 1048576).toLocaleString(Qt.locale(root.bridge.locale), 'f', 1)}) : ""; visible: !!text; Layout.fillWidth: true; wrapMode: Text.Wrap }
                            Label { text: root.consequence(root.selected); wrapMode: Text.Wrap; Layout.fillWidth: true }
                            Label { objectName: "apps-blocked"; Accessible.role: Accessible.AlertMessage; text: !root.removalService?.inventoryComplete ? root.message("inventoryIncomplete") : root.selected?.reason ? root.message(root.selected.reason) : ""; visible: !!text; wrapMode: Text.Wrap; Layout.fillWidth: true }
                            Kit.GlassButton { id: uninstallButton; objectName: "apps-uninstall"; palette.buttonText: enabled ? root.colors.danger : root.colors["text-disabled"]; text: root.t(root.selected?.source === "appimage" ? "appUninstall" : "appsUninstall"); visible: root.selected?.action !== "openSettings"; enabled: root.canRemove; popupOpen: confirm.visible; onClicked: root.requestRemoval() }
                            Kit.GlassButton { objectName: "apps-settings"; text: root.t("openSystemSettings"); visible: root.selected?.action === "openSettings"; enabled: !root.busy; onClicked: if (root.selected?.action === "openSettings" && !root.busy) root.openSettings() }
                        }
                    }
                }
            }
        }
    }
    GlassDialog {
        id: confirm
        objectName: "apps-confirm"
        parent: Overlay.overlay
        modal: true; focus: true; closePolicy: Popup.CloseOnEscape
        title: root.tpl("appsUninstallConfirm", {name: root.pending?.name || ""})
        preferredDialogWidth: 440 // Width of the uninstall confirmation in Apps-States.
        initialFocusItem: cancel
        onClosed: root.pending = null
        contentItem: Label { text: root.consequence(root.pending); wrapMode: Text.Wrap; Accessible.name: text }
        footer: DialogButtonBox {
            background: Item {}
            Kit.GlassButton { id: cancel; objectName: "apps-confirm-cancel"; text: root.t("cancel"); DialogButtonBox.buttonRole: DialogButtonBox.RejectRole; onClicked: confirm.close() }
            Kit.GlassButton {
                id: removeButton
                glassMaterial: false
                objectName: "apps-confirm-remove"
                text: root.t(root.pending?.source === "appimage" ? "appUninstall" : "appsUninstall")
                enabled: root.allowed(root.pending)
                DialogButtonBox.buttonRole: DialogButtonBox.DestructiveRole
                readonly property bool dark: root.bridge.appearance?.mode === "dark" || (root.bridge.appearance?.mode === "system" && Qt.styleHints.colorScheme === Qt.Dark)
                readonly property var colors: root.bridge.palettes[dark ? "dark" : "light"]
                background: Rectangle { radius: height / 2; color: removeButton.enabled ? removeButton.colors.danger : removeButton.palette.disabled.button; border.width: removeButton.visualFocus ? root.metrics.focusRingWidth : 0; border.color: removeButton.palette.highlight }
                contentItem: Label { text: removeButton.text; color: removeButton.enabled ? removeButton.palette.highlightedText : removeButton.palette.disabled.buttonText; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                onClicked: root.confirmRemoval()
            }
        }
    }
}
