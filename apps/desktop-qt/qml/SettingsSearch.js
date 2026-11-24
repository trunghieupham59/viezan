.pragma library

function normalize(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d")
}

function searchableSections(bridge) {
    const sections = bridge.resources.settingsSections
    if (!bridge.disabledModules.includes("utilities")) return sections
    // General's global-shortcut row disappears with Launcher & shortcuts.
    const hidden = ["hotkeys", "utilities", "launcher", "quickChat", "translateSelection"]
    return sections.map(section => {
        if (section.id !== "general") return section
        return Object.assign({}, section, {terms: section.terms.filter(key => !hidden.includes(key))})
    })
}

function matches(bridge, query) {
    const needle = normalize(query.trim())
    if (!needle) return bridge.resources.settingsSections
    const strings = bridge.strings
    return searchableSections(bridge).filter(section => {
        const text = [section.title, section.description].concat(section.terms).map(key => strings[key] || key).join(" ")
        return normalize(text).includes(needle)
    })
}
