# Foundation 10 — trạng thái điều hướng và bổ sung render lỗi tối

2026-10-27, macOS 27.0.1 arm64. Foundation only; chưa Trang chủ.
Tiếp tục workflow/rule native-migration và skills viezan-native-migration,
viezan-native-ux; sync-docs cho tài liệu. Acceptance UX07/UX08/UX09, F02/F06/F07.

## Đã xử lý

- Qt navigation: click trang đang mở từng bỏ checked dù route không đổi. Test
  click thật vào QQuickWindow FAIL trước sửa. Đặt nhóm nút autoExclusive để
  activation của trang hiện tại giữ selected; đổi trang chọn đúng một mục.
  Test PASS và CUA trên bundle mới xác nhận bấm AI Chat vẫn checked/hiện highlight.
- Nút Bảng lệnh ở navigation Qt dùng palette.buttonText cho icon giống các nút
  cùng thanh, tránh SVG giữ màu riêng. Không thêm token/literal thiết kế.
- Swift fixture lỗi load/save mở rộng sang light/dark, large content text;
  mỗi locale EN/VI/JA × width 640/820/1200/1440 × 2 lỗi = 48 ảnh.

## Kiểm chứng

- Swift: 29 executed PASS (17 domain + 12 native), không skip. Chạy cả 144
  foundation renders và 48 failure renders; file names ở render-manifest.json.
- Qt build/CTest: 75 PASS (73 scenarios + init/cleanup), 0 failed/skip.
- Node contract 10 PASS, resource freshness PASS, Atomic/Design PASS, docs tests
  13 PASS; docs:sync/review/check và whitespace hoàn tất cùng lượt.
- Đã xem contact sheets 640pt cho cả ba locales/hai modes và hai sheets lỗi
  640pt. Banner/retry và editor còn trong khung. Giới thiệu Chat bị cắt bởi
  viewport cuộn ở height 480; không coi đây là bằng chứng nội dung bị mất.
- Ảnh offscreen không composite Liquid Glass: panel/rail có thể trong suốt/đen
  trong ảnh. Không đánh PASS màu/vật liệu hoặc text contrast panel từ ảnh này.
  Thử override Reduce Transparency trong fixture không biên dịch vì Environment
  key chỉ đọc; đã bỏ override và chạy lại thành công. Không đổi cài đặt macOS.

Evidence: [foundation-10](evidence/foundation-10/). Raw PNG tại
`/tmp/viezan-foundation10-matrix` và `/tmp/viezan-foundation10-failures`; có thể
render lại bằng hai biến môi trường `VIEZAN_NATIVE_TEST_EVIDENCE` và
`VIEZAN_NATIVE_FAILURE_EVIDENCE` cùng lệnh Swift trong bàn giao. Không có file
workspace thật nào được sửa để tạo lỗi; fixture dùng persistence trong bộ nhớ.

## Còn cần nghiệm thu

[Hướng dẫn macOS](MANUAL-MACOS-FOUNDATION.md) có lượt kiểm theo thứ tự ở mục 0,
các bước IME/VoiceOver/width/lifecycle chi tiết bên dưới và mẫu gửi kết quả.
Automation không thay thế candidate bộ gõ thật, speech của VoiceOver, chất lượng
Liquid Glass trên cửa sổ thật hoặc user acceptance. Foundation vẫn IN PROGRESS.
Windows/Linux host và release NOT RUN. Electron build/TS/web/full Vitest không
chạy vì không đổi Electron/TS; Biome không áp dụng QML/Swift/C++.
