import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ColumnLayout {
    id: root
    required property var artifact
    required property var metrics
    SystemPalette { id: colors }
    Label { text: root.artifact.title; font.bold: true; visible: !!text; textFormat: Text.PlainText; Layout.fillWidth: true; wrapMode: Text.Wrap }
    Canvas {
        id: plot
        Layout.fillWidth: true; Layout.preferredHeight: root.metrics.editor * 2
        Accessible.role: Accessible.Graphic
        Accessible.name: root.artifact.title || root.artifact.type
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        Connections { target: root; function onArtifactChanged() { plot.requestPaint() } }
        onPaint: {
            const c = getContext("2d"); c.clearRect(0,0,width,height)
            const series = root.artifact.series, labels = root.artifact.labels, inset = root.metrics.inset
            const w = Math.max(1,width-inset*2), h = Math.max(1,height-inset*2), all = series.flatMap(item=>item.values), low=Math.min(0,...all), high=Math.max(0,...all), range=high-low||1
            if (root.artifact.type === "pie") {
                const values=series[0].values, total=values.reduce((a,b)=>a+b,0)||1, radius=Math.min(w,h)/2
                let start=-Math.PI/2
                values.forEach((value,i)=>{ const end=start+value/total*Math.PI*2; c.beginPath(); c.moveTo(width/2,height/2); c.arc(width/2,height/2,radius,start,end); c.closePath(); c.fillStyle=Qt.tint(colors.base,Qt.alpha(colors.highlight,(i+1)/(values.length+1))); c.fill(); c.strokeStyle=colors.text; c.lineWidth=root.metrics.hairline; c.stroke(); start=end })
                return
            }
            const y=value=>inset+h-(value-low)/range*h, slot=w/labels.length
            c.strokeStyle=colors.mid; c.lineWidth=root.metrics.hairline; c.beginPath(); c.moveTo(inset,y(0)); c.lineTo(inset+w,y(0)); c.stroke()
            series.forEach((item,s)=>{
                c.strokeStyle=Qt.tint(colors.text,Qt.alpha(colors.highlight,(s+1)/(series.length+1))); c.fillStyle=c.strokeStyle; c.lineWidth=root.metrics.hairline*2
                if(root.artifact.type==="line") { c.beginPath(); item.values.forEach((v,i)=>{ const x=inset+slot*(i+0.5); if(i)c.lineTo(x,y(v));else c.moveTo(x,y(v)) });c.stroke() }
                else item.values.forEach((v,i)=>{const x=inset+slot*i+slot*s/series.length; c.fillRect(x,Math.min(y(v),y(0)),slot/series.length-root.metrics.hairline,Math.max(root.metrics.hairline,Math.abs(y(v)-y(0))))})
            })
        }
    }
    Repeater {
        model: root.artifact.series
        delegate: Label { required property var modelData; text: modelData.name + ": " + root.artifact.labels.map((label,i)=>label+" = "+modelData.values[i]).join(" · "); textFormat: Text.PlainText; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
}
