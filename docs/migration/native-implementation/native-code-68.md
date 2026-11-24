# Native code 68 — Launcher tiền tố lệnh, tóm tắt bản cập nhật, trạng thái Nhiệt độ (2026-11-24)

Các story nhỏ trên macOS, tiếp tục theo kịp những gì bản Qt đã làm theo board. Chỉ kiểm ở mức code.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| `ViezanNative/Launcher.swift` | `LauncherPrefix`: gõ "t …", "d …", "? …" hiện một hàng ở nhóm Gợi ý mở thẳng Dịch, Từ điển hoặc Hỏi AI (dùng `PaletteQuery` sẵn có của bảng lệnh; module tắt thì không hiện). Chân Launcher khi chưa gõ ghi gợi ý tiền tố (`launcher_prefix_hint`). Nhãn "Đổi sang: JPY" dùng chuỗi có tham số `launcher_currency_target_named` (cả Qt). |
| `ViezanNative/UpdateSettings.swift` | Hộp cập nhật (Glass), trước khi tải: "Viezan 2.6.0 · 48 MB · bạn đang dùng 2.5.2" (`UpdateSummary`, `updateSheetSummary` / `updateSheetSummaryNoSize`). |
| `ViezanNative/Workspaces.swift` | Từ điển (Glass): ⌘⇧C bật / tắt ô ngữ cảnh qua chính nút ngữ cảnh. Bật thì con trỏ vào ô ngữ cảnh; tắt thì về ô từ. Ngữ cảnh đang có chữ vẫn hiện, không mất gì. Nút ✕ mang tên "Bỏ ngữ cảnh" (`dictionaryRemoveContext`) và trả focus về ô từ. Ghi chú thiết kế về sau khớp với cách làm này. |
| `ViezanNative/ThermalWorkspace.swift` | Dải lỗi có nút "Thử lại" khi bộ đọc cảm biến đã dừng; huy hiệu helper dùng tông cảnh báo khi chờ phê duyệt (`ThermalStatus.helperTone`); khi bộ đọc đang chạy mà chưa có số đo đầu tiên, trạng thái trống ghi "Đang đọc cảm biến…" thay cho "Chưa có dữ liệu cảm biến". |

## Review độc lập (Antigravity, chỉ đọc)

Đã sửa: trong hộp đổi tên Lịch sử, Delete / Return / mũi tên không còn tác động vào danh sách phía sau (lỗi có sẵn),
Esc đóng hộp; dòng tóm tắt cập nhật không che thông báo lỗi và lấy dung lượng cả khi chỉ có lời nhắc; "= 2+2" tính được
(chân Launcher có dạy tiền tố này); truy vấn có tiền tố không lặp lại ở nhóm "Dùng với"; đổi hàng thì xoá lỗi mở nên
Thử lại không chạy nhầm hàng khác; Thử lại ở Nhiệt độ chỉ hiện cho lỗi của bộ đọc cảm biến.

Không làm: cho gõ ngữ cảnh quá 500 ký tự rồi báo lỗi (store hiện bỏ qua lần ghi đó; hành vi dùng chung với Qt, là
quyết định riêng); chuyển ⌘⇧C vào menu Lệnh; chờ tiến trình đọc cũ thoát hẳn trước khi chạy lại; gợi ý "bỏ bộ lọc Lưu
trữ" khi không lọc lưu trữ (giống Qt).

Làm thêm ở sprint kế: hộp xác nhận kiểu cũ (không Glass) cũng nêu tên khoá / model bị xoá. Hai chuỗi
`deleteKeyConfirm` và `deleteModelConfirm` không còn nơi nào dùng (cả macOS lẫn Qt); chưa xoá.

Chưa xác minh được ở mức code: ⌘⇧C có trùng "Show Colors" của hệ thống hay không.

## Bổ sung (sprint kế, chỉ trong vùng Chat / Lịch sử / shell)

Các phiên khác của người dùng đang sửa Nhiệt độ, Ứng dụng, đính kèm / OCR, tích hợp desktop và `native/**`; các mục
dưới không đụng những vùng đó.

- Lớp Hoạt động: tiêu đề "Hoạt động · 3 việc" khi có việc (`ActivityTitle`, chuỗi `activityCount` Qt đã dùng), có vai
  trò heading.
- Dải "Đang ghi âm · 00:14": tên trợ năng cố định `recordingDraftHint`, để bộ đếm không bị đọc lại mỗi giây.
- Test: `activityTitleCountsJobsOnlyWhenThereAreSome`.

## Kiểm tra

Test mới: `launcherPrefixRowsFollowTheQueryAndModules`, `updateSummaryNamesVersionSizeAndCurrent`,
`thermalHelperToneWarnsOnlyWhileWaitingForApproval`. Kết quả đủ bộ ghi ở báo cáo sprint.

## Chưa kiểm

Chạy app: ⌘⇧C ở Từ điển (kể cả khi đang gõ tiếng Việt / tiếng Nhật); hàng tiền tố và gợi ý ở chân Launcher; hộp cập nhật khi có bản mới thật; màn Nhiệt độ khi bộ đọc dừng hoặc
helper chờ phê duyệt (cần phần cứng và helper thật).

## Còn lại

- Từ điển: phím tắt chưa có test tự động (chỉ kiểm được khi chạy app); gợi ý `⌘⇧C` dưới ô trống, trạng thái lỗi và "không tìm thấy" theo board (xem SPRINT-DESIGN-NOTES) chưa làm.
- Nhiệt độ: thẻ lỗi có tiêu đề và mô tả riêng, dải cảnh báo khi helper chờ phê duyệt với ba hành động (xem SPRINT-DESIGN-NOTES) chưa làm; cần phần cứng và helper thật để kiểm.
- Launcher: `launcher_apps_unavailable`.
