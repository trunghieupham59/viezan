import Foundation
import Testing
@testable import ViezanDomain

struct LauncherFileSearchTests {
    let now = Date(timeIntervalSince1970: 1_709_251_200) // 2024-03-01T00:00:00Z

    @Test func contentQueryQuotesUserText() {
        #expect(LauncherFiles.contentQuery(#"a"b*"#) == #"kMDItemTextContent == "*a\"b\**"cd"#)
        #expect(LauncherFiles.contentQuery(#"\'" || *"#) == #"kMDItemTextContent == "*\\\'\" || \**"cd"#)
    }

    @Test func readsOneObjectInModelReplies() throws {
        let json = #"{"keywords":[" kế hoạch ","見積"],"kinds":["pdf","unknown","pdf","text"],"within_days":14}"#
        for reply in [json, "```json\n\(json)\n```", "Kế hoạch tìm kiếm\n\(json)\nHết."] {
            let plan = try #require(FileSearchPlan.parse(reply))
            #expect(plan.keywords == ["kế hoạch", "見積"])
            #expect(plan.kinds == [.pdf, .text])
            #expect(plan.withinDays == 14)
        }
        #expect(FileSearchPlan.parse(json + "\n" + json) == nil)
        #expect(FileSearchPlan.parse("[\(json)]") == nil)
    }

    @Test func trimsAndBoundsDistinctKeywords() throws {
        let longest = String(repeating: "ế", count: 64)
        let reply = #"{"keywords":[" BẢNG ","bảng"," ","\#(longest)x","\#(longest)","a","b","c","d","e"]}"#
        let plan = try #require(FileSearchPlan.parse(reply))
        #expect(plan.keywords == ["BẢNG", longest, "a", "b", "c", "d"])
        #expect(plan.kinds.isEmpty)
        #expect(plan.withinDays == nil)
    }

    @Test func rejectsMalformedAndOversizedReplies() {
        let valid = #"{"keywords":["abc"]}"#
        let atLimit = valid.padding(toLength: 4_000, withPad: " ", startingAt: 0)
        #expect(FileSearchPlan.parse(atLimit) != nil)
        for reply in [
            "not JSON", "{}", #"{"keywords":"file"}"#, #"{"keywords":["file",3]}"#,
            #"{"keywords":["file"],"kinds":"pdf"}"#, #"{"keywords":[]}"#,
            #"{"keywords":[" ","\#(String(repeating: "x", count: 65))"]}"#, atLimit + " "
        ] {
            #expect(FileSearchPlan.parse(reply) == nil)
        }
    }

    @Test func acceptsOnlyInRangeIntegerDays() throws {
        for value in ["0", "-1", "99999", #""14""#, "true", "1.5", "null", "1", "3650"] {
            let plan = try #require(FileSearchPlan.parse(#"{"keywords":["notes"],"within_days":\#(value)}"#))
            #expect(plan.withinDays == (["1", "3650"].contains(value) ? Int(value) : nil))
        }
    }

    @Test func matchesNamesOrContentForEachKeyword() throws {
        let first = #"(kMDItemFSName == "*a\"b*"cd || kMDItemTextContent == "*a\"b*"cd)"#
        let second = #"(kMDItemFSName == "*見積*"cd || kMDItemTextContent == "*見積*"cd)"#
        let one = try #require(FileSearchPlan.parse(#"{"keywords":["a\"b"]}"#))
        #expect(one.query(matchAll: true, now: now) == first)
        let two = try #require(FileSearchPlan.parse(#"{"keywords":["a\"b","見積"]}"#))
        #expect(two.query(matchAll: true, now: now) == "(\(first) && \(second))")
        #expect(two.query(matchAll: false, now: now) == "(\(first) || \(second))")
    }

    @Test func filtersAllKeywordAlternativesByKindAndModificationDate() throws {
        let plan = try #require(FileSearchPlan.parse(#"{"keywords":["a","b"],"kinds":["pdf","image"],"within_days":14}"#))
        let terms = try #require(FileSearchPlan.parse(#"{"keywords":["a","b"]}"#))
        let types = #"(kMDItemContentTypeTree == "com.adobe.pdf"c || kMDItemContentTypeTree == "public.image"c)"#
        let date = "kMDItemFSContentChangeDate >= $time.iso(2024-02-16T00:00:00Z)"
        for matchAll in [true, false] {
            #expect(plan.query(matchAll: matchAll, now: now) == "\(terms.query(matchAll: matchAll, now: now)) && \(types) && \(date)")
        }
    }

    @Test func instructionNamesEveryKind() {
        let words = FileSearchPlan.instruction.split { !$0.isLetter }
        for kind in FileSearchPlan.Kind.allCases {
            #expect(words.contains(Substring(kind.rawValue)))
        }
    }

    @Test func mapsKindsToSpotlightTypeTrees() throws {
        let mappings: [(FileSearchPlan.Kind, [String])] = [
            (.pdf, ["com.adobe.pdf"]), (.image, ["public.image"]), (.text, ["public.plain-text"]),
            (.audio, ["public.audio"]), (.video, ["public.movie"]), (.folder, ["public.folder"]),
            (.document, ["com.microsoft.word.doc", "org.openxmlformats.wordprocessingml.document",
                         "com.apple.iwork.pages.pages", "com.apple.iwork.pages.sffpages"]),
            (.spreadsheet, ["public.spreadsheet"]), (.presentation, ["public.presentation"])
        ]
        for (kind, types) in mappings {
            let plan = try #require(FileSearchPlan.parse(#"{"keywords":["file"],"kinds":["\#(kind.rawValue)"]}"#))
            let query = plan.query(matchAll: true, now: now)
            for type in types {
                #expect(query.contains("kMDItemContentTypeTree == \"\(type)\"c"))
            }
        }
    }
}
