import SwiftUI
import ViezanDomain
struct ThermalWorkspace: View {
    @Bindable var store: WorkbenchStore
    @State private var confirmHelper = false
    @State private var confirmCalibration = false
    @State private var confirmRemoval = false
    @State private var confirmation: FanControlRequest?
    @State private var awaitingApply: FanControlRequest?
    @State private var profileName = ""
    @State private var savingProfile = false
    @State private var profileSaveError: String?
    @State private var draftRule = FanRule()
    private enum FanPopover: Int, Identifiable {
        case profiles, rules
        var id: Self { self }
    }
    @State private var fanPopover: FanPopover?
    private enum Opener: Hashable { case profiles, rules, saveRunning }
    private enum RuleFocus: Hashable { case source, saveAs, name }
    @FocusState private var openerFocus: Opener?
    @AccessibilityFocusState private var assistiveFocus: Opener?
    @FocusState private var ruleFocus: RuleFocus?
    @State private var returnFocus: Opener?
    @State private var returnAssistiveFocus = false
    @State private var startedHere = false
    @State private var otherOpen = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let monitor = store.thermalMonitor
        let sensors = monitor.snapshot?.sensors ?? []
        let fans = monitor.snapshot?.fans ?? []
        WorkspacePage {
            PageIntro(title: store.text("thermalTitleMac"), subtitle: store.text("thermalSubtitle")) {
                // Glass: stopping reads as the danger role (red text on glass), starting stays neutral.
                Button(store.text(monitor.monitoring ? "stop" : "startMonitoring"), systemImage: monitor.monitoring ? "stop.fill" : "play.fill", role: monitor.monitoring ? .destructive : nil) { if monitor.monitoring { monitor.stop() } else { monitor.start() } }
                    .buttonStyle(.vznOutline).controlSize(.regular).fixedSize()
            }
            readerNotice(monitor)
            if !sensors.isEmpty || !fans.isEmpty {
                // Live metric tiles: the hottest sensor, then each fan.
                UniformGrid(maxColumns: 3) {
                    if let hottest = sensors.max(by: { $0.celsius < $1.celsius }) {
                        let detail = hottest.displayCaption(store.text)
                        glassTile(store.text("thermal_hottest"), String(format: "%.0f °C", hottest.celsius), unit: "", detail: detail,
                                  progress: min(1, hottest.celsius / metric("thermalScaleMax")), fill: "warning")
                            .truncationMode(.tail).help(detail)
                    }
                    ForEach(fans) { fan in
                        // `1 850 rpm` with the fan's range under it.
                        let parkedBySystem = monitor.controlMode == .automatic && fan.parkedWhileCool(hottest: sensors.map(\.celsius).max())
                        glassTile(fanName(fan), fan.rpm.formatted(.number.precision(.fractionLength(0))), unit: store.text("rpm"),
                                  detail: parkedBySystem ? store.text("thermal_fan_stopped") : [fan.min, fan.max].compactMap { $0 }.map { $0.formatted(.number.precision(.fractionLength(0))) }.joined(separator: "–"),
                                  progress: fan.max.map { $0 > 0 ? min(1, fan.rpm / $0) : 0 } ?? 0, fill: "action")
                            .help(parkedBySystem ? store.text("thermal_fan_stopped") : "")
                    }
                }
            }
            AdaptiveColumns { controlCard(monitor); sensorCard(monitor) }
        }
        // Approval is granted in System Settings, so the status is read again when the person comes back.
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in store.thermalMonitor.refreshHelperStatus() }
        .onAppear {
            store.thermalMonitor.refreshHelperStatus()
            // Readings start with the page (Review 18 shows live tiles); stop only what we started.
            if !store.thermalMonitor.monitoring { store.thermalMonitor.start(); startedHere = true }
        }
        .onChange(of: confirmedApplyName(monitor)) { _, name in
            guard let name else { return }
            awaitingApply = nil
            ToastCenter.shared.show(store.text("fanAppliedToast").replacingOccurrences(of: "{name}", with: name), key: "thermal-fan")
        }
        .onChange(of: monitor.fanFailure) { _, failure in
            guard let error = failure?.code else { return }
            if error == "fanCommandError" || error == "fanProfileApplyError" {
                awaitingApply = nil
            }
            ToastCenter.shared.show(store.text(error), key: "thermal-fan", level: .danger, announcementPriority: .medium)
        }
        .onChange(of: fanPopover == nil && confirmation == nil) { _, closed in
            guard closed, let opener = returnFocus else { return }
            let target = opener == .saveRunning && monitor.activeProfile != "custom" ? Opener.rules : opener
            openerFocus = target
            if returnAssistiveFocus { assistiveFocus = target }
            returnFocus = nil
        }
        .onDisappear {
            if monitor.controlMode.shouldStopOnDisappear(startedHere: startedHere) { monitor.stop() }
            startedHere = false
        }
            // Thermal-States: Glass asks in a dialog centred over the page.
            .overlay { glassDialogs(monitor) }
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
        } else if let request = confirmation {
            choiceDialog(store.text("thermal_fan_disclaimer_title"), store.text("thermal_fan_disclaimer_warning"),
                         confirm: store.text("apply"), close: { confirmation = nil }) {
                apply(request, monitor)
            }
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
    private func cardHead<Trailing: View>(_ title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: metric("small")) {
            Text(title).font(.vzn("subtitleScale", .semibold)).accessibilityAddTraits(.isHeader)
            Spacer(minLength: metric("small"))
            trailing()
        }
    }
    // Control mode: state chip in the head, hint, glass menus, then manual control below a hairline.
    private func glassControlCard(_ monitor: ThermalMonitor) -> some View {
        let mode = monitor.controlMode.label(profiles: monitor.profiles, text: store.text)
        let automatic = monitor.controlMode == .automatic
        return VStack(alignment: .leading, spacing: metric("gap")) {
            cardHead(store.text("fanControlMode")) {
                StatusBadge(text: mode, tone: automatic ? .ready : .busy)
            }
            if automatic { hint(store.text("fanModeHint")) }
            fanError(monitor)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: metric("small")) {
                    popoverButtons(monitor, mode: mode)
                    Spacer(minLength: 0)
                    restoreButton(monitor)
                }
                VStack(alignment: .leading, spacing: metric("small")) {
                    popoverButtons(monitor, mode: mode)
                    restoreButton(monitor)
                }
            }
            .popover(item: $fanPopover) { popover in
                switch popover {
                case .profiles: profileList(monitor)
                case .rules: ruleEditor(monitor)
                }
            }
            runningStatus(monitor)
            CardDivider()
            HStack(spacing: metric("small")) {
                Text(store.text("manualControl")).font(.system(size: NSFont.systemFontSize, weight: .semibold))
                Spacer(minLength: metric("small"))
                StatusBadge(text: store.text(monitor.helperStatus), tone: ThermalStatus.helperTone(monitor.helperStatus))
            }
            if monitor.helperStatus == "helperApproval" { approvalPrompt(monitor) }
            if monitor.helperStatus == "helperUnavailable" {
                hint(store.text("thermal_fan_helper_not_installed_desc"))
                helperActions(monitor)
            }
            if monitor.helperStatus == "thermal_fan_helper_missing_short" {
                hint(store.text("thermal_fan_helper_missing"))
            }
            // Targets are only offered once the helper can apply them.
            if monitor.helperStatus == "helperEnabled" {
                let blocked = FanControlDisplay.manualBlock(calibrating: monitor.calibrating, monitoring: monitor.monitoring)
                if let blocked { hint(store.text(blocked)) }
                ForEach(monitor.snapshot?.fans ?? []) { fan in
                    NativeFanRow(store: store, fan: fan, name: fanName(fan),
                                 context: FanSliderContext(mode: monitor.controlMode, held: monitor.manualTargets[fan.index], rules: monitor.activeRules),
                                 available: blocked == nil) { rpm in
                        requestControl(.manual(index: fan.index, rpm: rpm), monitor)
                    }
                }
            }
            if monitor.helperStatus == "helperEnabled" {
                HStack {
                    Spacer()
                    Menu(store.text("setUpHelper")) { helperActions(monitor) }.menuStyle(.button).buttonStyle(.vznQuiet).fixedSize()
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).cardSurface()
    }
    @ViewBuilder private func readerNotice(_ monitor: ThermalMonitor) -> some View {
        switch ThermalStatus.readerState(error: monitor.error, monitoring: monitor.monitoring,
                                         sensorCount: monitor.snapshot.map { $0.sensors?.count ?? 0 }) {
        case .missing, .failed:
            let missing = monitor.error == "thermalReaderMissing"
            VStack(alignment: .leading, spacing: metric("small")) {
                InlineFailure(title: store.text(missing ? "thermal_reader_missing_title" : "thermal_error_title"),
                              detail: store.text(missing ? "thermal_reader_missing_desc" : "thermal_error_desc"))
                Button(store.text("retry")) { monitor.stop(); monitor.start() }
                    .buttonStyle(.vznOutline).accessibilityIdentifier("thermal-retry")
            }
        case .empty:
            NoticeBand(role: "warning", edge: false) {
                VStack(alignment: .leading, spacing: metric("tight")) {
                    Label(store.text("thermal_no_sensors_title"), systemImage: "thermometer.medium")
                        .font(.vzn("labelScale", .semibold))
                    hint(store.text("thermal_no_sensors_desc"))
                }.accessibilityElement(children: .combine)
            }
        case .waiting: StatusBadge(text: store.text("thermal_waiting"), tone: .busy)
        case .idle:
            GlassEmptyState(symbol: "thermometer.medium", tone: "tone-orange", title: store.text("sensorsEmpty"),
                            hint: store.text("sensorsEmptyHint")).padding(.vertical, metric("large") * 2)
        case .reading: EmptyView()
        }
    }
    @ViewBuilder fileprivate func controlCard(_ monitor: ThermalMonitor) -> some View {
        glassControlCard(monitor)
    }
    private func popoverButtons(_ monitor: ThermalMonitor, mode: String) -> some View {
        HStack(spacing: metric("small")) {
            ForEach([FanPopover.profiles, .rules]) { item in
                let opener: Opener = item == .rules ? .rules : .profiles
                Button {
                    rememberOpener(opener)
                    if item == .rules { openEditor(monitor) } else { fanPopover = .profiles }
                } label: {
                    HStack(spacing: metric("tight")) {
                        Text(store.text(item == .rules ? "fanRules" : "fanProfiles"))
                        Image(systemName: "chevron.down").imageScale(.small).accessibilityHidden(true)
                    }
                }.buttonStyle(.vznOutline).fixedSize().accessibilityValue(mode)
                    .focused($openerFocus, equals: opener)
                    .accessibilityFocused($assistiveFocus, equals: opener)
            }
        }
    }

    private func rememberOpener(_ opener: Opener) {
        returnFocus = FanEditorKeyboard.returnsFocus(after: NSApp.currentEvent?.type) ? opener : nil
        returnAssistiveFocus = assistiveFocus == opener || NSWorkspace.shared.isVoiceOverEnabled
    }

    private func openEditor(_ monitor: ThermalMonitor, saving: Bool = false) {
        draftRule = FanControlDisplay.initialRule(monitor.activeRules)
        profileName = ""
        profileSaveError = nil
        savingProfile = saving
        fanPopover = .rules
    }

    @ViewBuilder private func restoreButton(_ monitor: ThermalMonitor) -> some View {
        if monitor.controlMode.canRestore {
            Button(store.text("thermal_fan_restore_all")) {
                awaitingApply = nil
                monitor.restoreAutomatic {
                    ToastCenter.shared.show(store.text("fanRestoredToast"), key: "thermal-fan")
                }
            }.buttonStyle(.vznOutline).fixedSize()
        }
    }

    @ViewBuilder private func runningStatus(_ monitor: ThermalMonitor) -> some View {
        if monitor.activeRules != nil || !monitor.manualTargets.isEmpty {
            let fans = monitor.snapshot?.fans ?? []
            VStack(alignment: .leading, spacing: metric("tight")) {
                if let rules = monitor.activeRules {
                    let summary = Text(ruleSummary(FanControlDisplay.initialRule(rules), monitor))
                        .font(.vzn("smallScale", .medium)).foregroundStyle(contentColor("text-strong", scheme))
                    if monitor.activeProfile == "custom" {
                        let save = Button(store.text("fanSaveAsProfile")) {
                            rememberOpener(.saveRunning)
                            openEditor(monitor, saving: true)
                        }
                        .buttonStyle(.vznQuiet).controlSize(.small).fixedSize()
                        .focused($openerFocus, equals: .saveRunning)
                        .accessibilityFocused($assistiveFocus, equals: .saveRunning)
                        ViewThatFits(in: .horizontal) {
                            HStack { summary.fixedSize(); Spacer(minLength: 0); save }
                            VStack(alignment: .leading, spacing: metric("tight")) { summary; save }
                        }
                    } else { summary }
                    if monitor.controlling {
                        ForEach(fans) { fan in
                            let reading = FanControlDisplay.reading(monitor.policyReadings[fan.index], text: store.text)
                            hint(fans.count > 1 ? fanName(fan) + ": " + reading : reading).monospacedDigit()
                        }
                    } else { hint(store.text("fanApplying")) }
                } else {
                    ForEach(monitor.manualTargets.keys.sorted(), id: \.self) { index in
                        if let rpm = monitor.manualTargets[index] {
                            let name = fans.first { $0.index == index }.map(fanName)
                                ?? store.text("thermal_fan_name").replacingOccurrences(of: "{n}", with: String(index + 1))
                            hint(name + ": " + FanSliderValue.target(rpm).label(store.text)).monospacedDigit()
                        }
                    }
                }
            }.padding(metric("small")).frame(maxWidth: .infinity, alignment: .leading)
                .background(contentColor("surface-muted", scheme), in: RoundedRectangle(cornerRadius: metric("small")))
        }
    }

    private func ruleSummary(_ rule: FanRule, _ monitor: ThermalMonitor) -> String {
        FanControlDisplay.summary(rule, sensors: monitor.snapshot?.sensors ?? [], text: store.text)
    }

    private func hint(_ message: String, role: String = "text-muted") -> some View {
        Text(message).font(.vzn("smallScale")).foregroundStyle(contentColor(role, scheme))
            .fixedSize(horizontal: false, vertical: true)
    }

    private func applyBlock(_ monitor: ThermalMonitor) -> String? {
        FanControlDisplay.applyBlock(helper: monitor.helperStatus, calibrating: monitor.calibrating,
                                     monitoring: monitor.monitoring, fans: monitor.snapshot?.fans ?? [])
    }

    private func requestControl(_ request: FanControlRequest, _ monitor: ThermalMonitor) {
        fanPopover = nil
        if monitor.manualControlConfirmed { apply(request, monitor) } else { confirmation = request }
    }

    private func apply(_ request: FanControlRequest, _ monitor: ThermalMonitor) {
        guard monitor.helperStatus == "helperEnabled", monitor.monitoring, !monitor.calibrating else { return }
        switch request {
        case .profile(let id):
            guard applyBlock(monitor) == nil, monitor.profiles.contains(where: { $0.id == id }) else { return }
            monitor.applyProfile(id)
        case .rules(let rule):
            guard rule.valid, rulePreview(rule, monitor).block == nil else { return }
            monitor.applyRules(["*": rule])
        case let .manual(index, rpm):
            monitor.setTarget(index: index, rpm: rpm)
        }
        monitor.manualControlConfirmed = true
        awaitingApply = request
    }

    private func confirmedApplyName(_ monitor: ThermalMonitor) -> String? {
        guard let awaitingApply,
              awaitingApply.isConfirmed(controlling: monitor.controlling, profileID: monitor.activeProfile,
                                        rules: monitor.activeRules, targets: monitor.manualTargets) else { return nil }
        return FanControlDisplay.modeName(profileID: monitor.activeProfile, profiles: monitor.profiles,
                                          manual: !monitor.manualTargets.isEmpty, text: store.text)
    }

    private func profileList(_ monitor: ThermalMonitor) -> some View {
        let blocked = applyBlock(monitor)
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let blocked { hint(store.text(blocked)) }
                ForEach(monitor.profiles) { profile in
                    let name = FanControlDisplay.profileName(profile, text: store.text)
                    let active = monitor.activeProfile == profile.id
                    CardRow(title: name, detail: profile.rules["*"].map { ruleSummary($0, monitor) } ?? "",
                            divider: profile.id != monitor.profiles.last?.id) {
                        if active {
                            StatusBadge(text: store.text(monitor.controlling ? "fanRunning" : "fanApplying"), tone: .busy)
                        }
                        Button(store.text("apply")) { requestControl(.profile(profile.id), monitor) }
                            .buttonStyle(.vznOutline).disabled(active || blocked != nil)
                        if UUID(uuidString: profile.id) != nil {
                            Button(store.text("delete"), role: .destructive) { monitor.removeProfile(profile.id) }
                                .buttonStyle(.vznQuiet)
                                .accessibilityLabel(store.text("thermal_fan_profile_delete").replacingOccurrences(of: "{name}", with: name))
                        }
                    }
                }
            }.padding(metric("inset"))
        }.scrollBounceBehavior(.basedOnSize).frame(maxHeight: metric("reading"))
            .fixedSize(horizontal: false, vertical: true).frame(width: metric("sidebar") + metric("editor"))
    }

    private func rulePreview(_ rule: FanRule, _ monitor: ThermalMonitor) -> FanRulePreview {
        FanRulePreview(rule: rule, snapshot: monitor.snapshot, affinity: monitor.affinity,
                       helper: monitor.helperStatus, calibrating: monitor.calibrating, monitoring: monitor.monitoring)
    }

    private func ruleEditor(_ monitor: ThermalMonitor) -> some View {
        let sensors = monitor.snapshot?.sensors ?? []
        let preview = rulePreview(draftRule, monitor)
        let temperatureError = FanControlDisplay.temperatureError(draftRule)
        return VStack(alignment: .leading, spacing: metric("small")) {
            Text(store.text("fanRules")).font(.vzn("labelScale", .semibold)).accessibilityAddTraits(.isHeader)
            hint(monitor.controlMode.ruleStatus(profiles: monitor.profiles, text: store.text))
            Picker(store.text("fanSensor"), selection: $draftRule.sensor) {
                ForEach(FanControlDisplay.aggregateSources, id: \.self) { source in
                    Text(FanControlDisplay.sourceName(source, sensors: sensors, text: store.text)).tag(source)
                }
                if !sensors.isEmpty { Divider() }
                ForEach(sensors) { Text($0.displayCaption(store.text)).tag($0.key) }
                if !FanControlDisplay.aggregateSources.contains(draftRule.sensor), !sensors.contains(where: { $0.key == draftRule.sensor }) {
                    Text(draftRule.sensor).tag(draftRule.sensor)
                }
            }.focused($ruleFocus, equals: .source)
            if draftRule.sensor.hasPrefix("hid:") { hint(store.text("fanHidCeilingNote")) }
            Stepper(store.text("fanMinimumTemperature") + ": " + FanControlDisplay.degrees(draftRule.lower), value: $draftRule.lower, in: 20...109)
            Stepper(store.text("fanMaximumTemperature") + ": " + FanControlDisplay.degrees(draftRule.upper), value: $draftRule.upper, in: 21...110)
            if let temperatureError { hint(store.text(temperatureError), role: "danger") }
            let fans = monitor.snapshot?.fans ?? []
            ForEach(fans) { fan in
                if let reading = preview.readings[fan.index] {
                    hint(FanRulePreview.line(reading, fan: fans.count > 1 ? fanName(fan) : nil,
                                             locale: Locale(identifier: store.workspace.locale), text: store.text)).monospacedDigit()
                }
            }
            if savingProfile { profileNameForm(monitor) } else {
                Button(store.text("fanSaveAsProfile")) { savingProfile = true }.buttonStyle(.vznQuiet)
                    .focused($ruleFocus, equals: .saveAs)
            }
            if let blocked = preview.block { hint(store.text(blocked)) }
            HStack {
                Spacer()
                Button(store.text("apply")) {
                    guard !FanEditorKeyboard.isComposing(NSApp.keyWindow?.firstResponder) else { return }
                    requestControl(.rules(draftRule), monitor)
                }
                    .buttonStyle(.vznPrimary).disabled(!draftRule.valid || preview.block != nil)
                    .keyboardShortcut(savingProfile ? nil : .defaultAction)
            }
        }.padding(metric("inset")).frame(width: metric("sidebar") + metric("editor"))
            .onAppear { ruleFocus = savingProfile ? .name : .source }
            .onChange(of: savingProfile) { _, naming in ruleFocus = naming ? .name : .saveAs }
            .onExitCommand {
                switch FanEditorKeyboard.escape(naming: savingProfile, responder: NSApp.keyWindow?.firstResponder) {
                case .composition: break
                case .name: cancelNaming()
                case .popover: fanPopover = nil
                }
            }
    }

    private func cancelNaming() {
        savingProfile = false
        profileName = ""
        profileSaveError = nil
    }

    private func profileNameForm(_ monitor: ThermalMonitor) -> some View {
        let blocked = FanControlDisplay.saveBlock(name: profileName, count: monitor.profiles.count - FanProfile.builtins.count)
        func save() {
            guard fanPopover == .rules, savingProfile, !FanEditorKeyboard.isComposing(NSApp.keyWindow?.firstResponder),
                  blocked == nil, draftRule.valid else { return }
            let id = monitor.saveProfile(name: profileName, rules: ["*": draftRule])
            switch FanProfileSaveFeedback(savedID: id, name: profileName, text: store.text) {
            case .fieldError(let key): profileSaveError = key
            case .saved(let message):
                profileSaveError = nil
                fanPopover = nil
                ToastCenter.shared.show(message, key: "thermal-fan")
            }
        }
        return VStack(alignment: .leading, spacing: metric("tight")) {
            TextField(store.text("thermal_fan_profile_name_placeholder"), text: $profileName).textFieldStyle(.roundedBorder)
                .focused($ruleFocus, equals: .name)
                .accessibilityHint((profileSaveError ?? blocked).map(store.text) ?? "")
                .onSubmit(save)
                .onChange(of: profileName) { profileSaveError = nil }
            if let blocked { hint(store.text(blocked)) }
            if let profileSaveError { hint(store.text(profileSaveError), role: "danger") }
            HStack {
                Button(store.text("save"), action: save).buttonStyle(.vznOutline).disabled(blocked != nil || !draftRule.valid)
                Button(store.text("cancel"), action: cancelNaming).buttonStyle(.vznQuiet)
            }
        }
    }
    /// A failed fan action is reported in the card that started it, not under the sensor list.
    @ViewBuilder fileprivate func fanError(_ monitor: ThermalMonitor) -> some View {
        if let error = monitor.error, !ThermalStatus.isReaderError(error) {
            Label { Text(store.text(error)).foregroundStyle(contentColor("text-strong", scheme)).fixedSize(horizontal: false, vertical: true) }
                icon: { Image(systemName: "exclamationmark.triangle").foregroundStyle(contentColor("danger", scheme)) }
                .font(.vzn("labelScale")).accessibilityIdentifier("thermal-fan-error")
        }
    }
    /// Thermal spec §3: CPU and GPU stay open; "Cảm biến khác" starts folded and shows its hottest reading.
    @ViewBuilder fileprivate func groupHead(_ group: ThermalSensors.Group, hottest: Double?) -> some View {
        let name = store.text("thermal_group_" + group.rawValue)
        if group == .other {
            let hint = store.text(otherOpen ? "thermal_group_collapse" : "thermal_group_expand").replacingOccurrences(of: "{group}", with: name)
            Button { otherOpen.toggle() } label: {
                HStack(spacing: metric("tight")) {
                    Image(systemName: "chevron.right").imageScale(.small).rotationEffect(.degrees(otherOpen ? 90 : 0)).foregroundStyle(contentColor("text-muted", scheme)).accessibilityHidden(true)
                    Eyebrow(text: name)
                    Spacer(minLength: metric("small"))
                    if !otherOpen, let hottest { Text(String(format: "%.0f °C", hottest)).monospacedDigit().fontWeight(.semibold).foregroundStyle(toneColor(hottest)) }
                }.contentShape(Rectangle())
            }.buttonStyle(.plain).help(hint).accessibilityHint(hint).accessibilityIdentifier("thermal-group-other")
        } else { Eyebrow(text: name) }
    }
    /// Thermal spec "Helper: chờ phê duyệt": say what is needed and offer System Settings in place.
    fileprivate func approvalPrompt(_ monitor: ThermalMonitor) -> some View {
        NoticeBand(role: "warning", edge: false) {
            VStack(alignment: .leading, spacing: metric("small")) {
                Label(store.text("thermal_fan_helper_approval_title"), systemImage: "exclamationmark.triangle")
                    .font(.vzn("labelScale", .semibold)).fixedSize(horizontal: false, vertical: true)
                hint(store.text("thermal_fan_helper_approval_desc"))
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: metric("small")) { helperActions(monitor) }.fixedSize()
                    VStack(alignment: .leading, spacing: metric("small")) { helperActions(monitor) }
                }
            }
        }
    }
    fileprivate func helperActions(_ monitor: ThermalMonitor) -> some View {
        ForEach(FanHelperAction.available(for: monitor.helperStatus), id: \.self) { action in
            let button = Button(store.text(action.rawValue), role: action == .unregisterHelper ? .destructive : nil) {
                switch action {
                case .registerHelper: confirmHelper = true
                case .unregisterHelper: confirmRemoval = true
                case .openSystemSettings: monitor.openHelperSettings()
                case .retry: monitor.refreshHelperStatus()
                }
            }
            if monitor.helperStatus != "helperEnabled" {
                button.buttonStyle(action.approvalStyle)
            } else { button }
        }
    }
    @ViewBuilder fileprivate func sensorCard(_ monitor: ThermalMonitor) -> some View {
        glassSensorCard(monitor)
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

            ForEach(ThermalSensors.Group.allCases, id: \.self) { group in
                if let rows = groups[group], !rows.isEmpty {
                    groupHead(group, hottest: rows.map(\.max).max()).padding(.horizontal, metric("inset")).padding(.top, metric("small")).padding(.bottom, metric("tight"))
                    CardDivider()
                    if group != .other || otherOpen { ForEach(rows) { row in
                        CardRow(title: row.label.map { store.text("thermal_label_" + $0) } ?? store.text("thermal_sensor_unlabeled"),
                                detail: store.text("thermal_sensor_row_caption").replacingOccurrences(of: "{count}", with: String(row.sensors.count)).replacingOccurrences(of: "{avg}", with: String(format: "%.0f °C", row.average))) {
                            Text(String(format: "%.0f °C", row.max)).monospacedDigit().fontWeight(.semibold).foregroundStyle(toneColor(row.max))
                        }.help(sensorHelp(row))
                    } }
                }
            }
            if !sensors.isEmpty {
                rawSensorList(sensors).font(.vzn("smallScale")).padding(metric("inset"))
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
}

extension ThermalSnapshot.Sensor {
    var displayName: String {
        guard isHID else { return key }
        if let name, !name.isEmpty { return name }
        return key.hasPrefix("hid:") ? String(key.dropFirst("hid:".count)) : key
    }

    func displayDetail(_ text: (String) -> String) -> String {
        ThermalSensors.classify(self).label.map { text("thermal_label_" + $0) } ?? (isHID ? "" : key)
    }

    func displayCaption(_ text: (String) -> String) -> String {
        let detail = displayDetail(text)
        return detail.isEmpty ? displayName : detail + " · " + displayName
    }

    static func hottestFirst(_ lhs: Self, _ rhs: Self) -> Bool {
        if lhs.celsius != rhs.celsius { return lhs.celsius > rhs.celsius }
        return (lhs.displayName, lhs.key) < (rhs.displayName, rhs.key)
    }
}

extension ThermalWorkspace {
    private func sensorHelp(_ row: ThermalSensors.Row) -> String {
        row.sensors.map { $0.displayName + " " + String(format: "%.0f °C", $0.celsius) }.joined(separator: "\n")
    }

    private func rawSensorList(_ sensors: [ThermalSnapshot.Sensor]) -> some View {
        DisclosureGroup(store.text("thermal_sensor_count").replacingOccurrences(of: "{count}", with: String(sensors.count))) {
            ForEach(sensors.sorted(by: ThermalSnapshot.Sensor.hottestFirst)) { sensor in
                let name = sensor.displayName
                let detail = sensor.displayDetail(store.text)
                let temperature = String(format: "%.0f °C", sensor.celsius)
                let row = CardRow(title: name, detail: detail) { Text(temperature).monospacedDigit() }
                if sensor.isHID {
                    row.lineLimit(2).truncationMode(.tail)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel([name, detail, temperature].filter { !$0.isEmpty }.joined(separator: ", "))
                } else {
                    row
                }
            }
        }
    }

    /// Warm (≥ 70 °C) and hot (≥ 90 °C) readings stand out; the number still carries the meaning.
    func toneColor(_ celsius: Double) -> Color {
        switch ThermalSensors.tone(celsius) { case "hot": contentColor("danger", scheme); case "warm": contentColor("warning", scheme); default: .primary }
    }
}
enum FanControlRequest {
    case rules(FanRule)
    case profile(String)
    case manual(index: Int, rpm: Double)

    func isConfirmed(controlling: Bool, profileID: String?, rules: [String: FanRule]?, targets: [Int: Double]) -> Bool {
        guard controlling else { return false }
        switch self {
        case .profile(let id): return profileID == id
        case .rules(let rule): return rules == ["*": rule]
        case let .manual(index, rpm): return targets[index] == rpm.rounded()
        }
    }
}

private extension ThermalMonitor {
    var controlMode: FanControlMode {
        FanControlMode(profileID: activeProfile, controlling: controlling, hasTargets: !manualTargets.isEmpty,
                       calibrating: calibrating, manualPending: manualTargetPending)
    }
}

enum FanControlMode: Equatable {
    case automatic, calibrating, applying(String?), profile(String), manual

    init(profileID: String?, controlling: Bool, hasTargets: Bool, calibrating: Bool, manualPending: Bool) {
        if calibrating { self = .calibrating }
        else if manualPending { self = .applying(nil) }
        else if let profileID { self = controlling ? .profile(profileID) : .applying(profileID) }
        else { self = hasTargets || controlling ? .manual : .automatic }
    }

    var canRestore: Bool { self != .automatic }
    func shouldStopOnDisappear(startedHere: Bool) -> Bool { startedHere && self == .automatic }

    func label(profiles: [FanProfile], text: (String) -> String) -> String {
        switch self {
        case .automatic: text("systemControlled")
        case .calibrating: text("fanCalibrating")
        case .applying: text("fanApplying")
        case .manual: text("fanManualActive")
        case .profile(let id): FanControlDisplay.modeName(profileID: id, profiles: profiles, manual: false, text: text)
        }
    }

    func ruleStatus(profiles: [FanProfile], text: (String) -> String) -> String {
        switch self {
        case .automatic: text("fanRuleNotApplied")
        case .calibrating, .applying: label(profiles: profiles, text: text)
        case .profile, .manual: text("fanRuleInUse").replacingOccurrences(of: "{name}", with: label(profiles: profiles, text: text))
        }
    }
}

struct FanRulePreview {
    let readings: [Int: FanPolicy.Reading]
    let block: String?

    init(rule: FanRule, snapshot: ThermalSnapshot?, affinity: [Int: [String]], helper: String, calibrating: Bool, monitoring: Bool) {
        let fans = snapshot?.fans ?? []
        let preview = monitoring ? snapshot.map { FanPolicy.preview($0, rule: rule, affinity: affinity) } ?? [:] : [:]
        readings = preview
        let unavailable = FanControlDisplay.applyBlock(helper: helper, calibrating: calibrating, monitoring: monitoring, fans: fans)
        let missing = rule.valid && fans.contains { preview[$0.index] == nil }
        block = unavailable ?? (missing ? "fanRuleSensorMissing" : nil)
    }

    static func line(_ reading: FanPolicy.Reading, fan: String?, locale: Locale, text: (String) -> String) -> String {
        let number = FloatingPointFormatStyle<Double>.number.precision(.fractionLength(0)).locale(locale)
        let value = "\(reading.celsius.formatted(number)) °C → \(reading.rpm.formatted(number)) RPM"
        return text("fanRulePreview").replacingOccurrences(of: "{reading}", with: fan.map { $0 + ": " + value } ?? value)
    }
}

enum FanProfileSaveFeedback: Equatable {
    case fieldError(String), saved(String)

    init(savedID: String?, name: String, text: (String) -> String) {
        if savedID == nil { self = .fieldError("fanProfileSaveError") }
        else { self = .saved(text("fileSaved").replacingOccurrences(of: "{name}", with: name)) }
    }
}

enum FanControlDisplay {
    static let aggregateSources = ["all", "cpu", "gpu", "affinity"]

    static func canApplyFromMenu(confirmed: Bool, helper: String, monitoring: Bool, calibrating: Bool) -> Bool {
        confirmed && helper == "helperEnabled" && monitoring && !calibrating
    }

    static func initialRule(_ active: [String: FanRule]?) -> FanRule {
        if let rule = active?["*"] { return rule }
        // Older profiles can contain only fan-indexed rules. Start with the first fan's rule.
        if let active, let index = active.keys.compactMap(Int.init).min(), let rule = active[String(index)] { return rule }
        return FanRule()
    }

    static func profileName(_ profile: FanProfile, text: (String) -> String) -> String {
        UUID(uuidString: profile.id) == nil ? text(profile.name) : profile.name
    }

    static func modeName(profileID: String?, profiles: [FanProfile], manual: Bool, text: (String) -> String) -> String {
        if profileID == "custom" { return text("thermal_fan_profile_custom") }
        if let profile = profiles.first(where: { $0.id == profileID }) { return profileName(profile, text: text) }
        return text(manual ? "fanManualActive" : "systemControlled")
    }

    static func sourceName(_ source: String, sensors: [ThermalSnapshot.Sensor], text: (String) -> String) -> String {
        switch source {
        case "all": text("fanAllSensors")
        case "cpu": "CPU"
        case "gpu": "GPU"
        case "affinity": text("fanAffinity")
        default: sensors.first { $0.key == source }?.displayCaption(text) ?? source
        }
    }

    static func degrees(_ value: Double) -> String { String(format: "%g °C", value) }

    static func summary(_ rule: FanRule, sensors: [ThermalSnapshot.Sensor], text: (String) -> String) -> String {
        text("fanRuleActiveSummary")
            .replacingOccurrences(of: "{low}", with: String(format: "%g", rule.lower))
            .replacingOccurrences(of: "{high}", with: String(format: "%g", rule.upper))
            .replacingOccurrences(of: "{source}", with: sourceName(rule.sensor, sensors: sensors, text: text))
    }

    static func reading(_ reading: FanPolicy.Reading?, text: (String) -> String) -> String {
        guard let reading else { return text("thermal_fan_sensor_missing") }
        return text("thermal_fan_sensor_now")
            .replacingOccurrences(of: "{celsius}", with: String(format: "%.0f °C", reading.celsius))
            .replacingOccurrences(of: "{rpm}", with: String(format: "%.0f RPM", reading.rpm))
    }

    static func applyBlock(helper: String, calibrating: Bool, monitoring: Bool, fans: [ThermalSnapshot.Fan]) -> String? {
        if helper != "helperEnabled" { return "fanRuleNeedHelper" }
        if let block = manualBlock(calibrating: calibrating, monitoring: monitoring) { return block }
        guard !fans.isEmpty, fans.allSatisfy({ fan in
            guard let low = fan.min, let high = fan.max else { return false }
            return low.isFinite && high.isFinite && low < high
        }) else { return "fanRuleNeedFanData" }
        return nil
    }

    static func temperatureError(_ rule: FanRule) -> String? {
        rule.upper > rule.lower ? nil : "fanRuleTempOrderError"
    }

    static func manualBlock(calibrating: Bool, monitoring: Bool) -> String? {
        if calibrating { return "fanRuleCalibrating" }
        return monitoring ? nil : "sensorsEmptyHint"
    }

    static func saveBlock(name: String, count: Int) -> String? {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "fanRuleNameRequired" }
        if name.count > 100 { return "fanRuleNameLimit" }
        if count >= 50 { return "fanProfileLimit" }
        return nil
    }
}

