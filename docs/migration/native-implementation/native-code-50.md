# Native code 50 — Toast/Hoàn tác dùng chung và Phiên dịch (2026-11-02)

Đợt 2 của hướng Quiet Workbench ([direction.md](../../design/direction.md)). Phạm vi SwiftUI/macOS;
Qt không đổi. Chạy thật bản ký `.native-build/ux-03/Viezan.app` 1400×860; ảnh ở `evidence/native-toasts-50/`.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Toast (shell) | `NativeToasts.swift`: `ToastCenter` (một toast mỗi `key`, tối đa 3, tự đóng sau 6 s, dừng đếm khi rê chuột vào) và `ToastStack` neo góc dưới phải của vùng làm việc, bề rộng `notificationInline` (token `--vzn-notification-max-inline` 400, thêm vào `generate-resources.mjs`). Thẻ toast dùng `ReadingPanelSurface`, chữ `labelScale`, nút hành động `vznOutline` màu `action-text`, nút ✕ `vznQuiet`; lỗi có chấm đỏ. |
| Hoàn tác | Thư viện lịch sử: Lưu trữ/Khôi phục chạy ngay và toast "Đã lưu trữ: {tiêu đề} · Hoàn tác". Phiên dịch: nút Xoá trong popover Lịch sử xoá ngay phiên đang chọn/đang tô, toast "Đã xoá phiên dịch · Hoàn tác" gọi `Interpretation.restoreSession` (domain mới, chèn lại đúng vị trí theo `created`, chọn lại phiên). Bỏ hộp xác nhận xoá. |
| Lỗi tác vụ → toast | Xuất phiên lịch sử, xoá vĩnh viễn thất bại, xuất bản ghi phiên dịch, kết quả/lỗi của Dọn lịch sử, Xuất/Nhập sao lưu, lỗi Khởi động khi đăng nhập. Bỏ các `.alert` và dòng "Hoàn tất" nội tuyến tương ứng. |
| Phiên dịch · đồng hồ | Khi đang nghe, huy hiệu đọc "Đang nghe · mm:ss" (`listeningFor`, `TimelineView` mỗi giây, tính từ `created` của phiên). |
| Phiên dịch · model | Chip model là `Menu` với `Picker` theo `store.availableModels` (+ model hiện tại nếu ngoài danh sách) và mục "Tuỳ chọn ghi âm…"; bỏ ô chữ model ID thô trong popover. |
| Phiên dịch · cuộn | `ScrollViewReader`: theo dòng mới khi đang ở cuối; cuộn lên thì dừng theo và hiện nút "Xem mới nhất" (`live_jump_latest`) ở đáy khi đang nghe/xử lý; đổi phiên thì theo lại. |
| Phiên dịch · thiết bị | `InterpretationSession.deviceID` (tuỳ chọn, tương thích dữ liệu cũ) lưu khi bắt đầu và khôi phục khi mở lại phiên. |
| Phiên dịch · phụ đề | Cửa sổ phụ đề neo giữa đáy màn hình chính (cách `inset`); đóng bằng nút của chính nó thì tham chiếu được xoá (`NSWindow.willCloseNotification`), lần bật sau mở cửa sổ mới. |
| Phiên dịch · xuất | SRT dùng `UTType(filenameExtension: "srt")`. Lỗi label dùng `contentColor("danger")`. |
| Chuỗi | 7 khoá mới VI/EN/JA (`sessionArchived`, `sessionRestored`, `interpretationDeleted`, `listeningFor`, `notifications`, `recordingOptions`, `exportFailed`); ánh xạ `undo`, `chatDeleted`, `translationDeleted`, `jumpToLatest` từ catalog cũ. |
| Test | `toastCenterReplacesSameKeyAndRunsUndoOnce` (ViezanNativeTests). |

## Chạy thật (macOS)

- Phiên dịch › Lịch sử › Xoá: phiên biến mất ngay, header chuyển sang phiên kế, toast ở góc dưới phải
  (`toast.jpg`). Bấm Hoàn tác trong 2 s: kho `interpretation.json` được ghi lại và **giống hệt bản sao lưu**
  (cùng id, thứ tự, nội dung), header về phiên đã khôi phục.
- **Sự cố QA:** lần thử đầu bấm Hoàn tác sau hơn 6 s, toast đã tự đóng nên phiên QA 13:50 28/10
  (dữ liệu thử nghiệm của đợt native-code-39) bị xoá thật, không khôi phục được. Không có dữ liệu người
  dùng thật bị ảnh hưởng; các phiên còn lại đã được sao lưu trước lần thử thứ hai.
- Chưa chạy thật: đồng hồ và "Xem mới nhất" khi đang ghi âm (không bật micro trong phiên tự động); toast
  Lưu trữ ở thư viện lịch sử; lỗi sao lưu/login item (cần tình huống lỗi thật); cửa sổ phụ đề neo đáy.

## Kiểm tra

`swift build` PASS; `swift test`: 32 (domain) + 42 (native, gồm test toast) PASS; `documentation.mjs`,
`generate-resources --check` (3 locale, 42 metric), `validate-viezanagent` (36 json, 246 ref), `domain.test.mjs` 11 — tất cả PASS.

## Còn lại

- Thời lượng toast 6 s là hằng trong `ToastCenter` (tokens.css chưa có thời lượng thông báo).
- Popover Lịch sử của Phiên dịch vẫn là popover hệ thống với nút Xoá mặc định; chưa theo lớp nổi đục
  `ReadingPanelSurface` như Lịch sử của Chat/Dịch.
- Phiên dịch: tiêu đề phiên, panel "Phiên này", hộp tóm tắt có tab, xoá/sao chép từng dòng, 17 literal
  màu còn sót (xem native-code-49 mục 6).
