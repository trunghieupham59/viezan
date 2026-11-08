import Foundation
import Testing
@testable import ViezanDomain

private let habitNow = 1_793_534_400.0
private func habitSession(_ feature: Feature = .translate, days: Double = 0, source: String = "en", target: String = "vi", mode: String = "text") -> Session {
    var session = Session(feature: feature)
    session.updated = habitNow - days * 86_400; session.output = "Saved content"
    session.source = source; session.target = target; session.chatMode = mode
    return session
}
private var habitCalendar: Calendar {
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!; return calendar
}
@Test func habitsRequireThreeOccurrencesAndKeepAuto() {
    let sessions = (1...3).map { habitSession(days: Double($0)) }
    let suggestions = HabitSuggestions.suggest(sessions: sessions, now: habitNow)
    #expect(suggestions.count == 1)
    #expect(suggestions.first?.action == .translatePair(source: "en", target: "vi"))
    #expect(suggestions.first?.count == 3)
    #expect(HabitSuggestions.suggest(sessions: Array(sessions.prefix(2)), now: habitNow).isEmpty)
    #expect(HabitSuggestions.suggest(sessions: (1...3).map { habitSession(days: Double($0), source: "auto") }, now: habitNow).first?.action == .translatePair(source: "auto", target: "vi"))
}
@Test func habitsUseThirtyDayWindowAndDecay() {
    let recent = [0.0, 1, 2].map { habitSession(days: $0) }
    let old = [20.0, 23, 25].map { habitSession(days: $0, source: "ja") }
    let suggestions = HabitSuggestions.suggest(sessions: old + recent, now: habitNow)
    #expect(suggestions.map(\.action) == [.translatePair(source: "en", target: "vi"), .translatePair(source: "ja", target: "vi")])
    #expect(suggestions[0].score > suggestions[1].score)
    #expect(HabitSuggestions.suggest(sessions: Array(recent.prefix(2)) + [habitSession(days: 30.01)], now: habitNow).isEmpty)
    #expect(HabitSuggestions.suggest(sessions: Array(recent.prefix(2)) + [habitSession(days: 30)], now: habitNow).first?.count == 3)
}
@Test func habitsBoostTimeOfDayAcrossMidnight() throws {
    let calendar = habitCalendar
    let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 11, day: 8, hour: 0, minute: 30))).timeIntervalSince1970
    let times = [5, 6, 7].map { day in calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: 23, minute: 30))!.timeIntervalSince1970 }
    let sessions = times.map { time in var session = habitSession(); session.updated = time; return session }
    let near = try #require(HabitSuggestions.suggest(sessions: sessions, now: now, calendar: calendar).first)
    let far = try #require(HabitSuggestions.suggest(sessions: sessions, now: now + 5 * 3600, calendar: calendar).first)
    #expect(near.count == 3)
    let base = times.reduce(0) { $0 + exp(-(now - $1) / 86_400 / 10) }
    #expect(abs(near.score - base * 2) < 0.000001)
    #expect(abs(far.score - base * exp(-5.0 / 24 / 10)) < 0.000001)
    // Three timely occurrences also satisfy tier 2; shifting the clock removes only the boost.
    #expect(HabitSuggestions.suggest(sessions: Array(sessions.prefix(2)), now: now, calendar: calendar).isEmpty)
}
@Test func habitsFilterDefaultsComparisonsEmptyAndExcludedActions() {
    let actions = (0...2).flatMap { day in [habitSession(.chat, days: Double(day), mode: "text"), habitSession(.chat, days: Double(day), mode: "image"), habitSession(.chat, days: Double(day), mode: "web"), habitSession(.dictionary, days: Double(day)), habitSession(days: Double(day))] }
    let suggestions = HabitSuggestions.suggest(sessions: actions, now: habitNow, excluding: .chatMode("image"), limit: 2)
    #expect(suggestions.count == 2)
    #expect(!suggestions.contains { $0.action == .chatMode("image") || $0.action == .chatMode("text") })
    var comparison = habitSession(); comparison.comparisonParent = "parent"
    var empty = habitSession(); empty.output = ""; empty.draft = "Draft only"
    var undated = habitSession(); undated.updated = nil
    #expect(HabitSuggestions.suggest(sessions: [comparison, empty, undated] + [habitSession(), habitSession()], now: habitNow).isEmpty)
    #expect(HabitSuggestions.suggest(sessions: actions, now: habitNow, limit: 0).isEmpty)
}
@Test @MainActor func storeHabitsUseClockModulesAndCurrentMode() {
    let persistence = MemoryPersistence()
    var workspace = Workspace()
    workspace.sessions += (1...3).flatMap { day in [habitSession(days: Double(day)), habitSession(.chat, days: Double(day), mode: "image")] }
    persistence.value = workspace
    let store = WorkbenchStore(persistence: persistence, automaticProvider: false)
    store.clock = { habitNow }
    let id = store.session.id
    store.setChatMode(id, "image")
    #expect(store.habitSuggestions(for: id).map(\.action) == [.translatePair(source: "en", target: "vi")])
    store.setModule("translate", enabled: false)
    #expect(store.habitSuggestions(for: id).isEmpty)
    store.setModule("translate", enabled: true)
    store.clock = { habitNow + 31 * 86_400 }
    #expect(store.habitSuggestions(for: id).isEmpty)
}
