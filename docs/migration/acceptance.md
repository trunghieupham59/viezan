# Ma trận nghiệm thu

Trạng thái khởi tạo: native runtime **Not run**. Prototype không thay thế test.
Mỗi dòng ghi: OS/version, build SHA, viewport/DPI/text scale/locale, bước làm,
expected, actual, PASS/FAIL/NOT RUN/BLOCKED, artifact và người review.

| ID | Kịch bản | Kết quả bắt buộc |
| --- | --- | --- |
| UX01 | Gửi Chat A, sang Dịch B, quay lại A | Không mất draft, kết quả đúng phiên |
| UX02 | Đổi provider/model khi A đang stream | Attempt cũ giữ snapshot; phiên khác không bị sửa |
| UX03 | Hủy A khi B đang chạy; retry A | B không gián đoạn; không trùng output A |
| UX04 | Đọc phía trên khi stream; chọn/copy text | Không giật cuộn, không mất selection |
| UX05 | Chuyển phiên/đóng cửa sổ; Quit/relaunch | Hành vi theo OS; draft phục hồi, không tự gọi AI |
| UX06 | Offline, sai key, rate limit, local model mất | Lỗi cụ thể, retry có chủ đích, UI không khóa |
| UX07 | Tab/Shift-Tab/Escape, VI/JA IME | Focus thấy rõ, không gửi khi composition |
| UX08 | 1440x900, 1200x800, 820x900, 640x600 | Không horizontal page scroll hoặc mất action |
| UX09 | Light/dark, VI/EN/JA, text 100/125/150% | Không clip; tên control phù hợp label |
| UX10 | Screen reader theo OS | Tên/role/state đúng; không đọc từng token |
| DATA01 | Import dry-run, thực thi, chạy lại | Counts/checksum hợp lệ; không duplicate |
| DATA02 | Import lỗi giữa chừng và rollback | Bản gốc nguyên; không half-import |
| SEC01 | Scan UI state/log/export/fixtures | Không raw key hoặc dữ liệu người dùng thật |
| OS01 | Sleep/wake, permission revoke, đổi audio | Phục hồi có chủ đích; indicator chính xác |
| OS02 | Windows DPI; Linux GNOME/KDE Wayland | Ghi actual per environment; không suy từ Mac |
| PERF01 | Cold start/idle/long chat/concurrent jobs | Đo cùng fixture/hardware, report median/p95 |

## Cổng nghiệm thu

- Design: prototype bằng code có thể chỉnh sửa (Figma tùy chọn), không clipping,
  luồng tương tác được nối, review của user pending. Desktop Review 18 là bản
  đang review macOS/Windows/Linux; xem `review18-handoff.md` cho bằng chứng và
  giới hạn. Fable 5.1 chưa review thành công do lỗi xác thực. Mobile để giai đoạn sau.
- Prototype: chỉ xác nhận thao tác mô phỏng; không xác nhận network/persistence.
- Runtime: task isolation/cancel/recovery tests + bằng chứng chạy thực tế từng OS.
- Release: migration/rollback, signed package/update, compatibility và docs đã kiểm tra.

Performance budget được chốt sau baseline, trước rollout. Không tự phát minh số đo
hoặc ghi PASS khi chưa chạy. Screenshot chứng minh bố cục; log/test chứng minh
state; user review mới là chấp nhận thiết kế.
