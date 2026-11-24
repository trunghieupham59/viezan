# Từ điển, Launcher, Lịch sử và các màn hình Qt

Các thay đổi cục bộ trên `develop` tiếp theo [báo cáo 85](native-code-85.md).

| Story | Tệp chính và hành vi |
| --- | --- |
| Từ điển macOS | `Workspaces.swift`, `HomeWorkspace.swift`, `ViezanApp.swift`. Lệnh ⌘⇧C chỉ tác động đến phiên Từ điển ở cửa sổ có focus. Thu gọn giữ ngữ cảnh. Xoá trả focus về ô từ. Mục không tìm thấy có hai hành động Dịch và Chat. Chỉ hiện đã lưu sau khi lưu thành công. Fixture kiểm trạng thái và marked text. |
| Launcher | `DesktopIntegration.swift` và `Launcher.swift` phân biệt thư mục đọc lỗi với danh mục rỗng để hiện Thử lại. `Launcher.qml` và ba locale cung cấp tên của cả 30 tiền tệ, phân biệt ngày sửa trong tương lai. QtTest kiểm đổi locale và focus sau Esc. |
| Lịch sử | `HistoryViews.swift`, `Main.qml` và EN/VI/JA chỉ gợi ý bỏ lọc Lưu trữ khi bộ lọc đang bật. Test đối chiếu từng trạng thái. |
| Gỡ, đặt lại, xử lý liên kết gãy và Hoàn tác | `Applications.swift`, `ApplicationsOwnershipTests.swift` và `WorkbenchTests.swift`. Thử với executable giả trong thư mục tạm, chỉ chấp nhận các đường dẫn fixture, đối chiếu device/inode và lưu receipt. Cả ba thao tác kiểm kết quả trên đĩa và khôi phục nội dung hoặc đích liên kết. S7 tính `canTrash` khi quét và kiểm lại điều kiện khi thao tác. |
| Cài đặt Qt | `SettingsWorkspace.qml`, `Kit.qml`, `ProviderSettings.qml`, `ModuleSettings.qml`, `LocalModelSettings.qml`, `DataSettings.qml` và `UpdateSheet.qml`. Sửa kích thước rãnh chọn, xem trước hội thoại, popup tìm kiếm, tiêu đề/vạch ngăn thẻ, công tắc khôi phục, trường nhập và thẻ kết quả đo. Nút chính có viền, nhấn chữ và vẫn có vòng focus riêng. Test kích thước từng đỏ trước sửa. |
| Màn hệ thống Qt | `ApplicationsWorkspace.qml`, `ThermalWorkspace.qml`, `DesktopWorkspace.qml`, `DesktopSettings.qml`, `ShortcutRecorder.qml` và `Main.qml`. Dùng lens cho ứng dụng đang chọn, màu nguy hiểm cho lỗi, thanh nhiệt độ theo số đo và tên rõ ràng cho nút dừng. Dịch mọi nơi cho đổi cặp ngôn ngữ hoặc mở bộ chọn model của phiên hiện tại. |
| Launcher và cửa sổ phụ Qt | `AuxiliaryWindow.qml`, `Launcher.qml`, `DesktopPanels.qml`. Góc bo và phím tắt theo board. Quick AI hiển thị mỗi cặp hỏi/đáp trong một thẻ. Menu model trả focus về đúng nút khi đóng bằng Esc. |
| Giao diện bản sao lưu cũ | Hai `NativeBackup` so sánh metadata trước và sau nâng cấp. Màn Dữ liệu giải thích việc chuyển sang Glass khi chọn nhập cài đặt. Fixture thử các giao diện đã biết, cả thiếu trường, ba chế độ màu và dữ liệu không hợp lệ. |
| Dung lượng và tên trợ năng | `LocalModelSettings.swift` dùng locale ứng dụng để định dạng dung lượng. Fixture tái hiện tiếng Anh vẫn dùng dấu phẩy thập phân trước sửa. Nút và panel công cụ chat trên macOS và Qt dùng chuỗi `composerTools` có sẵn. |
| Tài nguyên Qt | Loại hai chuỗi xác nhận cũ không còn nơi gọi. `LocalProvider.cpp` và `Research.cpp` kiểm kết quả mở bộ đệm trước khi gửi yêu cầu. |

Antigravity và Codex thống nhất giữ đích chính đã cấu hình khi Qt thiếu dấu hiệu nhận diện tiếng Latin, giữ Enter để soạn nhiều dòng trong cửa sổ phụ và Dịch, và xử lý riêng trường hợp bản dịch giống vùng chọn trên Windows. Chip thói quen trên Trang chủ Qt thuộc yêu cầu ban đầu của qt-parity-1. Spec Trang chủ và Chat ghi phạm vi mỗi nền tảng.

`WindowsSelection.cpp` giữ nguyên bước xác thực tiến trình, trạng thái trường nhập và endpoints trong UI Automation. Phần xử lý văn bản dùng fixture cùng đường thực thi để thử ký tự ngoài BMP, biên giữa hai surrogate, setter trả thành công nhưng không sửa, Hoàn tác khi tài liệu đã thay đổi, và bản dịch giống hệt. Ca giống hệt trả thông báo trung tính và không gọi setter. So sánh nguyên văn từng đơn vị UTF-16. QtTest đã đỏ trước khi sửa. Lần build thật của nhánh Windows và thao tác COM trên Windows còn chờ.

`Kit.StatusBadge` dùng tỉ lệ chữ `smallScale` và độ đậm `Font.Medium` theo audit. Đã cập nhật tài liệu bàn giao Windows về cửa sổ phụ, giới hạn Dịch và phạm vi CI. Kết quả kiểm nguồn, build, test và các hạng mục cần chạy thật nằm trong [báo cáo 87](native-code-87.md).