enum FanEditorKeyboard {
    enum EscapeTarget { case composition, name, popover }

    @MainActor static func isComposing(_ responder: NSResponder?) -> Bool {
        (responder as? NSTextInputClient)?.hasMarkedText() == true
    }

    @MainActor static func escape(naming: Bool, responder: NSResponder?) -> EscapeTarget {
        if isComposing(responder) { return .composition }
        return naming ? .name : .popover
    }

    static func returnsFocus(after event: NSEvent.EventType?) -> Bool {
        switch event {
        case .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp: false
        default: true // Includes assistive activation without a current key event.
        }
    }
}

struct FanSliderContext: Equatable {
    let mode: FanControlMode
    let held: Double?
    let rules: [String: FanRule]?

    func retainedDraft(_ draft: Double?, from previous: Self) -> Double? {
        guard mode == previous.mode, rules == previous.rules, previous.held == nil || held != nil else { return nil }
        if let oldTarget = previous.held, oldTarget == draft?.rounded() { return nil }
        if let held, held == draft?.rounded() { return nil }
        return draft
    }
}

enum FanSliderValue: Equatable {
    case current(Double), selected(Double), target(Double)

    static func resolve(current: Double, held: Double?, draft: Double?) -> Self {
        if let draft, draft.rounded() != held { return .selected(draft) }
        if let held { return .target(held) }
        return .current(current)
    }

