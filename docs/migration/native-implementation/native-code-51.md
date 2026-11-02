# Native code 51 — Cài đặt: bộ ghi phím tắt, làm mới lượt, nhà cung cấp theo hàng (2026-11-02)

Đợt 3 của hướng Quiet Workbench ([direction.md](../../design/direction.md)). Phạm vi SwiftUI/macOS;
Qt không đổi. Chạy thật bản ký `.native-build/ux-04/Viezan.app` 1400×860; ảnh ở `evidence/native-settings-51/`.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Bộ ghi phím tắt | `DesktopPanels.swift`: `ShortcutRecorderPanel` thay ô chữ "Option+T". Popover mở ở trạng thái ghi ("Bấm phím… (Esc để huỷ)"), một `NSView` nhận `keyDown` và dựng chuỗi `Control+Option+Shift+Command+Key` từ mã phím (`DesktopIntegration.keyName(code:)`); Esc đóng. Hiện KeyCap tổ hợp vừa bấm, nút "Phím tắt" để ghi lại, "Mặc định" (`DesktopIntegration.defaults`), Đóng, Áp dụng. Áp dụng tắt khi trùng phím Viezan khác ("Trùng với {name}"), thiếu ⌘/⌃/⌥ hoặc không đổi. Công tắc bật/tắt dùng phím đã lưu, không còn dùng bản nháp. Mục Launcher & phím tắt trong Cài đặt nằm trong `CardSection(flush:)` như các mục khác. |
| Làm mới lượt đã hoàn tất | Domain: `Workspace.smartReset` (nil = bật) và `featureLeft` (thời điểm rời từng tính năng, kể cả khi thoát app). `WorkbenchStore.navigate` ghi thời điểm rời và gọi `applySmartReset`; `init` gọi lại sau khi nạp. Quy tắc: Dịch sau 2 giờ, Từ điển sau 30 phút (`resetAfter`), chỉ khi lượt đang mở đã có kết quả, không chạy và không bị gián đoạn → mở lượt mới cùng cặp ngôn ngữ và `resetNotice` giữ id lượt cũ. Bản nháp, việc đang chạy không bao giờ bị thay. `reopenPrevious()` bỏ lượt trống và chọn lại lượt cũ; `select`/`newSession` xoá thông báo. `clock` tiêm được cho test. UI: công tắc trong Cài đặt › Chung › Tiếp tục công việc; dòng "Đã mở lượt mới sau khoảng nghỉ. · Mở lượt trước · ✕" trên trang Dịch/Từ điển. |
| Nhà cung cấp AI | `ProviderSettings.swift` viết lại: thẻ flush với một hàng mỗi nhà cung cấp (tên, mục đích), trạng thái (Chưa có key / Đã có key · N model / lỗi xác minh), "Lấy API key ↗" mở trang cấp khoá của nhà cung cấp, "Thêm khoá"/"Thay khoá" mở popover có `SecureField` + Lưu (⏎) + Đóng (Esc), "Xoá khoá" hỏi xác nhận. Kết quả lưu/xoá báo qua toast; discovery chạy lại để xác minh khoá chat. Bỏ bộ chọn + ô khoá rời ở cuối trang. |
| Chuỗi | 7 khoá mới VI/EN/JA; ánh xạ `smartReset`, `smartResetDescription`, `reopenPrevious`, `pressKeys` từ catalog cũ. |
| Test | Domain: `smartResetOpensAFreshTurnAfterTheBreakAndKeepsThePreviousOneReachable` (nghỉ ngắn giữ lượt; 2 giờ → lượt mới cùng cặp; Mở lượt trước bỏ lượt trống; bản nháp không bị thay; tắt công tắc thì Từ điển giữ lượt), `shortcutKeyNamesRoundTripThroughTheRegistryFormat`. |

## Chạy thật (macOS)

- Cài đặt › Chung: hàng "Làm mới lượt đã hoàn tất" với mô tả 2 giờ / 30 phút, công tắc bật (`general.jpg`).
- Cài đặt › Nhà cung cấp AI: OpenAI "Đã có key · 142 model", Claude "Đã có key · 14 model", sáu hàng còn lại
  "Chưa có key" với Lấy API key + Thêm khoá (`providers.jpg`). Không lưu/xoá khoá thật trong phiên này.
- Launcher & phím tắt: bấm keycap ⌥ Space → popover ghi (`recorder.jpg`); nhấn ⌃⌥L → KeyCap "⌃ ⌥ L",
  Áp dụng bật (`recorded.jpg`); Esc đóng, `shortcuts.json` không đổi.
- Chưa chạy thật: lượt mới sau 2 giờ trên app (chỉ có unit test với đồng hồ giả), lưu khoá qua popover
  (hỏi mật khẩu keychain), trùng phím và phím thiếu modifier trên bộ ghi.

## Kiểm tra

`swift build` PASS; `swift test`: 32 + 43 PASS (ba test mới chạy qua `--filter`); `documentation.mjs`,
`generate-resources --check` (3 locale, 42 metric), `validate-viezanagent` (246 ref), `domain.test.mjs` 11 — PASS.

## Còn lại

- Xác minh khoá Groq/ElevenLabs/tìm kiếm (hiện chỉ "Đã có key"); kênh và tự kiểm tra cập nhật; Giọng nói
  (chế độ TTS, tốc độ, nghe thử); Module chia nhóm; Model AI local gợi ý model.
- Bộ ghi phím chưa phát hiện trùng với phím tắt của ứng dụng khác (macOS không cung cấp API; chỉ báo lỗi
  khi đăng ký thất bại như trước).
