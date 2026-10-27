import SwiftUI
import ViezanDomain
struct ThermalWorkspace: View {
    @Bindable var store: WorkbenchStore
    @State private var confirmHelper = false
    @State private var confirmCalibration = false
    @State private var confirmRemoval = false
    @State private var profileID: String?
    @State private var profileName = ""
    @State private var sensor = "all"
    @State private var lower = 45.0
    @State private var upper = 75.0
    var body: some View {
        let monitor = store.thermalMonitor
        ScrollView {
            VStack(alignment: .leading, spacing: metric("inset")) {
                Text(store.text("thermal")).font(.title2)
                HStack {
                    Button(store.text(monitor.monitoring ? "stop" : "startMonitoring")) { if monitor.monitoring { monitor.stop() } else { monitor.start() } }
                    Button(store.text("restoreAutomatic")) { monitor.restoreAutomatic() }
                }
                if (monitor.snapshot?.sensors ?? []).isEmpty {
                    ContentUnavailableView(store.text("sensorsEmpty"), systemImage: "thermometer.medium", description: Text(store.text("sensorsEmptyHint")))
                } else {
                    GroupBox(store.text("thermal")) {
                        VStack(spacing: metric("small")) {
                            ForEach(monitor.snapshot?.sensors ?? []) { sensor in
                                HStack { Text(sensor.key).font(.system(.body, design: .monospaced)); Spacer(); Text(sensor.celsius, format: .number.precision(.fractionLength(1))).monospacedDigit(); Text("°C") }
                            }
                        }.padding(metric("small"))
                    }
                }
                GroupBox(store.text("fanControl")) {
                    VStack(alignment: .leading, spacing: metric("small")) {
                        DisclosureGroup(store.text("fanProfiles")) {
                            ForEach(monitor.profiles) { profile in
                                HStack {
                                    Button(UUID(uuidString: profile.id) == nil ? store.text(profile.name) : profile.name) { profileID = profile.id }.disabled(monitor.calibrating || !monitor.monitoring)
                                    if monitor.activeProfile == profile.id { Image(systemName: "checkmark").accessibilityLabel(store.text("selected")) }
                                    if UUID(uuidString: profile.id) != nil { Button(store.text("delete"), role: .destructive) { monitor.removeProfile(profile.id) } }
                                }
                            }
                            TextField(store.text("name"), text: $profileName)
                            Picker(store.text("fanSensor"), selection: $sensor) {
                                Text(store.text("fanAllSensors")).tag("all")
                                Text("CPU").tag("cpu"); Text("GPU").tag("gpu")
                                Text(store.text("fanAffinity")).tag("affinity")
                                ForEach(monitor.snapshot?.sensors ?? []) { Text($0.key).tag($0.key) }
                            }
                            Stepper(store.text("fanMinimumTemperature") + ": " + String(Int(lower)) + " °C", value: $lower, in: 20...109)
                            Stepper(store.text("fanMaximumTemperature") + ": " + String(Int(upper)) + " °C", value: $upper, in: 21...110)
                            Button(store.text("save")) { monitor.saveProfile(name: profileName, rules: ["*": FanRule(sensor: sensor, lower: lower, upper: upper)]); profileName = "" }.disabled(profileName.trimmingCharacters(in: .whitespaces).isEmpty || upper <= lower)
                        }
                        Button(store.text("fanCalibrate")) { confirmCalibration = true }.disabled(monitor.calibrating || !monitor.monitoring || (monitor.snapshot?.fans ?? []).isEmpty)
                        if monitor.calibrating {
                            Text(store.text(monitor.calibrationPhase) + " · " + String(monitor.calibrationRemaining))
                            Button(store.text("stop"), role: .destructive) { monitor.cancelCalibration() }
                        }
                        ForEach(monitor.affinity.keys.sorted(), id: \.self) { index in Text("Fan " + String(index + 1) + ": " + (monitor.affinity[index] ?? []).joined(separator: ", ")).font(.caption) }
                        ForEach(monitor.snapshot?.fans ?? []) { fan in NativeFanRow(store: store, fan: fan) }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                DisclosureGroup(store.text("registerHelper")) {
                        Text(store.text("fanHelperDescription")).foregroundStyle(.secondary)
                        Text(store.text(monitor.helperStatus))
                        Button(store.text("registerHelper")) { confirmHelper = true }
                        Button(store.text("openSystemSettings")) { monitor.openHelperSettings() }
                        Button(store.text("unregisterHelper"), role: .destructive) { confirmRemoval = true }
                }
                if let error = monitor.error { Text(store.text(error)).foregroundStyle(.secondary) }
            }.frame(maxWidth: metric("reading")).frame(maxWidth: .infinity).padding(metric("gutter"))
        }.onAppear { monitor.refreshHelperStatus() }
            .confirmationDialog(store.text("manualFanConfirm"), isPresented: Binding(get: { profileID != nil }, set: { if !$0 { profileID = nil } })) {
                Button(store.text("apply")) { if let id = profileID { monitor.applyProfile(id) }; profileID = nil }
            }
            .confirmationDialog(store.text("fanCalibrate"), isPresented: $confirmCalibration) {
                Button(store.text("start")) { monitor.calibrate() }
            } message: { Text(store.text("fanCalibrationHint")) }
            .confirmationDialog(store.text("unregisterHelper"), isPresented: $confirmRemoval) {
                Button(store.text("unregisterHelper"), role: .destructive) { Task { await monitor.unregisterHelper() } }
            }
            .confirmationDialog(store.text("registerHelper"), isPresented: $confirmHelper) {
                Button(store.text("registerHelper")) { monitor.registerHelper() }
            } message: { Text(store.text("fanHelperDescription")) }
    }
}
private struct NativeFanRow: View {
    let store: WorkbenchStore
    let fan: ThermalSnapshot.Fan
    @State private var target = 0.0
    @State private var confirm = false
    var body: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text((fan.name ?? "Fan \(fan.index + 1)") + " · " + String(Int(fan.rpm)) + " RPM")
            if let minimum = fan.min, let maximum = fan.max, maximum > minimum {
                Slider(value: $target, in: minimum...maximum, step: 50).accessibilityLabel(store.text("targetRPM"))
                HStack { Text(String(Int(target)) + " RPM"); Button(store.text("apply")) { confirm = true } }
            }
        }.onAppear { target = min(fan.max ?? fan.rpm, max(fan.min ?? 0, fan.target ?? fan.rpm)) }
        .confirmationDialog(store.text("manualFanConfirm"), isPresented: $confirm) {
            Button(store.text("apply")) { store.thermalMonitor.setTarget(index: fan.index, rpm: target) }
        } message: { Text(store.text("fanHelperDescription")) }
    }
}
