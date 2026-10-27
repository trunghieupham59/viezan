# Foundation 07 — automation và bàn giao kiểm tra thủ công macOS

2026-10-27. Không chuyển sang Trang chủ. Lượt này chỉ thêm tests, bằng chứng và
hướng dẫn; không đổi presentation/product source, provider, dữ liệu Electron hay
cài đặt hệ thống. Giữ nguyên các thay đổi đang có trong working tree.

## Kết quả mới

- Qt: thêm 12 tổ hợp VI/EN/JA × 640/820/1200/1440 cho lỗi lưu. Mount QML thật,
  kiểm tra banner/retry/editor nằm trong chiều ngang cửa sổ, retry visible/enabled,
  editor vẫn dùng được; phát signal clicked của nút retry thật, xác minh lỗi biến
  mất và snapshot khôi phục đúng bản nháp. Mọi obstacle nằm trong QTemporaryDir.
- Swift/AppKit: cửa sổ test có first responder thật; Commands → History → dismiss
  trả về opener ban đầu. Dismiss không yêu cầu trả focus giữ nguyên destination.
- SwiftUI: render 24 lỗi load/save theo 3 locale × 4 widths, light, content 480pt;
  kiểm tra lỗi đọc khóa thay đổi, retry save giữ Unicode. Đã xem 3 contact sheets
  và ảnh 640pt chi tiết: banner/nút retry đọc được, không cắt ngang. Phần giới
  thiệu Chat nằm trong scroll viewport khi chiều cao bị giới hạn; không lấy vùng
  glass màu đen của offscreen renderer làm bằng chứng màu giao diện.
- CUA Swift: ⌘W trong lúc `demo.slow` chạy, inventory vẫn báo app running; mở lại
  bundle, phản hồi tiếp tục dài hơn, nút Dừng/Activity 1 còn hiện và bản nháp
  `Foundation 07 unsent draft 日本語 · Tiếng Việt` giữ nguyên. Đây là Close/reopen,
  không phải thử Quit/crash. Phiên QA được giữ lại, không xóa phiên cũ.

## Kiểm chứng

| Check | Kết quả |
| --- | --- |
| Swift test | 28 executed pass: 17 domain + 11 AppKit/SwiftUI; 1 general visual-matrix test skip vì không đặt biến môi trường của matrix đó |
| Failure render | 24 PNG đúng width × 480, backing scale 2×; tạo bằng test riêng, không phải cửa sổ app thật |
| Qt build + CTest | 65 passes = 63 scenarios + init/cleanup, 0 failed/skip |
| docs / Atomic / Design | Xem log checks lưu cùng evidence |

Test Swift dùng cùng lệnh/cache ở [Foundation 06](foundation-06.md), thay biến
matrix bằng `VIEZAN_NATIVE_FAILURE_EVIDENCE=/tmp/viezan-foundation07-failures`.
Không cần sửa workspace snapshot của người dùng để tái tạo lỗi.

Evidence: [foundation-07](evidence/foundation-07/), gồm `swift-test.log`,
`qt-test.log`, `swift-close-reopen.txt`, `failures-{vi,en,ja}.jpg`, sáu ảnh lỗi
640pt và manifest. Raw 24 PNG hiện ở `/tmp/viezan-foundation07-failures` và có thể
render lại bằng biến môi trường trên.

## Các mục cần người dùng nghiệm thu

Đã chuẩn bị [hướng dẫn macOS](MANUAL-MACOS-FOUNDATION.md) với đường dẫn hai app,
thao tác, kết quả mong đợi và mẫu trả kết quả cho:

1. Candidate/commit thật của bộ gõ Nhật và Việt; phím automation trước đó chỉ
   tạo Latin, còn menu nguồn nhập bị timeout.
2. VoiceOver speech/traversal và toàn bộ đường focus; cây AX không thay thế nghe.
3. Visual window/toolbar và compact overlays ở các mốc width, EN/VI/JA, light/dark;
   automation resize trước đó không đáng tin cậy.
4. Xác nhận Close/Quit/restore và appearance nếu muốn nghiệm thu trực tiếp;
   tests và CUA đã có bằng chứng nhưng user acceptance vẫn chưa nhận.

Không đánh PASS các bước thủ công trước khi nhận kết quả. Windows/Linux là gate
riêng. Không chạy lại Electron build/full Vitest/web/TypeScript vì không đổi
product source; Biome không áp dụng Swift/C++ tests. README hiện vẫn mô tả đúng
native experimental, fake provider và gate chưa hoàn tất.
