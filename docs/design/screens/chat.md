# AI Chat

> Bản vẽ gốc: `boards/Chat.dc.html`, `boards/ChatExtras.dc.html`, `boards/Popovers.dc.html` (cột "Chọn model" và "Tác vụ Chat"), `boards/States.dc.html` (Chat · chưa có AI nào, Chat · lỗi nhà cung cấp), `boards/Narrow.dc.html` · Board chi tiết: `specs/chat.html` · Mã nguồn: `src/pages/ChatPage.tsx`, `src/components/organisms/AIChatSidebar.tsx`, khung trang trong `src/App.tsx`

Luật chung (token, hợp đồng Button, bậc bề mặt, responsive, trạng thái) nằm ở [`foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng của AI Chat. Mọi khẳng định đều dẫn về mã; điều mã chưa có được đánh dấu **đề xuất**.

## 1. Mục đích

AI Chat là nơi người dùng hỏi đáp nhiều lượt với một model AI (local qua Ollama hoặc đám mây có khoá), có thể kèm ảnh, bật nguồn web, chọn một "tác vụ" có sẵn (Dịch, Nghiên cứu, Giải thích, Viết, Tạo ảnh) để câu hỏi được gửi kèm hướng dẫn phù hợp, và chạy Nghiên cứu chuyên sâu nhiều bước có thể dừng rồi tiếp tục. Người dùng đến đây khi cần một câu trả lời dài, có ngữ cảnh, hoặc khi mở rộng một câu hỏi từ Quick Chat/Launcher. Thành công là: câu trả lời hiện dần ngay trong cùng một cột đọc, cuộc trò chuyện được lưu vào lịch sử bên trái với model và tác vụ của riêng nó, và người dùng luôn biết model nào đang trả lời, đang chờ gì, và sửa lỗi ở đâu.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng chính | Mục "AI Chat" (`nav_chat`) | Mở cuộc trò chuyện đang hoạt động gần nhất (`activeChatSessionId` được giữ trong store). |
| Bảng lệnh ⌘K | Lệnh trang "AI Chat"; hoặc hỏi AI ngay trong bảng lệnh rồi bấm "Mở trong Chat" (`ai_chat_popup_open_in_chat`) | `CommandPalette.tsx`: lệnh trang gọi `navigate('chat')`; "Mở trong Chat" tạo phiên mới chứa câu hỏi + câu trả lời rồi chuyển trang. |
| Quick Chat / Launcher | "Mở trong Chat" | `App.tsx` (`quickChat.onOpenInChat`): tạo phiên mới với provider/model của popup, chép câu hỏi + câu trả lời vào, hoặc đặt câu hỏi vào ô soạn (`setChatSessionDraft`), rồi chuyển sang trang chat. |
| Phím tắt trong trang | `chatNewSessionShortcut` (mặc định `CommandOrControl+N`, `src/utils/keyboardShortcuts.ts`) | Chỉ hoạt động khi trang Chat đang mở (listener gắn trong `ChatPage.tsx`). Đổi được ở Cài đặt › Chat. |
| Ra: Cài đặt | Nút "Mở Cài đặt" (thiếu khoá), "Đổi model hoặc khoá" trên tin nhắn lỗi (`openSettingsAt('api')`), nút "Mở Cài đặt" trong toast lỗi giọng nói / tìm web | Quay lại Chat giữ nguyên bản nháp vì bản nháp lưu trong store. |
| Ra: trang khác | Bất kỳ mục điều hướng nào | Bản nháp và tác vụ của từng cuộc trò chuyện được giữ; ảnh đính kèm chưa gửi thì bị bỏ (cố ý, xem chú thích trong `ChatPage.tsx`). |

## 3. Bố cục

Bề rộng mặc định 1200 px, thanh điều hướng chính mở rộng 236 px, lịch sử chat mở.

```
┌ Title bar 40 ────────────────────────────────────────────────────────────────────────────────┐
├ Primary nav 236 ┬ ai-chat-sidebar 264 ─────┬ PageHeader 56 ──────────────────────────────────┤
│ …               │ [⌕ Tìm cuộc trò chuyện…] │ [◧] Tiêu đề…  [● Local · qwen3:4b ▾] [+]        │
│ AI Chat ●       ├──────────────────────────┼─────────────────────────────────────────────────┤
│ …               │ HÔM NAY                  │       chat-messages-scroll (cuộn)               │
│                 │ ▣ So sánh model local…   │  ┌ chat-message-stage ≤ 760 ──────────────┐     │
│                 │   Nghiên cứu · Tổng quan │  │             [bong bóng người dùng]     │     │
│                 │   Viết lại tiêu đề…      │  │ [ResearchStepsPanel nếu có]            │     │
│                 │   Chuyên sâu · đang dừng │  │ Câu trả lời (MarkdownText, chữ đọc)    │     │
│                 │ TUẦN NÀY                 │  │ 10:24 · chi phí · ⧉ Thích Chê ↻        │     │
│                 │   …                      │  └────────────────────────────────────────┘     │
│                 │ TRƯỚC ĐÓ                 │  ┌ chat-composer (một bề mặt duy nhất) ───┐     │
│                 │   …                      │  │ [ảnh đính kèm]                         │     │
│                 │                          │  │ Hỏi bất kỳ điều gì…                    │     │
│                 │                          │  │ [+] [Web] [Tác vụ: Chat ▾]  [Mic] [Gửi]│     │
│                 │                          │  └────────────────────────────────────────┘     │
└─────────────────┴──────────────────────────┴─────────────────────────────────────────────────┘
```

Khi chưa có tin nhắn, vùng cuộn được thay bằng `chat-empty-state`: logo, câu hỏi lớn "Chúng ta nên bắt đầu từ đâu?" và **cùng một** `chat-composer` đặt giữa màn hình (không phải bản sao khác kiểu).

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Sidebar lịch sử | `AIChatSidebar` → `aside.ai-chat-sidebar` (`src/components/organisms/AIChatSidebar.tsx`, CSS `src/styles/codex.css`) | `--vzn-chat-sidebar-width` (264), nền `--vzn-chat-sidebar-bg`, viền phải `--vzn-border-strong` | Chỉ `.ai-chat-sidebar-content` cuộn |
| Ô tìm lịch sử | `Input size="sm" type="search"` trong `.ai-chat-sidebar-header` | Header cao `--vzn-page-header-min-height` (56) để thẳng hàng với header trang; ô nền `--vzn-bg`, bo `--vzn-radius-sm` | Không |
| Nhóm thời gian | `section.ai-chat-session-section` + `h3.ai-chat-session-heading` | Chữ `--vzn-font-size-caption`, viết hoa, `--vzn-tracking-caps`, màu `--vzn-text-soft` | — |
| Hàng cuộc trò chuyện | `ChatSessionListItem` (`src/components/ui/molecules/ChatSessionListItem.tsx`) | Đệm `--vzn-space-2`, bo `--vzn-radius-sm`; tiêu đề `--vzn-font-size-md`, meta `--vzn-font-size-sm`; đang chọn: nền `--vzn-action-soft` + viền trong `--vzn-action-border`, tiêu đề `--vzn-action-text` semibold; meta "đang dừng" màu `--vzn-warning` | — |
| Header trang | `PageHeader.ai-chat-workspace-header` (`App.tsx`, nội dung từ `AIChatSidebar`) | Cao 56, đệm ngang `--vzn-space-4`, tiêu đề `--vzn-font-size-subtitle` (15) cắt bằng dấu ba chấm | Không |
| Chip model | `ChatAIConfiguration` → `ModelChip` | Button `sm`; mã model monospace, cắt ở `--vzn-model-chip-model-max` (180) | — |
| Popover cấu hình AI | `AIConfigurationPopover` + `ModelSelector embedded inline directModelList` | Rộng `--vzn-ai-configuration-inline` (= `--vzn-popover-wide`, 420), cao tối đa `--vzn-ai-configuration-max-block`, nền `--vzn-surface-raised`, bóng `--vzn-shadow-md` | Thân popover cuộn |
| Cột tin nhắn | `.chat-messages-scroll` > `.chat-message-stage` | `--vzn-chat-stage-max` (760), lề `--vzn-chat-gutter` theo container, khoảng cách tin `--vzn-space-6` | Có |
| Bong bóng người dùng | `.chat-bubble-user` | Nền `--vzn-user-bubble-bg`, viền `--vzn-user-bubble-border`, bo `--vzn-radius-lg` (góc dưới phải `--vzn-radius-xs`), rộng tối đa `min(72%, 720px)` | — |
| Câu trả lời | `.chat-bubble-assistant` + `MarkdownText` | Không khung; chữ `--vzn-font-reading` / `--vzn-line-reading`; rộng tối đa `--vzn-chat-reading-max` | — |
| Thanh hành động tin | `.chat-message-actions` | Button `xs` (28); ẩn tới khi hover/focus, trừ tin trả lời cuối, tin lỗi hoặc tin có ghi chú model thay thế (`chat-message-actions-pinned`) | — |
| Bảng nghiên cứu | `ResearchStepsPanel` (`src/components/chat/ResearchStepsPanel.tsx`) | Viền `--vzn-border`, bo `--vzn-radius-md`, đệm `--vzn-space-1`; `ProgressSteps` bên trong | — |
| Ô soạn tin | `.chat-composer.chat-page-composer` | Cao tối thiểu `--vzn-composer-min-height` (116), bo `--vzn-radius-lg`, nền `--vzn-surface`, viền `--vzn-border`; focus: viền `--vzn-action-border` + vòng `--vzn-focus-ring`; textarea cao tối đa `--vzn-chat-textarea-max-height` (140); rộng `--vzn-chat-composer-max` (760) | Textarea tự cuộn |
| Menu "+" | portal `.floating-panel` trong `ChatPage.tsx` | Neo phía trên nút "+" | — |
| Popover Tác vụ | `ChatTaskConfiguration` → `AIConfigurationPopover placement="auto" align="start"` | Như popover cấu hình AI, có footer Bỏ/Áp dụng | Thân cuộn |
| Toast | `NotificationViewport` (khoá `chat-voice-error`, `chat-web-search-fallback`, `chat-web-search-unavailable`, `chat-attach-image`, `chat-copied`) | Xem `foundations.md` §6 | — |

## 4. Thành phần và hành động

Viết tắt kiểu Button: `size · variant · appearance`. "Ẩn" nghĩa là điều khiển không render; "tắt" nghĩa là `disabled` gốc (xám, ghi đè variant).

### 4.1 Sidebar lịch sử

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Ô "Tìm cuộc trò chuyện…" | `Input sm type=search` | Gõ | Lọc theo tiêu đề, mã model, provider (`sessionMatchesQuery`), không phân biệt hoa thường | Danh sách lọc ngay; không có kết quả: "Không tìm thấy cuộc trò chuyện" | Không bao giờ tắt |
| S2 | Hàng cuộc trò chuyện | Nút gốc `.chat-session-select` (ngoại lệ có ghi chú trong mã: hàng hai dòng) | Click / Enter / Space | `setActiveChatSession(id)`: mở cuộc trò chuyện, khôi phục provider/model, bản nháp, tác vụ của nó; đóng lớp phủ hẹp | Hàng chuyển sang nền nhấn; header đổi tiêu đề và chip model | — |
| S3 | Nút xoá trên hàng | `xs · danger · ghost`, icon thùng rác, `aria-label="Xóa: <tên đầy đủ>"` | Hover/focus hàng để hiện, rồi click | `deleteChatSession(id)`: xoá ngay; nếu là cuộc đang mở thì về trạng thái trống | Hàng biến mất. **Không** có hộp xác nhận, không hoàn tác | — |
| S4 | Meta dòng hai | Chữ | — | Thứ tự ưu tiên (`sessionMeta`): "Chuyên sâu · đang dừng" nếu có nghiên cứu dang dở; "Tác vụ · Tuỳ chọn" nếu có tác vụ; còn lại thời gian tương đối ("vừa xong", "5 phút trước", ngày) | Màu `--vzn-warning` khi đang dừng | — |

### 4.2 Header trang

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Ẩn/hiện lịch sử | `sm · neutral · ghost`, icon panel, `aria-expanded`, `aria-controls` → sidebar | Click | ≥ 900 px: `toggleAiChatSidebar()` (lưu bền). < 900 px: mở/đóng lớp phủ tạm, đồng thời phát sự kiện đóng điều hướng chính | Sidebar trượt vào/ra; nhãn đổi "Ẩn lịch sử trò chuyện" ↔ "Hiện lịch sử trò chuyện" | — |
| H2 | Tiêu đề | `PageHeader` title | — | Tiêu đề cuộc trò chuyện (dòng đầu tin nhắn đầu tiên, tự đặt trong `chatSlice.addChatMessage`); trạng thái trống: "AI Chat" | — | — |
| H3 | Chip model | `ModelChip`: `sm · neutral · outline` (mở: `primary · soft`), `aria-haspopup="dialog"`, `aria-expanded` | Click | Mở/đóng popover "Cấu hình AI" bên dưới chip | Chấm trạng thái: xanh khi có khoá hoặc provider local, vàng khi thiếu khoá | Không tắt |
| H4 | Chat mới | `sm · neutral · ghost`, icon "+", `title="Chat Mới (⌘N)"`, `aria-keyshortcuts` | Click hoặc phím `chatNewSessionShortcut` | `setActiveChatSession(null)`: về trạng thái trống, xoá ô tìm, đóng lớp phủ hẹp. Không xoá lịch sử | Header đổi về "AI Chat"; ô soạn hiện bản nháp chờ (`chatPendingDraft`) | — |

### 4.3 Popover "Cấu hình AI" (từ H3)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Đóng | `sm · neutral · ghost`, icon X, `aria-label="Đóng cài đặt"` | Click, Esc | Đóng, trả focus về chip | — | — |
| M2 | Mô tả phạm vi | Chữ | — | "Áp dụng cho cuộc hội thoại này." hoặc, khi chưa có phiên, "Áp dụng cho cuộc hội thoại mới." | — | — |
| M3 | Tìm model | `Input md type=search` | Gõ | Lọc danh sách | "Không tìm thấy model" | — |
| M4 | Mục "Gần đây" | `ModelOption` | Click | Chọn model đã dùng gần đây (kèm tên provider) | Popover đóng, chip đổi | — |
| M5 | Nhóm theo provider | Tiêu đề nhóm + `ModelOption` | Click model | Chọn model; nếu đang ở một cuộc trò chuyện, `setChatSessionModel` chỉ ghi khi cuộc đó vẫn đang mở và provider khớp (`bindToConversation`) | Popover đóng, focus về chip | Provider chưa có khoá: nhãn "Chưa có key" |
| M6 | Tải lại danh sách | `xs · neutral · ghost`, icon ↻, `aria-label="Tải lại: <provider>"` | Click | `fetchModels(provider)` | Icon thành spinner; dòng "Đang tải model…" (`role=status`); lỗi: "Tải thất bại" (`role=alert`) | Tắt khi đang tải; ẩn khi thiếu khoá |

### 4.4 Ô soạn tin (chung cho trống và đang trò chuyện)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Ô nhập | `textarea.chat-input-field` | Gõ, dán, kéo thả | Lưu bản nháp theo cuộc trò chuyện (`setChatSessionDraft` / `setChatPendingDraft`). Dán ảnh từ clipboard → đính kèm | Tự giãn tới 140 px; > 600 ký tự hiện bộ đếm | `disabled` khi đang gửi; `readOnly` + `aria-busy` khi đang thu âm/chép giọng nói |
| C2 | Gửi bằng phím | — | `Enter` (mặc định) hoặc `⌘/Ctrl+Enter` theo Cài đặt › Chat › Phím gửi (`shouldSendChatMessage`) | Như C9 | Như C9 | Như C9 |
| C3 | "+" (đính kèm) | `md · neutral · ghost` (mở: `primary · soft`), `aria-haspopup="menu"`, `aria-expanded` | Click | Mở menu một mục "Thêm ảnh và tệp" | — | Tắt khi đang thu âm |
| C4 | Mục "Thêm ảnh và tệp" | Nút menu `.btn-menu-item` | Click | Mở hộp chọn tệp `accept="image/*"` | Ảnh hiện thành thumbnail trong ô soạn | — |
| C5 | Bỏ ảnh | Nút X trên `ImagePreviewThumbnail`, `title="Xóa ảnh"` | Click | Bỏ ảnh đính kèm | Thumbnail biến mất | — |
| C6 | Nguồn web | `md · neutral · ghost` ↔ `md · primary · soft`, icon địa cầu, `aria-pressed`, `title="Tìm nguồn trên mạng cho yêu cầu này."` | Click | Bật/tắt `webSearch` trong tác vụ của cuộc trò chuyện; tin tiếp theo luôn tìm web trước | Nút chuyển màu nhấn | **Ẩn** khi tác vụ là Dịch, Tạo ảnh, hoặc Nghiên cứu · Chuyên sâu (`canUseChatWebSearch`); tắt khi đang thu âm |
| C7 | "Tác vụ: …" | `md · neutral · outline` (mở: `soft`), icon theo tác vụ, `aria-haspopup="dialog"`, nhãn "Tác vụ: Nghiên cứu · Tổng quan nhanh" | Click | Mở popover Tác vụ (bảng 4.5) | — | **Ẩn** khi thiếu khoá; tắt khi đang thu âm |
| C8 | Micro | `VoiceRecorder buttonSize="md"`: rảnh `neutral · ghost`; đang thu `danger · soft` (icon dừng); đang chép `primary · soft` + spinner | Click | Thu âm → chép thành chữ chèn vào ô nhập (`useVoiceInput`) | Nhãn "Đang thu âm… 0:07" hoặc "Đang chuyển văn bản…" (`aria-live=polite`) + nút "Hủy thu âm" (`md · neutral · ghost`) | Tắt khi đang gửi |
| C9 | Gửi | `md · primary · solid`, icon mũi tên, `aria-label="Gửi"` | Click | `executeChatRequest()` (xem luồng 6.1) | Ô nhập trống, tin người dùng xuất hiện, nút đổi thành Dừng | Tắt khi: không có chữ và không có ảnh; chữ chỉ là tiền tố tác vụ cũ; thiếu khoá; tác vụ Tạo ảnh mà provider không hỗ trợ hoặc chưa có chữ. Ẩn khi đang thu âm |
| C10 | Dừng | `md · danger · soft`, icon vuông, `aria-label="Dừng"` | Click | `abortControllerRef.current.abort()` | Phần chữ đã về được giữ, không báo lỗi; nghiên cứu giữ các bước đã xong | Chỉ hiện khi đang gửi |
| C11 | Gợi ý dưới ô nhập | `p.chat-task-hint role=status` | — | "Nhập nội dung hoặc chủ đề trước khi gửi yêu cầu này." khi ô chỉ chứa tiền tố tác vụ; "Model này không đọc được ảnh…" / "Model local này có thể không đọc được ảnh…" khi ảnh kèm và model không đọc ảnh (`imageInputSupport`) | — | — |
| C12 | Kéo thả ảnh | Toàn trang | Thả tệp | Ảnh: đính kèm. Không phải ảnh: toast "Vui lòng tải lên file ảnh (JPEG, PNG, WebP, GIF)". > 25 MB: toast "Ảnh vượt quá 25 MB…" | Trong lúc kéo: `DragOverlay` + viền ô soạn `chat-composer-drop` | — |

### 4.5 Popover Tác vụ (từ C7)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Danh sách tác vụ (`role=listbox`) | 6 hàng `md · neutral · ghost`; hàng đang chọn `md · primary · soft` + dấu ✓, `aria-selected` | Click, ↑/↓ | Chỉ đổi **bản nháp** trong popover: Chat · Dịch · Nghiên cứu · Giải thích · Viết · Tạo ảnh | Dấu ✓ chuyển hàng; ô tuỳ chọn và hướng dẫn bên dưới đổi theo | "Tạo ảnh" tắt khi provider không phải Gemini/OpenAI, `title`/`aria-description` = "Cần nhà cung cấp Gemini hoặc OpenAI" |
| T2 | Ô tuỳ chọn | `SelectField` (trigger `md · neutral · outline`, mở: `soft`; menu neo vào trigger, không bị thân popover cắt) | Click, ↑/↓, Home/End, Esc | Dịch → "Ngôn ngữ đích" (mọi ngôn ngữ trừ Tự động; mặc định ngôn ngữ giao diện). Nghiên cứu → "Mức nghiên cứu": Tổng quan nhanh / Chuyên sâu. Giải thích → "Cách giải thích": Dễ hiểu, có ví dụ / Từng bước / Chi tiết kỹ thuật. Viết → "Loại nội dung": Email / Bài viết hoặc bài luận / Viết lại và trau chuốt | Menu mở lên hoặc xuống theo chỗ trống; mục chọn `primary · soft` + ✓ | Ẩn với Chat và Tạo ảnh |
| T3 | "Hướng dẫn gửi kèm" | `ConfigSection` + đoạn chữ nền `--vzn-surface-muted` | — | Xem trước đúng câu lệnh sẽ được ghép trước tin nhắn (`getChatTaskInstruction`) | Đổi ngay theo T1/T2 | Ẩn khi tác vụ không có hướng dẫn (Chat, Tạo ảnh) |
| T4 | Bỏ | `md · neutral · ghost` | Click | Đóng, giữ tác vụ đã áp dụng trước đó, trả focus về C7 | — | — |
| T5 | Áp dụng | `md · primary · solid` | Click | `handleTaskSelect`: lưu tác vụ + tuỳ chọn cho cuộc trò chuyện (hoặc bản chờ khi chưa có phiên), đổi placeholder ô nhập, focus ô nhập | Nhãn C7 đổi; nút C6 ẩn/hiện theo tác vụ | — |
| T6 | Đóng (X) / Esc / click ngoài | `sm · neutral · ghost` | — | Như "Bỏ" | — | — |

### 4.6 Tin nhắn và bảng nghiên cứu

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Giờ gửi · chi phí · "Trả lời bởi … (model đã chọn không khả dụng)" | Chữ `ui-micro`, `UsageCostBadge` | — | Thông tin | Ghi chú model thay thế làm thanh hành động luôn hiện | — |
| A2 | Sao chép | `xs · neutral · ghost`, `aria-label="Sao chép"` | Click | Chép chữ của tin | Toast "Đã sao chép!" | Ẩn khi tin đang tải hoặc không có chữ |
| A3 | Phản hồi tốt / chưa tốt | `xs · neutral · ghost` ×2 | Click | **Không làm gì** (chưa có `onClick`, xem §10) | — | Ẩn khi đang tải |
| A4 | Tạo lại phản hồi | `xs · primary · soft`, icon ↻ | Click | `handleRegenerate`: gửi lại tin người dùng cuối với **đúng** provider/model/tác vụ/system prompt đã lưu trên tin đó (`requestConfiguration`), ghi đè bong bóng trả lời cuối (nghiên cứu: chạy lại từ đầu) | Bong bóng về "Đang suy nghĩ" rồi chữ chạy | Chỉ trên tin trả lời cuối; tắt khi đang gửi; toast lỗi nếu provider của tin không còn khoá |
| A5 | Tải ảnh xuống | `xs · neutral · ghost`, icon tải | Click | Lưu ảnh AI tạo (`generated-image-<time>.png`) | Hộp lưu tệp của hệ thống | Chỉ trên tin trả lời có ảnh |
| A6 | Sửa ảnh này | `xs · neutral · ghost` có chữ | Click | Chuyển tác vụ sang Tạo ảnh và focus ô nhập; lời nhắc tiếp theo chỉnh ảnh mới nhất | Placeholder đổi "Tạo ảnh từ văn bản, hoặc sửa ảnh đính kèm bằng AI" | Chỉ trên tin cuối có ảnh và provider hỗ trợ ảnh |
| A7 | Mở ảnh | Nút gốc bọc `<img>`, `aria-label="Mở ảnh"` | Click | `ImageLightbox` có Sao chép, Tải xuống, Đóng | Esc đóng | Ảnh mất dữ liệu: khung gạch "Ảnh này không còn được lưu trên thiết bị" |
| A8 | Thử lại (tin lỗi) | `RecoverableError`: `sm · neutral · outline` | Click | Như A4 | — | Chỉ trên tin cuối, không khi đang gửi |
| A9 | Đổi model hoặc khoá (tin lỗi) | `sm · neutral · ghost` | Click | `openSettingsAt('api')` | Mở Cài đặt › Khoá API | Chỉ trên tin cuối |
| A10 | Đóng thông báo lỗi | `sm · danger · ghost`, icon X | Click | Ẩn khung lỗi | — | — |
| R1 | Đầu bảng nghiên cứu | `sm · neutral · ghost`, `aria-expanded`, `aria-controls` | Click | Mở/gập danh sách pha | Đang chạy: "Nghiên cứu chuyên sâu · bước 3 / 6" + spinner. Xong: "Đã suy nghĩ · N bước" + chevron; tự gập khi xong | — |
| R2 | Tiến trình | `ProgressSteps` | — | 6 pha cố định: Phân tích → Khảo sát → Rà khoảng trống → Đào sâu → Đối chiếu → Tổng hợp; mỗi pha: đã xong / đang chạy / chưa chạy / lỗi; Khảo sát và Đào sâu ghi "N khía cạnh" | — | Chỉ hiện khi đang chạy hoặc đang chờ người dùng |
| R3 | Nút ⓘ trên từng pha | Nút gốc `.chat-research-pill-info`, `aria-label="Xem chi tiết nghiên cứu"` | Hover (xem tạm) / click (ghim) | Popover chi tiết của pha (rộng 380, portal) | Esc hoặc click ngoài đóng | — |
| R4 | "Tiếp tục" | `sm · primary · solid` | Click | `handleResumeDeepResearch`: chạy tiếp từ pha sau pha đã xong cuối cùng, dùng lại provider/model lúc bắt đầu | Dòng lý do "Đã dừng ở bước {n}. Các bước đã xong được giữ lại." biến mất; spinner chạy lại | Chỉ hiện khi: cuộc dừng giữa chừng, bảng ở cuối cuộc trò chuyện, tác vụ hiện tại vẫn là Nghiên cứu · Chuyên sâu, ô soạn trống và không kèm ảnh |
| R5 | "Thử lại bước {n}" | `sm · neutral · outline` | Click | `handleRegenerate`: xoá các bước và **chạy lại toàn bộ** nghiên cứu (xem §10) | Như R4 | Chỉ hiện khi bước cuối lỗi và không có snapshot để tiếp tục; điều kiện ô soạn như R4 |

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống (cuộc mới) | `messages.length === 0` | Logo mờ 48 px, tiêu đề "Chúng ta nên bắt đầu từ đâu?" (`chat_empty_desc`, `--vzn-font-size-heading-lg`, chữ đọc), ô soạn ngay dưới, cả cụm căn giữa dọc. Header: "AI Chat" | Mọi điều khiển ô soạn; chọn tác vụ trước khi gửi (lưu vào bản chờ, chuyển sang phiên mới khi gửi) |
| Lịch sử trống | Chưa có phiên nào | Sidebar: "Chưa có cuộc trò chuyện" căn giữa | Gõ để bắt đầu |
| Tìm không thấy | Ô tìm có chữ, 0 kết quả | "Không tìm thấy cuộc trò chuyện" | Xoá ô tìm (nút xoá gốc của `type=search`) |
| Đang tải trang | Chunk ChatPage lười tải | `PageFallback` "Đang tải AI Chat…" | — |
| Đang nghĩ | Tin trả lời `isLoading` chưa có chữ | `ThinkingPill` "Đang suy nghĩ" có chấm chuyển động; nếu AI quyết định tìm web: pill "Smart Thinking" có shimmer. Không hiện giờ/hành động | Dừng |
| Đang chạy chữ | Có chữ, `isLoading` | Chữ hiện dần (gộp token mỗi 60 ms), cuộn bám đáy; ô nhập bị tắt; Gửi → Dừng | Dừng |
| Có dữ liệu | Có tin | Cột tin + ô soạn đáy; tin cuối có hành động ghim | Mọi hành động §4 |
| Nghiên cứu đang chạy | Tác vụ Nghiên cứu · Chuyên sâu, đang gửi | Tin người dùng → `ResearchStepsPanel` mở, tiến trình 6 pha; khi xong: thẻ "DEEP RESEARCH" chứa báo cáo | Dừng; ⓘ từng pha |
| Nghiên cứu đang dừng | Người dùng bấm Dừng (snapshot `deepResearchResumeState` còn, pha cuối ≠ tổng hợp) | Bảng có `data-waiting`, pha dở hiện "đang chạy"/"chưa chạy", dòng lý do + nút Tiếp tục; sidebar ghi "Chuyên sâu · đang dừng" màu cảnh báo | Tiếp tục (R4) |
| Nghiên cứu lỗi | Bước cuối lỗi, không có snapshot | Pha lỗi có chấm đỏ; "Bước {n} gặp lỗi. Các bước đã xong được giữ lại." | Thử lại bước {n} (R5) |
| Lỗi nhà cung cấp | Trả về lỗi (`localizeChatError`) | `RecoverableError` (`role=alert`, nền `ui-error-box`) với câu đã dịch: khoá không hợp lệ, vượt giới hạn ("Đã vượt giới hạn yêu cầu. Vui lòng chờ rồi thử lại."), mất mạng, quá thời gian, bị chặn an toàn/bản quyền, model từ chối, phản hồi rỗng | Thử lại, Đổi model hoặc khoá, Đóng |
| Lỗi giữa chừng | Lỗi sau khi đã có chữ | Chữ đã về giữ nguyên + khung lỗi nhỏ bên dưới | Tạo lại |
| Tìm web hỏng | Tavily/Brave từ chối khoá → dùng tìm miễn phí; hoặc mọi nguồn tìm đều hỏng | Toast cảnh báo "Tìm kiếm web đã chuyển sang bản miễn phí" / "Tìm kiếm web không hoạt động", 10 giây, nút "Mở Cài đặt" | Mở Cài đặt |
| Thiếu khoá / model | Provider đang chọn không phải local và chưa có khoá | Trạng thái trống: dòng "Chưa có API key. Vào Cài đặt để thêm." + nút "Mở Cài đặt" (`sm · primary · solid`). Chip model chấm vàng. Nút Tác vụ ẩn; Gửi tắt | Mở Cài đặt; đổi sang model local trong chip |
| Danh sách model đang tải / lỗi | Trong popover cấu hình AI | "Đang tải model…" / "Tải thất bại" theo từng provider | Tải lại (M6) |
| Đính kèm | Có ảnh chưa gửi | Thumbnail trên ô nhập; gợi ý nếu model không đọc ảnh | Bỏ ảnh, Gửi |
| Thu âm | `VoiceRecorder` bận | Ô nhập chỉ đọc, chữ tạm in nghiêng màu `--vzn-text-soft`; nút Gửi ẩn | Dừng thu, Huỷ thu âm |
| Lỗi giọng nói | Từ chối micro, lỗi chép | Toast (khoá `chat-voice-error`) với "Mở Cài đặt" khi sửa được ở đó | Mở Cài đặt, đóng |
| Ảnh mất | Ảnh trong phiên cũ không còn trong kho ảnh | Khung gạch "Ảnh này không còn được lưu trên thiết bị" | — |
| Module tắt | `enabledModules` không có Chat | `resolveActivePage` chuyển trang khác; mục điều hướng ẩn | — |

## 6. Luồng tương tác chính

### 6.1 Gửi một tin nhắn

1. Người dùng gõ vào ô nhập. Bản nháp được lưu theo cuộc trò chuyện ngay mỗi phím. Nút Gửi chuyển từ xám sang xanh khi có chữ.
2. Nhấn Enter (hoặc ⌘Enter nếu đã chọn) hoặc bấm Gửi. Shift+Enter xuống dòng ở chế độ Enter.
3. Nếu chưa có phiên, `ensureSession()` tạo phiên mới với provider/model đang chọn và hút bản nháp + tác vụ chờ. Popover tác vụ (nếu mở) đóng.
4. Cấu hình yêu cầu được chụp một lần (`requestConfiguration`: provider, model, system prompt, tác vụ, web) và lưu trên tin người dùng để Tạo lại dùng đúng cấu hình cũ.
5. Tin người dùng xuất hiện bên phải; ô nhập trống và bị tắt; Gửi → Dừng (đỏ nhạt). Tiêu đề phiên = dòng đầu tin.
6. Bong bóng trả lời hiện pill "Đang suy nghĩ". Với chữ không kèm ảnh, `smartThinkingService` tự quyết tìm web: nếu có, pill thành "Smart Thinking" rồi về "Đang suy nghĩ".
7. Token chạy vào cùng bong bóng (đệm 60 ms), cột cuộn theo.
8. Xong: thanh hành động ghim dưới tin (giờ, chi phí, Sao chép, Phản hồi tốt, Phản hồi chưa tốt, Tạo lại). Ô nhập bật lại.
9. Bấm Dừng bất kỳ lúc nào: phần chữ đã về được giữ, không có lỗi.

### 6.2 Đổi model giữa cuộc trò chuyện

1. Bấm chip "● Local · qwen3:4b" ở header. Popover "Cấu hình AI" mở dưới chip; mô tả "Áp dụng cho cuộc hội thoại này."; focus vào ô tìm model.
2. Danh sách hiện "Gần đây" rồi từng provider. Provider chưa có khoá ghi "Chưa có key"; provider đang tải ghi "Đang tải model…".
3. Chọn một model. Popover đóng, focus về chip, chip đổi tên.
4. Lựa chọn được ghi vào **phiên đã mở popover** (`bindToConversation`). Nếu danh sách tải xong muộn sau khi người dùng đã chuyển sang phiên khác, phiên mới không bị ghi đè (test "does not let a stale model response rewrite a newly selected conversation").
5. Tin kế tiếp dùng model mới. Các tin cũ vẫn Tạo lại bằng model đã lưu trên chúng.

### 6.3 Áp dụng một tác vụ (ví dụ Dịch sang tiếng Nhật)

1. Bấm "Tác vụ: Chat" trong ô soạn. Popover mở về phía có nhiều chỗ hơn (ô soạn giữa màn hình khi trống: thường mở xuống; ô soạn đáy: mở lên). Focus vào hàng đang chọn.
2. Chọn "Dịch" (click hoặc ↓). Ô "Ngôn ngữ đích" xuất hiện, mặc định ngôn ngữ giao diện; khung "Hướng dẫn gửi kèm" hiện "Dịch nội dung sau sang Tiếng Việt. Giữ nguyên ý nghĩa…".
3. Mở ô "Ngôn ngữ đích": menu neo dưới/trên trigger, nổi trên thân popover. Chọn "Tiếng Nhật"; menu đóng, focus về trigger; hướng dẫn đổi theo.
4. Bấm "Áp dụng". Popover đóng; nhãn nút thành "Tác vụ: Dịch · Tiếng Nhật"; placeholder "Nhập nội dung cần dịch…"; nút Nguồn web ẩn (Dịch không dùng web); sidebar ghi "Dịch · Tiếng Nhật" dưới tên cuộc.
5. "Bỏ", Esc hoặc click ngoài popover: không đổi gì.
6. Khi gửi, hướng dẫn được ghép trước nội dung trong yêu cầu gửi đi nhưng không hiện trong bong bóng; lựa chọn được chụp lại nên đổi tác vụ sau đó không ảnh hưởng tin đã gửi.

### 6.4 Nghiên cứu chuyên sâu: dừng và tiếp tục

1. Áp dụng "Nghiên cứu" + "Mức nghiên cứu: Chuyên sâu". Nút Nguồn web ẩn (nghiên cứu luôn tự tìm).
2. Gửi câu hỏi. Bảng "Nghiên cứu chuyên sâu · bước 1 / 6" xuất hiện dưới tin người dùng, tiến trình 6 pha, spinner ở đầu bảng.
3. Mỗi pha xong có ✓; Khảo sát/Đào sâu ghi số khía cạnh. Nút ⓘ của pha mở chi tiết.
4. Bấm Dừng (ô soạn). Pha đang chạy dừng; snapshot được lưu sau mỗi pha xong.
5. Bảng chuyển sang chờ: "Đã dừng ở bước 3. Các bước đã xong được giữ lại." + nút "Tiếp tục" (xanh, đặc). Sidebar: "Chuyên sâu · đang dừng".
6. Có thể đóng app; snapshot vẫn còn. Mở lại cuộc trò chuyện → bảng vẫn chờ.
7. Bấm "Tiếp tục": chạy từ pha kế tiếp với đúng provider/model lúc bắt đầu. Pha Tổng hợp tạo thẻ "DEEP RESEARCH" với báo cáo; bảng tự gập thành "Đã suy nghĩ · N bước".
8. Nếu người dùng gõ chữ vào ô soạn hoặc đổi tác vụ khỏi Nghiên cứu · Chuyên sâu, nút Tiếp tục ẩn (gửi tin mới sẽ xoá snapshot).

### 6.5 Đính kèm ảnh

1. Bấm "+" → "Thêm ảnh và tệp" → chọn ảnh; hoặc dán ảnh vào ô nhập; hoặc kéo thả vào bất cứ đâu trên trang (lớp `DragOverlay` hiện khi kéo).
2. Ảnh > 25 MB hoặc không phải ảnh: toast lỗi, ảnh không được thêm. Ảnh hợp lệ được thu về cạnh dài 1200 px.
3. Thumbnail hiện trên ô nhập với nút X. Nếu model không đọc ảnh: dòng gợi ý dưới thumbnail.
4. Gửi (được phép gửi ảnh không kèm chữ, trừ tác vụ Tạo ảnh). Tuỳ chữ đi kèm: chữ mang ý "sửa/đổi/xoá…" → API chỉnh ảnh; bật Nguồn web → Smart Thinking có tìm web; còn lại → chat thị giác (stream).
5. Ảnh được lưu vào kho ảnh của phiên để còn hiển thị khi mở lại.

### 6.6 Tạo ảnh

1. Áp dụng tác vụ "Tạo ảnh" (chỉ bật khi provider là Gemini/OpenAI). Placeholder: "Tạo ảnh từ văn bản, hoặc sửa ảnh đính kèm bằng AI".
2. Gõ mô tả, Gửi. AI viết lại thành prompt chi tiết (`planImageRequest`) và quyết định có sửa ảnh trước đó không.
3. Bong bóng hiện ảnh + chú thích "Ảnh đã tạo" kèm prompt đã dùng trong ngoặc kép. Hành động: Sao chép, Tải ảnh xuống, Sửa ảnh này, Phản hồi tốt, Phản hồi chưa tốt, Tạo lại.
4. "Sửa ảnh này" giữ tác vụ Tạo ảnh; lời nhắc tiếp theo chỉnh ảnh mới nhất.

### 6.7 Bắt đầu cuộc trò chuyện mới

1. Bấm "+" trên header hoặc nhấn ⌘N (Ctrl+N trên Windows/Linux).
2. Trang về trạng thái trống; header "AI Chat"; ô tìm lịch sử được xoá; lớp phủ lịch sử (nếu đang mở ở cửa sổ hẹp) đóng.
3. Phiên chỉ thực sự được tạo khi gửi tin đầu tiên. Lịch sử giữ tối đa 20 phiên; phiên cũ nhất bị bỏ khi vượt (`MAX_CHAT_SESSIONS`).

### 6.8 Xoá cuộc trò chuyện

1. Rê chuột hoặc Tab vào một hàng trong lịch sử; nút thùng rác hiện ở mép phải.
2. Bấm → cuộc trò chuyện bị xoá ngay. Nếu đó là cuộc đang mở, trang về trạng thái trống.
3. Không có xác nhận hay hoàn tác (đề xuất ở §10). Không có nút xoá trong vùng hội thoại (Chat Invariants trong `AGENTS.md`).

## 7. Responsive

Hai cơ chế độc lập: sidebar lịch sử theo **bề rộng cửa sổ** (`AI_CHAT_SIDEBAR_AUTO_COMPACT_BREAKPOINT = 900`, `window.innerWidth`); hình học cột chat theo **container `app-main`** (`src/styles/chat.css`).

| Bề rộng | Thay đổi |
| --- | --- |
| Cửa sổ ≥ 900 px | Sidebar lịch sử là cột cố định 264 px, ẩn/hiện theo lựa chọn đã lưu (`aiChatSidebarCollapsed`), độc lập với điều hướng chính. Thu gọn thì không chiếm bề rộng; nút H1 và Chat mới vẫn ở header. |
| Cửa sổ < 900 px | Lịch sử mặc định ẩn bất kể lựa chọn đã lưu (không ghi đè lựa chọn). H1 mở lớp phủ tạm `data-responsive-overlay` dưới header (đỉnh = `--vzn-page-header-min-height`), nền `--vzn-overlay-material`, bóng `--vzn-shadow-lg`; focus vào ô tìm; Esc đóng và trả focus về H1; click ngoài (trừ header) đóng; mở lớp phủ này thì đóng lớp phủ điều hướng chính. Chọn hàng hoặc Chat mới cũng đóng. |
| `app-main` ≥ 1200 px | Lề cột `--vzn-space-8` (≥ 1760: `--vzn-space-10`); cột đọc vẫn cap 760, thêm khoảng thở hai bên. |
| `app-main` 760–1199 px | Lề `--vzn-space-5` (760–999) / `--vzn-space-6` (1000–1199); cột 760. |
| `app-main` < 760 px | Cột tin, cột đọc và ô soạn chiếm 100%; lề `--vzn-space-3`; khoảng cách tin `--vzn-space-5`; bong bóng người dùng tối đa 88%; ô soạn cao tối thiểu 104 px. |
| `app-main` < 480 px | Tiêu đề trạng thái trống nhỏ xuống `--vzn-font-size-heading`; thanh công cụ ô soạn xếp thành hai hàng (trái: +, web, Tác vụ; phải: micro, Gửi căn phải). Nhãn "Tác vụ: …" cắt bằng dấu ba chấm. |
| Cửa sổ ≤ 720 px rộng hoặc ≤ 600 px cao | Popover Cấu hình AI và Tác vụ thành hộp giữa cửa sổ ngay dưới thanh tiêu đề (`ai-configuration.css`). |

## 8. Bàn phím và trợ năng

- **Thứ tự Tab:** điều hướng chính → H1 → (sidebar mở: ô tìm → từng hàng → nút xoá của hàng) → chip model → Chat mới → vùng tin (nút hành động của từng tin, bảng nghiên cứu) → ô soạn: + → Nguồn web → Tác vụ → ô nhập → Micro → Gửi/Dừng. Lưu ý: trong DOM ô nhập đứng **trước** thanh công cụ, nên Tab thực tế là ô nhập → + → web → Tác vụ → Micro → Gửi.
- **Phím tắt:** Enter hoặc ⌘/Ctrl+Enter gửi (Cài đặt › Chat › Phím gửi); ⌘/Ctrl+N chat mới (đổi được); Esc đóng popover/lớp phủ/menu chọn và trả focus về nút đã mở; ↑/↓ di chuyển trong danh sách tác vụ và menu chọn; Home/End trong menu chọn.
- **ARIA:**
  - Sidebar: `aside` có `aria-label="Các cuộc trò chuyện AI Chat"`, mỗi nhóm là `section aria-label="Hôm nay"`; hàng đang mở `aria-current="true"`; nhãn hàng gộp tên, provider, model, thời gian, số tin, "Tiếp tục nghiên cứu" nếu dang dở.
  - H1 `aria-expanded` + `aria-controls`; chip model và nút Tác vụ `aria-haspopup="dialog"` + `aria-expanded`; "+" `aria-haspopup="menu"`; Nguồn web `aria-pressed`; Chat mới `aria-keyshortcuts`.
  - Popover là `section role="dialog"` có `aria-labelledby` (tiêu đề) và `aria-describedby` (phạm vi). Danh sách tác vụ `role="listbox"`, hàng `role="option"` + `aria-selected`; tác vụ bị tắt có `aria-description` nêu lý do.
  - Vùng trạng thái: gợi ý ô soạn `role="status"`; trạng thái thu âm `aria-live="polite"`; lỗi tin nhắn `role="alert"`; dòng lý do nghiên cứu `role="status"`; danh sách model "Đang tải model…" `role="status"`, "Tải thất bại" `role="alert"`.
- **Focus khi mở/đóng:** popover cấu hình focus vào phần tử đánh dấu `data-ai-config-autofocus` (hàng tác vụ đang chọn) hoặc điều khiển đầu tiên; đóng bằng Esc/X/Bỏ trả focus về nút mở. Áp dụng tác vụ đưa focus về ô nhập. Lớp phủ lịch sử hẹp focus vào ô tìm.
- **Chuyển động:** chevron bảng nghiên cứu xoay `--vzn-duration-fast`; `prefers-reduced-motion` tắt transition của sidebar, nút gửi và thẻ gợi ý.

## 9. Nội dung chữ (vi)

Nguồn: `src/i18n/locales/vi.ts`.

| Khoá | vi |
| --- | --- |
| `nav_chat` | AI Chat |
| `chat_empty_desc` | Chúng ta nên bắt đầu từ đâu? |
| `chat_placeholder` | Hỏi bất kỳ điều gì… |
| `chat_send` / `chat_stop` | Gửi / Dừng |
| `chat_new_session` | Chat Mới |
| `chat_sidebar_search` | Tìm cuộc trò chuyện… |
| `chat_sidebar_today` / `chat_sidebar_this_week` / `chat_sidebar_earlier` | Hôm nay / Tuần này / Trước đó |
| `chat_sidebar_paused` | đang dừng |
| `chat_sidebar_collapse` / `chat_sidebar_expand` | Ẩn lịch sử trò chuyện / Hiện lịch sử trò chuyện |
| `chat_session_panel_empty` / `chat_sidebar_no_results` | Chưa có cuộc trò chuyện / Không tìm thấy cuộc trò chuyện |
| `history_chat_delete` | Xóa |
| `ai_configuration_title` | Cấu hình AI |
| `ai_configuration_chat_scope` / `ai_configuration_new_chat_scope` | Áp dụng cho cuộc hội thoại này. / Áp dụng cho cuộc hội thoại mới. |
| `model_loading` / `model_load_error` / `model_refresh` / `model_no_key` | Đang tải model… / Tải thất bại / Tải lại / Chưa có key |
| `chat_attach_image` / `chat_menu_attach_files` / `chat_remove_image` | Đính kèm ảnh / Thêm ảnh và tệp / Xóa ảnh |
| `chat_web_source` / `chat_web_source_hint` | Nguồn web / Tìm nguồn trên mạng cho yêu cầu này. |
| `chat_task_configuration` / `chat_task_none` | Tác vụ / Chat |
| `chat_task_scope` | Lưu theo cuộc trò chuyện, dùng cho tin nhắn tiếp theo. |
| `chat_suggest_translate` / `chat_suggest_research` / `chat_suggest_explain` / `chat_suggest_write` / `chat_mode_chip_image` | Dịch / Nghiên cứu / Giải thích / Viết lách / Tạo ảnh |
| `chat_task_language` / `chat_task_depth` / `chat_task_level` / `chat_task_format` | Ngôn ngữ đích / Mức nghiên cứu / Cách giải thích / Loại nội dung |
| `chat_task_overview` / `chat_task_deep` | Tổng quan nhanh / Chuyên sâu |
| `chat_task_instruction` | Hướng dẫn gửi kèm |
| `chat_task_apply` / `chat_task_discard` | Áp dụng / Bỏ |
| `chat_task_needs_content` | Nhập nội dung hoặc chủ đề trước khi gửi yêu cầu này. |
| `chat_image_mode_unsupported_provider` | Cần nhà cung cấp Gemini hoặc OpenAI |
| `chat_attachment_model_cannot_read` | Model này không đọc được ảnh. Chọn một model đọc được ảnh ở đầu trang để gửi. |
| `chat_voice_record` / `chat_voice_stop` / `voice_recording` / `voice_transcribing` / `voice_cancel` | Thu âm giọng nói / Dừng thu âm / Đang thu âm… / Đang chuyển văn bản… / Hủy thu âm |
| `chat_thinking_label` / `chat_smart_thinking_badge` | Đang suy nghĩ / Smart Thinking |
| `translate_copy` / `chat_copied` | Sao chép / Đã sao chép! |
| `chat_regenerate` | Tạo lại phản hồi |
| `chat_feedback_good` / `chat_feedback_bad` | Phản hồi tốt / Phản hồi chưa tốt |
| `chat_download_image` / `chat_edit_this_image` / `chat_open_image` | Tải ảnh xuống / Sửa ảnh này / Mở ảnh |
| `chat_image_generate_done` / `chat_image_edit_done` | Ảnh đã tạo / Ảnh đã chỉnh |
| `chat_used_model` | Trả lời bởi {model} (model đã chọn không khả dụng) |
| `chat_research_title` / `chat_research_step_of` | Nghiên cứu chuyên sâu / bước {current} / {total} |
| `chat_research_done_label` / `chat_research_steps_unit` | Đã suy nghĩ / bước |
| `chat_deep_research_step_analyze` … `_synth` | Phân tích · Khảo sát · Rà khoảng trống · Đào sâu · Đối chiếu · Tổng hợp |
| `chat_research_stopped` / `chat_research_failed` | Đã dừng ở bước {n}. Các bước đã xong được giữ lại. / Bước {n} gặp lỗi. Các bước đã xong được giữ lại. |
| `chat_deep_research_resume_short` / `chat_research_retry_step` | Tiếp tục / Thử lại bước {n} |
| `chat_deep_research_badge` | Deep Research |
| `chat_error_no_key` / `chat_error_open_settings` | Chưa có API key. Vào Cài đặt để thêm. / Mở Cài đặt |
| `chat_error_invalid_key` | API key không hợp lệ. Vui lòng kiểm tra trong Cài đặt. |
| `chat_error_rate_limit` | Đã vượt giới hạn yêu cầu. Vui lòng chờ rồi thử lại. |
| `chat_error_network` | Không thể kết nối mạng. Vui lòng kiểm tra Internet rồi thử lại. |
| `chat_error_timeout` | Yêu cầu mất quá lâu và đã bị hủy. Vui lòng thử lại. |
| `chat_error_retry` / `chat_error_change_model` | Thử lại / Đổi model hoặc khoá |
| `chat_web_search_fallback_title` / `chat_web_search_unavailable_title` | Tìm kiếm web đã chuyển sang bản miễn phí / Tìm kiếm web không hoạt động |
| `chat_image_unavailable` | Ảnh này không còn được lưu trên thiết bị |

## 10. Chênh lệch với bản dựng hiện tại

Bản vẽ gốc có mà app chưa có (tất cả là **đề xuất** cho tới khi được dựng):

1. **Đọc to** câu trả lời (`Chat.dc.html` có nút loa): mã không có hành động đọc to trong `MessageBubble.tsx`. Đề xuất: nút `xs · neutral · ghost` sau Sao chép, dùng TTS của hệ thống.
2. **Chip nguồn [1] [2] [3]** dưới câu trả lời có tìm web: Smart Thinking cố ý bỏ nguồn khỏi bong bóng (`ChatPage.tsx`, `onStepStart` "ignore … sources"). Đề xuất: hiện chip nguồn khi câu trả lời có dùng web.
3. **Tóm tắt đầu câu trả lời** "Nghiên cứu · tổng quan nhanh · 3 bước, 3 nguồn" dạng `<details>` cho chế độ Tổng quan: không có; Tổng quan nhanh chỉ là một hướng dẫn gửi kèm, không chạy pipeline.
4. **Pha nghiên cứu**: bản vẽ `ChatExtras` có 5 pha (Lập kế hoạch, Tìm nguồn, Đọc và trích dẫn, Đối chiếu, Viết báo cáo) và nút **Dừng ngay trong bảng**; mã có 6 pha khác tên và chỉ dừng bằng nút Dừng của ô soạn. Lý do dừng ("vì mất mạng") không được ghi nhận, chỉ có câu chung.
5. **Tệp không phải ảnh** (PDF có tên và dung lượng trong `ChatExtras`): input chỉ nhận `image/*`; nhãn menu "Thêm ảnh và tệp" vì vậy hứa nhiều hơn mã làm.
6. **Lời nhắc hệ thống trong popover model** (`Popovers.dc.html`): `ChatAIConfiguration` chỉ có phần "Mô hình". System prompt và preset chỉ chỉnh ở Cài đặt › Chat (`src/pages/settings/ChatPresetsSection.tsx`); chat dùng `chatSystemPrompt` toàn cục. `SystemPromptDropdown.tsx` chỉ còn được `ChatPageV2.tsx` dùng.
7. **Popover model kiểu phân đoạn provider + "Đã tải/Tải về" model local + "Model ID khác (nâng cao)"**: popover thật dùng danh sách trực tiếp có tìm, "Gần đây" và nhóm theo provider; không tải model Ollama từ đây.
8. **Trạng thái "chưa có AI nào"** (`States.dc.html`: chọn giữa "Cài AI local" và "Thêm khoá"): mã chỉ hiện một dòng chữ + "Mở Cài đặt".
9. **Lỗi nhà cung cấp có tiêu đề riêng + "Gửi bằng AI local"** (`States.dc.html`): `RecoverableError` chỉ có câu lỗi, "Thử lại", "Đổi model hoặc khoá".
10. **Ảnh tạo có chú thích "Gemini · [model ảnh]"**: chú thích thật là "Ảnh đã tạo" + prompt.
11. **Phím tắt hiện thành chip** cạnh Chat mới: CSS `.ai-chat-header-shortcut` có sẵn trong `codex.css` nhưng phím tắt chỉ nằm trong `title`.
12. **Gợi ý khởi đầu trên trạng thái trống**: CSS `.chat-suggestion-grid`, `.chat-starter-actions` và i18n `chat_suggest_*_prompt` còn, nhưng `ChatPage.tsx` không render thẻ gợi ý nào. Đề xuất: hoặc dựng lại hàng thẻ mở thẳng popover Tác vụ, hoặc xoá CSS/i18n thừa.

App có mà bản vẽ chưa thể hiện: nút Phản hồi tốt / chưa tốt, huy hiệu chi phí, ghi chú "Trả lời bởi … (model đã chọn không khả dụng)", pill Smart Thinking, ⓘ chi tiết từng pha, lightbox ảnh, bộ đếm ký tự > 600, toast dự phòng tìm web, gợi ý model không đọc ảnh.

Lỗi và mâu thuẫn tìm thấy khi đối chiếu mã (chưa sửa):

- **Nút Phản hồi tốt / chưa tốt không làm gì**: hai Button trong `MessageBubble.tsx` không có `onClick` và không có `aria-pressed`. Hoặc nối vào lưu phản hồi, hoặc bỏ.
- **"Thử lại bước {n}" chạy lại từ đầu**: `onRetry` gọi `handleRegenerate` → `restartChatResearch` cắt mọi bước sau tin người dùng và xoá snapshot, nên mọi pha chạy lại; nhãn hứa chỉ thử lại bước n.
- **Gửi bằng Enter không bỏ qua IME**: `shouldSendChatMessage` không kiểm tra `isComposing`/`keyCode 229`, trong khi `TranslationSourcePane`, `CommandPalette`, `QuickLauncher` có. Với bộ gõ tiếng Nhật (và bộ gõ tiếng Việt dùng khung soạn), Enter xác nhận chữ có thể gửi luôn tin.
- **Nhãn trợ năng của cả trang sai**: `div role="application" aria-label={t.chat_attach_image}` trong `ChatPage.tsx` khiến trình đọc màn hình gọi cả trang là "Đính kèm ảnh", và `role="application"` tắt chế độ duyệt.
- **Gửi ảnh cho model không đọc ảnh vẫn được phép**: câu `chat_attachment_model_cannot_read` nói "để gửi" nhưng điều kiện `disabled` của nút Gửi không xét `attachedImageReadable`.
- **Xoá cuộc trò chuyện không xác nhận, không hoàn tác** (`deleteChatSession`). Đề xuất: toast "Đã xoá" có nút Hoàn tác (một khoá chủ), hợp với "ưu tiên thao tác đảo ngược được".
- **Giới hạn 20 phiên cắt im lặng** (`MAX_CHAT_SESSIONS` trong `chatSlice.ts`): người dùng mất cuộc cũ không được báo.
- **Tiêu đề mặc định không dịch**: phiên mới có `title: 'New Chat'` cứng; tin chỉ có ảnh giữ tiêu đề tiếng Anh này trong header và lịch sử.
- **Ô nhập bị tắt khi đang trả lời**: `textarea disabled={isSending}` nên không thể soạn tin tiếp theo trong lúc chờ (nhất là nghiên cứu kéo dài vài phút). Đề xuất: chỉ khoá nút Gửi.
- **Esc không dừng câu trả lời**: chỉ có nút Dừng. Đề xuất: Esc khi focus trong ô soạn và đang gửi = Dừng.
- **Sidebar báo "đang dừng" khi nghiên cứu vẫn đang chạy**: `deepResearchService` lưu snapshot sau mỗi pha (`onResumeStateChange`), và `sessionMeta` trong `AIChatSidebar.tsx` chỉ xét snapshot có tồn tại và pha cuối ≠ `synth`, không xét phiên có đang chạy hay không. Bản vẽ `specs/chat.html#research` vẽ hành vi đúng ("Nghiên cứu · Chuyên sâu").
- **Pha bị dừng có thể hiện như đã xong**: khi huỷ, `onStepError` đặt `isLoading: false` và không có `error`, nên `getGroupStatus` trong `ResearchStepsPanel.tsx` coi pha đó là "done"; số bước trong "Đã dừng ở bước {n}" vì vậy có thể lệch một bước so với pha sẽ chạy lại khi Tiếp tục. Cần kiểm chứng trên app; bản vẽ vẽ pha dở ở trạng thái trung tính "đã dừng".
- **Nút Tiếp tục phụ thuộc tác vụ hiện tại**: đổi tác vụ khỏi Chuyên sâu làm nút biến mất dù snapshot còn; sidebar vẫn báo "đang dừng".
- **Nợ token trong vùng di trú**: menu "+" dùng nút gốc, `style` inline `width: 220, zIndex: 9999`, `w-[18px]`, `text-[--vzn-text-muted]` (`ChatPage.tsx`); `MessageBubble.tsx` và `ResearchStepsPanel.tsx` dùng màu Tailwind `text-gray-*`, `dark:bg-neutral-*` và popover chi tiết rộng 380 tính bằng số; `chat.css` còn số trần (`5px 9px`, `104px`, `44px`, `720px`, `.usage-cost-badge` 18/10/11 px). Nên chuyển về `var(--vzn-*)` và `--vzn-layer-context-overlay`.
- **Mã chết**: `src/pages/ChatPageV2.tsx` (932 dòng) không được route nào dùng, nhưng là nơi duy nhất còn dùng `SystemPromptDropdown`.
