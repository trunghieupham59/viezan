# Dịch mọi nơi

Người dùng chọn văn bản trong ứng dụng đang làm việc và nhấn phím tắt Dịch nhanh. Trang này tập hợp thiết lập phím tắt, cặp ngôn ngữ và thông tin về quyền truy cập vùng chọn. Bản thiết kế trình duyệt cũ trong thư mục boards là tư liệu lịch sử.

## Luồng chính

- Trên macOS, đọc vùng chọn qua Trợ năng. Nếu cần sao chép để lấy văn bản, khôi phục clipboard sau khi đọc. Hiện trạng thái lấy văn bản, đang dịch hoặc lỗi gần con trỏ.
- Với vùng có thể chỉnh sửa, cho phép thay văn bản. Khi chỉ có thể đọc, hiển thị kết quả cùng thao tác sao chép hoặc mở trong Dịch.
- Trên macOS, chỉ báo thay thế thành công sau khi đọc lại đúng nội dung kết quả. Dùng lệnh dán của ứng dụng khi ứng dụng, nội dung và vùng chọn gốc vẫn khớp; không ghi bằng setter vùng chọn Trợ năng. Bản dịch giống nguyên văn không được báo là đã thay thế. Văn bản web chỉ đọc hoặc control không cho xác minh giá trị hiển thị thẻ kết quả để sao chép thủ công.
- Trên Windows, chỉ thay vùng chọn khi control hỗ trợ UI Automation phù hợp và nội dung còn khớp với dữ liệu lúc bắt đầu. Hoàn tác kiểm tra lại giá trị hiện tại.
- Trên Linux, khả năng đăng ký phím tắt và đọc vùng chọn phụ thuộc phiên desktop. Người dùng có thể sao chép rồi dán vào cửa sổ dịch.

Cửa sổ thông báo nổi trên macOS có nền ngoài trong suốt; lớp hosting và thẻ nội dung dùng cùng bán kính bo góc. Bóng cửa sổ phải theo đường bo, không có khung chữ nhật bao ngoài.

## Thiết lập và kiểm tra

Dịch nhanh có cặp ngôn ngữ chính/phụ riêng và dùng model đang chọn trong ứng dụng. Giữ các thao tác thiết lập truy cập được bằng bàn phím. Kiểm tra trường hợp chưa cấp quyền, vùng chọn trống, văn bản chỉ đọc, lỗi dịch và đổi ứng dụng khi yêu cầu đang chạy.

Phần giao diện được triển khai ở `apps/macos/Sources/ViezanNative/DesktopWorkspace.swift` và `apps/desktop-qt/qml/DesktopWorkspace.qml`.
