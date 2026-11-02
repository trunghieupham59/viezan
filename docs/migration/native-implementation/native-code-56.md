# Native code 56 — Dải chạy nền, huy hiệu khoá, bảng lệnh mở rộng, meta câu trả lời (2026-11-02)

Đợt 8 của hướng Quiet Workbench ([direction.md](../../design/direction.md)). Phạm vi SwiftUI/macOS;
Qt không đổi. Chạy thật bản ký `.native-build/ux-12/Viezan.app` 1400×860; ảnh ở `evidence/native-shell-56/`.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Sidebar · Đang chạy nền | `NativeNavigation.backgroundStrip` theo spec shell §4.1 #5–#8: nhóm "ĐANG CHẠY NỀN" ghim đáy với hàng "Quạt · {profile}" / "Quạt · tuỳ chỉnh" (khi `thermalMonitor.controlling`), "Phím tắt toàn cục · n" (số phím đang bật), "Tiện ích Chrome" (bridge đang nghe); bấm mở trang tương ứng. Ở rail: một chấm có tooltip liệt kê. Ẩn khi không có gì chạy. |
| Sidebar · Chưa có key | Hàng Cài đặt có chấm đỏ + "Chưa có key" khi model đang chọn thuộc nhà cung cấp đám mây chưa có khoá (`providers.availability == .missingKey`); rail chỉ còn chấm; accessible name "Cài đặt: Chưa có key". |
| Bảng lệnh ⌘K | `PaletteQuery.parse`: biểu thức số → hàng "= {kết quả} · Sao chép kết quả" (↵ chép và đóng); `?`/`??` → "Hỏi AI: “…”"; `t ` → "Dịch “…”"; `d ` → "Tra cứu “…”". Các hàng này tạo phiên mới của tính năng, gửi ngay và mở trang. Hàng lệnh trang theo sau; khi có hàng đặc biệt, lệnh trang không bị lọc theo chữ gõ. |
| Chat · meta | Dưới mỗi câu trả lời, sau Sao chép/Tạo lại: "Claude · claude-haiku-5-5 · {n} token" (model đã trả lời và tổng token khi có). |
| Thanh menu | Menu Nhiệt độ có "Mở Nhiệt độ & quạt" (mở cửa sổ và route) và công tắc "Hiện nhiệt độ trên thanh menu" (`Workspace.menuBarTemperature`, nil = hiện). |
| Thư viện lịch sử | Công tắc Yêu thích / Phiên đã lưu trữ thành `FilterTabs` (Tra cứu gần đây / Từ đã lưu; Lịch sử / Phiên đã lưu trữ). |
| Toast | Thời lượng 6 s thành token `--vzn-native-toast-seconds` → `metric("toastSeconds")`. |
| Chuỗi | 8 khoá mới VI/EN/JA; `backgroundRunning`, `fansProfile`, `fansCustom` ánh xạ từ catalog. |
| Test | Native `paletteQueryReadsSumsPrefixesAndQuestions`. |

## Chạy thật (macOS)

- Sidebar mở rộng: nhóm "ĐANG CHẠY NỀN · Phím tắt toàn cục · 1" (Dịch vùng chọn đang bật) trên chân
  "Lưu trên thiết bị" (`sidebar-background.jpg`).
- ⌘K "12*7+3" → hàng đầu "= 87 · Sao chép kết quả", các trang bên dưới (`palette-calc.jpg`); "t good evening"
  → "Dịch “good evening”" (`palette-translate.jpg`). Không bấm ↵ để không tạo phiên/tốn API.
- Chưa chạy thật: huy hiệu Chưa có key (máy có khoá), hàng Quạt (helper chưa cài), hàng Tiện ích Chrome,
  meta token (cần câu trả lời mới), công tắc thanh menu.

## Kiểm tra

`swift build` PASS; `swift test` 34 + 46 PASS; `documentation.mjs`, `generate-resources --check`
(3 locale, 50 metric), `validate-viezanagent` (246 ref), `domain.test.mjs` 11 — PASS.
