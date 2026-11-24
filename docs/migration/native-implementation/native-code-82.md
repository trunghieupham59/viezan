# Story R2 — Áp dụng quy tắc quạt trên macOS

Tại thẻ **Chế độ điều khiển**, người dùng có thể xem trước rồi áp dụng quy tắc ngay, sau đó đặt tên nếu muốn. Thẻ phân biệt hệ thống, cấu hình có tên, quy tắc tuỳ chỉnh và giữ RPM thủ công. Số đo và mục tiêu đang chạy lấy từ `policyReadings` và `manualTargets`. Cả ba thao tác dùng chung `BlockingDialog` và cờ xác nhận trong bộ nhớ của `ThermalMonitor`.

## Kiểm tra

- **Nguồn.** Đã đối chiếu các lời gọi với R1. Trên `develop`, `controlCard` dùng thẳng `glassControlCard`; Classic đã được gỡ. `npm run resources`, `npm run check:resources` và `npm run check:docs` đạt. Hai bundle native giống nhau từng byte. Đã kiểm 17 khoá mới cùng placeholder trên VI/EN/JA.
- **Test.** `swift test --package-path apps/macos --filter FanControlDisplayTests` đạt 9/9 khi dùng cache tạm. Test bao phủ trạng thái phiên, xác nhận đúng lệnh trước khi báo áp dụng, nguồn và ngưỡng khi mở lại, lỗi điều kiện, nhãn và giá trị RPM ở ba trạng thái. Hai suite liên quan `FanControlStateTests` và `ThermalSensorDisplayTests` đạt 12/12.
- **Build.** Build Debug đạt. Hai lệnh SwiftPM mặc định bị sandbox chặn ghi Clang module cache khi nạp manifest. Lượt đạt dùng cùng package với `--build-system native --disable-sandbox --scratch-path` của SwiftPM cùng cache Swift/Clang riêng trong thư mục tạm.
- **Chưa kiểm.** Theo phạm vi R2, chưa chạy app, chụp ảnh hoặc điều khiển quạt thật. Cần kiểm các trạng thái sau tại 820 và 1200 pt, sáng/tối, VI/EN/JA, nhất là cỡ chữ lớn. Dùng bàn phím và VoiceOver để kiểm tên, giá trị, trạng thái tắt và khả năng tới nút Áp dụng (UX07–UX10).

### Cần xem trên bản chạy

1. Từ tự động, mở Quy tắc, đổi nguồn hoặc ngưỡng, so sánh dự kiến với số đo sau khi áp dụng. Huỷ lần xác nhận đầu rồi thử lại. Đổi cấu hình, chỉnh quạt thứ hai và khởi động lại app để kiểm vòng đời xác nhận.
2. Lưu quy tắc đang chạy thành cấu hình, mở lại hai popover và đối chiếu tên, nguồn, ngưỡng, huy hiệu và RPM từng quạt. Kiểm trạng thái thiếu dịch vụ, chưa có dữ liệu, đang hiệu chuẩn, ngưỡng sai và tên trống.
3. Quan sát thanh trượt qua nhiều lần đọc. Kéo nhưng chưa áp dụng, áp dụng rồi về tự động. Kiểm dòng số thực khi quạt dừng, nút về tự động ở chiều rộng hẹp và các trường hợp dịch vụ từ chối lệnh.

### Hai giới hạn của checkout

- Ô tên dùng đúng `thermal_fan_profile_name_placeholder`. Khoá đã có ở cả ba locale. Giá trị VI hiện là “Tên profile”; cần phép sửa giá trị cũ để hiển thị “Tên cấu hình”. EN và JA đã khớp bản duyệt.
- Toast áp dụng chờ đúng cấu hình hoặc mục tiêu được dịch vụ xác nhận. Với **Về tự động**, `restoreAutomatic()` xoá trạng thái đồng bộ và hoàn tất lệnh dịch vụ ở một task riêng. Toast phản ánh việc monitor đã nhả quyền. Lỗi lệnh hiển thị qua `monitor.error`; API hiện tại chưa cung cấp tín hiệu thành công để chờ phản hồi phần cứng.

