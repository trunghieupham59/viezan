import SwiftUI
import ViezanDomain

// Compare 2–3 models on the same source. Columns by default; the sentence view
// (remembered) lets one translation be assembled from the best sentence of each.
struct ComparisonPane: View {
    @Bindable var store: WorkbenchStore
    let sessionID: String
    @State private var selected: [String] = []
    @State private var filter = ""
    @Environment(\.colorScheme) private var scheme
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
                Button { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(child.output, forType: .string) } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.vznQuiet).disabled(child.output.isEmpty).help(store.text("copy")).accessibilityLabel(store.text("copy"))
            }
        }.frame(width: metric("sidebar"), alignment: .leading).cardSurface()
    }
}

