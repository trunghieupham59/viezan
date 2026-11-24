.pragma library

// The opener stays a native push button. Its visual checked state can describe
// another feature (e.g. playing audio) independently of the open layer.
function bindState(button, accessible) {
    if (accessible.expanded !== undefined) {
        accessible.expandable = true
        accessible.expanded = Qt.binding(() => button.popupOpen)
        return
    }

    // Qt 6.8 lacks the expanded property and reinitializes checkable/checked
    // from AbstractButton when assistive technology attaches to an open window.
    const sync = () => {
        accessible.checkable = true
        accessible.checked = button.popupOpen
    }
    button.popupOpenChanged.connect(sync)
    accessible.checkableChanged.connect(sync)
    accessible.checkedChanged.connect(sync)
    sync()
}
