import QtQuick
import QtQuick.Controls
import QtQuick.Controls.impl
import QtQuick.Layouts

// Keep deferred popup content in a document-owned creation context. The
// ComboBox owns one delegate for its lifetime; only its appearance changes.
ColumnLayout {
    id: modelPicker
    required property var shell
    required property var bridge
    readonly property var metrics: bridge.resources.metrics
    readonly property var session: shell.session
    signal deletePromptRequested(string promptID)
    function t(key) { return shell.t(key) }
    Kit.ModelLabel { id: modelNames; visible: false }
    // Compact: borderless model menu; refresh/configure stay reachable as icons.
    property bool compact: false
    property bool glassChat: false
    // Feature views share this picker without writing an interpretation choice
    // into the unrelated translation session.
    property bool glassFeature: false
    property bool selectionOnly: false
    property string selectedModel: session.model || ""
    readonly property var featureModels: Array.from(new Set(bridge.localModels.concat([selectedModel]).filter(id => id && !id.startsWith("demo.") && (!selectionOnly || bridge.chatCapable(id)))))
    signal modelChosen(string modelID)
    signal configureRequested()
    function chooseFeatureModel(id) {
        if (selectionOnly) modelChosen(id)
        else shell.command("model", {value:id})
        featurePanel.close()
    }
    Kit.QuietButton {
        id: featureTrigger; objectName: "feature-model-trigger"
        visible: modelPicker.glassFeature
        text: modelPicker.bridge.shortModelName(modelPicker.selectedModel) || t("model")
        Layout.maximumWidth: metrics.sidebar
        Accessible.name: t("model") + ": " + text
        ToolTip.visible: hovered && !featurePanel.visible; ToolTip.text: text
        contentItem: RowLayout {
            spacing: metrics.tight
            IconImage { source: "icons/reasoning.svg"; color: featureTrigger.palette.buttonText; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Accessible.ignored: true }
            Label { text: featureTrigger.text; elide: Text.ElideRight; Layout.fillWidth: true; color: featureTrigger.enabled ? featureTrigger.palette.buttonText : featureTrigger.palette.placeholderText; Accessible.ignored: true }
            IconImage { source: "icons/back.svg"; rotation: -90; color: featureTrigger.palette.placeholderText; sourceSize.width: metrics.small + metrics.tight; sourceSize.height: metrics.small + metrics.tight; Accessible.ignored: true }
        }
        onClicked: featurePanel.openAt(featureTrigger)
    }
    Kit.AnchoredPanel {
        id: featurePanel; objectName: "feature-model-panel"; shell: modelPicker.shell
        desiredWidth: metrics.sidebar + metrics.editor
        onOpened: {
            featureList.currentIndex = Math.max(0, modelPicker.featureModels.indexOf(modelPicker.selectedModel))
            featureList.positionViewAtIndex(featureList.currentIndex, ListView.Contain)
            featureList.forceActiveFocus()
        }
        contentItem: ColumnLayout {
            spacing: metrics.small
            ListView {
                id: featureList; objectName: "feature-model-list"
                Layout.fillWidth: true; Layout.fillHeight: true
                implicitHeight: Math.min(contentHeight, metrics.editor * 2)
                clip: true; boundsBehavior: Flickable.StopAtBounds
                keyNavigationEnabled: true
                model: featurePanel.visible ? modelPicker.featureModels : []
                currentIndex: modelPicker.featureModels.indexOf(modelPicker.selectedModel)
                Keys.onReturnPressed: if (currentIndex >= 0 && currentIndex < count) modelPicker.chooseFeatureModel(modelPicker.featureModels[currentIndex])
                Keys.onEnterPressed: if (currentIndex >= 0 && currentIndex < count) modelPicker.chooseFeatureModel(modelPicker.featureModels[currentIndex])
                ScrollBar.vertical: ScrollBar { policy: featureList.contentHeight > featureList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff }
                delegate: Kit.PanelRow {
                    required property string modelData
                    required property int index
                    width: featureList.width; text: modelPicker.bridge.shortModelName(modelData)
                    selected: modelPicker.selectedModel === modelData
                    highlighted: featureList.activeFocus && featureList.currentIndex === index
                    onClicked: modelPicker.chooseFeatureModel(modelData)
                }
            }
            RowLayout {
                Kit.QuietButton { text: t("refreshModels"); enabled: !modelPicker.bridge.loadingModels; onClicked: { for (const provider of ["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"]) modelPicker.bridge.refreshModels(provider) } }
                Kit.QuietButton { text: t("configureModel"); onClicked: {
                    featurePanel.close()
                    if (modelPicker.selectionOnly) modelPicker.configureRequested()
                    else { modelDialog.ownerID = session.id; modelID.text = session.model; instructions.text = session.systemPrompt || ""; modelDialog.open() }
                } }
            }
        }
    }
    onGlassChatChanged: { modelPopup.close(); lineup.close() }
    spacing: metrics.small
    Kit.GlassButton {
        id: lineupTrigger
        objectName: "chat-model-trigger"
        visible: modelPicker.glassChat
        glassMaterial: false
        flat: true
        readonly property bool iconOnly: modelPicker.shell.width < metrics.reading
        text: (session.carefulReasoning ? t("tierCareful") + " · " : "") + modelPicker.bridge.shortModelName(session.model)
        implicitHeight: metrics.control
        implicitWidth: iconOnly ? metrics.control : Math.min(metrics.compactSidebar, implicitContentWidth + metrics.inset)
        Accessible.name: t("model") + ", " + session.model
        ToolTip.visible: hovered && !lineup.visible; ToolTip.text: session.model
        contentItem: RowLayout {
            spacing: metrics.tight
            Label { text: "✦"; color: modelPicker.shell.colors["action-text"]; Accessible.ignored: true }
            Label { objectName: "chat-lineup-label"; visible: !lineupTrigger.iconOnly; text: lineupTrigger.text; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
            Label { visible: !lineupTrigger.iconOnly; text: "⌄"; color: modelPicker.shell.colors["text-muted"]; Accessible.ignored: true }
        }
        Kit.ControlLens { control: lineupTrigger; active: modelPicker.glassChat; quiet: true }
        onClicked: modelPicker.shell.showComposerPanel(lineup, lineupTrigger)
    }
    RowLayout {
        visible: !modelPicker.glassChat && !modelPicker.glassFeature
        spacing: metrics.small
        Kit.StatusDot { visible: modelPicker.shell.modelUnavailable(session.model); tone: "failed"; failedColor: modelPicker.shell.colors.danger }
        Kit.GlassComboBox {
            id: modelCombo
            glassMaterial: !modelPicker.glassChat
            objectName: modelPicker.glassChat ? "chat-model-picker" : ""
            flat: parent.parent.compact
            implicitHeight: metrics.control
            implicitContentWidthPolicy: ComboBox.WidestText
            Layout.minimumWidth: modelPicker.glassChat ? metrics.editor : 0
            Layout.preferredWidth: modelPicker.glassChat ? metrics.compactSidebar - metrics.control - metrics.small : -1
            Layout.maximumWidth: modelPicker.glassChat ? metrics.compactSidebar - metrics.control - metrics.small : metrics.sidebar
            background: Rectangle { visible: !modelCombo.flat || modelCombo.hovered || (modelPicker.glassChat && modelCombo.visualFocus); color: modelPicker.glassChat ? Qt.alpha(modelPicker.shell.colors["surface-hover"], metrics.selectionOpacity) : modelCombo.flat ? modelPicker.shell.colors["surface-hover"] : modelPicker.shell.colors.surface; radius: modelPicker.glassChat ? height / 2 : metrics.controlRadius; border.width: (modelPicker.glassChat && modelCombo.visualFocus) || !modelCombo.flat ? metrics.hairline : 0; border.color: modelPicker.glassChat && modelCombo.visualFocus ? modelPicker.shell.palette.highlight : modelPicker.shell.colors.border }
            model: modelPicker.shell.models.map(id => ({modelID: id, label: modelPicker.shell.modelLabel(id)}))
            textRole: "label"
            valueRole: "modelID"
            ToolTip.visible: hovered; ToolTip.text: session.model
            // Qt detaches a replaced popup; restore the owner for both the
            // native style popup and the Glass popup when either is installed.
            onPopupChanged: if (popup) popup.parent = modelCombo
            currentIndex: modelPicker.shell.models.indexOf(session.model)
            Accessible.name: t("model") + ", " + session.model + (modelPicker.shell.modelUnavailable(session.model) ? ", " + t("unavailable") : "")
            onActivated: if (currentValue) modelPicker.shell.command("model", {value: currentValue})
            // Leave the native content item installed. Control setters hide
            // replaced items, so restoring their pointer alone loses text.
            Label {
                objectName: "chat-model-label"
                visible: modelPicker.glassChat
                x: modelCombo.leftPadding
                y: modelCombo.topPadding
                width: modelCombo.availableWidth
                height: modelCombo.availableHeight
                text: modelCombo.displayText
                font: modelCombo.font
                color: modelCombo.enabled ? modelPicker.shell.palette.buttonText : modelPicker.shell.colors["text-disabled"]
                leftPadding: metrics.small
                verticalAlignment: Text.AlignVCenter
                elide: Text.ElideRight
                Accessible.ignored: true
            }
            Binding { target: modelCombo.contentItem; property: "visible"; value: false; when: modelPicker.glassChat }
            // Style the existing ComboBox, retaining native keyboard selection
            // and an ID-bearing model even when discovery refreshes its labels.
            // Qt 6.8 deletes the previous delegate in setDelegate(). Keep one
            // native MenuItem delegate so a theme round trip never restores a
            // component that the ComboBox has already destroyed.
            delegate: MenuItem {
                id: modelOption
                objectName: "chat-model-option"
                required property var modelData
                required property int index
                readonly property bool selectedModel: modelData.modelID === modelPicker.shell.session.model
                width: ListView.view ? ListView.view.width : modelCombo.width
                font.weight: selectedModel ? Font.DemiBold : Font.Normal
                hoverEnabled: modelCombo.hoverEnabled
                Binding { target: modelOption; property: "implicitHeight"; value: modelPicker.metrics.navControl; when: modelPicker.glassChat }
                text: modelData.label
                highlighted: modelCombo.highlightedIndex === index
                Accessible.name: text + ", " + modelData.modelID + (modelPicker.shell.modelUnavailable(modelData.modelID) ? ", " + t("unavailable") : "")
                Accessible.selected: selectedModel
                ToolTip.visible: hovered
                ToolTip.text: modelData.modelID
                RowLayout {
                    objectName: "chat-model-option-label"
                    visible: modelPicker.glassChat
                    x: modelOption.leftPadding
                    y: modelOption.topPadding
                    width: modelOption.availableWidth
                    height: modelOption.availableHeight
                    spacing: metrics.small
                    Label { text: modelOption.text; font.weight: modelOption.selectedModel ? Font.DemiBold : Font.Normal; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                    Kit.StatusDot { visible: modelPicker.shell.modelUnavailable(modelOption.modelData.modelID); tone: "failed"; failedColor: modelPicker.shell.colors.danger }
                    Label { text: "✓"; opacity: modelOption.selectedModel ? 1 : 0; Accessible.ignored: true }
                }
                Item {
                    objectName: "chat-model-option-glass"
                    anchors.fill: parent
                    z: -1
                    visible: modelPicker.glassChat
                    Rectangle { anchors.fill: parent; visible: modelOption.hovered && !modelOption.selectedModel; radius: metrics.chromeControlRadius; color: Qt.alpha(modelPicker.shell.colors["surface-hover"], 0.36) }
                    Kit.ControlGlassSurface {
                        anchors.fill: parent
                        visible: modelOption.selectedModel
                        radius: metrics.chromeControlRadius
                    }
                    Rectangle { anchors.fill: parent; radius: metrics.chromeControlRadius; color: "transparent"; border.width: modelOption.highlighted ? metrics.hairline : 0; border.color: modelPicker.shell.palette.highlight; Accessible.ignored: true }
                }
                Binding { target: modelOption.contentItem; property: "visible"; value: false; when: modelPicker.glassChat }
                Binding { target: modelOption.background; property: "visible"; value: false; when: modelPicker.glassChat }
            }
            property Popup lensPopup: Popup {
                id: modelPopup
                objectName: "chat-model-popup"
                property string ownerID: ""
                readonly property color baseColor: Qt.tint(modelPicker.shell.palette.window, modelPicker.shell.palette.base)
                parent: modelCombo
                width: Math.min(metrics.sidebar + metrics.editor, modelPicker.shell.width - metrics.inset * 2)
                height: Math.min(contentItem.implicitHeight + padding * 2, modelPicker.shell.height - metrics.navControl * 3)
                x: Math.min(0, modelPicker.shell.width - metrics.inset - modelCombo.mapToItem(null, 0, 0).x - width)
                y: -height - metrics.small
                padding: metrics.small
                onAboutToShow: ownerID = modelPicker.shell.session.id
                Connections { target: modelPicker.shell; function onSessionChanged() { if (modelPopup.visible && modelPopup.ownerID !== modelPicker.shell.session.id) modelPopup.close() } }
                contentItem: ListView {
                    id: modelList
                    clip: true
                    implicitHeight: contentHeight
                    model: modelPopup.visible ? modelCombo.delegateModel : null
                    currentIndex: modelCombo.highlightedIndex
                    boundsBehavior: Flickable.StopAtBounds
                    ScrollBar.vertical: ScrollBar {}
                }
                background: Kit.ChromeSurface {
                    radius: metrics.chromeSurfaceRadius
                    fillColor: modelPopup.baseColor
                    illuminatedFill: true
                    fillHighlight: Qt.tint(fillColor, modelPicker.shell.colors["surface-raised"])
                    edgeColor: modelPicker.shell.colors["material-border"]
                    edgeHighlight: modelPicker.shell.colors["material-highlight"]
                }
            }
            Binding { target: modelCombo; property: "popup"; value: modelCombo.lensPopup; when: modelPicker.glassChat }
        }
        // Compact: one options control holds refresh and configuration.
        Kit.IconButton {
            id: modelOptionsButton
            glassMaterial: !modelPicker.glassChat
            objectName: modelPicker.glassChat ? "chat-model-options" : ""
            visible: parent.parent.compact
            iconName: "refresh"; text: t("configureModel")
            Kit.ControlLens { control: modelOptionsButton; active: modelPicker.glassChat; quiet: true }
            onClicked: modelOptions.open()
            Menu {
                id: modelOptions
                Repeater {
                    model: ["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"]
                    delegate: MenuItem { required property string modelData; text: t("refreshModels") + " · " + modelData; enabled: !modelPicker.bridge.loadingModels; onTriggered: modelPicker.bridge.refreshModels(modelData) }
                }
                MenuSeparator {}
                MenuItem { text: t("configureModel"); onTriggered: { modelDialog.ownerID = session.id; modelID.text = session.model; instructions.text = session.systemPrompt || ""; modelDialog.open() } }
            }
        }
        Kit.GlassButton {
            visible: !parent.parent.compact
            icon.source: "icons/refresh.svg"
            text: t("refreshModels")
            display: AbstractButton.IconOnly
            implicitHeight: metrics.control
            implicitWidth: metrics.control
            Accessible.name: text
            ToolTip.visible: hovered
            ToolTip.text: text
            enabled: !modelPicker.bridge.loadingModels
            onClicked: modelRefreshMenu.open()
            Menu {
                id: modelRefreshMenu
                Repeater {
                    model: ["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"]
                    delegate: MenuItem { required property string modelData; text: modelData; onTriggered: modelPicker.bridge.refreshModels(modelData) }
                }
            }
        }
        Kit.GlassButton { visible: !parent.parent.compact; text: t("configureModel"); icon.source: "icons/settings.svg"; display: AbstractButton.IconOnly; Accessible.name: text; ToolTip.visible: hovered; ToolTip.text: text; implicitHeight: metrics.control; implicitWidth: metrics.control; onClicked: { modelDialog.ownerID = session.id; modelID.text = session.model; instructions.text = session.systemPrompt || ""; modelDialog.open() } }
        BusyIndicator { running: modelPicker.bridge.loadingModels; visible: running; implicitWidth: metrics.control; implicitHeight: metrics.control }
    }

    Popup {
        id: lineup
        objectName: "model-lineup-panel"
        parent: Overlay.overlay
        property string ownerID: ""
        property string query: ""
        property int selectedIndex: 0
        readonly property var sections: (modelPicker.bridge.state, modelPicker.bridge.localModels, modelPicker.bridge.modelSections(query, ownerID))
        readonly property var rows: {
            let result = []
            for (const section of sections) for (let i = 0; i < section.rows.length; ++i)
                result.push(Object.assign({}, section.rows[i], {section: section.key, first: i === 0}))
            return result
        }
        width: Math.min(metrics.sidebar + metrics.editor, modelPicker.shell.width - metrics.inset * 2)
        height: Math.min(body.implicitHeight + topPadding + bottomPadding, modelPicker.shell.height - metrics.inset * 2)
        x: Math.max(metrics.inset, Math.min(lineupTrigger.mapToItem(parent, 0, 0).x, modelPicker.shell.width - width - metrics.inset))
        y: Math.max(metrics.inset, lineupTrigger.mapToItem(parent, 0, 0).y - height - metrics.small)
        padding: metrics.small
        modal: false; focus: true
        closePolicy: Popup.CloseOnPressOutside | (modelPicker.shell.composing() ? 0 : Popup.CloseOnEscape)
        background: Kit.ReadingPanelSurface {}
        onAboutToShow: { ownerID = session.id; query = ""; selectedIndex = Math.max(0, rows.findIndex(row => row.model === session.model)) }
        onOpened: lineupSearch.forceActiveFocus()
        onClosed: modelPicker.shell.restoreOverlayFocus()
        onQueryChanged: selectedIndex = 0
        Connections { target: modelPicker.shell; function onSessionChanged() { if (lineup.visible && lineup.ownerID !== modelPicker.session.id) lineup.close() } }
        function groupTitle(key) { const title = ({purpose: "purposeSection", recent: "recentModels", local: "localSection", typed: "modelID"})[key]; return (title ? t(title) : modelNames.providerName(key)).toUpperCase() }
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
            else modelPicker.shell.command("model", {sessionID: owner, value: row.model})
        }
        function move(offset) { selectedIndex = Math.max(0, Math.min(rows.length - 1, selectedIndex + offset)); lineupList.positionViewAtIndex(selectedIndex, ListView.Contain) }
        ColumnLayout {
            id: body
            anchors.fill: parent
            spacing: metrics.small
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
                Layout.fillWidth: true; Layout.fillHeight: true
                Layout.preferredHeight: Math.min(contentHeight, metrics.editor * 3)
                clip: true; model: lineup.rows
                delegate: Column {
                    required property var modelData
                    required property int index
                    width: lineupList.width - (lineupScrollBar.visible ? lineupScrollBar.width : 0)
                    Kit.Eyebrow { visible: modelData.first; width: parent.width; height: visible ? metrics.compactControl : 0; leftPadding: metrics.gap; verticalAlignment: Text.AlignVCenter; text: lineup.groupTitle(modelData.section) }
                    Kit.PanelRow {
                        objectName: "model-lineup-row-" + index
                        width: parent.width
                        text: lineup.label(modelData)
                        detail: modelData.kind === "tier" && modelData.tier === "careful" ? t("carefulReasoning") : modelData.kind === "model" ? modelData.model.split(":").slice(1).join(":") : ""
                        selected: modelData.model === session.model && (modelData.kind !== "tier" || (modelData.tier === "careful") === !!session.carefulReasoning)
                        highlighted: index === lineup.selectedIndex
                        Accessible.name: text + (modelData.model ? ", " + modelData.model : "")
                        onClicked: lineup.choose(modelData)
                    }
                }
                Label { visible: !lineupList.count; anchors.centerIn: parent; text: t("noModelMatch") }
                ScrollBar.vertical: ScrollBar {
                    id: lineupScrollBar
                    objectName: "model-lineup-scrollbar"
                    policy: lineupList.contentHeight > lineupList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
                    palette.mid: modelPicker.shell.colors["text-muted"]; palette.dark: modelPicker.shell.colors.text
                }
            }
            Rectangle { Layout.fillWidth: true; implicitHeight: metrics.hairline; color: modelPicker.shell.colors.border }
            RowLayout {
                Kit.QuietButton { text: t("refreshModels"); enabled: !modelPicker.bridge.loadingModels; onClicked: { for (const provider of ["ollama", "lmstudio", "llamacpp", "openai", "claude", "gemini"]) modelPicker.bridge.refreshModels(provider) } }
                Kit.QuietButton { text: t("configureModel"); onClicked: { lineup.close(); modelPicker.shell.openSettingsSection(session.model.startsWith("openai:") || session.model.startsWith("claude:") || session.model.startsWith("gemini:") ? "providers" : "localModels") } }
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
        title: t("configureModel")
        modal: true
        standardButtons: Dialog.Ok | Dialog.Cancel
        onAccepted: { modelPicker.shell.command("model", {sessionID: ownerID, value: modelID.text.trim()}); modelPicker.shell.command("systemPrompt", {sessionID: ownerID, value: instructions.text}) }
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