Đã dùng workflow `ship-viezan-feature`, `native-migration`, rà chuỗi và đồng bộ tài liệu theo các rule triển khai. Tra cứu `inline validation disabled reason` của UI UX Pro Max cho mẫu Inline Validation; bản SwiftUI đặt lỗi sát ô tên và ngưỡng trên.

## R3 — Thuật ngữ quạt và trợ năng trên macOS

### Chuỗi đã đổi

44 khoá trên ba ngôn ngữ. Dấu “—” chỉ hai khoá trợ năng mới. `thermal_fan_profile_name_placeholder` đã là “Tên cấu hình” khi bắt đầu R3. `{profile}` trong `fansProfile` chứa tên cấu hình do ứng dụng điền. `thermalPlatformHint` nói về trình đọc SMC.

| Khoá | Bản đổi | VI cũ | VI mới |
| --- | --- | --- | --- |
| `fanModeHint` | VI, EN, JA | Để macOS tự quản lý quạt, hoặc thiết lập hồ sơ sau khi xác nhận phần cứng và quyền trợ giúp. | Để macOS tự quản lý quạt, hoặc chọn cấu hình và quy tắc sau khi bật dịch vụ quạt. |
| `fanManualSelection` | VI, JA | Chọn {rpm} RPM | Đang chọn {rpm} RPM |
| `setUpHelper` | VI, EN, JA | Thiết lập helper | Thiết lập dịch vụ quạt |
| `unregisterHelper` | VI | Gỡ helper quạt | Gỡ dịch vụ quạt |
| `fanHidCeilingNote` | VI, EN, JA | Helper chỉ kiểm tra trần nhiệt trên cảm biến SMC; cảm biến này không tự trả quạt về tự động khi quá nhiệt. | Dịch vụ quạt chỉ kiểm tra giới hạn nhiệt độ trên cảm biến SMC. Nếu cảm biến này quá nóng, quạt sẽ không tự trở về chế độ tự động. |
| `fanCalibrationHint` | VI, EN, JA | Hiệu chuẩn chạy từng quạt ở tốc độ tối đa giữa hai giai đoạn tự động, mất vài phút. Dừng, cảm biến quá hạn hoặc helper trả tự động sẽ hủy điều khiển. | Khi hiệu chuẩn, từng quạt chạy ở tốc độ tối đa giữa hai giai đoạn tự động. Quá trình này mất vài phút. Việc điều khiển sẽ bị huỷ nếu bạn dừng hiệu chuẩn, số đo cảm biến quá hạn hoặc dịch vụ quạt trả quạt về tự động. |
| `fanHelperDescription` | VI, JA | Điều khiển thủ công cần fan helper native đã ký và được hệ thống cho phép. Helper trả quạt về tự động khi mất kết nối, hết hạn hoặc quá nhiệt. | Điều khiển thủ công cần dịch vụ quạt dành riêng cho macOS, có chữ ký và được hệ thống cho phép. Dịch vụ quạt trả quạt về tự động khi mất kết nối, hết thời gian chờ hoặc quá nhiệt. |
| `registerHelper` | VI | Đăng ký fan helper | Đăng ký dịch vụ quạt |
| `helperRegisterError` | VI | Không đăng ký được helper quạt. | Không đăng ký được dịch vụ quạt. |
| `helperUnregisterError` | VI | Không gỡ được helper quạt. | Không gỡ được dịch vụ quạt. |
| `helperEnabled` | VI, EN, JA | Helper đã bật | Dịch vụ quạt đã bật |
| `helperUnavailable` | VI, EN, JA | Helper chưa sẵn sàng | Dịch vụ quạt chưa sẵn sàng |
| `thermalPlatformHint` | VI, EN, JA | Linux đọc cảm biến hwmon hiện có, không thay điều khiển quạt. Windows cần backend cảm biến được hỗ trợ; app macOS dùng SMC helper. | Linux đọc cảm biến hwmon hiện có và giữ nguyên chế độ điều khiển quạt. Windows cần bộ đọc cảm biến tương thích. Ứng dụng macOS dùng trình đọc cảm biến SMC. |
| `thermal_fan_target` | JA | Mục tiêu {rpm} RPM | Mục tiêu {rpm} RPM |
| `thermal_fan_control_desc` | VI, EN, JA | Giữ từng quạt ở tốc độ cố định qua helper đặc quyền của Viezan. Chế độ tự động tự quay lại khi app thoát, helper mất kết nối, máy ngủ hoặc dậy, hay một cảm biến quá nóng. | Dịch vụ quạt của Viezan dùng quyền quản trị để giữ từng quạt ở tốc độ cố định. Quạt tự trở về chế độ tự động khi ứng dụng thoát, dịch vụ quạt mất kết nối, máy ngủ hoặc thức dậy, hay một cảm biến quá nóng. |
| `thermal_fan_helper_missing` | VI | Không tìm thấy tệp viezan-fan-helper bên cạnh ứng dụng. Với bản mã nguồn, hãy chạy npm run build:native. | Không tìm thấy tệp thực thi của dịch vụ quạt bên cạnh ứng dụng. Với bản mã nguồn, hãy chạy npm run build:native. |
| `thermal_fan_helper_idle_desc` | VI, EN, JA | Bật sẽ hỏi mật khẩu quản trị và khởi chạy helper chỉ cho phiên này. | Khi bật, bạn sẽ được hỏi mật khẩu quản trị để khởi chạy dịch vụ quạt cho riêng phiên này. |
| `thermal_fan_helper_starting` | VI, EN, JA | Đang khởi chạy helper… | Đang khởi chạy dịch vụ quạt… |
| `thermal_fan_helper_ready` | VI, EN, JA | Helper đã kết nối (v{version}) | Dịch vụ quạt đã kết nối (v{version}) |
| `thermal_fan_helper_error_title` | VI, EN, JA | Không khởi chạy được helper | Không khởi chạy được dịch vụ quạt |
| `thermal_fan_helper_missing_short` | VI, EN, JA | Thiếu helper | Thiếu dịch vụ quạt |
| `thermal_fan_profiles_title` | VI | Profile | Cấu hình |
| `thermal_fan_profiles_need_helper` | VI | Bật điều khiển quạt để áp dụng profile. | Bật điều khiển quạt để áp dụng cấu hình. |
| `thermal_fan_profile_save` | VI | Lưu profile | Lưu cấu hình |
| `thermal_fan_profile_delete` | VI | Xoá profile {name} | Xoá cấu hình {name} |
| `thermal_fan_profile_error` | VI | Không áp dụng được profile. | Không áp dụng được cấu hình. |
| `thermal_fan_profile_builtin_cool_desc` | JA | Quạt tăng dần từ 45°C và tối đa ở 75°C theo CPU. | Quạt tăng dần từ 45°C và tối đa ở 75°C theo CPU. |
| `thermal_fan_profile_builtin_gaming_desc` | JA | Quạt theo GPU: tăng từ 50°C, tối đa ở 80°C. | Quạt theo GPU: tăng từ 50°C, tối đa ở 80°C. |
| `thermal_fan_profile_builtin_local_ai_desc` | JA | Làm mát mạnh cho các phiên chạy model dài: tăng từ 45°C, tối đa ở 70°C theo CPU. | Làm mát mạnh cho các phiên chạy model dài: tăng từ 45°C, tối đa ở 70°C theo CPU. |
| `thermal_fan_restored_reason` | VI, EN, JA | Helper đã trả quạt về tự động ({reason}). | Dịch vụ quạt đã trả quạt về tự động ({reason}). |
| `thermal_fan_disclaimer_intro_daemon` | VI, EN, JA | Viezan sẽ cài một helper nhỏ chạy nền với quyền quản trị. Hệ thống chỉ hỏi mật khẩu lần này; sau đó mỗi lần mở, kể cả sau khi cập nhật, Viezan tự kết nối lại. | Viezan sẽ cài một dịch vụ quạt nhỏ chạy nền với quyền quản trị. Hệ thống chỉ hỏi mật khẩu lần này. Sau đó, Viezan tự kết nối lại mỗi lần mở, kể cả sau khi cập nhật. |
| `thermal_fan_helper_section` | VI, EN, JA | Helper chạy nền | Dịch vụ quạt chạy nền |
| `thermal_fan_helper_installed_desc` | VI, JA | Đã cài. Viezan dùng helper này mà không hỏi lại mật khẩu và đặt lại cài đặt quạt sau khi mở lại app hoặc máy dậy. | Đã cài dịch vụ quạt. Viezan dùng dịch vụ này mà không hỏi lại mật khẩu và áp dụng lại cài đặt quạt khi ứng dụng mở lại hoặc máy thức dậy. |
| `thermal_fan_helper_not_installed_desc` | VI, JA | Chưa cài. Lần đầu bật điều khiển quạt sẽ cài helper (hỏi mật khẩu một lần). | Chưa cài dịch vụ quạt. Lần đầu bật điều khiển quạt, bạn sẽ được hỏi mật khẩu một lần để cài dịch vụ. |
| `thermal_fan_helper_outdated_title` | VI, EN, JA | Có bản helper mới | Dịch vụ quạt có bản mới |
| `thermal_fan_helper_outdated_desc` | VI, EN, JA | Bản Viezan này đi kèm helper mới. Cập nhật để dùng nó; macOS sẽ hỏi mật khẩu một lần. | Bản Viezan này đi kèm phiên bản mới của dịch vụ quạt. Khi bạn cập nhật dịch vụ, macOS sẽ hỏi mật khẩu một lần. |
| `thermal_fan_helper_update` | VI, EN, JA | Cập nhật helper | Cập nhật dịch vụ quạt |
| `thermal_fan_helper_uninstall` | VI, EN, JA | Gỡ helper | Gỡ dịch vụ quạt |
| `thermal_fan_helper_approval_title` | VI, EN, JA | Cần cho phép helper chạy nền | Cần cho phép dịch vụ quạt chạy nền |
| `thermal_fan_reason_start` | VI, EN, JA | helper vừa khởi động | dịch vụ quạt vừa khởi động |
| `thermal_fan_disclaimer_intro` | VI, EN, JA | Viezan sẽ chạy một helper nhỏ với quyền quản trị cho phiên này. Hệ thống sẽ hỏi mật khẩu. | Viezan sẽ chạy một dịch vụ quạt nhỏ với quyền quản trị cho phiên này. Hệ thống sẽ hỏi mật khẩu. |
| `name` | VI | Tên profile | Tên cấu hình |
| `fanCurrentSpeed` | VI, EN, JA | — | Hiện tại {rpm} RPM |
| `fanSliderLabel` | VI, EN, JA | — | Tốc độ mục tiêu · {fan} |

