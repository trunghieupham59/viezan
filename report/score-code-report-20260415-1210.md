# Báo cáo Chấm Điểm Source Code — Lotus Translate
**Thời điểm:** 2026-04-15 12:10  
**Workflow:** score-code v1.0.0  
**Loại bài:** Project lớn / Đồ án nhóm  
**Rubric áp dụng:** Correctness(25) · Architecture(15) · Code Quality(15) · Maintainability(15) · Testing(10) · Performance(10) · Security(5) · Documentation(5)

---

## Kết quả Chấm Điểm

| Tiêu chí        | Điểm tối đa | Điểm đạt | Nhận xét ngắn                                                           |
|-----------------|-------------|----------|-------------------------------------------------------------------------|
| Correctness     | 25          | 22       | Logic đúng, xử lý tốt edge cases, còn vài silent fail nhỏ              |
| Architecture    | 15          | 12       | Pattern phù hợp, IPC facade tốt, còn coupling giữa Page và window.api  |
| Code Quality    | 15          | 11       | Naming tốt, style nhất quán, nhưng một số file quá lớn (800–1570 dòng) |
| Maintainability | 15          | 10       | Store slices tốt, nhưng mở rộng provider vẫn cần sửa nhiều chỗ         |
| Testing         | 10          | 6        | Store tests tốt, UI tests mỏng, IPC handlers hoàn toàn không có test   |
| Performance     | 10          | 8        | Debounce đúng, tối ưu render tốt, image resize đúng                    |
| Security        | 5           | 4        | Keys trong Keychain, không lộ secret, thiếu validate một số input      |
| Documentation   | 5           | 4        | README xuất sắc, JSDoc có mặt ở đúng chỗ, thiếu docs cho IPC API      |
| **Tổng**        | **100**     | **77**   |                                                                         |

---

## Chi tiết từng tiêu chí

---

### 1. Correctness — 22/25

**Đánh giá:** Logic đúng với phần lớn trường hợp, xử lý edge case tốt, còn vài điểm silent fail.

#### ✅ Điểm tốt

- **swapLanguages** xử lý đúng edge case khi `sourceLang === 'auto'`:
  ```ts
  // src/store/useAppStore.ts:79
  const newTargetLang = state.sourceLang === 'auto' ? 'ja' : state.sourceLang
  ```

- **handleTranslate** trong `TranslatePage` phân nhánh đúng giữa IMAGE mode và TEXT mode, mỗi nhánh có try/catch riêng.

- **MAX_CHAT_SESSIONS** được enforced đúng trong slice:
  ```ts
  // chatSlice.ts:58
  chatSessions: [session, ...state.chatSessions].slice(0, MAX_CHAT_SESSIONS),
  ```

- **handleRegenerate** lọc đúng `!m.isLoading && !m.error` trước khi rebuild history, tránh gửi placeholder message đến API.

- **chat.ts IPC**: phân loại error đúng (NO_API_KEY, INVALID_KEY, RATE_LIMIT, NETWORK) — giúp UI hiển thị thông báo phù hợp.

#### ⚠️ Điểm trừ

1. **Silent fail khi load API keys** (SettingsPage.tsx:89):
   ```ts
   } catch { /* ignore */ }
   ```
   Nếu keychain API lỗi, người dùng không biết — nên log ít nhất.

2. **handleImageSelect silent fail** (ChatPage.tsx:256–259):
   ```ts
   } catch (err) {
     console.error('Failed to process image:', err)
   }
   ```
   Lỗi chỉ hiện trong console, không thông báo người dùng — UI không phản hồi.

3. **Phonetic translation silent fail** (TranslatePage.tsx:157–158):
   ```ts
   .catch(() => {})
   ```
   Chấp nhận được cho tính năng phụ, nhưng không nhất quán với pattern còn lại.

---

### 2. Architecture — 12/15

**Đánh giá:** Kiến trúc Electron (main) + React (renderer) với IPC bridge phù hợp quy mô. Store slices tách rõ. Còn coupling chặt giữa pages và `window.api`.

#### ✅ Điểm tốt

- **Electron IPC facade**: `window.api` ẩn hoàn toàn implementation detail của IPC, renderer không biết cơ chế truyền message.

- **Zustand slice pattern** tách rõ 3 domain:
  - `chatSlice` — chat sessions & presets
  - `historySlice` — translation history & live sessions  
  - `settingsSlice` — user preferences & provider state

- **Dependency direction đúng**: Renderer → `window.api` → Main process, không có circular.

- **Không over-engineering**: không có EventBus, CQRS, hay abstract factory cho app quy mô này.

- **`registerChatHandlers(ipcMain)`** pattern tách IPC handler ra module riêng — dễ test và maintain.

#### ⚠️ Điểm trừ

