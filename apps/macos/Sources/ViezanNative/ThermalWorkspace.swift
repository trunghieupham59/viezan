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
    var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        let monitor = store.thermalMonitor
        let sensors = monitor.snapshot?.sensors ?? []
        let fans = monitor.snapshot?.fans ?? []
        WorkspacePage {
            PageIntro(title: store.text("thermalTitleMac"), subtitle: store.text("thermalSubtitle")) {
                // Glass: stopping reads as the danger role (red text on glass), starting stays neutral.
                Button(store.text(monitor.monitoring ? "stop" : "startMonitoring"), systemImage: monitor.monitoring ? "stop.fill" : "play.fill", role: glass && monitor.monitoring ? .destructive : nil) { if monitor.monitoring { monitor.stop() } else { monitor.start() } }
                    .buttonStyle(.vznOutline).controlSize(glass ? .regular : .large).fixedSize()
            }
            if sensors.isEmpty && fans.isEmpty && glass {
                // Thermal-States: before the first reading the page shows a toned thermometer, not an empty card.
                GlassEmptyState(symbol: "thermometer.medium", tone: "tone-orange", title: store.text("sensorsEmpty"), hint: store.text("sensorsEmptyHint"))
                    .padding(.vertical, metric("large") * 2)
            } else if sensors.isEmpty && fans.isEmpty {
                ContentUnavailableView(store.text("sensorsEmpty"), systemImage: "thermometer.medium", description: Text(store.text("sensorsEmptyHint")))
                    .frame(maxWidth: .infinity).cardSurface()
            } else {
                // Live metric tiles: the hottest sensor, then each fan.
                UniformGrid(maxColumns: 3) {
                    if let hottest = sensors.max(by: { $0.celsius < $1.celsius }) {
                        if glass {
                            glassTile(store.text("thermal_hottest"), String(format: "%.0f °C", hottest.celsius), unit: "", detail: sensorName(hottest.key) + " · " + hottest.key,
                                      progress: min(1, hottest.celsius / metric("thermalScaleMax")), fill: "warning")
                        } else {
                            metricTile(store.text("thermal_hottest"), String(format: "%.0f °C", hottest.celsius), sensorName(hottest.key) + " · " + hottest.key, progress: min(1, hottest.celsius / metric("thermalScaleMax")))
                        }
                    }
                    ForEach(fans) { fan in
                        if glass {
                            // `1 850 rpm` with the fan's range under it.
                            glassTile(fanName(fan), fan.rpm.formatted(.number.precision(.fractionLength(0))), unit: store.text("rpm"),
                                      detail: [fan.min, fan.max].compactMap { $0 }.map { $0.formatted(.number.precision(.fractionLength(0))) }.joined(separator: "–"),
                                      progress: fan.max.map { $0 > 0 ? min(1, fan.rpm / $0) : 0 } ?? 0, fill: "action")
                        } else {
                            metricTile(fanName(fan), fan.rpm.formatted(.number.precision(.fractionLength(0))), store.text("rpm"),
                                       progress: fan.max.map { $0 > 0 ? min(1, fan.rpm / $0) : 0 } ?? 0)
                        }
                    }
                }
            }
            AdaptiveColumns { controlCard(monitor); sensorCard(monitor) }
            if let error = monitor.error {
                if glass {
                    NoticeBand(role: "danger", edge: false) {
                        Image(systemName: "exclamationmark.triangle").foregroundStyle(contentColor("danger", scheme)).accessibilityHidden(true)
                        Text(store.text(error)).foregroundStyle(contentColor("text-strong", scheme)).fixedSize(horizontal: false, vertical: true)
                    }
                } else { Label(store.text(error), systemImage: "exclamationmark.triangle").foregroundStyle(.secondary) }
            }
        }.onAppear {
            store.thermalMonitor.refreshHelperStatus()
            // Readings start with the page (Review 18 shows live tiles); stop only what we started.
            if !store.thermalMonitor.monitoring { store.thermalMonitor.start(); startedHere = true }
        }
        .onDisappear { if startedHere && store.thermalMonitor.activeProfile == nil { store.thermalMonitor.stop() }; startedHere = false }
            // Thermal-States: Glass asks in a dialog centred over the page; other presets keep system sheets.
            .overlay { if glass { glassDialogs(monitor) } }
            .confirmationDialog(store.text("manualFanConfirm"), isPresented: Binding(get: { !glass && profileID != nil }, set: { if !$0 { profileID = nil } })) {
                Button(store.text("apply")) { if let id = profileID { monitor.applyProfile(id) }; profileID = nil }
            }
            .confirmationDialog(store.text("fanCalibrate"), isPresented: Binding(get: { !glass && confirmCalibration }, set: { confirmCalibration = $0 })) {
                Button(store.text("start")) { monitor.calibrate() }
            } message: { Text(store.text("fanCalibrationHint")) }
            .confirmationDialog(store.text("unregisterHelper"), isPresented: Binding(get: { !glass && confirmRemoval }, set: { confirmRemoval = $0 })) {
                Button(store.text("unregisterHelper"), role: .destructive) { Task { await monitor.unregisterHelper() } }
            }
            .confirmationDialog(store.text("registerHelper"), isPresented: Binding(get: { !glass && confirmHelper }, set: { confirmHelper = $0 })) {
                Button(store.text("registerHelper")) { monitor.registerHelper() }
            } message: { Text(store.text("fanHelperDescription")) }
    }
}
extension ThermalWorkspace {
    @ViewBuilder fileprivate func glassDialogs(_ monitor: ThermalMonitor) -> some View {
        if confirmHelper {
            choiceDialog(store.text("registerHelper"), store.text("fanHelperDescription"), confirm: store.text("registerHelper"), close: { confirmHelper = false }) { monitor.registerHelper() }
        } else if confirmCalibration {
            choiceDialog(store.text("fanCalibrate"), store.text("fanCalibrationHint"), confirm: store.text("start"), close: { confirmCalibration = false }) { monitor.calibrate() }
        } else if confirmRemoval {
            ConfirmDialog(title: store.text("unregisterHelper"), message: store.text("fanHelperDescription"), cancel: store.text("cancel"), confirm: store.text("unregisterHelper"),
                          onCancel: { confirmRemoval = false }, onConfirm: { confirmRemoval = false; Task { await monitor.unregisterHelper() } })
        } else if let id = profileID {
            choiceDialog(store.text("manualFanConfirm"), nil, confirm: store.text("apply"), close: { profileID = nil }) { monitor.applyProfile(id) }
        }
    }
    private func choiceDialog(_ title: String, _ message: String?, confirm: String, close: @escaping () -> Void, action: @escaping () -> Void) -> some View {
        BlockingDialog(title: title, onCancel: close) {
            Text(title).font(.vzn("subtitleScale", .semibold)).foregroundStyle(contentColor("text-strong", scheme)).lineLimit(2).accessibilityAddTraits(.isHeader)
            if let message { Text(message).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true) }
            HStack(spacing: metric("small")) {
                Spacer(minLength: 0)
                Button(store.text("cancel"), action: close).buttonStyle(.vznOutline).keyboardShortcut(.cancelAction)
                Button(confirm) { close(); action() }.buttonStyle(.vznPrimary).keyboardShortcut(.defaultAction)
            }.padding(.top, metric("tight"))
        }
    }
    /// A sensor key in words ("Nhân hiệu năng"), or the key itself when its meaning is unknown.
    func sensorName(_ key: String) -> String { ThermalSensors.classify(key).label.map { store.text("thermal_label_" + $0) } ?? key }
    func fanName(_ fan: ThermalSnapshot.Fan) -> String { fan.name ?? store.text("thermal_fan_name").replacingOccurrences(of: "{n}", with: String(fan.index + 1)) }
    // Thermal board tile: caps title, a 28 pt figure with a small unit, a detail line and a 6 pt meter.
    private func glassTile(_ title: String, _ value: String, unit: String, detail: String, progress: Double, fill: String) -> some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Eyebrow(text: title)
            HStack(alignment: .firstTextBaseline, spacing: metric("small")) {
                Text(value).font(.vzn("displayScale", .semibold)).monospacedDigit().foregroundStyle(contentColor("text-strong", scheme))
                if !unit.isEmpty { Text(unit).font(.system(size: NSFont.systemFontSize)).foregroundStyle(contentColor("text-muted", scheme)) }
            }
            Text(detail).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).lineLimit(1)
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(contentColor("surface-muted", scheme))
                    Capsule().fill(contentColor(fill, scheme)).frame(width: proxy.size.width * max(0, min(1, progress)))
                }
            }.frame(height: metric("tight") + metric("hairline") * 2).accessibilityHidden(true)
        }.frame(maxWidth: .infinity, alignment: .leading).cardSurface().accessibilityElement(children: .combine)
    }
    private func metricTile(_ title: String, _ value: String, _ detail: String, progress: Double) -> some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Eyebrow(text: title)
            Text(value).font(.system(size: metric("gutter") + metric("small"), weight: .semibold)).monospacedDigit()
            Text(detail).font(.vzn("smallScale")).foregroundStyle(.secondary).lineLimit(1)
            ProgressView(value: progress).progressViewStyle(.linear).accessibilityHidden(true)
        }.frame(maxWidth: .infinity, alignment: .leading).cardSurface().accessibilityElement(children: .combine)
    }
    private func cardHead<Trailing: View>(_ title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: metric("small")) {
            Text(title).font(.vzn("subtitleScale", .semibold)).accessibilityAddTraits(.isHeader)
            Spacer(minLength: metric("small"))
            trailing()
        }
    }
    // Control mode: state chip in the head, hint, glass menus, then manual control below a hairline.
    private func glassControlCard(_ monitor: ThermalMonitor) -> some View {
        VStack(alignment: .leading, spacing: metric("gap")) {
            cardHead(store.text("fanControlMode")) {
                StatusBadge(text: monitor.activeProfile.flatMap { id in monitor.profiles.first { $0.id == id } }.map { UUID(uuidString: $0.id) == nil ? store.text($0.name) : $0.name } ?? store.text("systemControlled"), tone: monitor.activeProfile == nil ? .ready : .busy)
            }
            Text(store.text("fanModeHint")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: metric("small")) {
                Button { profilesOpen.toggle() } label: { HStack(spacing: metric("tight")) { Text(store.text("fanProfiles")); Image(systemName: "chevron.down").imageScale(.small) } }
                    .buttonStyle(.vznOutline).fixedSize().popover(isPresented: $profilesOpen) { profileList(monitor) }
                Button { rulesOpen.toggle() } label: { HStack(spacing: metric("tight")) { Text(store.text("fanRules")); Image(systemName: "chevron.down").imageScale(.small) } }
                    .buttonStyle(.vznOutline).fixedSize().popover(isPresented: $rulesOpen) { ruleEditor(monitor) }
            }
            if monitor.activeProfile != nil { Button(store.text("restoreAutomatic")) { monitor.restoreAutomatic() }.buttonStyle(.vznQuiet).fixedSize() }
            CardDivider()
            HStack(spacing: metric("small")) {
                Text(store.text("manualControl")).font(.system(size: NSFont.systemFontSize, weight: .semibold))
                Spacer(minLength: metric("small"))
                StatusBadge(text: store.text(monitor.helperStatus), tone: monitor.helperStatus == "helperEnabled" ? .ready : .idle)
            }
            // Targets are only offered once the helper can apply them.
            if monitor.helperStatus == "helperEnabled" { ForEach(monitor.snapshot?.fans ?? []) { fan in NativeFanRow(store: store, fan: fan, name: fanName(fan)) } }
            HStack {
                Spacer()
                Menu(store.text("setUpHelper")) { helperActions(monitor) }.menuStyle(.button).buttonStyle(.vznQuiet).fixedSize()
            }
        }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    @ViewBuilder fileprivate func controlCard(_ monitor: ThermalMonitor) -> some View {
        if glass { glassControlCard(monitor) } else { classicControlCard(monitor) }
    }
    @ViewBuilder fileprivate func classicControlCard(_ monitor: ThermalMonitor) -> some View {
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
                // Targets are only offered once the helper can apply them.
                if monitor.helperStatus == "helperEnabled" { ForEach(monitor.snapshot?.fans ?? []) { fan in NativeFanRow(store: store, fan: fan, name: fanName(fan)) } }
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
            Text(store.text("fanRules")).font(.vzn("labelScale", .semibold))
            TextField(store.text("name"), text: $profileName).textFieldStyle(.roundedBorder)
            Picker(store.text("fanSensor"), selection: $sensor) {
                Text(store.text("fanAllSensors")).tag("all")
                Text("CPU").tag("cpu"); Text("GPU").tag("gpu")
                Text(store.text("fanAffinity")).tag("affinity")
                ForEach(monitor.snapshot?.sensors ?? []) { Text(sensorName($0.key) + " · " + $0.key).tag($0.key) }
            }
            Stepper(store.text("fanMinimumTemperature") + ": " + String(Int(lower)) + " °C", value: $lower, in: 20...109)
            Stepper(store.text("fanMaximumTemperature") + ": " + String(Int(upper)) + " °C", value: $upper, in: 21...110)
            HStack { Spacer(); Button(store.text("save")) { monitor.saveProfile(name: profileName, rules: ["*": FanRule(sensor: sensor, lower: lower, upper: upper)]); profileName = ""; rulesOpen = false }.buttonStyle(.vznPrimary).disabled(profileName.trimmingCharacters(in: .whitespaces).isEmpty || upper <= lower) }
        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"))
    }
    @ViewBuilder fileprivate func helperActions(_ monitor: ThermalMonitor) -> some View {
        // Register only while the daemon is absent; remove only once it is installed or awaiting approval.
        if monitor.helperStatus != "helperEnabled" && monitor.helperStatus != "helperApproval" { Button(store.text("registerHelper")) { confirmHelper = true } }
        if monitor.helperStatus == "helperApproval" { Button(store.text("openSystemSettings")) { monitor.openHelperSettings() } }
        if monitor.helperStatus == "helperEnabled" || monitor.helperStatus == "helperApproval" { Button(store.text("unregisterHelper"), role: .destructive) { confirmRemoval = true } }
    }
    @ViewBuilder fileprivate func sensorCard(_ monitor: ThermalMonitor) -> some View {
        if glass { glassSensorCard(monitor) } else { classicSensorCard(monitor) }
    }
    // Sensors: head with Calibrate, grouped edge-to-edge rows, the raw list folded at the foot.
    private func glassSensorCard(_ monitor: ThermalMonitor) -> some View {
        let sensors = monitor.snapshot?.sensors ?? []
        let groups = ThermalSensors.rows(sensors)
        return VStack(alignment: .leading, spacing: 0) {
            cardHead(store.text("thermal_sensors_title")) {
                Button(store.text("fanCalibrate")) { confirmCalibration = true }.buttonStyle(.vznQuiet).fixedSize()
                    .disabled(monitor.calibrating || !monitor.monitoring || (monitor.snapshot?.fans ?? []).isEmpty)
            }.padding(.horizontal, metric("inset")).frame(minHeight: metric("navControl") + metric("gap"))
            if monitor.calibrating {
                VStack(alignment: .leading, spacing: metric("small")) {
                    HStack(spacing: metric("small")) {
                        // Thermal-States: the live phase as an accent chip, which fan of how many, Stop in danger at the end.
                        StatusBadge(text: store.text(monitor.calibrationPhase) + " · " + String(monitor.calibrationRemaining), tone: .busy)
                        if monitor.calibrationFan > 0 {
                            Text(store.text("fanCalibrationFan").replacingOccurrences(of: "{n}", with: String(monitor.calibrationFan)).replacingOccurrences(of: "{count}", with: String(monitor.calibrationFanCount)))
                                .font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                        }
                        Spacer()
                        Button(store.text("stop"), role: .destructive) { monitor.cancelCalibration() }.buttonStyle(.vznQuiet).foregroundStyle(contentColor("danger", scheme))
                    }
                    ProgressView(value: monitor.calibrationProgress).progressViewStyle(.linear).tint(contentColor("action", scheme))
                        .accessibilityLabel(store.text("fanCalibrate")).accessibilityValue(Text("\(Int(monitor.calibrationProgress * 100)) %"))
                }.padding(.horizontal, metric("inset")).padding(.bottom, metric("small"))
            }
            if sensors.isEmpty { Text(store.text("sensorsEmptyHint")).font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme)).padding(metric("inset")) }
            ForEach(ThermalSensors.Group.allCases, id: \.self) { group in
                if let rows = groups[group], !rows.isEmpty {
                    Eyebrow(text: store.text("thermal_group_" + group.rawValue)).padding(.horizontal, metric("inset")).padding(.top, metric("small")).padding(.bottom, metric("tight"))
                    CardDivider()
                    ForEach(rows) { row in
                        CardRow(title: row.label.map { store.text("thermal_label_" + $0) } ?? store.text("thermal_sensor_unlabeled"),
                                detail: store.text("thermal_sensor_row_caption").replacingOccurrences(of: "{count}", with: String(row.sensors.count)).replacingOccurrences(of: "{avg}", with: String(format: "%.0f °C", row.average))) {
                            Text(String(format: "%.0f °C", row.max)).monospacedDigit().fontWeight(.semibold).foregroundStyle(toneColor(row.max))
                        }.help(row.sensors.map { $0.key + " " + String(format: "%.0f °C", $0.celsius) }.joined(separator: "\n"))
                    }
                }
            }
            if !sensors.isEmpty {
                DisclosureGroup(store.text("thermal_sensor_count").replacingOccurrences(of: "{count}", with: String(sensors.count))) {
                    ForEach(sensors.sorted { $0.celsius > $1.celsius }) { sensor in
                        CardRow(title: sensor.key, detail: sensorName(sensor.key)) { Text(String(format: "%.0f °C", sensor.celsius)).monospacedDigit() }
                    }
                }.font(.vzn("smallScale")).padding(metric("inset"))
            }
            ForEach(monitor.affinity.keys.sorted(), id: \.self) { index in
                Text(store.text("thermal_fan_name").replacingOccurrences(of: "{n}", with: String(index + 1)) + ": " + (monitor.affinity[index] ?? []).joined(separator: ", ")).font(.vzn("captionScale")).foregroundStyle(.secondary)
                    .padding(.horizontal, metric("inset")).padding(.bottom, metric("small"))
            }
            // Thermal-States: when the saved result was measured, and a way to forget it.
            if !monitor.affinity.isEmpty, !monitor.calibrating {
                HStack(spacing: metric("small")) {
                    Text(monitor.calibratedAt.map { store.text("fanCalibratedAt").replacingOccurrences(of: "{time}", with: relativeTime($0, store: store)) } ?? store.text("fanCalibrated"))
                        .font(.vzn("smallScale")).foregroundStyle(contentColor("text-muted", scheme))
                    Spacer(minLength: metric("small"))
                    Button(store.text("fanForgetCalibration")) { monitor.forgetCalibration() }.buttonStyle(.vznQuiet).controlSize(.small).accessibilityIdentifier("thermal-forget-calibration")
                }.padding(.horizontal, metric("inset")).padding(.bottom, metric("small"))
            }
        }.environment(\.cardRowInset, metric("inset")).frame(maxWidth: .infinity, alignment: .leading).cardSurface(padded: false)
    }
    @ViewBuilder fileprivate func classicSensorCard(_ monitor: ThermalMonitor) -> some View {
        CardSection(title: store.text("thermal_sensors_title")) {
            // Hundreds of SMC keys folded into rows that mean one thing, per group, hottest first.
            let sensors = monitor.snapshot?.sensors ?? []
            let groups = ThermalSensors.rows(sensors)
            if sensors.isEmpty { Text(store.text("sensorsEmptyHint")).font(.vzn("smallScale")).foregroundStyle(.secondary) }
            ForEach(ThermalSensors.Group.allCases, id: \.self) { group in
                if let rows = groups[group], !rows.isEmpty {
                    Eyebrow(text: store.text("thermal_group_" + group.rawValue)).padding(.top, metric("small"))
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        CardRow(title: row.label.map { store.text("thermal_label_" + $0) } ?? store.text("thermal_sensor_unlabeled"),
                                detail: store.text("thermal_sensor_row_caption").replacingOccurrences(of: "{count}", with: String(row.sensors.count)).replacingOccurrences(of: "{avg}", with: String(format: "%.0f °C", row.average)),
                                divider: index < rows.count - 1) {
                            Text(String(format: "%.0f °C", row.max)).monospacedDigit().fontWeight(.semibold).foregroundStyle(toneColor(row.max))
                        }.help(row.sensors.map { $0.key + " " + String(format: "%.0f °C", $0.celsius) }.joined(separator: "\n"))
                    }
                }
            }
            if !sensors.isEmpty {
                DisclosureGroup(store.text("thermal_sensor_count").replacingOccurrences(of: "{count}", with: String(sensors.count))) {
                    ForEach(sensors.sorted { $0.celsius > $1.celsius }) { sensor in
                        CardRow(title: sensor.key, detail: sensorName(sensor.key)) { Text(String(format: "%.0f °C", sensor.celsius)).monospacedDigit() }
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
            ForEach(monitor.affinity.keys.sorted(), id: \.self) { index in Text(store.text("thermal_fan_name").replacingOccurrences(of: "{n}", with: String(index + 1)) + ": " + (monitor.affinity[index] ?? []).joined(separator: ", ")).font(.vzn("captionScale")).foregroundStyle(.secondary) }
        }
    }
}

extension ThermalWorkspace {
    /// Warm (≥ 70 °C) and hot (≥ 90 °C) readings stand out; the number still carries the meaning.
    func toneColor(_ celsius: Double) -> Color {
        switch ThermalSensors.tone(celsius) { case "hot": contentColor("danger", scheme); case "warm": contentColor("warning", scheme); default: .primary }
    }
}
private struct NativeFanRow: View {
    let store: WorkbenchStore
    let fan: ThermalSnapshot.Fan
    let name: String
    @State private var target = 0.0
    @State private var confirm = false
    private var glass: Bool { (NativeTheme.shared.preferences.preset ?? "glass") == "glass" }
    var body: some View {
        if glass, let minimum = fan.min, let maximum = fan.max, maximum > minimum {
            // Thermal board: name, the target slider and its value on one line; Apply confirms.
            HStack(spacing: metric("gap")) {
                Text(name).font(.vzn("smallScale")).frame(width: metric("large") + metric("gutter"), alignment: .leading).lineLimit(1)
                Slider(value: $target, in: minimum...maximum, step: 50).controlSize(.small).accessibilityLabel(store.text("targetRPM") + " · " + name)
                Text(String(Int(target)) + " RPM").font(.vzn("smallScale")).monospacedDigit().frame(minWidth: metric("large") * 2, alignment: .trailing)
                Button(store.text("apply")) { confirm = true }.buttonStyle(.vznPrimary)
            }.onAppear { target = min(fan.max ?? fan.rpm, max(fan.min ?? 0, fan.target ?? fan.rpm)) }
            .confirmationDialog(store.text("manualFanConfirm"), isPresented: $confirm) {
                Button(store.text("apply")) { store.thermalMonitor.setTarget(index: fan.index, rpm: target) }
            } message: { Text(store.text("fanHelperDescription")) }
        } else { classic }
    }
    private var classic: some View {
        VStack(alignment: .leading, spacing: metric("small")) {
            Text(name + " · " + String(Int(fan.rpm)) + " RPM")
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
