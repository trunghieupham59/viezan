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
    // Review 18 settings navigation icons, packaged from qml/icons.
    readonly property var sectionIcons: ({general: "settings", appearance: "appearance", providers: "providers", localModels: "localModels", desktop: "utilities", data: "data", about: "about", voice: "interpret", modules: "apps", updates: "refresh"})
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
            Kit.SearchField {
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
                            delegate: Kit.GlassButton {
                                id: sectionButton
                                glassMaterial: false
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
                                background: Rectangle {
                                    radius: metrics.radius
                                    color: workbench.state.appearance?.preset === "glass" && sectionButton.checked ? "transparent" : sectionButton.checked ? Qt.tint(palette.base, Qt.alpha(palette.highlight, metrics.selectionOpacity)) : sectionButton.hovered ? palette.alternateBase : "transparent"
                                    Kit.ControlGlassSurface { anchors.fill: parent; visible: workbench.state.appearance?.preset === "glass" && sectionButton.checked; radius: metrics.radius }
                                    border.width: sectionButton.visualFocus ? metrics.hairline : 0
                                    border.color: palette.highlight
                                }
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
                Kit.GlassComboBox {
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
                                    sourceComponent: modelData.id === "desktop" ? desktopCard : modelData.id === "data" ? dataCard : modelData.id === "localModels" ? localModelsCard : modelData.id === "providers" ? providersCard : modelData.id === "voice" ? voiceCard : modelData.id === "modules" ? modulesCard : modelData.id === "updates" ? updatesCard : modelData.id === "general" ? generalCard : modelData.id === "appearance" ? appearanceCard : aboutCard
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
        id: dataCard
        Kit.CardBox { width: parent.width; DataSettings { bridge: settings.bridge; width: parent.width } }
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
                        Kit.GlassComboBox {
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
                        Kit.GlassComboBox { readonly property var delays: [500, 800, 1500]; model: delays.map(value => value + " ms"); currentIndex: delays.indexOf(settings.workspace.autoTranslateDelay || 800); Accessible.name: settings.t("autoTranslateDelay"); onActivated: settings.bridge.command("autoTranslate", {enabled: true, delay: delays[currentIndex]}) }
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
                        Kit.GlassComboBox {
                            readonly property var providers: ["auto", "openai", "groq", "gemini"]
                            model: [settings.t("reasoning_auto"), "OpenAI", "Groq", "Gemini"]
                            currentIndex: providers.indexOf(settings.workspace.speechProvider || "auto")
                            Accessible.name: settings.t("speechProvider")
                            onActivated: settings.bridge.command("speechProvider", {value: providers[currentIndex]})
                        }
                    }
                    Kit.CardRow {
                        title: settings.t("voiceProvider")
                        Kit.GlassComboBox {
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
                        Kit.GlassComboBox { visible: voiceProvider.currentIndex === 0; Layout.preferredWidth: metrics.sidebar; model: [settings.t("voiceAutomatic")].concat(settings.bridge.audio.voices); Accessible.name: settings.t("voiceID"); onActivated: voiceID.text = currentIndex === 0 ? "" : currentText }
                        TextField { id: voiceID; visible: voiceProvider.currentIndex !== 0; Layout.preferredWidth: metrics.sidebar; text: settings.workspace.voice?.voice || ""; placeholderText: settings.t("voiceID"); Accessible.name: placeholderText; maximumLength: 256 }
                        Kit.GlassButton { text: settings.t("apply"); onClicked: settings.bridge.command("voice", {provider:voiceProvider.providers[voiceProvider.currentIndex], voice:voiceID.text}) }
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
                    model: ["chat", "translate", "dictionary", "interpret", "thermal", "apps", "utilities"]
                    delegate: Kit.CardRow {
                        required property string modelData
                        title: settings.t(modelData)
                        divider: modelData !== "utilities"
                        Switch {
                            checked: !(settings.workspace.disabledModules || []).includes(modelData)
                            enabled: !settings.bridge.loadBlocked
                            Accessible.name: settings.t(modelData)
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
                        Kit.GlassComboBox { readonly property var keys: ["graphite", "glass", "paper", "corporate", "midnight"]; implicitContentWidthPolicy: ComboBox.WidestText; model: keys.map(key => settings.t("preset_" + key)); currentIndex: keys.indexOf(preferences.preset || "graphite"); Accessible.name: settings.t("themePreset"); onActivated: bridge.command("appearance", {preset: keys[currentIndex]}) }
                    }
                    Kit.CardRow {
                        title: settings.t("themeAccent"); detail: settings.t("accentDescription")
                        Kit.GlassComboBox { readonly property var keys: ["auto", "violet", "pink", "teal", "green", "amber", "red"]; implicitContentWidthPolicy: ComboBox.WidestText; model: keys.map(key => settings.t("accent_" + key)); currentIndex: keys.indexOf(preferences.accent || "auto"); Accessible.name: settings.t("themeAccent"); onActivated: bridge.command("appearance", {accent: keys[currentIndex]}) }
                    }
                    Kit.CardRow {
                        title: t("themeMode"); detail: t("themeDescription")
                        Kit.FilterGroup {
                            objectName: "settings-theme"
                            readonly property var keys: ["light", "dark", "system"]
                            Layout.preferredWidth: metrics.sidebar + metrics.large
                            currentIndex: keys.indexOf(preferences.mode)
                            onSelectionChanged: index => { if (keys[index] !== preferences.mode) bridge.command("appearance", {mode: keys[index]}) }
                            Accessible.name: t("themeMode")
                            Kit.FilterButton { text: t("themeLight") }
                            Kit.FilterButton { text: t("themeDark") }
                            Kit.FilterButton { text: t("themeSystem") }
                        }
                    }
                    Kit.CardRow {
                        title: t("readingSize"); detail: t("readingSizeDescription"); divider: false
                        Kit.FilterGroup {
                            objectName: "settings-text-size"
                            readonly property var keys: ["small", "medium", "large"]
                            Layout.preferredWidth: metrics.sidebar + metrics.large
                            currentIndex: keys.indexOf(preferences.textSize)
                            onSelectionChanged: index => { if (keys[index] !== preferences.textSize) bridge.command("appearance", {textSize: keys[index]}) }
                            Accessible.name: t("readingSize")
                            Kit.FilterButton { text: t("textSmall") }
                            Kit.FilterButton { text: t("textMedium") }
                            Kit.FilterButton { text: t("textLarge") }
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
                Kit.CardRow { title: settings.t("currentVersion"); Layout.fillWidth: true; Label { text: Qt.application.version; color: palette.placeholderText } }
                Kit.CardRow { title: settings.t("sourceCode"); divider: false; Layout.fillWidth: true; Kit.GlassButton { text: "GitHub"; onClicked: Qt.openUrlExternally("https://github.com/trunghieupham59/viezan") } }
                ToolSeparator { orientation: Qt.Horizontal; Layout.fillWidth: true }
                Description { heading: "previewScopeTitle"; detail: "previewScopeDescription" }
                ToolSeparator { orientation: Qt.Horizontal; Layout.fillWidth: true }
                Description { heading: "localDataTitle"; detail: "settingsInfo" }
            }
        }
    }
}