1. **Pages gọi window.api trực tiếp** — không có service layer trung gian:
   ```ts
   // TranslatePage.tsx:92
   const result = await window.api.translateImage({ ... })
   // TranslatePage.tsx:138
   const plainResult = await window.api.translate({ ... })
   ```
   Nếu đổi IPC protocol, phải sửa trong từng Page.

2. **Thêm provider mới cần sửa nhiều file**: `chat.ts` (switch case), `constants/providers.ts`, `settingsSlice.ts` (hardcoded `{ gemini, claude, openai }`). Không có strategy/registry pattern.
   ```ts
   // settingsSlice.ts:67
   keyStatus: { gemini: false, claude: false, openai: false },
   ```

---

### 3. Code Quality — 11/15

**Đánh giá:** Naming tốt, style nhất quán (Biome), không có magic numbers. Vấn đề chính: file quá lớn, một số hàm quá dài.

#### ✅ Điểm tốt

- Naming nhất quán và mô tả: `handleTranslate`, `ensureSession`, `resizeImageToBase64`, `buildEnforcedSystemPrompt`.
- Boolean prefix đúng: `isTranslating`, `isSending`, `hasKey`, `isVoiceActive`, `isVoiceInterim`.
- Constants được đặt tên rõ:
  ```ts
  const MAX_CHAT_SESSIONS = 20     // chatSlice.ts
  const MAX_HISTORY = 100          // historySlice.ts
  const IMAGE_TRANSLATED_SENTINEL = '✓'  // TranslatePage.tsx
  ```
- Comment giải thích "tại sao" đúng tinh thần:
  ```ts
  // When source is 'auto', we can't meaningfully swap back — fall back to 'ja'
  // Calculate lastAssistantIdx once — avoid O(n²) per-render
  // Skip first element because API always returns a dummy header record
  ```
- Biome linter được cấu hình và tuân thủ nhất quán.

#### ⚠️ Điểm trừ

1. **File quá lớn, vi phạm R-STR-02 (max 300 dòng)**:
   - `SettingsPage.tsx`: **1570 dòng** — chứa 6 domain khác nhau (keys, preferences, hotkey, legacy assistant, chrome extension, updater)
   - `TranslatePage.tsx`: **831 dòng**
   - `ChatPage.tsx`: **791 dòng**

2. **Hàm `handleSend` và `handleRegenerate` trong ChatPage** mỗi hàm ~90 dòng, vượt giới hạn 40 dòng của R-QUA-02.

3. **Magic number không được đặt tên**:
   ```ts
   // ChatPage.tsx:37
   const dataUrl = canvas.toDataURL(mimeType, 0.85)  // 0.85 là gì?
   // historySlice.ts:49
   liveSessions: [session, ...state.liveSessions].slice(0, 50)  // 50 không có hằng số
   ```

4. **Duplicate logic** giữa `ChatPage` và `TranslatePage`: voice recording handler `handleVoiceRecordingChange` và `handleVoiceTranscript` gần như giống hệt nhau.

---

### 4. Maintainability — 10/15

**Đánh giá:** Store architecture tốt, config tách khỏi code. Coupling cao với window.api, mở rộng provider khó khăn.

#### ✅ Điểm tốt

- **Config tách rõ**: `DEFAULT_SETTINGS`, `MAX_CHAT_SESSIONS`, `MAX_HISTORY`, `MAX_INPUT_CHARS`, `MAX_CHAT_INPUT_CHARS` — đều ở constants.
- **Store slices** cho phép sửa đổi chat logic mà không ảnh hưởng settings/history — cohesion cao.
- **Không mutate state**: tất cả store actions dùng spread hoặc `.map()`/`.filter()` — pure updates.
- **`partialize`** trong persist chỉ lưu state cần thiết — tránh stale data.

#### ⚠️ Điểm trừ

1. **Coupling chặt với window.api**: Khi IPC interface đổi, phải tìm tất cả calls trong pages để sửa. Không có abstraction layer (service/repository).

2. **Provider list hard-coded nhiều chỗ**:
   ```ts
   // settingsSlice.ts:67-70
   keyStatus: { gemini: false, claude: false, openai: false },
   dynamicModels: { gemini: [], claude: [], openai: [] },
   modelsLoading: { gemini: false, claude: false, openai: false },
   modelsError: { gemini: null, claude: null, openai: null },
   ```
   Thêm provider mới yêu cầu sửa đây + chat.ts switch + constants/providers.ts.

3. **SettingsPage** chứa quá nhiều concerns độc lập — sửa logic token chrome extension rủi ro ảnh hưởng logic hotkey.

4. **`handleTranslate` trong TranslatePage** phụ thuộc vào ~12 state variables qua closure — khó test và dễ stale closure bugs (dù đã dùng refs để giải quyết một phần).