### Trợ năng

- **Đã có ở R2.** Hai nút mở popover cung cấp chế độ qua `accessibilityValue`. Nút Xoá dùng tên cấu hình. Mỗi hàng đặt Áp dụng trước Xoá. Thanh trượt đã có tên quạt và biết số đang chọn hoặc mục tiêu. Khi dịch vụ chưa bật hoặc đầu đọc dừng, trang giữ nút thiết lập, mở Cài đặt hệ thống hoặc thử lại.
- **Đã làm.** Nhãn thanh trượt có chỗ trống `{fan}`, cả ba trạng thái RPM có lời đọc riêng. Khi mở Quy tắc, focus vào nguồn, Tab qua ngưỡng thấp, cao và Lưu thành cấu hình. Ô tên nhận focus khi mở, sau đó tới Lưu, Huỷ, Áp dụng. Escape thu ô tên trước rồi mới đóng popover. Enter/Escape kiểm tra marked text của field editor AppKit. Khi đóng, nút mở chỉ nhận lại focus nếu được kích hoạt bằng bàn phím hoặc trợ năng.
- **Sự kiện.** Áp dụng chờ đúng cấu hình hoặc RPM. Về tự động chỉ báo sau phản hồi `restored: true` của lệnh còn sở hữu phiên. Lỗi thao tác dùng toast lỗi cùng khoá `thermal-fan`, màu lỗi nằm ở biểu tượng và viền. Việc đọc số đo mỗi hai giây không gọi toast.
- **Giới hạn.** `ToastCenter.show` tự phát một thông báo. Thành công dùng ưu tiên mặc định, lỗi dùng `.high`. Đặt riêng mức `.medium` cho lỗi cần thay đổi `NativeToasts.swift` ngoài phạm vi R3. Gửi thêm `NSAccessibility.post` sẽ đọc hai lần. Nếu hai thao tác liên tiếp để lại cùng mã lỗi, `onChange(of: monitor.error)` cũng không phân biệt được hai lần thất bại.

