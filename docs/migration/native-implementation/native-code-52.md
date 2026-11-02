# Native code 52 — Cập nhật trong app, Giọng nói, Model AI local (2026-11-02)

Đợt 4 của hướng Quiet Workbench ([direction.md](../../design/direction.md)). Phạm vi SwiftUI/macOS;
Qt không đổi. Chạy thật bản ký `.native-build/ux-06/Viezan.app` 1400×860; ảnh ở `evidence/native-settings-52/`.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Cập nhật · nền | `Workspace.updates` (`UpdatePreferences`: `autoCheck` nil = bật, `snoozedVersion`, `snoozedUntil`). `WorkbenchStore.scheduleUpdateCheck()` chạy sau khi mở app 60 s rồi mỗi 24 giờ khi công tắc bật và không có tác vụ cập nhật khác; `presentUpdateIfAvailable()` chỉ đặt `updatePrompt` cho bản chưa hoãn; `snoozeUpdate()` hoãn 24 giờ; huỷ khi tắt app. |
| Cập nhật · hộp thoại | `UpdatePrompt` (sheet bounded 612 pt trong `WorkbenchView`): tiêu đề "Có bản cập nhật", dòng trạng thái theo spec U4–U7 (`updateStatusText`), ghi chú phát hành cuộn trong thẻ, "Xem thay đổi" ↗, "Nhắc sau 24 giờ" (Esc), "Tải bản cập nhật" (⏎, primary) → tiến độ → "Mở gói đã tải". Không tự cài. |
| Cập nhật · Cài đặt | `UpdateSettings` thành thẻ flush: hàng Phiên bản + Ghi chú phát hành, hàng "Tự kiểm tra cập nhật" (công tắc), hàng Trạng thái với câu trạng thái và nút Kiểm tra / Tải / Mở gói / Huỷ; thẻ ghi chú phát hành khi có bản mới. Bỏ thẻ lồng thẻ. |
| Giọng nói | `VoiceSettings` viết lại trong một thẻ: hàng Nhận dạng giọng nói có huy hiệu "Sẵn sàng" / "Cần {name} key" / thiếu khoá (từ `providers.speechReady`) cạnh bộ chọn; Đọc văn bản (hệ thống/Edge/OpenAI/Gemini/ElevenLabs); Mã giọng đọc là bộ chọn thật theo nhà cung cấp (giọng hệ thống, 19 giọng Edge theo ngôn ngữ, 6 giọng OpenAI, 6 giọng Gemini; chỉ ElevenLabs nhập ID); Tốc độ đọc 0,75×/1×/1,25×/1,5× (`VoicePreferences.rate`, áp dụng cho giọng hệ thống, Edge prosody và OpenAI `speed`); Nghe thử đọc câu mẫu theo ngôn ngữ app, đổi thành Dừng đọc khi đang đọc; nút "Quản lý khoá" mở Nhà cung cấp AI. Mọi thay đổi áp dụng ngay, bỏ nút Áp dụng. |
| Model AI local | `LocalModelSettings` thành bốn thẻ: Dịch vụ AI cục bộ, Cấu hình runtime (nút khởi động nằm trong hàng ngữ cảnh), **Model gợi ý** (Qwen3 4B, Gemma 3 4B, Llama 3.2 3B, Qwen2.5 7B với mô tả và dung lượng; mỗi hàng "Tải" hoặc "Đã tải" hoặc "Chờ runtime"; hàng đang tải hiện trạng thái Ollama + % + thanh tiến độ + Dừng; hàng "Model khác" nhập ID), **Model đã tải** (hàng có nhãn model, So sánh, Xoá model, Tải lại), thẻ Hiệu năng đã đo chỉ khi có. Tải xong/gỡ xong báo toast. |
| Chuỗi | 25 khoá mới VI/EN/JA; ánh xạ `updateAvailableVersion`, `updateDownloading`, `updateReadyVersion`, `remindLater`, `viewChanges`, `updateChecking`, `speechReady` từ catalog cũ. |
| Test | `updateSnoozeHidesTheVersionForADayAndVoiceRateStaysWithinBounds` (công tắc tự kiểm tra, hoãn không có bản mới, tốc độ đọc được giữ khi đổi giọng và bị từ chối ngoài 0,5–2). |

## Chạy thật (macOS)

- Cập nhật › Kiểm tra cập nhật: gọi GitHub Releases, trạng thái "Bạn đang dùng phiên bản mới nhất (v2.4.2)."
  (`updates-checked.jpg`). Công tắc Tự kiểm tra bật mặc định.
- Giọng nói › Nghe thử: giọng hệ thống đọc câu mẫu tiếng Việt, nút đổi thành "Dừng đọc" (`voice-preview.jpg`);
  trạng thái STT "Sẵn sàng" (máy có khoá OpenAI/Claude).
- Model AI local: máy không có Ollama → ba runtime "Không chạy", nút "Tải bộ cài Ollama", bốn model gợi ý
  "Chờ runtime", khởi động runtime tắt (`local-models.jpg`).
- Chưa chạy thật: hộp thoại cập nhật (không có bản mới hơn 2.4.2 trên GitHub), kiểm tra nền sau 60 s (bản
  preview được đóng trước đó), tải model thật (không có Ollama), Edge/OpenAI với tốc độ đọc.

## Kiểm tra

`swift build` PASS; `swift test`: 32 + 44 PASS; `documentation.mjs`, `generate-resources --check`
(3 locale, 42 metric), `validate-viezanagent` (246 ref), `domain.test.mjs` 11 — PASS.

## Còn lại

- Chế độ "Tiết kiệm / Tự động / Chất lượng cao" của bản Electron được thay bằng chọn thẳng nhà cung cấp đọc;
  nếu muốn giữ ba chế độ cần quyết định thiết kế riêng.
- Model AI local: đo hiệu năng nhanh và bảng chỉ số (tốc độ, độ trễ, VRAM) chưa có; LM Studio/llama.cpp
  vẫn cổng cố định.
- Cập nhật: "Cài đặt & khởi động lại" tại chỗ chưa có (chỉ mở gói .dmg đã xác minh).
