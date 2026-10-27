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
    property bool followLatest: true
    property string selectionID: ""
    property string conversationID: ""
    property bool ready: false
    objectName: "chat-transcript"
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    function reconcile() {
        if (!ready) return
        const messages = session.messages
        const sameIDs = rows.count <= messages.length && messages.slice(0, rows.count).every((item, index) => rows.get(index).messageID === item.id)
        if (conversationID !== session.id || !sameIDs) {
            conversationID = session.id; selectionID = ""; followLatest = true; rows.clear()
        }
        for (let index = 0; index < messages.length; index++) {
            const message = messages[index]
            const status = bridge.state.tasks.find(task => task.id === message.id)?.status || "noContent"
            const values = {status: status, messageID: message.id, speaker: message.role, rawBody: message.text, displayBody: ((message.images || []).map(image => image.name).join("\n") + ((message.images || []).length ? "\n" : "") + (message.text || ((message.images || []).length ? "" : t(status))))}
            if (index >= rows.count) rows.append(values)
            else for (const key of Object.keys(values)) if (rows.get(index)[key] !== values[key]) rows.setProperty(index, key, values[key])
        }
        Qt.callLater(settleFollow)
    }
    function settleFollow() {
        if (ready && followLatest && !selectionID && !transcript.moving && !bar.pressed) transcript.positionViewAtEnd()
    }
    function returnToLatest() {
        for (let index = 0; index < rows.count; index++) transcript.itemAtIndex(index)?.clearSelection()
        selectionID = ""; followLatest = true; transcript.positionViewAtEnd()
    }
    Component.onCompleted: { ready = true; reconcile() }
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
            width: transcript.width
            height: messageColumn.implicitHeight + metrics.gutter
            function clearSelection() { messageText.deselect() }
            ColumnLayout {
                id: messageColumn
                width: Math.min(messageRow.width, metrics.reading)
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: metrics.small
                Repeater {
                    model: chat.session.messages.find(item => item.id === messageRow.messageID)?.images || []
                    delegate: ColumnLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        Image {
                            source: "image://attachments/" + modelData.id
                            asynchronous: true; fillMode: Image.PreserveAspectFit
                            sourceSize.width: metrics.reading; sourceSize.height: metrics.reading
                            Layout.fillWidth: true; Layout.preferredHeight: metrics.editor
                            Accessible.name: modelData.name
                        }
                        RowLayout {
                            Button { text: chat.t("saveImage"); onClicked: { saveImage.attachment = modelData; saveImage.open() } }
                            Button { text: chat.t("editImage"); onClicked: chat.bridge.reuseImage(chat.session.id, modelData) }
                        }
                    }
                }
                Label { text: speaker === "assistant" ? "Viezan" : t("you"); font.bold: true; Layout.fillWidth: true }
                Label {
                    readonly property var research: chat.bridge.state.tasks.find(task => task.id === messageRow.messageID)?.research
                    visible: !!research
                    text: research ? chat.t("research_" + research.phase) + (research.queries?.length ? " · " + research.cursor + "/" + research.queries.length : "") : ""
                    Layout.fillWidth: true; wrapMode: Text.Wrap
                }
                TextArea {
                    id: messageText
                    objectName: "chat-text-" + messageID
                    Layout.fillWidth: true
                    readOnly: true
                    selectByMouse: true
                    persistentSelection: true
                    textFormat: TextEdit.PlainText
                    wrapMode: TextEdit.Wrap
                    font.pointSize: chat.readingPointSize
                    Accessible.name: t(speaker === "assistant" ? "response" : "you")
                    background: Rectangle { visible: speaker === "user"; color: palette.alternateBase; radius: metrics.radius }
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
                Button {
                    id: copy
                    objectName: "chat-copy-" + messageID
                    property bool copied: false
                    visible: speaker === "assistant" && rawBody.length > 0
                    flat: true
                    text: t(copied ? "copied" : "copyResponse")
                    Layout.alignment: Qt.AlignLeft
                    onClicked: { bridge.copy(rawBody); copied = true }
                    Connections { target: messageRow; function onRawBodyChanged() { copy.copied = false } }
                }
            }
        }
    }
    Label {
        visible: rows.count === 0
        text: t("emptyChat")
        wrapMode: Text.Wrap
        anchors.centerIn: parent
        width: Math.min(parent.width, metrics.reading)
        horizontalAlignment: Text.AlignHCenter
    }
    Button {
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
        onAccepted: chat.bridge.exportImage(selectedFile, attachment)
    }

}