---

### 5. Testing — 6/10

**Đánh giá:** Store tests khá tốt, nhưng UI test mỏng và hoàn toàn không có test cho IPC handlers.

#### ✅ Điểm tốt

- **useAppStore.test.ts** (287 dòng) cover đầy đủ:
  - History CRUD (add, prepend, cap at 100, delete, clear)
  - Chat session lifecycle (create, add message, update, delete, clear)
  - System prompt preset logic (add default, clear others, delete, update)
  - `swapLanguages` với edge case `sourceLang === 'auto'`
  - `clearTranslation`

- Tên test mô tả rõ:
  ```ts
  it('enforces MAX_CHAT_SESSIONS cap (20) — oldest sessions are trimmed', ...)
  it('falls back to "ja" when sourceLang is "auto"', ...)
  it('clears chatSystemPrompt when deleting the default preset', ...)
  ```

- `beforeEach` reset state đúng cách, tests độc lập.

#### ⚠️ Điểm trừ

1. **ChatPage.test.tsx chỉ có 6 tests cơ bản** — không test:
   - Gửi message (mocked api)
   - Regenerate
   - Image attach
   - Voice input

2. **Electron IPC handlers không có test nào** — `electron/ipc/chat.ts`, `translate.ts`, `imageTranslate.ts` không có unit test. Đây là business logic quan trọng nhất của app.

3. **Tests fragile**:
   ```ts
   // ChatPage.test.tsx:47
   const sendBtn = buttons.find(b => b.getAttribute('title') !== null && b.className.includes('rounded-full') && b.className.includes('bg-blue-500'))
   ```
   Dùng className selector để tìm button — vỡ khi CSS thay đổi.

4. **Không có integration tests** cho toàn bộ flow dịch (source text → API call → translated text).

5. **Không test error cases**: API timeout, invalid key, network error trong UI.

---

### 6. Performance — 8/10

**Đánh giá:** Hiệu năng tốt. Debounce, lazy loading image, tối ưu render. Không có bottleneck rõ ràng.

#### ✅ Điểm tốt

- **Debounce auto-translate** với configurable delay (300ms–2000ms):
  ```ts
  debounceRef.current = setTimeout(() => { handleTranslateRef.current() }, autoTranslateDelay)
  ```

- **`lastAssistantIdx` tính ngoài `.map()`** — tránh O(n²):
  ```ts
  // ChatPage.tsx:628-631 (có comment giải thích)
  const lastAssistantIdx = messages.reduce(
    (acc, m, i) => (m.role === 'assistant' ? i : acc), -1
  )
  ```

- **Image resize trước khi upload** (MAX_IMAGE_SIZE = 1200px), canvas context reuse:
  ```ts
  URL.revokeObjectURL(url)  // cleanup đúng cách
  ```

- **Scroll sync dùng `requestAnimationFrame`** để tránh layout thrashing:
  ```ts
  requestAnimationFrame(() => { isSyncingScrollRef.current = false })
  ```

- **Stable refs** để tránh re-subscribe effects không cần thiết:
  ```ts
  const handleTranslateRef = useRef(handleTranslate)
  handleTranslateRef.current = handleTranslate
  ```

#### ⚠️ Điểm trừ

1. **SettingsPage không có lazy loading** — toàn bộ 1570 dòng render cùng lúc dù người dùng thường chỉ dùng một section.

2. **`scoreOpenAIChatModel`** tạo regex và parse trên mỗi lần gọi — có thể cache nếu model list lớn (minor).

---

### 7. Security — 4/5

**Đánh giá:** Bảo mật tốt cho desktop app. API keys trong Keychain, không lộ trong renderer.

#### ✅ Điểm tốt

- **API keys chỉ đọc từ OS Keychain trong main process** — không bao giờ expose sang renderer:
  ```ts
  // chat.ts:33-35
  async function getApiKey(provider: string): Promise<string | null> {
    return getStoredApiKey(provider)
  }
  ```

- **Token management** cho Chrome Extension có TTL, không lưu plain text:
  ```ts
  // Settings: TTL 7/30/90/365 ngày
  ```

- **IPC validation**: check empty messages, check provider trước khi gọi API.

- **Error messages không lộ sensitive info**:
  ```ts
  return { success: false, error: 'Invalid API key. Please check your key in Settings.' }
  // Không trả stack trace ra client
  ```

#### ⚠️ Điểm trừ

1. **Input validation thiếu cho chat messages**: không validate độ dài message hoặc content của image trước khi gửi lên AI. `MAX_CHAT_INPUT_CHARS` được check ở UI nhưng không được enforce tại IPC handler — có thể bypass.

---

### 8. Documentation — 4/5

