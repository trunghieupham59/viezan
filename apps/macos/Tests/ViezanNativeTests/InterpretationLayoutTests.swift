import AppKit
import SwiftUI
import Testing
import ViezanDomain
@testable import ViezanNative

private struct SummaryControlProbe: NSViewRepresentable {
    var identifier: String
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        view.identifier = NSUserInterfaceItemIdentifier(identifier)
        return view
    }
    func updateNSView(_ view: NSView, context: Context) {}
}

extension AppKitFixtureTests {
    @Suite @MainActor struct InterpretationLayoutTests {
        private func descendants(_ view: NSView) -> [NSView] {
            [view] + view.subviews.flatMap(descendants)
        }

        @Test(arguments: [640.0, 820, 1200])
        func summaryActionsKeepCompleteLabelsAtWindowWidths(windowWidth: Double) async throws {
            _ = NSApplication.shared
            let previous = NativeTheme.shared.preferences
            defer { NativeTheme.shared.preferences = previous }
            NativeTheme.shared.preferences.preset = "glass"
            let strings = nativeResources.locales["vi"]!
            let tabs = ["summary", "actionItems", "decisions", "speakerAnalysis"].map { ($0, strings["interpret_" + $0]!) }
            let contentWidth = min(metric("reading"), windowWidth - metric(windowWidth < metric("compact") ? "rail" : "sidebar") - (metric("large") + metric("gap")) * 2) - metric("inset") * 2
            let host = NSHostingView(rootView: InterpretationSummaryToolbar(label: strings["summaryTitle"]!, tabs: tabs, selection: .constant("summary")) {
                CopyResponseButton(text: "Synthetic summary", label: strings["copy"]!, copiedLabel: strings["copied"]!)
                    .background(SummaryControlProbe(identifier: "copy"))
                Button(strings["quickRegenerate"]!, systemImage: "arrow.clockwise") {}.buttonStyle(.vznQuiet)
                    .background(SummaryControlProbe(identifier: "regenerate"))
            }.frame(maxHeight: .infinity, alignment: .top))
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: contentWidth, height: 120), styleMask: [.borderless], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentView = host
            defer { window.contentView = nil; window.close() }
            try await Task.sleep(for: .milliseconds(80))
            host.layoutSubtreeIfNeeded()
            let controls = descendants(host).filter { ["copy", "regenerate"].contains($0.identifier?.rawValue ?? "") }
            #expect(controls.count == 2)
            var frames: [CGRect] = []
            for identifier in ["copy", "regenerate"] {
                let control = try #require(controls.first { $0.identifier?.rawValue == identifier })
                let frame = control.convert(control.bounds, to: host)
                #expect(frame.width >= metric("compactControl"))
                #expect(frame.minX >= -1 && frame.maxX <= host.bounds.width + 1)
                #expect(frame.minY >= -1 && frame.maxY <= host.bounds.height + 1)
                frames.append(frame)
            }
            // Compare with unconstrained text width, so a passing fit cannot hide
            // an ellipsis inside the two action controls.
            for (offset, label) in [strings["copy"]!, strings["quickRegenerate"]!].enumerated() {
                let textWidth = (label as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: NSFont.systemFontSize)]).width
                #expect(frames[offset].width >= textWidth + metric("small") * 2)
            }
            // The Glass `.seg` track is one compact control tall (Liquid Glass 2.0).
            if windowWidth == 640 { #expect(frames[0].minY >= metric("compactControl") + metric("small")) }
            if windowWidth == 1200 { #expect(frames[0].minY < metric("compactControl")) }
            #expect(abs(frames[0].midY - frames[1].midY) < 1)
            #expect(frames[0].maxX <= frames[1].minX)
        }
    }
}
