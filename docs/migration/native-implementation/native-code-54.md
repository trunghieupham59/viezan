# Native code 54 — Vai trò màu, Module theo nhóm, panel Phiên này, So sánh chuẩn (2026-11-02)

Đợt 6 của hướng Quiet Workbench ([direction.md](../../design/direction.md)). Phạm vi SwiftUI/macOS;
Qt không đổi. Chạy thật bản ký `.native-build/ux-10/Viezan.app` 1400×860; ảnh ở `evidence/native-polish-54/`.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Vai trò màu | `generate-resources.mjs` sinh thêm `success` và `warning` từ `--vzn-success` / `--vzn-warning` theo chế độ (như `danger`). Toàn bộ `ViezanNative` không còn `Color(nsColor: .systemRed/.systemGreen/.systemOrange/.controlBackgroundColor/.textBackgroundColor)`, `Color.accentColor` hay `.foregroundStyle(.red)`: đỏ → `danger`, xanh lá → `success`, cam → `warning`, nhấn → `action`/`action-text`, nền chọn → `action-soft`, nền ô → `surface`/`surface-muted`, chấm nghỉ → `text-soft`. `StatusDot` đọc đủ bốn vai trò. Các struct thiếu `colorScheme` được thêm biến môi trường. |
| Cài đặt › Module | Hai thẻ theo spec: "Không gian làm việc" (AI Chat, Dịch, Phiên dịch, Từ điển, Nhiệt độ & quạt, Ứng dụng) và "Hệ thống" (Launcher, Tiện ích Chrome); mỗi hàng có mô tả (từ catalog `command_palette_*_description`, `settings_modules_*_desc`; Ứng dụng có chuỗi mới). Domain: `WorkbenchStore.workspaceModules/systemModules/lockedModule`; `setModule` từ chối tắt module không gian làm việc cuối cùng, công tắc đó bị khoá và hàng hiện "Luôn giữ ít nhất một module…". |
| Phiên dịch · Phiên này | Khi bề rộng ≥ `reading + sidebar`, cột 236 pt bên bản ghi theo Review 18: thẻ "Phiên này" (thời điểm, "{n} người nói · {m} câu", Thời lượng · số từ, cặp ngôn ngữ · model, danh sách người nói với số câu, nút "Tổng hợp nội dung" primary), thẻ "Bản ghi của bạn" (TXT / SRT), nút "Các phiên trước" mở popover Lịch sử. Hẹp hơn thì ẩn cột; header vẫn đủ hành động. |
| So sánh mô hình | `ComparisonPane` viết lại theo bộ thành phần: tiêu đề + tiến độ "{done}/{total} xong", ô lọc model cùng kiểu ô Từ điển, nút So sánh primary, `FilterTabs` Theo cột / Theo câu (lưu `Workspace.compareBySentence`, store `compareBySentence`), mỗi model một thẻ `cardSurface` với trạng thái, cảnh báo nguồn đổi (`warning`), hành động Chọn/Dừng/Thử lại/Sao chép; bản dịch ghép trong thẻ. `PromptLibrary` dùng nút outline. |
| Chuỗi | `moduleDesc_*`, `modulesWorkspaceGroup`, `modulesSystemGroup`, `modulesLastHint`, `modulesDescription` ánh xạ từ catalog; 12 khoá mới VI/EN/JA (Ứng dụng, Phiên này, số người nói/câu/từ, Bản ghi của bạn, Các phiên trước, tiến độ so sánh, Theo cột, Lọc model). |
| Test | Domain `theLastWorkspaceModuleStaysOnAndSentenceComparisonIsRemembered`. |

## Chạy thật (macOS)

- Phiên dịch 1400: cột "Phiên này" với "1 người nói · 2 câu", "Thời lượng: 00:21 · 30 từ", cặp và model,
  Speaker 1 · 2 câu, Tổng hợp nội dung; thẻ Bản ghi của bạn TXT/SRT; Các phiên trước (`interpret.jpg`).
- Cài đặt › Module: hai thẻ, mô tả từng hàng, công tắc (`modules.jpg`); khoá module cuối chỉ có unit test.
- Dịch › So sánh: popover với ô lọc, danh sách model Claude, nút So sánh (tắt vì mới chọn một model),
  tab Theo cột đang chọn (`compare.jpg`). Chưa chạy so sánh thật (tốn gọi API).
- Chưa chạy thật: cột Phiên này ở 820 (ẩn theo bề rộng), màu `success`/`warning` ở chế độ tối.

## Kiểm tra

`swift build` PASS; `swift test` 33 + 46 PASS; `grep` literal màu SwiftUI trong `ViezanNative` = 0 (còn hai
`NSColor.controlBackgroundColor` trong lớp vẽ AppKit của `ShellToolbarButton`, cùng nhóm với `NSColor.systemRed`
ở đó: vật liệu nút header của hệ thống, có chủ đích);
`documentation.mjs`, `generate-resources --check` (3 locale, 42 metric), `validate-viezanagent` (246 ref),
`domain.test.mjs` 11 — PASS.

## Còn lại

- Literal số: `* 2`/`* 3`/`0.22`/`/ 110` ở `BridgeSettings`, `InterpretationWorkspace`, `Launcher`, `ThermalWorkspace`.
- So sánh: diff theo từ giữa các cột và tab ở bề rộng hẹp; đo hiệu năng model local; bước nghiên cứu chi
  tiết của Chat.
