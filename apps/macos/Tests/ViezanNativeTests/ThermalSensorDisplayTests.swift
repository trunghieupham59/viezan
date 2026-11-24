import Testing
import ViezanDomain
@testable import ViezanNative

struct ThermalSensorDisplayTests {
    private func text(_ key: String) -> String { NativeResources.shared.text(key, locale: "vi") }

    @Test func classifiedHIDUsesFullProductNameAndLocalizedLabel() {
        let sensor = ThermalSnapshot.Sensor(key: "hid:short-key", celsius: 39, name: "NAND CH0 temp", source: "hid")
        #expect(sensor.displayName == "NAND CH0 temp")
        #expect(sensor.displayDetail(text) == "Ổ lưu trữ")
        #expect(sensor.displayCaption(text) == "Ổ lưu trữ · NAND CH0 temp")
    }

    @Test func unclassifiedHIDShowsItsNameOnce() {
        let sensor = ThermalSnapshot.Sensor(key: "hid:PMU tdie1", celsius: 47, name: "PMU tdie1", source: "hid")
        #expect(sensor.displayName == "PMU tdie1")
        #expect(sensor.displayDetail(text).isEmpty)
        #expect(sensor.displayCaption(text) == "PMU tdie1")

        let missingName = ThermalSnapshot.Sensor(key: sensor.key, celsius: 47, source: "hid")
        #expect(missingName.displayCaption(text) == "PMU tdie1")
    }

    @Test func smcKeepsItsFourCharacterKeyAndLabel() {
        let sensor = ThermalSnapshot.Sensor(key: "TB0T", celsius: 32)
        #expect(sensor.displayName == "TB0T")
        #expect(sensor.displayDetail(text) == "Pin")
        #expect(sensor.displayCaption(text) == "Pin · TB0T")
    }

    @Test func rawListBreaksTemperatureTiesByDisplayNameThenKey() {
        let sensors: [ThermalSnapshot.Sensor] = [
            .init(key: "hid:a", celsius: 50, name: "Z sensor", source: "hid"),
            .init(key: "hid:z", celsius: 50, name: "A sensor", source: "hid"),
            .init(key: "TG0D", celsius: 50),
            .init(key: "hid:TG0D", celsius: 50, name: "TG0D", source: "hid"),
            .init(key: "TB0T", celsius: 75),
        ]
        let expected = ["TB0T", "hid:z", "TG0D", "hid:TG0D", "hid:a"]
        #expect(sensors.sorted(by: ThermalSnapshot.Sensor.hottestFirst).map(\.key) == expected)
        #expect(sensors.reversed().sorted(by: ThermalSnapshot.Sensor.hottestFirst).map(\.key) == expected)
    }
}
