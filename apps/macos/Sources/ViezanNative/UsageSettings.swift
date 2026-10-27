import SwiftUI
import ViezanDomain
struct UsageSettings: View {
    let store: WorkbenchStore
    @State private var input = ""
    @State private var output = ""
    @State private var currency = "USD"
    @State private var invalid = false
    var body: some View {
        DisclosureGroup(store.text("usageTitle")) {
            Text(store.text("usageHint")).font(.caption)
            ForEach(Array(Set(store.workspace.tasks.map { $0.request.model })).sorted(), id: \.self) { model in
                let jobs = store.workspace.tasks.filter { $0.request.model == model }
                let incoming = jobs.reduce(0.0) { $0 + Double($1.usage?.input ?? 0) }
                let outgoing = jobs.reduce(0.0) { $0 + Double($1.usage?.output ?? 0) }
                VStack(alignment: .leading) {
                    Text(model).font(.headline)
                    Text(store.text("usageInput") + ": " + incoming.formatted() + " · " + store.text("usageOutput") + ": " + outgoing.formatted())
                    if let rate = store.workspace.rates?[model] {
                        Text(store.text("usageEstimate") + ": " + ((incoming * rate.input + outgoing * rate.output) / 1_000_000).formatted(.currency(code: rate.currency)))
                    }
                }
            }
            Text(store.text("usageRate") + " · " + store.session.model)
            TextField(store.text("usageInput"), text: $input)
            TextField(store.text("usageOutput"), text: $output)
            TextField(store.text("usageCurrency"), text: $currency)
            Button(store.text("apply")) {
                guard let a = Double(input), let b = Double(output) else { invalid = true; return }
                invalid = !store.setRate(model: store.session.model, rate: UsageRate(input: a, output: b, currency: currency.uppercased()))
            }
            if invalid { Text(store.text("usageInvalid")) }
        }.onAppear {
            if let rate = store.workspace.rates?[store.session.model] { input = String(rate.input); output = String(rate.output); currency = rate.currency }
        }
    }
}