### Kiểm tra

- **Nguồn.** Đã đối chiếu R2, quy tắc toast/bản địa hoá và hướng dẫn focus SwiftUI của `viezan-native-ux` trong workflow `native-migration`. `npm run resources`, `npm run check:resources` và `npm run check:docs` đạt. Hai bundle giống nhau từng byte. Đã đối chiếu 44 hàng trong bảng với cả ba locale, kể cả chỗ trống nội suy. Kết quả tìm trên phần chữ hiển thị của giá trị VI như sau.

```sh
jq '[to_entries[] | select(.key | test("^(fan|thermal|helper|registerHelper$|unregisterHelper$|setUpHelper$|name$)"; "i")) | select(.value | gsub("\\{[^}]+\\}"; "") | test("helper|profile|hồ sơ"; "i"))] | {so_khoa_con_thuat_ngu_cu: length, khoa: map(.key)}' resources/locales/vi.json
```

```json
{"so_khoa_con_thuat_ngu_cu": 0, "khoa": []}
```

- **Test.** 26/26 đạt trong bốn suite với bộ lọc `FanControl|ThermalSensorDisplayTests`. Bốn test R3 kiểm marked text AppKit và hai tầng Escape, nguồn kích hoạt nút, ba giá trị RPM trong VI/EN/JA và phản hồi khôi phục thành công, cũ, lỗi hoặc sai định dạng. Lượt đầu với cache tạm dừng ở `ApplicationsShortcutsTests.swift` của phiên khác với lỗi `was modified during the build`. Lượt kế tiếp đạt.
- **Build.** `swift build --package-path apps/macos` và `swift test` mặc định bị chặn ghi Clang module cache. Build Debug và test đã đạt khi dùng cache tạm, `--build-system native --disable-sandbox --scratch-path` của SwiftPM.
- **Chưa kiểm.** Theo phạm vi story, chưa chạy ứng dụng. Cần nghiệm thu thứ tự Tab và Shift-Tab, focus sau khi đóng bằng chuột/bàn phím/VoiceOver, IME VI/JA, mức đọc thực tế, bố cục 820/1200 pt sáng/tối và phản hồi từ dịch vụ quạt trên máy thật.

