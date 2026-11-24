# Model đã ghim, Ollama, quy tắc quạt và bàn phím

Checkout chính trên `develop`, thay đổi cục bộ ngày 24–25/11/2026.

| Story | Tệp chính và kết quả |
| --- | --- |
| Khôi phục model đã ghim | `NativeBackup.swift`, `WorkbenchStore.swift` và `NativeBackup.cpp` lưu cả danh sách rỗng. Chỉ nhập ghim khi chọn khôi phục cài đặt. Bản cũ thiếu trường ghim giữ thứ tự trên máy đích. Test xuất/nhập trên từng nền tảng đã bắt lỗi rồi đạt. |
| Panel model macOS | `ComposerPanels.swift`, `ModelPanel.swift` và `WorkbenchStore.swift` đặt ghim trước dấu chọn, hiển thị ⌘P cùng số ghim trên tám, giữ con trỏ hợp lệ sau khi bỏ ghim và bảo vệ kho bị chặn. Fixture dùng đúng danh sách đã lọc, gồm model có hai vị trí. |
| Tiến độ Ollama macOS | `PullStepTests.swift` tái hiện số byte bị đặt lại ở lớp thứ hai và mất ở bước xác minh. `LocalModelManager.swift` cộng phần tăng của từng digest trong một lượt tải. `LocalModelSettings.swift` hiển thị trạng thái đã dịch cùng thanh tiến độ bên dưới hàng tải và giữ đúng model sau khi quay lại trang. Mẫu hai lớp, bản tin lặp và bản tin đến muộn đạt 110/150 byte ở bước xác minh. Tổng dung lượng còn tăng khi runtime báo thêm lớp. [Giao thức Pull](https://docs.ollama.com/api/pull) |
| Dung lượng khi khám phá | `ModelCatalog.swift`, `ProviderDiscovery.swift` và `WorkbenchStore.swift` mang tên và số byte từ cùng phản hồi Ollama sang Cài đặt. Fixture kiểm lần khám phá đầu, đổi dung lượng khi tên giữ nguyên và xoá model khỏi danh mục. |
| Nhãn hiệu năng | `LocalModelSettings.swift`, `LocalModelSettings.qml` cùng các chuỗi EN/VI/JA dùng GPU và CPU + GPU. Tiếng Việt hiển thị “Chưa đo”. QtTest tái hiện mã thô “gpu” ở hàng model đã cài. |
| Quy tắc nhiệt | `FanProfiles.swift` dùng bộ phân nhóm SMC của `ThermalMonitor.swift`. Fixture trước sửa trả về 77 °C cho CPU 40 °C do lấy cả cảm biến Tf. Các hàng bằng nhiệt và các thành viên hàng có thứ tự ổn định. Giới hạn an toàn trong helper và quy tắc chọn HID theo khoá riêng vẫn áp dụng. |
| Tự kiểm fan helper | `native/fanhelper/tests/main.swift` gửi lệnh từ fd khác sau khi đổi người dùng console, đối chiếu ID/quạt/chế độ/RPM trong kết quả và dùng giờ đơn điệu đo thời điểm callback thoát sau ít nhất 0,2 giây. Cả 33 ca chạy bằng FakeSMC. |
| Lỗi quạt lặp | `ThermalMonitor.swift`, `ThermalWorkspace.swift` và `NativeToasts.swift` phân biệt hai lần thao tác lỗi cùng mã. Thử lại thay toast cũ và yêu cầu một lần đọc ưu tiên trung bình. Ca lưu cấu hình vào đường dẫn bị chặn dùng fixture. |
| Hướng dẫn bàn phím Qt | `ShortcutRecorder.qml` dùng chuỗi chờ lưu riêng. Chuỗi `captureRegionHint` hướng dẫn mũi tên, Shift + mũi tên, phím cách, Enter và Esc đúng với `RegionCapture.qml`. |

## Các quyết định đã đối chiếu với mã

- `ApplicationsWorkspace.swift` đếm riêng dữ liệu cá nhân được chọn và mở trang Full Disk Access. `Applications.swift` kiểm lại đích liên kết hỏng và đường dẫn trong gốc cài đặt. Các ca sở hữu, đường dẫn thay trong lúc thao tác và hoàn tác đã có fixture. Luồng gói do root sở hữu và hộp xác thực Finder vẫn cần kiểm trên máy thật.
- `PinnedNotes.swift` giới hạn năm thẻ. `PinnedNotePanels.swift` hít mép khi thả, đặt `sharingType = .none` và giữ thẻ vừa xoá để khôi phục từ thanh menu. Độ che phủ khi chia sẻ màn hình phụ thuộc ứng dụng chụp và phiên bản macOS, còn chờ kiểm trực tiếp.
- Shell macOS và Qt đặt toast dưới header, ở góc trên phải. Trạng thái kéo dài ở trong trang. Hàng cập nhật và cơ chế mở bộ cài dự phòng được ghi trong báo cáo 84. Kiểm tra cập nhật và thông báo với bộ đọc màn hình thật còn mở.
- Spec Launcher và `qt-parity-14` đều ghi Ngăn máy ngủ và Tắt tiếng là lệnh riêng macOS. Bốn test IOKit/CoreAudio không thuộc hợp đồng Qt hiện hành.

Kết quả chạy toàn bộ lệnh kiểm tra, kể cả các test Swift cần chạy lại ngoài sandbox, nằm trong [báo cáo 87](native-code-87.md).
