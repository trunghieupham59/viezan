import SwiftUI
import ViezanDomain

// Compare 2–3 models on the same source. Columns by default; the sentence view
// (remembered) lets one translation be assembled from the best sentence of each.
struct ComparisonPane: View {
    @Bindable var store: WorkbenchStore
    let sessionID: String
    /// Glass floating layer bounds and its close action (the classic popover ignores them).
    var maxWidth: CGFloat = .infinity
    var maxHeight: CGFloat = .infinity
    var close: () -> Void = {}
    @State private var selected: [String] = []
    @State private var filter = ""
    /// Glass step: choose models first, then read the results (Overlays-Language board).
    @State private var choosing: Bool?
    @AppStorage("viezan.compare.models") private var rememberedModels = ""
    @Environment(\.colorScheme) private var scheme
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    /// The store compares two or three models; the current one is always the first column.
    private static let maximum = 3
    private var session: Session? { store.session(sessionID) }
    private var children: [Session] { store.comparisons(sessionID) }
    // Pick 2–3 models this device can run (discovery), instead of typing raw model IDs.
    private var choices: [String] {
        let needle = filter.trimmingCharacters(in: .whitespaces).lowercased()
        return store.availableModels.filter { ProviderDiscovery.chatCapable($0) && (needle.isEmpty || nativeModelLabel($0, store: store).lowercased().contains(needle)) }
    }
    private func task(_ child: Session) -> WorkTask? { store.workspace.tasks.first { $0.request.sessionID == child.id } }
    private var finished: Int { children.filter { task($0)?.status == .succeeded }.count }
    private var sourceSentences: Int { LanguageSegments.sentences(session?.draft ?? "").count }
    var body: some View {
        if glass {
            if choosing ?? children.isEmpty { chooser } else { results }
        } else { classic }
    }
    private var current: String { session?.model ?? "" }
    private var others: [String] { selected.filter { $0 != current } }
    private func provider(_ model: String) -> String { model.split(separator: ":").first.map(String.init) ?? "" }
    private func providerName(_ model: String) -> String { nativeModelLabel(model, store: store).components(separatedBy: " · ").first ?? provider(model) }
    private var runnable: Bool {
        (2...Self.maximum).contains(Set([current] + others).count) && ([current] + others).allSatisfy(NativeModel.valid)
            && session?.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }
    private func run() {
        guard runnable else { return }
        rememberedModels = others.joined(separator: "\n")
        store.compare(sessionID, models: [current] + others); choosing = false
    }
    // Step 1: the current model locked as the first column, the rest grouped by provider.
    private var chooser: some View {
        let groups = Dictionary(grouping: choices.filter { $0 != current }, by: provider(_:))
        let order = groups.keys.sorted { providerName(groups[$0]![0]).localizedStandardCompare(providerName(groups[$1]![0])) == .orderedAscending }
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: metric("tight")) {
                    Text(store.text("compareChooseTitle")).font(.vzn("labelScale", .semibold)).accessibilityAddTraits(.isHeader)
                    Text(store.text("compareChooseHint").replacingOccurrences(of: "{max}", with: String(Self.maximum))).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                }
                Spacer(minLength: metric("small"))
                closeButton
            }.padding(.horizontal, metric("inset")).padding(.top, metric("gap")).padding(.bottom, metric("small"))
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Eyebrow(text: store.text("compareInUse")).padding(.horizontal, metric("inset")).padding(.top, metric("small")).padding(.bottom, metric("tight"))
                    choiceRow(current, locked: true)
                    ForEach(order, id: \.self) { key in
                        Eyebrow(text: providerName(groups[key]![0])).padding(.horizontal, metric("inset")).padding(.top, metric("gap")).padding(.bottom, metric("tight"))
                        ForEach(groups[key]!, id: \.self) { choiceRow($0, locked: false) }
                    }
                }.padding(.bottom, metric("small"))
            }.scrollIndicators(.hidden).frame(maxHeight: max(metric("control"), maxHeight - metric("editor") - metric("large")))
            SearchBox(query: $filter, label: store.text("compareFilter"), cancel: close, autofocus: false, compact: true)
                .padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            CardDivider()
            HStack(spacing: metric("small")) {
                Text(store.text("compareSelected").replacingOccurrences(of: "{count}", with: String(1 + others.count)).replacingOccurrences(of: "{max}", with: String(Self.maximum)))
                    .font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).monospacedDigit()
                Spacer(minLength: metric("small"))
                Button(store.text("cancel")) { if children.isEmpty { close() } else { choosing = false } }.buttonStyle(.vznQuiet)
                Button(store.text("compareRun").replacingOccurrences(of: "{count}", with: String(1 + others.count)), action: run)
                    .buttonStyle(.vznPrimary).keyboardShortcut(.defaultAction).disabled(!runnable).accessibilityIdentifier("compare-run")
            }.padding(.horizontal, metric("inset")).frame(height: metric("navControl") + metric("gap"))
        }.frame(width: min(maxWidth, metric("sidebar") + metric("editor") + metric("large") + metric("gap")))
            .onAppear {
                if selected.isEmpty {
                    let available = Set(store.availableModels)
                    selected = rememberedModels.split(separator: "\n").map(String.init).filter { available.contains($0) && $0 != current }.prefix(Self.maximum - 1).map { $0 }
                }
            }
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("compareChooseTitle"))
    }
    private func choiceRow(_ model: String, locked: Bool) -> some View {
        let on = locked || others.contains(model)
        let full = !on && others.count >= Self.maximum - 1
        return Toggle(isOn: Binding(get: { on }, set: { value in
            guard !locked else { return }
            if value { if !full { selected.append(model) } } else { selected.removeAll { $0 == model } }
        })) {
            HStack(spacing: metric("small")) {
                Text(ModelLineup.shortName(model)).foregroundStyle(contentColor(full ? "text-disabled" : "text-strong", scheme))
                Text(model.split(separator: ":").last.map(String.init) ?? model).font(.system(size: NSFont.systemFontSize * metric("smallScale"), design: .monospaced))
                    .foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
                Spacer(minLength: metric("small"))
                if locked { StatusBadge(text: store.text("compareFirstColumn"), tone: .busy) }
            }
        }.toggleStyle(.checkbox).disabled(locked || full).help(model)
            .padding(.horizontal, metric("inset")).frame(height: metric("navControl")).accessibilityIdentifier("compare-choice-" + model)
    }
    private var closeButton: some View {
        Button(action: close) { Image(systemName: "xmark") }.buttonStyle(.vznQuiet).help(store.text("close")).accessibilityLabel(store.text("close"))
    }
    // Step 2: one column per model, the first column is the reference for highlighted differences.
    private var results: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: metric("small")) {
                Text(store.text("compareModels")).font(.vzn("labelScale", .semibold)).accessibilityAddTraits(.isHeader)
                Text(store.text("compareProgress").replacingOccurrences(of: "{done}", with: String(finished)).replacingOccurrences(of: "{total}", with: String(children.count)))
                    .font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).monospacedDigit().accessibilityIdentifier("compare-progress")
                ForEach(children) { StatusBadge(text: ModelLineup.shortName($0.model), tone: .idle).help($0.model) }
                Button(store.text("compareChange")) { selected = children.map(\.model).filter { $0 != current }; choosing = true }
                    .buttonStyle(.plain).font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("action-text", scheme)).padding(.horizontal, metric("small"))
                Spacer(minLength: metric("small"))
                FilterTabs(label: store.text("compareModels"), items: [(false, store.text("compareColumns")), (true, store.text("compareSentences"))],
                           selection: Binding(get: { store.compareBySentence }, set: { store.compareBySentence = $0 }))
                closeButton
            }.padding(.horizontal, metric("inset")).frame(height: metric("navControl") + metric("gap"))
            if children.count > 1 { Text(store.text("compareDiffHint")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).padding(.horizontal, metric("inset")).padding(.bottom, metric("small")) }
            CardDivider()
            if sentenceRows {
                // Translate-States: "By sentence" reads one row per source sentence, a cell per model;
                // the cell chosen for the assembly is tinted with the accent.
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(LanguageSegments.sentences(session?.draft ?? "").enumerated()), id: \.offset) { index, sentence in
                            if index > 0 { CardDivider() }
                            sentenceRow(index, sentence)
                        }
                    }
                }.scrollIndicators(.hidden).frame(maxHeight: max(metric("control"), maxHeight - metric("editor")))
            } else {
            ScrollView([.horizontal, .vertical]) {
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(children.enumerated()), id: \.element.id) { index, child in
                        if index > 0 { Rectangle().fill(contentColor("divider", scheme)).frame(width: metric("hairline")).accessibilityHidden(true) }
                        glassColumn(child, width: max(metric("sidebar"), (min(maxWidth, metric("reading") + metric("compactSidebar")) - metric("hairline") * 2) / CGFloat(max(1, children.count))))
                    }
                }
            }.scrollIndicators(.hidden).frame(maxHeight: max(metric("control"), maxHeight - metric("editor")))
            }
            if let parts = session?.assemblyParts, !parts.isEmpty {
                CardDivider()
                HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                    Text(store.text("assembly")).font(.vzn("labelScale", .semibold))
                    Text(parts.keys.sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }.compactMap { parts[$0] }.joined(separator: " ")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(2).textSelection(.enabled)
                    Spacer(minLength: metric("small"))
                    Button(store.text("adoptTranslation")) { store.adoptAssembly(sessionID) }.buttonStyle(.vznOutline)
                        .disabled(parts.count != sourceSentences || store.running(sessionID) != nil)
                }.padding(.horizontal, metric("inset")).padding(.vertical, metric("small"))
            }
        }.frame(width: min(maxWidth, metric("reading") + metric("compactSidebar")))
            .accessibilityElement(children: .contain).accessibilityLabel(store.text("compareModels"))
    }
    /// Sentence rows need every model done with the same sentence count as the source.
    private var sentenceRows: Bool {
        store.compareBySentence && sourceSentences > 0 && !children.isEmpty
            && children.allSatisfy { task($0)?.status == .succeeded && LanguageSegments.sentences($0.output).count == sourceSentences }
    }
    private func sentenceRow(_ index: Int, _ sentence: String) -> some View {
        HStack(alignment: .top, spacing: metric("gap")) {
            Text(String(format: "%02d", index + 1)).font(.system(size: NSFont.systemFontSize * metric("smallScale"), weight: .semibold, design: .monospaced))
                .foregroundStyle(contentColor("text-soft", scheme)).frame(width: metric("gutter"), alignment: .leading).padding(.top, metric("hairline") * 3)
            VStack(alignment: .leading, spacing: metric("small")) {
                Text(sentence).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).textSelection(.enabled)
                HStack(alignment: .top, spacing: metric("small")) {
                    ForEach(children) { child in sentenceCell(child, index) }
                }
            }
        }.padding(.horizontal, metric("inset")).padding(.vertical, metric("gap"))
    }
    private func sentenceCell(_ child: Session, _ index: Int) -> some View {
        let rows = LanguageSegments.sentences(child.output), text = rows.indices.contains(index) ? rows[index] : ""
        let chosen = session?.assemblyParts?[String(index)] == text && !text.isEmpty
        let shape = RoundedRectangle(cornerRadius: metric("radius"), style: .continuous)
        return VStack(alignment: .leading, spacing: metric("small") - metric("hairline") * 2) {
            Text(ModelLineup.shortName(child.model) + (child.model == current ? " · " + store.text("compareInUse").lowercased() : ""))
                .font(.vzn("captionScale", .semibold)).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1).help(child.model)
            Text(text).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-strong", scheme)).textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            HStack {
                Spacer(minLength: 0)
                if chosen { StatusBadge(text: store.text("compareInUse"), tone: .busy) }
                else {
                    Button(store.text("useSentence")) { store.useSentence(child.id, index: index) }.buttonStyle(.plain).font(.vzn("smallScale", .medium))
                        .foregroundStyle(contentColor("action-text", scheme)).disabled(!store.comparisonCurrent(child))
                }
            }
        }
        .padding(.horizontal, metric("gap")).padding(.vertical, metric("small") + metric("hairline") * 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(contentColor(chosen ? "action" : "surface", scheme).opacity(chosen ? metric("selectionOpacity") * 0.8 : 0), in: shape)
        .overlay(shape.strokeBorder(chosen ? contentColor("action", scheme).opacity(metric("selectionOpacity") * 3) : contentColor("border", scheme), lineWidth: metric("hairline")))
        .accessibilityElement(children: .contain).accessibilityAddTraits(chosen ? .isSelected : [])
    }
    private func glassColumn(_ child: Session, width: CGFloat) -> some View {
        let task = task(child), current = store.comparisonCurrent(child), done = task?.status == .succeeded
        let rows = LanguageSegments.sentences(child.output)
        let reference = children.first.map { $0.id == child.id ? nil : $0 } ?? nil
        let referenceRows = reference.map { LanguageSegments.sentences($0.output) } ?? []
        let tone: StatusTone = done ? .ready : task?.status == .running ? .busy : task?.status == .failed ? .failed : .idle
        return VStack(alignment: .leading, spacing: metric("small")) {
            HStack(spacing: metric("small")) {
                Text(ModelLineup.shortName(child.model) + (child.model == self.current ? " · " + store.text("compareInUse").lowercased() : "")).font(.vzn("labelScale", .semibold)).lineLimit(1).help(child.model)
                Spacer(minLength: metric("small"))
                StatusBadge(text: task.map { store.text($0.status.rawValue) + ($0.duration.map { " · " + durationText($0, store: store) } ?? "") } ?? store.text("queued"), tone: tone)
            }
            if !current { Text(store.text("comparisonStale")).font(.vzn("smallScale")).foregroundStyle(contentColor("warning", scheme)) }
            if let task, task.status == .failed { TaskStatusText(store: store, task: task).font(.vzn("smallScale")) }
            if store.compareBySentence && rows.count == sourceSentences {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, text in
                    VStack(alignment: .leading, spacing: metric("tight")) {
                        Text(highlighted(text, against: referenceRows.indices.contains(index) ? referenceRows[index] : nil)).font(readingFont(store)).textSelection(.enabled)
                        Button(store.text("useSentence")) { store.useSentence(child.id, index: index) }.buttonStyle(.plain).font(.vzn("smallScale", .medium))
                            .disabled(!done || !current).foregroundStyle(contentColor("action-text", scheme))
                    }
                }
            } else { Text(highlighted(child.output, against: reference?.output)).font(readingFont(store)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true) }
            HStack(spacing: metric("small")) {
                Button(store.text("adoptTranslation")) { store.adoptComparison(child.id) }.buttonStyle(.vznOutline)
                    .disabled(!done || !current || store.running(sessionID) != nil)
                Button { copyText(child.output, store: store) } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.vznOutline).disabled(child.output.isEmpty).help(store.text("copy")).accessibilityLabel(store.text("copy"))
                if let task {
                    if task.status == .running { Button(store.text("stop"), role: .destructive) { store.cancel(task.id) }.buttonStyle(.vznQuiet) }
                    else if store.canRetry(task) { Button(store.text("retry")) { store.retry(task.id) }.buttonStyle(.vznQuiet) }
                }
            }.padding(.top, metric("tight"))
        }.padding(metric("inset")).frame(width: width, alignment: .leading)
    }
    private var classic: some View {
        VStack(alignment: .leading, spacing: metric("inset")) {
            HStack {
                Text(store.text("compareModels")).font(.vzn("labelScale", .semibold)).accessibilityAddTraits(.isHeader)
                Spacer()
                if !children.isEmpty {
                    Text(store.text("compareProgress").replacingOccurrences(of: "{done}", with: String(finished)).replacingOccurrences(of: "{total}", with: String(children.count)))
                        .font(.vzn("smallScale")).foregroundStyle(.secondary).monospacedDigit().accessibilityIdentifier("compare-progress")
                }
            }
            // Model choice: a filter field styled like the Dictionary context, then toggles.
            TextField(store.text("compareFilter"), text: $filter).textFieldStyle(.plain).font(.vzn("labelScale"))
                .padding(.horizontal, metric("gap")).frame(height: metric("control"))
                .background(contentColor("surface", scheme), in: RoundedRectangle(cornerRadius: metric("controlRadius")))
                .overlay(RoundedRectangle(cornerRadius: metric("controlRadius")).strokeBorder(contentColor("border", scheme), lineWidth: metric("hairline")))
            ScrollView {
                VStack(alignment: .leading, spacing: metric("tight")) {
                    ForEach(choices, id: \.self) { model in
                        Toggle(nativeModelLabel(model, store: store), isOn: Binding(
                            get: { selected.contains(model) },
                            set: { on in if on { if selected.count < 3 { selected.append(model) } } else { selected.removeAll { $0 == model } } }))
                            .disabled(!selected.contains(model) && selected.count >= 3).help(model)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.frame(maxHeight: metric("editor"))
                .onAppear { if selected.isEmpty, let model = session?.model, store.availableModels.contains(model) { selected = [model] } }
            HStack(spacing: metric("small")) {
                Button(store.text("compareModels")) { store.compare(sessionID, models: selected) }.buttonStyle(.vznPrimary)
                    .disabled(!(2...3).contains(Set(selected).count) || !selected.allSatisfy(NativeModel.valid) || session?.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false)
                    .accessibilityIdentifier("compare-run")
                Spacer(minLength: metric("small"))
                FilterTabs(label: store.text("compareModels"), items: [(false, store.text("compareColumns")), (true, store.text("compareSentences"))],
                           selection: Binding(get: { store.compareBySentence }, set: { store.compareBySentence = $0 }), accent: true)
            }
            if children.count > 1 { Text(store.text("compareDiffHint")).font(.vzn("captionScale")).foregroundStyle(.secondary) }
            if !children.isEmpty {
                ScrollView([.horizontal, .vertical]) {
                    HStack(alignment: .top, spacing: metric("inset")) { ForEach(children) { column($0) } }
                }.frame(maxHeight: metric("editor") * 2)
            }
            if let parts = session?.assemblyParts, !parts.isEmpty {
                VStack(alignment: .leading, spacing: metric("small")) {
                    Text(store.text("assembly")).font(.vzn("labelScale", .semibold))
                    Text(parts.keys.sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }.compactMap { parts[$0] }.joined(separator: "\n")).font(readingFont(store)).textSelection(.enabled)
                    Button(store.text("adoptTranslation")) { store.adoptAssembly(sessionID) }.buttonStyle(.vznOutline)
                        .disabled(parts.count != sourceSentences || store.running(sessionID) != nil)
                }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
            }
        }
    }
    /// Words of `text` absent from `reference` carry a soft tint; punctuation and order are ignored.
    private func highlighted(_ text: String, against reference: String?) -> AttributedString {
        guard let reference else { return AttributedString(text) }
        func core(_ word: Substring) -> String { word.lowercased().trimmingCharacters(in: .punctuationCharacters.union(.symbols)) }
        let known = Set(reference.split(whereSeparator: { $0.isWhitespace }).map(core))
        var result = AttributedString()
        for (index, word) in text.split(separator: " ", omittingEmptySubsequences: false).enumerated() {
            var piece = AttributedString(index == 0 ? String(word) : " " + word)
            if !word.isEmpty, !known.contains(core(word)) { piece.backgroundColor = contentColor("action-soft", scheme) }
            result += piece
        }
        return result
    }
    // One model's column: name, state, the text (whole or by sentence) and its actions.
    private func column(_ child: Session) -> some View {
        let task = task(child), current = store.comparisonCurrent(child), done = task?.status == .succeeded
        let rows = LanguageSegments.sentences(child.output)
        let reference = children.first.map { $0.id == child.id ? nil : $0 } ?? nil
        let referenceRows = reference.map { LanguageSegments.sentences($0.output) } ?? []
        return VStack(alignment: .leading, spacing: metric("small")) {
            Text(nativeModelLabel(child.model, store: store)).font(.vzn("labelScale", .semibold)).help(child.model)
            if let task { TaskStatusText(store: store, task: task) } else { Text(store.text("queued")).foregroundStyle(.secondary) }
            if !current { Text(store.text("comparisonStale")).font(.vzn("smallScale")).foregroundStyle(contentColor("warning", scheme)) }
            if store.compareBySentence && rows.count == sourceSentences {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, text in
                    VStack(alignment: .leading, spacing: metric("tight")) {
                        Text(highlighted(text, against: referenceRows.indices.contains(index) ? referenceRows[index] : nil)).font(readingFont(store)).textSelection(.enabled)
                        Button(store.text("useSentence")) { store.useSentence(child.id, index: index) }.buttonStyle(.vznQuiet)
                            .disabled(!done || !current).foregroundStyle(contentColor("action-text", scheme))
                    }
                }
            } else { Text(highlighted(child.output, against: reference?.output)).font(readingFont(store)).textSelection(.enabled) }
            HStack(spacing: metric("small")) {
                Button(store.text("adoptTranslation")) { store.adoptComparison(child.id) }.buttonStyle(.vznOutline)
                    .disabled(!done || !current || store.running(sessionID) != nil)
                if let task {
                    if task.status == .running { Button(store.text("stop"), role: .destructive) { store.cancel(task.id) }.buttonStyle(.vznOutline) }
                    else if store.canRetry(task) { Button(store.text("retry")) { store.retry(task.id) }.buttonStyle(.vznOutline) }
                }
                Button { copyText(child.output, store: store) } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.vznQuiet).disabled(child.output.isEmpty).help(store.text("copy")).accessibilityLabel(store.text("copy"))
            }
        }.frame(width: metric("sidebar"), alignment: .leading).cardSurface()
    }
}