    var rpm: Double {
        switch self { case let .current(rpm), let .selected(rpm), let .target(rpm): rpm }
    }

    func position(in range: ClosedRange<Double>) -> Double {
        min(range.upperBound, max(range.lowerBound, rpm))
    }

    func canApply(held: Double?, in range: ClosedRange<Double>) -> Bool {
        guard case .selected(let rpm) = self else { return false }
        return range.contains(rpm) && held != rpm.rounded()
    }

    func label(_ text: (String) -> String) -> String {
        let number = String(format: "%.0f", rpm)
        switch self {
        case .current: return number + " RPM"
        case .selected: return text("fanManualSelection").replacingOccurrences(of: "{rpm}", with: number)
        case .target: return text("thermal_fan_target").replacingOccurrences(of: "{rpm}", with: number)
        }
    }

    func accessibilityValue(_ text: (String) -> String) -> String {
        if case .current(let rpm) = self {
            return text("fanCurrentSpeed").replacingOccurrences(of: "{rpm}", with: String(format: "%.0f", rpm))
        }
        return label(text)
    }

    var colorRole: String {
        switch self {
        case .current: "text-muted"
        case .selected: "text-strong"
        case .target: "action-text"
        }
    }
}

private struct NativeFanRow: View {
    let store: WorkbenchStore
    let fan: ThermalSnapshot.Fan
    let name: String
    let context: FanSliderContext
    let available: Bool
    let apply: (Double) -> Void
    @State private var currentRPM: Double?
    @State private var draftTarget: Double?
    @State private var dragStart: Double?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let held = context.held
        if let minimum = fan.min, let maximum = fan.max, minimum.isFinite, maximum.isFinite, maximum > minimum {
            let range = minimum...maximum
            let value = FanSliderValue.resolve(current: currentRPM ?? fan.rpm, held: held, draft: draftTarget ?? dragStart)
            HStack(spacing: metric("small")) {
                Text(name).font(.vzn("smallScale")).lineLimit(1)
                Slider(value: Binding(get: { value.position(in: range) }, set: { draftTarget = $0 }),
                       in: range, step: 50, onEditingChanged: { editing in
                    dragStart = editing ? value.position(in: range) : nil
                }).controlSize(.small).disabled(!available)
                    .accessibilityLabel(store.text("fanSliderLabel").replacingOccurrences(of: "{fan}", with: name))
                    .accessibilityValue(value.accessibilityValue(store.text))
                Text(value.label(store.text)).font(.vzn("smallScale")).monospacedDigit()
                    .foregroundStyle(contentColor(value.colorRole, scheme)).fixedSize()
                Button(store.text("apply")) { apply(value.rpm) }.buttonStyle(.vznOutline).fixedSize()
                    .disabled(draftTarget == nil || !available || !value.canApply(held: held, in: range))
            }
            .onChange(of: fan.rpm, initial: true) { _, rpm in currentRPM = rpm }
            .onChange(of: context) { previous, current in
                draftTarget = current.retainedDraft(draftTarget, from: previous)
                dragStart = nil
            }
        } else {
            Text(name + " · " + FanSliderValue.resolve(current: fan.rpm, held: held, draft: nil).label(store.text))
        }
    }
}

