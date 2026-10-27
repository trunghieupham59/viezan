# Foundation shell 24 — native titlebar và minimum window

2026-10-27. Native-migration/sync-docs; viezan-native-migration/viezan-native-ux;
rules native-migration/viezan-product-engineering. Chưa nội dung Trang chủ.

## Lỗi tìm được và sửa

- Test mới dùng NSWindow titled/fullSizeContentView với traffic lights thật của
  AppKit, thay vì chỉ borderless host. Bản cũ lệch tâm traffic lights/toggle 4pt
  ở 640/820/1200. Căn dọc standard buttons theo vùng titlebar 40pt, giữ nguyên
  vị trí ngang/kích thước/action hệ thống. Chờ SwiftUI hoàn tất layout tránh
  lệch khi resize; nghe didResize cho resize chỉ chiều cao và didExitFullScreen
  để căn lại sau thoát. Không can thiệp bố trí trong full-screen.
- NSHostingView automatic minimum là content minimum: AppKit cộng thêm titlebar
  32pt, khiến fixture yêu cầu 640×480 thành 640×512. Chỉ đổi ignoresSafeArea
  không sửa được. Tắt automatic minSize của hosting surface và đặt window.minSize
  theo full frame 640×480; scene dùng automatic resizability. Root vẫn giữ
  minimum layout, các kích thước đều lấy canonical tokens.
- Sidebar dùng chrome-fg/chrome-accent/chrome-item-active của Electron Glass;
  titlebar dùng chrome-fg-muted và chrome-item-hover. Không thêm bảng màu riêng.

## Bằng chứng

- Regression trước sửa: 12 lỗi lệch 4pt (ba traffic lights × bốn lượt resize).
- Regression cuối: full frame/host đúng 640×480, 820×480, 1200×480 rồi 640×480;
  tâm traffic lights và toggle chênh dưới 1pt, không giao nhau, preference giữ nguyên.
- Ảnh từ frame view bao gồm system controls; fixture không key nên traffic lights
  màu xám. Đây là NSWindow fixture thật, không phải screenshot cửa sổ người dùng.
  [640×480](evidence/foundation-shell-24/titled-window-640.png),
  [820×480](evidence/foundation-shell-24/titled-window-820.png).
- Regression cuối và 39 tests hành vi PASS (22 native +17 domain). Hai render
  tests skipped trong lượt cuối; matrix layout 276 ảnh đã chạy riêng trong đợt,
  không render lại sau sửa sự kiện AppKit (borderless không dùng các controls này).
- Matrix borderless vẫn bảo vệ VI/EN/JA, light/dark, 640/820/1200/1440 và overlays.
  Test failure renders không chạy vì không thay storage/recovery.
- Atomic/Design, generated resource freshness, check:docs và 13 docs tests PASS.
  Không build Electron/Qt/TypeScript: không sửa presentation/runtime những lớp đó.
  README vẫn mô tả đúng shell; không tạo lại review record chỉ để làm mới dấu thời gian.

## Giới hạn và kiểm trực tiếp

Bản app package đã cập nhật; draft/session cũ không bị sửa. Giao diện vẫn dùng
SF Symbols, nền tint đục và primary solid; chưa pixel-perfect Electron Glass.
Full-screen/Spaces/VoiceOver/IME không được suy ra từ test fixture.

1. Mở preview, kéo cửa sổ về nhỏ nhất: titlebar và các nút header không chồng,
   sidebar thu thành rail. Mở toggle, cuộn danh sách: footer/Settings vẫn ở đáy.
2. Không chia sẻ màn hình khi kiểm traffic lights (badge đang che chúng trong CUA).
   Ba nút cùng hàng với toggle; thử thu nhỏ rồi mở lại cửa sổ.
3. Vào full-screen bằng nút xanh, thoát full-screen, resize cửa sổ: traffic lights
   trở về đúng hàng, titlebar kéo được. Đây là phần vẫn cần kiểm thủ công.
4. ⌘K/⌘⇧H/⌘⇧A rồi Escape: panel trong cửa sổ và focus về opener. Kiểm VI/JA IME
   và VoiceOver theo Shell 22; không cần gửi chat hay thay draft.
