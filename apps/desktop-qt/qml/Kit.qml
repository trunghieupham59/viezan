import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Review 18 page vocabulary shared by the Qt workspaces: intro, eyebrow,
// bounded cards, label rows, key caps and status badges. Every value reads
// generated metrics and the palette set on the application window.
QtObject {
    component PageIntro: ColumnLayout {
        id: intro
        property string title
        property string subtitle
        readonly property var metrics: workbench.resources.metrics
        spacing: metrics.small
        Label { text: intro.title; font.bold: true; font.pointSize: Qt.application.font.pointSize * intro.metrics.headingScale; wrapMode: Text.Wrap; Layout.fillWidth: true; Accessible.role: Accessible.Heading }
        Label { visible: !!intro.subtitle; text: intro.subtitle; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    component Eyebrow: Label {
        font.bold: true
        font.capitalization: Font.AllUppercase
        font.letterSpacing: workbench.resources.metrics.hairline
        font.pointSize: Qt.application.font.pointSize * workbench.resources.metrics.captionScale
        color: palette.placeholderText
        Accessible.role: Accessible.Heading
    }
    component SectionTitle: Label {
        font.bold: true
        font.pointSize: Qt.application.font.pointSize * workbench.resources.metrics.sectionScale
        Accessible.role: Accessible.Heading
    }
    // One bounded surface: no nested frames.
    component Card: Pane {
        id: card
        property bool selected: false
        readonly property var metrics: workbench.resources.metrics
        padding: metrics.inset
        background: Rectangle {
            radius: card.metrics.radius
            color: card.selected ? Qt.tint(card.palette.base, Qt.alpha(card.palette.highlight, card.metrics.selectionOpacity)) : card.palette.base
            border.width: card.metrics.hairline
            border.color: card.selected ? card.palette.highlight : card.palette.midlight
        }
    }
    // GroupBox drawn as a Review 18 settings card: the title is a header bar inside
    // the bounded surface, separated from the rows by an edge-to-edge divider.
    component CardBox: GroupBox {
        id: box
        readonly property var metrics: workbench.resources.metrics
        readonly property real headerHeight: title ? metrics.navControl + metrics.tight : 0
        padding: metrics.inset
        topPadding: headerHeight + metrics.inset
        label: Item {
            visible: !!box.title
            width: box.width
            height: box.headerHeight
            Label { x: box.metrics.inset; width: parent.width - box.metrics.inset * 2; anchors.verticalCenter: parent.verticalCenter; text: box.title; font.bold: true; elide: Text.ElideRight; Accessible.role: Accessible.Heading }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: box.metrics.hairline; color: box.palette.midlight }
        }
        background: Rectangle {
            radius: box.metrics.radius
            color: box.palette.base
            border.width: box.metrics.hairline
            border.color: box.palette.midlight
        }
    }
    // Label row: title, optional detail, trailing controls; dividers between rows.
    component CardRow: ColumnLayout {
        id: row
        property string title
        property string detail
        property bool divider: true
        default property alias trailing: slot.data
        readonly property var metrics: workbench.resources.metrics
        spacing: 0
        Layout.fillWidth: true
        GridLayout {
            columns: row.width >= row.metrics.sidebar * 2 ? 2 : 1
            columnSpacing: row.metrics.inset
            rowSpacing: row.metrics.small
            Layout.fillWidth: true
            Layout.topMargin: row.metrics.small
            Layout.bottomMargin: row.metrics.small
            ColumnLayout {
                spacing: row.metrics.tight
                Layout.fillWidth: true
                Label { text: row.title; font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
                Label { visible: !!row.detail; text: row.detail; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
            }
            RowLayout { id: slot; Layout.fillWidth: true; spacing: row.metrics.small }
        }
        Rectangle { visible: row.divider; color: palette.midlight; implicitHeight: row.metrics.hairline; Layout.fillWidth: true }
    }
    component KeyCap: Label {
        id: cap
        readonly property var metrics: workbench.resources.metrics
        leftPadding: metrics.small
        rightPadding: metrics.small
        topPadding: metrics.tight
        bottomPadding: metrics.tight
        color: palette.placeholderText
        background: Rectangle { radius: cap.metrics.controlRadius; color: "transparent"; border.width: cap.metrics.hairline; border.color: cap.palette.mid }
    }
    // The single solid accent action of a region.
    component PrimaryButton: Button {
        id: primary
        readonly property var metrics: workbench.resources.metrics
        implicitHeight: metrics.control
        leftPadding: metrics.inset
        rightPadding: metrics.inset
        icon.color: enabled ? primary.palette.highlightedText : primary.palette.placeholderText
        contentItem: RowLayout {
            spacing: primary.metrics.small
            Image { visible: !!primary.icon.source.toString(); source: primary.icon.source; sourceSize.width: primary.metrics.icon; sourceSize.height: primary.metrics.icon; Accessible.ignored: true }
            Label { text: primary.text; color: primary.enabled ? primary.palette.highlightedText : primary.palette.placeholderText; Accessible.ignored: true }
        }
        background: Rectangle {
            radius: primary.metrics.controlRadius
            color: !primary.enabled ? primary.palette.disabled.button : primary.down ? Qt.darker(primary.palette.highlight) : primary.palette.highlight
            border.width: primary.visualFocus ? primary.metrics.hairline : 0
            border.color: primary.palette.mid
        }
        Accessible.name: text
    }
    // Quiet icon-only utility with a tooltip and accessible name.
    component IconButton: ToolButton {
        readonly property var metrics: workbench.resources.metrics
        property string iconName
        display: AbstractButton.IconOnly
        icon.source: "icons/" + iconName + ".svg"
        icon.color: palette.buttonText
        icon.width: metrics.icon
        icon.height: metrics.icon
        implicitWidth: metrics.control
        implicitHeight: metrics.control
        Accessible.name: text
        ToolTip.visible: hovered
        ToolTip.text: text
    }
    component StatusDot: Rectangle {
        property string tone: "ready"
        // The palette has no danger role; callers pass the theme's danger color.
        property color failedColor: palette.placeholderText
        implicitWidth: workbench.resources.metrics.small
        implicitHeight: implicitWidth
        radius: implicitWidth / 2
        color: tone === "ready" ? palette.highlight : tone === "failed" ? failedColor : palette.placeholderText
        Accessible.ignored: true
    }
    // Readiness at the point of action, from the bridge's provider discovery (local
    // runtimes that answer, cloud providers with a key). One quiet line; Send stays
    // enabled. Offers a model this device can run, or the settings that fix it.
    component ProviderNotice: RowLayout {
        id: notice
        property string model
        property color dangerColor: palette.placeholderText
        // availability() is a method: read the notifying snapshot properties so the binding re-evaluates.
        readonly property string availability: (workbench.localModels, workbench.providersChecked, workbench.availability(model))
        readonly property bool unavailable: availability !== "available" && availability !== "unknown"
        readonly property string preferred: workbench.preferredModel
        signal openRequested(string section)
        signal useRequested(string model)
        function t(key) { return workbench.resources.locales[workbench.state.locale][key] || key }
        readonly property string reason: t(availability === "offline" ? "modelOfflineReason" : availability === "missingKey" ? "modelMissingKeyReason" : availability === "notInstalled" ? "modelNotInstalledReason" : "modelUnsupportedReason")
        objectName: "provider-notice"
        visible: workbench.providersEmpty || unavailable
        spacing: workbench.resources.metrics.small
        Component.onCompleted: workbench.discoverIfNeeded()
        ModelLabel { id: formatter; visible: false }
        StatusDot { tone: "failed"; failedColor: notice.dangerColor }
        Label { text: workbench.providersEmpty ? notice.t("noProviderNotice") : formatter.format(notice.model) + " — " + notice.reason; color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Button { objectName: "provider-notice-check"; text: notice.t("checkAgain"); flat: true; enabled: !workbench.discovering; onClicked: workbench.discoverProviders() }
        Button {
            objectName: "provider-notice-use"
            visible: !workbench.providersEmpty && !!notice.preferred && notice.preferred !== notice.model
            text: notice.t("useModel") + " " + formatter.format(notice.preferred)
            ToolTip.visible: hovered; ToolTip.text: notice.preferred
            onClicked: notice.useRequested(notice.preferred)
        }
        Button {
            objectName: "provider-notice-open-localModels"
            visible: workbench.providersEmpty || (!(!!notice.preferred && notice.preferred !== notice.model) && notice.availability !== "missingKey")
            text: notice.t("openLocalModels"); onClicked: notice.openRequested("localModels")
        }
        Button {
            objectName: "provider-notice-open-providers"
            visible: workbench.providersEmpty || (!(!!notice.preferred && notice.preferred !== notice.model) && notice.availability === "missingKey")
            text: notice.t("openProviders"); onClicked: notice.openRequested("providers")
        }
    }
    // "provider:model" reads as "Provider · model"; demo IDs read as their names.
    // The raw ID stays in tooltips. The single formatter for every Qt view.
    component ModelLabel: Label {
        property string modelID
        function format(id) {
            if (!id) return ""
            const demo = {"demo.standard": "steady", "demo.slow": "slow", "demo.failure": "failure"}
            if (demo[id]) return workbench.resources.locales[workbench.state.locale][demo[id]] || demo[id]
            const split = id.indexOf(":")
            if (split < 0) return id
            const names = {ollama: "Ollama", lmstudio: "LM Studio", llamacpp: "llama.cpp", openai: "OpenAI", claude: "Claude", gemini: "Gemini", groq: "Groq"}
            // Cloud IDs carry a release date ("claude-haiku-4-5-20251001"); the label drops it.
            return (names[id.slice(0, split)] || id.slice(0, split)) + " · " + id.slice(split + 1).replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, "")
        }
        text: format(modelID)
    }
    // Soft accent pill for live state; the text carries the meaning.
    component StatusBadge: Pane {
        id: badge
        property string text
        // Idle reads neutral (not running, not granted); the text, not only the color, carries meaning.
        property bool idle: false
        readonly property var metrics: workbench.resources.metrics
        leftPadding: metrics.small + metrics.tight
        rightPadding: leftPadding
        topPadding: metrics.tight
        bottomPadding: metrics.tight
        background: Rectangle { radius: height / 2; color: Qt.tint(badge.palette.base, Qt.alpha(badge.idle ? badge.palette.placeholderText : badge.palette.highlight, badge.metrics.selectionOpacity)) }
        contentItem: RowLayout {
            spacing: badge.metrics.small
            Rectangle { implicitWidth: badge.metrics.small; implicitHeight: implicitWidth; radius: implicitWidth / 2; color: badge.idle ? badge.palette.placeholderText : badge.palette.highlight }
            Label { text: badge.text; color: badge.idle ? badge.palette.placeholderText : badge.palette.link }
        }
        Accessible.name: text
    }
    // Two equal columns when wide enough, otherwise one stack.
    component Columns: GridLayout {
        property real threshold: workbench.resources.metrics.reading
        columns: width >= threshold ? 2 : 1
        columnSpacing: workbench.resources.metrics.inset
        rowSpacing: workbench.resources.metrics.inset
        Layout.fillWidth: true
    }
}