enum FanHelperAction: String {
    case registerHelper, unregisterHelper, openSystemSettings, retry

    static func available(for status: String) -> [Self] {
        switch status {
        case "helperApproval": [.unregisterHelper, .openSystemSettings, .retry]
        case "helperEnabled": [.unregisterHelper]
        case "helperUnavailable": [.registerHelper]
        default: []
        }
    }
    @MainActor var approvalStyle: VznButtonStyle {
        switch self {
        case .unregisterHelper: .vznQuiet
        case .retry: .vznPrimary
        case .openSystemSettings, .registerHelper: .vznOutline
        }
    }
}

enum ThermalStatus {
    enum ReaderState { case idle, waiting, missing, failed, empty, reading }
    static func readerState(error: String?, monitoring: Bool, sensorCount: Int?) -> ReaderState {
        if error == "thermalReaderMissing" { return .missing }
        if error == "thermalReadError" { return .failed }
        if let sensorCount { return sensorCount == 0 ? .empty : .reading }
        return monitoring ? .waiting : .idle
    }
    static func isReaderError(_ error: String) -> Bool { ["thermalReaderMissing", "thermalReadError"].contains(error) }
    /// Thermal-States: an approved helper is ready; one waiting for approval in System Settings is a
    /// warning, because fan control does nothing until the person acts; anything else is idle.
    static func helperTone(_ status: String) -> StatusTone {
        status == "helperEnabled" ? .ready : status == "helperApproval" ? .warning : .idle
    }
}
