# Foundation 16 — History gọn và thư viện hẹp

2026-10-27. Swift/macOS foundation, chưa Home. Workflow native-migration và
sync-docs; rules native-migration/product-engineering; skills
viezan-native-migration/viezan-native-ux. Đối chiếu Review 18 history, UX07/UX08.

## Sửa theo ảnh và thao tác thật

- History trước đây giữ chiều cao gần 420pt ngay cả khi chỉ có một kết quả.
  Nay đo chiều cao nội dung, co danh sách ngắn và giới hạn danh sách dài theo
  chiều cao còn lại sau header, search, footer. Không cuộn mất nút Đóng hoặc
  Xem tất cả. Các giá trị lấy từ metrics chung.
- SessionRow bỏ dòng snippet rỗng, vẫn giữ title/model/current-session indicator.
- Thư viện hẹp đưa metadata vào cùng vùng cuộn với bản xem trước, giảm padding
  theo token và dùng headline một dòng. Nút Mở vẫn cố định dưới vùng cuộn.
- Tên model mô phỏng được dùng nhất quán ở picker, hàng lịch sử, preview và
  Activity bằng cùng helper; model ID thực/không biết vẫn giữ nguyên.
- CUA phát hiện Back từ thư viện trả focus về window. Đã thêm yêu cầu focus
  về History khi nút này xuất hiện lại, không thay phiên hoặc bản nháp.

## Kiểm chứng

Ma trận thêm thư viện ở 640/820/1200/1440, EN/VI/JA × light/dark, tiêu đề dài,
large reading text, bản nháp Dịch 20 dòng: 180 layout fixtures + 48 failure
fixtures. Test riêng bảo vệ budget chiều cao list khi ít/nhiều kết quả và focus được
phục hồi sau khi control gắn lại vào cửa sổ (không tự kích hoạt cửa sổ).

Swift build/package, 34 tests (17 native + 17 domain), Atomic/Design, resource
freshness và 13 docs tests PASS. CUA xác nhận search một/không kết quả, vào
thư viện và Back giữ draft; AX focus ở History, Space mở lại panel. Vòng sửa
focus đầu chưa pass trên app thật; đã sửa timing khi attach và kiểm tra lại.

Ảnh đại diện/log ở `evidence/foundation-16/`; ma trận đầy đủ tại
`/tmp/viezan-visual16-final-matrix`, `/tmp/viezan-visual16-failures`.
Ảnh fixture dùng icon của test host; không thay cho kiểm tra material và
VoiceOver trên cửa sổ thật. Các ảnh `actual-*` là CUA trên ứng dụng.

## Kiểm tra thủ công còn lại

1. Mở `apps/macos/.build/Viezan Native Preview.app`, thu xuống khoảng 640×480.
   Bấm History, nhập tên chỉ khớp một phiên: panel phải co lại; nhập chuỗi không
   khớp: thông báo rỗng và Xem tất cả vẫn hiện, không có khoảng trắng lớn.
2. Xóa tìm kiếm, dùng danh sách nhiều phiên: cuộn hoặc nhấn mũi tên xuống;
   kết quả được chọn phải tự vào vùng nhìn thấy. Header/search/footer không
   cuộn theo danh sách. Không cần tạo/xóa dữ liệu để làm kiểm tra này.
3. Bấm Xem tất cả, chọn phiên có bản nháp dài. Cuộn vùng xem trước xuống cuối;
   nút Mở phải luôn nhìn thấy. Bấm Quay lại thay vì Mở: phiên/bản nháp hiện tại
   phải giữ nguyên, Space phải mở lại History từ focus được khôi phục.
4. Với VoiceOver, kiểm tra thứ tự search → kết quả → Xem tất cả; trong thư viện
   kiểm tra vùng danh sách và vùng preview phân biệt được. Lời đọc thực chưa
   được xác nhận ở lượt này. Resize chính xác 640/820pt vẫn cần thao tác người
   dùng; fixture chỉ chứng minh layout trong host kiểm thử.

Qt/Electron TS/build/web, Windows/Linux không chạy vì không đổi các runtime đó.
Chưa nghiệm thu toàn bộ Review 18, chưa chuyển sang Trang chủ.
