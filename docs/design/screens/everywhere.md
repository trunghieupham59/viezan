# Dịch mọi nơi

## AI mặc định dùng chung (2026-11-25)

Dịch nhanh dùng AI mặc định của ứng dụng tại thời điểm gửi. Kết quả và tác vụ đang chạy giữ model đã dùng.

Trên Qt, lời hướng dẫn đọc màn hình của bộ chọn vùng nêu thao tác mũi tên để di chuyển, Shift + mũi tên để đổi kích thước, phím cách để chụp vùng, Enter để chụp màn hình và Esc để huỷ. Khi bộ ghi phím tắt đang chờ kết quả đăng ký, nó thông báo “Đang lưu phím tắt…”.


Người dùng chọn văn bản trong ứng dụng đang làm việc và nhấn phím tắt Dịch nhanh. Trang này tập hợp thiết lập phím tắt, cặp ngôn ngữ và thông tin về quyền truy cập vùng chọn. Bản thiết kế trình duyệt cũ trong thư mục boards là tư liệu lịch sử.

## Luồng chính

- Trên macOS, đọc vùng chọn qua Trợ năng. Nếu cần sao chép để lấy văn bản, khôi phục clipboard sau khi đọc. Hiện trạng thái lấy văn bản, đang dịch hoặc lỗi gần con trỏ.
- Với vùng có thể chỉnh sửa, cho phép thay văn bản. Khi chỉ có thể đọc, hiển thị kết quả cùng thao tác sao chép hoặc mở trong Dịch.
- Trên macOS, chọn **Dịch vùng màn hình** từ thanh menu hoặc nhấn ⌥⇧T sau khi bật phím tắt. Kéo chọn một vùng trên ảnh, video hoặc ứng dụng. Viezan nhận dạng chữ trên máy rồi dịch theo cặp ngôn ngữ Dịch nhanh. Thẻ nổi hiện nguyên văn trên bản dịch, với các thao tác Mở trong Dịch và Sao chép. Ảnh không được lưu lại. Windows/Linux chưa có luồng này.
- Trên macOS, thẻ kết quả của cả Dịch vùng chọn và Dịch vùng màn hình có nút **Ghim thành ghi chú** ngay trước **Sao chép** để giữ bản dịch trong một [thẻ nổi](pinned-notes.md).
- Trên macOS, chỉ báo thay thế thành công sau khi đọc lại đúng nội dung kết quả. Dùng lệnh dán của ứng dụng khi ứng dụng, nội dung và vùng chọn gốc vẫn khớp; không ghi bằng setter vùng chọn Trợ năng. Bản dịch giống nguyên văn không được báo là đã thay thế. Văn bản web chỉ đọc hoặc control không cho xác minh giá trị hiển thị thẻ kết quả để sao chép thủ công.
- Trên Windows, phím tắt hiện một thẻ nổi gần con trỏ và giữ focus ở ứng dụng đang dùng. Cả lần đầu và sau khi đóng thẻ, Viezan tự dịch rồi tự thay khi cửa sổ, ô nhập, nội dung và vùng chọn vẫn khớp. Thẻ báo đã thay và cho phép hoàn tác sau khi kiểm tra lại nội dung. Với vùng chỉ đọc hoặc khi không thể thay, thẻ giữ bản dịch để sao chép hoặc mở trong Dịch. Nút **Mở trong Dịch** mới đưa cửa sổ chính lên trước.
- Sau khi thông báo tự đóng, nhấn **Win+B**, chọn biểu tượng Viezan rồi mở menu bằng **Shift+F10**. Lệnh **Xem lại bản dịch vùng chọn** đưa focus vào thẻ gần nhất. Dùng Tab để đến Hoàn tác hoặc các thao tác của kết quả, và Esc để đóng thẻ.
- Trên Linux, khả năng đăng ký phím tắt và đọc vùng chọn phụ thuộc phiên desktop. Người dùng có thể sao chép rồi dán vào cửa sổ dịch.

Cửa sổ thông báo nổi trên macOS có nền ngoài trong suốt; lớp hosting và thẻ nội dung dùng cùng bán kính bo góc. Bóng cửa sổ phải theo đường bo, không có khung chữ nhật bao ngoài.

## Thiết lập và kiểm tra

Trên macOS, trang này là nơi thiết lập của Dịch nhanh: thẻ "Dịch nhanh" gom hai quyền, hai phím tắt (Dịch vùng chọn, Dịch vùng màn hình), cặp ngôn ngữ và model; dòng mô tả đầu trang nêu cả hai phím. Hai cách lấy chữ dùng chung một thẻ kết quả. Trang Launcher & phím tắt vẫn liệt kê hai phím tắt này để tra cứu và đổi nhanh, với dòng phụ "Thiết lập trong Dịch mọi nơi", và không hiện hàng quyền. Thẻ "Không có văn bản được chọn" có nút Dịch vùng màn hình để chuyển sang kéo chọn vùng, và tự đóng sau 5 giây.

Dịch nhanh có cặp ngôn ngữ chính/phụ riêng và dùng model đang chọn trong ứng dụng. Giữ các thao tác thiết lập truy cập được bằng bàn phím. Kiểm tra trường hợp chưa cấp quyền, vùng chọn trống, văn bản chỉ đọc, lỗi dịch và đổi ứng dụng khi yêu cầu đang chạy.

Trên macOS, hàng quyền Ghi màn hình nằm ngay dưới hàng quyền Trợ năng và cập nhật khi quay lại từ Cài đặt hệ thống. Dịch vùng màn hình chỉ cần quyền Ghi màn hình. Kiểm tra nút mở đúng mục quyền khi chưa cấp, nhấn Esc để hủy mà không hiện thẻ, chọn vùng không có chữ để thấy thông báo tự đóng, và kiểm tra thẻ báo lỗi khi dịch thất bại.

Phần giao diện được triển khai ở `apps/macos/Sources/ViezanNative/DesktopWorkspace.swift` và `apps/desktop-qt/qml/DesktopWorkspace.qml`.

Trên Qt, bộ chọn ngôn ngữ hỗ trợ bàn phím. Đổi mô hình mở bộ chọn ngay trên màn hình Dịch mọi nơi và cập nhật mặc định chung. Với văn bản Latin chưa có dấu hiệu ngôn ngữ đủ rõ, giữ nguồn tự động và dùng đích chính đã cấu hình. macOS dùng kết quả nhận diện của hệ điều hành khi có.

Trên Windows, chỉ sửa một vùng chọn UTF-16 hợp lệ còn khớp với tài liệu đã đọc. Nếu bản dịch giống hệt vùng chọn thì hiển thị thông báo trung tính. Chỉ cung cấp Hoàn tác sau khi đọc lại đúng toàn bộ nội dung mới. Nếu tài liệu đã đổi tiếp, giữ nguyên văn bản của người dùng.
