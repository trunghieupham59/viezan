# Lỗi và nợ thiết kế phát hiện khi viết đặc tả

Đây là các lỗi đã thấy khi đối chiếu từng màn hình với mã nguồn (2026-10-25). Lỗi "chênh lệch với bản vẽ" và tính năng "đề xuất" vẫn nằm ở mục 10 của từng đặc tả trong `screens/`; file này chỉ gom **lỗi hành vi** và **nợ quy ước** để xử lý như việc cần làm. Mục đã sửa được chuyển xuống phần "Đã sửa"; các bảng và danh sách bên dưới chỉ còn việc chưa làm.

## Đã sửa

- [x] Token trạng thái (success, warning, danger, disabled, scrim, skeleton) chỉ khai báo dưới `html.dark`, nên phần tử ghim `data-mode="dark"` (thẻ xem trước Giao diện, khung tối của board) vẫn nhận màu sáng. Đã chuyển sang `html.dark, [data-mode="dark"]` và `:root, [data-mode="light"]` trong `src/styles/tokens.css` (sửa cùng đợt viết tài liệu).
- [x] AI Chat: nút nghiên cứu lỗi đổi nhãn thành "Chạy lại nghiên cứu từ đầu", khớp với việc chạy lại toàn bộ (`chat_research_retry_step`, `src/i18n/locales/*.ts`).
- [x] AI Chat: sidebar chỉ ghi "Chuyên sâu · đang dừng" khi phiên không đang chạy (`chatRunningSessionIds` trong `chatSlice.ts`, `AIChatSidebar.tsx`).
- [x] AI Chat: bỏ hai nút thích/không thích không có `onClick` (`MessageBubble.tsx`).
- [x] AI Chat: gốc trang thành `<section aria-label="AI Chat">`, bỏ `role="application"` (`ChatPage.tsx`).
- [x] Phiên dịch: chế độ "Cả hai" bị từ chối quyền ghi màn hình báo đúng lỗi Screen Recording (`useLiveTranslate.ts`).
- [x] Trang chủ: thẻ Hệ thống hiện lỗi cảm biến kèm "Thử lại", và báo "không có cảm biến" thay vì đứng mãi ở "Đang đọc cảm biến…" (`HomeSystemCard.tsx`).
- [x] Launcher & phím tắt: tắt module Dịch thì Dịch nhanh không còn tính là đang chạy, hết báo "Trùng phím" sai (`useShortcutInventory.ts`).
- [x] Cài đặt: xoá khoá ElevenLabs kiểm kết quả và báo lỗi Keychain; xoá khoá Groq hỏi xác nhận (`TtsSection.tsx`, `SttSection.tsx`).
- [x] Cài đặt: dọn/xoá ảnh chat lỗi thì nút được bật lại và có toast lỗi (`ChatImageStorageCard.tsx`).
- [x] Cài đặt: câu xác nhận xoá khoá dùng một khoá có chỗ trống, "Xoá khoá API của {name}?" (`ApiKeyInput.tsx`, `DeepResearchApiSection.tsx`).
- [x] Cài đặt: `CheckUpdateButton` luôn `neutral · outline`, hết cảnh hai nút `solid` cạnh nhau (`CheckUpdateButton.tsx`).
- [x] Khung: CSS thu gọn dùng `max-width: 899px`, khớp với JS `< 900` (`codex.css`).
- [x] Nhiệt độ: các hook bỏ chuỗi dự phòng tiếng Anh cứng, trang dùng câu đã bản địa hoá (`useThermalMonitor.ts`, `useFanControl.ts`, `useFanProfiles.ts`, `useThermalSettings.ts`).
- [x] Trợ năng: thêm `aria-live="polite"` cho câu trả lời Launcher (`AIChatPopup.tsx`), kết quả máy tính/tiền tệ (`QuickLauncher.tsx`), câu đã chốt của Phiên dịch (`LiveTranslatePage.tsx`) và mục từ mới của Từ điển (`DictionaryResultPanel.tsx`).
- [x] Trợ năng: phím tắt bị tắt trên Trang chủ có chữ "· đang tắt" (`ShortcutList.tsx`).
- [x] Trợ năng: nhóm nút cỡ chữ có tên truy cập (`FontSizePicker.tsx`); hai công tắc tên "Bật Dịch nhanh" và "Bật Launcher" (`settings_hotkey_enabled`, `settings_chat_hotkey_enabled`).
- [x] Màu Tailwind cứng đã về token ở `CostOverviewCard`, `ProviderCostStats` (`src/styles/cost.css`), `MessageBubble`, `ResearchStepsPanel` (`chat.css`), hộp quyền Phiên dịch (`DialogShell` + `ai-configuration.css`) và `AIChatPopup.tsx` (`codex.css`).
- [x] Giá trị cứng: `translate.css` hết `rem` (token `--vzn-translate-*`); menu "+" của Chat dùng `--vzn-chat-plus-menu-inline` và `--vzn-layer-picker` (`chat.css`).
- [x] Media query theo vùng chứa: `.app-panel-grid` hai cột từ 900 px của `app-main` (`src/index.css`); tab mục Cài đặt theo `app-main` < 760 px (`codex.css`, `SettingsTemplate.tsx`).
- [x] Cỡ nút trong một hàng: "Dùng làm nội dung gốc" thành `md` (`TranslationResultPane.tsx`); nút ✕ cạnh bộ ghi phím thành `md` (`HotkeySection.tsx`, `ChatPresetsSection.tsx`).
- [x] Mã chết: xoá `ChatPageV2.tsx`, `SystemPromptDropdown.tsx`, `VoiceOverlay.tsx`, `.settings-choice-row`.
- [x] Chữ tiếng Anh cứng trong `AIChatPopup.tsx` ("New conversation", "Quick AI", …) đã thành khoá i18n; tiêu đề mặc định "New Chat" hiện "Chat Mới" theo ngôn ngữ ở sidebar và header Chat (`DEFAULT_CHAT_SESSION_TITLE`, `AIChatSidebar.tsx`).

