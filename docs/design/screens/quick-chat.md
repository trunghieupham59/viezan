# Quick Chat (Hỏi AI trong cửa sổ nổi)

> Bản vẽ gốc: `boards/Launcher.dc.html`, `boards/LauncherStates.dc.html` · Board chi tiết: `specs/quick-chat.html` · Mã nguồn: `src/components/AIChatPopup.tsx` (`AIChatPopup`, `ActiveQACard`, `QAEntry`, `CardActions`), được gắn bởi `src/pages/QuickLauncher.tsx`; điểm vào renderer `quick-chat.html` → `src/quick-chat-main.tsx`; CSS `src/styles/codex.css` (mục "Quick chat"), `src/index.css` (`.quick-chat-*`, `@layer components`), `src/styles/launcher.css`; cửa sổ và IPC: `electron/main.ts` (`createQuickChatWindow`, `positionQuickChatWindow`, `toggleQuickChatWindow`), `electron/ipc/quickChat.ts`, `electron/services/quickAiSession.ts`; nhận bàn giao ở cửa sổ chính: `src/App.tsx` (`quickChat.onOpenInChat`)

Luật chung ở [`../foundations.md`](../foundations.md). Chế độ tìm của cùng cửa sổ ở [`launcher.md`](launcher.md) (mục "Chế độ Hỏi AI" ở đó là bản tóm tắt; tài liệu này là đặc tả đầy đủ). Trang AI Chat đầy đủ ở [`chat.md`](chat.md).

## 1. Mục đích

Quick Chat ("Hỏi AI", "AI nhanh", "Quick AI") là chế độ hỏi–đáp một chạm **bên trong cửa sổ Launcher nổi**, không phải một cửa sổ riêng. Người dùng đang làm việc ở ứng dụng khác, nhấn phím Launcher, gõ một câu hỏi rồi nhấn Tab hoặc ⌘↵, và đọc câu trả lời ngắn ngay trên màn hình hiện tại mà không cần mở cửa sổ chính. Mô hình được dặn trả lời ngắn, đúng ngôn ngữ câu hỏi và **không bao giờ hỏi lại** (`QUICK_AI_SYSTEM_PROMPT`). Thành công là: câu trả lời đọc được trong vài giây, sao chép được bằng một nút, và khi cần đào sâu thì ⌘↵ chuyển cả cuộc hỏi–đáp sang trang AI Chat mà không mất ngữ cảnh.

## 2. Điểm vào và điểm ra

Cửa sổ nổi chỉ có **một** điểm mở từ hệ thống: phím Launcher. Mọi lối vào Quick Chat đều đi qua chế độ tìm của Launcher (`QuickLauncher.tsx`, `execute` với `kind: 'ai' | 'continue'`).

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Phím tắt toàn cục | Phím Launcher (`hotkey.chat`, `electron/ipc/globalHotkey.ts` → `toggleQuickChatWindow`) | Mở Launcher ở **chế độ tìm**, chưa vào Quick Chat. Nhấn lần nữa khi đang hiện thì ẩn |
| Launcher, ô tìm có chữ | Tab, ⌘↵ / Ctrl+↵, hoặc hàng "Hỏi AI" | Chuyển `mode = 'chat'` và **tự gửi** chữ đã gõ (`launchRequest.text`). Nếu phiên Quick AI cập nhật < 30 phút (`QUICK_AI_FRESH_MS`), hàng đổi tên "Hỏi tiếp AI" và câu hỏi nối vào phiên đó |
| Launcher, ô tìm trống | Tab | Vào Quick Chat với ô hỏi trống (trạng thái trống), không gửi |
| Launcher, mục "Tiếp tục Quick AI" | Nhóm Viezan (phiên mới) hoặc Gần đây (phiên cũ hơn 30 phút) | Mở lại phiên đã lưu ở bất kỳ tuổi nào, không gửi gì |
| Bảng lệnh ⌘K (cửa sổ chính) | Chế độ hỏi AI của bảng lệnh | **Không** mở Quick Chat. Bảng lệnh có vùng trả lời riêng (`CommandPalette.tsx`, `.cmd-palette-answer`) chỉ dùng chung vài chuỗi `ai_chat_popup_*` |
| Khay hệ thống | — | Không có mục mở Quick Chat trong `electron/trayManager.ts` (chỉ chú thích rằng Quick Chat vẫn sống khi cửa sổ chính đóng) |
| Điểm ra: ẩn | Esc (bất kỳ lúc nào), bấm ra ngoài (`win.on('blur')` → `hide`), nhấn lại phím Launcher | Cuộc trò chuyện vẫn nằm trong bộ nhớ và trên đĩa; lần mở sau Launcher về **chế độ tìm** |
| Điểm ra: về tìm | Nút "Tìm kiếm" (`onBack`) | Cùng cửa sổ, giữ phiên |
| Điểm ra: sang AI Chat | "Mở trong Chat" hoặc ⌘↵ / Ctrl+↵ | `quickChat.openInChat(payload)`; cửa sổ nổi ẩn, cửa sổ chính hiện và tạo một phiên chat mới (xem §6.D) |
| Điểm ra: sang Cài đặt | Chip model ở footer, nút "Mở Cài đặt" khi thiếu khoá | `quickChat.openSettings()` → cửa sổ chính mở trang Cài đặt ở **mục mặc định** (`openSettings` trong `coreSlice.ts`, `settingsInitialSection: null`) |

