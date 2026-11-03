import QtQuick
import QtQuick.Controls
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
    // Compact: borderless model menu; refresh/configure stay reachable as icons.
    property bool compact: false
    property bool glassChat: false
    onGlassChatChanged: if (!glassChat) modelPopup.close()
    spacing: metrics.small
    RowLayout {
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
