import SwiftUI
import ViezanDomain

struct ComparisonPane: View {
    let store: WorkbenchStore
    let sessionID: String
    @State private var models = ""
    @State private var expanded = false
    @State private var sentences = false
    private var session: Session? { store.session(sessionID) }
    private var ids: [String] { models.split(whereSeparator: { $0.isNewline || $0 == "," }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
    var body: some View {
        DisclosureGroup(store.text("compareModels"), isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: metric("small")) {
                TextField(store.text("compareModelHint"), text: $models, axis: .vertical)
                HStack {
                    Button(store.text("compareModels")) { store.compare(sessionID, models: ids) }.disabled(!(2...3).contains(Set(ids).count) || !ids.allSatisfy(NativeModel.valid) || session?.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false)
                    Toggle(store.text("compareSentences"), isOn: $sentences)
                }
                ScrollView([.horizontal, .vertical]) {
                    HStack(alignment: .top, spacing: metric("inset")) {
                        ForEach(store.comparisons(sessionID)) { child in
                            VStack(alignment: .leading, spacing: metric("small")) {
                                Text(child.model).font(.headline).textSelection(.enabled)
                                let task = store.workspace.tasks.first { $0.request.sessionID == child.id }
                                Text(store.text(task?.errorCode ?? task?.status.rawValue ?? "queued"))
                                if !store.comparisonCurrent(child) { Text(store.text("comparisonStale")) }
                                let rows = LanguageSegments.sentences(child.output)
                                if sentences && rows.count == LanguageSegments.sentences(session?.draft ?? "").count {
                                    ForEach(Array(rows.enumerated()), id: \.offset) { index, text in
                                        Text(text).textSelection(.enabled)
                                        Button(store.text("useSentence")) { store.useSentence(child.id, index: index) }.disabled(task?.status != .succeeded || !store.comparisonCurrent(child))
                                    }
                                } else { Text(child.output).textSelection(.enabled) }
                                HStack {
                                    Button(store.text("adoptTranslation")) { store.adoptComparison(child.id) }.disabled(task?.status != .succeeded || !store.comparisonCurrent(child) || store.running(sessionID) != nil)
                                    if let task {
                                        if task.status == .running { Button(store.text("stop"), role: .destructive) { store.cancel(task.id) } }
                                        else if store.canRetry(task) { Button(store.text("retry")) { store.retry(task.id) } }
                                    }
                                }
                                Button(store.text("copy")) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(child.output, forType: .string) }
                            }.frame(width: metric("sidebar"), alignment: .leading)
                        }
                    }
                }.frame(maxHeight: metric("editor") * 2)
                if let parts = session?.assemblyParts, !parts.isEmpty {
                    Text(store.text("assembly"))
                    Text(parts.keys.sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }.compactMap { parts[$0] }.joined(separator: "\n")).textSelection(.enabled)
                    Button(store.text("adoptTranslation")) { store.adoptAssembly(sessionID) }.disabled(parts.count != LanguageSegments.sentences(session?.draft ?? "").count || store.running(sessionID) != nil)
                }
            }.padding(.top, metric("small"))
        }
    }
}
struct PromptLibrary: View {
    let store: WorkbenchStore
    @Binding var text: String
    @State private var name = ""
    @State private var selected = ""
    @State private var deleting = false
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(store.text("promptLibrary")).font(.headline)
            Picker(store.text("promptLibrary"), selection: $selected) {
                Text(store.text("selectPrompt")).tag("")
                ForEach(store.workspace.prompts ?? []) { prompt in Text(prompt.name).tag(prompt.id) }
            }.onChange(of: selected) { _, id in if let prompt = store.workspace.prompts?.first(where: { $0.id == id }) { text = prompt.text; name = prompt.name } }
            TextField(store.text("promptName"), text: $name)
            HStack {
                Button(store.text("savePrompt")) { store.savePrompt(name: name, text: text) }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.utf8.count > 32768)
                Button(store.text("deletePrompt"), role: .destructive) { deleting = true }.disabled(selected.isEmpty)
            }
        }.confirmationDialog(store.text("deletePrompt"), isPresented: $deleting) { Button(store.text("deletePrompt"), role: .destructive) { store.deletePrompt(selected); selected = "" } }
    }
}
