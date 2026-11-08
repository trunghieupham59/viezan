import QtQuick
import QtQuick.Controls
import "qrc:/qml" as V

ApplicationWindow {
    id: window
    visible: true
    width: 1280; height: 800
    property string page: "apps"
    property int settingsOpened: 0
    property QtObject appUninstall: QtObject {
        objectName: "fake-uninstall"
        property var apps: []
        property bool busy: false
        property bool inventoryComplete: true
        property bool operationUnverified: false
        property var errors: []
        property var lastResult: ({})
        property int scans: 0
        property var calls: []
        signal finished(var result)
        function inventory() { if (busy) return false; scans++; return true }
        function uninstall(id, authorizeSystem) { calls = calls.concat([{id:id, authorizeSystem:authorizeSystem}]); busy = true; return true }
        function complete(value) { busy = false; lastResult = value; finished(value) }
    }
    property QtObject desktop: QtObject {
        objectName: "fake-desktop"
        property bool busy: false
        property string error: ""
        property bool canReplaceSelection: false
        property var shortcuts: [{id:"launcher", key:"Alt+Space", enabled:false}, {id:"translateSelection", key:"Alt+T", enabled:false}, {id:"quickChat", key:"Ctrl+Alt+Space", enabled:true}]
        property var calls: []
        property bool reject: false
        signal changed()
        function configure(id, key, enabled) { calls = calls.concat([{id:id,key:key,enabled:enabled}]); error = reject ? "shortcutError" : ""; changed() }
        function trigger(id) { }
    }
    property QtObject audio: QtObject {
        property real recordingStarted: 0
        property int cancelled: 0
        signal changed()
        function cancel() { cancelled++; recordingStarted = 0; changed() }
    }
    property QtObject monitor: QtObject {
        property var sensors: []
        property var fans: []
        property var rows: []
        property bool monitoring: false
        property string error: ""
        function start() { monitoring = true }
        function stop() { monitoring = false }
    }
    property QtObject fakeBridge: QtObject {
        property var resources: workbench.resources
        property var state: workbench.state
        property var desktopIntegration: window.desktop
        property var thermalMonitor: window.monitor
        function quickTranslate() { return {primary:"vi", secondary:"en"} }
        function shortModelName(id) { return workbench.shortModelName(id) }
        function command(name, args) { }
    }
    V.ApplicationsWorkspace { objectName: "w3-apps"; anchors.fill: parent; visible: window.page === "apps"; bridge: workbench; removalService: window.appUninstall; openSettings: function() { window.settingsOpened++ } }
    V.DesktopWorkspace { objectName: "w3-desktop"; anchors.fill: parent; visible: window.page === "everywhere" || window.page === "utilities"; bridge: window.fakeBridge; route: window.page === "everywhere" ? "everywhere" : "utilities" }
    V.ThermalWorkspace { objectName: "w3-thermal"; anchors.fill: parent; visible: window.page === "thermal"; bridge: window.fakeBridge }
    V.RecordingStrip { objectName: "w3-recording"; width: parent.width; bridge: workbench; audio: window.audio }
    V.ShortcutRecorder { id: testRecorder; objectName: "w3-recorder"; bridge: workbench; desktop: window.desktop }
}
