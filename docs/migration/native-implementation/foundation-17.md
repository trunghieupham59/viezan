# Foundation 17 — Bảng lệnh và Activity ở cửa sổ hẹp

2026-10-27. Swift/macOS foundation, chưa Home. Workflow native-migration và
sync-docs; rules native-migration/product-engineering; skills
viezan-native-migration/viezan-native-ux. Theo Review 18/workbench-ux, UX07/UX08.

## Đối chiếu và thay đổi

- Ảnh 640×480 trước sửa cắt một phần hàng lệnh thứ bảy. Hàng lệnh nay dùng
  compactControl 32pt, gap tight 4pt; icon/nhãn/shortcut trong cùng hàng, shortcut
  không bị nén. Header 36pt. Cả bảy lệnh hiện đủ ở VI/EN/JA. Selection dùng
  accent soft và vẫn có accessibility selected, không chỉ dựa vào màu.
- Activity rỗng trước sửa giữ panel cao gần 420pt. Nay dùng nội dung rỗng gọn;
  danh sách có tác vụ đo chiều cao và giới hạn theo phần còn lại sau header.
  Header/nút Đóng nằm ngoài vùng cuộn; không mở rộng vượt cửa sổ thấp.
- Không thay đổi trạng thái tác vụ, provider, retry/cancel hoặc draft.

## Kiểm tra

Swift build/package và 34 tests (17 native + 17 domain) PASS. Atomic/Design,
resource freshness, 13 docs tests và diff whitespace PASS.

Ma trận 204 layout fixtures: EN/VI/JA × light/dark × 640/820/1200/1440,
bao gồm Activity rỗng và có tác vụ mô phỏng đang chạy, title dài và library;
12 navigation compact fixtures nằm trong tổng đó. Thêm 48 failure fixtures.
Ảnh fixture không thay thế cửa sổ thật/VoiceOver.

CUA: Activity có nhiều mục cuộn đến cuối (scrollbar = 1), header/Đóng vẫn hiện.
Bảng lệnh nhận sáu lần Down và đánh selected đúng hàng cuối, sau Escape về
công việc cũ; draft giữ nguyên. Không chạy lệnh tạo mới hay hủy tác vụ người dùng.

Evidence: `evidence/foundation-17/`. Full matrix:
`/tmp/viezan-visual17-final-matrix`, `/tmp/viezan-visual17-failures`.

## Kiểm tra thủ công còn lại

1. Mở `apps/macos/.build/Viezan Native Preview.app`, thu tới gần 640×480.
   Nhấn ⌘K: cả bảy hàng lệnh phải nhìn thấy, gồm hàng điều hướng cuối cùng.
   Nhấn Down sáu lần, kiểm tra highlight hàng cuối và shortcut không bị cắt.
   Nhấn Escape; không cần Return vì Return sẽ thực thi lệnh đang chọn.
2. Mở Activity bằng ⌘⇧A. Nếu không có tác vụ, panel phải gọn quanh thông báo.
   Nếu có nhiều mục, cuộn cuối danh sách: tiêu đề/nút Đóng không trôi đi,
   thao tác của mục cuối vẫn vào được vùng nhìn thấy.
3. Đổi VI/EN/JA trong Settings để kiểm tra nhãn dài; trả lại ngôn ngữ cũ.
   Ở 820pt và khi mở rộng qua 900pt, panel không đè lên hàng header.
4. Với VoiceOver, nghe tên lệnh được chọn và nút Đóng; kiểm tra thứ tự duyệt
   trong Activity sau cuộn. Lượt này chưa xác minh lời đọc thực hoặc resize
   cửa sổ thật tại chính xác 640/820pt; các width này được kiểm bằng fixture.

Qt/Electron TS/build/web và Windows/Linux không chạy vì lượt này chỉ sửa Swift.
Chưa đánh PASS toàn bộ visual acceptance Review 18, chưa chuyển sang Trang chủ.
