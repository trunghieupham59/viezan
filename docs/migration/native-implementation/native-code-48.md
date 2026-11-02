# Native code 48 — Launcher: Hỏi AI trong cùng cửa sổ, đổi tiền, lệnh Viezan (2026-10-31)

Khép hai chênh lệch còn lại của Launcher macOS ghi ở native-code-44 (Hỏi AI mở panel Chat nhanh riêng; không có
bộ chọn loại tiền) và thêm nhóm lệnh Viezan theo `docs/design/screens/launcher.md` / `quick-chat.md`.
Chạy thật bản ký `r18-v55…v57-mac` trên macOS; ảnh ở `evidence/native-launcher-48/` (chỉ cửa sổ app).

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Hỏi AI (SwiftUI) | `LauncherChat.swift`: Tab, ⌘↵ hoặc hàng "Hỏi AI" chuyển **cùng cửa sổ** sang chế độ AI (cao 540) và tự gửi chữ đã gõ. Header: "Tìm kiếm" (về chế độ tìm, giữ chữ), logo/"+" cuộc mới (⌘N), ô hỏi (↵ gửi, ⇧↵ xuống dòng), ✕, Gửi. Thân: trạng thái trống (AI NHANH, bảng phím), thẻ hỏi–đáp (lượt cũ mờ, thẻ mới cuộn lên đầu), "Đang suy nghĩ…" + skeleton, Markdown, ô lỗi, Sao chép / Tạo lại phản hồi. Footer: chip model (mở Cài đặt › Nhà cung cấp), Dừng, Sao chép, Mở trong Chat ⌘↵. Esc ẩn cửa sổ. Thiếu AI dùng được: `ProviderNotice` dùng chung, câu hỏi giữ trong ô, không gửi |
| Phiên Quick AI | Một phiên chat tách rời (`createDetachedSession`) chỉ được tạo khi gửi câu đầu, id lưu `launcher.quickSession`. Cập nhật < 30 phút: hàng "Hỏi tiếp AI" nối vào phiên đó, ô trống có "Tiếp tục Quick AI" trong nhóm Viezan; cũ hơn: "Hỏi AI" bắt đầu phiên mới, "Tiếp tục Quick AI" nằm ở Gần đây. "Mở trong Chat" mở chính phiên đó ở AI Chat (nháp chưa gửi thành nháp của phiên) rồi Launcher bắt đầu mới |
| Nhóm Viezan | Ô trống: (Tiếp tục Quick AI), Dịch, Tra từ điển, Phiên dịch AI, Mở trong Chat, Mở Cài đặt (theo module bật). Khi gõ: chỉ lệnh có tên khớp (bỏ dấu). Mở trang chính qua `openRoute` |
| Đổi tiền | `LauncherCurrency` (domain) port từ `currencyQuery.ts`/`currencies.ts`: `2$`, `$2`, `2 usd`, `500k vnd`, `2tr`, `1万円`, `100 usd to jpy`, `2 đô sang yên`; 30 loại tiền, bí danh VI/JA; số theo quy ước `.`/`,` của ngôn ngữ app. `CurrencyRates.rates(retry:)` trả bảng tỷ giá; chỉ tải khi câu là số tiền. Hàng: "100 USD = 2.580.215 VND" + "1 USD = 25.802,2 VND · Tỷ giá ngày …"; đang tải / không có tỷ giá (↵ thử lại) |
| Bộ chọn tiền đích | "Đổi sang: {mã}" thay chữ loại; menu 29 loại tiền với tên bản địa; nhớ trong `launcher.currencyTarget`; tắt khi câu đã ghi tiền đích. Dùng `Menu` (không phải popover có ô lọc) để Launcher giữ focus và không tự ẩn |
| Tạo lại phản hồi | `canRetry` cho phép tạo lại câu trả lời chat **mới nhất** đã xong (trước đây nút "Thử lại"/"Tạo lại" luôn tắt sau khi trả lời xong, cả ở AI Chat) |
| Chuỗi | `generate-resources.mjs` đưa các khoá `ai_chat_popup_*` sẵn có và `chat_thinking`, `chat_regenerate`, `chat_error_open_settings`, `chat_clear` vào tài nguyên native |

## Chạy thật (macOS, Claude · claude-haiku-5-5)

- Ô trống: nhóm Viezan; "phien" → chỉ "Phiên dịch AI", ↵ mở trang Phiên dịch ở cửa sổ chính.
- "100 usd" → tỷ giá thật (open.er-api.com) "= 2.580.215 VND"; menu "Đổi sang" → JPY → "= 15.749 JPY", lựa chọn được
  nhớ, Launcher vẫn mở.
- Tab với "giải thích REST trong 2 câu" → chế độ AI, chữ chảy về, footer "Dừng"; hỏi tiếp "cho 1 ví dụ URL" + ↵ →
  2 lượt có ngữ cảnh; ⌘↵ → Launcher ẩn, AI Chat hiện cả hai lượt, phiên nhanh được bỏ.
- Mở lại sau một câu hỏi: "Tiếp tục Quick AI" đầu nhóm Viezan; gõ chữ → "Hỏi tiếp AI", ↵ nối vào cuộc cũ (2 lượt).
- "Tạo lại phản hồi" → "Đang suy nghĩ…" + skeleton + Dừng → câu trả lời mới. "Tìm kiếm" về chế độ tìm giữ chữ;
  Tab ô trống + ⌘N → trạng thái trống; Esc ở chế độ AI ẩn cửa sổ.
- Phím gửi bằng `CGEvent.postToPid` vào đúng tiến trình và chỉ khi cửa sổ Launcher đang hiện (một lần Launcher đã
  tự ẩn vì mất focus trước khi phím tới; đã kiểm tra cửa sổ chính không nhận chữ nào).

## Chưa làm / chưa chạy

- Qt: Hỏi AI vẫn mở Chat nhanh riêng; đổi tiền Qt chỉ hiểu "X aaa to bbb", chưa có bộ chọn tiền và nhóm Viezan.
- Trạng thái thiếu AI trong chế độ AI chưa chạy thật (máy có Claude); dùng lại `ProviderNotice` đã QA ở AI Chat.
- Tạo lại ở thẻ cũ (cắt các lượt sau) chưa làm: chỉ thẻ mới nhất có "Tạo lại phản hồi".
- Bộ chọn tiền là menu (gõ chữ cái để nhảy), không có ô "Tìm loại tiền…" như spec.
- Lưu đệm câu hỏi đầu 10 phút và Smart Thinking của Quick AI (spec quick-chat §4) chưa có.

## Kiểm tra

`swift test` 31 + 41 (thêm phân tích tiền tệ, tiền đích mặc định, quy đổi, tạo lại câu trả lời chat mới nhất);
`generate-resources` (parity 3 ngôn ngữ).
