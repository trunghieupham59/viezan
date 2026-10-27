# Native workbench — thiết kế để nghiệm thu

Đề xuất mới, không ghi đè spec của Electron. Hiện trạng tiếp tục theo
../design/screens/ và src/styles/tokens.css. Các hành vi native dưới đây là đề xuất cần triển khai, không phải tính năng đã có.
Review 18 là bản prototype hiện tại; quyết định lịch sử thay thế các bản thử cũ.

## Mô hình thông tin

Ba cấp rõ ràng: module -> phiên làm việc -> tác vụ đang chạy. Điều hướng chính
không trộn với lịch sử Chat. Giữ trạng thái thu gọn độc lập, 60/236 theo token hiện
có; dưới 900 primary rail, context là overlay tạm thời. Context overlay và activity
overlay không cùng mở. Không đổi preference đã lưu vì resize.

- Trái: Chat, Dịch, Phiên dịch, Từ điển; nhóm Hệ thống/tiện ích tách riêng.
- Giữa: nội dung tác vụ tập trung, reading column có giới hạn.
- Header tính năng: một tiêu đề ngữ cảnh; nhóm Lịch sử + Tạo mới ở phía phải,
  cạnh Hoạt động. Tính năng nào cũng giữ cùng vị trí, thứ tự và kích thước control.
- Lịch sử mở popover không modal để tìm/mở nhanh; chỉ “Xem tất cả lịch sử” mới
  vào thư viện riêng có xem trước. Quay lại giữ nguyên phiên và bản nháp.
  Ở khung hẹp, nhãn có thể ẩn nhưng accessible name và tooltip phải còn.
- Activity panel: người dùng chủ động mở; running/queued/failed/completed,
  mở đúng phiên nguồn, hủy/thử lại từng việc. Không lặp lại toàn bộ navigation.
- Không có dải tab/phiên đang mở. Chuyển việc qua điều hướng, lịch sử hoặc
  Hoạt động; cả ba đều tham chiếu session ID. Xóa dữ liệu chỉ trong quản lý lịch sử.

## Chất lượng hình ảnh

Canvas trung tính, hierarchy rõ, khoảng trắng phục vụ nội dung, viền nhẹ; không
biến app thành dashboard KPI/hero marketing. Một accent cho active/create/send,
red cho stop/delete/error. Tối đa một hành động primary solid trong mỗi vùng.
Không tô mọi module một màu, không lạm dụng glass/gradient/bóng.

Token của Electron vẫn là nguồn giá trị hiện tại. Figma map về tên --vzn-*.
Native sử dụng semantic roles tương ứng, system typography và control metrics;
không copy px của browser thành kích thước cứng trên mọi OS. Nếu xây bộ token
đa nền tảng, cần ADR và generator một chiều, không giữ nhiều bảng literal thủ công.
Figma font fallback phải ghi rõ, không tuyên bố pixel parity với font hệ thống.

## Hành vi bắt buộc

Một composer duy nhất ở Chat; không khung lồng khung, không Clear/Delete trong
canvas hội thoại. Giữ provider/model ID theo từng phiên, loading/error/retry.
Điều hướng không hủy stream, không mất draft hoặc tự đổi model.
Streaming chỉ tự cuộn khi người dùng đang ở cuối; có nút về cuối nếu đọc lịch sử.
Giữ selection khi stream; IME composition không gửi bằng Enter. Escape đóng
popover trước, không tự hủy một tác vụ khác. Shortcut theo OS, có menu hiển thị.
Focus quay về control mở overlay. Cảnh báo field nằm tại field; lỗi tác vụ có
thông báo rõ và thao tác khôi phục. Không dựa vào màu để biểu diễn trạng thái.

## Nội dung và trạng thái

VI là copy gốc, EN/JA tương đương; không ghép câu. Test text dài, CJK và text scale.
Thiết kế cần empty, drafting, streaming, cancelled, failed, retry, interrupted,
missing key, offline/local model unavailable. Multi-task mẫu chỉ dùng dữ liệu giả.
State phức tạp được nghiệm thu bằng runtime test; Figma chỉ minh họa luồng.

## Bộ màn hình review đầu tiên

1. Mac light: Chat + lịch sử nhanh + activity panel (hai panel loại trừ nhau).
2. Mac dark: Dịch hai cột + tác vụ Chat chạy nền.
3. Windows light: cùng cấu trúc nhưng window chrome/shortcut phù hợp.
4. Linux light: Qt workbench, không gắn giả nhãn đã hỗ trợ GNOME/KDE.
5. Compact 820: rail và một nội dung, activity overlay theo yêu cầu.
6. Failure/retry: lỗi một tác vụ không khóa việc còn lại.

Nghiệm thu luồng: Chat -> Dịch -> mở hoạt động -> mở lại Chat -> xem lỗi/thử lại.
Chỉ các hotspot có nối được xem là prototype; các control khác là mẫu tĩnh.

## Bàn giao hiện tại

Xem [Review 18 handoff](review18-handoff.md) cho phạm vi sửa, mapping native,
kiểm thử đã quan sát và các cổng nghiệm thu chưa hoàn thành.

## Native foundation panel follow-up — 2026-10-27

Native preview panels use shared control hit areas and localized close labels.
Activity keeps its header outside task scrolling. Quick-history snippets stay
on one line; full history retains the separate reading preview. Qt selected
row text reads the owning control palette. See
[native evidence](native-implementation/foundation-08.md). These changes do not
change the released Electron shell contract.

Native foundation keyboard follow-up (2026-10-27): searchable panels retain the
platform focus ring. The submit shortcut only submits; pressing it during an
active task does not become Stop. Cancellation remains an explicit Stop action.
See [Foundation 09](native-implementation/foundation-09.md).

Foundation navigation selection follows the current route; activating the current
item again does not clear its selection (Foundation 10, 2026-10-27).

Foundation 11: Return/keypad Enter share submission and IME policy. Named
accessibility groups identify panels; keyboard transitions from command search
to Activity focus its close control after the outgoing field editor completes.

Foundation editor parity: Chat and Translation use the same composition-safe
input path. Undo/Redo remains local to the active editor and resets on session
change; drafts persist independently. Swift Edit menu and shortcuts target that
editor undo manager. This prevents undo from injecting a previous session draft.
