# Foundation 11 — keyboard parity và focus chuyển panel

2026-10-27, macOS 27.0.1 arm64. Tiếp tục implement theo yêu cầu, không chuyển
sang Trang chủ. Workflow/rule native-migration; skills viezan-native-migration,
viezan-native-ux; sync-docs. Acceptance UX07/UX10, F02/F04/F05.

## Thay đổi đã kiểm chứng

- Swift Chat và Nguyên bản dùng chung ComposerEditor/AppKit; binding gắn session
  ID cụ thể, identifier riêng cho ô nguồn. CUA ⌘N focus đúng nguồn;
  Command+keypad Enter tạo kết quả mô phỏng, giữ nguyên bản nháp Chat cũ.
- Swift composer nhận Command+Return và Command+keypad Enter (mã phím 36/76).
  Marked text vẫn chặn submit. Qt dùng handler chung cho Return/keypad Enter ở
  Chat/Dịch; History và Commands cũng nhận cả hai phím, giữ guard IME.
- Test Qt keypad gửi FAIL trước sửa (không có task), PASS sau sửa. Tests mới
  xác minh Chat/Dịch/Commands/History không thực thi khi còn preedit, commit
  xong mới cho gửi/chọn; phím gửi lặp khi running không hủy task.
- Swift Commands/History/Activity là các nhóm accessibility có tên bản địa hóa.
  CUA xác nhận container và các control con vẫn hiện, search vẫn nhận focus.
- CUA phát hiện chuyển Commands → Activity bằng keypad Enter có lúc focus về
  window. ShellCloseButton nay chờ outgoing AppKit field editor hoàn tất bằng
  một task yield rồi nhận focus; task bị hủy không giành lại focus. Build và
  thử lại cùng đường đi: focus là nút Đóng. Activity → History focus search;
  Escape cuối chuỗi trả về nút Bảng lệnh ban đầu.
- Qt navigation regression mở rộng 12 locale/width cases, click lại và Space
  giữ selected; đổi route chỉ chọn đúng trang.

- Undo/Redo Swift: bật native undo, undo manager riêng cho editor, xóa undo/redo
  khi đổi session ID; nối undo:/redo: và menu validation để Edit menu/phím tắt
  dùng đúng manager. Chỉ bật manager chưa đủ: CUA vẫn thấy Undo disabled, nên
  đã sửa responder actions và thử lại. AX cuối xác nhận ⌘Z bỏ ký tự y, ⇧⌘Z
  khôi phục y. Mounted test kiểm insert/undo/redo và đổi phiên không undo dữ
  liệu cũ; Qt có hai tests keyboard undo/redo/new-session tương ứng PASS.

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| Swift build/test/package | 31 executed PASS (17 domain + 14 native), không skip; gồm 144/48 render fixtures |
| Qt build/CTest | 91 PASS = 89 scenarios + init/cleanup; 0 fail/skip |
| Resource freshness / Node contract | PASS / 10 PASS |
| Atomic/Design / docs tests | PASS / 13 PASS |
| CUA Swift/Qt | Keypad Enter mở Activity từ query hoat; focus Đóng. Swift nhóm panel và History focus xác nhận |

Render 144/48 đã chạy lại trên source cuối ở `/tmp/viezan-foundation11-matrix`
và `/tmp/viezan-foundation11-failures`; đã xem ảnh Dịch 640pt JA/light và VI/dark
sau đổi editor. Glass offscreen vẫn không phải bằng chứng vật liệu cửa sổ thật.
Không dùng render/AX thay speech VoiceOver.
Không thêm literal thiết kế, không đổi system settings hay draft cũ;
tạo một phiên Dịch QA riêng và giữ lại để đối chiếu; các test
model/storage dùng fixture cô lập. Đã mở lại cả hai bundle mới.

Evidence: [foundation-11](evidence/foundation-11/). Lần thử Swift paste + Enter
đầu tiên không giữ panel đủ để kết luận; clipboard paste vào nguồn cũng không
đưa text vào nên dùng typeText ASCII để kiểm riêng shortcut; không tính PASS. Thử lại bằng query
ASCII hoat, quan sát search rồi mới Enter có AX trước/sau rõ ràng.

## Ranh giới hoàn tất

Không còn test thất bại trong phạm vi suite đã chạy; các lỗi tái hiện được ở
những lượt Foundation 05–11 đã sửa. Điều này không có nghĩa toàn bộ foundation
được nghiệm thu: VI/JA IME nguồn nhập thật, VoiceOver speech/traversal và visual
window matrix thực tế còn cần kiểm tra theo hướng dẫn macOS. Các mục đó không
chặn những sửa chữa tự động hóa được đã thực hiện ở lượt này.
Windows/Linux host, release NOT RUN. Electron build/TS/web/full Vitest không
chạy vì thay đổi chỉ ở native; Biome không áp dụng Swift/QML/C++.
