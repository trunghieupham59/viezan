import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Controls.impl

Item {
    id: settings
    required property var bridge
    readonly property var workspace: bridge.state
    readonly property var metrics: bridge.resources.metrics
    readonly property var preferences: workspace.appearance || {mode: "system", textSize: "medium"}
    readonly property bool wide: width >= metrics.reading
    readonly property real readingPointSize: Qt.application.font.pointSize * bridge.resources.textScales[preferences.textSize]
    property string query: ""
    signal queryEdited(string value)
    property color dangerColor: palette.placeholderText
    // Section another workspace asked to open (e.g. "localModels" from a provider notice).
    property string requestedSection: ""
    signal sectionOpened()
    function openRequested() { if (requestedSection && sections.some(section => section.id === requestedSection)) { selectSection(requestedSection); Qt.callLater(sectionOpened) } }
    onRequestedSectionChanged: openRequested()
    Component.onCompleted: openRequested()
    property string activeSection: "general"
    // Review 18 settings navigation icons, generated from the renderer icon registry.
    readonly property var sectionIcons: ({general: "settings", appearance: "appearance", providers: "providers", localModels: "localModels", desktop: "utilities", bridge: "everywhere", data: "data", about: "about", voice: "interpret", modules: "apps", updates: "refresh"})
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
        // Search lives in the shell header; this field keeps keyboard focus
        // reachable only at compact widths where the header hides it.
        RowLayout {
            visible: false
            Layout.fillWidth: true
            TextField {
                id: search
                objectName: "settings-search"
                text: settings.query
                placeholderText: t("settingsSearch")
                Accessible.name: t("settingsSearch")
                onTextChanged: if (text !== settings.query) settings.queryEdited(text)
            }
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
                    // Review 18 groups: customization first, then application data/about.
                    model: [["groupCustomize", sections.filter(section => !["data", "updates", "about"].includes(section.id))], ["groupApplication", sections.filter(section => ["data", "updates", "about"].includes(section.id))]].filter(group => group[1].length)
                    delegate: ColumnLayout {
                        required property var modelData
                        spacing: metrics.tight
                        Layout.fillWidth: true
                        Kit.Eyebrow { text: t(modelData[0]); Layout.leftMargin: metrics.small; Layout.topMargin: metrics.gap }
                        Repeater {
                            model: modelData[1]
                            delegate: Button {
                                id: sectionButton
                                required property var modelData
                                text: t(modelData.title)
                                Layout.fillWidth: true
                                Layout.minimumHeight: metrics.compactControl
                                checkable: true
                                checked: settings.activeSection === modelData.id
                                flat: true
                                leftPadding: metrics.small
                                contentItem: RowLayout {
                                    spacing: metrics.small
                                    IconImage { source: "icons/" + settings.sectionIcons[sectionButton.modelData.id] + ".svg"; color: sectionButton.checked ? palette.link : palette.buttonText; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Layout.preferredWidth: metrics.icon; Layout.preferredHeight: metrics.icon; Accessible.ignored: true }
                                    Label { text: sectionButton.text; font.bold: sectionButton.checked; color: sectionButton.checked ? palette.link : palette.buttonText; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
                                }
                                background: Rectangle { radius: metrics.radius; color: sectionButton.checked ? Qt.tint(palette.base, Qt.alpha(palette.highlight, metrics.selectionOpacity)) : sectionButton.hovered ? palette.alternateBase : "transparent"; border.width: sectionButton.visualFocus ? metrics.hairline : 0; border.color: palette.highlight }
                                Accessible.name: text
                                onClicked: settings.selectSection(modelData.id)
                                ToolTip.visible: hovered
                                ToolTip.text: t(modelData.description)
                            }
                        }
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
                        x: 0
                        spacing: metrics.large
                        Repeater {
                            id: cards
                            model: settings.visibleSections
                            delegate: ColumnLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                spacing: metrics.inset
                                Kit.PageIntro { title: t(modelData.title); subtitle: t(modelData.description); Layout.fillWidth: true }
                                Loader {
                                    Layout.fillWidth: true
                                    sourceComponent: modelData.id === "desktop" ? desktopCard : modelData.id === "bridge" ? bridgeCard : modelData.id === "data" ? dataCard : modelData.id === "localModels" ? localModelsCard : modelData.id === "providers" ? providersCard : modelData.id === "voice" ? voiceCard : modelData.id === "modules" ? modulesCard : modelData.id === "updates" ? updatesCard : modelData.id === "general" ? generalCard : modelData.id === "appearance" ? appearanceCard : aboutCard
                                }
                            }
                        }
                        Label { text: t("changesImmediately"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
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
        ProviderSettings { bridge: settings.bridge; dangerColor: settings.dangerColor; width: parent.width }
    }
    Component {
        id: generalCard
        // Review 18 settings: titled cards of label rows with trailing controls.
        ColumnLayout {
            width: parent.width
            spacing: metrics.inset
            Kit.CardBox {
                title: t("groupApplication")
                Layout.fillWidth: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0
                    Kit.CardRow {
                        title: t("language"); detail: t("languageDescription"); divider: false
                        ComboBox {
                            objectName: "settings-language"
                            model: ["Tiếng Việt", "English", "日本語"]
                            currentIndex: ["vi", "en", "ja"].indexOf(workspace.locale)
                            implicitContentWidthPolicy: ComboBox.WidestText
                            Accessible.name: t("language")
                            onActivated: bridge.command("locale", {value: ["vi", "en", "ja"][currentIndex]})
                        }
                    }
                }
            }
            Kit.CardBox {
                title: t("translate")
                Layout.fillWidth: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0
                    Kit.CardRow {
                        title: settings.t("autoTranslate"); detail: settings.t("autoTranslateHint"); divider: !!settings.workspace.autoTranslate
                        Switch { checked: !!settings.workspace.autoTranslate; Accessible.name: settings.t("autoTranslate"); onToggled: settings.bridge.command("autoTranslate", {enabled: checked, delay: settings.workspace.autoTranslateDelay || 800}) }
                    }
                    Kit.CardRow {
                        visible: !!settings.workspace.autoTranslate
                        title: settings.t("autoTranslateDelay"); divider: false
                        ComboBox { readonly property var delays: [500, 800, 1500]; model: delays.map(value => value + " ms"); currentIndex: delays.indexOf(settings.workspace.autoTranslateDelay || 800); Accessible.name: settings.t("autoTranslateDelay"); onActivated: settings.bridge.command("autoTranslate", {enabled: true, delay: delays[currentIndex]}) }
                    }
                }
            }
            Kit.CardBox {
                title: t("recoveryTitle")
                Layout.fillWidth: true
                Label { width: parent.width; text: t("recoveryDescription"); color: palette.placeholderText; wrapMode: Text.Wrap }
            }
        }
    }
    Component {
        id: voiceCard
        ColumnLayout {
            enabled: !settings.bridge.loadBlocked
            width: parent.width
            Kit.CardBox {
                title: t("voiceTitle")
                Layout.fillWidth: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0
                    Kit.CardRow {
                        title: settings.t("speechProvider"); detail: settings.t("speechAutoHint")
                        ComboBox {
                            readonly property var providers: ["auto", "openai", "groq", "gemini"]
                            model: [settings.t("reasoning_auto"), "OpenAI", "Groq", "Gemini"]
                            currentIndex: providers.indexOf(settings.workspace.speechProvider || "auto")
                            Accessible.name: settings.t("speechProvider")
                            onActivated: settings.bridge.command("speechProvider", {value: providers[currentIndex]})
                        }
                    }
                    Kit.CardRow {
                        title: settings.t("voiceProvider")
                        ComboBox {
                            id: voiceProvider
                            readonly property var providers: ["system", "edge", "openai", "gemini", "elevenlabs"]
                            implicitContentWidthPolicy: ComboBox.WidestText
                            model: [settings.t("voiceSystem"), "Microsoft Edge", "OpenAI", "Gemini", "ElevenLabs"]
                            currentIndex: providers.indexOf(settings.workspace.voice?.provider || "system")
                            Accessible.name: settings.t("voiceProvider")
                            onActivated: voiceID.text = ""
                        }
                    }
                    Kit.CardRow {
                        title: settings.t("voiceID"); detail: settings.t("voiceHint"); divider: false
                        ComboBox { visible: voiceProvider.currentIndex === 0; Layout.preferredWidth: metrics.sidebar; model: [settings.t("voiceAutomatic")].concat(settings.bridge.audio.voices); Accessible.name: settings.t("voiceID"); onActivated: voiceID.text = currentIndex === 0 ? "" : currentText }
                        TextField { id: voiceID; visible: voiceProvider.currentIndex !== 0; Layout.preferredWidth: metrics.sidebar; text: settings.workspace.voice?.voice || ""; placeholderText: settings.t("voiceID"); Accessible.name: placeholderText; maximumLength: 256 }
                        Button { text: settings.t("apply"); onClicked: settings.bridge.command("voice", {provider:voiceProvider.providers[voiceProvider.currentIndex], voice:voiceID.text}) }
                    }
                }
            }
        }
    }
    Component {
        id: modulesCard
        Kit.CardBox {
            width: parent.width
            title: t("modulesTitle")
            ColumnLayout {
                anchors.fill: parent
                spacing: 0
                Repeater {
                    model: ["chat", "translate", "dictionary", "interpret", "thermal", "apps", "utilities", "bridge"]
                    delegate: Kit.CardRow {
                        required property string modelData
                        title: settings.t(modelData === "bridge" ? "browserBridge" : modelData)
                        divider: modelData !== "bridge"
                        Switch {
                            checked: !(settings.workspace.disabledModules || []).includes(modelData)
                            enabled: !settings.bridge.loadBlocked
                            Accessible.name: settings.t(modelData === "bridge" ? "browserBridge" : modelData)
                            onToggled: settings.bridge.command("module", {id: modelData, enabled: checked})
                        }
                    }
                }
            }
        }
    }
    Component {
        id: updatesCard
        Kit.CardBox {
            width: parent.width
            UpdateSettings { bridge: settings.bridge; width: parent.width }
        }
    }
    Component {
        id: appearanceCard
        ColumnLayout {
            width: parent.width
            spacing: metrics.inset
            Kit.CardBox {
                title: t("appearanceTitle")
                Layout.fillWidth: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0
                    Kit.CardRow {
                        title: settings.t("themePreset"); detail: settings.t("presetDescription")
                        ComboBox { readonly property var keys: ["graphite", "glass", "paper", "corporate", "midnight"]; implicitContentWidthPolicy: ComboBox.WidestText; model: keys.map(key => settings.t("preset_" + key)); currentIndex: keys.indexOf(preferences.preset || "graphite"); Accessible.name: settings.t("themePreset"); onActivated: bridge.command("appearance", {preset: keys[currentIndex]}) }
                    }
                    Kit.CardRow {
                        title: settings.t("themeAccent"); detail: settings.t("accentDescription")
                        ComboBox { readonly property var keys: ["auto", "violet", "pink", "teal", "green", "amber", "red"]; implicitContentWidthPolicy: ComboBox.WidestText; model: keys.map(key => settings.t("accent_" + key)); currentIndex: keys.indexOf(preferences.accent || "auto"); Accessible.name: settings.t("themeAccent"); onActivated: bridge.command("appearance", {accent: keys[currentIndex]}) }
                    }
                    Kit.CardRow {
                        title: t("themeMode"); detail: t("themeDescription")
                        TabBar {
                            objectName: "settings-theme"
                            Layout.preferredWidth: metrics.sidebar + metrics.large
                            currentIndex: ["light", "dark", "system"].indexOf(preferences.mode)
                            Accessible.name: t("themeMode")
                            TabButton { implicitHeight: metrics.control; text: t("themeLight"); onClicked: bridge.command("appearance", {mode: "light"}) }
                            TabButton { implicitHeight: metrics.control; text: t("themeDark"); onClicked: bridge.command("appearance", {mode: "dark"}) }
                            TabButton { implicitHeight: metrics.control; text: t("themeSystem"); onClicked: bridge.command("appearance", {mode: "system"}) }
                        }
                    }
                    Kit.CardRow {
                        title: t("readingSize"); detail: t("readingSizeDescription"); divider: false
                        TabBar {
                            objectName: "settings-text-size"
                            Layout.preferredWidth: metrics.sidebar + metrics.large
                            currentIndex: ["small", "medium", "large"].indexOf(preferences.textSize)
                            Accessible.name: t("readingSize")
                            TabButton { implicitHeight: metrics.control; text: t("textSmall"); onClicked: bridge.command("appearance", {textSize: "small"}) }
                            TabButton { implicitHeight: metrics.control; text: t("textMedium"); onClicked: bridge.command("appearance", {textSize: "medium"}) }
                            TabButton { implicitHeight: metrics.control; text: t("textLarge"); onClicked: bridge.command("appearance", {textSize: "large"}) }
                        }
                    }
                }
            }
            Kit.CardBox {
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
        Kit.CardBox {
            width: parent.width
            ColumnLayout {
                anchors.fill: parent
                spacing: metrics.inset
                Description { heading: "previewScopeTitle"; detail: "previewScopeDescription" }
                ToolSeparator { orientation: Qt.Horizontal; Layout.fillWidth: true }
                Description { heading: "localDataTitle"; detail: "settingsInfo" }
            }
        }
    }
}
