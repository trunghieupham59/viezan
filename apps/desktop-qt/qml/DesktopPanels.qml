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
    property bool useSelectionCard: Qt.platform.os === "windows"
    property string ownerID: ""
    property string chatID: ""
    property string feedback: ""
    // A hidden panel must not convert the whole state on every change.
    readonly property var snapshot: visible || card.visible ? bridge.state : ({sessions: [], tasks: []})
    readonly property var session: snapshot.sessions.find(value => value.id === ownerID)
    readonly property string requestModel: session ? (snapshot.defaultModel, bridge.modelForNextRequest(session)) : ""
    readonly property var task: snapshot.tasks.find(value => value.request.sessionID === ownerID && value.status === "running")
    readonly property var latestTask: snapshot.tasks.find(value => value.request.sessionID === ownerID)
    readonly property bool translating: mode === "translateSelection"
    function canReviewSelection() {
        return useSelectionCard && translating && !!ownerID && !card.emptySelection && bridge.moduleEnabled("translate")
            && bridge.state.sessions.some(value => value.id === ownerID && !value.archived)
    }
    function reviewSelection() {
        if (!canReviewSelection()) return
        card.hide()
        card.reviewing = true
        if (!desktop.canUndoSelection) card.replaced = false
        card.show()
        card.raise()
        card.requestActivate()
        cardClose.forceActiveFocus(Qt.TabFocusReason)
    }
    readonly property string draftText: session?.draft || ""
    readonly property int inputLength: translating || quickAI ? bridge.graphemeCount(draftText, quickAI) : 0
    readonly property bool tooLong: translating ? inputLength > 5000 : quickAI && inputLength > 3000
    function unavailable(model) {
        const available = bridge.availability(model)
        return bridge.providersEmpty || (available !== "available" && available !== "unknown")
    }
    readonly property bool missingModel: (bridge.localModels, unavailable(requestModel))
    readonly property string errorCode: latestTask?.status === "failed" ? latestTask.errorCode || "providerError" : ""
    readonly property string answer: translating ? session?.output || "" : (session?.messages || []).filter(value => value.role === "assistant").slice(-1)[0]?.text || ""
    readonly property bool canSubmit: !!session && !task && !tooLong && !missingModel && !!session.draft.trim()
    readonly property bool canRetry: !!latestTask && !task && !tooLong && !(bridge.localModels, unavailable(latestTask.request.model))
        && latestTask.request.revision === session?.revision
        && (!quickAI || bridge.graphemeCount(latestTask.request.input || "", true) <= 3000)
        && (latestTask.status === "failed" || latestTask.status === "cancelled" || (latestTask.status === "succeeded" && !translating))
    readonly property bool canReplace: translating && !task && !!answer && desktop.canReplaceSelection && latestTask?.status === "succeeded" && latestTask.request.revision === session?.revision
    width: translating ? metrics.sidebar + metrics.composerMinimum : metrics.dialog - metrics.navControl * 2
    height: translating ? metrics.dialog - metrics.navControl : metrics.dialog
    minimumWidth: metrics.sidebar + metrics.composerMinimum
    minimumHeight: metrics.editor * 2
    flags: Qt.Tool | Qt.WindowStaysOnTopHint | Qt.WindowCloseButtonHint | Qt.WindowTitleHint
    title: t(mode)
    function messageTurns() {
        const turns = []
        for (const message of (translating ? [] : session?.messages || [])) {
            if (quickAI && message.role === "assistant" && turns.length && turns[turns.length - 1].length === 1 && turns[turns.length - 1][0].role === "user")
                turns[turns.length - 1].push(message)
            else turns.push([message])
        }
        return turns
    }
    onOwnerIDChanged: { feedback = ""; modelMenu.close() }
    onActiveChanged: if (quickAI && !active && visible && !modelMenu.visible) hide()
    function command(name, values) {
        const payload = Object.assign({sessionID: ownerID}, values || {})
        if (quickAI && (name === "submit" || name === "retry")) payload.quickAI = true
        bridge.command(name, payload)
    }
    function ensureChat() {
        if (!chatID || !bridge.state.sessions.some(value => value.id === chatID && !value.archived)) chatID = bridge.createDetachedSession("chat", "")
        ownerID = chatID
    }
    function ask(text) {
        card.hide()
        mode = "quickChat"; quickAI = true; ensureChat()
        show()
        if (text.trim()) { command("draft", {value: text}); if (canSubmit) command("submit") }
        raise(); requestActivate(); quickDraft.forceActiveFocus()
    }
    function activate(action, selectedText) {
        if (!bridge.moduleEnabled(action === "launcher" ? "utilities" : action === "quickChat" ? "chat" : "translate")) return
        card.hide()
        if (action === "launcher") { launcherRequested(); return }
        mode = action; quickAI = false; feedback = ""
        if (translating) {
            ownerID = bridge.createDetachedSession("translate", selectedText)
            if (selectedText.trim())
                command("pair", {source: "auto", target: bridge.quickTranslateTarget(selectedText)})
        } else ensureChat()
        if (translating && useSelectionCard) {
            if (visible) hide()
            card.present(selectedText)
            return
        }
        show()
        // The session used by canSubmit is available once the panel is visible.
        if (translating && canSubmit) command("submit")
        raise(); requestActivate(); quickDraft.forceActiveFocus()
    }
    function newChat() { if (task) return; chatID = bridge.createDetachedSession("chat", ""); ownerID = chatID; quickDraft.forceActiveFocus() }
    Shortcut { sequence: "Ctrl+N"; enabled: panel.quickAI && !quickDraft.inputMethodComposing; onActivated: panel.newChat() }
    function openMain() { if (ownerID) { openMainRequested(ownerID); hide() } }
    function configure() { hide(); openRouteRequested("settings") }
    function showFeedback(message) {
        feedback = message
        feedbackTimer.restart()
        feedbackLabel.Accessible.announce(message)
    }
    function copyAnswer() { if (answer) { bridge.copy(answer); showFeedback(t("copied")) } }
    function retry() { if (canRetry) command("retry", {taskID: latestTask.id}) }
    Connections { target: panel.desktop; function onActivated(action, selectedText) { panel.activate(action, selectedText) } }
    Timer { id: feedbackTimer; interval: panel.metrics.toastSeconds * 1000; onTriggered: panel.feedback = "" }
    Shortcut { sequence: "Escape"; enabled: !quickDraft.inputMethodComposing && !modelMenu.visible; onActivated: panel.hide() }

    // An explicitly unowned window can appear above the calling app while the workbench is minimized.
    AuxiliaryWindow {
        id: card
        objectName: "selection-card"
        bridge: panel.bridge
        transientParent: null
        flags: Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | (reviewing ? 0 : Qt.WindowDoesNotAcceptFocus)
        title: panel.t("translateSelection")
        property var anchor
        property string pendingOwner: ""
        property bool replaced: false
        property bool reviewing: false
        property string replacementNotice: ""
        property bool emptySelection: false
        readonly property string language: panel.t("lang_" + (panel.session?.target || "vi"))
        readonly property string statusText: replacementNotice ? panel.t(replacementNotice)
            : replaced ? panel.t("quickReplaced") : emptySelection ? panel.t("quickNoSelection")
            : panel.tooLong ? panel.t("sourceTooLong") : panel.missingModel ? panel.t("noProviderNotice")
            : panel.errorCode ? panel.t(panel.errorCode) : panel.answer ? panel.tpl("quickResultTitle", {lang: language})
            : panel.tpl("quickTranslating", {lang: language})
        readonly property bool hasResult: !replaced && !!panel.answer && !panel.task
        width: Math.min(anchor?.area.width || metrics.dialog, hasResult ? metrics.dialog : metrics.sidebar + metrics.composerMinimum)
        height: cardBody.implicitHeight + metrics.inset * 2
        function coordinate(pointer, length, start, available) {
            const end = start + available
            const after = pointer + metrics.gap
            return Math.max(start, Math.min(end - length, after + length <= end ? after : pointer - metrics.gap - length))
        }
        x: anchor ? coordinate(anchor.pointer.x, width, anchor.area.x, anchor.area.width) : 0
        y: anchor ? coordinate(anchor.pointer.y, height, anchor.area.y, anchor.area.height) : 0
        function present(text) {
            anchor = panel.desktop.selectionCardAnchor()
            emptySelection = !text.trim()
            replaced = false
            reviewing = false
            replacementNotice = ""
            show()
            if (emptySelection) dismissTimer.restart()
            if (panel.canSubmit) {
                pendingOwner = panel.ownerID
                panel.command("submit")
            }
        }
        function replaceAnswer() {
            if (!panel.canReplace || reviewing) return
            if (panel.desktop.replaceSelection(panel.answer)) {
                replaced = true
                dismissTimer.restart()
            } else replacementNotice = panel.desktop.error || "selectionUnchanged"
        }
        function finishTranslation() {
            if (!visible || !pendingOwner || pendingOwner !== panel.ownerID || !panel.canReplace) return
            pendingOwner = ""
            replaceAnswer()
        }
        Connections { target: panel; function onCanReplaceChanged() { if (panel.canReplace) Qt.callLater(card.finishTranslation) } }
        onVisibleChanged: if (!visible) { pendingOwner = ""; dismissTimer.stop() }
        Timer {
            id: dismissTimer
            interval: card.emptySelection ? 5000 : 1500
            onTriggered: card.hide()
        }
        Shortcut { sequence: "Escape"; enabled: card.visible && card.reviewing; onActivated: card.hide() }
        ColumnLayout {
            id: cardBody
            anchors.left: parent.left; anchors.right: parent.right; anchors.top: parent.top
            anchors.margins: card.metrics.inset; spacing: card.metrics.small
            RowLayout {
                Layout.fillWidth: true
                Label {
                    objectName: "selection-card-status"
                    Layout.fillWidth: true; wrapMode: Text.Wrap; textFormat: Text.PlainText
                    text: card.statusText; font.bold: true; Accessible.role: Accessible.AlertMessage
                    onTextChanged: if (card.visible) Accessible.announce(card.statusText)
                }
                Kit.IconButton { id: cardClose; iconName: "close"; text: panel.t("close"); onClicked: card.hide() }
            }
            NamedScrollView {
                id: resultScroll
                visible: card.hasResult
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(result.implicitHeight, card.metrics.editor * 2)
                scrollName: panel.t("result"); contentWidth: availableWidth
                Label {
                    id: result
                    width: resultScroll.availableWidth; text: panel.answer; wrapMode: Text.Wrap; textFormat: Text.PlainText
                    Accessible.name: panel.t("result") + " " + text
                }
            }
            Label {
                visible: card.hasResult; Layout.fillWidth: true; elide: Text.ElideRight
                color: card.colors["text-muted"]; text: panel.bridge.shortModelName(panel.session?.model || "")
            }
            Flow {
                Layout.fillWidth: true; spacing: card.metrics.small
                visible: card.hasResult || panel.tooLong || panel.missingModel || !!panel.errorCode
                Kit.QuietButton { text: panel.t("openInTranslate"); onClicked: { card.hide(); panel.openMain() } }
                Kit.GlassButton { visible: card.hasResult; text: panel.t("copy"); onClicked: { panel.bridge.copy(panel.answer); card.hide() } }
                Kit.PrimaryButton { visible: card.hasResult && panel.canReplace && !card.replacementNotice && !card.reviewing; text: panel.t("quickPaste"); onClicked: card.replaceAnswer() }
                Kit.QuietButton { visible: panel.canRetry; text: panel.t("retry"); onClicked: panel.retry() }
            }
            Kit.QuietButton {
                visible: card.replaced && panel.desktop.canUndoSelection; text: panel.t("undoSelection")
                onClicked: {
                    dismissTimer.stop()
                    card.replaced = false
                    if (panel.desktop.undoSelection()) card.hide()
                    else card.replacementNotice = panel.desktop.error
                }
            }
        }
    }

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
                    NamedScrollView {
                        scrollName: panel.t("draft")
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
                            function moveFocus(event, forward) {
                                if (inputMethodComposing) { event.accepted = false; return }
                                nextItemInFocusChain(forward).forceActiveFocus(forward ? Qt.TabFocusReason : Qt.BacktabFocusReason)
                                event.accepted = true
                            }
                            Keys.onTabPressed: event => moveFocus(event, true)
                            Keys.onBacktabPressed: event => moveFocus(event, false)
                            Keys.onReturnPressed: event => sendKey(event)
                            Keys.onEnterPressed: event => sendKey(event)
                        }
                    }
                    RowLayout {
                        Layout.fillWidth: !panel.quickAI
                        Kit.QuietButton {
                            id: modelButton; objectName: "quick-model"; visible: !panel.quickAI
                            text: panel.bridge.shortModelName(panel.requestModel) || panel.t("model")
                            Layout.fillWidth: true
                            enabled: !panel.task
                            ToolTip.visible: hovered && !modelMenu.visible; ToolTip.text: text
                            popupOpen: modelMenu.visible
                            onClicked: modelMenu.open()
                        }
                        Kit.IconButton { visible: !panel.quickAI; iconName: "copy"; text: panel.t("copy"); enabled: !!panel.answer; onClicked: panel.copyAnswer() }
                        FocusScope {
                            id: submitActions
                            implicitWidth: panel.task ? stop.implicitWidth : send.implicitWidth
                            implicitHeight: panel.task ? stop.implicitHeight : send.implicitHeight
                            Kit.PrimaryButton {
                                id: send; objectName: "quick-send"; visible: !panel.task; focus: visible
                                text: panel.t(panel.translating ? "translate" : "send"); enabled: panel.canSubmit
                                onClicked: panel.command("submit")
                            }
                            SettingsDangerButton {
                                id: stop; objectName: "quick-stop"; visible: !!panel.task; focus: visible
                                text: panel.t("stop"); onClicked: panel.command("cancel", {taskID: panel.task.id})
                            }
                            // Submission clears the chat draft. Return to its editor if Send is still disabled.
                            Connections {
                                target: panel
                                function onTaskChanged() {
                                    if (!panel.task && submitActions.activeFocus && !send.enabled && quickDraft.visible)
                                        quickDraft.forceActiveFocus(Qt.TabFocusReason)
                                }
                            }
                        }
                    }
                }
            }
            NamedScrollView {
                scrollName: panel.t(panel.translating ? "result" : "chat")
                id: bodyScroll
                anchors.left: parent.left; anchors.right: parent.right
                y: panel.quickAI ? composer.height + panel.metrics.gap : 0
                height: Math.max(0, parent.height - composer.height - panel.metrics.gap)
                contentWidth: availableWidth
                ScrollBar.vertical.policy: body.implicitHeight > availableHeight ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
                ColumnLayout {
                    id: body; width: bodyScroll.availableWidth; spacing: panel.metrics.small
                    PanelNotice {
                        objectName: "quick-question-limit"; visible: panel.quickAI && panel.tooLong
                        text: panel.inputLength + " / 3000 · " + panel.t("ai_chat_popup_input_too_long")
                        danger: true; bridge: panel.bridge; Layout.fillWidth: true
                    }
                    Label { visible: panel.missingModel && !panel.translating; text: panel.t("ai_chat_popup_short_label").toLocaleUpperCase(); Layout.alignment: Qt.AlignHCenter; font.bold: true }
                    PanelNotice { objectName: "quick-provider-notice"; visible: panel.missingModel; text: panel.t("noProviderNotice"); danger: true; bridge: panel.bridge; Layout.fillWidth: true }
                    Kit.PrimaryButton { visible: panel.missingModel; text: panel.t("quickOpenSettings"); Layout.alignment: Qt.AlignHCenter; onClicked: panel.configure() }
                    Label { visible: !panel.missingModel && !panel.translating && !(panel.session?.messages || []).length; text: panel.t("ai_chat_popup_empty_desc"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Repeater {
                        model: panel.messageTurns()
                        delegate: Pane {
                            id: turn
                            required property var modelData
                            readonly property bool question: modelData[0].role === "user"
                            Layout.fillWidth: true
                            Layout.maximumWidth: !panel.quickAI && question ? body.width * panel.metrics.bubbleFraction : body.width
                            Layout.alignment: !panel.quickAI && question ? Qt.AlignRight : Qt.AlignLeft
                            padding: panel.metrics.small
                            background: Kit.FlatCard { visible: panel.quickAI || turn.question }
                            contentItem: ColumnLayout {
                                Repeater {
                                    model: turn.modelData
                                    delegate: ColumnLayout {
                                        required property var modelData
                                        Layout.fillWidth: true
                                        Label { text: modelData.role === "user" ? panel.t("ai_chat_popup_question_badge") : "Viezan"; color: panel.colors["text-muted"]; font.bold: true }
                                        TextArea { objectName: "quick-message-" + modelData.role; Accessible.ignored: modelData.role === "assistant" && modelData.id === panel.task?.id; Accessible.name: panel.t(modelData.role === "user" ? "you" : "response"); text: modelData.text; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; textFormat: TextEdit.PlainText; Layout.fillWidth: true; padding: 0; background: null }
                                    }
                                }
                            }
                        }
                    }
                    TextArea { objectName: "quick-result"; Accessible.ignored: !!panel.task; Accessible.name: panel.t("result"); visible: panel.translating && !!panel.answer; text: panel.answer; readOnly: true; selectByMouse: true; wrapMode: TextEdit.Wrap; textFormat: TextEdit.PlainText; Layout.fillWidth: true; background: null }
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
                    PanelNotice { objectName: "quick-too-long"; visible: panel.translating && panel.tooLong; text: panel.t("sourceTooLong"); danger: true; bridge: panel.bridge; Layout.fillWidth: true }
                    PanelNotice { objectName: "quick-selection-error"; visible: panel.translating && !!panel.desktop.error; text: panel.t(panel.desktop.error); danger: true; bridge: panel.bridge; Layout.fillWidth: true }
                    RowLayout {
                        Kit.QuietButton { visible: panel.quickAI; text: panel.t("copy"); enabled: !!panel.answer; onClicked: panel.copyAnswer() }
                        Kit.QuietButton { objectName: "quick-retry"; visible: panel.canRetry; text: panel.t(panel.translating ? "retry" : "quickRegenerate"); palette.buttonText: panel.colors.action; onClicked: panel.retry() }
                    }
                }
            }
        }
        SettingsPicker {
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
                onClicked: {
                    if (panel.desktop.replaceSelection(panel.answer)) panel.showFeedback(panel.t("quickReplaced"))
                    else if (!panel.desktop.error) panel.showFeedback(panel.t("selectionUnchanged"))
                }
            }
            Kit.QuietButton { visible: panel.desktop.canUndoSelection; text: panel.t("undoSelection"); onClicked: panel.desktop.undoSelection() }
        }
        RowLayout {
            visible: panel.quickAI; Layout.fillWidth: true
            Kit.QuietButton { id: quickAIModel; objectName: "quick-ai-model"; text: panel.bridge.shortModelName(panel.requestModel) || panel.t("model"); Accessible.name: panel.t("model") + " · " + text; Layout.fillWidth: true; enabled: !panel.task; popupOpen: modelMenu.visible; onClicked: modelMenu.open() }
            Label { text: panel.tpl("ai_chat_popup_turns", {count: (panel.session?.messages || []).filter(value => value.role === "user").length}); color: panel.colors["text-muted"] }
            Kit.GlassButton { text: panel.t("ai_chat_popup_open_in_chat"); onClicked: panel.openMain() }
        }
        Label { id: feedbackLabel; objectName: "quick-feedback"; visible: !!panel.feedback; text: panel.feedback; Accessible.role: Accessible.AlertMessage; Layout.fillWidth: true; wrapMode: Text.Wrap }
        Label { visible: !panel.translating; text: panel.tpl("quickKeyboardHint", {send: "Ctrl+↵", newline: "↵", close: "Esc"}); color: panel.colors["text-muted"]; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    Kit.ModelLabel { id: modelNames; visible: false }
    Popup {
        id: modelMenu; objectName: "quick-model-menu"
        dim: false
        parent: Overlay.overlay; popupType: Popup.Item; modal: true; focus: true
        width: Math.min(panel.metrics.sidebar + panel.metrics.editor, parent ? parent.width - panel.metrics.large : panel.width)
        height: Math.min(implicitHeight, parent ? parent.height - panel.metrics.large : panel.height)
        x: (parent.width - width) / 2; y: (parent.height - height) / 2
        padding: panel.metrics.small; closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        background: Kit.ReadingPanelSurface {}
        property string ownerID: ""
        onAboutToShow: ownerID = panel.ownerID
        onOpened: modelList.forceActiveFocus(Qt.PopupFocusReason)
        onClosed: if (panel.visible) (panel.quickAI ? quickAIModel : modelButton).forceActiveFocus(Qt.PopupFocusReason)
        contentItem: ColumnLayout {
            Label { text: panel.t("appDefaultAI"); Accessible.role: Accessible.Heading; font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
            ListView {
                id: modelList; activeFocusOnTab: true; objectName: "quick-model-list"; Accessible.role: Accessible.List; Accessible.name: panel.t("model"); Layout.fillWidth: true; Layout.fillHeight: true
                implicitHeight: Math.min(contentHeight, panel.metrics.editor * 2)
                model: { panel.snapshot; panel.bridge.localModels; return modelMenu.visible ? panel.bridge.modelSections("", panel.ownerID).reduce((rows, section) => rows.concat(section.rows), []) : [] }
                clip: true; boundsBehavior: Flickable.StopAtBounds; keyNavigationEnabled: true
                ScrollBar.vertical: ScrollBar { Accessible.name: panel.t("model"); policy: modelList.contentHeight > modelList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff }
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
                    selected: modelData.model === panel.requestModel
                    highlighted: modelList.activeFocus && modelList.currentIndex === index
                    onClicked: modelList.choose(modelData)
                }
            }
            Kit.QuietButton { text: panel.t("quickOpenSettings"); onClicked: { modelMenu.close(); panel.configure() } }
        }
    }
}
