# Foundation 12 — triển khai hình ảnh theo Review 18

2026-10-27, macOS 27.0.1 arm64. Người dùng yêu cầu ưu tiên UI/UX Viezan mới
đúng thiết kế. Ảnh được gửi là hiện trạng Qt cần sửa, không phải mẫu đích.
Workflow/rule: native-migration; skills viezan-native-migration,
viezan-native-ux; sync-docs. Scope UX08/UX09, foundation, chưa làm Trang chủ.

## Đầu vào và thay đổi

Đối chiếu Review 18, đặc biệt `desktop-review/audit/review18-handoff/02-macos-history.png`
và `workbench-ux.md`. Các thay đổi đã đưa vào runtime:

- Qt sidebar có bề mặt riêng, icon/nhãn căn trái, hàng chọn xanh nhẹ và bo góc;
  giữ tên/selected/keyboard state và rail 60/expanded 236.
- Toolbar Qt căn nút thu gọn theo cột navigation; tiêu đề gồm tính năng/phiên.
  Lịch sử, Tạo mới, Hoạt động có nhãn trên desktop và thu còn icon khi compact.
  Tạo mới dùng nhấn mạnh soft. Swift toolbar cũng có nhãn adaptive và accent.
- Qt composer chỉ một bề mặt đục bo góc; chiều cao bắt đầu gọn và tăng theo text
  đến giới hạn hiện có. Model picker/Send cùng chiều cao; disabled Send màu xám,
  Stop dùng màu danger. Không đổi identity/draft/submission.
- Panel Qt có padding/border/radius thống nhất; history selected soft, model
  mô phỏng dùng tên bản địa hóa, ID lạ vẫn giữ nguyên. Swift selected nav soft.
- Thông báo provider mô phỏng chuyển thành help/tooltip ở nhãn preview sidebar;
  model picker và About vẫn thể hiện phạm vi mô phỏng.
- Màu Qt Graphite light/dark sinh một chiều từ `tokens.css`, resolve alias và
  chuyển rgba CSS thành ARGB Qt. Không thêm bảng literal màu thứ hai. Swift vẫn
  dùng typography/material hệ thống. Đây là mở rộng adapter resources hiện có,
  chưa triển khai hệ preset đa nền tảng hoặc Liquid Glass cho Qt.

## Quan sát và kiểm chứng

Ảnh thực tế trong [evidence/foundation-12](evidence/foundation-12/):
`qt-before.png`, `qt-light.png` (source cuối), `qt-history.png` (source cuối),
`qt-dark.png` (trước tinh chỉnh cuối alignment/history/text accent),
`swift-toolbar.png`. Qt sáng/tối được quan sát trực tiếp; đã khôi phục mode
System như trước khi kiểm tra. Không sửa bản nháp cũ hoặc gọi AI.
Thử kéo resize qua CUA không thay kích thước nên không tính là compact visual PASS.
Swift ảnh cửa sổ lớn xác nhận nhãn toolbar; không dùng nó để nhận toàn bộ matrix.

- Qt build/CTest: 91 PASS, 0 fail/skip (89 scenarios + init/cleanup), có locale/
  width/keyboard/focus/IME regression từ các lượt trước.
- Swift build/package/tests: 31 executed PASS, không skip; 144 layout renders và
  48 failure renders ở `/tmp/viezan-visual12-matrix` và `/tmp/viezan-visual12-failures`.
  Offscreen render không chứng minh vật liệu thật hoặc native toolbar.
- Node contracts: 10 PASS. Resource freshness: 3 locales/24 metrics PASS.
- Atomic/Design, Biome generator, docs tests (13): PASS.
- Electron build/TS/web/full Vitest NOT RUN: không đổi Electron/React source.
  Windows/Linux host và release NOT RUN: lượt này là UI preview trên macOS.

## Còn phải khép để đạt thiết kế

Đây là bước triển khai visual, **chưa khớp đầy đủ Review 18**. Cần tiếp tục
window/chrome/material fidelity của Swift, typography/density, empty state và
mức hoàn thiện panel; kiểm tra cửa sổ thật ở các width/locale/text sizes.
Danh sách module đầy đủ trong bản thiết kế thuộc các giai đoạn kế tiếp, không
thêm route giả chỉ để giống ảnh. Native Chat/Translation vẫn là lát cắt mô phỏng.
Manual IME/VoiceOver vẫn ghi riêng; không lấy test pass làm visual acceptance.
