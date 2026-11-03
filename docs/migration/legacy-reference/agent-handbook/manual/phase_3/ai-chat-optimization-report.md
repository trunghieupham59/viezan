# Phase 3 — AI Chat Optimization Report

> **Mục đích**: Đánh giá toàn diện tính năng AI Chat hiện tại của Viezan, đề xuất các tối ưu hoá những gì đã có và bổ sung tính năng mới để hoàn thiện trải nghiệm.
>
> **Phạm vi**: Cả Quick Chat popup và ChatPage chính, layer renderer + preload + Electron Main IPC, store, services, types, i18n.
>
> **Trạng thái**: Đề xuất (chưa implement). Báo cáo này dùng để chốt scope trước khi triển khai.
>
> **Tác giả**: Cline AI agent · 2026-05-05

---

## Mục lục

1. [Tổng quan kiến trúc hiện tại](#1-tổng-quan-kiến-trúc-hiện-tại)
2. [Tính năng đã có](#2-tính-năng-đã-có)
3. [Vấn đề & cơ hội tối ưu hoá](#3-vấn-đề--cơ-hội-tối-ưu-hoá)
4. [Tính năng đề xuất bổ sung](#4-tính-năng-đề-xuất-bổ-sung)
5. [Roadmap 3 Phase](#5-roadmap-3-phase)
6. [Kiến trúc target sau refactor](#6-kiến-trúc-target-sau-refactor)
7. [Risks & Migration plan](#7-risks--migration-plan)
8. [Success metrics](#8-success-metrics)

---

## 1. Tổng quan kiến trúc hiện tại

### 1.1 Sơ đồ tổng thể

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          RENDERER (React)                               │
│                                                                         │
│   ┌──────────────────┐         ┌─────────────────────────────────┐      │
│   │  AIChatPopup     │         │  pages/ChatPage                 │      │
│   │  (1071 LOC)      │         │  (1235 LOC)                     │      │
│   │  Quick Chat      │         │  Full chat view                 │      │
│   └────────┬─────────┘         └──────────────┬──────────────────┘      │
│            │                                  │                         │
│            └────────┬─────────────────────────┘                         │
│                     ▼                                                   │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  services/chatService.ts (139 LOC)                          │       │
│   │  smartThinkingService.ts (621) · deepResearchService.ts(549)│       │
│   └────────────────────┬────────────────────────────────────────┘       │
│                        ▼                                                │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  store/slices/chatSlice.ts (186 LOC) — Zustand              │       │
│   │  chatSessions[], activeChatSessionId, systemPromptPresets   │       │
│   └─────────────────────────────────────────────────────────────┘       │
└──────────────────────────────│──────────────────────────────────────────┘
                               │ window.api.chat / chatStream / editChatImage
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          PRELOAD                                        │
│   electron/preload/chat.ts                                              │
│   └─ ipcRenderer.invoke('chat:send' | 'chat:stream' | 'chat:image-edit')│
└──────────────────────────────│──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          ELECTRON MAIN                                  │
│                                                                         │
│   electron/ipc/chat.ts (1144 LOC) ── monolith                           │
│   ├─ chatWithGemini      / streamChatWithGemini                         │
│   ├─ chatWithClaude      / streamChatWithClaude                         │
│   ├─ chatWithOpenAI      / streamChatWithOpenAI                         │
│   ├─ chatWithLocal       / streamChatWithLocal                          │
│   ├─ editChatImageWithOpenAI / editChatImageWithGemini                  │
│   └─ registerChatHandlers(ipcMain)                                      │
│                                                                         │
│   chatConfig.ts · chatPrompts.ts · chatMessages.ts · chatValidation.ts  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Bảng LOC từng module

| Module | File | LOC | Vai trò |
|---|---|---:|---|
| FE Quick Chat | `src/components/AIChatPopup.tsx` | **1071** | Popup Raycast-style, 1 Q&A card đầy viewport |
| FE Full Chat | `src/pages/ChatPage.tsx` | **1235** | Trang chat full trong app, multi-session |
| Service IPC wrapper | `src/services/chatService.ts` | 139 | `send`, `stream`, `editImage`, `cancelChatStream` |
| Service AI | `src/services/smartThinkingService.ts` | 621 | 1-step web search → reasoning |
| Service AI | `src/services/deepResearchService.ts` | 549 | Multi-step research pipeline |
| Store slice | `src/store/slices/chatSlice.ts` | 186 | sessions, presets, cost tracking |
| Backend IPC monolith | `electron/ipc/chat.ts` | **1144** | Tất cả providers + IPC + image edit |
| Backend config | `electron/ipc/chatConfig.ts` | ~110 | channels, model token map |
| Backend prompts | `electron/ipc/chatPrompts.ts` | ~? | system prompt enforcement |
| Backend validation | `electron/ipc/chatValidation.ts` | ~? | parseChatParams |
| Backend messages | `electron/ipc/chatMessages.ts` | ~? | i18n catalog |
| Preload | `electron/preload/chat.ts` | ~85 | bridge `window.api.chat*` |
| **Total chat-only** | | **~5500** | |

### 1.3 Kênh IPC

| Channel | Direction | Payload |
|---|---|---|
| `chat:send` | invoke | `{provider, model, messages, systemPrompt?, bypassLengthCheck?, maxOutputTokens?}` → `ChatResult` |
| `chat:stream` | invoke | `…+ requestId` → `ChatResult` (kèm event push) |
| `chat:stream:event` | push (main→renderer) | `ChatStreamEvent {requestId, type, token?, reply?, error?}` |
| `chat:stream:cancel` | invoke | `{requestId}` → `void` |
| `chat:image-edit` | invoke | `{provider, model, prompt, imageBase64, imageMimeType}` → `ChatImageEditResult` |

### 1.4 Types nòng cốt

```ts
// src/types/index.ts (lines 314–401)
ChatMessageContent { type: 'text' | 'image'; text?; imageBase64?; imageMimeType?;
                    imagePreviewUrl?; imageFileName? }
ChatMessage        { id, role, content[], timestamp, isLoading?, error?,
                    isResearchStep?, isSmartThinkingStep?, cost? }
ChatSession        { id, title, provider, model, messages[], createdAt, updatedAt, cost? }
ChatResult         { success, reply?, error?, errorCode? } // + 8 errorCode enums
ChatStreamEvent    { requestId, type: 'start'|'token'|'end'|'error', ... }
SystemPromptPreset { id, name, content, isDefault }
QuickChatSeedPayload { question, ... }
```

---

## 2. Tính năng đã có

### 2.1 Provider & Model
- ✅ **4 providers**: Gemini, Claude, OpenAI, Local (Ollama / LM Studio / llama.cpp via OpenAI-compatible API)
- ✅ **Model selector** (`ModelSelector.tsx`) với pattern allow/deny lists trong `chatConfig.ts`
- ✅ **Model output token resolution** động (Gemini `getMaxOutputTokens()` + family heuristics)
- ✅ **Local provider** không yêu cầu keychain — discover endpoint runtime

### 2.2 Streaming & Cancel
- ✅ Streaming token-by-token cho cả 4 providers (`chat:stream` + `chat:stream:event`)
- ✅ `AbortController` phía renderer — `handleStop` → `cancelChatStream(requestId)` → main process abort underlying request
- ✅ Sentinel `CHAT_STREAM_CANCELLED_ERROR_CODE = 'CANCELLED'` để renderer suppress error UI
- ✅ Fallback non-stream IPC nếu preload outdated

### 2.3 Multi-session
- ✅ Sessions cap **20**, oldest auto-trimmed (`chatSlice.ts:59`)
- ✅ Auto-generate title từ user message đầu tiên (regex strip markdown)
- ✅ Per-session cost accumulation (`addChatSessionCost`)
- ✅ Switch / Delete / Clear / New session

### 2.4 Multi-modal (Vision + Image Edit)
- ✅ Đính kèm 1 ảnh / message qua: file picker, drag-drop, paste clipboard
- ✅ Resize trước upload (`MAX_CHAT_IMAGE_DIMENSION = 1200px`)
- ✅ Image edit qua OpenAI (`gpt-image-1`, DALL-E variants) và Gemini (image-out models)
- ✅ Intent detection regex (`IMAGE_EDIT_INTENT_PATTERN`) phát hiện route image-edit vs chat
- ✅ Save / Copy / Open generated image

### 2.5 Voice & Speech
- ✅ Voice input (`useVoiceInput` hook + `VoiceRecorder` component) — VAD + Whisper
- ✅ Visual bars animation khi recording
- ✅ Live transcript prefix into input

### 2.6 Markdown & Rendering
- ✅ `MarkdownText` component — render markdown response với code highlighting
- ✅ Copy as plain / markdown / per-code-block (đã có nút Copy)
- ✅ Bouncing-dots `ThinkingLabel` pill

### 2.7 System Prompt
- ✅ Per-app `chatSystemPrompt` (đính qua mọi request)
- ✅ Presets CRUD (`addSystemPromptPreset`, `update`, `delete`, `setDefault`)
- ✅ Hardcoded "MUST strictly follow" enforcement (`buildEnforcedSystemPrompt`)

### 2.8 Smart Thinking
- ✅ 1 lần web search (DuckDuckGo HTML) → format kết quả → inject vào prompt → LLM reason
- ✅ Inline pill "Searching" / "Summarizing" với sources collapsible
- ✅ Step-by-step UI (`isSmartThinkingStep`)

### 2.9 Deep Research
- ✅ Multi-step pipeline: analyze → round 1 web search → gap analysis → deep dive → cross-reference → synthesize
- ✅ Modes: realtime (web) hoặc AI-only
- ✅ Image context support
- ✅ Collapsible step bubbles (`isResearchStep` / `isResearchFinal`)

### 2.10 Quick Chat Popup
- ✅ Raycast-style standalone Electron BrowserWindow
- ✅ TTL **5 phút** giữ context giữa các lần show/hide
- ✅ Drag region toàn popup
- ✅ Per-Q&A regenerate + copy
- ✅ "Open in chat" forward sang ChatPage chính
- ✅ Global hotkey trigger

### 2.11 Cost & Usage
- ✅ Estimate token cost (`estimateUsageCost`) cho cả 4 providers
- ✅ Per-session aggregate cost
- ✅ Global usage tracking (`recordUsageCost` từ `usageSlice`)

### 2.12 Validation & Error
- ✅ `parseChatParams` (Zod-style) cho IPC payload
- ✅ 8 error codes: `NO_API_KEY`, `INVALID_KEY`, `RATE_LIMIT`, `NETWORK`, `TIMEOUT`, `EMPTY_RESPONSE`, `BLOCKED_RECITATION`, `BLOCKED_SAFETY`
- ✅ `localizeChatError` / `localizeChatException` map error code → i18n string
- ✅ ~100 i18n keys riêng cho chat

### 2.13 Keyboard
- ✅ Send shortcut configurable (`chatSendShortcut`: Enter / Cmd+Enter / Shift+Enter)
- ✅ New session shortcut (`chatNewSessionShortcut`)
- ✅ `eventMatchesShortcut` / `formatShortcutLabel` utilities

---

## 3. Vấn đề & cơ hội tối ưu hoá

### 3.1 Code quality / Architecture

| ID | Vấn đề | Vị trí | Đề xuất | Mức độ |
|---|---|---|---|---|
| **A1** | `electron/ipc/chat.ts` **monolith 1144 LOC** chứa 4 provider impls + IPC handlers + image edit + token resolver. Khó test, conflict khi 2 dev cùng sửa, build cache miss lớn. | `electron/ipc/chat.ts` | Tách thành: `providers/chatProviderGemini.ts`, `…Claude.ts`, `…OpenAI.ts`, `…Local.ts`, `chatImageEdit.ts`, `chatTokenResolver.ts`, `chat.ts` chỉ giữ `registerChatHandlers`. Theo đúng pattern `translateProvider*.ts` đã có. | 🔴 High |
| **A2** | Chat **không** implement `ITranslationProvider`-like interface — mỗi provider là free function với signature riêng. Khó thêm provider mới. | `electron/ipc/providers/types.ts` | Định nghĩa `IChatProvider { id, chat(), stream(), supportsVision, supportsImageEdit, editImage?() }`. Refactor 4 providers theo. | 🔴 High |
| **A3** | `ChatPage.tsx` **1235 LOC** trộn lẫn: state mgmt, streaming, image, voice, drag-drop, smart thinking, deep research, regenerate. Khó hiểu, khó cover test. | `src/pages/ChatPage.tsx` | Tách custom hooks: `useChatSend`, `useChatStreaming`, `useChatAttachment`, `useChatRegenerate`, `useChatDragDrop`. Component < 300 LOC. | 🔴 High |
| **A4** | `AIChatPopup.tsx` **1071 LOC** dùng `useState` local riêng — **không** dùng store. History TTL 5 phút → mất context. | `src/components/AIChatPopup.tsx` | Đưa Quick Chat history vào `chatSlice` với `kind: 'quick'`. Hoặc IndexedDB store riêng. Tách hooks giống ChatPage. | 🟠 Med |
| **A5** | 2 loại `ChatMessage` khác nhau (store ChatMessage vs IPC ChatMessage). Phải convert qua `toIpcMessage`. Drift dễ xảy ra. | `chatService.ts:28-31` vs `types/index.ts:335` | Dùng 1 type với `Pick<>`/`Omit<>` rõ ràng. Thêm `chatMessageSchema` Zod để validate cả 2 chiều. | 🟡 Low |
| **A6** | Title auto-gen chỉ regex strip — `"## Hôm nay tôi muốn …"` thành `"Hôm nay tôi muốn …"`. Không gọn ngữ nghĩa. | `chatSlice.ts:84-91` | Sau response đầu tiên, gọi LLM gọn nhẹ (provider hiện tại) summarize 5–8 từ làm title. Async, không block UI. | 🟡 Low |
| **A7** | `smartThinkingService` (621) và `deepResearchService` (549) gần giống nhau (search → format → reason). Code duplicate ~30%. | 2 services | Refactor thành pipeline `ChatPipeline { steps: ChatStep[] }` + `WebSearchStep`, `ReasonStep`, `SynthStep` reusable. | 🟠 Med |
| **A8** | i18n key cho chat đã >100, scattered trong `i18n/types.ts` lớn. | `src/i18n/types.ts` | Tách `chat.ts` namespace riêng (e.g., `i18n/namespaces/chat.ts`) — dễ maintain. | 🟡 Low |
| **A9** | `chatPrompts.ts` `buildEnforcedSystemPrompt` append cứng đoạn "MUST strictly follow…" — không user-configurable. | `chatPrompts.ts` | Cho phép user disable/customize qua Settings. Mặc định bật. | 🟡 Low |

### 3.2 Performance

| ID | Vấn đề | Đề xuất | Mức độ |
|---|---|---|---|
| **B1** | Mỗi token streaming → call `updateChatMessage(sessionId, msgId, {content})` → toàn bộ `ChatPage` re-render. Lag rõ ở session >100 message. | (1) Buffered streaming: gom token 50–100ms rồi flush 1 lần (2) `React.memo(MessageBubble)` (3) Virtualize list bằng `react-virtuoso` | 🔴 High |
| **B2** | `MarkdownText` (react-markdown) re-parse markdown từ đầu mỗi token mới về. CPU cao. | Memoize parsed AST theo content hash; chỉ re-parse khi mạnh thay đổi (giai đoạn streaming dùng plain text + markdown render khi `end`). | 🟠 Med |
| **B3** | Image base64 (có thể vài MB) lưu trong store + persist localStorage → store bloat, localStorage quota nhanh hết. | Migrate persistence sang IndexedDB (zustand custom storage). Store chỉ giữ image **ID + previewUrl** (object URL). Blob lưu IndexedDB. | 🔴 High |
| **B4** | Chat sessions cap 20 nhưng với image attachment, mỗi session có thể >5MB → 100MB localStorage. Lúc khởi động app, `JSON.parse` 100MB block UI. | + Migrate sang IndexedDB. + Lazy load messages — chỉ load metadata + title + last 5 messages cho session list. Full messages khi user click vào. | 🔴 High |
| **B5** | `useAppStore()` không selector → `ChatPage` subscribe toàn bộ store, mọi update settings/translation/dictionary cũng trigger re-render. | Dùng selector + `useShallow`: `const sessions = useAppStore(useShallow(s => ({chatSessions: s.chatSessions, …})))` | 🟠 Med |
| **B6** | Code highlighting (Shiki/highlight.js) chạy đồng bộ trên main thread khi render code block dài → frame drop. | Move highlighting ra Web Worker hoặc chuyển sang Shiki async API. Lazy import highlighter. | 🟡 Low |
| **B7** | `quick-chat.html` load full React + tất cả components — popup nặng ban đầu. | Code-split bundle riêng cho quick-chat (đã có entry?). Verify với `vite build --analyze`. | 🟡 Low |

### 3.3 UX / Reliability

| ID | Vấn đề | Đề xuất | Mức độ |
|---|---|---|---|
| **C1** | Lỗi mạng / API down → hiện error message nhưng không retry. User phải bấm Regenerate thủ công. | Auto-retry với exponential backoff (đã có `retry.ts` cho translate, áp cho chat). Limit 2 lần retry với codes `NETWORK`, `TIMEOUT`, `RATE_LIMIT`. | 🟠 Med |
| **C2** | Bấm Stop giữa stream → partial reply bị xoá hoặc không lưu hợp lý. | Lưu partial reply + flag `isPartial: true`. Hiện nút "Continue" cho phép gọi lại với prompt "Tiếp tục câu trả lời từ chỗ dừng". | 🟠 Med |
| **C3** | Không thể edit user message — phải xoá session và type lại. ChatGPT/Claude đều có. | Cho phép edit message → re-send. Tạo branch mới (lưu trong `messages[].branches?`). UI hiện number "1/2" để switch. | 🟠 Med |
| **C4** | Quick Chat TTL 5 phút mất history. Không xem lại được. User mất câu trả lời quan trọng. | Persist Quick Chat session vào `chatSlice` với `kind: 'quick'`. Hiện trong History page. Có nút "Promote to full chat". | 🟠 Med |
| **C5** | Không có search trong session / cross-session. Session list dài khó tìm. | Thêm thanh search ở History/Sidebar. Search title + body. Highlight match. | 🟡 Low |
| **C6** | System prompt presets không có biến — không thể adaptive theo context. | Hỗ trợ `{{date}}`, `{{language}}`, `{{selection}}`, `{{clipboard}}`, `{{model}}`. Resolve trước khi gửi. | 🟡 Low |
| **C7** | Không có drag để reorder presets / sessions. | Thêm drag handle với `react-dnd` / native HTML5. | 🟢 Nice |
| **C8** | Không có "scroll to bottom" auto + nút "Jump to latest" khi user scroll lên. | Auto-scroll khi đang ở đáy; hiện FAB nếu user scroll lên ≥ 200px. | 🟡 Low |
| **C9** | Smart Thinking step UI dạng pill nhưng không expand được sources mặc định. User phải click nhỏ. | Add toggle "Show sources by default" trong Settings. Animate expand. | 🟢 Nice |
| **C10** | Không có chat empty state đẹp — chỉ icon + text. Thiếu prompt suggestions. | Thêm "Suggested prompts" theo provider/model. E.g., 4 chips: "Explain this", "Translate", "Code", "Summarize". | 🟡 Low |

### 3.4 Security & Validation

| ID | Vấn đề | Đề xuất | Mức độ |
|---|---|---|---|
| **D1** | `chatValidation.ts` validate cấu trúc nhưng **không** giới hạn tổng size payload (image base64 + history) → request có thể >50MB. | Cap total payload size 10–20MB. Reject với code `PAYLOAD_TOO_LARGE`. | 🟠 Med |
| **D2** | Image base64 đi qua IPC → consume RAM gấp 2× (string copy). Mất ổn định với ảnh lớn. | Truyền binary qua `Buffer` / `Uint8Array` (Electron transferable). Hoặc lưu vào temp file disk path. | 🟡 Low |
| **D3** | Chưa có rate limiting phía client. User mash Enter có thể spam request. | Throttle send 1s tối thiểu giữa 2 lần. Disable Send button trong khi `isSending`. | 🟢 Nice |
| **D4** | Markdown render dùng react-markdown — chú ý **XSS** qua link `javascript:` hoặc HTML raw nếu enable rehype-raw. | Audit: ensure `rehype-sanitize` enable, link target `_blank` + `rel="noopener noreferrer"`, deny `javascript:`. | 🟡 Low |
| **D5** | System prompt enforcement append "MUST strictly follow" — có thể bị **prompt injection** từ user message bypass. | Khó fix triệt để; document behavior, log injection attempt heuristic, show warning UI nếu phát hiện. | 🟢 Nice |
| **D6** | Local provider gửi placeholder API key — nếu user quên config endpoint, có thể leak request đi nơi khác? | Verify always pin localhost. Reject non-localhost endpoints in chatConfig. | 🟡 Low |

### 3.5 AI Reasoning Accuracy

> **Status (2026-05-05)**: lớp mitigation đã được implement (xem bảng dưới + `ai-chat-known-limitations.md`). Section này giữ nguyên là tham chiếu cho dev khi mở rộng tính năng.

| ID | Vấn đề | Đề xuất | Mức độ | Trạng thái |
|---|---|---|---|---|
| **E1** | LLM thường bỏ qua/đè ràng buộc số học khi user đưa context khác common-case (vd: "công ty đóng 100% thuế trên toàn bộ lương trước giảm trừ" → AI vẫn áp công thức chuẩn → sai kết quả hoàn thuế). Bản chất là attention drift trên prior mạnh; không thể fix triệt để phía code. | (1) Cường hoá `buildEnforcedSystemPrompt` với `READ CAREFULLY` (always-on) + `REASONING DISCIPLINE` (opt-in). (2) Toggle "Careful Reasoning" trong Chat composer + Quick Chat (mặc định ON, persist qua zustand). (3) Heuristic auto-suggest banner cho input chứa số tiền + từ khóa tài chính. (4) Forward flag qua 4 providers + smart/deep services. | 🟠 Med | ✅ Done |
| **E2** | Không hỗ trợ explicit reasoning models (o1/o3/Gemini Thinking/Claude Extended Thinking) — họ tự handle reasoning ở mức model-internal. | Implement F25 (Reasoning tokens display) + cho phép enable extended thinking ở provider hỗ trợ. | 🟠 Med | ⏳ Phase 3 |
| **E3** | User không được khuyến cáo dùng model phù hợp cho câu hỏi reasoning — vẫn dùng GPT-4o-mini cho câu hỏi 5-step math. | Trong empty state / hint toolbar hiện badge "💡 Câu hỏi tính toán phức tạp nên thử o1-mini hoặc Gemini Thinking" khi heuristic phát hiện. | 🟢 Nice | ⏳ Future |
| **E4** | Math chính xác bằng tay vs token-by-token — phép tính lớn / decimal có thể sai 1-2 chữ số ngay cả khi model biết công thức. | Implement F20 (Code Interpreter) — sandbox Python via Pyodide để chạy phép tính thật. | 🔴 High | ⏳ Phase 3 (F20) |

**Files chạm tới khi implement E1**:
- `electron/ipc/chatPrompts.ts` — thêm `buildEnforcedSystemPrompt(prompt, { carefulReasoning })` + 2 directive (READ CAREFULLY + REASONING DISCIPLINE).
- `electron/ipc/chatValidation.ts` + `electron/preload/chat.ts` + `src/types/index.ts` + `src/services/chatService.ts` — thêm field `carefulReasoning?: boolean` vào ChatParams + IPC payload.
- `electron/ipc/providers/{chatProviderTypes,Gemini,Claude,OpenAI,Local}.ts` — thêm `ChatProviderOptions` bag + forward `carefulReasoning` vào `buildEnforcedSystemPrompt`.
- `electron/ipc/chat.ts` — destructure `carefulReasoning` từ params + pass vào provider call.
- `src/store/slices/chatSlice.ts` + `src/store/useAppStore.ts` — `chatCarefulReasoningEnabled` state + setter + persist whitelist.
- `src/services/{smartThinkingService,deepResearchService}.ts` — accept + forward `carefulReasoning` vào step cuối (synthesis).
- `src/utils/reasoningHeuristic.ts` — NEW heuristic detector (money + finance keyword + arithmetic verb).
- `src/components/ui/icons/cost.tsx` — `CalculatorIcon` (đã có sẵn).
- `src/pages/ChatPage.tsx` — toggle button trong toolbar + auto-suggest banner + active badge.
- `src/components/AIChatPopup.tsx` — wire flag (không thêm UI toggle, share setting).
- `src/i18n/{types,locales/{en,vi,ja}}.ts` — 6 keys mới (`chat_careful_reasoning_*`).
- `electron/ipc/__tests__/chatPrompts.test.ts` — NEW unit test (7 cases).
- `docs/migration/legacy-reference/agent-handbook/manual/phase_3/ai-chat-known-limitations.md` — NEW user-facing doc.

---

## 4. Tính năng đề xuất bổ sung


### Tier 1 — High value, low effort (≤ 1 ngày/feature)

| # | Tính năng | Mô tả | Effort |
|---|---|---|---|
| **F1** | **Stop & Continue** | Sau khi stop, hiện nút "Continue" → gửi prompt "Tiếp tục từ chỗ dừng" với partial reply làm context | 0.5d |
| **F2** | **Edit user message + Branch** | Edit message cũ → re-send tạo branch. UI 1/2 switch giống ChatGPT | 1d |
| **F3** | **Copy variants** | Per-message: Copy as Markdown / Plain text / Per-code-block | 0.5d |
| **F4** | **Export session** | Export chat session ra Markdown / JSON / clipboard. Per-session menu | 0.5d |
| **F5** | **Realtime token counter** | Hiện estimated input token + cost preview khi gõ. Đã có `estimateUsageCost` | 0.5d |
| **F6** | **Auto-save draft** | Lưu input text vào localStorage per-session. Restore khi mở lại | 0.5d |
| **F7** | **Pin / Star session** | Pin session khỏi auto-trim 20. UI star icon | 0.5d |
| **F8** | **Search in sessions** | Search bar trong Sidebar + History. Match title + content | 0.5d |
| **F9** | **Suggested prompts** | Empty state hiện 4 chip prompt theo provider/model | 0.5d |
| **F10** | **Scroll-to-bottom FAB** | FAB hiện khi user scroll lên ≥200px | 0.3d |
| **F31** | **Careful Reasoning mode** ✅ | Toggle (mặc định ON) buộc model restate giả định + tính từng bước + self-check ràng buộc; tự động suggest cho câu hỏi tài chính/tính toán. Persist setting. Mitigation cho E1 trong §3.5. | 1d (DONE) |


### Tier 2 — Differentiation (1–3 ngày/feature)

| # | Tính năng | Mô tả | Effort |
|---|---|---|---|
| **F11** | **Conversation Memory** | Auto-extract facts từ chat → memory bank → inject vào system prompt. Mimic ChatGPT Memory | 3d |
| **F12** | **Slash commands** | `/translate`, `/summary`, `/explain`, `/code`, `/search` — gọi smart thinking hoặc preset | 2d |
| **F13** | **@mention context** | `@selection`, `@clipboard`, `@file`, `@history` inject context tự động | 2d |
| **F14** | **Multi-model compare** | Gửi cùng câu hỏi 2 model song song, hiện 2 cột đối chứng | 2d |
| **F15** | **Prompt library** | Preset prompts theo task. Import/export JSON. Share giữa user | 2d |
| **F16** | **Conversation templates** | Session mẫu cho task: code review, learning, translate workflow | 1d |
| **F17** | **Markdown editor mode** | Toggle textarea → MarkdownEditor (đã có) cho input dài | 1d |

### Tier 3 — Power features (3–7 ngày/feature)

| # | Tính năng | Mô tả | Effort |
|---|---|---|---|
| **F18** | **RAG file attachment** | Đính kèm PDF/TXT/DOCX/MD → chunk + embed (local hoặc OpenAI embedding) → vector search | 7d |
| **F19** | **Tool / Function calling** | Chuẩn hoá tool API cross-provider (search, calc, code-exec, file-read) | 5d |
| **F20** | **Code interpreter** | Sandbox Node/Python (Pyodide hoặc isolated process) chạy code trong chat | 5d |
| **F21** | **Voice mode "always-on"** | TTS auto-play reply + push-to-talk hotkey. Conversation flow như ChatGPT Voice | 3d |
| **F22** | **Branching tree view** | Visualize conversation timeline dạng cây (Claude Projects style) | 3d |
| **F23** | **Session sharing (read-only)** | Share session → URL hoặc encrypted file. Import lại được | 2d |
| **F24** | **Local-first encryption** | Encrypt session content bằng OS keychain key. Optional. | 2d |

### Tier 4 — Provider-specific improvements

| # | Tính năng | Mô tả | Effort |
|---|---|---|---|
| **F25** | **Reasoning tokens display** | Hỗ trợ o1/o3/Gemini Thinking. Hiện reasoning thu gọn collapsible | 1d |
| **F26** | **Anthropic Prompt caching** | Use `cache_control` để giảm cost khi chat dài | 1d |
| **F27** | **OpenAI Responses API** | Migrate từ Chat Completions sang Responses API (mới hơn, stateful) | 2d |
| **F28** | **Vision cho Local** | Hỗ trợ LLaVA, Qwen-VL via Ollama. Detect capability từ model | 1d |
| **F29** | **Streaming verify cho Local** | Test SSE chunk handling Ollama đầy đủ. Fix edge case | 0.5d |
| **F30** | **Provider failover** | Nếu provider chính fail (rate limit, network), tự fallback sang provider khác đã config | 2d |

### Bảng ưu tiên

```
                Effort
              ┌───────────────────────────────┐
         Low  │ F3 F4 F5 F6 F7 F8 F9 F10  │  │  F1 F2
              │ F25 F29                   │  │
              ├──────────────────────────┼┼──┼─────────────
       Med    │ F12 F13 F16 F17 F26       │  │  F11 F14 F15
              │                           │  │  F22 F23 F24
              ├───────────────────────────┼┼──┼─────────────
       High   │                           │  │  F18 F19 F20
              │                           │  │  F21
              └───────────────────────────┴──┴─────────────
                    Low    │ Mid │ High Value
```

**Khuyến nghị triển khai trước**: F1, F2, F3, F4, F5, F7, F8, F11, F12, F13.

---

## 5. Roadmap 3 Phase

### Phase 1 — Refactoring & Performance Foundation (Tuần 1–2)

**Mục tiêu**: Code quality + performance trước khi thêm tính năng mới.

- [ ] **R1**: Tách `electron/ipc/chat.ts` → `providers/chatProviderGemini.ts`, `…Claude.ts`, `…OpenAI.ts`, `…Local.ts`, `chatImageEdit.ts`, `chatTokenResolver.ts` (giữ <400 LOC/file)
- [ ] **R2**: Định nghĩa `IChatProvider` interface + refactor 4 providers
- [ ] **R3**: Tách `ChatPage.tsx` → custom hooks `useChatSend`, `useChatStreaming`, `useChatAttachment`, `useChatRegenerate`, `useChatDragDrop` (component <300 LOC)
- [ ] **R4**: Migrate `chatSessions` persistence từ localStorage → IndexedDB (zustand custom storage)
- [ ] **R5**: Lazy load messages — session list chỉ load metadata; load full khi click
- [ ] **R6**: Buffered streaming (gom token 50–80ms flush 1 lần)
- [ ] **R7**: `React.memo(MessageBubble)` + selector `useShallow` cho ChatPage
- [ ] **R8**: Virtualize message list bằng `react-virtuoso` cho session >50 message
- [ ] **R9**: Áp `retry.ts` cho chat IPC (network/timeout/rate-limit codes)
- [ ] **R10**: Cap payload size 10MB + reject `PAYLOAD_TOO_LARGE`
- [ ] **R11**: Refactor `smartThinkingService` + `deepResearchService` → `ChatPipeline` reusable
- [ ] **R12**: Tách i18n chat namespace
- [ ] **R13**: Unit test cho mỗi `IChatProvider` impl + pipeline

**Acceptance**:
- Không file chat-related nào > 500 LOC
- ChatPage re-render count giảm ≥ 50% (đo bằng React DevTools profiler)
- Bundle size renderer giảm ≥ 5%
- Tests pass; no behavior regression

### Phase 2 — UX Quick Wins (Tuần 3–4)

- [ ] **F1** Stop & Continue
- [ ] **F2** Edit user message + Branch (basic, 1 nhánh active)
- [ ] **F3** Copy variants per-message
- [ ] **F4** Export session (Markdown/JSON)
- [ ] **F5** Realtime token counter + cost preview
- [ ] **F6** Auto-save draft
- [ ] **F7** Pin / Star session
- [ ] **F8** Search in sessions
- [ ] **F9** Suggested prompts empty state
- [ ] **F10** Scroll-to-bottom FAB
- [ ] **C4** Quick Chat persist vào History (kind: 'quick')
- [ ] **C6** System prompt variables `{{date}} {{selection}} {{clipboard}}`

**Acceptance**:
- Tất cả feature có i18n đầy đủ
- E2E test cho Stop & Continue + Edit/Branch
- UX review pass

### Phase 3 — Advanced (Tuần 5–7)

- [ ] **F11** Conversation Memory (long-term)
- [ ] **F12** Slash commands
- [ ] **F13** @mention context
- [ ] **F14** Multi-model compare
- [ ] **F15** Prompt library + import/export
- [ ] **F25** Reasoning tokens display (o1/Gemini Thinking)
- [ ] **F26** Anthropic Prompt caching
- [ ] **F30** Provider failover
- [ ] **F18** (optional) RAG file attachment

**Acceptance**:
- Memory persist + retrieval test
- Multi-model compare side-by-side smooth
- Documentation update

---

## 6. Kiến trúc target sau refactor

### 6.1 File structure

```
electron/ipc/
├── chat.ts                          # ~150 LOC — chỉ registerChatHandlers
├── chatConfig.ts                    # giữ nguyên
├── chatPrompts.ts                   # giữ nguyên
├── chatMessages.ts                  # giữ nguyên
├── chatValidation.ts                # + payload size cap
├── chatTokenResolver.ts             # NEW ~120 LOC
├── chatImageEdit.ts                 # NEW ~250 LOC
├── chatPipeline.ts                  # NEW ~150 LOC (shared smart/deep)
├── providers/
│   ├── types.ts                     # + IChatProvider interface
│   ├── chatProviderGemini.ts        # NEW ~250 LOC
│   ├── chatProviderClaude.ts        # NEW ~200 LOC
│   ├── chatProviderOpenAI.ts        # NEW ~250 LOC
│   ├── chatProviderLocal.ts         # NEW ~150 LOC
│   └── chatProviderRegistry.ts      # NEW ~80 LOC

src/
├── pages/
│   └── ChatPage.tsx                 # ~280 LOC
├── components/chat/
│   ├── ChatComposer.tsx             # NEW ~200 LOC (input + attachments + send)
│   ├── ChatMessageList.tsx          # NEW ~150 LOC (virtualized)
│   ├── ChatMessageActions.tsx       # NEW ~120 LOC (copy, edit, regen)
│   ├── ChatEmptyState.tsx           # NEW (suggested prompts)
│   ├── ChatBranchSwitcher.tsx       # NEW (1/2 navigation)
│   ├── MessageBubble.tsx            # giữ + memo
│   └── …
├── hooks/chat/
│   ├── useChatSend.ts               # NEW
│   ├── useChatStreaming.ts          # NEW
│   ├── useChatAttachment.ts         # NEW
│   ├── useChatRegenerate.ts         # NEW
│   ├── useChatDragDrop.ts           # NEW
│   ├── useChatBranch.ts             # NEW (Phase 2)
│   └── useChatMemory.ts             # NEW (Phase 3)
├── services/
│   ├── chatService.ts
│   ├── chatPipeline/                # NEW
│   │   ├── ChatPipeline.ts
│   │   ├── steps/SearchStep.ts
│   │   ├── steps/ReasonStep.ts
│   │   └── steps/SynthStep.ts
│   ├── smartThinkingPipeline.ts     # rebuilt on top of ChatPipeline
│   └── deepResearchPipeline.ts      # rebuilt on top of ChatPipeline
└── store/slices/
    ├── chatSlice.ts                 # + branch support, pin, persist v2
    └── chatPersistence.ts           # NEW (IndexedDB adapter)
```

### 6.2 IChatProvider interface (đề xuất)

```ts
// electron/ipc/providers/types.ts (mở rộng)

export interface ChatRequestContext {
  apiKey: string
  baseURL?: string
  signal: AbortSignal
}

export interface ChatStreamHandler {
  onStart: () => void
  onToken: (token: string) => void
  onError: (error: Error, code?: string) => void
}

export interface IChatProvider {
  readonly id: ChatProviderId

  /** Static capability flags */
  readonly capabilities: {
    vision: boolean
    imageEdit: boolean
    streaming: boolean
    reasoning: boolean
    promptCache: boolean
  }

  /** Resolve max output tokens for a model (may fetch remote API) */
  resolveMaxOutputTokens(model: string, ctx: ChatRequestContext): Promise<number>

  /** Non-streaming chat */
  chat(params: {
    model: string
    messages: ChatMessage[]
    systemPrompt?: string
    maxOutputTokens: number
    ctx: ChatRequestContext
  }): Promise<{ reply: string; usage?: ProviderUsage }>

  /** Streaming chat */
  stream(params: {
    model: string
    messages: ChatMessage[]
    systemPrompt?: string
    maxOutputTokens: number
    ctx: ChatRequestContext
    handler: ChatStreamHandler
  }): Promise<{ reply: string; usage?: ProviderUsage }>

  /** Image edit (only providers with capabilities.imageEdit=true) */
  editImage?(params: {
    model: string
    prompt: string
    imageBase64: string
    imageMimeType: string
    ctx: ChatRequestContext
  }): Promise<{ imageBase64: string; imageMimeType: string }>
}

// Registry
export const chatProviders: Record<ChatProviderId, IChatProvider> = {
  gemini: geminiChatProvider,
  claude: claudeChatProvider,
  openai: openaiChatProvider,
  local: localChatProvider,
}
```

### 6.3 ChatPipeline (đề xuất)

```ts
// src/services/chatPipeline/ChatPipeline.ts

export interface ChatStep {
  id: string
  label: string
  run: (ctx: ChatPipelineContext) => Promise<ChatStepResult>
}

export interface ChatPipelineContext {
  query: string
  history: ChatMessage[]
  systemPrompt?: string
  signal: AbortSignal
  emit: (event: PipelineEvent) => void
  state: Record<string, unknown>  // shared between steps
}

export interface ChatStepResult {
  output?: string
  data?: unknown
  next?: 'continue' | 'stop'
}

export class ChatPipeline {
  constructor(public steps: ChatStep[]) {}

  async run(ctx: ChatPipelineContext): Promise<string> {
    for (const step of this.steps) {
      ctx.emit({ type: 'step:start', stepId: step.id })
      const result = await step.run(ctx)
      ctx.emit({ type: 'step:end', stepId: step.id, output: result.output })
      if (result.next === 'stop') break
    }
    return (ctx.state.finalAnswer as string) ?? ''
  }
}

// Smart Thinking = Pipeline([WebSearchStep, ReasonStep])
// Deep Research = Pipeline([AnalyzeStep, WebSearchStep, GapStep, DeepStep, CrossRefStep, SynthStep])
```

### 6.4 Persistence v2 (IndexedDB)

```ts
// src/store/slices/chatPersistence.ts

interface ChatStoreV2 {
  sessions: { [id: string]: ChatSessionMeta }    // metadata only (lightweight)
  messages: { [sessionId: string]: ChatMessage[] } // separate object store
  blobs: { [blobId: string]: Blob }              // images stored as Blob, not base64
}

// Zustand custom storage backed by IndexedDB (idb library)
const indexedDbStorage = createJSONStorage<ChatStoreV2>(() => ({
  getItem: async (name) => { /* idb.get */ },
  setItem: async (name, value) => { /* idb.set */ },
  removeItem: async (name) => { /* idb.del */ },
}))
```

---

## 7. Risks & Migration plan

### 7.1 Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Refactor break streaming behavior | Med | High | Comprehensive test (mock 4 providers), feature flag `CHAT_PROVIDER_V2` để rollback |
| IndexedDB migration mất data localStorage cũ | Low | High | Migration script chạy 1 lần khi startup; backup raw JSON vào IndexedDB `legacy_backup` table |
| Buffered streaming gây cảm giác chậm | Low | Med | A/B test buffer interval (50/80/100ms); user setting nếu cần |
| Virtualization break copy/paste/find-in-page | Med | Med | Test kỹ; có thể disable virtualize khi message <30 |
| IChatProvider mismatch type với existing ChatMessage | Low | Med | Bridge layer; gradual rollout per-provider |
| Branch logic phức tạp hoá data model | Med | Med | Optional feature; lưu branches[] cùng cấp messages, default 1 branch |

### 7.2 Migration plan

**Step 1**: Phase 1 ship behind flag `CHAT_V2 = false`. Old code path vẫn chạy.

**Step 2**: Internal dogfood 1 tuần, monitor:
- Crash rate
- Streaming completion rate
- Localstorage→IndexedDB migration success rate
- Re-render count

**Step 3**: Bật flag `CHAT_V2 = true` cho 10% users (config flag).

**Step 4**: 100% rollout. Xoá old code path 2 release sau.

### 7.3 Backward compatibility

- IPC channels giữ nguyên tên (`chat:send`, `chat:stream`, …) → preload không thay đổi
- `ChatResult`, `ChatStreamEvent` types không đổi → renderer service ổn định
- `chatSessions` schema thêm field mới optional (`pinned?`, `branches?`) — load v1 không vỡ
- Old preload (user chưa restart) vẫn hoạt động với main process v2

---

## 8. Success metrics

| Metric | Hiện tại (estimate) | Target sau Phase 1 | Target sau Phase 3 |
|---|---:|---:|---:|
| `electron/ipc/chat.ts` LOC | 1144 | < 200 | < 200 |
| `ChatPage.tsx` LOC | 1235 | < 300 | < 300 |
| `AIChatPopup.tsx` LOC | 1071 | < 400 | < 400 |
| Re-render count / streaming response (100 tokens) | ~100 | < 30 | < 20 |
| Time to interactive ChatPage (cold start, 20 sessions) | ~2.5s | < 1.0s | < 0.8s |
| Time to interactive với 100 sessions | N/A (lag) | < 1.5s | < 1.0s |
| Bundle size renderer (chat-related) | TBD | -10% | -10% |
| p95 streaming first-token latency | TBD | unchanged | unchanged |
| Test coverage chat modules | TBD | > 70% | > 80% |
| User-perceptible behavior regression | 0 | 0 | 0 |

### Định nghĩa "done" của báo cáo

Phase 1 gọi là **done** khi:
1. Tất cả task R1–R13 merged
2. Các metric Phase 1 đạt target
3. Không có regression bug Sev 1/2 sau 1 tuần production
4. Documentation cập nhật (`docs/migration/legacy-reference/agent-handbook/manual/09-providers.md`, `11-features.md`)

---

## Phụ lục A — Các thư viện đề xuất (npm)

| Thư viện | Mục đích | Trade-off |
|---|---|---|
| `react-virtuoso` | Virtualize message list | +20kb gz; trade-off với lag tránh được |
| `idb` | IndexedDB wrapper | +5kb gz; chuẩn industry |
| `react-markdown` (đã có) | Markdown render | giữ nguyên |
| `shiki` (nếu chưa) | Syntax highlight async | Async; better quality vs highlight.js |
| `fuse.js` | Fuzzy search session | +12kb gz; or write tiny custom |
| `pdfjs-dist` (Phase 3) | PDF parse cho RAG | Lazy load only when user attach PDF |

## Phụ lục B — Câu hỏi cần xác nhận

1. **Persistence migration**: Bạn ưu tiên IndexedDB hay vẫn localStorage (tăng cap)?
2. **Quick Chat**: Persist vào History chính, hay giữ tách biệt như hiện tại?
3. **Branching**: Có muốn full branching tree (Claude style) hay chỉ 1 nhánh active (đơn giản hơn)?
4. **Memory**: Giống ChatGPT auto-extract hay chỉ manual user-add facts?
5. **Slash commands**: Có muốn user-defined slash commands hay built-in chỉ?
6. **RAG**: Cần thiết Phase 3 hay để Phase 4 sau?

---

> **Next steps**: Bạn review báo cáo, chọn scope ưu tiên (Phase 1 / Phase 2 / hoặc cherry-pick task cụ thể), sau đó toggle Act mode để triển khai.
