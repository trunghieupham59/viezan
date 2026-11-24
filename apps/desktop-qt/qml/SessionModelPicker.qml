import QtQuick
import QtQuick.Controls
import QtQuick.Controls.impl
import QtQuick.Layouts

// One grouped picker serves the visible trigger in each workspace.
ColumnLayout {
    id: modelPicker
    required property var shell
    required property var bridge
    readonly property var metrics: bridge.metrics
    readonly property var session: shell.session
    readonly property bool careful: session.feature === "chat" && (session.reasoningEffort ?? (session.carefulReasoning ? "high" : "auto")) === "high"
    signal deletePromptRequested(string promptID)
    function t(key) { return shell.t(key) }
    Kit.ModelLabel { id: modelNames; visible: false }
    // Feature views share this picker without writing an interpretation choice
    // into the unrelated translation session.
    property bool glassFeature: false
    property bool featureIconOnly: false
    property bool selectionOnly: false
    property string selectedModel: shell.requestModel
    signal modelChosen(string modelID)
    signal configureRequested()
    readonly property Item modelControl: glassFeature ? featureTrigger : lineupTrigger
    function togglePanel(trigger) {
        lineup.anchorItem = trigger
        shell.showComposerPanel(lineup, trigger)
    }
    function chooseFeatureModel(id) {
        if (selectionOnly) modelChosen(id)
        else shell.command("model", {value:id})
        lineup.close()
    }
    Kit.QuietButton {
        id: featureTrigger; objectName: "feature-model-trigger"
        visible: modelPicker.glassFeature
        text: modelPicker.bridge.shortModelName(modelPicker.selectedModel) || t("model")
        Layout.maximumWidth: metrics.sidebar
        implicitHeight: metrics.compactControl
        implicitWidth: modelPicker.featureIconOnly ? metrics.compactControl : implicitContentWidth + leftPadding + rightPadding
        // Icon-only: equal side padding centres the 20 pt glyph in the 32 pt circle.
        leftPadding: modelPicker.featureIconOnly ? (metrics.compactControl - metrics.icon) / 2 : metrics.small
        rightPadding: leftPadding
        Accessible.name: t("model") + ": " + text
        ToolTip.visible: hovered && !lineup.visible; ToolTip.text: text
        contentItem: RowLayout {
            spacing: metrics.tight
            IconImage { source: "icons/reasoning.svg"; color: featureTrigger.palette.buttonText; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Accessible.ignored: true }
            Label { visible: !modelPicker.featureIconOnly; text: featureTrigger.text; elide: Text.ElideRight; Layout.fillWidth: true; color: featureTrigger.enabled ? featureTrigger.palette.buttonText : featureTrigger.palette.placeholderText; Accessible.ignored: true }
            IconImage { visible: !modelPicker.featureIconOnly; source: "icons/back.svg"; rotation: -90; color: featureTrigger.palette.placeholderText; sourceSize.width: metrics.small + metrics.tight; sourceSize.height: metrics.small + metrics.tight; Accessible.ignored: true }
        }
        // Feature views open the same searchable, grouped panel as Chat, below their trigger.
        popupOpen: lineup.visible && lineup.anchorItem === featureTrigger; onClicked: modelPicker.togglePanel(featureTrigger)
    }
    onModelControlChanged: if (lineup && lineup.visible) lineup.close()
    spacing: metrics.small
    Kit.GlassButton {
        id: lineupTrigger
        objectName: "chat-model-trigger"
        visible: !modelPicker.glassFeature
        glassMaterial: false
        flat: true
        readonly property bool iconOnly: modelPicker.shell.width < metrics.reading
        text: (modelPicker.careful ? t("tierCareful") + " · " : "") + modelPicker.bridge.shortModelName(modelPicker.selectedModel)
        implicitHeight: metrics.control
        implicitWidth: iconOnly ? metrics.control : Math.min(metrics.compactSidebar, implicitContentWidth + leftPadding + rightPadding)
        Accessible.name: t("model") + ": " + text
        ToolTip.visible: hovered && !lineup.visible; ToolTip.text: Accessible.name
        contentItem: RowLayout {
            spacing: metrics.tight
            Label { text: "✦"; color: modelPicker.shell.colors["action-text"]; Accessible.ignored: true }
            Label { objectName: "chat-lineup-label"; visible: !lineupTrigger.iconOnly; text: lineupTrigger.text; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
            Kit.Chevron { visible: !lineupTrigger.iconOnly; color: modelPicker.shell.colors["text-muted"] }
        }
        Kit.ControlLens { control: lineupTrigger; active: !modelPicker.glassFeature; quiet: true }
        popupOpen: lineup.visible && lineup.anchorItem === lineupTrigger; onClicked: modelPicker.togglePanel(lineupTrigger)
    }

    Popup {
        id: lineup
        objectName: "model-lineup-panel"
        parent: Overlay.overlay
        property string ownerID: ""
        property string query: ""
        property int selectedIndex: 0
        // Chat anchors above its composer trigger; feature views anchor below theirs.
        property Item anchorItem: lineupTrigger
        property point origin: Qt.point(0, 0)
        readonly property bool featureMode: modelPicker.glassFeature || session.feature !== "chat"
        // Reasoning tiers are a Chat choice; a selection-only caller lists chat-capable models.
        readonly property var sections: !visible ? [] : (modelPicker.selectedModel, modelPicker.bridge.historyRevision, modelPicker.bridge.catalogRevision, modelPicker.bridge.modelSections(query, ownerID))
            .filter(section => !featureMode || section.key !== "purpose")
            .map(section => !modelPicker.selectionOnly ? section : Object.assign({}, section, {rows: section.rows.filter(row => !row.model || modelPicker.bridge.chatCapable(row.model))}))
            .filter(section => section.rows.length > 0)
        readonly property var rows: {
            let result = []
            for (const section of sections) for (let i = 0; i < section.rows.length; ++i)
                result.push(Object.assign({}, section.rows[i], {section: section.key, first: i === 0}))
            return result
        }
        readonly property real roomBelow: Math.max(0, modelPicker.shell.height - origin.y - anchorItem.height - metrics.small - metrics.inset)
        readonly property real roomAbove: Math.max(0, origin.y - metrics.small - metrics.inset)
        readonly property bool opensBelow: featureMode && (roomBelow >= metrics.editor * 3 || roomBelow >= roomAbove)
        width: Math.min(metrics.sidebar + metrics.editor, modelPicker.shell.width - metrics.inset * 2)
        // Below a feature trigger the panel stops at the window edge instead of covering the trigger.
        height: Math.min(body.implicitHeight + topPadding + bottomPadding, featureMode ? (opensBelow ? roomBelow : roomAbove) : modelPicker.shell.height - metrics.inset * 2)
        x: Math.max(metrics.inset, Math.min(origin.x, modelPicker.shell.width - width - metrics.inset))
        y: opensBelow ? Math.max(metrics.inset, Math.min(origin.y + anchorItem.height + metrics.small, modelPicker.shell.height - height - metrics.inset)) : Math.max(metrics.inset, origin.y - height - metrics.small)
        padding: metrics.small
        modal: false; focus: true
        closePolicy: Popup.CloseOnPressOutside | (modelPicker.shell.composing() ? 0 : Popup.CloseOnEscape)
        background: Kit.ReadingPanelSurface {}
        onAboutToShow: { origin = anchorItem.mapToItem(parent, 0, 0); ownerID = session.id; query = "" }
        onOpened: { selectedIndex = Math.max(0, rows.findIndex(row => row.model === modelPicker.selectedModel)); lineupSearch.forceActiveFocus() }
        onAboutToHide: pinMenu.close()
        onClosed: modelPicker.shell.restoreOverlayFocus()
        onQueryChanged: selectedIndex = 0
        Connections { target: modelPicker.shell; function onSessionChanged() { if (lineup.visible && lineup.ownerID !== modelPicker.session.id) lineup.close() } }
        function groupTitle(key) { const title = ({purpose: "purposeSection", pinned: "pinnedModels", recent: "recentModels", local: "localSection", typed: "modelID"})[key]; return (title ? t(title) : modelNames.providerName(key)).toUpperCase() }
        function label(row) {
            if (row.kind === "setup") return row.provider === "local" ? t("setupLocal") : modelPicker.shell.tpl("setupProvider", {provider: modelNames.providerName(row.provider)})
            const name = modelPicker.bridge.shortModelName(row.model)
            if (row.kind === "tier") return t(({fast: "tierFast", balanced: "tierBalanced", careful: "tierCareful"})[row.tier]) + " · " + name
            return row.kind === "typed" ? t("useModelID").replace("{id}", row.model) : name
        }
        function choose(row) {
            if (!row || ownerID !== session.id) { close(); return }
            const owner = ownerID
            close()
            if (row.kind === "setup") modelPicker.shell.openSettingsSection(row.provider === "local" ? "localModels" : "providers")
            else if (row.kind === "tier") modelPicker.bridge.applyModelTier(owner, row.tier)
            else if (featureMode) modelPicker.chooseFeatureModel(row.model)
            else modelPicker.shell.command("model", {sessionID: owner, value: row.model})
        }
        readonly property var pins: visible ? modelPicker.shell.workspace.pinnedModels || [] : []
        function pinnable(row) { return row && (row.kind === "model" || row.kind === "typed") }
        function togglePin(row) {
            if (ownerID !== session.id || !pinnable(row) || !modelPicker.bridge.canPinModel(row.model)) return
            modelPicker.bridge.command("togglePinnedModel", {value: row.model})
            // Keep the provider occurrence when inserting a new group above it.
            let next = rows.findIndex(r => r.section === row.section && r.model === row.model)
            if (next < 0) next = rows.findIndex(r => pinnable(r) && r.model === row.model)
            selectedIndex = next < 0 ? Math.max(0, Math.min(selectedIndex, rows.length - 1)) : next
            lineupList.positionViewAtIndex(selectedIndex, ListView.Contain)
            lineupSearch.forceActiveFocus()
        }
        Shortcut {
            sequence: "Ctrl+P"
            enabled: lineup.visible && !pinMenu.visible && !modelPicker.shell.composing()
            onActivated: lineup.togglePin(lineup.rows[lineup.selectedIndex])
        }
        Menu {
            id: pinMenu
            objectName: "model-pin-menu"
            property var row: null
            parent: body
            popupType: Popup.Item
            onClosed: { row = null; if (lineup.opened) lineupSearch.forceActiveFocus() }
            MenuItem {
                text: t(lineup.pins.includes(pinMenu.row?.model) ? "unpinModel" : "pinModel")
                enabled: !!pinMenu.row && (lineup.pins, modelPicker.bridge.canPinModel(pinMenu.row.model))
                onTriggered: lineup.togglePin(pinMenu.row)
            }
        }
        function move(offset) { selectedIndex = Math.max(0, Math.min(rows.length - 1, selectedIndex + offset)); lineupList.positionViewAtIndex(selectedIndex, ListView.Contain) }
        ColumnLayout {
            id: body
            anchors.fill: parent
            spacing: metrics.small
            Label { text: t("appDefaultAI"); Accessible.role: Accessible.Heading; font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Kit.SearchField {
                id: lineupSearch
                objectName: "model-lineup-search"
                compact: true; Layout.fillWidth: true
                placeholderText: t("searchModels"); Accessible.name: placeholderText
                text: lineup.query; onTextChanged: lineup.query = text
                Keys.onDownPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted) lineup.move(1) }
                Keys.onUpPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted) lineup.move(-1) }
                Keys.onReturnPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted) lineup.choose(lineup.rows[lineup.selectedIndex]) }
                Keys.onEnterPressed: event => { event.accepted = !inputMethodComposing; if (event.accepted) lineup.choose(lineup.rows[lineup.selectedIndex]) }
            }
            ListView {
                id: lineupList
                objectName: "model-lineup-list"
                Accessible.role: Accessible.List
                Accessible.name: t("model")
                Layout.fillWidth: true; Layout.fillHeight: true
                Layout.preferredHeight: Math.min(contentHeight, metrics.editor * 3)
                clip: true; model: lineup.rows
                delegate: Column {
                    required property var modelData
                    required property int index
                    width: lineupList.width - (lineupScrollBar.visible ? lineupScrollBar.width : 0)
                    Kit.Eyebrow { visible: modelData.first; width: parent.width; height: visible ? metrics.compactControl : 0; leftPadding: metrics.gap; verticalAlignment: Text.AlignVCenter; text: lineup.groupTitle(modelData.section) }
                    Kit.PanelRow {
                        id: rowButton
                        readonly property bool pinnable: lineup.pinnable(modelData)
                        readonly property bool pinned: pinnable && lineup.pins.includes(modelData.model)
                        rightPadding: pinnable ? metrics.compactControl + metrics.small : metrics.gap
                        objectName: "model-lineup-row-" + index
                        width: parent.width
                        text: lineup.label(modelData)
                        detail: modelData.kind === "tier" && modelData.tier === "careful" ? t("carefulReasoning") : modelData.kind === "model" ? modelData.model.split(":").slice(1).join(":") : ""
                        selected: modelData.model === modelPicker.selectedModel && (modelData.kind !== "tier" || (modelData.tier === "careful") === modelPicker.careful)
                        highlighted: index === lineup.selectedIndex
                        Accessible.name: text + (modelData.model ? ", " + modelData.model : "")
                        Accessible.description: pinned ? t("pinnedModels") : ""
                        onClicked: lineup.choose(modelData)
                        TapHandler {
                            enabled: rowButton.pinnable
                            acceptedButtons: Qt.RightButton
                            onTapped: point => {
                                pinMenu.row = modelData
                                const p = rowButton.mapToItem(body, point.position)
                                pinMenu.popup(p.x, p.y)
                            }
                        }
                        Kit.IconButton {
                            objectName: "model-pin-" + index
                            anchors.right: parent.right; anchors.rightMargin: metrics.tight
                            anchors.verticalCenter: parent.verticalCenter
                            width: metrics.compactControl; height: width
                            visible: rowButton.pinnable && (rowButton.hovered || hovered || rowButton.highlighted || rowButton.pinned || activeFocus)
                            enabled: rowButton.pinnable && (lineup.pins, modelPicker.bridge.canPinModel(modelData.model))
                            iconName: "pin"
                            icon.color: !enabled ? palette.disabled.buttonText : rowButton.pinned ? modelPicker.shell.colors.action : palette.buttonText
                            text: rowButton.pinnable ? modelPicker.shell.tpl(rowButton.pinned ? "unpinModelNamed" : "pinModelNamed", {name: modelPicker.bridge.shortModelName(modelData.model)}) : ""
                            onClicked: lineup.togglePin(modelData)
                        }
                    }
                }
                Label { visible: !lineupList.count; anchors.centerIn: parent; text: t("noModelMatch") }
                ScrollBar.vertical: ScrollBar {
                    Accessible.name: t("model")
                    id: lineupScrollBar
                    objectName: "model-lineup-scrollbar"
                    policy: lineupList.contentHeight > lineupList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
                    palette.mid: modelPicker.shell.colors["text-muted"]; palette.dark: modelPicker.shell.colors.text
                }
            }
            Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: modelPicker.shell.colors.border }
            RowLayout {
                Kit.QuietButton { text: t("refreshModels"); enabled: !modelPicker.bridge.loadingModels; onClicked: { for (const provider of ["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"]) modelPicker.bridge.refreshModels(provider) } }
                Kit.QuietButton { text: t("configureModel"); onClicked: {
                    const feature = lineup.featureMode
                    lineup.close()
                    // Feature views keep their own configuration: the caller's panel, or the model and instructions dialog.
                    if (feature && modelPicker.selectionOnly) modelPicker.configureRequested()
                    else if (feature) { modelDialog.ownerID = session.id; modelDialog.initialModel = modelPicker.selectedModel; modelID.text = modelDialog.initialModel; instructions.text = session.systemPrompt || ""; modelDialog.open() }
                    else modelPicker.shell.openSettingsSection(["openai", "claude", "gemini"].includes(modelPicker.selectedModel.split(":")[0]) ? "providers" : "localModels") } }
            }
        }
    }
    GlassDialog {
        id: modelDialog
        objectName: "model-configuration-dialog"
        parent: Overlay.overlay
        anchors.centerIn: parent
        margins: metrics.inset
        property string ownerID: ""
        property string initialModel: ""
        title: t("appDefaultAI")
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        onAccepted: { if (modelID.text.trim() !== initialModel) modelPicker.shell.command("model", {sessionID: ownerID, value: modelID.text.trim()}); modelPicker.shell.command("systemPrompt", {sessionID: ownerID, value: instructions.text}) }
        ColumnLayout {
            TextField { id: modelID; placeholderText: t("modelID"); Accessible.name: placeholderText; Layout.fillWidth: true }
            Label { text: t("modelIDHint"); wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar + metrics.editor }
            Kit.GlassComboBox { id: savedPrompt; model: modelPicker.shell.workspace.prompts || []; textRole: "name"; Accessible.name: t("promptLibrary"); Layout.fillWidth: true; onActivated: { instructions.text = model[currentIndex].text; promptName.text = model[currentIndex].name } }
            TextField { id: promptName; placeholderText: t("promptName"); Accessible.name: placeholderText; Layout.fillWidth: true }
            RowLayout {
                Kit.GlassButton { text: t("savePrompt"); enabled: !!promptName.text.trim(); onClicked: modelPicker.shell.command("savePrompt", {name: promptName.text, text: instructions.text}) }
                Kit.GlassButton { text: t("deletePrompt"); enabled: savedPrompt.currentIndex >= 0; onClicked: modelPicker.deletePromptRequested(savedPrompt.model[savedPrompt.currentIndex].id) }
            }
            TextArea { id: instructions; placeholderText: t("systemPrompt"); Accessible.name: placeholderText; wrapMode: TextEdit.Wrap; Layout.fillWidth: true }
        }
    }
    Label { text: modelPicker.bridge.modelError ? t(modelPicker.bridge.modelError) : ""; visible: !!modelPicker.bridge.modelError; wrapMode: Text.Wrap; Layout.maximumWidth: metrics.sidebar }
}
