# Foundation 09 — focus tìm kiếm và phím gửi

2026-10-27, macOS 27.0.1 arm64. Chỉ foundation, chưa Trang chủ.
Workflow/rule: native-migration; skills: viezan-native-migration, viezan-native-ux;
đối chiếu tài liệu theo sync-docs. Acceptance liên quan: UX07/UX08/UX09, F01/F04/F05/F07.

## Lỗi đã sửa

1. Swift HistorySearch tắt focus ring của AppKit. Khôi phục `.exterior` cho
   Commands/History để vị trí nhập liệu nhìn thấy rõ; không thêm màu/token riêng.
   Đã build, đóng gói và mở lại app. CUA xác nhận focus vào search, ảnh mới có
   viền native; Tab sang AI Chat, Escape đóng panel khi focus ở hàng kết quả.
2. Qt Chat và Dịch dùng chung `root.submit()` (toggle Send/Stop) cho phím gửi.
   Vì vậy bấm phím gửi lúc running có thể hủy task. Hai test QML trước sửa FAIL.
   Handler bàn phím nay chỉ gửi command submit: domain bỏ qua nếu đang running;
   người dùng vẫn dừng qua nút Dừng. Không thay request, session, draft hay model.

## Kiểm chứng

- Swift: 27 executed pass (17 domain + 10 native), 2 optional render tests skip.
- Qt: 74 passes (72 scenarios + init/cleanup), 0 failed/skip.
- 6 test rows EN/VI/JA × light/dark, large text: mở từng History/Commands/Activity,
  resize qua 640/820/1200/1440 tại height 480; bounds trong cửa sổ; Escape trả
  active focus về editor; snapshot không đổi. Đây là mounted QML/offscreen,
  không thay thế nghiệm thu cửa sổ thật hoặc VoiceOver.
- Hai regression tests Chat/Dịch gửi QTest Return+Control vào editor đang focus:
  task tiếp tục running và toàn bộ snapshot không đổi. Qt maps modifier này
  sang phím Command trên macOS. Test không đổi dữ liệu preview người dùng.
- Generated resources freshness PASS (3 locales/17 metrics); Node contract 10 PASS;
  Atomic/Design PASS; docs tests 13 PASS; docs:sync/review/check thực hiện cuối lượt.
- Rà literals: dùng AppKit focus ring; QML chỉ đổi command, không thêm design value.

Evidence: [foundation-09](evidence/foundation-09/), gồm ảnh search trước/sau, AX,
Swift/Qt logs và test shortcut FAIL trước sửa. Một lần chạy QtTest trực tiếp
thiếu môi trường offscreen gặp lỗi dịch vụ macOS sandbox; dừng rồi chạy lại
đúng môi trường CTest (offscreen/Fusion), không dùng lần lỗi môi trường làm kết luận.

## Còn mở

Xem [hướng dẫn thủ công](MANUAL-MACOS-FOUNDATION.md): chọn ngôn ngữ UI tương ứng
trước khi thử tìm lệnh tiếng Nhật/Việt, kiểm candidate thật và VoiceOver speech,
kiểm cửa sổ thực tế và xác nhận lifecycle. Không đánh PASS thay người dùng.
Không đổi cài đặt hệ thống. Không chạy lại 144/24 render fixtures, Electron build,
TypeScript/web/full Vitest (không sửa Electron/TS). Biome không áp dụng Swift/QML/C++.
Windows/Linux host và release acceptance NOT RUN; foundation còn IN PROGRESS.
