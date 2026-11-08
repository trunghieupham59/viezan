import QtQuick
import QtQuick.Controls
import "qrc:/qml" as V
ApplicationWindow {
    visible: true; width: 640; height: 640
    property QtObject fixture: QtObject {
        objectName: "audio-fixture"
        property bool speaking: false
        property bool preparing: false
        property string speakingSource: ""
        property string lastSource: ""
        property string error: ""
        property string lastText: ""
        property string lastLanguage: ""
        property string lastProvider: ""
        property var voiceList: [{name:"Japanese voice",language:"ja"},{name:"English voice",language:"en"}]
        function voiceFor(language) { return language === "ja" ? "Japanese voice" : "English voice" }
        function speak(text, language, source, provider) { lastText=text; lastLanguage=language; lastSource=source; lastProvider=provider; speakingSource=source; speaking=true }
        function silence() { speaking=false; speakingSource="" }
    }
    V.ListenButton {
        objectName: "trigger"; x: 20; y: 20; audio: fixture
        sources: [{id:"translation",title:"Translation",text:"こんにちは",language:"ja"},{id:"source",title:"Source",text:"Hello",language:"en"}]
    }
}
