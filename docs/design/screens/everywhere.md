# Dịch mọi nơi

Người dùng chọn văn bản trong ứng dụng đang làm việc và nhấn phím tắt Dịch nhanh. Trang này tập hợp thiết lập phím tắt, cặp ngôn ngữ và thông tin về quyền truy cập vùng chọn. Bản thiết kế trình duyệt cũ trong thư mục boards là tư liệu lịch sử.

## Luồng chính

- Trên macOS, đọc vùng chọn qua Trợ năng. Nếu cần sao chép để lấy văn bản, khôi phục clipboard sau khi đọc. Hiện trạng thái lấy văn bản, đang dịch hoặc lỗi gần con trỏ.
- Với vùng có thể chỉnh sửa, cho phép thay văn bản. Khi chỉ có thể đọc, hiển thị kết quả cùng thao tác sao chép hoặc mở trong Dịch.
- Trên Windows, chỉ thay vùng chọn khi control hỗ trợ UI Automation phù hợp và nội dung còn khớp với dữ liệu lúc bắt đầu. Hoàn tác kiểm tra lại giá trị hiện tại.
- Trên Linux, khả năng đăng ký phím tắt và đọc vùng chọn phụ thuộc phiên desktop. Người dùng có thể sao chép rồi dán vào cửa sổ dịch.

## Thiết lập và kiểm tra

Dịch nhanh có cặp ngôn ngữ chính/phụ riêng và dùng model đang chọn trong ứng dụng. Giữ các thao tác thiết lập truy cập được bằng bàn phím. Kiểm tra trường hợp chưa cấp quyền, vùng chọn trống, văn bản chỉ đọc, lỗi dịch và đổi ứng dụng khi yêu cầu đang chạy.

Phần giao diện được triển khai ở `apps/macos/Sources/ViezanNative/DesktopWorkspace.swift` và `apps/desktop-qt/qml/DesktopWorkspace.qml`.
