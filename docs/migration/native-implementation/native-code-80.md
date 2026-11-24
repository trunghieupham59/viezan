# Native code 80 — R1 · Điều khiển quạt bằng quy tắc tuỳ chỉnh trên macOS

## API cho giao diện

Các phương thức và thuộc tính sau thuộc `ThermalMonitor` (`@MainActor @Observable`).

```swift
public func applyRules(_ rules: [String: FanRule])
public func applyProfile(_ id: String)
@discardableResult public func saveProfile(name: String, rules: [String: FanRule]) -> String?
public var activeProfile: String? { get }
public var activeRules: [String: FanRule]? { get }
public var policyReadings: [Int: FanPolicy.Reading] { get }
public var manualTargets: [Int: Double] { get }
```

| Chế độ | `activeProfile` | `activeRules` | `manualTargets` |
| --- | --- | --- | --- |
| Tự động | `nil` | `nil` | Rỗng |
| Cấu hình có tên | ID cấu hình | Quy tắc của cấu hình | Rỗng |
| Quy tắc tuỳ chỉnh | `"custom"` | Quy tắc vừa áp | Rỗng |
| Giữ tốc độ thủ công | `nil` | `nil` | RPM theo chỉ số quạt sau khi helper xác nhận |

`applyRules` nhận từ 1 đến 16 mục. Khoá theo chỉ số quạt được ưu tiên trước `"*"`. Khi lệnh được chấp nhận, `activeProfile` và `activeRules` có giá trị ngay. Sau lần xác nhận đầu tiên từ helper, `controlling` thành `true` và `policyReadings` có số đo. Mỗi số đo ghép nhiệt độ nguồn đã làm mượt với RPM helper đang giữ, kể cả trong vùng chết. Có thể đọc riêng tiến trình hiệu chuẩn qua `calibrating`.

Lưu thành công trả UUID. Nếu toàn bộ quy tắc khớp với lượt tuỳ chỉnh hiện tại, vòng điều khiển tiếp tục với cùng lease và ID hiển thị đổi sang UUID đó. Lưu thất bại trả `nil`. Người dùng có thể chạy quy tắc trước khi gọi `saveProfile` để ghi vào `fan-profiles.json`.

```swift
// FanPolicy
public static func preview(_ snapshot: ThermalSnapshot, rule: FanRule, affinity: [Int: [String]] = [:]) -> [Int: Reading]
```

`FanPolicy.Reading` tuân thủ `Equatable` và `Sendable`, có `public let celsius: Double` và `public let rpm: Double`. Preview dùng nhiệt độ tức thời và khoảng RPM riêng của mỗi quạt. Quạt thiếu khoảng hợp lệ hoặc thiếu số đo nguồn sẽ vắng mặt trong kết quả. Nguồn HID yêu cầu đúng khoá cảm biến.

## Kiểm tra

- **Nguồn.** Đã đối chiếu hai API với cùng vòng điều khiển, ngưỡng làm mượt, vùng chết, thời hạn số đo 8 giây và kiểm tra lease sau khi chờ helper. Mất số đo hoặc mất ghi đè của một quạt sẽ báo `fanProfileApplyError` và xoá trạng thái điều khiển. Đã dùng workflow `ship-viezan-feature` và `native-migration`, rule `viezan-product-engineering`, `generate-code`, `native-migration` và skill `viezan-feature-planner`, `viezan-native-migration`.
- **Test.** `swift test --package-path apps/macos --filter FanControlStateTests` đạt 8/8 với cache tạm. Test dùng snapshot, phản hồi helper mẫu và tệp cấu hình trong thư mục tạm. Điều kiện nhận quy tắc khi đang giám sát và chuyển tuỳ chỉnh sang cấu hình có tên được kiểm ở kiểu thuần. Cả 7 test nhiệt/quạt có sẵn trong `WorkbenchTests.swift` cũng đạt.
- **Build.** `swift build --package-path apps/macos` đạt Debug với cache và `--scratch-path` riêng trong thư mục tạm. Hai lệnh mặc định bị sandbox chặn ghi Clang module cache khi nạp manifest. Lượt đạt dùng `--disable-sandbox --build-system native` của SwiftPM cùng cache tạm cho Clang và Swift. Hai lượt build trung gian bị gián đoạn khi `LauncherTools.swift` và `NativeToasts.swift` thay đổi đồng thời.
- **Chưa kiểm.** Chưa chạy toàn bộ suite macOS hoặc nghiệm thu với helper và quạt thật. Việc giữ RPM thủ công, chuyển về tự động và ngắt khi mất cảm biến trên thiết bị còn cần kiểm trực tiếp.