## R4 — Xác nhận và trạng thái điều khiển quạt trên macOS

1. **Thanh menu.** Đọc lại trạng thái dịch vụ khi bấm. Chỉ áp dụng trực tiếp nếu phiên đã xác nhận, dịch vụ đã bật, đang giám sát và quạt không hiệu chuẩn. Nếu thiếu điều kiện, mở trang **Nhiệt độ & quạt** bằng đường điều hướng sẵn có. Người dùng chọn lại cấu hình trên trang.
2. **Rời trang.** Chỉ dừng bộ đọc do trang khởi động khi đang tự động. Cấu hình, quy tắc tuỳ chỉnh, tốc độ giữ tay, lệnh chờ và hiệu chuẩn đều giữ giám sát.
3. **Trạng thái.** Thẻ và popover dùng cùng trạng thái hiệu chuẩn hoặc chờ dịch vụ. Tên cấu hình xuất hiện trên huy hiệu sau xác nhận. **Về tự động** có ngay từ lúc gửi lệnh. Monitor chỉ bổ sung cờ chờ phản hồi cho lệnh thủ công.
4. **Thủ công.** Đổi chế độ hoặc nhả mục tiêu xoá bản nháp của quạt. Kéo về tốc độ đang giữ hiện **Mục tiêu**. Khi hiệu chuẩn hoặc dừng giám sát, thanh trượt và nút **Áp dụng** cùng tắt với một lý do chung.
5. **Quy tắc.** Dự kiến dùng số theo ngôn ngữ giao diện. Nút **Áp dụng** và lần xác nhận cuối kiểm tra cùng dữ liệu xem trước. Thiếu nguồn có lý do riêng vì câu cũ nói quạt giữ mục tiêu trước. Lỗi ghi cấu hình hiện dưới ô tên. Mỗi lần lưu thành công phát một toast `fileSaved` kèm tên, kể cả khi quy tắc đang chạy khác bản nháp.
6. **Cột hẹp.** `ViewThatFits` đặt nút lưu dưới tóm tắt khi thiếu chỗ. Nút **Áp dụng** từng quạt dùng `.fixedSize()`.

