import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQml.Models
import QtQuick.Dialogs

Item {
    id: chat
    required property var bridge
    required property var session
    required property real readingPointSize
    readonly property var metrics: bridge.resources.metrics
    property bool preview: false
    signal notification(string text, bool error)
    signal imageExportRequested(url url, var image)
    readonly property bool glass: bridge.state.appearance?.preset === "glass"
    readonly property bool dark: bridge.state.appearance?.mode === "dark" || (bridge.state.appearance?.mode !== "light" && Qt.styleHints.colorScheme === Qt.Dark)
    readonly property var colors: bridge.resources.themePalettes[(bridge.state.appearance?.preset || "graphite") + ":" + (bridge.state.appearance?.accent || "auto")][dark ? "dark" : "light"]
    readonly property real emptyHeight: glass ? glassGreeting.implicitHeight : emptyGreeting.implicitHeight
    function tpl(key, values) { let text = t(key); for (const name in values) text = text.split("{" + name + "}").join(values[name]); return text }
    function duration(task) {
        if (!task?.started || !task?.finished) return ""
        return tpl("durationSeconds", {n: Number(Math.max(0, task.finished - task.started)).toLocaleString(Qt.locale(bridge.state.locale), 'f', 1)})
    }
    function imageCaption(images, task) {
        const first = images[0] || {}, size = first.width && first.height ? first.width + "×" + first.height : ""
        const model = (first.generator || "").split(":").slice(-1)[0]
        const name = model.startsWith("gpt-image-") ? "GPT Image " + model.slice(10) : bridge.shortModelName(first.generator || "")
        return [tpl(size ? "imagesGeneratedSize" : "imagesGenerated", {count: images.length, size: size}), name, duration(task)].filter(Boolean).join(" · ")
    }
    property bool followLatest: true
    property string selectionID: ""
    property string conversationID: ""
    property bool ready: false
    objectName: "chat-transcript"
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function reconcile() {
        if (!ready) return
        const messages = preview && session.draft ? session.messages.concat([{id: session.id + "-draft", role: "user", text: session.draft}]) : session.messages
        const sameIDs = rows.count <= messages.length && messages.slice(0, rows.count).every((item, index) => rows.get(index).messageID === item.id)
        if (conversationID !== session.id || !sameIDs) {
            conversationID = session.id; selectionID = ""; followLatest = true; rows.clear()
        }
        for (let index = 0; index < messages.length; index++) {
            const message = messages[index]
            const status = bridge.state.tasks.find(task => task.id === message.id)?.status || "noContent"
            const values = {status: status, messageID: message.id, speaker: message.role, rawBody: message.text, displayBody: glass ? (message.text || "") : ((message.images || []).map(image => image.name).join("\n") + ((message.images || []).length ? "\n" : "") + (message.text || ((message.images || []).length ? "" : t(status))))}
            if (index >= rows.count) rows.append(values)
            else for (const key of Object.keys(values)) if (rows.get(index)[key] !== values[key]) rows.setProperty(index, key, values[key])
        }
        // A route change may tear down this view before a queued reconciliation
        // finishes. Do not enqueue a method from a closing QML context.
        if (chat && chat.ready && typeof chat.settleFollow === "function") Qt.callLater(chat.settleFollow)
    }
    function settleFollow() {
        if (ready && followLatest && !selectionID && !transcript.moving && !bar.pressed) transcript.positionViewAtEnd()
    }
    function returnToLatest() {
        for (let index = 0; index < rows.count; index++) transcript.itemAtIndex(index)?.clearSelection()
        selectionID = ""; followLatest = true; transcript.positionViewAtEnd()
    }
    Component.onCompleted: { ready = true; reconcile() }
    Component.onDestruction: ready = false
    Connections { target: bridge; function onChanged() { Qt.callLater(chat.reconcile) } }
    onSessionChanged: if (ready) Qt.callLater(reconcile)
    ListModel { id: rows }
    ListView {
        id: transcript
        objectName: "chat-message-list"
        anchors.fill: parent
        clip: true
        model: rows
        boundsBehavior: Flickable.StopAtBounds
        onContentHeightChanged: Qt.callLater(chat.settleFollow)
        onHeightChanged: Qt.callLater(chat.settleFollow)
        onMovementStarted: chat.followLatest = false
        onMovementEnded: if (!chat.selectionID) chat.followLatest = atYEnd
        onContentYChanged: if ((moving || bar.pressed) && !chat.selectionID) chat.followLatest = atYEnd
        ScrollBar.vertical: ScrollBar { id: bar }
        delegate: Item {
            id: messageRow
            required property string messageID
            required property string speaker
            required property string status
            required property string rawBody
            required property string displayBody
            readonly property var task: chat.bridge.state.tasks.find(item => item.id === messageID)
            readonly property bool failed: ["failed", "cancelled", "interrupted"].includes(status)
            readonly property bool latestAnswer: chat.session.messages.slice(-1)[0]?.id === messageID
            readonly property var pictures: chat.session.messages.find(item => item.id === messageID)?.images || []
            width: transcript.width
            height: messageColumn.implicitHeight + metrics.gutter
            function clearSelection() { messageText.deselect() }
            ColumnLayout {
                id: messageColumn
                width: Math.min(messageRow.width, metrics.reading)
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: metrics.small
                Label { visible: speaker === "assistant"; text: "✦ Viezan"; color: chat.glass ? chat.colors["text-muted"] : palette.placeholderText; font.weight: chat.glass ? Font.DemiBold : Font.Normal; font.pointSize: Qt.application.font.pointSize * chat.metrics.smallScale; Layout.fillWidth: true; Accessible.ignored: true }
                Pane {
                    id: researchCard
                    readonly property var research: messageRow.task?.research
                    property bool expanded: false
                    visible: chat.glass && !!research
                    Layout.fillWidth: true
                    padding: metrics.gap
                    background: Kit.FlatCard {}
                    contentItem: ColumnLayout {
                        Kit.QuietButton { objectName: "chat-research-" + messageRow.messageID; Layout.fillWidth: true; text: researchCard.research ? chat.t("research_" + researchCard.research.phase) + " · " + (researchCard.research.cursor || 0) + "/" + (researchCard.research.queries || []).length : ""; checkable: true; checked: researchCard.expanded; onToggled: researchCard.expanded = checked }
                        GridLayout {
                            visible: researchCard.expanded
                            columns: width >= metrics.sidebar * 2 ? 2 : 1
                            Layout.fillWidth: true
                            ColumnLayout {
                                Layout.fillWidth: true
                                Repeater {
                                    model: ["analyze", "survey", "gap", "cross", "synth"]
                                    delegate: Label { required property string modelData; required property int index; text: (index + 1) + " · " + chat.t("research_" + modelData); font.bold: researchCard.research?.phase === modelData; color: researchCard.research?.phase === modelData ? chat.colors["action-text"] : chat.colors["text-muted"]; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                }
                            }
                            ColumnLayout {
                                Layout.fillWidth: true
                                Repeater { model: researchCard.research?.queries || []; delegate: Label { required property string modelData; text: modelData; wrapMode: Text.Wrap; Layout.fillWidth: true } }
                                Repeater { model: researchCard.research?.findings || []; delegate: Label { required property string modelData; text: modelData; wrapMode: Text.Wrap; Layout.fillWidth: true; color: chat.colors["text-muted"] } }
                                Label { visible: !!researchCard.research?.crossReference; text: researchCard.research?.crossReference || ""; wrapMode: Text.Wrap; Layout.fillWidth: true }
                                Kit.Eyebrow { visible: (researchCard.research?.sources || []).length > 0; text: chat.t("researchSources") }
                                Repeater {
                                    model: researchCard.research?.sources || []
                                    delegate: Kit.QuietButton {
                                        required property var modelData
                                        text: modelData.title || modelData.url || ""
                                        Layout.fillWidth: true
                                        ToolTip.visible: hovered; ToolTip.text: modelData.url || ""
                                        onClicked: if (/^https?:\/\//.test(modelData.url || "")) Qt.openUrlExternally(modelData.url)
                                    }
                                }
                            }
                        }
                    }
                }
                Repeater {
                    model: messageRow.pictures
                    delegate: GridLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        columns: chat.glass && width >= metrics.compactSidebar * 2 ? 2 : 1
                        Image {
                            source: "image://attachments/" + modelData.id
                            asynchronous: true; fillMode: Image.PreserveAspectFit
                            sourceSize.width: metrics.reading; sourceSize.height: metrics.reading
                            Layout.preferredWidth: chat.glass ? metrics.compactSidebar + metrics.small : metrics.editor
                            Layout.preferredHeight: chat.glass ? metrics.compactSidebar + metrics.small : metrics.editor
                            Layout.maximumWidth: messageColumn.width
                            Layout.fillWidth: !chat.glass
                            Accessible.name: modelData.name
                        }
                        ColumnLayout {
                            visible: chat.glass && !chat.preview
                            Layout.fillWidth: true
                            Label { visible: messageRow.speaker === "assistant"; text: chat.imageCaption(messageRow.pictures, messageRow.task); wrapMode: Text.Wrap; Layout.fillWidth: true }
                            Kit.QuietButton { objectName: "chat-copy-image-" + modelData.id; text: chat.t("copyImage"); onClicked: { const copied = chat.bridge.copyImage(modelData); chat.notification(chat.t(copied ? "copied" : "exportError"), !copied) } }
                            Kit.QuietButton { text: chat.t("saveImage"); onClicked: { saveImage.attachment = modelData; saveImage.open() } }
                            Kit.QuietButton { text: chat.t("editImage"); onClicked: chat.bridge.reuseImage(chat.session.id, modelData) }
                        }
                        RowLayout {
                            visible: !chat.glass && !chat.preview
                            Kit.GlassButton { text: chat.t("saveImage"); onClicked: { saveImage.attachment = modelData; saveImage.open() } }
                            Kit.GlassButton { text: chat.t("editImage"); onClicked: chat.bridge.reuseImage(chat.session.id, modelData) }
                        }
                    }
                }
                Label {
                    readonly property var research: messageRow.task?.research
                    visible: !chat.glass && !!research
                    text: research ? chat.t("research_" + research.phase) + (research.queries?.length ? " · " + research.cursor + "/" + research.queries.length : "") : ""
                    Layout.fillWidth: true; wrapMode: Text.Wrap
                }
                TextMetrics { id: bubbleMeasure; font: messageText.font; text: messageRow.rawBody }
                TextArea {
                    id: messageText
                    objectName: "chat-text-" + messageID
                    visible: !chat.glass || !!messageRow.displayBody
                    Layout.fillWidth: !(chat.glass && speaker === "user")
                    Layout.preferredWidth: chat.glass && speaker === "user" ? Math.min(messageColumn.width * metrics.bubbleFraction, bubbleMeasure.advanceWidth + leftPadding + rightPadding) : -1
                    Layout.alignment: speaker === "user" ? Qt.AlignRight : Qt.AlignLeft
                    Layout.leftMargin: speaker === "user" && !chat.glass ? chat.metrics.large : 0
                    leftPadding: speaker === "user" ? (chat.glass ? chat.metrics.gap + chat.metrics.hairline * 2 : chat.metrics.inset) : 0
                    rightPadding: leftPadding
                    topPadding: speaker === "user" ? (chat.glass ? chat.metrics.small + chat.metrics.hairline * 2 : chat.metrics.gap) : 0
                    bottomPadding: topPadding
                    readOnly: true
                    selectByMouse: true
                    persistentSelection: true
                    textFormat: TextEdit.PlainText
                    wrapMode: TextEdit.Wrap
                    font.pointSize: chat.readingPointSize
                    Accessible.name: t(speaker === "assistant" ? "response" : "you")
                    background: Rectangle {
                        visible: speaker === "user"
                        color: chat.glass ? chat.colors["surface-muted"] : palette.midlight
                        radius: chat.glass ? metrics.largeRadius + metrics.hairline * 2 : metrics.radius
                        bottomRightRadius: chat.glass ? metrics.small - metrics.hairline * 2 : radius
                    }
                    function updateContent() {
                        const start = selectionStart, end = selectionEnd, cursor = cursorPosition
                        const next = messageRow.displayBody
                        if (messageRow.speaker === "assistant" && messageRow.status !== "running" && start === end) { chat.bridge.renderMarkdown(textDocument, next); return }
                        if (next === text) return
                        if (next.startsWith(text)) insert(length, next.slice(text.length))
                        else text = next
                        if (end > start) select(Math.min(start, length), Math.min(end, length))
                        else cursorPosition = Math.min(cursor, length)
                    }
                    Component.onCompleted: updateContent()
                    onLinkActivated: link => chat.bridge.openLink(link)
                    onSelectedTextChanged: {
                        if (selectedText.length) { chat.selectionID = messageID; chat.followLatest = false }
                        else if (chat.selectionID === messageID) chat.selectionID = ""
                    }
                    Connections { target: messageRow; function onDisplayBodyChanged() { messageText.updateContent() } function onStatusChanged() { messageText.updateContent() } }
                }
                Repeater { model: messageRow.speaker === "assistant" && messageRow.status !== "running" ? chat.bridge.chartArtifacts(messageRow.rawBody) : []; delegate: NativeChart { required property var modelData; artifact: modelData; metrics: chat.metrics; Layout.fillWidth: true } }
                Pane {
                    objectName: "chat-failure-" + messageID
                    visible: chat.glass && messageRow.failed && !chat.preview
                    Layout.fillWidth: true
                    padding: metrics.gap
                    background: Rectangle { radius: metrics.radius; color: Qt.alpha(messageRow.status === "failed" ? chat.colors.danger : chat.colors["text-muted"], metrics.selectionOpacity); border.width: metrics.hairline; border.color: Qt.alpha(chat.colors.danger, metrics.selectionOpacity * 2) }
                    contentItem: ColumnLayout {
                        Label { text: chat.t(messageRow.status); Layout.fillWidth: true; wrapMode: Text.Wrap }
                        Label { visible: messageRow.status === "failed"; text: chat.t(messageRow.task?.errorCode || "providerError"); color: chat.colors["text-muted"]; Layout.fillWidth: true; wrapMode: Text.Wrap }
                        Label { objectName: "task-error-detail"; visible: !!messageRow.task?.errorDetail; text: messageRow.task?.errorDetail || ""; textFormat: Text.PlainText; Layout.fillWidth: true; wrapMode: Text.Wrap; color: chat.colors["text-muted"] }
                    }
                }
                Kit.StatusBadge { objectName: "chat-answering-" + messageID; visible: chat.glass && speaker === "assistant" && status === "running" && !chat.preview; text: chat.t("chatAnswering") }
                Flow {
                    visible: speaker === "assistant" && !chat.preview
                    Layout.fillWidth: true
                    spacing: metrics.tight
                    Kit.GlassButton {
                        id: copy
                        flat: true
                        glassMaterial: !chat.glass
                        objectName: "chat-copy-" + messageID
                        property bool copied: false
                        visible: rawBody.length > 0
                        text: chat.t(copied ? "copied" : "copy")
                        onClicked: { bridge.copy(rawBody); copied = true; if (chat.glass) chat.notification(chat.t("copied"), false) }
                        Connections { target: messageRow; function onRawBodyChanged() { copy.copied = false } }
                    }
                    Kit.QuietButton {
                        objectName: "chat-retry-" + messageID
                        visible: chat.glass && !!messageRow.task && messageRow.latestAnswer && status !== "running"
                        text: chat.t("retry")
                        enabled: !chat.session.archived && !chat.bridge.state.tasks.some(task => task.request.sessionID === chat.session.id && task.status === "running")
                        palette.buttonText: chat.colors["action-text"]
                        onClicked: chat.bridge.command("retry", {taskID: messageRow.messageID})
                    }
                    Label {
                        objectName: "chat-meta-" + messageID
                        visible: chat.glass && !!messageRow.task && status !== "running"
                        topPadding: metrics.tight; bottomPadding: metrics.tight; leftPadding: metrics.small; rightPadding: metrics.small
                        text: [chat.bridge.shortModelName(messageRow.task?.request.model || ""), messageRow.failed ? chat.t(messageRow.status) : messageRow.task?.usage ? chat.tpl("tokensCount", {n: (messageRow.task.usage.input || 0) + (messageRow.task.usage.output || 0)}) : "", chat.duration(messageRow.task)].filter(Boolean).join(" · ")
                        color: messageRow.status === "failed" ? chat.colors.danger : chat.colors["text-muted"]
                        font.pointSize: Qt.application.font.pointSize * metrics.captionScale
                        background: Rectangle { radius: height / 2; color: messageRow.status === "failed" ? Qt.alpha(chat.colors.danger, metrics.selectionOpacity) : chat.colors["surface-muted"] }
                        ToolTip.visible: metaHover.hovered; ToolTip.text: messageRow.task?.request.model || ""
                        HoverHandler { id: metaHover }
                    }
                }
            }
        }
    }
    // Same empty state as macOS: heading and hint, centered on the composer's axis.
    EmptyState {
        id: emptyGreeting
        visible: !chat.glass && !chat.preview && rows.count === 0
        anchors.centerIn: parent
        width: Math.min(parent.width, metrics.reading)
        heading: t("emptyChat")
        detail: t("emptyHint")
        metrics: chat.metrics
    }
    ColumnLayout {
        id: glassGreeting
        visible: chat.glass && !chat.preview && rows.count === 0
        anchors.centerIn: parent
        width: Math.min(parent.width, metrics.reading)
        spacing: metrics.gutter - metrics.tight
        Image { source: "brand.png"; sourceSize.width: metrics.hero; sourceSize.height: metrics.hero; Layout.preferredWidth: metrics.hero; Layout.preferredHeight: metrics.hero; Layout.alignment: Qt.AlignHCenter; Accessible.ignored: true }
        Label { text: chat.t("chatStart"); font.pointSize: Qt.application.font.pointSize * (chat.width < metrics.reading ? (metrics.headingScale + metrics.titleScale) / 2 : metrics.headingScale); font.weight: Font.Normal; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter; Layout.fillWidth: true }
    }
    Kit.GlassButton {
        objectName: "chat-return-latest"
        visible: !chat.followLatest && rows.count > 0
        text: t("returnLatest")
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: metrics.small
        onClicked: chat.returnToLatest()
    }
    FileDialog {
        id: saveImage
        property var attachment: ({})
        fileMode: FileDialog.SaveFile
        defaultSuffix: attachment.mime === "image/jpeg" ? "jpg" : attachment.mime === "image/webp" ? "webp" : "png"
        onAccepted: { if (chat.glass) chat.imageExportRequested(selectedFile, attachment); else chat.bridge.exportImage(selectedFile, attachment) }
    }

}
