# Foundation 19 — Thư viện rỗng tại cửa sổ hẹp

2026-10-27, Swift/macOS. Phạm vi foundation theo Review 18, UX07/UX08;
chưa Trang chủ. Dùng workflow native-migration/sync-docs, rule native-migration/
viezan-product-engineering, skills viezan-native-migration/viezan-native-ux.

## Đối chiếu và sửa

Ở 640×480, tìm kiếm không khớp vẫn giữ nửa trên cho danh sách trống, có đường
chia và preview rỗng phía dưới. Hai vùng cùng báo “Không có kết quả phù hợp”.
CUA trên app thật xác nhận thông báo bị lặp trong accessibility tree.

- Chỉ giữ một empty state dưới search, bỏ danh sách/preview/divider vô nghĩa.
- Giữ cùng NSSearchField khi kết quả chuyển rỗng/có kết quả; desktop giữ vị trí
  và chiều rộng search, compact dùng chiều rộng vùng nội dung.
- Xóa query phục hồi kết quả và preview mà không đổi phiên hoặc bản nháp đang mở.
- Thêm tooltip tiêu đề đầy đủ cho hàng lịch sử bị truncate ở chiều rộng hẹp.
- Không thêm token, màu literal, copy mới, provider hay thay đổi persistence.

## Kiểm tra

Swift build/package, 36 tests (19 native + 17 domain) PASS. Test mới mount thư viện,
kiểm tra search giữ nguyên instance qua empty/results, nút Open ẩn/hiện đúng,
active session/draft không đổi. Ma trận thêm library-empty:
252 layout fixtures + 48 failure fixtures ở VI/EN/JA, light/dark,
640/820/1200/1440pt. Tự xem trước/sau tại 640pt và dark JA/820pt.

Atomic/Design, resource freshness (3 locales/25 metrics), docs checks/tests và
whitespace PASS. Electron TS/build/web, Qt và Windows/Linux: Not run vì
lượt này chỉ thay đổi Swift foundation.

CUA sau sửa: chỉ một thông báo trong AX tree; gõ tiếp `-more` vẫn ở search,
xóa query khôi phục danh sách/preview. Quay lại vẫn đúng phiên Bản dịch mới và
focus về nút Lịch sử; không gửi request hay thay đổi nội dung phiên.

Evidence: `evidence/foundation-19/`; full render matrix ở
`/tmp/viezan-visual19-final-matrix`, failure ở `/tmp/viezan-visual19-failures`.
Fixture là host riêng, không thay cho kiểm chứng cửa sổ thật đúng kích thước.
Không coi đây là hoàn tất toàn bộ Review 18 hay user acceptance.

## Kiểm tra thủ công còn lại

1. Mở `apps/macos/.build/Viezan Native Preview.app`. Thu cửa sổ xuống nhỏ nhất
   (640×480), mở Lịch sử bằng ⌘⇧H rồi chọn Xem tất cả lịch sử.
2. Gõ một từ không có trong lịch sử, ví dụ `zz-no-match-19`. Chỉ một thông báo
   “Không có kết quả phù hợp” hiện dưới search; không có divider hoặc preview
   rỗng thứ hai. Search không đổi vị trí và vẫn nhận ký tự tiếp theo.
3. Xóa từ khóa bằng nút x trong search. Danh sách/preview trở lại; bấm Quay lại
   công việc, xác nhận phiên và bản nháp cũ giữ nguyên. Lặp ở khoảng 820pt,
   dark và JA, rồi khôi phục ngôn ngữ/theme ban đầu.
4. Với VoiceOver (⌘F5 hoặc Fn⌘F5), duyệt từ search xuống empty state. Chỉ nghe
   thông báo một lần; không phải đi qua danh sách/preview rỗng. Lời đọc VoiceOver
   thực tế và resize chính xác 640/820pt vẫn chưa được xác nhận tự động.

## Follow-up — preview khi đổi mục

Đã tái hiện bằng mounted test tại vùng thư viện 580×424pt: sau khi cuộn preview
500pt, chọn mục khác vẫn giữ offset cũ, che tiêu đề và đầu nội dung mới. Gắn
identity của ScrollView preview với session ID để mỗi mục mới bắt đầu từ đầu;
không mở phiên hay thay đổi draft. Test trước sửa FAIL, sau sửa kiểm tra tập
trung cùng empty-search regression. Không chạy lại full visual matrix cho sửa
identity này. Cửa sổ thật/VoiceOver: Not run cho follow-up.

Kiểm tra thủ công: mở thư viện tại 640×480, chọn mục dài, cuộn xuống; chọn mục
dài khác và xác nhận preview bắt đầu từ tiêu đề, nút Mở lại vẫn ở đáy. Quay lại
công việc phải giữ phiên và bản nháp ban đầu.

Theo phản hồi người dùng, đợt tiếp theo gom foundation thành một batch hoàn
chỉnh theo UI/UX Electron, rồi polish Review 18/macOS; dùng test tập trung khi
sửa, ma trận đầy đủ ở cuối batch. Chưa chuyển sang Trang chủ.
