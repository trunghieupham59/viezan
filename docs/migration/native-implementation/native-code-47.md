# Native code 47 — Đồng bộ Qt (2026-10-28)

Đưa các thay đổi UI/UX của native-code-44/45/46 sang bản Qt (Windows/Linux). QA chạy app Qt trên Mac
(`evidence/native-qt-47/`); Windows/Linux thật chưa chạy.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Nhiệt độ | `ThermalSensors.h`: phân loại cảm biến hwmon theo chip/kênh và gộp hàng theo nhóm CPU/GPU/khác (tên `thermal_label_*`, số cảm biến, trung bình, nóng nhất trước, cảm biến chưa nhận diện giữ tên driver); `ThermalMonitor.rows`; trang hiện nhóm, hàng gộp, tooltip thành viên, nóng ≥ 90 °C màu danger theme; ô nóng nhất tên + nguồn; "Quạt {n}" |
| Cài đặt | Model AI local: thẻ "Dịch vụ AI cục bộ" (trạng thái từ discovery, nút tải Ollama), "Cấu hình runtime", "Model đã tải"; Tiện ích Chrome: thẻ, hàng máy chủ có "Đã bật"/"Đã dừng", thời hạn 7/30/90/365, mô tả chỉ ở phụ đề (hộp thoại Dịch mọi nơi vẫn giữ); Dữ liệu: thẻ, bỏ mô tả lặp; Cập nhật, Giới thiệu: phiên bản, mã nguồn. `Kit.StatusBadge` có kiểu `idle` |
| Launcher | `Launcher.qml` cửa sổ riêng thay panel cũ: không viền, rộng 760, cách đỉnh 22%, ẩn khi mất focus; nhóm Máy tính/Tiền tệ/Gần đây/Ứng dụng/Tệp/"Dùng … với" (Hỏi AI, Dịch, Tra từ điển, Google); phím ↑↓ ↵ Shift+↵ Ctrl/⌘+↵ Tab Esc; chọn theo id; footer gợi ý. `LauncherTools::rank` + ứng dụng gần đây (QSettings). Dịch/Tra từ điển mở trang chính và gửi ngay; Hỏi AI mở Chat nhanh đã gửi |

## Chạy trên Mac (app Qt)

- Cài đặt: trước — mô tả lặp, form rời, ô số thời hạn, không phiên bản; sau — đúng như bảng trên, phiên bản 2.4.2.
- Launcher: "12*7+3" → nhóm Máy tính "= 87"; "good evening" → nhóm "Dùng … với", ↓ chọn Dịch, ↵ mở trang Dịch với
  câu đã gửi (app Qt trên máy này chưa có AI dùng được nên hiện thông báo thiếu AI đúng như thiết kế).
- Nhiệt độ: Qt trên Mac không có backend (trang hiện trạng thái chưa xác minh như trước) — hàng gộp chỉ được test đơn vị.
- Ứng dụng: trang Qt dành cho trình gỡ cài đặt Windows/`.desktop` Linux; trên Mac hiện trạng thái trống đúng.
  Các sửa đổi macOS (symlink, Thùng rác, Hoàn tác) không áp dụng.

## Kiểm tra

Qt 104/104 (thêm phân loại hwmon, xếp hạng launcher); `swift test` 31 + 38; domain 11; `generate-resources --check`;
`documentation.mjs`.
