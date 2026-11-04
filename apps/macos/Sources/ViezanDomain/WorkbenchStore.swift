import Foundation
import Observation

@MainActor @Observable public final class WorkbenchStore {
    public private(set) var workspace = Workspace()
    public let audio = NativeAudio()
    public let interpretation: Interpretation
    public let applications = Applications()
    public let thermalMonitor = ThermalMonitor()
    public let desktopIntegration = DesktopIntegration()
    public let modelManager = LocalModelManager()
    public let updates = NativeUpdates()
    public let localPerformance = LocalPerformance()
    public let localRuntime = LocalRuntime()
    /// The pair quick translate uses; until set, the Translate page's target with no secondary.
    public var quickTranslate: QuickTranslatePreferences {
        get { workspace.quickTranslate ?? QuickTranslatePreferences(primary: workspace.sessions.first { $0.id == workspace.active[Feature.translate.rawValue] }?.target ?? "vi") }
        set { guard newValue.valid, !loadBlocked else { return }; workspace.quickTranslate = newValue; save() }
    }
    public var speechProvider: String {
        // Unset means "auto": use whichever speech provider has a key on this device.
        get { workspace.speechProvider ?? "auto" }
        set { guard ["auto", "openai", "groq", "gemini"].contains(newValue), !loadBlocked else { return }; workspace.speechProvider = newValue; save() }
    }
    public private(set) var pendingTranscript: String?
    /// A fresh turn replaced completed work after a break; the previous session stays one click away.
    public struct ResetNotice: Equatable, Sendable { public let feature: Feature; public let previousID: String }
    public private(set) var resetNotice: ResetNotice?
    /// Wall-clock seconds; tests replace it to simulate a break.
    @ObservationIgnored public var clock: () -> Double = { Date().timeIntervalSince1970 }
    /// Break after which a completed Translate turn starts fresh (2 hours) or a Dictionary lookup does (30 minutes).
    public static let resetAfter: [Feature: Double] = [.translate: 7200, .dictionary: 1800]
    public var smartReset: Bool {
        get { workspace.smartReset ?? true }
        set { guard !loadBlocked else { return }; workspace.smartReset = newValue; save() }
    }
    @ObservationIgnored private var recordingRevision: Int?
    public private(set) var storageError: String?
    public private(set) var recovered = false
    public private(set) var loadBlocked = false
    public private(set) var localModels: [String] = []
    public private(set) var loadingModels = false
    public private(set) var modelError: String?
    /// What this device can run now (local runtimes + keyed cloud providers).
    public private(set) var providers = ProviderDiscovery.Snapshot()
    @ObservationIgnored private var discovery: Task<Void, Never>?
    public private(set) var discovering = false
    @ObservationIgnored private let listModels: @Sendable (String) async throws -> [String]
    @ObservationIgnored private let hasKey: @Sendable (String) -> Bool
    @ObservationIgnored private let persistence: any WorkspacePersistence
    @ObservationIgnored private var workers: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var autoTranslationRequest: Task<Void, Never>?
    @ObservationIgnored private var deferredSave: Task<Void, Never>?
    @ObservationIgnored private let automaticProvider: Bool

