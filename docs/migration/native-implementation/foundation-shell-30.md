# Foundation shell 30 — focus sau chuyển panel và responsive reflow

2026-10-27. Workflow native-migration/sync-docs; skills viezan-native-migration,
viezan-native-ux; rules native-migration/viezan-product-engineering.
Phạm vi foundation Swift, chưa Trang chủ.

## Lỗi tái hiện và sửa

Callback trả focus được xếp vào main queue khi đóng panel. Nếu một panel khác
mở trước khi callback chạy, callback cũ vẫn đặt focus về opener cũ. Một trường
hợp khác: control bị tháo khỏi window do reflow sau khi xếp callback, việc trả
focus thất bại và không có fallback. Đây là lỗi hành vi, không phải lỗi màu/font.

- Thêm generation cho vòng đời focus: mỗi show/dismiss vô hiệu callback cũ.
  Callback chỉ được chạy nếu chưa có transition mới và overlay vẫn đóng.
- Kiểm opener còn thuộc đúng window, còn nhận focus và makeFirstResponder thành
  công. Nếu không, kích hoạt cơ chế focusEpoch hiện có để focus về trigger.
- Giữ returnFocus:false cho điều hướng/New; không kéo focus khỏi nơi đến.

## Bằng chứng

Regression AppKit trước sửa: 3 failures (hai lần focus bị lấy khỏi field mới,
một lần thiếu fallback). [Before](evidence/foundation-shell-30/before.txt).
Cùng regression sau sửa PASS: [Final](evidence/foundation-shell-30/final.txt).

- 44 tests hành vi PASS: 27 native +17 domain; hai render tests skipped.
  Bao gồm titlebar JA light/dark, compact navigation VI/JA × light/dark,
  command keyboard/IME và session isolation.
- Atomic/Design, generated resource freshness, check:docs, 13 docs tests và
  whitespace PASS. Build/package preview cập nhật; README/review record đồng bộ.
- Không render lại matrix 276 ảnh: không đổi màu/font/layout. Ảnh JA/dark trong
  Shell 28 vẫn là bằng chứng trước đó, không phải ảnh mới cho race focus.
- Không chạy Electron/Qt/TypeScript build: không sửa runtime các lớp đó.
- AppKit tests chạy trong fixture; chưa xác nhận thao tác nhanh bằng người dùng,
  VoiceOver hoặc input-source Japanese thực tế. Không chỉnh preferences/draft.

## Kiểm thủ công tập trung

1. Thoát preview cũ và mở package mới. Chọn 日本語 + Dark, kéo cửa sổ nhỏ nhất.
   Ghi lại preferences trước kiểm để khôi phục sau đó.
2. Mở ⌘K, Escape rồi mở ngay ⌘⇧H. Gõ vào ô tìm lịch sử: chữ phải vào ô tìm
   mới, không rơi về composer/toggle. Lặp lại đổi từ History sang Commands.
3. Mở sidebar bằng toggle, mở tìm kiếm từ sidebar rồi Escape. Thu/phóng ngang
   qua ngưỡng compact và kiểm focus vẫn có điểm đến hợp lệ, không biến mất.
4. Bật VoiceOver: sau đóng panel, nghe tên trigger/opener tương ứng; khi mở panel
   khác, focus ở control của panel mới. Kiểm Tab/Shift-Tab và Escape.
5. Với Japanese IME đang ghép chữ, Escape ưu tiên hủy composition; không đóng
   panel sớm. Sau xác nhận chữ, Escape đóng bình thường. Khôi phục preferences
   trước kiểm; không cần gửi chat hoặc thay bản nháp.

Foundation vẫn IN PROGRESS, chưa visual/platform acceptance toàn bộ.
