import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Controls.impl

Item {
    id: settings
    required property var bridge
    property Item searchAnchor: null
    signal feedback(string message, bool error)
    readonly property bool glass: workspace.appearance?.preset === "glass"
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
    /// Opens a sidebar page (the global shortcuts row leads to Launcher & shortcuts).
    signal routeRequested(string route)
    function openRequested() { if (requestedSection && sections.some(section => section.id === requestedSection)) { selectSection(requestedSection); Qt.callLater(sectionOpened) } }
    onRequestedSectionChanged: openRequested()
    Component.onCompleted: openRequested()
    property string activeSection: "general"
    // Review 18 settings navigation icons, packaged from qml/icons.
    readonly property var sectionIcons: ({general: "settings", appearance: "appearance", providers: "providers", localModels: "localModels", desktop: "utilities", data: "data", about: "about", voice: "interpret", modules: "apps", updates: "refresh"})
    readonly property var matches: bridge.resources.settingsSections.filter(section => {
        const haystack = [section.title, section.description].concat(section.terms).map(t).join(" ")
        return normalize(haystack).includes(normalize(query.trim()))
    })
    readonly property var sections: glass ? bridge.resources.settingsSections : matches
    readonly property var visibleSections: !glass && query.trim() ? sections : sections.filter(section => section.id === activeSection)
    objectName: "settings-workspace"
    function t(key) { return bridge.resources.locales[workspace.locale][key] || key }
    function normalize(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d") }
    function selectSection(id) {
        activeSection = id
        if (glass) { queryEdited(""); results.close() }
        Qt.callLater(() => { settingsScroll.contentItem.contentY = 0 })
    }
    function activateSearchResult() { if (matches.length) selectSection(matches[0].id) }
    function focusSearchResults() { if (results.visible && matches.length) resultList.forceActiveFocus(Qt.TabFocusReason) }
    onQueryChanged: {
        if (!glass || !searchAnchor) return
        if (query.trim()) { results.openAt(searchAnchor); searchAnchor.forceActiveFocus() }
        else results.close()
    }
    Kit.AnchoredPanel {
        id: results; objectName: "settings-search-results"
        desiredWidth: metrics.sidebar + metrics.editor
        focus: false
        // Keep Escape with the editing field so active IME composition is not dismissed.
        closePolicy: Popup.CloseOnPressOutside
        contentItem: ListView {
            id: resultList; implicitHeight: Math.max(metrics.navControl, contentHeight)
            clip: true; model: settings.matches; currentIndex: 0; keyNavigationEnabled: true
            onCurrentIndexChanged: positionViewAtIndex(currentIndex, ListView.Contain)
            Keys.onReturnPressed: if (count) settings.selectSection(settings.matches[currentIndex].id)
            Keys.onEnterPressed: if (count) settings.selectSection(settings.matches[currentIndex].id)
            Keys.onEscapePressed: { settings.queryEdited(""); results.close(); settings.searchAnchor.forceActiveFocus() }
            ScrollBar.vertical: ScrollBar { policy: resultList.contentHeight > resultList.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff }
            Label { visible: !resultList.count; text: settings.t("noSettings"); width: parent.width; padding: metrics.small; wrapMode: Text.Wrap }
            delegate: Kit.PanelRow {
                required property var modelData
                required property int index
                width: resultList.width; text: settings.t(modelData.title); detail: settings.t(modelData.description)
                highlighted: resultList.activeFocus && resultList.currentIndex === index
                onClicked: settings.selectSection(modelData.id)
            }
        }
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
            columns: settings.wide ? 3 : 1
            columnSpacing: metrics.gutter
            rowSpacing: metrics.inset
            ColumnLayout {
                visible: settings.wide && sections.length > 0
                Layout.fillHeight: true
                Layout.preferredWidth: settings.glass ? metrics.sidebar + metrics.large + metrics.gutter : metrics.sidebar - metrics.large
                Layout.maximumWidth: settings.glass ? metrics.sidebar + metrics.large + metrics.gutter : metrics.sidebar - metrics.large
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
                                Layout.minimumHeight: metrics.compactControl + metrics.hairline * 2
                                checkable: true
                                checked: settings.activeSection === modelData.id
                                flat: true
                                leftPadding: metrics.small
                                contentItem: RowLayout {
                                    spacing: metrics.small
                                    IconImage { source: "icons/" + settings.sectionIcons[sectionButton.modelData.id] + ".svg"; color: sectionButton.checked ? palette.link : palette.buttonText; sourceSize.width: metrics.icon; sourceSize.height: metrics.icon; Layout.preferredWidth: metrics.icon; Layout.preferredHeight: metrics.icon; Accessible.ignored: true }
                                    Label { text: sectionButton.text; font.bold: sectionButton.checked; font.pointSize: Qt.application.font.pointSize * metrics.labelScale; color: palette.buttonText; elide: Text.ElideRight; Layout.fillWidth: true; Accessible.ignored: true }
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
                                ToolTip.visible: hovered && !results.visible
                                ToolTip.text: t(modelData.description)
                            }
                        }
                    }
                }
                Item { Layout.fillHeight: true }
                Label { visible: settings.glass; text: t("changesImmediately"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true; Layout.leftMargin: metrics.small; Layout.rightMargin: metrics.small }
            }
            ToolSeparator { visible: settings.wide; orientation: Qt.Vertical; Layout.fillHeight: true }
            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: metrics.inset
                SettingsPicker {
                    objectName: "settings-section-picker"
                    visible: !settings.wide && sections.length > 0
                    Layout.fillWidth: true
                    model: sections.map(section => ({id: section.id, label: t(section.title), group: t(["data","updates","about"].includes(section.id) ? "groupApplication" : "groupCustomize")}))
                    textRole: "label"
                    currentIndex: sections.findIndex(section => section.id === settings.activeSection)
                    Accessible.name: t("settings")
                    onActivated: settings.selectSection(sections[currentIndex].id)
                }
                Label { visible: sections.length === 0; text: t("noSettings"); wrapMode: Text.Wrap; Layout.fillWidth: true }
                ScrollView {
                    id: settingsScroll
                    clip: true
                    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
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
                                    sourceComponent: modelData.id === "data" ? dataCard : modelData.id === "localModels" ? localModelsCard : modelData.id === "providers" ? providersCard : modelData.id === "voice" ? voiceCard : modelData.id === "modules" ? modulesCard : modelData.id === "updates" ? updatesCard : modelData.id === "general" ? generalCard : modelData.id === "appearance" ? appearanceCard : aboutCard
                                }
                            }
                        }
                        Label { visible: !settings.glass || !settings.wide; text: t("changesImmediately"); color: palette.placeholderText; wrapMode: Text.Wrap; Layout.fillWidth: true }
                    }
                }
                Item { visible: sections.length === 0; Layout.fillHeight: true }
            }
        }
    }
    Component {
        id: dataCard
        DataSettings { bridge: settings.bridge; width: parent.width; onFeedback: (message, error) => settings.feedback(message, error) }
    }
    Component {
        id: localModelsCard
        LocalModelSettings { bridge: settings.bridge; width: parent.width; onFeedback: (message, error) => settings.feedback(message, error) }
    }
    Component {
        id: providersCard
        ProviderSettings { bridge: settings.bridge; dangerColor: settings.dangerColor; width: parent.width; onFeedback: (message, error) => settings.feedback(message, error) }
    }
    Component {
        id: generalCard
        // Review 18 settings: titled cards of label rows with trailing controls.
        ColumnLayout {
            enabled: !settings.bridge.loadBlocked
            width: parent.width
            spacing: metrics.inset
            Kit.CardBox {
                title: t("groupApplication")
                Layout.fillWidth: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0
                    Kit.CardRow {
                        title: t("language"); detail: t("languageDescription"); divider: !(bridge.state.disabledModules || []).includes("utilities")
                        SettingsPicker {
                            objectName: "settings-language"
                            model: ["Tiếng Việt", "English", "日本語"]
                            currentIndex: ["vi", "en", "ja"].indexOf(workspace.locale)
                            implicitContentWidthPolicy: ComboBox.WidestText
                            Accessible.name: t("language")
                            onActivated: bridge.command("locale", {value: ["vi", "en", "ja"][currentIndex]})
                        }
                    }
                    // Liquid Glass 2.0: Settings no longer records shortcuts; this row lists the
                    // enabled ones and leads to the sidebar page that owns them.
                    Kit.CardRow {
                        objectName: "settings-hotkeys"
                        visible: !(bridge.state.disabledModules || []).includes("utilities")
                        title: t("hotkeys")
                        detail: bridge.desktopIntegration.shortcuts.filter(item => item.enabled).map(item => t(item.id) + " " + item.key.replace(/Control/g, "Ctrl").split("+").join(" ")).join(" · ")
                        divider: false
                        // "&&" keeps the ampersand literal; a single "&" would become a mnemonic underline.
                        Kit.GlassButton { objectName: "settings-open-utilities"; text: t("utilities").replace(/&/g, "&&"); Accessible.name: t("utilities"); onClicked: settings.routeRequested("utilities") }
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
                        SettingsPicker { readonly property var delays: [500, 800, 1500]; model: delays.map(value => value + " ms"); currentIndex: delays.indexOf(settings.workspace.autoTranslateDelay || 800); Accessible.name: settings.t("autoTranslateDelay"); onActivated: settings.bridge.command("autoTranslate", {enabled: true, delay: delays[currentIndex]}) }
                    }
                }
            }
            Kit.CardBox {
                title: t("recoveryTitle")
                Layout.fillWidth: true
                Kit.CardRow {
                    width: parent.width; title: settings.t("smartReset"); detail: settings.t("smartResetDescription"); divider: false
                    Switch { objectName: "settings-smart-reset"; checked: settings.workspace.smartReset !== false; enabled: !settings.bridge.loadBlocked; Accessible.name: settings.t("smartReset"); onToggled: settings.bridge.command("smartReset", {value:checked}) }
                }
            }
        }
    }
    Component {
        id: voiceCard
        SpeechSettings { bridge: settings.bridge; width: parent.width; onManageKeys: settings.selectSection("providers") }
    }
    Component {
        id: modulesCard
        ModuleSettings { bridge: settings.bridge; width: parent.width }
    }
    Component {
        id: updatesCard
        UpdateSettings { bridge: settings.bridge; width: parent.width }
    }
    Component {
        id: appearanceCard
        ColumnLayout {
            enabled: !settings.bridge.loadBlocked
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
                        SettingsPicker { readonly property var keys: ["graphite", "glass", "paper", "corporate", "midnight"]; implicitContentWidthPolicy: ComboBox.WidestText; model: keys.map(key => settings.t("preset_" + key)); currentIndex: keys.indexOf(preferences.preset || "graphite"); Accessible.name: settings.t("themePreset"); onActivated: bridge.command("appearance", {preset: keys[currentIndex]}) }
                    }
                    Kit.CardRow {
                        title: settings.t("themeAccent"); detail: settings.t("accentDescription")
                        SettingsPicker { readonly property var keys: ["auto", "violet", "pink", "teal", "green", "amber", "red"]; implicitContentWidthPolicy: ComboBox.WidestText; model: keys.map(key => settings.t("accent_" + key)); currentIndex: keys.indexOf(preferences.accent || "auto"); Accessible.name: settings.t("themeAccent"); onActivated: bridge.command("appearance", {accent: keys[currentIndex]}) }
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
        AboutSettings { bridge: settings.bridge; width: parent.width }
    }
}
