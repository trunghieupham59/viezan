import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: settings
    required property var bridge
    readonly property var workspace: bridge.state
    readonly property var metrics: bridge.resources.metrics
    readonly property var preferences: workspace.appearance || {mode: "system", textSize: "medium"}
    readonly property bool wide: width >= metrics.reading
    readonly property real readingPointSize: Qt.application.font.pointSize * bridge.resources.textScales[preferences.textSize]
    property string query: ""
    property string activeSection: "general"
    readonly property var sections: bridge.resources.settingsSections.filter(section => {
        const haystack = [section.title, section.description].concat(section.terms).map(t).join(" ")
        return normalize(haystack).includes(normalize(query.trim()))
    })
    readonly property var visibleSections: query.trim() ? sections : sections.filter(section => section.id === activeSection)
    objectName: "settings-workspace"
    function t(key) { return bridge.resources.locales[workspace.locale][key] || key }
    function normalize(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d") }
    function selectSection(id) {
        activeSection = id
        Qt.callLater(() => {
            if (!query.trim()) settingsScroll.contentItem.contentY = 0
            else {
                const index = visibleSections.findIndex(section => section.id === id)
                const card = cards.itemAt(index)
                if (card) settingsScroll.contentItem.contentY = Math.min(card.y, Math.max(0, settingsScroll.contentHeight - settingsScroll.availableHeight))
            }
        })
    }
    onSectionsChanged: {
        if (!sections.some(section => section.id === activeSection)) activeSection = sections[0]?.id || ""
    }
    ColumnLayout {
        anchors.fill: parent
        spacing: metrics.inset
        RowLayout {
            Layout.fillWidth: true
            TextField {
                id: search
                objectName: "settings-search"
                Layout.fillWidth: true
                Layout.maximumWidth: metrics.sidebar + metrics.editor
                Layout.minimumHeight: metrics.control
                text: settings.query
                placeholderText: t("settingsSearch")
                Accessible.name: t("settingsSearch")
                selectByMouse: true
                // Text entry uses a neutral border and caret, not an accent ring.
                background: Rectangle {
                    color: palette.base
                    radius: metrics.radius
                    border.color: search.activeFocus ? palette.text : palette.mid
                }
                onTextChanged: settings.query = text
                Keys.onEscapePressed: function(event) { if (!inputMethodComposing) { settings.query = ""; event.accepted = true } else event.accepted = false }
                Component.onCompleted: forceActiveFocus()
            }
            ToolButton { text: "×"; visible: settings.query.length > 0; Accessible.name: t("clearSearch"); onClicked: { settings.query = ""; search.forceActiveFocus() } }
            Item { Layout.fillWidth: true }
        }
        GridLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            columns: settings.wide ? 2 : 1
            columnSpacing: metrics.gutter
            rowSpacing: metrics.inset
            ColumnLayout {
                visible: settings.wide && sections.length > 0
                Layout.fillHeight: true
                Layout.preferredWidth: metrics.sidebar - metrics.large
                Layout.maximumWidth: metrics.sidebar - metrics.large
                Repeater {
                    model: sections
                    delegate: Button {
                        required property var modelData
                        text: t(modelData.title)
                        Layout.fillWidth: true
                        Layout.minimumHeight: metrics.control
                        checkable: true
                        checked: settings.activeSection === modelData.id
                        flat: true
                        onClicked: settings.selectSection(modelData.id)
                        ToolTip.visible: hovered
                        ToolTip.text: t(modelData.description)
                    }
                }
                Item { Layout.fillHeight: true }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: metrics.inset
                ComboBox {
                    objectName: "settings-section-picker"
                    visible: !settings.wide && sections.length > 0
                    Layout.fillWidth: true
                    model: sections.map(section => ({id: section.id, label: t(section.title)}))
                    textRole: "label"
                    currentIndex: sections.findIndex(section => section.id === settings.activeSection)
                    Accessible.name: t("settings")
                    onActivated: settings.selectSection(sections[currentIndex].id)
                }
                Label { visible: sections.length === 0; text: t("noSettings"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                ScrollView {
                    id: settingsScroll
                    visible: sections.length > 0
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    contentWidth: availableWidth
                    contentHeight: content.implicitHeight
                    ColumnLayout {
                        id: content
                        width: Math.min(settingsScroll.availableWidth, metrics.reading)
                        x: (settingsScroll.availableWidth - width) / 2
                        spacing: metrics.large
                        Repeater {
                            id: cards
                            model: settings.visibleSections
                            delegate: ColumnLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                spacing: metrics.inset
                                Label { text: t(modelData.title); font.bold: true; Layout.fillWidth: true; wrapMode: Text.Wrap }
                                Label { text: t(modelData.description); Layout.fillWidth: true; wrapMode: Text.Wrap }
                                Loader {
                                    Layout.fillWidth: true
                                    sourceComponent: modelData.id === "desktop" ? desktopCard : modelData.id === "bridge" ? bridgeCard : modelData.id === "data" ? dataCard : modelData.id === "localModels" ? localModelsCard : modelData.id === "providers" ? providersCard : modelData.id === "general" ? generalCard : modelData.id === "appearance" ? appearanceCard : aboutCard
                                }
                            }
                        }
                        Label { text: t("changesImmediately"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                    }
                }
                Item { visible: sections.length === 0; Layout.fillHeight: true }
            }
        }
    }
    component Description: ColumnLayout {
        required property string heading
        required property string detail
        Layout.fillWidth: true
        spacing: metrics.small
        Label { text: t(heading); font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Label { text: t(detail); wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
    Component {
        id: desktopCard
        DesktopSettings { bridge: settings.bridge; width: parent.width }
    }
    Component {
        id: bridgeCard
        BridgeSettings { bridge: settings.bridge; width: parent.width }
    }
    Component {
        id: dataCard
        DataSettings { bridge: settings.bridge; width: parent.width }
    }
    Component {
        id: localModelsCard
        LocalModelSettings { bridge: settings.bridge; width: parent.width }
    }
    Component {
        id: providersCard
        ProviderSettings { bridge: settings.bridge; width: parent.width }
    }
    Component {
        id: generalCard
        GroupBox {
            width: parent.width
            ColumnLayout {
                anchors.fill: parent
                spacing: metrics.inset
                Label { text: t("language"); font.bold: true; wrapMode: Text.Wrap; Layout.fillWidth: true }
                ComboBox {
                    objectName: "settings-language"
                    model: ["Tiếng Việt", "English", "日本語"]
                    currentIndex: ["vi", "en", "ja"].indexOf(workspace.locale)
                    implicitContentWidthPolicy: ComboBox.WidestText
                    Accessible.name: t("language")
                    onActivated: bridge.command("locale", {value: ["vi", "en", "ja"][currentIndex]})
                }
                ToolSeparator { orientation: Qt.Horizontal; Layout.fillWidth: true }
                ComboBox {
                    id: voiceProvider
                    readonly property var providers: ["system", "edge", "openai", "gemini", "elevenlabs"]
                    model: [settings.t("voiceSystem"), "Microsoft Edge", "OpenAI", "Gemini", "ElevenLabs"]
                    currentIndex: providers.indexOf(settings.workspace.voice?.provider || "system")
                    Accessible.name: settings.t("voiceProvider")
                    onActivated: voiceID.text = ""
                }
                TextField { id: voiceID; text: settings.workspace.voice?.voice || ""; placeholderText: settings.t("voiceID"); Accessible.name: placeholderText; maximumLength: 256; Layout.fillWidth: true }
                ComboBox { visible: voiceProvider.currentIndex === 0; model: [settings.t("voiceAutomatic")].concat(settings.bridge.audio.voices); Accessible.name: settings.t("voiceID"); onActivated: voiceID.text = currentIndex === 0 ? "" : currentText }
                Label { text: settings.t("voiceHint"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                Button { text: settings.t("apply"); onClicked: settings.bridge.command("voice", {provider:voiceProvider.providers[voiceProvider.currentIndex], voice:voiceID.text}) }
                Description { heading: "recoveryTitle"; detail: "recoveryDescription" }
            }
        }
    }
    Component {
        id: appearanceCard
        ColumnLayout {
            width: parent.width
            spacing: metrics.inset
            GroupBox {
                Layout.fillWidth: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: metrics.inset
                    ComboBox { readonly property var keys: ["graphite", "glass", "paper", "corporate", "midnight"]; model: keys.map(key => settings.t("preset_" + key)); currentIndex: keys.indexOf(preferences.preset || "graphite"); Accessible.name: settings.t("themePreset"); onActivated: bridge.command("appearance", {preset: keys[currentIndex]}) }
                    ComboBox { readonly property var keys: ["auto", "violet", "pink", "teal", "green", "amber", "red"]; model: keys.map(key => settings.t("accent_" + key)); currentIndex: keys.indexOf(preferences.accent || "auto"); Accessible.name: settings.t("themeAccent"); onActivated: bridge.command("appearance", {accent: keys[currentIndex]}) }
                    Description { heading: "themeMode"; detail: "themeDescription" }
                    TabBar {
                        objectName: "settings-theme"
                        Layout.fillWidth: true
                        currentIndex: ["light", "dark", "system"].indexOf(preferences.mode)
                        Accessible.name: t("themeMode")
                        TabButton { implicitHeight: metrics.control; text: t("themeLight"); onClicked: bridge.command("appearance", {mode: "light"}) }
                        TabButton { implicitHeight: metrics.control; text: t("themeDark"); onClicked: bridge.command("appearance", {mode: "dark"}) }
                        TabButton { implicitHeight: metrics.control; text: t("themeSystem"); onClicked: bridge.command("appearance", {mode: "system"}) }
                    }
                    ToolSeparator { orientation: Qt.Horizontal; Layout.fillWidth: true }
                    Description { heading: "readingSize"; detail: "readingSizeDescription" }
                    TabBar {
                        objectName: "settings-text-size"
                        Layout.fillWidth: true
                        currentIndex: ["small", "medium", "large"].indexOf(preferences.textSize)
                        Accessible.name: t("readingSize")
                        TabButton { implicitHeight: metrics.control; text: t("textSmall"); onClicked: bridge.command("appearance", {textSize: "small"}) }
                        TabButton { implicitHeight: metrics.control; text: t("textMedium"); onClicked: bridge.command("appearance", {textSize: "medium"}) }
                        TabButton { implicitHeight: metrics.control; text: t("textLarge"); onClicked: bridge.command("appearance", {textSize: "large"}) }
                    }
                }
            }
            GroupBox {
                title: t("previewHeading")
                Layout.fillWidth: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: metrics.inset
                    Label { text: t("previewUser"); font.pointSize: settings.readingPointSize; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    Label { text: t("previewAssistant"); font.pointSize: settings.readingPointSize; wrapMode: Text.Wrap; Layout.fillWidth: true }
                }
            }
        }
    }
    Component {
        id: aboutCard
        GroupBox {
            width: parent.width
            ColumnLayout {
                anchors.fill: parent
                spacing: metrics.inset
                UpdateSettings { bridge: settings.bridge; Layout.fillWidth: true }
                Description { heading: "previewScopeTitle"; detail: "previewScopeDescription" }
                ToolSeparator { orientation: Qt.Horizontal; Layout.fillWidth: true }
                Description { heading: "localDataTitle"; detail: "settingsInfo" }
            }
        }
    }
}
