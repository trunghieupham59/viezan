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
- [x] AI Chat và Quick Chat: Enter đang chốt chữ của bộ gõ (IME) không gửi tin (`shouldSendChatMessage` bỏ qua `isComposing`/`keyCode 229`, PR #153); Esc đang huỷ chữ IME không ẩn popup Quick Chat (`AIChatPopup.tsx`).
- [x] Cài đặt: thay được khoá API đã lưu mà không phải xoá trước (`CredentialCard.tsx`, PR #153).
- [x] Dịch mọi nơi: xoá một token khác không đóng hộp hiện token vừa tạo (`BrowserIntegrationSection.tsx`, PR #153).
- [x] Trợ năng: bỏ `outline: none` toàn cục, focus bàn phím dùng viền chung từ `tokens.css` (`codex.css`, PR #153).
- [x] Trang chủ: hội thoại chưa đặt tên hiện "Chat Mới" theo ngôn ngữ ở hàng Tiếp tục (`chatSessionTitle` trong `src/utils/chatSessionTitle.ts`, dùng chung với sidebar AI Chat).
- [x] Cài đặt: khoá Groq/ElevenLabs hiện "Đang lưu…" trong lúc lưu (`settings_key_saving`).
- [x] Chữ EN/VI/JA: mười rủi ro trong `locales.md` đã xử lý (trật tự "{key}を押す", nhãn điều hướng JA ngắn, khoảng trắng JA, tên chế độ Chất lượng cao, ngày theo ngôn ngữ app, …).

## Lỗi hành vi

Không còn lỗi hành vi đã biết.

## Trợ năng

Không còn mục trợ năng đã biết.

## Nợ quy ước (giá trị cứng thay vì token, cỡ nút lẫn lộn)

- Màu Tailwind cứng: hộp thoại Tóm tắt của Phiên dịch (`LiveTranslatePage.tsx`), form token Chrome (`BrowserIntegrationSection.tsx`).
- Giá trị cứng trong CSS: `codex.css` (sidebar `10px 8px`, `180ms`, bảng lệnh `560px`/`480px`), `chat.css` (`5px 9px`, `104px`, `44px`, `720px`, `.usage-cost-badge` 18/10/11 px).
- Mã chết: biểu tượng hoạt động không truyền vào `ActivityRow` ở Trang chủ, 9 khoá i18n thermal không dùng.

## Quyết định thiết kế (2026-10-25)

Các điểm từng ghi "cần xác nhận", nay chốt để đồng bộ với hệ thống:

- **Điều hướng giữ bản nháp Dịch.** Sidebar và bảng lệnh không xoá văn bản nguồn/kết quả nữa, giống AI Chat giữ hội thoại; nút Xoá trong ô nguồn là cách bắt đầu lại. Chỉ "Bắt đầu nhanh" ở Trang chủ (ý nghĩa "mở việc mới", như AI Chat tạo hội thoại mới) còn xoá bản nháp (`navigateEffect` trong `catalog.ts`).
- **Hộp cập nhật trong app chỉ dành cho bản web.** Trong Electron, cửa sổ popup cập nhật riêng (`UpdatePopupPage`) lo việc báo; `UpdateNotification` không mở khi preload có `getNotificationPreferences` là đúng thiết kế, không phải lỗi.
- **Nút Hoàn tác trong toast dùng kiểu nút chung của toast** (`NotificationToast`), không dùng `xs neutral outline` riêng, để mọi toast có hành động trông giống nhau.
- **Lỗi "hai ngôn ngữ giống nhau" ở Từ điển vẫn là toast.** Lỗi thuộc về cặp ngôn ngữ chứ không thuộc một ô nhập, nên không đặt dưới ô; lỗi rỗng/quá dài vẫn nằm dưới ô tương ứng.
- **Nhãn câu hỏi trong Quick Chat:** EN/JA "Q", VI "Hỏi" (chữ "H" một mình không đủ nghĩa trong tiếng Việt).
- **Khoảng trắng tiếng Nhật:** viết liền chữ Latin với kana/kanji (quy ước đã chiếm đa số trong `ja.ts`).
- **Cặp ngôn ngữ trong header trang dùng một kiểu cho Dịch, Phiên dịch và Từ điển:** hai nút ngôn ngữ có khung riêng, ô giữa (⇄, → hoặc ổ khoá) đứng tách giữa hai nút. Bản vẽ gốc từng vẽ ba kiểu khác nhau (Dịch: ba nút rời; Phiên dịch, Từ điển và Dịch hẹp: một nút gộp "A → B"), mã từng dùng thanh liền khối cho hai trang sau. Kiểu chung nằm trong `.page-header .language-pair-bar` (`language-pair-bar.css`); thanh liền khối vẫn là kiểu mặc định của `LanguagePairBar` ngoài header.
- **Ô nhập chữ không có viền màu nhấn khi focus.** Bấm vào ô nhập chỉ đổi viền sang `--vzn-border-strong`; con trỏ nhập liệu là dấu hiệu chính. Viền `--vzn-focus-ring` chỉ dành cho nút và điều khiển khác khi dùng bàn phím.
- **Gợi ý phím tắt nằm trong nút.** Chip phím (⌘N, ⌘K) luôn ở bên trong điều khiển mà nó kích hoạt, không đứng rời cạnh nút như một nút thứ hai bấm không được.
- **Cỡ chữ là một hệ số trên token.** Trước đây cài đặt Cỡ chữ đổi `font-size` của `html`, nhưng mọi cỡ chữ là px cố định nên không dòng chữ nào đổi (đo trên 5 trang: 0/358), chỉ các kích thước `rem` phình ra. Nay mọi `--vzn-font-size-*` nhân `--vzn-text-scale`, `rem` cố định 15 px, và 69 cỡ chữ viết cứng trong CSS đã chuyển sang token.
- **Chữ theo đúng thiết kế.** Họ font là chữ hệ thống (`--vzn-font-sans`; bản vẽ dùng Inter chỉ để vẽ mock). Mục điều hướng chính và mục điều hướng Cài đặt dùng `--vzn-font-size-lg` (14) như `foundations.md` §4, trước đây là 13. `body`, lớp Tailwind `font-mono` và chữ mono trong `chat.css` đọc token `--vzn-font-sans` / `--vzn-font-mono` thay cho danh sách font viết tay.
