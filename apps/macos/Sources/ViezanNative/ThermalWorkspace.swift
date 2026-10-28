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
    @State private var profilesOpen = false
    @State private var rulesOpen = false
    @State private var startedHere = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let monitor = store.thermalMonitor
        let sensors = monitor.snapshot?.sensors ?? []
        let fans = monitor.snapshot?.fans ?? []
        WorkspacePage {
            PageIntro(title: store.text("thermalTitleMac"), subtitle: store.text("thermalSubtitle")) {
                Button(store.text(monitor.monitoring ? "stop" : "startMonitoring"), systemImage: monitor.monitoring ? "stop.fill" : "play.fill") { if monitor.monitoring { monitor.stop() } else { monitor.start() } }
                    .buttonStyle(.vznOutline).controlSize(.large).fixedSize()
            }
            if sensors.isEmpty && fans.isEmpty {
                ContentUnavailableView(store.text("sensorsEmpty"), systemImage: "thermometer.medium", description: Text(store.text("sensorsEmptyHint")))
                    .frame(maxWidth: .infinity).cardSurface()
            } else {
                // Live metric tiles: the hottest sensor, then each fan.
                UniformGrid(maxColumns: 3) {
                    if let hottest = sensors.max(by: { $0.celsius < $1.celsius }) {
                        metricTile(store.text("hottestSensor"), String(format: "%.0f °C", hottest.celsius), hottest.key, progress: min(1, hottest.celsius / 110))
                    }
                    ForEach(fans) { fan in
                        metricTile(fan.name ?? "Fan \(fan.index + 1)", fan.rpm.formatted(.number.precision(.fractionLength(0))), store.text("rpm"),
                                   progress: fan.max.map { $0 > 0 ? min(1, fan.rpm / $0) : 0 } ?? 0)
                    }
                }
            }
            AdaptiveColumns { controlCard(monitor); sensorCard(monitor) }
            if let error = monitor.error { Label(store.text(error), systemImage: "exclamationmark.triangle").foregroundStyle(.secondary) }
        }.onAppear {
            store.thermalMonitor.refreshHelperStatus()
            // Readings start with the page (Review 18 shows live tiles); stop only what we started.
            if !store.thermalMonitor.monitoring { store.thermalMonitor.start(); startedHere = true }
        }
        .onDisappear { if startedHere && store.thermalMonitor.activeProfile == nil { store.thermalMonitor.stop() }; startedHere = false }
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
extension ThermalWorkspace {
    private func metricTile(_ title: String, _ value: String, _ detail: String, progress: Double) -> some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Eyebrow(text: title)
            Text(value).font(.system(size: metric("gutter") + metric("small"), weight: .semibold)).monospacedDigit()
            Text(detail).font(.callout).foregroundStyle(.secondary).lineLimit(1)
            ProgressView(value: progress).progressViewStyle(.linear).accessibilityHidden(true)
        }.frame(maxWidth: .infinity, alignment: .leading).cardSurface().accessibilityElement(children: .combine)
    }
    @ViewBuilder fileprivate func controlCard(_ monitor: ThermalMonitor) -> some View {
        CardSection(title: store.text("fanControlMode")) {
            StatusBadge(text: monitor.activeProfile.flatMap { id in monitor.profiles.first { $0.id == id } }.map { UUID(uuidString: $0.id) == nil ? store.text($0.name) : $0.name } ?? store.text("systemControlled"), tone: monitor.activeProfile == nil ? .ready : .busy)
            Text(store.text("fanModeHint")).font(.vzn("labelScale")).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: metric("small")) {
                Button(store.text("fanProfiles")) { profilesOpen.toggle() }
                    .popover(isPresented: $profilesOpen) { profileList(monitor) }
                Button(store.text("fanRules")) { rulesOpen.toggle() }
                    .popover(isPresented: $rulesOpen) { ruleEditor(monitor) }
                if monitor.activeProfile != nil { Button(store.text("restoreAutomatic")) { monitor.restoreAutomatic() } }
            }
            // Manual control and helper administration stay inside a subdued block.
            VStack(alignment: .leading, spacing: metric("small")) {
                Text(store.text("manualControl")).fontWeight(.semibold)
                Text(store.text(monitor.helperStatus)).font(.vzn("labelScale")).foregroundStyle(.secondary)
                ForEach(monitor.snapshot?.fans ?? []) { fan in NativeFanRow(store: store, fan: fan) }
                Menu(store.text("setUpHelper")) { helperActions(monitor) }
                    .menuStyle(.button).buttonStyle(.vznOutline).fixedSize()
            }.padding(metric("inset")).frame(maxWidth: .infinity, alignment: .leading)
                .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("radius")))
                .padding(.top, metric("small"))
        }
    }
    private func profileList(_ monitor: ThermalMonitor) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(monitor.profiles) { profile in
                CardRow(title: UUID(uuidString: profile.id) == nil ? store.text(profile.name) : profile.name, divider: profile.id != monitor.profiles.last?.id) {
                    if monitor.activeProfile == profile.id { Image(systemName: "checkmark").accessibilityLabel(store.text("selected")) }
                    Button(store.text("apply")) { profilesOpen = false; profileID = profile.id }.disabled(monitor.calibrating || !monitor.monitoring)
                    if UUID(uuidString: profile.id) != nil { Button(store.text("delete"), role: .destructive) { monitor.removeProfile(profile.id) } }
                }
            }
        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"))
    }
    private func ruleEditor(_ monitor: ThermalMonitor) -> some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(store.text("fanRules")).font(.headline)
            TextField(store.text("name"), text: $profileName).textFieldStyle(.roundedBorder)
            Picker(store.text("fanSensor"), selection: $sensor) {
                Text(store.text("fanAllSensors")).tag("all")
                Text("CPU").tag("cpu"); Text("GPU").tag("gpu")
                Text(store.text("fanAffinity")).tag("affinity")
                ForEach(monitor.snapshot?.sensors ?? []) { Text($0.key).tag($0.key) }
            }
            Stepper(store.text("fanMinimumTemperature") + ": " + String(Int(lower)) + " °C", value: $lower, in: 20...109)
            Stepper(store.text("fanMaximumTemperature") + ": " + String(Int(upper)) + " °C", value: $upper, in: 21...110)
            HStack { Spacer(); Button(store.text("save")) { monitor.saveProfile(name: profileName, rules: ["*": FanRule(sensor: sensor, lower: lower, upper: upper)]); profileName = ""; rulesOpen = false }.buttonStyle(.vznPrimary).disabled(profileName.trimmingCharacters(in: .whitespaces).isEmpty || upper <= lower) }
        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"))
    }
    @ViewBuilder fileprivate func helperActions(_ monitor: ThermalMonitor) -> some View {
        Button(store.text("registerHelper")) { confirmHelper = true }
        Button(store.text("openSystemSettings")) { monitor.openHelperSettings() }
        Button(store.text("unregisterHelper"), role: .destructive) { confirmRemoval = true }
    }
    @ViewBuilder fileprivate func sensorCard(_ monitor: ThermalMonitor) -> some View {
        CardSection(title: store.text("sensors")) {
            // Hottest first; long hardware lists collapse behind a disclosure.
            let sensors = (monitor.snapshot?.sensors ?? []).sorted { $0.celsius > $1.celsius }
            let lead = Array(sensors.prefix(6)), rest = Array(sensors.dropFirst(6))
            if sensors.isEmpty { Text(store.text("sensorsEmptyHint")).font(.callout).foregroundStyle(.secondary) }
            ForEach(Array(lead.enumerated()), id: \.element.id) { index, sensor in
                CardRow(title: sensor.key, divider: index < lead.count - 1 || !rest.isEmpty) {
                    Text(String(format: "%.0f °C", sensor.celsius)).monospacedDigit()
                }
            }
            if !rest.isEmpty {
                DisclosureGroup(store.text("sensors") + " · " + String(rest.count)) {
                    ForEach(Array(rest.enumerated()), id: \.element.id) { index, sensor in
                        CardRow(title: sensor.key, divider: index < rest.count - 1) { Text(String(format: "%.0f °C", sensor.celsius)).monospacedDigit() }
                    }
                }.padding(.vertical, metric("small"))
            }
            Button(store.text("fanCalibrate")) { confirmCalibration = true }.disabled(monitor.calibrating || !monitor.monitoring || (monitor.snapshot?.fans ?? []).isEmpty)
            if monitor.calibrating {
                HStack {
                    Text(store.text(monitor.calibrationPhase) + " · " + String(monitor.calibrationRemaining))
                    Button(store.text("stop"), role: .destructive) { monitor.cancelCalibration() }
                }
            }
            ForEach(monitor.affinity.keys.sorted(), id: \.self) { index in Text("Fan " + String(index + 1) + ": " + (monitor.affinity[index] ?? []).joined(separator: ", ")).font(.caption).foregroundStyle(.secondary) }
        }
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
