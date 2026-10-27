# Foundation 15 — compact overlay và neo History

2026-10-27. Swift/macOS foundation; chưa Home. Workflow native-migration,
sync-docs; rules native-migration/product-engineering; skills
viezan-native-migration và viezan-native-ux. UX07/UX08/UX09.

## Đối chiếu và sửa

- Review 18 History có cạnh phải thẳng với cạnh phải trigger. Trước đây Swift
  lấy cạnh trái trigger làm vị trí trái panel khiến panel trôi sát cạnh cửa sổ.
  Nay dùng trailing anchor, clamp hai cạnh theo inset chung. Tọa độ đo qua
  SwiftUI geometry preference, cập nhật theo layout/resize; bỏ tra cây AppKit
  vì ảnh cửa sổ thật cho thấy lookup đó rơi về fallback.
- Navigation compact trước đây sát cạnh cửa sổ và không có ranh giới rõ với rail.
  Nay là overlay inset 16pt, radius 20pt, border/shadow chung, giữ nền material
  và fallback Reduce Transparency. Không đổi preference thu gọn.
- Commands/History/Activity đang mở có trạng thái soft selected. Các trigger
  khai báo expanded cho accessibility; toggle đổi nhãn mở/đóng đúng khi overlay
  bật. Navigation desktop mở rộng vẫn là control trung tính.
- Back ở thư viện dùng control native 36pt như các nút header khác.

## Bằng chứng và phạm vi

Test render dùng tiêu đề dài VI/JA, large reading text, EN/VI/JA, light/dark,
640/820/1200/1440. Sáu trạng thái cũ cộng navigation ở hai width compact:
156 layout fixtures và 48 failure fixtures. Test đo bounds control, expanded
state và trailing anchor. Fixture không thay cho cửa sổ thật/VoiceOver.

Evidence: `evidence/foundation-15/`. Ma trận đầy đủ ở
`/tmp/viezan-visual15-final-matrix`, `/tmp/viezan-visual15-failures`.
Swift build/package, 32 tests (15 native + 17 domain), Atomic/Design,
resource freshness và 13 docs tests PASS. CUA xác nhận cạnh panel History
thẳng cạnh trigger, Escape trả focus về History và Space mở lại; Activity thay
History, chỉ có một panel. Lời đọc VoiceOver chưa kiểm tra, expanded state mới
được xác nhận bằng test AppKit. Không đổi kích thước/theme/dữ liệu người dùng
trong lượt này. Ảnh render có icon app của test host (folder), không phải logo
cửa sổ app thật.

Qt/Electron build, Windows/Linux không chạy: chỉ sửa Swift foundation.
Không đổi provider, dữ liệu ứng dụng, hoặc triển khai Trang chủ.

## Kiểm tra thủ công macOS

1. Mở `apps/macos/.build/Viezan Native Preview.app`. Thu cửa sổ xuống dưới 900pt
   (gần chiều rộng tối thiểu 640pt). Sidebar phải thành rail, header vẫn đủ
   các icon Commands/History/New/Activity, tiêu đề dài được cắt cuối.
2. Bấm toggle: panel navigation cách mép trái/trên/dưới 16pt, có góc bo, không
   cắt nút Cài đặt hoặc Đóng. Bấm Escape để đóng; mở lại rồi bấm ngoài panel.
3. Mở navigation, sau đó bấm History: chỉ còn một panel. History nằm dưới
   header; cạnh phải thẳng trigger khi đủ chỗ và được giới hạn trong cửa sổ.
4. Bấm History lần nữa để đóng, hoặc Escape rồi Space để mở lại. Focus phải
   quay về nút vừa mở panel. Với VoiceOver, kiểm tra tên control và trạng thái
   expanded thay đổi; lần này chưa xác minh lời đọc VoiceOver thực.
5. Mở rộng qua 900pt rồi quay lại: preference sidebar trước đó phải được giữ,
   bản nháp và lựa chọn phiên không đổi. Chưa nghiệm thu resize thật tại chính
   xác 640/820pt chỉ bằng fixture.
