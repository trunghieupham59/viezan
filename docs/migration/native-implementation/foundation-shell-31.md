# Foundation shell 31 — Tab trong bảng lệnh

2026-10-27. Native-migration/sync-docs; viezan-native-migration/viezan-native-ux;
rules native-migration/viezan-product-engineering. Chưa Trang chủ.

## Sửa theo Electron

Shell spec §9 yêu cầu Tab/Shift-Tab ở trong bảng lệnh; hàng lệnh dùng mũi tên.
Swift trước đây để Tab theo native key loop, không định tuyến giữa search/Close.
Test mounted NativeCommands JA/dark tái hiện 4 failures trước sửa.

- Search của Commands đăng ký onTab; Tab/Shift-Tab yêu cầu focus nút Close.
- Close dùng cơ chế onTab native hiện có để trả về search bằng focusEpoch.
- Các hàng lệnh không nằm trong Tab order; giữ click, hover và mũi tên/Enter.
- Guard marked text giữ quyền xử lý Tab cho Japanese IME. Các search khác
  không đăng ký onTab nên không bị thay đổi native traversal.
- Không đổi geometry, palette, cỡ chữ, session hoặc preferences của user.

## Verification

[Trước sửa](evidence/foundation-shell-31/before.txt): 4 failures.
[Sau sửa](evidence/foundation-shell-31/final.txt): 44 tests hành vi PASS
(27 native +17 domain), gồm vòng Tab hai chiều trong panel JA/dark 376pt,
Home/End/wrap/Enter đúng hàng, marked-text và opt-in checks. Hai render tests
skipped. Atomic/Design, generated resources, check:docs, 13 docs tests và
whitespace PASS. Package preview đã build lại; README/review record cập nhật.

Không render lại 276 ảnh vì không đổi bố cục/màu; Shell 28 là bằng chứng layout
trước đó. Không chạy Electron/Qt/TypeScript build vì không sửa các runtime này.
Test dùng delegate và firstResponder của AppKit trong cửa sổ fixture; không
đồng nghĩa đã kiểm bàn phím vật lý, input-source Japanese hoặc VoiceOver thật.

## Kiểm thủ công (ngắn)

1. Thoát preview cũ, mở package mới. Chọn 日本語 + Dark và kéo cửa sổ về nhỏ nhất.
2. ⌘K → Tab: focus phải tới nút ×. Tab lần nữa về ô tìm. Thử Shift-Tab theo
   chiều ngược; focus không tới sidebar, composer hoặc các hàng lệnh.
3. Khi focus ở ô tìm, ↑/↓/Home/End vẫn chọn hàng, Enter chạy hàng đã chọn.
   Khi focus ở ×, Space đóng panel. Escape đóng và trả về opener.
4. Với Japanese IME đang ghép chữ, Tab phải ưu tiên IME, không nhảy tới ×.
   Sau khi xác nhận chữ, vòng Tab hoạt động lại. VoiceOver phải đọc đúng ô tìm
   và nút Đóng; kiểm này chưa chạy live trong đợt.
5. Thử query không có kết quả: Tab vẫn quay giữa search/Close. Khôi phục locale/
   theme trước kiểm; không cần gửi chat hay thay bản nháp.

Foundation vẫn IN PROGRESS, chưa visual/platform acceptance toàn bộ.