## 3. Bố cục

Cửa sổ (`createQuickChatWindow`): rộng cố định **760 px** (`QUICK_CHAT_WIDTH`), không viền hệ thống, không đổi cỡ, không hiện trên thanh tác vụ, luôn trên cùng (mức `pop-up-menu`). Ở chế độ Quick Chat, renderer gọi `setLayout('expanded')` không kèm chiều cao nên cửa sổ luôn cao **540 px** (`QUICK_CHAT_EXPANDED_HEIGHT`). Đặt giữa ngang màn hình có con trỏ, mép trên cách đỉnh vùng làm việc **22 %** (`positionQuickChatWindow`). macOS: kiểu `panel` (hiện/ẩn không kích hoạt app chính), nền trong suốt, bóng hệ thống, vibrancy `popover` khi persona bật vật liệu; Windows: nền đặc theo bảng màu cửa sổ chính, bo `--vzn-radius-sm` (`launcher.css`, `data-popup-frame="native"`).

```
┌ .quick-chat-panel (760 × 540, bo --vzn-radius-lg, viền --vzn-border-strong, nền --vzn-surface) ──────────────┐
│ .quick-chat-header (nền --vzn-surface, kẻ dưới --vzn-divider)                                              │
│ [Tìm kiếm] [logo | +]  textarea "Hỏi bất cứ điều gì…" / "Hỏi tiếp..."                    [✕]   [➤ Gửi]     │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ .quick-chat-body (nền --vzn-surface-muted, cuộn dọc, padding 16)                                           │
│ ┌ QAEntry (lượt cũ, opacity 70 %) ───────────────────────────────────────────────────────────────────────┐ │
│ │ [Q] câu hỏi cũ                                                                                          │ │
│ │ câu trả lời cũ (Markdown)                                                     [Sao chép] [Tạo lại …]   │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌ ActiveQACard (cao tối thiểu = vùng nhìn − 32, ≥ 200) ──────────────────────────────────────────────────┐ │
│ │ .quick-chat-question-row  [Q] câu hỏi hiện tại                                                          │ │
│ │ ✦ Đang suy nghĩ… ▒▒▒▒▒▒  →  Markdown chảy dần  →  ô lỗi                                                 │ │
│ │ .quick-chat-card-actions                                                       [Sao chép] [Tạo lại …]   │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ .quick-chat-footer (nền --vzn-surface, kẻ trên --vzn-divider)                                              │
│ [● ◆ / GPT 5.4 Mini  ✦Smart Thinking · 2 lượt]                  [■ Dừng] [Sao chép] │ [Mở trong Chat → ⌘ ↵] │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Vỏ | `.quick-chat-shell` (`titlebar-drag`, kéo được cửa sổ) | `h-screen w-screen`, nền trong suốt, padding `--vzn-space-0` (`codex.css` ghi đè `10px` trong `index.css`) | — |
| Khung | `.quick-chat-panel` `<section aria-label="Hỏi AI">` | Viền `--vzn-border-strong`, nền `--vzn-surface`, bo `--vzn-radius-lg`, không bóng (bóng do hệ điều hành vẽ) | — |
| Header | `.quick-chat-header` | `px-3 py-2.5`, `gap-2`; nền `--vzn-surface`, kẻ `--vzn-divider`; các nút `md` (36) | — |
| Ô hỏi | `<textarea class="quick-chat-input-field">` | Một dòng, tự cao đến **120 px** (`--vzn-quick-chat-input-max-block`) rồi cuộn; chữ `--vzn-font-size-title` (16) đậm `--vzn-weight-medium`, màu `--vzn-text-strong`; placeholder `--vzn-text-muted` (`chat.css`); không viền, nền trong suốt | Trong ô |
| Thân | `.quick-chat-body` | `px-4 py-4`, nền `--vzn-surface-muted`; cột nội dung tối đa `--vzn-content-max` (980, rộng hơn cửa sổ, nên thực tế chiếm hết) | Có; lăn chuột ở header/footer cũng cuộn thân (`handleWheel`) |
| Thẻ hỏi–đáp | `.quick-chat-answer-card` | Viền `--vzn-border-strong`, nền `--vzn-surface`, bo `--vzn-radius-md`, viền `--vzn-border-width`; hàng câu hỏi `px-5 py-2.5` chữ `ui-caption` + huy hiệu `ai_chat_popup_question_badge` (VI "Hỏi", EN/JA "Q"; `ui-token-badge`); thân `px-5 py-4` chữ `ui-reader-text leading-7` | — |
| Hành động thẻ | `.quick-chat-card-actions` | `px-3 py-1.5`, kẻ trên, nút `xs` | — |
| Footer | `.quick-chat-footer` | `px-3 py-2`, nền `--vzn-surface`, kẻ trên `--vzn-divider`; mọi nút `xs` (28) | — |

## 4. Thành phần và hành động

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | "Tìm kiếm" | `md · neutral · ghost`, `shape="rect"` | Click | `onBack` → Launcher về chế độ tìm; phiên giữ nguyên | Ô tìm Launcher hiện | Chỉ có khi được gắn trong Launcher (luôn đúng ở bản hiện tại) |
| Q2 | Logo / Cuộc trò chuyện mới | `md · neutral · ghost`, icon vuông; chưa có lượt: logo app, có lượt: icon "+" | Click; ⌘N / Ctrl+N (chỉ khi có lượt, chữ, hoặc lỗi) | Huỷ luồng đang chạy (`cancelStream('discard')`), xoá lịch sử, xoá phiên trên đĩa (`session.clear`) | Thân về trạng thái trống, focus vào ô hỏi | `disabled` khi chưa có lượt nào (logo nằm trong nút xám) |
| Q3 | Ô hỏi | `textarea`, `aria-label="Hỏi AI"` | Gõ; Enter gửi, ⇧Enter xuống dòng. Nếu Cài đặt › Chat chọn kiểu gửi ⌘↵ (`chatSendShortcut === 'modEnter'`): ⌘↵ gửi, Enter xuống dòng | Gửi câu hỏi (`sendQuestion`) | Ô trống lại, thẻ mới chiếm khung | `disabled` trong lúc đang gửi |
| Q4 | Xoá chữ (✕ trong ô) | `xs · neutral · ghost`, icon, nhãn "Xoá" | Click | Ô trống, focus lại | — | Ẩn khi ô trống hoặc đang gửi |
| Q5 | Gửi | `md · primary · solid`, icon, nhãn "Gửi" | Click | Như Enter | Icon đổi thành spinner trong lúc gửi | `disabled` khi ô trống, vượt 3 000 ký tự (`MAX_CHAT_INPUT_CHARS`), đang gửi, hoặc thiếu khoá |
| Q6 | Chip model (footer) | `xs · neutral · ghost`: chấm trạng thái + `ProviderIcon` + "/ {model}" + huy hiệu "✦ Smart Thinking" + "· {n} lượt" | Click | `quickChat.openSettings()` — ẩn cửa sổ nổi, mở Cài đặt ở cửa sổ chính | — | Không bao giờ tắt; `title` "Đổi mô hình trong Cài đặt"; chấm `--vzn-success` (có khoá) / `--vzn-warning` (thiếu khoá) kèm chữ ẩn "Mô hình sẵn sàng" / "Chưa có key" |
| Q7 | Dừng | `xs · danger · ghost`, icon ■ + "Dừng" | Click | `cancelStream('stop')`: giữ phần đã nhận làm câu trả lời, lưu phiên, **không** đưa vào bộ nhớ đệm và không tính phí | Nút biến mất, Sao chép/Tạo lại hiện trong thẻ | Chỉ hiện khi đang gửi |
| Q8 | Sao chép (footer) | `xs · neutral · ghost` | Click | Chép câu trả lời của thẻ đang hoạt động | Icon ✓ + "Đã sao chép!" trong 1,2 s | `disabled` khi chưa có chữ trả lời |
| Q9 | Mở trong Chat | `xs · neutral · ghost` + `KeyCap` ⌘ ↵ | Click; ⌘↵ / Ctrl+↵ | `openInChat` mang theo câu hỏi, câu trả lời, các lượt trước, provider và model; nếu thành công thì popup xoá sạch và xoá phiên | Cửa sổ nổi ẩn, cửa sổ chính hiện trang AI Chat | Không bao giờ tắt; không có gì để mang thì chỉ mở trang AI Chat |
| Q10 | Sao chép / Tạo lại phản hồi (trong thẻ) | `xs · neutral · ghost` (`CardActions`) | Click | Sao chép: chép câu trả lời của thẻ đó. Tạo lại ở thẻ đang hoạt động: hỏi lại cùng câu với cùng lịch sử. Tạo lại ở thẻ cũ: **cắt bỏ mọi lượt sau** thẻ đó rồi hỏi lại | Thẻ về "Đang suy nghĩ…" | Thẻ đang hoạt động: chỉ hiện khi đã có câu trả lời hoặc lỗi và không đang gửi. Thẻ cũ: Tạo lại `disabled` khi đang gửi |
| Q11 | "Mở Cài đặt" (thiếu khoá) | `sm · neutral · outline` | Click | Như Q6 | — | Chỉ có khi thiếu khoá |
| Q12 | Esc | Phím (lắng nghe trên `window`) | Bất kỳ | **Ẩn cửa sổ** (`quickChat.hide`), không về chế độ tìm; luồng đang chạy vẫn tiếp tục ở nền | — | — |
| Q13 | Lăn chuột | — | Lăn ở header/footer/khoảng trống | Cuộn thân hội thoại | — | — |

Ngữ cảnh gửi cho mô hình (`buildMessages`): tối đa **6 cặp** gần nhất và **6 000 ký tự**, chỉ lấy cặp đủ cả hỏi và đáp, cộng câu hỏi mới. Phiên lưu trên đĩa (`userData/quick-ai-session-v1.json`) giữ tối đa **10 cặp** (`MAX_PERSISTED_TURNS = 20` lượt, khớp `MAX_QUICK_AI_TURNS` ở main). Smart Thinking chỉ chạy bước tìm web khi câu hỏi có dấu hiệu cần thông tin mới (`needsWebSearchHeuristic`); "Careful Reasoning" chỉ bật khi câu hỏi có số (`shouldUseCarefulReasoning`). Câu hỏi đầu tiên **không có ngữ cảnh** đến từ Launcher được lưu đệm 10 phút (tối đa 20 câu, khoá theo provider + model + câu hỏi đã chuẩn hoá); gõ lại đúng câu đó trả lời ngay, không gọi mô hình. Hỏi tiếp và Tạo lại luôn gọi mô hình.

## 5. Trạng thái

Thứ tự ưu tiên trong thân (`AIChatPopup.tsx`): thiếu khoá → nội dung quá dài → trống → hội thoại.

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống | Vào chế độ AI với ô trống, hoặc sau "Cuộc trò chuyện mới" | Logo trong vòng tròn, kicker "AI NHANH", tiêu đề "Hỏi AI", mô tả "Nhập câu hỏi ngắn gọn hoặc dán ngữ cảnh cần AI hỗ trợ.", bảng phím ↵ Gửi · ⇧↵ Xuống dòng · ⌘↵ Mở trong Chat · Esc Đóng. Logo ở header `disabled`, Gửi `disabled` | Gõ, Esc, ⌘↵ (mở trang AI Chat trống) |
| Đang gõ | Ô có chữ | Placeholder biến mất, nút ✕ xuất hiện trong ô, Gửi bật | Q3–Q5 |
| Đang nghĩ | Đã gửi, chưa có chữ trả lời | Thẻ có câu hỏi + `ThinkingPill` "Đang suy nghĩ" (`role="status"`, `aria-live="polite"`) hoặc "Smart Thinking" có hiệu ứng quét khi đang tìm web; 3 dòng skeleton. Ô hỏi khoá, Gửi là spinner, footer có "Dừng" | Dừng, Esc |
| Đang chảy | Token đầu tiên về | Pill và skeleton biến mất; Markdown hiện dần trong thẻ | Dừng, Sao chép (footer) |
| Có câu trả lời | Luồng kết thúc | Sao chép / Tạo lại phản hồi trong thẻ; footer "· n lượt"; logo header thành "+"; placeholder "Hỏi tiếp..." | Q2, Q6–Q10, hỏi tiếp |
| Nhiều lượt | Hỏi tiếp | Lượt trước gập lên thành `QAEntry` mờ 70 %; thẻ mới được cuộn mượt lên đầu và cao bằng vùng nhìn, nên lượt cũ chỉ thấy khi cuộn lên | Tạo lại ở bất kỳ lượt nào |
| Câu trả lời dài | Nội dung vượt chiều cao thẻ | Thẻ đang hoạt động cao lên theo nội dung; **cả thân** cuộn (không có cuộn riêng trong thẻ). Không tự cuộn theo token mới: đầu câu trả lời đứng yên, người dùng tự cuộn xuống | Cuộn, Sao chép |
| Đã dừng | Bấm Dừng | Phần đã nhận ở lại như một câu trả lời bình thường, không có dấu hiệu "đã dừng" | Tạo lại, hỏi tiếp |
| Lỗi nhà cung cấp | `onAnswerError` hoặc ngoại lệ | Ô `ui-error-box` (nền `--vzn-danger-soft`, viền `--vzn-danger-border`) với thông điệp đã bản địa hoá (`localizeChatError` / `localizeChatException`, mặc định "Không thể nhận phản hồi" / "Lỗi không mong đợi"); Sao chép `disabled`, Tạo lại bật. Lượt lỗi **không** được lưu vào phiên | Tạo lại, Cuộc trò chuyện mới, sửa câu và gửi lại |
| Thiếu khoá | Nhà cung cấp đang chọn (khác `local`) chưa có khoá trong keychain | Thay toàn bộ thân: logo, "Chưa có API key. Vào Cài đặt để thêm.", nút "Mở Cài đặt" (`sm · neutral · outline`). Gửi `disabled`; chip footer chấm `--vzn-warning` + chữ ẩn "Chưa có key" | Q11, Q6 |
| Chưa chọn model | `selectedModels[provider]` rỗng | Chip footer ghi "/ default" (chưa dịch); vẫn gửi được, nhà cung cấp dùng model mặc định | Q6 |
| Nội dung quá dài | Chữ đã cắt khoảng trắng > 3 000 ký tự | Thay **toàn bộ thân** (che cả hội thoại) bằng "{n} / 3.000" + "Nội dung quá dài. Rút gọn để gửi." | Sửa chữ |
| Mở lại sau khi ẩn | Esc / mất focus rồi mở lại | Launcher ở chế độ tìm; "Hỏi tiếp AI" / "Tiếp tục Quick AI" đưa về đúng cuộc trò chuyện | — |
| Module tắt | Module `launcher` tắt (`electron/modules/appModules.ts`) | Cửa sổ nổi bị ẩn và handler IPC không đăng ký; phím Launcher không mở được gì | — |

## 6. Luồng tương tác chính

**A. Hỏi nhanh từ Launcher**
1. Nhấn phím Launcher → cửa sổ 760 px hiện ở 22 % chiều cao màn hình, chế độ tìm.
2. Gõ "giải thích REST ngắn gọn", nhấn Tab → cửa sổ cao lên 540 px, chế độ AI; ô hỏi được điền rồi gửi ngay khi kiểm tra khoá xong (`checkedProvider === selectedProvider`).
3. Thẻ hiện câu hỏi + "Đang suy nghĩ" + skeleton; footer có "Dừng".
4. Chữ chảy về dạng Markdown. Xong: "Sao chép", "Tạo lại phản hồi" trong thẻ; footer "· 1 lượt"; logo thành "+".
5. Bấm "Sao chép" ở footer → "Đã sao chép!" 1,2 s. Esc → cửa sổ ẩn.

**B. Hỏi tiếp**
1. Gõ "ví dụ?" + Enter → lượt 1 gập thành thẻ mờ phía trên, lượt 2 được cuộn lên đầu và chiếm khung.
2. Mô hình nhận tối đa 6 cặp gần nhất làm ngữ cảnh.
3. Ẩn cửa sổ, mở lại trong 30 phút, gõ câu mới → hàng "Hỏi tiếp AI" nối vào cuộc này; sau 30 phút, "Hỏi AI" bắt đầu cuộc mới còn "Tiếp tục Quick AI" ở nhóm Gần đây mở lại cuộc cũ.

**C. Dừng và tạo lại**
1. Trong lúc chảy, bấm "Dừng" → luồng dừng, phần đã nhận giữ lại, nút Dừng biến mất.
2. Bấm "Tạo lại phản hồi" trong thẻ → phần cũ bị bỏ, thẻ về "Đang suy nghĩ".
3. Ở một thẻ cũ, "Tạo lại phản hồi" xoá mọi lượt sau thẻ đó (không hỏi xác nhận) và đưa câu hỏi đó về làm thẻ đang hoạt động.

**D. Bàn giao sang AI Chat**
1. Ở trạng thái có câu trả lời, nhấn ⌘↵ (hoặc bấm "Mở trong Chat").
2. Popup gửi `{ question, response, history, provider, model }`. Nếu ô hỏi đang có nháp chưa gửi, câu hỏi là nháp, `response` bỏ trống, và cặp vừa trả lời được đưa vào `history`.
3. Main kiểm tra payload (`parseQuickChatSeedPayload`: provider hợp lệ, độ dài, các cặp xen kẽ), ẩn cửa sổ nổi, hiện và focus cửa sổ chính.
4. `App.tsx` tạo **một phiên chat mới** với đúng provider/model của popup, chèn các lượt `history`, rồi: có `response` → chèn cặp hỏi–đáp cuối; không có → đặt câu hỏi làm **nháp** trong ô soạn tin. Chuyển sang trang AI Chat.
5. Popup xoá sạch và xoá phiên đã lưu; lần sau Launcher không còn gợi ý "Tiếp tục Quick AI" cho cuộc này. Từ đây cuộc trò chuyện tiếp tục như mọi phiên AI Chat khác.

**E. Thiếu khoá**
1. Vào chế độ AI với nhà cung cấp chưa có khoá → thân hiện "Chưa có API key…" + "Mở Cài đặt"; câu hỏi từ Launcher nằm trong ô nhưng không được gửi.
2. Bấm "Mở Cài đặt" → cửa sổ nổi ẩn, cửa sổ chính mở trang Cài đặt (mục mặc định, không nhảy thẳng tới Mô hình AI).
3. Thêm khoá, mở lại Launcher → popup đọc lại cấu hình (`useAppStore.persist.rehydrate()` mỗi lần hiện) và kiểm tra lại khoá.

## 7. Responsive

Cửa sổ có kích thước cố định, người dùng không đổi cỡ được (`resizable: false`); không có ngưỡng bề rộng.

| Kích thước | Thay đổi |
| --- | --- |
| 760 × 540 (luôn, ở chế độ AI) | Bố cục như §3. Các phần `sm:` (huy hiệu Smart Thinking, "· n lượt", `KeyCap` ⌘↵ ở footer) luôn hiện vì 760 ≥ 640 |
| Màn hình nhỏ / nhiều màn hình | Đặt theo vùng làm việc của màn hình có con trỏ; không co lại theo màn hình |
| Ô hỏi nhiều dòng | Header cao lên đến khi ô đạt 120 px rồi ô tự cuộn; thân co lại tương ứng |
| Thẻ đang hoạt động | Cao tối thiểu = chiều cao vùng nhìn của thân − 32 px (không dưới 200 px), đo bằng `ResizeObserver` |

## 8. Bàn phím và trợ năng

- Focus: mỗi lần hiện và sau mỗi câu trả lời, focus về ô hỏi (`focusInput`, trễ 30 ms). Không có Tab trap; Tab đi theo thứ tự: Tìm kiếm → logo/+ → ô hỏi → ✕ → Gửi → thẻ (Sao chép, Tạo lại) → footer (chip model, Dừng, Sao chép, Mở trong Chat).
- Phím: Enter / ⇧Enter (hoặc ⌘↵ / Enter theo `chatSendShortcut`), ⌘N / Ctrl+N cuộc mới, ⌘↵ / Ctrl+↵ mở trong Chat, Esc ẩn cửa sổ. Phím ⌘ trên macOS, Ctrl nơi khác (`isPrimaryModifierShortcut` loại trừ Alt/Shift).
- Nhãn: `section` và `textarea` có `aria-label="Hỏi AI"`; Gửi "Gửi"; ✕ "Xoá"; logo/+ có `aria-label` "AI nhanh" / "Cuộc trò chuyện mới (⌘+N)".
- Vùng sống: `ThinkingPill` có `role="status"` `aria-live="polite"`; vùng câu trả lời có `aria-live="polite"` + `aria-busy` khi đang gửi. Ô lỗi **không** có `role="alert"` (chỉ được đọc lịch sự trong vùng câu trả lời); "Đã sao chép!" không được đọc.
- Kéo cửa sổ: toàn bộ vỏ là vùng kéo (`titlebar-drag`); mọi điều khiển và thẻ có `titlebar-no-drag`, chữ câu hỏi chọn được (`select-text`).
- Không có vòng focus ngoài (`*:focus-visible { outline: none }` trong `codex.css`); nút dùng viền trong `--vzn-focus-ring`.

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `ai_chat_popup_title` | Hỏi AI |
| `ai_chat_popup_short_label` | AI nhanh |
| `ai_chat_popup_placeholder` | Hỏi bất cứ điều gì… |
| `ai_chat_popup_placeholder_mod_enter` | Hỏi bất cứ điều gì… ({mod}+Enter để gửi) |
| `ai_chat_popup_followup_placeholder` | Hỏi tiếp... |
| `ai_chat_popup_empty_desc` | Nhập câu hỏi ngắn gọn hoặc dán ngữ cảnh cần AI hỗ trợ. |
| `ai_chat_popup_open_in_chat` | Mở trong Chat |
| `ai_chat_popup_input_too_long` | Nội dung quá dài. Rút gọn để gửi. |
| `ai_chat_popup_new_line` / `ai_chat_popup_close` | Xuống dòng / Đóng |
| `ai_chat_popup_turns` | {count} lượt |
| `launcher_back` | Tìm kiếm |
| `launcher_ai` / `launcher_ai_followup` / `launcher_continue` | Hỏi AI / Hỏi tiếp AI / Tiếp tục Quick AI |
| `chat_send` / `chat_stop` / `chat_clear` | Gửi / Dừng / Xoá |
| `chat_copy` / `chat_copied` / `chat_regenerate` | Sao chép / Đã sao chép! / Tạo lại phản hồi |
| `chat_thinking` / `chat_smart_thinking_badge` / `chat_smart_thinking_hint` | Đang suy nghĩ… / Smart Thinking / AI tự phân tích và tìm web khi cần |
| `chat_error_no_key` / `chat_error_open_settings` | Chưa có API key. Vào Cài đặt để thêm. / Mở Cài đặt |
| `chat_error_failed_response` / `chat_error_unexpected` | Không thể nhận phản hồi / Lỗi không mong đợi |
| `ai_chat_popup_new_conversation` / `ai_chat_popup_short_label` | Cuộc trò chuyện mới ({shortcut}) / AI nhanh |
| `ai_chat_popup_change_model` / `ai_chat_popup_model_default` | Đổi mô hình trong Cài đặt / mặc định |
| `ai_chat_popup_question_badge` / `ai_chat_popup_model_ready` / `model_no_key` | Hỏi / Mô hình sẵn sàng / Chưa có key |

## 10. Chênh lệch với bản dựng hiện tại

Lỗi (hành vi sai, nên sửa trong mã):

1. **Gợi ý phím sai khi chọn kiểu gửi ⌘↵.** Với `chatSendShortcut === 'modEnter'`, placeholder nói "(Cmd+Enter để gửi)" nhưng bảng phím ở trạng thái trống vẫn ghi cứng "↵ Gửi · ⇧↵ Xuống dòng · ⌘↵ Mở trong Chat". Thêm nữa, ô hỏi bắt ⌘↵ để gửi và `stopPropagation`, nên khi focus ở ô hỏi (gần như luôn vậy) ⌘↵ **không** mở trong Chat dù `KeyCap` ở footer nói có. Đề xuất: bảng phím đọc `chatSendShortcut`; ở chế độ này dùng phím khác (ví dụ ⌘⇧↵) cho "Mở trong Chat".
2. **"Mở trong Chat" thất bại thì im lặng.** Nếu main từ chối payload (ví dụ câu trả lời > 80 000 ký tự, `MAX_QUICK_CHAT_RESPONSE_CHARS`) hoặc cửa sổ chính không có, `openInChat` trả `success: false` và popup không báo gì.
3. **Sao chép không bắt lỗi.** `handleCopy` không có `try/catch`; khi `clipboard.writeText` bị từ chối thì lời hứa bị từ chối không ai xử lý và không có phản hồi.
4. **Nội dung quá dài che cả hội thoại.** Khi gõ câu hỏi tiếp > 3 000 ký tự, thân thay toàn bộ bằng bộ đếm; câu trả lời đang đọc biến mất cho tới khi rút gọn. Đề xuất: hiện bộ đếm dưới ô hỏi, giữ hội thoại.
5. **Câu hỏi bị lỗi rơi mất khi bàn giao.** Nếu thẻ đang hoạt động bị lỗi và ô hỏi có nháp, `handleOpenInChat` chỉ mang `history` + nháp; câu hỏi bị lỗi không đi theo.
6. **Chú thích đầu tệp lỗi thời.** `AIChatPopup.tsx` nói phiên tồn tại "within a 5-minute TTL" và "Mounted by quick-chat.html"; thực tế phiên lưu trên đĩa không hết hạn (Launcher coi < 30 phút là "mới"), và component luôn được `QuickLauncher` gắn kèm `onBack`. Nhánh độc lập (không `onBack`: tự đăng ký `onShow`, tự gắn lớp `quick-chat-window`) hiện là mã chết trong bản dựng.

Trợ năng và nội dung:

8. **Thiếu `role="alert"`** cho ô lỗi (vùng câu trả lời đã có `aria-live="polite"` + `aria-busy`), và "Đã sao chép!" không được thông báo. Bảng lệnh ⌘K dùng `role="alert"` cho lỗi — nên dùng cùng mẫu.
9. **Chip model `xs`** trong khi `foundations.md` §6 quy định chip model dùng `sm`; footer thống nhất `xs` nên chấp nhận được, nhưng cần ghi thành ngoại lệ hoặc sửa cả footer.
10. **Trạng thái đã dừng không có dấu hiệu.** Câu trả lời bị dừng giữa chừng trông như câu trả lời hoàn chỉnh. Đề xuất: dòng chú thích nhỏ "Đã dừng" dưới câu trả lời.
11. **Câu trả lời lấy từ bộ nhớ đệm không có dấu hiệu.** Gõ lại cùng câu trong 10 phút trả kết quả cũ tức thì mà không nói; người dùng chỉ biết bấm "Tạo lại phản hồi" nếu đã hiểu cơ chế. **Đề xuất** một nhãn nhỏ.
12. **Tạo lại ở thẻ cũ xoá các lượt sau mà không hỏi** (giống ChatGPT, nhưng không có hoàn tác).

Nợ thiết kế (giá trị thô cần chuyển sang `tokens.css`):

13. `AIChatPopup.tsx`: còn `minHeight: viewportHeight − 32 / 200` tính lúc chạy qua `style`, và `opacity-70` (Tailwind) cho thẻ cũ. Màu, bóng và bề rộng đã chuyển sang lớp trong `codex.css` dùng token.

Khác biệt với bản vẽ / đề xuất:

14. **Esc ẩn cả cửa sổ** thay vì về chế độ tìm (đã nêu ở `launcher.md` §10.4). Đề xuất giữ nguyên: Esc lần một về tìm, lần hai ẩn.
15. **Nút Gửi không thành nút Dừng.** Trong lúc gửi, Gửi là spinner `disabled` ở header, còn "Dừng" ở footer cách xa. AI Chat chính đổi chỗ Gửi thành Dừng (`src/pages/ChatPage.tsx`, `.chat-stop-button`); **đề xuất** làm giống để chuột không phải đi xa.
16. **Không tự cuộn theo câu trả lời dài**: chỉ cuộn khi bắt đầu lượt mới. Có thể là chủ ý (đọc từ đầu); nếu giữ thì nên có nút "Xuống cuối" khi câu trả lời vượt khung (**đề xuất**).
17. **Không có tệp đính kèm, ảnh, chọn model hay chọn nhà cung cấp trong popup**: popup luôn dùng provider/model đang chọn ở cửa sổ chính, chỉ đổi được qua Cài đặt. Chọn model ngay trong popup là **đề xuất**.
18. **Không có lối vào từ khay hệ thống hay bảng lệnh ⌘K**; "Hỏi AI" trong ⌘K là một bề mặt trả lời khác, có bộ nút riêng. Hợp nhất hai bề mặt là **đề xuất**.
19. "Mở Cài đặt" mở mục mặc định của Cài đặt, không nhảy tới Cài đặt › Mô hình AI như `foundations.md` §12 yêu cầu cho trạng thái thiếu khoá.
