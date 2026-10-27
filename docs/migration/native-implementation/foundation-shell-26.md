# Foundation shell 26 — compact navigation neo theo rail

2026-10-27. Workflow native-migration/sync-docs; skills viezan-native-migration,
viezan-native-ux; rules native-migration/viezan-product-engineering.
Phạm vi Swift foundation, chưa nội dung Trang chủ.

## Lệch đã sửa

Đối chiếu shell spec và Electron PrimaryNavigationSidebar/CSS: Swift trước đây
mở navigation thành thẻ nổi 236pt, inset 16pt, thấp hơn vùng sidebar 32pt.
Electron dùng panel 208pt tại compact width, neo trên rail và cao toàn vùng
bên dưới titlebar. Swift nay dùng đúng geometry này, viền phải thẳng; bóng vẫn
phân tách nội dung nhưng bị giới hạn dưới titlebar. Toggle/system chrome vẫn
ở phía trên panel. Footer/Settings ghim đáy, danh sách trang cuộn độc lập.

Đưa giá trị compact 208px hiện có của Electron về token canonical
`--vzn-sidebar-compact-expanded-width`; CSS Electron tham chiếu token thay vì
literal, adapter native sinh `compactSidebar`. Không thay đổi kích thước Electron.
Không thay persisted collapse preference, nội dung session hoặc bản nháp.

## Bằng chứng và kiểm thử

- Đã xem ảnh native fixture [640×480](evidence/foundation-shell-26/navigation-overlay-640.png)
  và [820×480](evidence/foundation-shell-26/navigation-overlay-820.png).
  Lượt ảnh đầu phát hiện shadow hắt lên titlebar; sửa clip rồi render/đối chiếu lại.
- Test mới kiểm close control ở trong panel và ngay dưới titlebar, giữ preference,
  resize từ compact về 1200pt tự đóng overlay. Regression traffic lights/toggle
  vẫn qua tại 640×480/640×600/820×480/1200×760.
- Lượt cuối: 41 tests hành vi PASS (24 native +17 domain). Hai render matrix/failure
  tests skipped: không lặp lại 276 ảnh cũ; ảnh đợt này là light/VI ở hai width.
- Atomic/Design, generated resources (3 locales/28 metrics), check:docs,
  13 docs tests, diff whitespace PASS. Đọc toàn README và cập nhật đoạn compact
  navigation cùng review record.
- Swift test dùng --disable-sandbox vì sandbox-exec lồng bị Operation not permitted;
  không đổi quyền app. Đã build/package lại Viezan Native Preview.app.
- Không chạy Electron/Qt build hoặc TypeScript: Electron chỉ chuyển cùng giá trị
  CSS sang token; Qt nhận thêm metric không sử dụng. Không sửa runtime của chúng.

## Kiểm trực tiếp còn lại

Ảnh đợt này là cửa sổ NSWindow fixture, không phải live resize cửa sổ người dùng.
Full-screen thật đã kiểm Shell 25; chưa kiểm lại full-screen/Spaces ở đợt này.
Foundation vẫn IN PROGRESS, chưa visual acceptance toàn bộ.

1. Mở bản preview mới, kéo ngang cửa sổ xuống dưới 900pt (hoặc về nhỏ nhất).
   Bấm toggle cạnh traffic lights: panel sát mép trái, bắt đầu dưới titlebar,
   Settings nằm dưới cùng; không còn thẻ nổi cách mép.
2. Cuộn danh sách trong panel: chỉ danh sách cuộn, footer và Settings không trôi.
   Bấm Escape: panel đóng, focus về toggle. Mở lại, bấm ngoài panel để đóng.
3. Mở panel rồi kéo cửa sổ rộng hơn 900pt: panel tự đóng, trạng thái sidebar
   desktop trước đó được khôi phục. Bản nháp không đổi, không gửi chat.
4. Kiểm tương tự với dark/JA và VoiceOver; đợt này chưa tự kiểm trực tiếp các
   tổ hợp đó. Khi kiểm traffic lights, tắt chia sẻ màn hình để badge không che.