**Đánh giá:** README xuất sắc, JSDoc đúng chỗ, comment giải thích "tại sao" tốt.

#### ✅ Điểm tốt

- **README đầy đủ**: mô tả app, download links, getting started, API keys, dev setup, project structure, tech stack, changelog.

- **JSDoc cho registerChatHandlers** (chat.ts:296–307) mô tả handlers, security model, multi-modal support — đúng chuẩn R-DOC-03.

- **Comment giải thích "tại sao"** đúng tinh thần R-DOC-02:
  ```ts
  // When source is 'auto', we can't meaningfully swap back — fall back to 'ja'
  // Use timestamp as unique copy ID — avoids collision when 2 messages share the same opening chars
  // Skip while voice is recording — interim results would spam the API.
  // Hard fallback — only reached when models API itself fails
  ```

- **`biome-ignore` comments** đều có giải thích lý do — không là dead comment.

#### ⚠️ Điểm trừ

1. **Không có docs cho `window.api` interface**: người mới không biết các methods available, types, error shapes. Thiếu `preload.ts` documentation.

2. **README thiếu**: cách chạy test (`npm test`), các biến môi trường (nếu có), contributing guide (link broken? → có CONTRIBUTING.md nhưng không link từ README).

---

## Điểm Mạnh

1. **Store architecture sạch**: Zustand + slices pattern + persist middleware được thiết kế tốt, dễ extend thêm slice mới.

2. **Error handling ở IPC layer xuất sắc**: phân loại lỗi cụ thể (NO_API_KEY, INVALID_KEY, RATE_LIMIT, NETWORK) giúp UI hiển thị message phù hợp.

3. **Security model tốt**: API keys hoàn toàn cách ly trong main process, không bao giờ serialize sang renderer.

4. **Performance awareness**: debounce, stable refs, `requestAnimationFrame`, image resize, `lastAssistantIdx` optimization — developer có ý thức về performance.

5. **README xuất sắc**: đủ thông tin để onboard developer mới trong < 5 phút.

6. **Naming conventions nhất quán** và tuân thủ project-wide với Biome linter.

---

## Điểm Cần Cải Thiện

### 🔴 Ưu tiên cao

1. **Tách SettingsPage.tsx (1570 dòng) thành các component con**:
   - `ApiKeysSection.tsx`
   - `PreferencesSection.tsx`
   - `HotkeySection.tsx`
   - `ExtensionSection.tsx`
   - `UpdaterSection.tsx`

2. **Thêm tests cho IPC handlers** (`electron/ipc/`):
   - Unit test `chatWithGemini`, `chatWithClaude`, `chatWithOpenAI` với mock
   - Test error cases: invalid key, rate limit, network error

3. **Báo lỗi cho user khi image processing fail** (thay vì `console.error`):
   ```ts
   // ChatPage.tsx:256
   } catch (err) {
     // Thay console.error bằng setAttachError(err.message)
   }
   ```

### 🟠 Ưu tiên trung bình

4. **Extract voice recording logic thành custom hook** `useVoiceInput`:
   - Loại bỏ duplicate code giữa ChatPage và TranslatePage
   - `handleVoiceRecordingChange`, `handleVoiceTranscript`, `voicePrefixRef`

5. **Thêm hằng số cho magic numbers**:
   ```ts
   const IMAGE_JPEG_QUALITY = 0.85  // ChatPage.tsx:37
   const MAX_LIVE_SESSIONS = 50     // historySlice.ts:49
   ```

6. **Service layer cho window.api calls**: tạo `src/services/translationService.ts`, `src/services/chatService.ts` để giảm coupling giữa pages và IPC.

### 🟡 Ưu tiên thấp

7. **Cải thiện ChatPage tests**: mock `window.api`, test send message flow, test error display.

8. **Provider registry pattern** thay vì hard-code `{ gemini, claude, openai }` trong slice:
   ```ts
   // Thay vì hard-code, dùng PROVIDERS.reduce()
   keyStatus: PROVIDERS.reduce((acc, p) => ({ ...acc, [p.id]: false }), {})
   ```

9. **Validate MAX_CHAT_INPUT_CHARS tại IPC handler** để tránh bypass từ phía không phải UI.

---

## Tổng Kết

**Điểm tổng: 77/100**

Lotus là một project được xây dựng tốt với kiến trúc Electron phù hợp, state management rõ ràng và security model đúng đắn. Điểm yếu chính tập trung ở:
- **Testing**: IPC handlers không được test, UI tests quá mỏng
- **Cấu trúc file**: SettingsPage.tsx quá lớn và làm nhiều việc  
- **Maintainability**: Coupling với window.api và provider list hard-coded gây khó khăn khi mở rộng

Với điểm 77/100, code đủ điều kiện release nhưng cần refactor trước khi scale thêm tính năng.
