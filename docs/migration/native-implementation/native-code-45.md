# Native code 45 — Ứng dụng & Nhiệt độ (2026-10-28)

## Chạy thật trước khi sửa (macOS, v49)

- Nhiệt độ: số đo thật (62 °C, hai quạt ~2 400–2 900 vòng/phút, 212 cảm biến) nhưng bảng cảm biến là
  khoá SMC thô (TCMz, Te02, Tp0Y…); "FAN 1" chưa dịch; thanh trượt và "Áp dụng" hiện dù helper chưa sẵn
  sàng (`evidence/native-system-45/thermal-before-raw-keys.jpg`).
- Ứng dụng: **mọi ứng dụng đều bị khoá** "Không đọc được mọi vị trí" — `/Applications/Safari.app` là
  symlink nên kho luôn bị coi là chưa đầy đủ trên mọi máy macOS hiện đại (`apps-before-all-locked.jpg`).

## Thay đổi (SwiftUI)

| Phần | Thay đổi |
| --- | --- |
| Phân loại cảm biến | `ThermalSensors` (domain): bảng khoá SMC từ bản Electron cũ + chữ cái phân hệ; `rows` gộp theo nhóm/nhãn, nóng nhất trước, hàng chưa nhận diện cuối; `tone` ấm/nóng |
| Trang Nhiệt độ | Hàng gộp có tên dễ đọc, số cảm biến và trung bình, màu ấm/nóng; khoá thô trong mục mở rộng; ô nóng nhất ghi tên + khoá; "Quạt {n}"; thanh trượt chỉ khi helper bật; bộ chọn cảm biến của quy tắc ghi tên + khoá |
| Chuỗi | `generate-resources.mjs` đưa các khoá `thermal_*` sẵn có vào tài nguyên native; 5 khoá mới cho kết quả Ứng dụng; "Reset…" → "Đặt lại dữ liệu đã chọn, giữ ứng dụng" |
| Kho ứng dụng | Symlink `.app` tới bundle hợp lệ → liệt kê "được bảo vệ"; chỉ symlink hỏng làm kho chưa đầy đủ; `inventory(roots:)` để test |
| Trang Ứng dụng | Kết quả + Hoàn tác tại chỗ; "Đã khôi phục"; nút Huỷ bản địa hoá; tổng mục/dung lượng đã chọn; đường dẫn `~/…`; chi tiết theo kết quả lọc |

## Chạy thật sau khi sửa (macOS, v50–v51)

- Nhiệt độ: CPU (Nhân tiết kiệm, Nhân CPU chung, Nhân hiệu năng), GPU, Cảm biến khác (Bề mặt, Bộ
  nhớ…) với số cảm biến và trung bình; "Quạt 1/2"; khối thủ công chỉ còn trạng thái + "Thiết lập helper".
- Ứng dụng: app bên thứ ba không còn khoá, app Apple khoá với lý do "Mục được bảo vệ…". Ứng dụng giả
  riêng: xem trước (bundle + cache chọn sẵn, Application Support không) → xác nhận (Huỷ mặc định) →
  "Đã chuyển 2 mục vào Thùng rác." → Hoàn tác → "Đã khôi phục 2 mục.", tệp về đúng chỗ với nội dung cũ.
  Ứng dụng giả đã được xoá sau QA. Không gỡ ứng dụng thật.

## Chưa làm / chưa chạy

- Qt: trang Nhiệt độ và Ứng dụng chưa đổi (Windows/Linux đọc hwmon/khác nền tảng).
- Helper quạt (đăng ký, áp profile, thanh trượt) chưa chạy thật — cần quyền quản trị.
- Đặt lại dữ liệu (giữ bundle) và trường hợp app đang chạy chưa thử thật.

## Kiểm tra

`swift test` 31 + 38 (thêm phân loại cảm biến, kho ứng dụng với symlink); Qt 102/102; domain 11;
`generate-resources --check`; `documentation.mjs`.