## Lỗi hành vi

| Mức | Màn hình | Lỗi | Vị trí |
| --- | --- | --- | --- |
| Cao | AI Chat | Enter gửi tin không kiểm tra `isComposing`: gõ tiếng Việt/Nhật bằng bộ gõ, nhấn Enter để chốt chữ có thể gửi luôn tin nhắn (đang sửa ở PR #153) | `src/pages/ChatPage.tsx` (xử lý phím của ô soạn tin) |
| Cao | Cài đặt | Khi đã lưu khoá API, ô khoá ở chế độ chỉ đọc; bấm vào chỉ gọi `onInputChange('')` nên không thay được khoá mới, phải xoá rồi thêm lại (đang sửa ở PR #153) | `src/components/ui/CredentialCard.tsx` (`CredentialSecretInputRow`) |
| Cao | Dịch mọi nơi | Xoá một token bất kỳ đóng luôn hộp hiện token vừa tạo, token mới có thể mất trước khi kịp sao chép (đang sửa ở PR #153) | `src/pages/settings/BrowserIntegrationSection.tsx` (`handleDeleteToken`) |
| Thấp | Khung | Bản cập nhật trong app (`UpdateNotification`) gần như không bao giờ mở trong Electron vì preload luôn có `getNotificationPreferences` | `src/components/organisms/UpdateNotification.tsx` |
| Thấp | Dịch | Điều hướng tới Dịch luôn xoá bản nháp và kết quả hiện tại (`navigateEffect: 'clearTranslation'`), cần xác nhận đây là chủ ý | `src/modules/catalog.ts` |

## Trợ năng

- `codex.css` xoá viền focus toàn cục (`*:focus-visible { outline: none !important }`): người dùng bàn phím không thấy mình đang ở đâu. Ưu tiên cao (đang sửa ở PR #153).

## Nợ quy ước (giá trị cứng thay vì token, cỡ nút lẫn lộn)

- Màu Tailwind cứng: hộp thoại Tóm tắt của Phiên dịch (`LiveTranslatePage.tsx`), form token Chrome (`BrowserIntegrationSection.tsx`).
- Giá trị cứng trong CSS: `codex.css` (sidebar `10px 8px`, `180ms`, bảng lệnh `560px`/`480px`), `chat.css` (`5px 9px`, `104px`, `44px`, `720px`, `.usage-cost-badge` 18/10/11 px).
- Mã chết: biểu tượng hoạt động không truyền vào `ActivityRow` ở Trang chủ, 9 khoá i18n thermal không dùng.
- Tiêu đề hội thoại mặc định "New Chat" vẫn hiện nguyên văn ở hàng Tiếp tục của Trang chủ (`HomePage.tsx` đọc thẳng `session.title`).
