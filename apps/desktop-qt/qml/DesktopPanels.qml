import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

AuxiliaryWindow {
    id: panel
    objectName: "quick-panel"
    signal openMainRequested(string sessionID)
    signal openRouteRequested(string route)
    signal launcherRequested()
    readonly property var desktop: bridge.desktopIntegration
    property string mode: "quickChat"
    property bool quickAI: false
    property string ownerID: ""
    property string chatID: ""
    property string feedback: ""
    readonly property var session: bridge.state.sessions.find(value => value.id === ownerID)
    readonly property var task: bridge.state.tasks.find(value => value.request.sessionID === ownerID && value.status === "running")
    readonly property var latestTask: bridge.state.tasks.find(value => value.request.sessionID === ownerID)
    readonly property bool translating: mode === "translateSelection"
    readonly property bool tooLong: translating && (session?.draft || "").length > 5000
    readonly property bool missingModel: { bridge.localModels; const available = bridge.availability(session?.model || ""); return bridge.providersEmpty || (available !== "available" && available !== "unknown") }
    readonly property string errorCode: latestTask?.status === "failed" ? latestTask.errorCode || "providerError" : ""
    readonly property string answer: translating ? session?.output || "" : (session?.messages || []).filter(value => value.role === "assistant").slice(-1)[0]?.text || ""
    readonly property bool canSubmit: !!session && !task && !tooLong && !missingModel && !!session.draft.trim()
    readonly property bool canRetry: !!latestTask && !task && !tooLong && !missingModel && latestTask.request.revision === session?.revision && (latestTask.status === "failed" || latestTask.status === "cancelled" || (latestTask.status === "succeeded" && !translating))
    readonly property bool canReplace: translating && !task && !!answer && desktop.canReplaceSelection && latestTask?.status === "succeeded" && latestTask.request.revision === session?.revision
    width: translating ? metrics.sidebar + metrics.composerMinimum : metrics.dialog - metrics.navControl * 2
    height: translating ? metrics.dialog - metrics.navControl : metrics.dialog
    minimumWidth: metrics.sidebar + metrics.composerMinimum
    minimumHeight: metrics.editor * 2
    flags: Qt.Tool | Qt.WindowStaysOnTopHint | Qt.WindowCloseButtonHint | Qt.WindowTitleHint
    title: t(mode)
    onOwnerIDChanged: { feedback = ""; modelMenu.close() }
    onActiveChanged: if (quickAI && !active && visible && !modelMenu.visible) hide()
    function command(name, values) { bridge.command(name, Object.assign({sessionID: ownerID}, values || {})) }
    function ensureChat() {
        if (!chatID || !bridge.state.sessions.some(value => value.id === chatID && !value.archived)) chatID = bridge.createDetachedSession("chat", "")
        ownerID = chatID
    }
    function ask(text) {
        mode = "quickChat"; quickAI = true; ensureChat()
        if (text.trim()) { command("draft", {value: text}); if (canSubmit) command("submit") }
        show(); raise(); requestActivate(); quickDraft.forceActiveFocus()
    }
    function activate(action, selectedText) {
        if (!bridge.moduleEnabled(action === "launcher" ? "utilities" : action === "quickChat" ? "chat" : "translate")) return
        if (action === "launcher") { launcherRequested(); return }
        mode = action; quickAI = false; feedback = ""
        if (translating) {
            ownerID = bridge.createDetachedSession("translate", selectedText)
            if (selectedText.trim()) {
                command("pair", {source: "auto", target: bridge.quickTranslateTarget(selectedText)})
                if (canSubmit) command("submit")
            }
        } else ensureChat()
        show(); raise(); requestActivate(); quickDraft.forceActiveFocus()
    }
    function newChat() { if (task) return; chatID = bridge.createDetachedSession("chat", ""); ownerID = chatID; quickDraft.forceActiveFocus() }
    Shortcut { sequence: "Ctrl+N"; enabled: panel.quickAI && !quickDraft.inputMethodComposing; onActivated: panel.newChat() }
    function openMain() { if (ownerID) { openMainRequested(ownerID); hide() } }
    function configure() { hide(); openRouteRequested("settings") }
    function copyAnswer() { if (answer) { bridge.copy(answer); feedback = t("copied"); feedbackTimer.restart() } }
    function retry() { if (canRetry) command("retry", {taskID: latestTask.id}) }
    Connections { target: panel.desktop; function onActivated(action, selectedText) { panel.activate(action, selectedText) } }
    Timer { id: feedbackTimer; interval: panel.metrics.toastSeconds * 1000; onTriggered: panel.feedback = "" }
    Shortcut { sequence: "Escape"; enabled: !quickDraft.inputMethodComposing && !modelMenu.visible; onActivated: panel.hide() }

    ColumnLayout {
        anchors.fill: parent; anchors.margins: panel.metrics.inset; spacing: panel.metrics.small
        RowLayout {
            visible: !panel.quickAI
            Layout.fillWidth: true
            Kit.QuietButton { visible: panel.quickAI; text: panel.t("launcher_back"); onClicked: { panel.hide(); panel.launcherRequested() } }
            Label {
                Layout.fillWidth: true; font.bold: true; elide: Text.ElideRight; textFormat: Text.PlainText
                text: panel.translating ? panel.tpl("quickResultTitle", {lang: panel.t("lang_" + (panel.session?.target || "vi"))}) : panel.quickAI ? panel.t("launcher_ai") : panel.session?.title || panel.t("quickChat")
            }
            Kit.StatusBadge { visible: !panel.translating && !panel.quickAI; text: panel.t("chat"); idle: true }
            Kit.IconButton { iconName: "open"; text: panel.t(panel.translating ? "openInTranslate" : "ai_chat_popup_open_in_chat"); onClicked: panel.openMain() }
            Kit.IconButton { iconName: "close"; text: panel.t("close"); onClicked: panel.hide() }
        }
        // One composer, anchored above the transcript for Quick AI and below it for quick chat.
        Item {
            Layout.fillWidth: true; Layout.fillHeight: true
            Pane {
                id: composer
                objectName: "quick-composer"
                anchors.left: parent.left; anchors.right: parent.right
                // Switching both vertical anchors can transiently stretch the item and
                // leave its explicit height behind. Keep one height and move its y.
                y: panel.quickAI ? 0 : parent.height - height
                visible: !panel.translating || (!panel.task && !panel.answer)
                height: visible ? Math.min(parent.height * panel.metrics.inventorySplit, composerContent.implicitHeight + padding * 2) : 0
                padding: panel.metrics.small
                background: Kit.ReadingPanelSurface { radius: panel.metrics.chromeCardRadius }
                GridLayout {
                    id: composerContent; anchors.fill: parent
                    columns: panel.quickAI ? 3 : 1; columnSpacing: panel.metrics.tight; rowSpacing: panel.metrics.tight
                    RowLayout {
                        visible: panel.quickAI
                        Kit.IconButton { iconName: "back"; text: panel.t("launcher_back"); onClicked: { panel.hide(); panel.launcherRequested() } }
                        Kit.IconButton { iconName: "new"; text: panel.tpl("ai_chat_popup_new_conversation", {shortcut:"Ctrl+N"}); enabled: !panel.task; onClicked: panel.newChat() }
                    }
                    ScrollView {
                        id: draftScroll
                        Layout.fillWidth: true; Layout.fillHeight: true
                        Layout.preferredHeight: Math.min(panel.metrics.editor, Math.max(panel.metrics.navControl, quickDraft.contentHeight + panel.metrics.small * 2))
                        contentWidth: availableWidth
                        ScrollBar.vertical.policy: quickDraft.contentHeight > availableHeight ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
                        TextArea {
                            id: quickDraft; objectName: "quick-draft"
                            text: panel.session?.draft || ""
                            onTextChanged: if (panel.session && text !== panel.session.draft) panel.command("draft", {value: text})
                            placeholderText: panel.t(panel.translating ? "source" : "ai_chat_popup_placeholder")
                            Accessible.name: placeholderText
                            wrapMode: TextEdit.Wrap; selectByMouse: true; textFormat: TextEdit.PlainText
                            padding: panel.metrics.small
                            background: null
                            function sendKey(event) {
                                if (inputMethodComposing) { event.accepted = false; return }
                                if (event.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) {
                                    event.accepted = true; if (panel.canSubmit) panel.command("submit")
                                } else event.accepted = false
                            }
                            Keys.onReturnPressed: event => sendKey(event)
                            Keys.onEnterPressed: event => sendKey(event)
                        }
                    }
                    RowLayout {
                        Layout.fillWidth: !panel.quickAI
                        Kit.QuietButton {
                            id: modelButton; objectName: "quick-model"; visible: !panel.quickAI
                            text: panel.bridge.shortModelName(panel.session?.model || "") || panel.t("model")
                            Layout.fillWidth: true
                            enabled: !panel.task
                            ToolTip.visible: hovered && !modelMenu.visible; ToolTip.text: text
                            onClicked: modelMenu.open()
                        }
                        Kit.IconButton { visible: !panel.quickAI; iconName: "copy"; text: panel.t("copy"); enabled: !!panel.answer; onClicked: panel.copyAnswer() }
                        Kit.PrimaryButton { objectName: "quick-send"; visible: !panel.task; text: panel.t(panel.translating ? "translate" : "send"); enabled: panel.canSubmit; onClicked: panel.command("submit") }
                        SettingsDangerButton { objectName: "quick-stop"; visible: !!panel.task; text: panel.t("stop"); onClicked: panel.command("cancel", {taskID: panel.task.id}) }
                    }
                }
            }
            ScrollView {
                id: bodyScroll
                anchors.left: parent.left; anchors.right: parent.right
                y: panel.quickAI ? composer.height + panel.metrics.gap : 0
                height: Math.max(0, parent.height - composer.height - panel.metrics.gap)
                contentWidth: availableWidth
                ScrollBar.vertical.policy: body.implicitHeight > availableHeight ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
                ColumnLayout {
                    id: body; width: bodyScroll.availableWidth; spacing: panel.metrics.small
                    Label { visible: panel.missingModel && !panel.translating; text: panel.t("ai_chat_popup_short_label").toLocaleUpperCase(); Layout.alignment: Qt.AlignHCenter; font.bold: true }
                    PanelNotice { objectName: "quick-provider-notice"; visible: panel.missingModel; text: panel.t("noProviderNotice"); danger: true; bridge: panel.bridge; Layout.fillWidth: true }
                    Kit.PrimaryButton { visible: panel.missingModel; text: panel.t("quickOpenSettings"); Layout.alignment: Qt.AlignHCenter; onClicked: panel.configure() }
                    Label { visible: !panel.missingModel && !panel.translating && !(panel.session?.messages || []).length; text: panel.t("ai_chat_popup_empty_desc"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Repeater {
                        model: panel.translating ? [] : panel.session?.messages || []
                        delegate: Pane {
                            required property var modelData
                            Layout.fillWidth: true; padding: panel.metrics.small
                            background: Kit.FlatCard { visible: panel.quickAI || modelData.role === "user" }
                            contentItem: ColumnLayout {
                                Label { text: modelData.role === "user" ? panel.t("ai_chat_popup_question_badge") : "Viezan"; color: panel.colors["text-muted"]; font.bold: true }
                                TextArea { text: modelData.text; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; textFormat: TextEdit.PlainText; Layout.fillWidth: true; padding: 0; background: null }
                            }
                        }
                    }
                    TextArea { visible: panel.translating && !!panel.answer; text: panel.answer; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; textFormat: TextEdit.PlainText; Layout.fillWidth: true; background: null }
                    Kit.StatusBadge { objectName: "quick-thinking"; visible: !!panel.task; text: panel.translating ? panel.tpl("quickTranslating", {lang: panel.t("lang_" + (panel.session?.target || "vi"))}) : panel.t("quickThinking") }
                    ColumnLayout {
                        visible: !!panel.task && !panel.answer; Layout.fillWidth: true; spacing: panel.metrics.small
                        Accessible.ignored: true
                        Repeater {
                            model: [1, 1, panel.metrics.skeletonShort]
                            Rectangle { required property real modelData; Layout.fillWidth: true; Layout.maximumWidth: body.width * modelData; implicitHeight: panel.metrics.small; radius: panel.metrics.tight; color: Qt.alpha(panel.colors["text-muted"], panel.metrics.selectionOpacity) }
                        }
                    }
                    PanelNotice { objectName: "quick-error"; visible: !!panel.errorCode; text: panel.t(panel.errorCode); danger: true; bridge: panel.bridge; Layout.fillWidth: true }
                    PanelNotice { objectName: "quick-too-long"; visible: panel.tooLong; text: panel.t("sourceTooLong"); danger: true; bridge: panel.bridge; Layout.fillWidth: true }
                    PanelNotice { objectName: "quick-selection-error"; visible: panel.translating && !!panel.desktop.error; text: panel.t(panel.desktop.error); danger: true; bridge: panel.bridge; Layout.fillWidth: true }
                    RowLayout {
                        Kit.QuietButton { visible: panel.quickAI; text: panel.t("copy"); enabled: !!panel.answer; onClicked: panel.copyAnswer() }
                        Kit.QuietButton { objectName: "quick-retry"; visible: panel.canRetry; text: panel.t(panel.translating ? "retry" : "quickRegenerate"); palette.buttonText: panel.colors.action; onClicked: panel.retry() }
                    }
                }
            }
        }
        Kit.GlassComboBox {
            visible: panel.translating; Layout.fillWidth: true
            readonly property var codes: panel.bridge.resources.nativeLanguages
            model: codes.map(value => panel.t("lang_" + value))
            currentIndex: codes.indexOf(panel.session?.target || "vi")
            Accessible.name: panel.t("outputLanguage"); enabled: !panel.task
            onActivated: panel.command("pair", {source: "auto", target: codes[currentIndex]})
        }
        Label { visible: panel.translating; text: panel.bridge.shortModelName(panel.session?.model || ""); color: panel.colors["text-muted"]; elide: Text.ElideRight; Layout.fillWidth: true }
        Label { visible: panel.translating && !panel.desktop.canReplaceSelection && !!panel.answer; text: panel.t("quickReadOnly"); wrapMode: Text.Wrap; Layout.fillWidth: true }
        Flow {
            visible: panel.translating; Layout.fillWidth: true; spacing: panel.metrics.small
            Kit.QuietButton { text: panel.t("openInTranslate"); onClicked: panel.openMain() }
            Kit.GlassButton { text: panel.t("copy"); enabled: !!panel.answer; onClicked: panel.copyAnswer() }
            Kit.PrimaryButton {
                objectName: "quick-replace"; text: panel.t("quickPaste"); enabled: panel.canReplace
                onClicked: if (panel.desktop.replaceSelection(panel.answer)) { panel.feedback = panel.t("quickReplaced"); feedbackTimer.restart() }
            }
            Kit.QuietButton { visible: panel.desktop.canUndoSelection; text: panel.t("undoSelection"); onClicked: panel.desktop.undoSelection() }
        }
        RowLayout {
            visible: panel.quickAI; Layout.fillWidth: true
            Kit.QuietButton { text: panel.bridge.shortModelName(panel.session?.model || "") || panel.t("model"); Layout.fillWidth: true; onClicked: panel.configure() }
            Label { text: panel.tpl("ai_chat_popup_turns", {count: (panel.session?.messages || []).filter(value => value.role === "user").length}); color: panel.colors["text-muted"] }
            Kit.GlassButton { text: panel.t("ai_chat_popup_open_in_chat"); onClicked: panel.openMain() }
        }
        Label { objectName: "quick-feedback"; visible: !!panel.feedback; text: panel.feedback; Accessible.role: Accessible.StaticText; Layout.fillWidth: true; wrapMode: Text.Wrap }
        Label { visible: !panel.translating; text: panel.tpl("quickKeyboardHint", {send: "Ctrl+↵", newline: "↵", close: "Esc"}); color: panel.colors["text-muted"]; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    Kit.ModelLabel { id: modelNames; visible: false }
    Popup {
        id: modelMenu; objectName: "quick-model-menu"
        parent: Overlay.overlay; popupType: Popup.Item; modal: false; focus: true
        width: Math.min(panel.metrics.sidebar + panel.metrics.editor, parent ? parent.width - panel.metrics.large : panel.width)
        height: Math.min(implicitHeight, parent ? parent.height - panel.metrics.large : panel.height)
        x: (parent.width - width) / 2; y: (parent.height - height) / 2
        padding: panel.metrics.small; closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        background: Kit.ReadingPanelSurface {}
        property string ownerID: ""
        onAboutToShow: ownerID = panel.ownerID
        onOpened: modelList.forceActiveFocus(Qt.PopupFocusReason)
        onClosed: modelButton.forceActiveFocus(Qt.PopupFocusReason)
        contentItem: ColumnLayout {
            ListView {
                id: modelList; Layout.fillWidth: true; Layout.fillHeight: true
                implicitHeight: Math.min(contentHeight, panel.metrics.editor * 2)
                model: { panel.bridge.state; panel.bridge.localModels; return modelMenu.visible ? panel.bridge.modelSections("", panel.ownerID).reduce((rows, section) => rows.concat(section.rows), []) : [] }
                clip: true; boundsBehavior: Flickable.StopAtBounds; keyNavigationEnabled: true
                ScrollBar.vertical: ScrollBar { policy: modelList.contentHeight > modelList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff }
                function choose(row) {
                    if (!row || modelMenu.ownerID !== panel.ownerID || panel.task) { modelMenu.close(); return }
                    if (row.kind === "tier") panel.bridge.applyModelTier(panel.ownerID, row.tier)
                    else if (row.kind === "setup") panel.configure()
                    else panel.command("model", {value: row.model})
                    modelMenu.close()
                }
                Keys.onReturnPressed: choose(model[currentIndex])
                Keys.onEnterPressed: choose(model[currentIndex])
                delegate: Kit.PanelRow {
                    required property var modelData
                    required property int index
                    width: modelList.width
                    text: modelData.kind === "tier" ? panel.t(({fast:"tierFast",balanced:"tierBalanced",careful:"tierCareful"})[modelData.tier]) : modelData.kind === "setup" ? (modelData.provider === "local" ? panel.t("setupLocal") : panel.tpl("setupProvider", {provider: modelNames.providerName(modelData.provider)})) : panel.bridge.shortModelName(modelData.model)
                    selected: modelData.model === panel.session?.model
                    highlighted: modelList.activeFocus && modelList.currentIndex === index
                    onClicked: modelList.choose(modelData)
                }
            }
            Kit.QuietButton { text: panel.t("quickOpenSettings"); onClicked: { modelMenu.close(); panel.configure() } }
        }
    }
}
