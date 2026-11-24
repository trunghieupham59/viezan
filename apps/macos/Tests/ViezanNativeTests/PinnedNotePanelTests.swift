import Foundation
import Testing
import ViezanDomain
@testable import ViezanNative

@Suite @MainActor struct PinnedNotePanelTests {
    // Offset display with a Dock/menu inset, in macOS screen coordinates.
    let visible = CGRect(x: -1100, y: 40, width: 1000, height: 1000)

    @Test func clampHandlesOffscreenAndOversizedFrames() {
        let outside = CGRect(x: -1500, y: 1200, width: 300, height: 200)
        #expect(PinnedNotePanels.clamped(outside, to: visible)
                == CGRect(x: visible.minX, y: visible.maxY - 200, width: 300, height: 200))
        let oversized = CGRect(x: 20, y: 30, width: 1800, height: 2000)
        #expect(PinnedNotePanels.clamped(oversized, to: visible) == visible)
    }

    @Test func snapsOnlyInsideEitherEdgeThreshold() {
        let width: CGFloat = 300
        let threshold = metric("large"), inset = metric("inset")
        func frame(_ x: CGFloat) -> CGRect { CGRect(x: x, y: 300, width: width, height: 180) }
        let left = frame(visible.minX + threshold - 1)
        let right = frame(visible.maxX - width - threshold + 1)
        #expect(PinnedNotePanels.snapped(left, to: visible) == frame(visible.minX + inset))
        #expect(PinnedNotePanels.snapped(right, to: visible) == frame(visible.maxX - width - inset))
        for x in [visible.minX + threshold, visible.midX, visible.maxX - width - threshold] {
            #expect(PinnedNotePanels.snapped(frame(x), to: visible) == frame(x))
        }
        #expect(visible.contains(PinnedNotePanels.snapped(visible, to: visible)))
    }

    @Test func newCardsStackFromTopRightAndStayOnScreenWhenFull() {
        let size = CGSize(width: metric("sidebar") + metric("rail"), height: metric("editor") * 2)
        let cards = (0..<5).map { PinnedNotePanels.defaultFrame(size: size, in: visible, openCount: $0) }
        #expect(cards.allSatisfy { visible.contains($0) && $0.size == size })
        #expect(cards[0].maxX == visible.maxX - metric("inset"))
        #expect(cards[0].maxY == visible.maxY - metric("inset"))
        for index in 1...2 {
            #expect(cards[index].minX == cards[0].minX)
            #expect(cards[index].maxY == cards[index - 1].minY - metric("gap"))
        }
        #expect(cards.last?.minY == visible.minY)
    }

    @Test func menuTitlesUseOneTrimmedLineOrLocalizedFallback() {
        let fallback = "ピン留めメモ"
        #expect(PinnedNotePanels.menuTitle("  Một dòng  \r\nDòng hai", fallback: fallback) == "Một dòng")
        #expect(PinnedNotePanels.menuTitle(" \t\n", fallback: fallback) == fallback)
        let long = String(repeating: "界", count: 150)
        let title = PinnedNotePanels.menuTitle(long, fallback: fallback)
        #expect(title.hasSuffix("…") && title.count < long.count)
    }

    @Test func draftCoalescesTypingAndFlushesTheLatestTextImmediately() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("notes.json")
        let notes = PinnedNotes(file: file)
        let note = try #require(notes.add(text: "Original"))
        let draft = PinnedNoteDraft(id: note.id, notes: notes)
        draft.text = "First"
        draft.text = "Second"
        #expect(notes.notes.first?.text == "Original")
        // Allow the main actor to run the delayed save, without depending on exact timer delivery.
        let deadline = ContinuousClock.now + .seconds(3)
        while notes.notes.first?.text != "Second", ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(PinnedNotes(file: file).notes.first?.text == "Second")
        draft.text = "Final"
        draft.flush()
        #expect(PinnedNotes(file: file).notes.first?.text == "Final")
    }

    @Test func generatedResourcesIncludePinnedNoteStrings() throws {
        for locale in ["vi", "en", "ja"] {
            let strings = try #require(NativeResources.shared.locales[locale])
            for key in ["pinnedNote", "newPinnedNote", "pinnedNotePlaceholder", "pinnedNoteBody", "pinnedNoteCopy",
                        "pinnedNoteDelete", "pinnedNoteCreated", "pinnedNoteDeleted", "pinnedNoteRestore"] {
                #expect(strings[key]?.isEmpty == false, "\(locale): \(key)")
            }
            #expect(strings["pinnedNoteLimit"]?.contains("{count}") == true)
            #expect(strings["pinnedNoteWindow"]?.contains("{source}") == true)
        }
    }
}