    /// Moves attachments no session references into recovery after bulk deletes; tests replace it.
    @ObservationIgnored public var quarantine: (Workspace) throws -> Void = { try Attachments.quarantineUnreferenced(workspace: $0) }
    public init(persistence: any WorkspacePersistence, automaticProvider: Bool = true, interpretation: Interpretation? = nil,
                listModels: @escaping @Sendable (String) async throws -> [String] = { try await ModelCatalog.models(provider: $0) },
                hasKey: @escaping @Sendable (String) -> Bool = { CredentialStore.has($0) }) {
        self.interpretation = interpretation ?? Interpretation()
        self.persistence = persistence; self.automaticProvider = automaticProvider
        self.listModels = listModels; self.hasKey = hasKey
        reload()
        // Quitting recorded when the current feature was left; reopening applies the same rule.
        applySmartReset(workspace.feature)
        if automaticProvider { scheduleUpdateCheck() }
    }
    public func moduleEnabled(_ route: String) -> Bool { !(workspace.disabledModules ?? []).contains(route == "everywhere" ? "translate" : route) }
    /// Pages of the workspace (one must stay on) and the two system services.
    public static let workspaceModules = ["chat", "translate", "interpret", "dictionary", "thermal", "apps"]
    public static let systemModules = ["utilities"]
    /// The one workspace module still enabled; it cannot be switched off.
    public var lockedModule: String? {
        let enabled = Self.workspaceModules.filter(moduleEnabled)
        return enabled.count == 1 ? enabled[0] : nil
    }
    public func setModule(_ module: String, enabled: Bool) {
        guard !loadBlocked, (Self.workspaceModules + Self.systemModules).contains(module) else { return }
        if !enabled, lockedModule == module { return }
        var disabled = Set(workspace.disabledModules ?? []); if enabled { disabled.remove(module) } else { disabled.insert(module) }
        workspace.disabledModules = disabled.sorted()
        if !enabled {
            for task in workspace.tasks where task.request.feature.rawValue == module && task.status == .running { cancel(task.id) }
            if module == "interpret" { interpretation.cancel() }
            if module == "thermal" { thermalMonitor.stop() }
            if module == "chat" || module == "translate" || module == "dictionary" { audio.cancel() }
        }
        applyVoice(); save()
    }
    public var session: Session { workspace.sessions.first { $0.id == workspace.active[workspace.feature.rawValue] }! }
    public func text(_ key: String) -> String { NativeResources.shared.text(key, locale: workspace.locale) }
    public func title(_ session: Session) -> String { session.title.isEmpty ? text(session.feature == .chat ? "newChat" : session.feature == .dictionary ? "newLookup" : "newTranslation") : session.title }
    /// Sessions for the history views, newest change first, only those with work. `features` nil =
    /// the current feature; an empty set = every enabled feature.
    public func history(query: String, archived: Bool = false, features: Set<Feature>? = nil) -> [Session] {
        func normalized(_ value: String) -> String {
            value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: workspace.locale))
                .replacingOccurrences(of: "đ", with: "d")
        }
        let needle = normalized(query.trimmingCharacters(in: .whitespacesAndNewlines))
        let scope = features ?? [workspace.feature]
        return workspace.sessions.filter { item in
            item.hasWork && item.comparisonParent == nil && (scope.isEmpty ? moduleEnabled(item.feature.rawValue) : scope.contains(item.feature)) && (item.archived == true) == archived && (needle.isEmpty || normalized(title(item) + " " + item.draft + " " + item.output + " " + item.messages.map(\.text).joined(separator: " ")).contains(needle))
        }.sorted { Self.historyTime($0, archived: archived) > Self.historyTime($1, archived: archived) }
    }
    /// When a history row happened: its last change, or for the archive when it was archived
    /// (sessions archived before `archivedAt` existed fall back to their last change).
    public static func historyTime(_ session: Session, archived: Bool) -> Double {
        (archived ? session.archivedAt ?? session.updated : session.updated) ?? 0
    }
    /// Delete any session that is not running, keeping it for Undo; comparisons go with their parent.
    @discardableResult public func removeSession(_ id: String) throws -> (session: Session, index: Int) {
        guard !loadBlocked, let index = workspace.sessions.firstIndex(where: { $0.id == id }), running(id) == nil else { throw StorageFailure.invalidData }
        let item = workspace.sessions[index]
        let ids = Set([id] + comparisons(id).map(\.id))
        guard !workspace.tasks.contains(where: { ids.contains($0.request.sessionID) && $0.status == .running }) else { throw StorageFailure.invalidData }
        if audio.recordingOwner == id || audio.transcribingOwner == id { audio.cancel() }
        var candidate = workspace; candidate.sessions.removeAll { ids.contains($0.id) }; candidate.tasks.removeAll { ids.contains($0.request.sessionID) }
        if candidate.active[item.feature.rawValue] == id {
            if let next = candidate.sessions.first(where: { $0.feature == item.feature && $0.archived != true && $0.comparisonParent == nil }) { candidate.active[item.feature.rawValue] = next.id }
            else { let next = Session(feature: item.feature); candidate.sessions.insert(next, at: 0); candidate.active[item.feature.rawValue] = next.id }
        }
        _ = try candidate.validated(); try persistence.save(candidate); workspace = candidate
        return (item, index)
    }
    /// Undo of `removeSession`: the session returns where it was and becomes current again.
    public func restoreSession(_ item: Session, at index: Int) {
        guard !loadBlocked, session(item.id) == nil else { return }
        workspace.sessions.insert(item, at: min(index, workspace.sessions.count))
        if item.archived != true { workspace.active[item.feature.rawValue] = item.id }
        save()
    }
    public func session(_ id: String) -> Session? { workspace.sessions.first { $0.id == id } }
    public func running(_ id: String) -> WorkTask? { workspace.tasks.first { $0.request.sessionID == id && $0.status == .running } }
    public func navigate(_ feature: Feature) {
        guard moduleEnabled(feature.rawValue) else { return }
        if workspace.feature != feature { markLeft(workspace.feature) }
        workspace.feature = feature; applySmartReset(feature); save()
    }
    private func markLeft(_ feature: Feature) {
        var left = workspace.featureLeft ?? [:]; left[feature.rawValue] = clock(); workspace.featureLeft = left
    }
    /// Returning after the feature's break with completed, saved work opens a new turn and remembers the old one.
    /// Drafts, running work and unfinished turns are never replaced.
    public func applySmartReset(_ feature: Feature) {
        guard !loadBlocked, smartReset, let after = Self.resetAfter[feature], let left = workspace.featureLeft?[feature.rawValue] else { return }
        var leftTimes = workspace.featureLeft ?? [:]; leftTimes.removeValue(forKey: feature.rawValue); workspace.featureLeft = leftTimes
        guard clock() - left >= after, let activeID = workspace.active[feature.rawValue], let active = session(activeID),
              !active.output.isEmpty, running(activeID) == nil, workspace.tasks.first(where: { $0.request.sessionID == activeID })?.status != .interrupted else { return }
        var item = Session(feature: feature); if let preferredModel { item.model = preferredModel }
        item.source = active.source; item.target = active.target
        workspace.sessions.insert(item, at: 0); workspace.active[feature.rawValue] = item.id
        resetNotice = ResetNotice(feature: feature, previousID: activeID)
    }
    public func reopenPrevious() {
        guard let notice = resetNotice else { return }
        resetNotice = nil
        // The empty replacement turn leaves with the notice; the previous work becomes active again.
        if let fresh = workspace.active[notice.feature.rawValue], let item = session(fresh), item.draft.isEmpty, item.output.isEmpty, item.messages.isEmpty {
            workspace.sessions.removeAll { $0.id == fresh }
        }
        select(notice.previousID)
    }
    public func dismissResetNotice() { resetNotice = nil }
    public func setRoute(_ route: String) {
        guard !loadBlocked, ["home", "chat", "translate", "dictionary", "settings", "utilities", "everywhere", "thermal", "interpret", "apps"].contains(route) else { return }
        var shell = workspace.shell ?? ShellPreferences()
        shell.lastRoute = route == "settings" ? "home" : route
        workspace.shell = shell; save()
    }
    public func setNavigationCollapsed(_ collapsed: Bool) {
        guard !loadBlocked, collapsed != workspace.navigationCollapsed else { return }
        var shell = workspace.shell ?? ShellPreferences()
        shell.navigationCollapsed = collapsed
        workspace.shell = shell; save()
    }
    public func select(_ id: String) {
        guard let session = session(id), moduleEnabled(session.feature.rawValue), session.archived != true else { return }
        if resetNotice?.feature == session.feature { resetNotice = nil }
        workspace.feature = session.feature; workspace.active[session.feature.rawValue] = id; save()
    }
    public func importBackup(_ preview: BackupPreview, restorePreferences: Bool = false) throws {
        autoTranslationRequest?.cancel(); autoTranslationRequest = nil
        guard !loadBlocked else { throw StorageFailure.invalidData }
        let known = Set(workspace.sessions.map(\.id))
        let additions = preview.sessions.filter { !known.contains($0.id) }
        try NativeBackup.materialize(preview)
        var candidate = workspace; candidate.sessions.append(contentsOf: additions)
        let importedIDs = Set(additions.map(\.id)), taskIDs = Set(candidate.tasks.map(\.id))
        candidate.tasks.append(contentsOf: preview.tasks.filter { importedIDs.contains($0.request.sessionID) && !taskIDs.contains($0.id) })
        let promptIDs = Set((candidate.prompts ?? []).map(\.id))
        candidate.prompts = (candidate.prompts ?? []) + preview.prompts.filter { !promptIDs.contains($0.id) }
        if restorePreferences {
            candidate.locale = preview.preferences.locale; candidate.appearance = preview.preferences.appearance
            candidate.autoTranslate = preview.preferences.autoTranslate; candidate.autoTranslateDelay = preview.preferences.autoTranslateDelay
            candidate.voice = preview.preferences.voice; candidate.speechProvider = preview.preferences.speechProvider
            candidate.runtime = preview.preferences.runtime; candidate.rates = preview.preferences.rates
        }
        _ = try candidate.validated()
        // Persist before publishing: import must never report success on a failed save.
        if !preview.interpretation.isEmpty { try interpretation.importArchive(preview.interpretation) }
        try persistence.save(candidate); workspace = candidate; applyVoice()
    }
    public func renameSession(_ id: String, title: String) {
        let value = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(256))
        // An emptied name falls back to the title the session got from its first question.
        edit(id) { item in item.title = value.isEmpty ? item.firstTitle : value }
    }
    public func archiveSession(_ id: String, archived: Bool) {
        guard !loadBlocked, let target = session(id) else { return }
        if archived {
            cancelComparisons(id)
            if let task = running(id) { cancel(task.id) }
            if audio.recordingOwner == id || audio.transcribingOwner == id { audio.cancel() }
        }
        edit(id, persist: false) { $0.archived = archived; $0.archivedAt = archived ? self.clock() : nil }
        if archived && workspace.active[target.feature.rawValue] == id {
            if let next = workspace.sessions.first(where: { $0.feature == target.feature && $0.archived != true }) {
                workspace.active[target.feature.rawValue] = next.id
            } else {
                let next = Session(feature: target.feature)
                workspace.sessions.insert(next, at: 0); workspace.active[target.feature.rawValue] = next.id
            }
        }
        save()
    }
    public func trimHistory(keeping count: Int) throws {
        guard !loadBlocked, [20, 100, 500, 1000].contains(count), !workspace.tasks.contains(where: { $0.status == .running }) else { throw StorageFailure.invalidData }
        var candidate = workspace; var retained: [Feature: Int] = [:]; var removed = Set<String>()
        let active = Set(candidate.active.values)
        let protectedParents = Set(candidate.sessions.filter { active.contains($0.id) || $0.favorite == true }.compactMap(\.comparisonParent))
        for item in candidate.sessions.sorted(by: { ($0.updated ?? 0) > ($1.updated ?? 0) }) where item.comparisonParent == nil {
            if protectedParents.contains(item.id) || active.contains(item.id) || item.favorite == true || (!item.draft.isEmpty && (item.feature == .chat || item.output.isEmpty)) { continue }
            retained[item.feature, default: 0] += 1
            if retained[item.feature, default: 0] > count { removed.insert(item.id) }
        }
        for item in candidate.sessions where item.comparisonParent.map({ removed.contains($0) }) == true { removed.insert(item.id) }
        candidate.sessions.removeAll { removed.contains($0.id) }; candidate.tasks.removeAll { removed.contains($0.request.sessionID) }
        _ = try candidate.validated(); try persistence.save(candidate); workspace = candidate
        try Attachments.quarantineUnreferenced(workspace: candidate)
    }
    /// Sessions "Clear history" removes: every Chat, Translate and Dictionary session with work
    /// (archived ones and favourites included), plus every Interpretation transcript.
    public var clearableHistoryCount: Int {
        workspace.sessions.filter { $0.comparisonParent == nil && ($0.hasWork || $0.archived == true) }.count + interpretation.sessions.count
    }
    /// "Clear history": everything goes, after a confirmation (it cannot be undone). Each feature keeps
    /// one empty session with its model and language pair; nothing runs while it happens.
    public func clearHistory() throws {
        guard !loadBlocked, !interpretation.busy, !interpretation.storageBlocked, !workspace.tasks.contains(where: { $0.status == .running }) else { throw StorageFailure.invalidData }
        var candidate = workspace; candidate.sessions = []; candidate.tasks = []
        for feature in Feature.allCases {
            var fresh = Session(feature: feature)
            if let previous = workspace.active[feature.rawValue].flatMap(session) { fresh.model = previous.model; fresh.source = previous.source; fresh.target = previous.target }
            candidate.sessions.append(fresh); candidate.active[feature.rawValue] = fresh.id
        }
        _ = try candidate.validated(); try persistence.save(candidate)
        workspace = candidate; resetNotice = nil
        try quarantine(candidate)
        try interpretation.clearAll()
    }
    public func deleteArchivedSession(_ id: String) throws {
        guard !loadBlocked, let item = session(id), item.archived == true, running(id) == nil else { throw StorageFailure.invalidData }
        let ids = Set([id] + comparisons(id).map(\.id))
        guard !workspace.tasks.contains(where: { ids.contains($0.request.sessionID) && $0.status == .running }) else { throw StorageFailure.invalidData }
        var candidate = workspace; candidate.sessions.removeAll { ids.contains($0.id) }; candidate.tasks.removeAll { ids.contains($0.request.sessionID) }
        _ = try candidate.validated(); try persistence.save(candidate); workspace = candidate
    }
    public func exportSession(_ id: String) throws -> Data {
        guard let item = session(id) else { throw StorageFailure.invalidData }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(item)
    }
    @discardableResult public func createDetachedSession(feature: Feature, draft: String = "") -> String {
        var item = Session(feature: feature)
        item.model = providers.availability(session.model) == .available ? session.model : preferredModel ?? session.model
        item.source = session.source; item.target = session.target; item.draft = draft
        guard !loadBlocked else { return session.id }
        workspace.sessions.insert(item, at: 0); save(); return item.id
    }
    public func newSession() {
        guard !loadBlocked else { return }
        if resetNotice?.feature == workspace.feature { resetNotice = nil }
        var item = Session(feature: workspace.feature)
        if let preferredModel { item.model = preferredModel }
        // Earlier sessions of this feature that never got any work are not history: sweep them,
        // so "New chat" pressed ten times leaves one chat, not ten.
        let feature = workspace.feature
        let busy = Set(workspace.tasks.filter { $0.status == .running }.map(\.request.sessionID))
        workspace.sessions.removeAll { $0.feature == feature && $0.comparisonParent == nil && $0.archived != true && !$0.hasWork && $0.title.isEmpty && !busy.contains($0.id) }
        workspace.sessions.insert(item, at: 0); workspace.active[item.feature.rawValue] = item.id; save()
    }
    private func edit(_ id: String, persist: Bool = true, _ mutation: (inout Session) -> Void) {
        guard !loadBlocked, let index = workspace.sessions.firstIndex(where: { $0.id == id }) else { return }
        mutation(&workspace.sessions[index]); workspace.sessions[index].updated = clock(); if persist { save() }
    }
    public func setCarefulReasoning(_ id: String, _ enabled: Bool) {
        guard session(id)?.feature == .chat else { return }
        edit(id) { $0.carefulReasoning = enabled }
    }
    /// The three purposes for the session's provider, or nil when they would not differ.
    public func modelTiers(_ id: String) -> [ModelTier: String]? {
        guard let current = session(id) else { return nil }
        return ModelLineup.tiers(for: current.model, listing: providers.models[ModelLineup.provider(current.model)] ?? [])
    }
    /// Pick by purpose: the tier's model, and careful reasoning only for Careful.
    public func applyModelTier(_ id: String, _ tier: ModelTier) {
        guard let model = modelTiers(id)?[tier] else { return }
        setModel(id, model)
        if session(id)?.feature == .chat { setCarefulReasoning(id, tier == .careful) }
    }
    /// The picker's Recent group: distinct models of the latest sessions with work, newest first.
    public var recentPicks: [String] { ModelLineup.recent(workspace.sessions.filter { !$0.messages.isEmpty || !$0.output.isEmpty }.sorted { ($0.updated ?? 0) > ($1.updated ?? 0) }.map(\.model)) }
    public func setAutoTranslate(_ enabled: Bool, delay: Int? = nil) {
        guard !loadBlocked, delay == nil || (100...5000).contains(delay!) else { return }
        workspace.autoTranslate = enabled; if let delay { workspace.autoTranslateDelay = delay }; save()
        scheduleTranslation(session.id)
    }
    private func scheduleTranslation(_ id: String) {
        autoTranslationRequest?.cancel(); autoTranslationRequest = nil
        guard automaticProvider, workspace.autoTranslate == true, storageError == nil, !loadBlocked,
              let value = session(id), value.feature == .translate, value.archived != true,
              workspace.feature == .translate, workspace.active["translate"] == id, comparisons(id).isEmpty,
              !value.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !(value.images ?? []).isEmpty else { return }
        let revision = value.revision, model = value.model, delay = workspace.autoTranslateDelay ?? 800
        autoTranslationRequest = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(delay)); try Task.checkCancellation() } catch { return }
            guard let self, self.workspace.autoTranslate == true, self.workspace.feature == .translate,
                  self.workspace.active["translate"] == id, self.session(id)?.revision == revision, self.session(id)?.model == model, self.session(id)?.archived != true,
                  self.audio.recordingOwner == nil, !self.audio.permissionPending, self.audio.transcribingOwner == nil,
                  self.storageError == nil, self.running(id) == nil else { return }
            self.autoTranslationRequest = nil; self.submit(id)
        }
    }
    public func setDraft(_ id: String, _ text: String) {
        guard let current = session(id), current.draft != text else { return }
        if current.feature != .chat { cancelComparisons(id) }
        if current.feature != .chat, let task = running(id) { cancel(task.id) }
        edit(id) { item in
            item.draft = text; item.revision += 1; item.assemblyParts = nil
            if item.feature != .chat { item.output = "" }
        }
        scheduleTranslation(id)
    }
    public func setModel(_ id: String, _ model: String) {
        guard NativeModel.valid(model) else { return }
        edit(id) { $0.model = model }; scheduleTranslation(id)
    }
    public func setPair(_ id: String, source: String, target: String) {
        guard (NativeResources.shared.nativeLanguages + ["auto"]).contains(source), NativeResources.shared.nativeLanguages.contains(target) else { return }
        cancelComparisons(id)
        if let task = running(id) { cancel(task.id) }
        edit(id) { $0.assemblyParts = nil; $0.source = source; $0.target = target; $0.revision += 1; $0.output = "" }; scheduleTranslation(id)
    }
    public func startRecording() async {
        guard !loadBlocked, !audio.permissionPending, audio.recordingOwner == nil, audio.transcribingOwner == nil else { return }
        let current = session
        recordingRevision = current.revision
        await audio.start(owner: current.id, language: current.feature == .chat ? "auto" : current.source)
    }
    public func stopRecording() {
        let revision = recordingRevision
        audio.stop(provider: speechProvider) { [weak self] owner, text in
            guard let self else { return }
            if let target = self.session(owner), target.revision == revision { self.setDraft(owner, target.draft.isEmpty ? text : target.draft + "\n" + text) }
            else { self.pendingTranscript = [self.pendingTranscript, text].compactMap { $0 }.joined(separator: "\n") }
        }
    }
    public func usePendingTranscript() {
        guard let text = pendingTranscript else { return }
        setDraft(session.id, session.draft.isEmpty ? text : session.draft + "\n" + text); pendingTranscript = nil
    }
    public func addImage(_ image: ImageAttachment, sessionID: String) {
        guard let target = session(sessionID), [.chat, .translate].contains(target.feature), target.archived != true, (target.images?.count ?? 0) < (target.feature == .translate ? 1 : 4) else { return }
        if target.feature == .translate, let task = running(sessionID) { cancel(task.id) }
        edit(sessionID) { $0.images = ($0.images ?? []) + [image]; $0.revision += 1; if $0.feature == .translate { $0.output = "" } }; scheduleTranslation(sessionID)
    }
    public func removeImage(_ imageID: String, sessionID: String) {
        if session(sessionID)?.feature == .translate, let task = running(sessionID) { cancel(task.id) }
        edit(sessionID) { $0.images?.removeAll { $0.id == imageID }; $0.revision += 1; if $0.feature == .translate { $0.output = "" } }; scheduleTranslation(sessionID)
    }
    public func savePrompt(name: String, text: String) {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !loadBlocked, !name.isEmpty, name.count <= 100, text.utf8.count <= 32768, (workspace.prompts?.count ?? 0) < 500 else { return }
        if workspace.prompts == nil { workspace.prompts = [] }
        if let index = workspace.prompts?.firstIndex(where: { $0.name == name }) { workspace.prompts?[index].text = text }
        else { workspace.prompts?.append(SavedPrompt(name: name, text: text)) }; save()
    }
    public func deletePrompt(_ id: String) { guard !loadBlocked else { return }; workspace.prompts?.removeAll { $0.id == id }; save() }
    public var menuBarVisible: Bool {
        get { workspace.menuBarVisible ?? true }
        set { guard !loadBlocked, menuBarVisible != newValue else { return }; workspace.menuBarVisible = newValue; save() }
    }
    public var menuBarTemperature: Bool {
        get { workspace.menuBarTemperature ?? true }
        set { guard !loadBlocked else { return }; workspace.menuBarTemperature = newValue; save() }
    }
    public var compareBySentence: Bool {
        get { workspace.compareBySentence ?? false }
        set { guard !loadBlocked else { return }; workspace.compareBySentence = newValue; save() }
    }
    public func comparisons(_ id: String) -> [Session] { workspace.sessions.filter { $0.comparisonParent == id } }
    private func cancelComparisons(_ id: String) { for item in comparisons(id) { if let task = running(item.id) { cancel(task.id) } } }
    public func compare(_ id: String, models: [String]) {
        // The caller's order is the column order: the session's model first (Swift and Qt alike).
        var seen = Set<String>(); let models = models.filter { seen.insert($0).inserted }
        guard !loadBlocked, let parent = session(id), parent.feature == .translate, !parent.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, parent.draft.count <= Self.translateLimit, (2...3).contains(models.count), models.allSatisfy(NativeModel.valid) else { return }
        cancelComparisons(id); edit(id) { $0.assemblyParts = nil }
        let old = Set(comparisons(id).map(\.id)); workspace.sessions.removeAll { old.contains($0.id) }; workspace.tasks.removeAll { old.contains($0.request.sessionID) }
        for model in models {
            var child = Session(feature: .translate); child.model = model; child.draft = parent.draft; child.source = parent.source; child.target = parent.target; child.reasoningEffort = parent.reasoningEffort; child.translationStyle = parent.translationStyle; child.translationMode = parent.translationMode; child.comparisonParent = id; child.comparisonRevision = parent.revision
            workspace.sessions.append(child); submit(child.id)
        }; save()
    }
    public func comparisonCurrent(_ child: Session) -> Bool { child.comparisonParent.flatMap(session)?.revision == child.comparisonRevision }
    public func adoptComparison(_ childID: String) {
        guard let child = session(childID), let parent = child.comparisonParent, comparisonCurrent(child), running(parent) == nil, running(childID) == nil, workspace.tasks.contains(where: { $0.request.sessionID == childID && $0.status == .succeeded }) else { return }
        edit(parent) { $0.output = child.output; $0.model = child.model }
    }
    public func useSentence(_ childID: String, index: Int) {
        guard let child = session(childID), let id = child.comparisonParent, let parent = session(id), comparisonCurrent(child), running(childID) == nil, workspace.tasks.contains(where: { $0.request.sessionID == childID && $0.status == .succeeded }) else { return }
        let source = LanguageSegments.sentences(parent.draft), translated = LanguageSegments.sentences(child.output)
        guard translated.count == source.count, translated.indices.contains(index) else { return }
        edit(id) { if $0.assemblyParts == nil { $0.assemblyParts = [:] }; $0.assemblyParts?[String(index)] = translated[index] }
    }
    public func adoptAssembly(_ id: String) {
        guard running(id) == nil, let parent = session(id), let parts = parent.assemblyParts else { return }
        let count = LanguageSegments.sentences(parent.draft).count
        guard count > 0, (0..<count).allSatisfy({ parts[String($0)] != nil }) else { return }
        edit(id) { $0.output = (0..<count).compactMap { parts[String($0)] }.joined(separator: "\n") }
    }
    public func setChatMode(_ id: String, _ mode: String) {
        guard ["text", "web", "research", "image"].contains(mode), session(id)?.feature == .chat else { return }; edit(id) { $0.chatMode = mode }
    }
    private func receiveImages(taskID: String, attemptID: String, images: [ImageAttachment]) {
        guard let task = workspace.tasks.first(where: { $0.id == taskID && $0.attemptID == attemptID && $0.status == .running }) else { return }
        edit(task.request.sessionID, persist: false) { item in if let index = item.messages.firstIndex(where: { $0.id == taskID }) { item.messages[index].images = images } }
    }
    public func setSystemPrompt(_ id: String, _ prompt: String) {
        guard prompt.utf8.count <= 32768 else { return }
        edit(id) { $0.systemPrompt = prompt }
    }
    public func setReasoning(_ id: String, effort: String) {
        guard ["auto", "low", "medium", "high"].contains(effort), session(id)?.feature == .translate else { return }
        cancelComparisons(id); if let task = running(id) { cancel(task.id) }
        edit(id) { $0.reasoningEffort = effort; $0.revision += 1; $0.output = ""; $0.assemblyParts = nil }; scheduleTranslation(id)
    }
    public func setTranslationOptions(_ id: String, style: String, mode: String) {
        guard ["general", "formal", "casual", "business", "technical", "natural"].contains(style), ["translate", "annotate", "phonetic", "rewrite"].contains(mode), session(id)?.feature == .translate else { return }
        cancelComparisons(id)
        if let task = running(id) { cancel(task.id) }
        edit(id) { $0.assemblyParts = nil; $0.translationStyle = style; $0.translationMode = mode; $0.revision += 1; $0.output = "" }; scheduleTranslation(id)
    }
    public func setDictionaryContext(_ id: String, _ context: String) {
        // Same rule as setDraft: an unchanged context neither cancels work nor clears the entry.
        guard session(id)?.feature == .dictionary, context.count <= 500, (session(id)?.dictionaryContext ?? "") != context else { return }
        if let task = running(id) { cancel(task.id) }
        edit(id) { $0.dictionaryContext = context; $0.revision += 1; $0.output = "" }
    }
    public func toggleFavorite(_ id: String) {
        guard session(id)?.feature == .dictionary else { return }
        edit(id) { $0.favorite = !($0.favorite ?? false) }
    }
    public func setLocale(_ locale: String) {
        guard !loadBlocked, NativeResources.shared.locales[locale] != nil else { return }
        workspace.locale = locale; save()
    }
    public func setVoice(provider: String, voice: String, rate: Double? = nil) {
        let value = VoicePreferences(provider: provider, voice: voice, rate: rate ?? workspace.voice?.rate)
        guard !loadBlocked, value.valid else { return }; workspace.voice = value; applyVoice(); save()
    }
    // Updates: a background check at launch and daily; the prompt only for a version not snoozed.
    public private(set) var updatePrompt: NativeRelease?
    @ObservationIgnored private var updateTimer: Task<Void, Never>?
    public var autoCheckUpdates: Bool {
        get { workspace.updates?.autoCheck ?? true }
        set { guard !loadBlocked else { return }; var value = workspace.updates ?? UpdatePreferences(); value.autoCheck = newValue; workspace.updates = value; save() }
    }
    public func updateSnoozed(_ version: String) -> Bool {
        guard let value = workspace.updates, value.snoozedVersion == version, let until = value.snoozedUntil else { return false }
        return clock() < until
    }
    /// "Remind me in 24 hours": the prompt leaves and this version stays quiet for a day.
    public func snoozeUpdate() {
        guard let release = updatePrompt else { return }
        var value = workspace.updates ?? UpdatePreferences(); value.snoozedVersion = release.version; value.snoozedUntil = clock() + 86_400
        workspace.updates = value; updatePrompt = nil; save()
    }
    public func dismissUpdatePrompt() { updatePrompt = nil }
    /// Shows the prompt when a check (background or manual) found a version that is not snoozed.
    public func presentUpdateIfAvailable() {
        guard let release = updates.release, !updateSnoozed(release.version) else { return }
        updatePrompt = release
    }
    func scheduleUpdateCheck() {
        updateTimer?.cancel()
        updateTimer = Task { [weak self] in
            // A minute after launch, then once a day; never while another check or download runs.
            var delay: Duration = .seconds(60)
            while !Task.isCancelled {
                try? await Task.sleep(for: delay); guard !Task.isCancelled, let self else { return }
                delay = .seconds(86_400)
                guard self.autoCheckUpdates, !self.updates.busy else { continue }
                self.updates.check()
                while self.updates.busy { try? await Task.sleep(for: .milliseconds(500)); if Task.isCancelled { return } }
                self.presentUpdateIfAvailable()
            }
        }
    }
    private func applyVoice() {
        let value = workspace.voice ?? VoicePreferences()
        for playback in [audio, interpretation.playback] where playback.voiceProvider != value.provider || playback.voiceID != value.voice || playback.voiceRate != value.rate ?? 1 {
            playback.stopSpeaking(); playback.voiceProvider = value.provider; playback.voiceID = value.voice; playback.voiceRate = value.rate ?? 1
        }
    }
    public func setRuntime(parallel: Int, context: Int) {
        let value = RuntimePreferences(parallel: parallel, context: context)
        guard !loadBlocked, !localRuntime.owned, !localRuntime.busy, value.valid else { return }
        workspace.runtime = value; save()
    }
    public func setAppearance(mode: AppearanceMode? = nil, textSize: ReadingSize? = nil, preset: String? = nil, accent: String? = nil) {
        guard !loadBlocked else { return }
        var preferences = workspace.preferences
        if let preset { guard ["graphite", "glass", "paper", "corporate", "midnight"].contains(preset) else { return }; preferences.preset = preset }
        if let accent { guard ["auto", "violet", "pink", "teal", "green", "amber", "red"].contains(accent) else { return }; preferences.accent = accent }
        if let mode { preferences.mode = mode }
        if let textSize { preferences.textSize = textSize }
        guard preferences != workspace.preferences else { return }
        workspace.appearance = preferences; save()
    }
    /// Longest source Translate sends (characters); longer text is refused before any provider call.
    public static let translateLimit = 5000
    @discardableResult public func submit(_ id: String) -> WorkTask? {
        autoTranslationRequest?.cancel(); autoTranslationRequest = nil
        guard !loadBlocked, let current = session(id), moduleEnabled(current.feature.rawValue), !(current.model.hasPrefix("ollama:") && localPerformance.busy), (!current.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || ([.chat, .translate].contains(current.feature) && !(current.images ?? []).isEmpty)),
              current.feature != .dictionary || (current.draft.count <= 120 && (current.dictionaryContext?.count ?? 0) <= 500),
              current.feature != .translate || current.draft.count <= Self.translateLimit, running(id) == nil else { return nil }
        var request = Request(sessionID: id, feature: current.feature, model: current.model, input: current.draft, source: current.source, target: current.target, revision: current.revision, locale: workspace.locale)
        request.reasoningEffort = current.reasoningEffort
        request.translationStyle = current.translationStyle; request.translationMode = current.translationMode
        request.systemPrompt = current.systemPrompt; request.chatMode = current.chatMode; request.carefulReasoning = current.carefulReasoning
        request.dictionaryContext = current.dictionaryContext
        request.messages = (current.feature == .chat ? current.messages : []).filter { !$0.text.isEmpty || !($0.images ?? []).isEmpty }.map { message in var value = ProviderMessage(role: message.role, content: message.text); value.images = message.images; return value }
        var user = ProviderMessage(role: "user", content: current.draft); user.images = current.images
        request.messages?.append(user)
        var task = WorkTask(id: UUID().uuidString, attemptID: UUID().uuidString, request: request, status: .running, output: "")
        task.started = clock()
        edit(id, persist: false) { item in
            if item.title.isEmpty { item.title = Session.derivedTitle(draft: current.draft, images: current.images) }
            if current.feature == .chat {
                item.messages.append(Message(id: UUID().uuidString, role: "user", text: current.draft, images: current.images))
                item.messages.append(Message(id: task.id, role: "assistant", text: ""))
                item.draft = ""; item.images = nil
            } else { item.output = ""; item.messages = [] }
        }
        workspace.tasks.insert(task, at: 0); save()
        guard savedForDispatch(task) else { return nil }
        start(task); return task
    }
    public func cancel(_ id: String) {
        autoTranslationRequest?.cancel(); autoTranslationRequest = nil
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id && $0.status == .running }) else { return }
        workspace.tasks[index].status = .cancelled; workspace.tasks[index].finished = clock()
        workers.removeValue(forKey: id)?.cancel(); save()
    }
    public func canRetry(_ task: WorkTask) -> Bool {
        guard !loadBlocked, let owner = session(task.request.sessionID), moduleEnabled(owner.feature.rawValue),
              !(task.request.model.hasPrefix("ollama:") && localPerformance.busy) else { return false }
        // A finished chat answer can be regenerated while it is still the newest message.
        let regenerate = task.request.feature == .chat && owner.messages.last?.id == task.id
        return (owner.comparisonParent == nil || comparisonCurrent(owner)) && owner.archived != true && task.status != .running && (task.status != .succeeded || regenerate) && running(owner.id) == nil &&
            (task.request.feature == .chat || owner.revision == task.request.revision)
    }
    private func savedForDispatch(_ task: WorkTask) -> Bool {
        guard storageError == nil else {
            if let index = workspace.tasks.firstIndex(where: { $0.id == task.id && $0.attemptID == task.attemptID && $0.status == .running }) {
                workspace.tasks[index].status = .interrupted; workspace.tasks[index].errorCode = "storageError"
            }
            return false
        }
        return true
    }
    public func retry(_ id: String) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == id }), canRetry(workspace.tasks[index]) else { return }
        workspace.tasks[index].attemptID = UUID().uuidString
        workspace.tasks[index].attemptNumber += 1
        workspace.tasks[index].status = .running; workspace.tasks[index].output = ""; workspace.tasks[index].errorCode = nil; workspace.tasks[index].errorDetail = nil
        workspace.tasks[index].started = clock(); workspace.tasks[index].finished = nil
        let task = workspace.tasks[index]
        edit(task.request.sessionID, persist: false) { item in
            if item.feature != .chat { item.output = "" }
            else if let i = item.messages.firstIndex(where: { $0.id == id }) { item.messages[i].text = "" }
        }
        save(); if savedForDispatch(task) { start(task) }
    }
    // Both identities are required. A cancelled/previous attempt can never write later.
    public func receive(taskID: String, attemptID: String, chunk: String, terminal: TaskStatus? = nil) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == taskID && $0.attemptID == attemptID && $0.status == .running }) else { return }
        let request = workspace.tasks[index].request
        guard let sessionIndex = workspace.sessions.firstIndex(where: { $0.id == request.sessionID }),
              (workspace.sessions[sessionIndex].comparisonParent == nil || comparisonCurrent(workspace.sessions[sessionIndex])),
              request.feature == .chat || workspace.sessions[sessionIndex].revision == request.revision else { cancel(taskID); return }
        workspace.tasks[index].output += chunk
        if request.feature != .chat { workspace.sessions[sessionIndex].output = workspace.tasks[index].output }
        else if let i = workspace.sessions[sessionIndex].messages.firstIndex(where: { $0.id == taskID }) { workspace.sessions[sessionIndex].messages[i].text = workspace.tasks[index].output }
        if let terminal, terminal != .running {
            workspace.tasks[index].finished = clock()
            if terminal == .succeeded && ImageTranslation.isImageRequest(request) && ImageTranslation.parse(workspace.tasks[index].output) == nil {
                workspace.tasks[index].status = .failed; workspace.tasks[index].errorCode = "imageModelUnsupported"
                workers.removeValue(forKey: taskID); save(); return
            }
            if terminal == .succeeded && request.feature == .dictionary {
                // Models often wrap the JSON in a markdown fence despite the prompt; keep the JSON only.
                let json = DictionaryEntry.extractJSON(workspace.tasks[index].output)
                workspace.tasks[index].output = json; workspace.sessions[sessionIndex].output = json
                // "No entry for this term" is its own outcome, with suggestions, not a broken reply.
                if DictionaryEntry.parse(json) == nil { workspace.tasks[index].errorCode = DictionaryEntry.notFound(json) == nil ? "providerInvalidResponse" : "dictionaryNotFound" }
            }
            workspace.tasks[index].status = terminal == .succeeded && request.feature == .dictionary && DictionaryEntry.parse(workspace.tasks[index].output) == nil ? .failed : terminal; workers.removeValue(forKey: taskID); if workspace.tasks[index].status == .succeeded && request.feature == .dictionary { deduplicateDictionary(request.sessionID) }; save()
        } else { scheduleSave() }
    }
    private func deduplicateDictionary(_ id: String) {
        guard let index = workspace.sessions.firstIndex(where: { $0.id == id }) else { return }
        let current = workspace.sessions[index]
        func key(_ text: String) -> String { text.precomposedStringWithCanonicalMapping.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ") }
        var favorite = current.favorite == true
        for other in workspace.sessions.indices where other != index {
            let value = workspace.sessions[other]
            if value.feature == .dictionary && value.archived != true && value.source == current.source && value.target == current.target && key(value.draft) == key(current.draft) && key(value.dictionaryContext ?? "") == key(current.dictionaryContext ?? "") && running(value.id) == nil {
                favorite = favorite || value.favorite == true; workspace.sessions[other].archived = true; workspace.sessions[other].archivedAt = clock(); workspace.sessions[other].favorite = false
                if workspace.active["dictionary"] == value.id { workspace.active["dictionary"] = current.id }
            }
        }
        workspace.sessions[index].favorite = favorite
    }
    private func fail(taskID: String, attemptID: String, code: String, detail: String? = nil) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == taskID && $0.attemptID == attemptID && $0.status == .running }) else { return }
        workspace.tasks[index].errorCode = code; workspace.tasks[index].errorDetail = detail.flatMap { $0.isEmpty ? nil : $0 }
        receive(taskID: taskID, attemptID: attemptID, chunk: "", terminal: .failed)
    }
    // A local runtime that does not answer is "offline", not a generic provider error.
    nonisolated static func failureCode(_ error: Error, model: String, images: Bool = false) -> String {
        if let rejection = error as? ProviderRejection { return failureCode(rejection.failure, model: model, images: images) }
        // A request with images that the provider refuses or answers unusably usually means the model cannot read images.
        if images, let failure = error as? CloudFailure, [.rejected, .invalidResponse].contains(failure) { return "imageModelUnsupported" }
        if let failure = error as? CloudFailure { return failure.rawValue }
        let local = ProviderDiscovery.localProviders.contains { model.hasPrefix($0 + ":") }
        return local && (error is URLError || (error as? ProviderFailure) == .unavailable) ? "providerOffline" : "providerError"
    }
    /// Probes every provider concurrently and lets sessions without work follow what
    /// this device can run. A new call supersedes one still in flight.
    /// A provider's model listing as a Result (the async `Result { }` initializer needs a newer toolchain than CI's).
    private nonisolated static func listing(_ provider: String, _ list: @Sendable (String) async throws -> [String]) async -> Result<[String], Error> {
        do { return .success(try await list(provider)) } catch { return .failure(error) }
    }
    @discardableResult public func discoverProviders() -> Task<Void, Never> {
        discovery?.cancel(); discovering = true
        let list = listModels, hasKey = hasKey
        let probe = Task { [weak self] in
            var next = ProviderDiscovery.Snapshot()
            // Key presence never unlocks the keychain, so it is known immediately.
            next.keyed = Set(ProviderDiscovery.cloudProviders.filter(hasKey))
            next.speechKeyed = Set(["openai", "gemini", "groq"].filter(hasKey))
            await withTaskGroup(of: (String, Result<[String], Error>).self) { group in
                for provider in ProviderDiscovery.localProviders { group.addTask { await (provider, Self.listing(provider, list)) } }
                for await (provider, result) in group { if case .success(let models) = result { next.models[provider] = models } }
            }
            guard !Task.isCancelled, let self else { return }
            // Publish loopback results first: cloud listings may wait on the network or on
            // a keychain prompt, and readiness must not hang behind them.
            next.checked = true; publishProviders(next)
            await withTaskGroup(of: (String, Result<[String], Error>).self) { group in
                for provider in next.keyed.sorted() { group.addTask { await (provider, Self.listing(provider, list)) } }
                for await (provider, result) in group {
                    guard !Task.isCancelled else { continue }
                    switch result {
                    case .success(let models): next.models[provider] = models
                    // Kept for Settings: a rejected key reads differently from a network fault.
                    case .failure(let error): next.failures[provider] = WorkbenchStore.failureCode(error, model: provider + ":")
                    }
                    publishProviders(next)
                }
            }
            if !Task.isCancelled { discovering = false }
        }
        discovery = probe; return probe
    }
    /// Views call this; it never probes for stores without real providers (tests, previews).
    public func discoverIfNeeded() {
        guard automaticProvider, !providers.checked, !discovering else { return }
        discoverProviders()
    }
    private func publishProviders(_ snapshot: ProviderDiscovery.Snapshot) {
        providers = snapshot; localModels = snapshot.all; adoptAvailableModels()
        // Speech-to-text picks the best transcription model the account lists.
        audio.availableModels = snapshot.all; interpretation.availableModels = snapshot.all
    }
    private var recentModels: [String] { workspace.sessions.sorted { ($0.updated ?? 0) > ($1.updated ?? 0) }.map(\.model) }
    /// The model new or still-empty sessions use on this device, if any AI is available.
    public var preferredModel: String? { providers.preferredModel(recent: recentModels) }
    // Sessions that have produced nothing yet follow the device; sessions with work keep
    // their model (conversation-aware), and the view offers a one-click switch instead.
    private func adoptAvailableModels() {
        guard !loadBlocked, let preferred = preferredModel else { return }
        var changed = false
        for index in workspace.sessions.indices {
            let item = workspace.sessions[index]
            guard item.messages.isEmpty, item.output.isEmpty, item.comparisonParent == nil, running(item.id) == nil,
                  ![.available, .unknown].contains(providers.availability(item.model)) else { continue }
            workspace.sessions[index].model = preferred; changed = true
        }
        if changed { save() }
    }
    public func refreshModels(provider requestedProvider: String? = nil) async {
        guard !loadingModels else { return }
        loadingModels = true; modelError = nil
        defer { loadingModels = false }
        let provider = requestedProvider ?? session.model.split(separator: ":", maxSplits: 1).first.map(String.init) ?? "ollama"
        do {
            let models = try await listModels(provider.hasPrefix("demo.") ? "ollama" : provider)
            localModels = localModels.filter { !$0.hasPrefix(provider + ":") } + models
            if providers.checked { providers.models[provider] = models }
        }
        catch is CancellationError { }
        catch let failure as CloudFailure { modelError = failure.rawValue }
        // Local runtimes fail by not answering; say so instead of a generic provider error.
        catch { modelError = ProviderDiscovery.localProviders.contains(provider) ? "providerOffline" : "providerError" }
    }
    public var availableModels: [String] {
        Array(Set(localModels + [session.model])).filter { !$0.hasPrefix("demo.") }.sorted()
    }
    private func researchCheckpoint(_ state: ResearchState, taskID: String, attemptID: String) {
        guard let index = workspace.tasks.firstIndex(where: { $0.id == taskID && $0.attemptID == attemptID && $0.status == .running }) else { return }
        workspace.tasks[index].research = state; save()
    }
    @discardableResult public func setRate(model: String, rate: UsageRate) -> Bool {
        guard !loadBlocked, NativeModel.valid(model), rate.valid else { return false }
        var rates = workspace.rates ?? [:]; guard rates[model] != nil || rates.count < 1000 else { return false }
        rates[model] = rate; workspace.rates = rates; save(); return true
    }
    private func receiveUsage(_ value: TokenUsage, taskID: String, attemptID: String) {
        guard value.valid, let i = workspace.tasks.firstIndex(where: { $0.id == taskID && $0.attemptID == attemptID && $0.status == .running }) else { return }
        let old = workspace.tasks[i].usage ?? TokenUsage()
        workspace.tasks[i].usage = TokenUsage(input: min(1_000_000_000, old.input + value.input), output: min(1_000_000_000, old.output + value.output)); scheduleSave()
    }
    private func start(_ task: WorkTask) {
        guard automaticProvider else { return }
        let available = providers.all // image generation picks a model the account actually lists
            workers[task.id] = Task { [weak self] in
                do {
                    let receiver: @Sendable (String) async -> Void = { [weak self] chunk in
                        await self?.receive(taskID: task.id, attemptID: task.attemptID, chunk: chunk)
                    }
                    let usage: @Sendable (TokenUsage) async -> Void = { [weak self] value in await self?.receiveUsage(value, taskID: task.id, attemptID: task.attemptID) }
                    if ["web", "research"].contains(task.request.chatMode ?? "") {
                        try await ResearchPipeline.run(task.request, resume: task.research, usage: usage, checkpoint: { [weak self] state in
                            await self?.researchCheckpoint(state, taskID: task.id, attemptID: task.attemptID)
                        }, receive: receiver)
                    } else if task.request.chatMode == "image" {
                        let images = try await ImageGeneration.generate(task.request, available: available); try Task.checkCancellation()
                        self?.receiveImages(taskID: task.id, attemptID: task.attemptID, images: images)
                    } else { try await NativeProvider.stream(task.request, usage: usage, receive: receiver) }
                    try Task.checkCancellation()
                    self?.receive(taskID: task.id, attemptID: task.attemptID, chunk: "", terminal: .succeeded)
                } catch {
                    if !Task.isCancelled {
                        let images = ImageTranslation.isImageRequest(task.request) || !(task.request.messages?.last(where: { $0.role == "user" })?.images ?? []).isEmpty
                        let rejection = error as? ProviderRejection
                        self?.fail(taskID: task.id, attemptID: task.attemptID, code: task.request.chatMode == "image" ? (rejection?.failure ?? error as? CloudFailure)?.rawValue ?? "providerError" : WorkbenchStore.failureCode(error, model: task.request.model, images: images), detail: rejection?.detail)
                    }
                }
            }
    }
    public func reload() {
        autoTranslationRequest?.cancel(); autoTranslationRequest = nil
        guard workers.isEmpty else { return }
        do {
            if let saved = try persistence.load() {
                var loaded = saved.upgrading()
                recovered = loaded.tasks.contains { $0.status == .running }
                for i in loaded.tasks.indices where loaded.tasks[i].status == .running { loaded.tasks[i].status = .interrupted }
                // Titles imported with a mis-read encoding are repaired once, here, not at every display.
                for i in loaded.sessions.indices where TextRepair.looksDamaged(loaded.sessions[i].title) { loaded.sessions[i].title = TextRepair.repaired(loaded.sessions[i].title) }
                // Titles that captured a dropped file path get the image's (or file's) name instead.
                for i in loaded.sessions.indices where loaded.sessions[i].title.hasPrefix("file://") { loaded.sessions[i].title = Session.derivedTitle(draft: loaded.sessions[i].title, images: loaded.sessions[i].images) }
                workspace = loaded
            }
            loadBlocked = false; storageError = nil; applyVoice()
        } catch { loadBlocked = true; storageError = "storageLoadError" }
    }
    public func save() {
        deferredSave?.cancel(); deferredSave = nil
        guard !loadBlocked else { return }
        do { try persistence.save(workspace); storageError = nil }
        catch { storageError = "storageError" }
    }
    private func scheduleSave() {
        // Coalesce streaming writes; terminal events, edits and normal quit flush synchronously.
        guard deferredSave == nil else { return }
        deferredSave = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(200)); try Task.checkCancellation(); self?.save() }
            catch { /* A synchronous save already flushed the current state. */ }
        }
    }
    public func shutdown() {
        autoTranslationRequest?.cancel(); autoTranslationRequest = nil
        updateTimer?.cancel(); updateTimer = nil
        localPerformance.cancel(); updates.cancel(); localRuntime.stop(); interpretation.cancel(); thermalMonitor.stop(); desktopIntegration.shutdown(); modelManager.cancel(); audio.cancel()
        for worker in workers.values { worker.cancel() }
        workers.removeAll()
        for index in workspace.tasks.indices where workspace.tasks[index].status == .running { workspace.tasks[index].status = .interrupted }
        markLeft(workspace.feature)
        save()
    }
}
