# Native code 67 — macOS theo kịp các trạng thái Qt đã có (2026-11-24)

Bản Qt (đợt Windows W1–W5) có một số trạng thái và chuỗi theo board mà macOS chưa dùng. Antigravity đối chiếu code với
board và nêu danh sách; các mục dưới đã được kiểm lại bằng grep trước khi làm. Chỉ kiểm ở mức code.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| `ViezanNative/HistoryViews.swift` | Thư viện Lịch sử (Glass): trạng thái trống theo ngữ cảnh — "Chưa có phiên nào trong lịch sử", "Chưa có phiên nào được lưu trữ", hoặc "Không có kết quả phù hợp" kèm gợi ý khi đang tìm (`HistoryEmptyMessage`). Hộp đổi tên có dòng gợi ý; đổi tên xong có toast "Đã đổi tên phiên" (không hiện khi lưu lỗi). |
| `ViezanNative/ProviderSettings.swift`, `LocalModelSettings.swift` | Hộp xác nhận xoá khoá / xoá model nêu tên và hậu quả (`deleteNamedKeyConfirm`, `deleteNamedModelConfirm`); dòng thông số máy dùng `deviceProcessors` / `deviceMemory` thay chữ "CPU" cứng. |
| `ViezanNative/Workspaces.swift` | Từ điển: nút Tra tắt khi ngữ cảnh quá 500 ký tự (trước đây bấm được nhưng không làm gì vì store từ chối; bộ đếm đỏ đã có sẵn). |
| `ViezanNative/Launcher.swift` | Mở mục thất bại: có nút "Thử lại" cạnh thông báo, chạy lại đúng mục đang chọn. |
| `ViezanNative/LocalModelSettings.swift`, `Workspaces.swift` | Sau review: đọc tốc độ đã đo ngoài luồng chính và đọc lại sau khi bấm Áp dụng; chip nghiên cứu xét chế độ của tác vụ (không phải của phiên); thanh tiến độ tải có giá trị trợ năng. |

## Review độc lập (Antigravity) cho phần tốc độ model và nút Dừng

Đã sửa: đọc đĩa trên luồng chính, không cập nhật sau Áp dụng, dùng chế độ của phiên thay vì của tác vụ, thiếu giá trị
trợ năng. Không làm: đổi nhãn chế độ đo (`gpu`, `hybrid`) sang tên hiển thị và đổi "Chưa đo được" thành "Chưa đo" —
bảng kết quả đo hiện có cũng dùng đúng các nhãn này, đổi một chỗ sẽ lệch chỗ kia; bỏ điều kiện Glass cho chip (chip
"Đang trả lời…" vốn chỉ có ở Glass).

## Kiểm tra

Test mới: `historyEmptyMessageFollowsSearchAndArchiveFilter`, `namedConfirmationsAndDeviceLineKeepTheirPlaceholders`,
`localModelHeadlineIsTheAppliedProfileOrTheFastest`. Kết quả đủ bộ ghi ở báo cáo sprint.

## Chưa kiểm

Chạy app: các trạng thái trống, toast đổi tên, hộp xác nhận, nút Thử lại; VoiceOver; sáng/tối.

## Còn lại (theo đề xuất, chưa làm)

- Từ điển: ⌘⇧C bật ngữ cảnh.
- Nhiệt độ: nút Thử lại khi mất cảm biến, cảnh báo khi helper chờ phê duyệt.
- Launcher: `launcher_apps_unavailable`, gợi ý tiền tố ở chân khi chưa gõ.
- Cập nhật: dòng tóm tắt `updateSheetSummary`.
