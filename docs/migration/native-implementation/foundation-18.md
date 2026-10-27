# Foundation 18 — Nút panel và focus ở cửa sổ hẹp

2026-10-27. Swift/macOS foundation theo Review 18; chưa Trang chủ.
Tiếp nối foundation-17, theo native-migration/sync-docs và skills
viezan-native-migration/viezan-native-ux.

## Thay đổi

- Activity: Mở lại/Dừng/Thử lại dùng chung nút native cao 36pt. Mở lại neutral,
  Dừng đỏ mềm có viền, Thử lại primary xanh. Footer Mở lại của thư viện dùng
  cùng nút primary. Kích thước/radius lấy từ metric canonical; màu semantic OS.
- Dùng lại NSButton của shell, giữ accessible name/identifier và native focus.
  Không thay đổi provider, draft, retry/cancel hay persistence.
- Sửa Tab từ Đóng bỏ qua các thao tác Activity và rơi về sidebar. Tab/Shift–Tab
  nay đi vòng trong panel; nút ngoài viewport tự cuộn vào vùng nhìn thấy bằng
  AppKit scrollToVisible. Header không nằm trong vùng cuộn.

## Kiểm tra và bằng chứng

- Swift build/package; 35 tests (18 native + 17 domain). Test mới mount Activity,
  kiểm tra Tab/Shift–Tab qua Close/Open/Stop, kích hoạt nút mở đúng phiên và không hủy task.
- 228 layout fixtures + 48 failure fixtures: VI/EN/JA, light/dark,
  640/820/1200/1440pt; thêm Activity có thể retry sau cancel. Các fixture dùng
  storage/provider mô phỏng riêng, không thay đổi dữ liệu của app đang mở.
- Tự xem ảnh 640pt: Activity đang chạy, retry dark JA, library dark JA;
  nút đủ chiều cao, không vượt panel/cửa sổ, footer thư viện còn nhìn thấy.
- CUA cửa sổ thật: Tab tới Open; Shift–Tab về Close và vòng tới Open cuối.
  Scrollbar từ 0 tới khoảng 0.986, nút cuối hiện trong panel. Space ở Open đầu
  mở đúng phiên QA; panel đóng, focus về Activity, bản nháp giữ nguyên.
- Evidence: `evidence/foundation-18/`; full renders ở
  `/tmp/viezan-visual18-final-matrix` và `/tmp/viezan-visual18-failures`.
- Atomic/Design, generated resources freshness, docs checks/tests và whitespace
  được chạy. Electron TS/build/web, Qt và Windows/Linux không chạy vì chỉ sửa Swift.

Không coi các ảnh render là kiểm chứng cửa sổ thật ở đúng 640/820pt. Chưa xác minh
lời đọc VoiceOver hoặc trạng thái disabled của kiểu nút mới bằng UI thực tế.
Chưa đánh PASS toàn bộ Review 18/user acceptance.

## Các bước kiểm tra thủ công trên macOS

1. Mở `apps/macos/.build/Viezan Native Preview.app`. Kéo cạnh cửa sổ nhỏ nhất
   (giới hạn 640×480), rồi tăng rộng gần 820pt. Kiểm tra toggle không đè traffic
   lights; tiêu đề dài cắt trước cụm nút bên phải, không làm mất nút.
2. Nhấn ⌘⇧A. Tab phải đi từ Đóng tới Mở lại đầu; Shift–Tab từ Đóng tới thao tác
   cuối. Với danh sách dài, nút được focus phải hiện rõ sau cuộn; tiêu đề/nút
   Đóng vẫn ở đầu panel. Escape phải đóng và trả focus về nút Activity.
3. Nếu muốn kiểm tra Dừng/Thử lại, tạo riêng phiên QA, chọn Mô phỏng chậm,
   nhập câu thử và gửi. Mở Activity, kiểm tra Dừng đỏ và cùng chiều cao với Mở lại.
   Dừng tác vụ QA rồi kiểm tra Thử lại xanh. Không dùng tác vụ đang làm thật.
4. Nhấn ⌘⇧H → Xem tất cả lịch sử, chọn phiên có nội dung dài. Ở cửa sổ hẹp,
   cuộn preview: nút Mở lại xanh phải còn thấy dưới cùng, nội dung không đè nút.
5. Bật VoiceOver bằng ⌘F5 (hoặc Fn⌘F5), duyệt Activity bằng VO+phím mũi tên.
   Kiểm tra tên Đóng/Mở lại/Dừng/Thử lại và trạng thái tác vụ được đọc rõ;
   VO+Space kích hoạt đúng tác vụ QA. Tắt VoiceOver sau kiểm tra nếu trước đó tắt.
6. Lặp bước 1–4 ở dark và JA trong Settings, rồi khôi phục mode/ngôn ngữ cũ.
