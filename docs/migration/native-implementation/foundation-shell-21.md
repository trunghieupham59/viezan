# Foundation shell 21 — cấu trúc Electron trong Swift

2026-10-27. Migrate khung giao diện theo ảnh Electron người dùng cung cấp.
Chưa nội dung Trang chủ, chưa tuyên bố hoàn tất toàn bộ native migration.

## Thay đổi

- Titlebar riêng 40pt, toggle sau vùng traffic lights 80pt. Header 56pt chỉ thuộc
  workspace bên phải; sidebar bắt đầu ngay dưới titlebar.
- Logo chính thức đóng gói trong domain resource bundle, tên Viezan, tìm kiếm
  capsule và shortcut ⌘K. Sidebar 236/rail 60, compact dưới 900 vẫn giữ preference.
- Đủ vị trí Trang chủ, AI, Ngôn ngữ, Hệ thống, Tiện ích; danh sách cuộn độc lập.
  Settings và footer Phím tắt toàn cục/Tiện ích Chrome cố định ở đáy.
- Các module ngoài Chat/Dịch/Settings disabled thật và có tooltip chưa triển khai.
  Footer dùng dấu chưa khả dụng, không bịa số lượng hay báo sẵn sàng.
- Palette chrome sinh trực tiếp từ preset Glass của tokens.css cho light/dark;
  native dùng nền tint đục, không mô phỏng blur. Vùng đọc vẫn đục.
- Điều chỉnh chiều cao/neo panel theo titlebar và header tách biệt; command panel
  tận dụng chiều cao để không mất lệnh ở 640×480. Không sửa draft/session đang có.

## Bằng chứng và giới hạn

- Swift build + 39 tests PASS (22 native, 17 domain). Matrix 276 layout + 48 failure
  renders; EN/VI/JA, light/dark, 640/820/1200/1440. Đã xem trực tiếp ảnh VI 640/1200.
- Chạy app đã package trên macOS; kiểm titlebar, header, sidebar và footer ở
  ~1017×593pt. Cuộn xuống xác nhận nhóm Hệ thống/Tiện ích còn truy cập được,
  footer không cuộn theo. Giữ nguyên bản nháp và hội thoại QA trước đó.
- Ảnh thật: [đầu sidebar](evidence/foundation-shell-21/macos-1017-top.jpg),
  [cuộn cuối](evidence/foundation-shell-21/macos-1017-scrolled.jpg).
  Badge chia sẻ màn hình của macOS che traffic lights trong ảnh capture;
  không coi ảnh này là bằng chứng màu/vị trí ba nút đã khớp tuyệt đối.
- Fixtures: [640](evidence/foundation-shell-21/swift-vi-light-640-chat.png),
  [1200](evidence/foundation-shell-21/swift-vi-light-1200-chat.png).
  Fixtures không chụp system traffic lights; màu divider trong test host có thể
  khác cửa sổ thật. Không đồng nhất fixture với manual acceptance.
- Chưa chạy lại VoiceOver/IME, chưa kiểm cửa sổ thật đúng 640/820pt trong đợt này.
  Không build Electron/Qt/Windows/Linux: thay đổi giao diện chỉ áp dụng Swift.

## Kiểm tra thủ công còn lại

1. Mở `apps/macos/.build/Viezan Native Preview.app`, xem khi không có badge chia sẻ
   màn hình: traffic lights và toggle cùng nằm trong titlebar, không chồng nhau.
2. Kéo cửa sổ về nhỏ nhất 640×480 và khoảng 820pt. Bấm toggle mở sidebar overlay,
   cuộn đến Tiện ích: footer/Settings vẫn ở đáy. Escape đóng overlay; mở rộng trên
   900pt khôi phục trạng thái sidebar trước đó.
3. Dùng ⌘K, ⌘⇧H, ⌘⇧A ở cửa sổ hẹp: panel nằm trong cửa sổ, đóng trả focus về opener.
4. Với VoiceOver, kiểm các module tương lai đọc là disabled; với VI/JA IME,
   Return khi đang composition chỉ xác nhận chữ. Khôi phục cài đặt sau kiểm thử.

Visual acceptance vẫn chờ người dùng. Batch 20 là bước controls/hành vi;
không phải bằng chứng toàn bộ shell đã giống Electron trước đợt này.
