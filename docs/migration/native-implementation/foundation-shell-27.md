# Foundation shell 27 — dark mode và tiếng Nhật ở cửa sổ hẹp

2026-10-27. Native-migration/sync-docs; skills viezan-native-migration,
viezan-native-ux; rules native-migration/viezan-product-engineering.
Chưa nội dung Trang chủ; foundation vẫn IN PROGRESS.

## Đối chiếu và sửa

- Ảnh JA/dark ban đầu không thấy tràn titlebar hoặc panel 208pt; không đổi
  geometry đã đúng ở Shell 26. Native traffic lights/toggle vẫn thẳng hàng.
- Search Swift dùng Capsule, viền border thường và chuỗi ⌘K trần, lệch Electron
  `.sidebar-search-trigger`/`.sidebar-shortcut`. Đổi sang rounded rectangle,
  border-strong, badge có nền/viền riêng; bán kính lấy trực tiếp từ Glass preset
  trong tokens.css qua adapter (không lập bảng màu hoặc literal riêng).
- Thêm hover cho các hàng navigation có thể sử dụng; selected state vẫn ưu tiên,
  hàng disabled không có hover. Search đổi màu chữ khi hover như Electron.
  Badge phím ẩn khỏi accessibility để không đọc trùng tooltip shortcut.
- Không đổi session, draft, locale hay appearance đã lưu của người dùng:
  các tổ hợp kiểm dùng storage fixture riêng. Build/package preview đã cập nhật.

## Bằng chứng

- Ma trận tập trung: VI/JA × light/dark × 640/820 × rail/overlay = 16 ảnh.
  Đã xem trực tiếp JA/dark 640 overlay, JA/dark 820 rail và JA/light 640 overlay.
- [JA dark overlay 640](evidence/foundation-shell-27/navigation-overlay-ja-dark-640.png),
  [JA dark rail 820](evidence/foundation-shell-27/rail-ja-dark-820.png),
  [JA light overlay 640](evidence/foundation-shell-27/navigation-overlay-ja-light-640.png).
- Titled NSWindow fixture tiếng Nhật ở light/dark: resize 640×480 → 640×600 →
  640×480 → 820×480 → 1200×760 → 640×480. Kiểm native traffic lights không
  giao toggle, cùng tâm dưới 1pt, hosting size đúng, preference không đổi.
  Đã xem [titlebar JA dark 640×480](evidence/foundation-shell-27/titled-window-ja-dark-640-480.png).
  Nút hệ thống xám vì fixture không key; đây không phải live-user screenshot.
- Suite hành vi 41 tests PASS (24 native +17 domain; compact-navigation test có
  4 parameter cases). Sau đó mở rộng riêng titlebar test và chạy 2 cases PASS.
  Hai render tests toàn bộ matrix/storage skipped; không lặp lại 276 ảnh cũ.
- Atomic/Design, generated resources (30 metrics), check:docs và 13 docs tests,
  whitespace diff PASS. README cập nhật search/badge/hover cùng review record.
- Không chạy Electron/Qt build/TypeScript: không sửa runtime các lớp đó; generated
  resources thêm roles/metrics cho Swift. Không kiểm lại full-screen trong đợt này.

## Kiểm thủ công macOS

1. Thoát preview cũ và mở package mới. Trong Cài đặt chọn 日本語 và Dark, ghi nhớ
   lựa chọn trước đó để khôi phục sau kiểm. Thu cửa sổ xuống nhỏ nhất.
2. Bấm toggle cạnh traffic lights: panel sát trái, footer và 設定 ở đáy. 検索 và
   badge ⌘K không chồng. Cuộn danh sách: chỉ danh sách trang di chuyển.
3. Rê chuột qua AI翻訳 và 設定: có nền hover; qua ホーム/AI通訳 đang disabled:
   không có nền hover hoặc thực hiện điều hướng. Đây chưa được tự kiểm bằng
   pointer trong app thật ở đợt này.
4. Bấm 検索, nhập bằng Japanese IME, chọn ứng viên bằng mũi tên/Enter: không
   chạy lệnh khi còn composing. Escape đóng panel và focus về opener. Kiểm bằng
   VoiceOver tên nút mở/đóng sidebar và search. IME/VoiceOver chưa xác minh live.
5. Vào/thoát full-screen rồi resize: traffic lights/toggle vẫn cùng hàng. Tắt
   screen sharing khi quan sát để badge không che nút hệ thống. Khôi phục ngôn
   ngữ/màu trước kiểm. Không cần gửi chat hay thay bản nháp.

Ảnh fixture và test pass không đồng nghĩa visual acceptance toàn bộ Electron.
