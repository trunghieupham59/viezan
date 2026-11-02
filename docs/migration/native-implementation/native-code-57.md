# Native code 57 — Tổng hợp theo tab, lịch sử Phiên dịch, bảng hiệu năng local (2026-11-02)

Đợt 9 (đợt cuối của loạt 2026-11-02) theo hướng Quiet Workbench ([direction.md](../../design/direction.md)).
Phạm vi SwiftUI/macOS; Qt không đổi. Chạy thật bản ký `.native-build/ux-13/Viezan.app`; ảnh ở
`evidence/native-interpret-57/`.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Phiên dịch · Tổng hợp | Bốn nhóm mở rộng rời (Tóm tắt, Việc cần làm, Quyết định, Phân tích người nói) thành một thẻ "Tổng hợp" dưới bản ghi với `FilterTabs` chọn loại, Sao chép (đổi nhãn "Đã sao chép"), "Tạo lại phản hồi" chạy lại đúng loại đang xem; khi đang tổng hợp hiện trạng thái và Huỷ. Thẻ chỉ xuất hiện khi có nội dung hoặc đang chạy. |
| Phiên dịch · Lịch sử | Mỗi hàng ghi cặp ngôn ngữ · số câu và có nút xoá riêng (toast Hoàn tác như trước); nút Xoá dưới cùng vẫn phục vụ chọn bằng bàn phím. |
| Model AI local · hiệu năng | `LocalPerformance.selectedMode` (kết quả đang dùng, "auto" hoặc "custom"). Kết quả đo thành bảng `Grid`: Chế độ · token/s · Token đầu (ms) · GPU % · Áp dụng; hàng "Tự động theo ngôn ngữ"… đúng hơn là chế độ mặc định runtime; chế độ đang dùng có huy hiệu "Đang dùng" và nút Áp dụng tắt; lỗi đo hiện màu danger. |
| Chuỗi | 8 khoá mới VI/EN/JA. |

## Chạy thật (macOS)

- Phiên dịch › Lịch sử: ba hàng với "Tự động nhận dạng → Tiếng Việt · 2 câu" và biểu tượng xoá
  (`history-rows.jpg`). Không bấm xoá.
- Chưa chạy thật: thẻ Tổng hợp (không phiên nào có tóm tắt; tạo mới cần gọi API), bảng hiệu năng (không có
  Ollama trên máy).

## Kiểm tra

`swift build` PASS; `swift test` 34 + 46 PASS; `documentation.mjs`, `generate-resources --check`
(3 locale, 50 metric), `validate-viezanagent` (246 ref), `domain.test.mjs` 11 — PASS.

## Khép loạt 2026-11-02

Chín đợt (native-code-49 → 57) đã chốt một hướng thiết kế và nối phần lớn backend–frontend trên SwiftUI.
Còn ngoài phạm vi hoặc cần điều kiện thật: Qt trên Windows/Linux; so sánh model, nghiên cứu web, tổng hợp
phiên dịch và tải model local chạy thật (API hoặc Ollama); VoiceOver, ba cỡ chữ, 640 pt; cài đặt cập nhật tại
chỗ. Danh sách theo màn nằm ở mục "Còn lại" của từng báo cáo.
