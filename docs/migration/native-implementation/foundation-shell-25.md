# Foundation shell 25 — full-screen, focus và resize

2026-10-27. Tiếp tục native-migration/sync-docs; không triển khai nội dung Trang chủ.

## Thay đổi và đối chiếu

- Focus ring native của toggle 36pt trước đây gần chạm/cắt mép titlebar 40pt.
  Inset drawing mask bằng token tight; giữ nguyên hit target 36pt và native
  keyboard focus. Các toolbar controls khác không đổi.
- Mở rộng regression titled NSWindow: 640×480 → 640×600 → 640×480 → 820×480
  → 1200×760 → 640×480. Kiểm full frame/hosting height, tâm traffic lights
  so với toggle, không giao nhau, preference không bị ghi đè khi responsive.
- Đã nhìn ảnh 640×480: rail 60pt, titlebar/toggle, header và composer nằm trong
  cửa sổ. Đây là native window fixture, không phải thao tác resize cửa sổ đang dùng.

## Bằng chứng macOS

Đã chạy app package, vào full-screen bằng nút xanh native, thoát qua View →
Exit Full Screen. Sidebar/header/footer giữ bố cục, cửa sổ khôi phục kích thước
và bản nháp VI/JA không đổi. Control-Command-F đã thử nhưng không đổi trạng thái;
không coi shortcut này đã được xác minh.

- [Full-screen thật](evidence/foundation-shell-25/macos-fullscreen-before.jpg).
- [Sau thoát, trước sửa focus](evidence/foundation-shell-25/macos-exit-fullscreen.jpg).
- [Focus ring sau sửa và đóng gói lại](evidence/foundation-shell-25/macos-focus-final.jpg).
- [640×480](evidence/foundation-shell-25/titled-window-640-480.png),
  [640×600](evidence/foundation-shell-25/titled-window-640-600.png),
  [820×480](evidence/foundation-shell-25/titled-window-820-480.png),
  [1200×760](evidence/foundation-shell-25/titled-window-1200-760.png).

Ảnh full-screen được chụp trước thay đổi drawing mask; ảnh focus cuối từ package
mới. Badge chia sẻ màn hình che traffic lights trong cửa sổ thật; fixture dùng
standard buttons AppKit ở trạng thái không key (màu xám).

## Kiểm thử tập trung

- Swift: 40 tests hành vi PASS (23 native +17 domain), gồm regression mới.
  Hai render tests skipped; không chạy lại matrix 276 ảnh từ Shell 24 vì đợt
  này chỉ đổi drawing mask titlebar. Fixture resize vẫn render bốn kích thước.
- Atomic/Design và generated resource freshness PASS; package macOS build lại.
- README hiện có vẫn mô tả đúng foundation đang thử nghiệm; không đổi sản phẩm
  Electron hoặc refresh review record. Không chạy build Electron/Qt/TypeScript
  vì không sửa mã của các runtime đó.

## Phần chưa xác minh trực tiếp

Chưa tuyên bố foundation đạt visual acceptance/pixel-perfect Electron.
Các bước kiểm thủ công còn hữu ích:

1. Tắt chia sẻ màn hình, vào/thoát full-screen bằng nút xanh hoặc menu View.
   Quan sát ba traffic lights cùng hàng với toggle sau khi thoát; kéo titlebar
   để xác nhận vùng kéo hoạt động.
2. Kéo cửa sổ về nhỏ nhất, kéo riêng cạnh dưới lên/xuống; kiểm titlebar không
   nhảy hàng. Bấm toggle, cuộn navigation, Escape: overlay đóng và focus trở lại.
3. Nếu dùng nhiều màn hình/Spaces, chuyển full-screen giữa các Space, quay lại
   rồi thoát; kiểm vị trí cửa sổ và focus. Chưa có bằng chứng cho cấu hình này.
4. VoiceOver và nhập tổ hợp VI/JA vẫn cần kiểm riêng; không suy ra từ test layout.
