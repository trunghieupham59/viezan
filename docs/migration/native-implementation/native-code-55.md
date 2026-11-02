# Native code 55 — Bước nghiên cứu, diff So sánh, kế hoạch Ứng dụng theo nhóm, tỷ lệ bố cục thành token (2026-11-02)

Đợt 7 của hướng Quiet Workbench ([direction.md](../../design/direction.md)). Phạm vi SwiftUI/macOS;
Qt không đổi. Chạy thật bản ký `.native-build/ux-11/Viezan.app` 1400×860; ảnh ở `evidence/native-detail-55/`.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Chat · nghiên cứu | `ResearchPanel.swift` thay dòng trạng thái một pha: hàng đầu giữ pha hiện tại, tiến độ "{cursor}/{queries}", số nguồn và chevron; mở ra có sáu pha (`analyze → survey → cross → gap → synth → done`) với chấm trạng thái, "Vòng {n}", danh sách truy vấn đánh dấu đã chạy, nguồn đánh số `[n]` là `Link` (tiêu đề + host), phát hiện (tối đa 3 dòng mỗi mục). Chỉ đọc `task.research`, không gọi provider. |
| So sánh · diff | `ComparisonPane.highlighted(_:against:)`: từ nào ở cột khác không xuất hiện trong cột đầu (bỏ dấu câu, không xét thứ tự) được tô `action-soft` qua `AttributedString.backgroundColor`, cả ở chế độ cột và theo câu (so từng câu). Dòng gợi ý "Phần khác với cột đầu được tô nhẹ." khi có từ hai cột. |
| Ứng dụng · kế hoạch | Mục trong kế hoạch nhóm theo loại (Ứng dụng / Tuỳ chọn / Dữ liệu liên quan) với tiêu đề eyebrow, số mục và tổng dung lượng; mỗi mục ghi dung lượng (hoặc "Chưa đo được") · bằng chứng ("Khớp bundle ID" / "Khớp tên hãng"); Hiện trong Finder là nút quiet. |
| Tỷ lệ bố cục | `tokens.css` thêm `--vzn-native-launcher-top-fraction` (0,22), `-launcher-height-fraction` (0,71), `-launcher-results-fraction` (0,5), `-skeleton-short-fraction` (0,4), `-quick-card-fraction` (0,6), `-inventory-fraction` (0,45), `-thermal-scale-max` (110). `generate-resources.mjs` đọc giá trị không đơn vị (`ratio`) → 49 metric. `Launcher`, `LauncherChat`, `QuickTranslate`, `ApplicationsWorkspace`, `ThermalWorkspace` đọc qua `metric()`; không còn literal tỷ lệ trong view. |
| Chuỗi | 11 khoá mới VI/EN/JA (các bước/truy vấn/phát hiện/vòng nghiên cứu, gợi ý diff, loại và bằng chứng dữ liệu ứng dụng, Chưa đo được). |

## Chạy thật (macOS)

- Ứng dụng › AdGuard › Xem trước thay đổi (chỉ đọc, không áp dụng): ba nhóm "ỨNG DỤNG 1 · 261 MB",
  "TUỲ CHỌN 2 · 217 KB", "DỮ LIỆU LIÊN QUAN 9 · 15,4 MB"; mỗi mục có dung lượng · bằng chứng; mục được bảo vệ mờ
  với lý do (`apps-plan.jpg`). Đã đóng kế hoạch, không bấm "Chuyển mục đã chọn vào Thùng rác".
- Không chạy thật: panel nghiên cứu và diff So sánh (cần gọi API nghiên cứu web / so sánh model, tốn phí);
  vị trí Launcher sau khi đổi sang token (giá trị không đổi).

## Kiểm tra

`swift build` PASS; `swift test` 33 + 46 PASS; `grep` literal tỷ lệ trong `ViezanNative` = 0;
`documentation.mjs`, `generate-resources --check` (3 locale, 49 metric), `validate-viezanagent` (246 ref),
`domain.test.mjs` 11 — PASS.

## Còn lại

- Đo hiệu năng model local (cần Ollama trên máy để chạy thật); tab So sánh ở bề rộng hẹp.
- Panel nghiên cứu: "Tiếp tục" riêng cho nghiên cứu bị gián đoạn (hiện dùng Thử lại chung).