| Khoá mới | VI | EN | JA |
| --- | --- | --- | --- |
| `fanApplying` | Đang áp dụng… | Applying… | 適用しています… |
| `fanCalibrating` | Đang hiệu chuẩn quạt | Calibrating fans | ファンを較正中 |
| `fanRuleSensorMissing` | Nguồn nhiệt đã chọn không có trong lần đọc hiện tại. | The selected temperature source is missing from the current reading. | 今回の測定では、選択した温度センサーの値を取得できませんでした。 |

### Kiểm tra

- **Nguồn.** Đối chiếu điểm gọi trong thanh menu, trang và monitor theo workflow `native-migration`, `sync-docs` và quy tắc UI/UX. Áp dụng mục *Inline Validation* của UI UX Pro Max trong `viezan-native-ux` cho lỗi dưới ô tên. `npm run resources`, `npm run check:resources` và `npm run check:docs` đạt. Hai bundle giống nhau từng byte. Mỗi locale thêm đúng ba khoá.
- **Test.** Bộ lọc `([Tt]hermal|[Ff]an)` đạt 44/44, gồm 8 ca mới trong `FanControlReviewTests`. Để tái hiện, chạy cùng 8 ca trong bản sao tạm trước R4 với các biểu thức quyết định cũ tách khỏi closure SwiftUI. Cả 8 đều thất bại ở tổng cộng 32 phép kiểm, bao gồm rời trang khi giữ quạt, nhãn và huỷ khi chờ, bản nháp sau khi nhả hoặc đổi quy tắc, xem trước mất nguồn và phản hồi ngay tại lần lưu.
- **Build.** Build Debug đạt. Lệnh SwiftPM mặc định bị chặn ghi cache Clang. Lượt dùng cache tạm đầu tiên gặp `Applications.swift: was modified during the build` từ phiên khác. Thử lại sau một phút thành công với `--build-system native --disable-sandbox --scratch-path` và cache module tạm.
- **Chưa kiểm.** Theo phạm vi R4, chưa chạy app hoặc điều khiển quạt thật. Còn phải quan sát cửa sổ mở từ thanh menu, phản hồi dịch vụ, bố cục cột khoảng 400 pt với tiếng Nhật, sáng/tối và thứ tự đọc của VoiceOver.
