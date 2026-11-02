# Native code 53 — Chat dán/thả ảnh, chân panel Dịch (2026-11-02)

Đợt 5 của hướng Quiet Workbench ([direction.md](../../design/direction.md)). Phạm vi SwiftUI/macOS;
Qt không đổi. Chạy thật bản ký `.native-build/ux-09/Viezan.app` 1400×860; ảnh ở `evidence/native-compose-53/`.

Phần "panel hội thoại cạnh Chat" (Review 12/13) và bộ chọn "Văn bản/Ảnh/Giọng" (spec Electron) **không làm**:
Review 18 đã bỏ dải phiên và bộ chọn này; theo thứ tự ưu tiên trong `direction.md`, bản native giữ Lịch sử
popover + Thêm hình ảnh trên header.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Domain | `Attachments.ingest(_ data: Data, name:)` dùng chung kiểm tra (≤ 20 MB, JPEG/PNG/WebP/GIF, ≤ 40 MP) với bản đọc tệp; `ingest(URL)` gọi qua nó. |
| Composer | `ComposerEditor.pasteImages`; `CommandTextView.imagePayload(_:)` đọc tệp ảnh (URL) hoặc bitmap bất kỳ (qua `NSImage` → PNG) từ pasteboard; chữ thắng khi có cả hai. `paste(_:)` chuyển ảnh sang intake thay vì dán; `validateMenuItem`/`validateUserInterfaceItem` bật mục Paste cho pasteboard chỉ có ảnh (ô chữ thuần vốn tắt nó, nên ⌘V từng không làm gì). Thả ảnh thẳng lên vùng chữ: `draggingEntered/Updated/performDragOperation`. |
| Kéo-thả | `ImageDropTarget` (`ImageControls.swift`) trên composer Chat và panel nguồn Dịch: tô `action-soft` + viền `action` + "Thả ảnh để đính kèm" khi kéo qua; `ImageIntake.receive` đọc `NSItemProvider` (tệp hoặc dữ liệu ảnh), `ImageIntake.attach` ingest nền, tôn trọng giới hạn 4 ảnh Chat / 1 ảnh Dịch, lỗi → toast "Không đính kèm được ảnh…". |
| Dịch · chân panel nguồn | "{n} ký tự" thay cho "Bản nháp được giữ trên thiết bị"; quá 5.000 ký tự chuyển thành cảnh báo màu `danger`; nút ⊗ xoá văn bản nguồn khi có chữ và không chạy. |
| Dịch · chân panel kết quả | Nút ← "Dùng làm nội dung gốc": kết quả thành nguồn, cặp ngôn ngữ đảo (nguồn tự nhận dạng → đích là ngôn ngữ app), như Electron. |
| Dịch · đảo chiều | Nút ⇄ tắt khi nguồn là Tự động nhận dạng (trước đây gán cứng "en"), cùng hành vi với Phiên dịch. |
| Chuỗi | `charCount`, `clearSource`, `useAsSource` ánh xạ từ catalog cũ; `dropImageHint`, `sourceTooLong`, `attachFailed` mới VI/EN/JA. |
| Test | Domain `pastedImageBytesIngestLikeAFileAndRejectNonImages` (PNG 4×4 thật, chuỗi không phải ảnh, dữ liệu rỗng; tự dọn tệp đã ghi). Native `composerPasteHandsImagesToTheIntakeInsteadOfTheText` (ảnh → intake, mục Paste bật; chữ → dán bình thường). |

## Chạy thật (macOS)

- Dịch: chân panel "12 ký tự" + ⊗ bên trái, ← Dùng làm nguồn bên phải (`translate-footer.jpg`). Bấm ←:
  nguồn "Chào buổi tối.", cặp Tiếng Việt → Tiếng Anh, kết quả trống (`use-as-source.jpg`).
- Chat: PNG trên clipboard (AppleScript), ⌘V trong ô soạn → chip "pasted-image.png", phiên có đính kèm
  (`chat-paste.jpg`). Hai bản dựng trước đó ⌘V không làm gì vì mục Paste bị tắt với pasteboard chỉ có ảnh;
  đã sửa và kiểm chứng lại. Sau QA đã gỡ ảnh và bản nháp thử khỏi phiên của người dùng.
- Chưa chạy thật: kéo-thả từ Finder (không mô phỏng được bằng script), quá 5.000 ký tự, dán ảnh vào Dịch.

## Kiểm tra

`swift build` PASS; `swift test` 33 + 45 PASS; `documentation.mjs`, `generate-resources --check`
(3 locale, 42 metric), `validate-viezanagent` (246 ref), `domain.test.mjs` 11 — PASS.

## Ghi chú QA

Test ingest ghi vào kho đính kèm thật (`~/Library/Application Support/ViezanNativePreview/attachments`)
vì `Attachments` không có thư mục tiêm được; test tự xoá tệp của nó, và tệp 4×4 của lần chạy đầu đã
được xoá đích danh.
