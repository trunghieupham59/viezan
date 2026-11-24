import QtQuick
import QtQuick.Controls

ScrollView {
    id: view
    required property string scrollName
    Binding { target: view.ScrollBar.vertical?.Accessible ?? null; property: "name"; value: view.scrollName }
    Binding { target: view.ScrollBar.horizontal?.Accessible ?? null; property: "name"; value: view.scrollName }
}
