import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs

ScrollView {
    id: root
    required property var bridge
    required property var session
    readonly property var image: (session.images || [])[0]
    readonly property var task: bridge.state.tasks.find(value => value.request.sessionID === session.id && value.request.revision === session.revision)
    readonly property var resultImage: session.messages.filter(value => value.role === "assistant").slice(-1)[0]?.images?.[0]
    readonly property bool complete: !!task && task.status === "succeeded"
    readonly property string translated: visible && image && complete && !resultImage ? bridge.translatedImage(image, session.output) : ""
    function t(key) { return bridge.resources.locales[bridge.state.locale][key] || key }
    contentWidth: availableWidth
    ColumnLayout {
        width: root.availableWidth
        spacing: root.bridge.resources.metrics.small
        Image {
            Layout.fillWidth: true
            Layout.preferredHeight: width * (sourceSize.width > 0 ? sourceSize.height / sourceSize.width : 1)
            source: root.complete && root.resultImage ? "image://attachments/" + root.resultImage.id : root.translated || (root.image ? "image://attachments/" + root.image.id : "")
            fillMode: Image.PreserveAspectFit
            Accessible.name: root.t(root.complete ? "result" : "source")
        }
        Label {
            visible: root.complete || !!root.session.output
            text: !root.complete ? root.bridge.imageTranslationText(root.session.output) : (root.translated || root.resultImage) ? (root.bridge.imageTranslationText(root.session.output) || root.t("imageNoText")) : root.t("imageError")
            textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true
        }
        Button { text: root.t("exportImage"); visible: root.complete; enabled: !!root.translated || !!root.resultImage; onClicked: { save.image = root.image; save.renderedImage = root.resultImage; save.output = root.session.output; save.open() } }
    }
    FileDialog {
        id: save
        property var image
        property var renderedImage
        property string output
        fileMode: FileDialog.SaveFile
        nameFilters: renderedImage?.mime === "image/jpeg" ? ["JPEG (*.jpg)"] : renderedImage?.mime === "image/webp" ? ["WebP (*.webp)"] : renderedImage?.mime === "image/gif" ? ["GIF (*.gif)"] : ["PNG (*.png)"]
        defaultSuffix: renderedImage?.mime === "image/jpeg" ? "jpg" : renderedImage?.mime === "image/webp" ? "webp" : renderedImage?.mime === "image/gif" ? "gif" : "png"
        onAccepted: renderedImage ? root.bridge.exportImage(selectedFile, renderedImage) : root.bridge.exportTranslatedImage(selectedFile, image, output)
    }
}
