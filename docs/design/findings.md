# Lỗi và nợ thiết kế phát hiện khi viết đặc tả

Đây là các lỗi đã thấy khi đối chiếu từng màn hình với mã nguồn (2026-10-25). Lỗi "chênh lệch với bản vẽ" và tính năng "đề xuất" vẫn nằm ở mục 10 của từng đặc tả trong `screens/`; file này chỉ gom **lỗi hành vi** và **nợ quy ước** để xử lý như việc cần làm. Chưa sửa mục nào, trừ mục đã đánh dấu.

## Đã sửa cùng đợt viết tài liệu

- [x] Token trạng thái (success, warning, danger, disabled, scrim, skeleton) chỉ khai báo dưới `html.dark`, nên phần tử ghim `data-mode="dark"` (thẻ xem trước Giao diện, khung tối của board) vẫn nhận màu sáng. Đã chuyển sang `html.dark, [data-mode="dark"]` và `:root, [data-mode="light"]` trong `src/styles/tokens.css`.

## Lỗi hành vi

| Mức | Màn hình | Lỗi | Vị trí |
| --- | --- | --- | --- |
| Cao | AI Chat | Enter gửi tin không kiểm tra `isComposing`: gõ tiếng Việt/Nhật bằng bộ gõ, nhấn Enter để chốt chữ có thể gửi luôn tin nhắn | `src/pages/ChatPage.tsx` (xử lý phím của ô soạn tin) |
| Cao | Cài đặt | Khi đã lưu khoá API, ô khoá ở chế độ chỉ đọc; bấm vào chỉ gọi `onInputChange('')` nên không thay được khoá mới, phải xoá rồi thêm lại | `src/components/ui/CredentialCard.tsx` (`CredentialSecretInputRow`) |
| Cao | Dịch mọi nơi | Xoá một token bất kỳ đóng luôn hộp hiện token vừa tạo, token mới có thể mất trước khi kịp sao chép | `src/pages/settings/BrowserIntegrationSection.tsx` (`handleDeleteToken`) |
| Trung bình | AI Chat | "Thử lại bước {n}" chạy lại toàn bộ nghiên cứu, xoá mọi bước và tiến độ đã lưu | `restartChatResearch` |
| Trung bình | AI Chat | Đang nghiên cứu sâu mà sidebar đã ghi "Chuyên sâu · đang dừng" (chỉ kiểm tra có tiến độ đã lưu hay không) | `AIChatSidebar.tsx` (`sessionMeta`) |
| Trung bình | AI Chat | Nút thích/không thích trong tin nhắn không có `onClick` | `src/components/chat/MessageBubble.tsx` |
| Trung bình | AI Chat | Gốc trang có `role="application"` và `aria-label` là "Đính kèm ảnh" | `src/pages/ChatPage.tsx` |
| Trung bình | Phiên dịch | Chế độ "Cả hai" bị từ chối quyền ghi màn hình lại báo "Không có quyền truy cập microphone" | `useLiveTranslate.ts` (`handleStart`) |
| Trung bình | Trang chủ | Thẻ Hệ thống bỏ qua `error`/`retry` của `useThermalMonitor`: lỗi cảm biến làm thẻ đứng mãi ở "Đang đọc cảm biến…" | `src/components/organisms/home/HomeSystemCard.tsx` |
| Trung bình | Launcher & phím tắt | Báo "Trùng phím" sai: tắt module Dịch vẫn coi Dịch nhanh là đang chạy | `useShortcutInventory.ts` |
| Trung bình | Cài đặt | Xoá khoá ElevenLabs bỏ qua kết quả (lỗi Keychain vẫn hiện như đã xoá); xoá khoá Groq không hỏi xác nhận | `TtsSection.tsx`, `SttSection.tsx` |
| Trung bình | Cài đặt | Dọn/xoá ảnh chat ném lỗi thì hai nút bị tắt vĩnh viễn | `ChatImageStorageCard.tsx` |
| Thấp | Cài đặt | Hộp xác nhận xoá khoá trộn tiếng Anh: "Xóa API key for …" | `ApiKeyInput.tsx`, `DeepResearchApiSection.tsx` |
| Thấp | Cài đặt | Sau khi tải xong bản cập nhật có hai nút `solid` cạnh nhau | `UpdaterSection.tsx` + `CheckUpdateButton` |
| Thấp | Khung | Bản cập nhật trong app (`UpdateNotification`) gần như không bao giờ mở trong Electron vì preload luôn có `getNotificationPreferences` | `src/components/organisms/UpdateNotification.tsx` |
| Thấp | Khung | Ở đúng 900 px, CSS (`max-width: 900px`) và JS (`< 900`) bất đồng về chế độ thu gọn | `codex.css`, `PrimaryNavigationSidebar.tsx` |
| Thấp | Dịch | Điều hướng tới Dịch luôn xoá bản nháp và kết quả hiện tại (`navigateEffect: 'clearTranslation'`), cần xác nhận đây là chủ ý | `src/modules/catalog.ts` |
| Thấp | Nhiệt độ | Lỗi đọc cảm biến hiện chuỗi tiếng Anh cứng ("Sensors could not be read.") | hook thermal |

## Trợ năng

- `codex.css` xoá viền focus toàn cục (`*:focus-visible { outline: none !important }`): người dùng bàn phím không thấy mình đang ở đâu. Ưu tiên cao.
- Thiếu `aria-live` ở kết quả: câu trả lời Launcher, máy tính/tiền tệ, bản ghi Phiên dịch, kết quả Từ điển.
- Phím tắt bị tắt trên Trang chủ chỉ hiện bằng màu nhạt, không có chữ "đang tắt".
- Nhóm nút cỡ chữ (Giao diện) không có tên truy cập; hai công tắc ở Dịch mọi nơi cùng nhãn "Bật phím tắt".

## Nợ quy ước (giá trị cứng thay vì token, cỡ nút lẫn lộn)

- Màu Tailwind cứng: `CostOverviewCard`, `ProviderCostStats`, `MessageBubble`, `ResearchStepsPanel`, hộp quyền và tóm tắt của Phiên dịch, form token Chrome, `AIChatPopup.tsx`.
- Giá trị cứng trong CSS: `codex.css` (sidebar `10px 8px`, `180ms`, bảng lệnh `560px`/`480px`), `chat.css` (px), `translate.css` (`rem`), menu "+" của Chat (inline `width: 220`, `zIndex: 9999`).
- Media query theo cửa sổ thay vì vùng chứa: `.app-panel-grid` (1024 px), tab mục Cài đặt (768 px).
- Cỡ nút lẫn trong một hàng: "Dùng làm nội dung gốc" `xs` cạnh `md` (Dịch); nút ✕ `sm` cạnh bộ ghi phím `md` (Dịch mọi nơi, Chat mới).
- Mã chết: `ChatPageV2.tsx`, `VoiceOverlay.tsx`, `.settings-choice-row`, biểu tượng hoạt động không truyền vào `ActivityRow` ở Trang chủ, 9 khoá i18n thermal không dùng.
- Chữ tiếng Anh cứng trong `AIChatPopup.tsx` ("New conversation", "Quick AI", …) và tiêu đề hội thoại mặc định "New Chat".
