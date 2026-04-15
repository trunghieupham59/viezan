# Báo cáo Chấm Điểm Source Code — Lotus Translate
**Thời điểm:** 2026-04-15 16:27  
**Workflow:** score-code v1.0.0  
**Loại bài:** Project lớn / Đồ án nhóm  
**Rubric áp dụng:** Correctness(25) · Architecture(15) · Code Quality(15) · Maintainability(15) · Testing(10) · Performance(10) · Security(5) · Documentation(5)  
**So sánh:** Lần chấm trước (12:10) → **77/100**

---

## Kết quả Chấm Điểm

| Tiêu chí        | Điểm tối đa | Điểm đạt | Nhận xét ngắn                                                                 |
|-----------------|-------------|----------|-------------------------------------------------------------------------------|
| Correctness     | 25          | 23       | Logic đúng, đã fix image error & IPC validation, còn vài silent fail nhỏ     |
| Architecture    | 15          | 13       | Provider registry cải thiện, settings tách tốt, còn coupling window.api      |
| Code Quality    | 15          | 13       | SettingsPage đã split, useVoiceInput tách hook, file lớn vẫn còn             |
| Maintainability | 15          | 12       | Provider registry tốt hơn, settings modular, coupling window.api còn lại     |
| Testing         | 10          | 7        | IPC chat tests mới bổ sung tốt, translate.ts/imageTranslate.ts chưa có test  |
| Performance     | 10          | 8        | Debounce, refs, image resize, rAF đều tốt — SettingsPage vẫn chưa lazy load |
| Security        | 5           | 5        | MAX_CHAT_REQUEST_CHARS đã enforce tại IPC, keys trong Keychain hoàn toàn ok  |
| Documentation   | 5           | 4        | README xuất sắc, JSDoc tốt, thiếu window.api interface docs                  |
| **Tổng**        | **100**     | **85**   | **+8 điểm so với lần chấm trước (77 → 85)**                                  |

---

## Những Cải Thiện So Với Lần Chấm Trước (77 → 85)

### ✅ Đã Fix (theo khuyến nghị trước)

| # | Khuyến nghị trước                                    | Trạng thái       | Bằng chứng                                                                 |
|---|------------------------------------------------------|------------------|----------------------------------------------------------------------------|
| 1 | Tách SettingsPage.tsx (1570 dòng) thành các section  | ✅ **Đã làm**    | 8 files: ApiKeysSection, PreferencesSection, TtsSection, HotkeySection, BrowserIntegrationSection, ChatPresetsSection, UpdaterSection, AboutSection |
| 2 | Extract voice recording logic thành custom hook      | ✅ **Đã làm**    | `src/hooks/useVoiceInput.ts` — dùng cả ChatPage và TranslatePage          |
| 3 | Thêm tests cho IPC handlers                          | ✅ **Một phần**  | `electron/ipc/__tests__/chat.test.ts` — 15+ tests cho chat.ts             |
| 4 | Hằng số cho magic numbers                            | ✅ **Đã làm**    | `IMAGE_JPEG_QUALITY = 0.85` (ChatPage), `MAX_LIVE_SESSIONS = 50` (historySlice) |
| 5 | Provider registry pattern trong slice                | ✅ **Đã làm**    | `Object.fromEntries(PROVIDERS.map(...))` thay vì hard-code                |
| 6 | Validate MAX_CHAT_INPUT_CHARS tại IPC handler        | ✅ **Đã làm**    | `MAX_CHAT_REQUEST_CHARS = 3000` được enforce trong `chat.ts:338-344`       |
| 7 | Báo lỗi cho user khi image processing fail           | ✅ **Đã làm**    | `attachImageError` state + UI display trong ChatPage                      |

---

## Chi tiết từng tiêu chí

---

### 1. Correctness — 23/25

**Đánh giá:** Logic đúng với phần lớn trường hợp. Đã fix 2 vấn đề quan trọng từ lần trước. Còn 2 điểm nhỏ.

#### ✅ Điểm tốt

- **Image processing error bây giờ hiện ra UI** (ChatPage.tsx:248–258):
  ```ts
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to process image'
    setAttachImageError(msg)  // ✅ Đã fix — người dùng thấy lỗi
  }
  ```

- **IPC validation cho chat messages** (chat.ts:334–344):
  ```ts
  if (lastMsgTextChars > MAX_CHAT_REQUEST_CHARS) {
    return {
      success: false,
      error: `Message too long (${lastMsgTextChars} chars). Maximum is ${MAX_CHAT_REQUEST_CHARS} characters.`,
    }
  }
  ```

- **handleRegenerate** lọc đúng `!m.isLoading && !m.error` — không gửi placeholder message đến API.

- **splitIntoChunks** xử lý text dài đúng thứ tự ưu tiên (paragraph → line → sentence → hard split), tránh split giữa chừng.

- **withTimeout + promisePool**: chunked translation có timeout per-chunk (90s) và concurrency cap (5) — tránh hang và rate limit.

#### ⚠️ Điểm trừ

1. **Phonetic translation silent fail** (TranslatePage.tsx:150–151):
   ```ts
   .catch(() => {})
   ```
   Chấp nhận được vì là tính năng phụ, nhưng không nhất quán.

2. **handleSend trong ChatPage** không kiểm tra trường hợp `messages.filter(...)` trả về rỗng sau khi lọc `isLoading && error` — nếu session chỉ có placeholder messages thì gửi history rỗng đến API.

---

### 2. Architecture — 13/15

**Đánh giá:** Kiến trúc Electron + React + Zustand phù hợp quy mô. Cải thiện đáng kể ở provider registry và settings modularization. Còn coupling trực tiếp với `window.api`.

#### ✅ Điểm tốt

- **Settings sections tách thành modules riêng** — mỗi section là một file độc lập trong `src/pages/settings/`:
  ```
  ApiKeysSection.tsx    PreferencesSection.tsx    TtsSection.tsx
  HotkeySection.tsx     BrowserIntegrationSection.tsx
  ChatPresetsSection.tsx  UpdaterSection.tsx  AboutSection.tsx
  ```

- **Provider registry pattern** đã thay hard-code (settingsSlice.ts:69–72):
  ```ts
  keyStatus: Object.fromEntries(PROVIDERS.map((p) => [p.id, false])) as Record<Provider, boolean>,
  dynamicModels: Object.fromEntries(PROVIDERS.map((p): [string, FetchedModel[]] => [p.id, []])) as Record<Provider, FetchedModel[]>,
  ```
  Thêm provider mới trong `constants/providers.ts` sẽ tự động update keyStatus, dynamicModels.

- **Zustand slice pattern** tách rõ 3 domain: chatSlice, historySlice, settingsSlice.

- **Dependency direction đúng**: Renderer → `window.api` → Main process. Không circular dependency.

- **`registerChatHandlers(ipcMain)`** pattern tách IPC handler ra module riêng — dễ test (đã được chứng minh bằng test file mới).

#### ⚠️ Điểm trừ

1. **Pages vẫn gọi window.api trực tiếp** — không có service layer:
   ```ts
   // TranslatePage.tsx:85-92
   const result = await window.api.translateImage({ ... })
   // TranslatePage.tsx:131
   const plainResult = await window.api.translate({ ... })
   ```
   Nếu đổi IPC protocol, phải tìm và sửa trong từng Page.

2. **switch-case provider trong translate.ts và chat.ts** vẫn cần update khi thêm provider:
   ```ts
   // translate.ts:574-600
   switch (provider) {
     case 'gemini': ...
     case 'claude': ...
     case 'openai': ...
     default: return { success: false, error: `Unknown provider: ${provider}` }
   }
   ```

---

### 3. Code Quality — 13/15

**Đánh giá:** Cải thiện rõ rệt. SettingsPage split, useVoiceInput hook, magic numbers đặt tên. Vấn đề còn lại: hai file trang vẫn lớn.

#### ✅ Điểm tốt

- **SettingsPage không còn 1570 dòng** — đã split thành 8 section files, mỗi file tập trung 1 domain.

- **useVoiceInput hook loại bỏ duplicate code** giữa ChatPage và TranslatePage:
  ```ts
  // Cả 2 pages đều dùng:
  const { isVoiceActive, isVoiceInterim, handleVoiceRecordingChange, handleVoiceTranscript, resetVoicePrefix }
    = useVoiceInput({ currentText, onTextChange })
  ```

- **Magic numbers đã được đặt tên** (ChatPage.tsx:17–18):
  ```ts
  const MAX_IMAGE_SIZE = 1200
  const IMAGE_JPEG_QUALITY = 0.85
  ```
  historySlice.ts:14:
  ```ts
  const MAX_LIVE_SESSIONS = 50
  ```

- **Naming nhất quán và mô tả tốt**: `handleTranslate`, `ensureSession`, `buildPrompt`, `buildEnforcedSystemPrompt`, `scoreOpenAIChatModel`, `withTimeout`, `promisePool`.

- **Boolean prefix đúng chuẩn**: `isTranslating`, `isSending`, `hasKey`, `isVoiceActive`, `isVoiceInterim`, `needsChunking`.

- **Comment giải thích "tại sao"** xuất sắc:
  ```ts
  // When source is 'auto', we can't meaningfully swap back — fall back to 'ja'
  // Skip while voice is recording — interim results would spam the API.
  // Calculate lastAssistantIdx once — avoid O(n²) per-render .map().lastIndexOf()
  // User edited manually while voice is active — reset prefix so next transcript chunk...
  ```

#### ⚠️ Điểm trừ

1. **TranslatePage.tsx vẫn 733 dòng** và **ChatPage.tsx vẫn 807 dòng**. Cả 2 có thể tách:
   - `VoiceOverlay` component ra khỏi TranslatePage
   - `MessageBubble` đã được tách đúng trong ChatPage (tốt)
   - Image preview/attachment UI có thể tách thành `ImageAttachmentPreview`

2. **handleTranslate (90 dòng) và handleSend (85 dòng)** vẫn vượt ngưỡng hàm ngắn — dù logic phức tạp có lý do.

3. **Inline SVG trong ChatPage** (dòng 742–746) không dùng icon component:
   ```tsx
   <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
     <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
     ...
   </svg>
   ```
   Trong khi project đã có `src/components/ui/icons/` — nên dùng `<ImageIcon />` hoặc tương tự.

---

### 4. Maintainability — 12/15

**Đánh giá:** Cải thiện tốt. Provider registry tự động, settings modular, useVoiceInput hook. Coupling với window.api và switch-case provider vẫn là điểm yếu.

#### ✅ Điểm tốt

- **Provider registry tự động** — thêm provider vào `constants/providers.ts` là đủ cho store state:
  ```ts
  // settingsSlice.ts:69–72
  keyStatus: Object.fromEntries(PROVIDERS.map((p) => [p.id, false])) ...
  ```

- **Store slices** cho phép sửa đổi từng domain độc lập — chatSlice, historySlice, settingsSlice không phụ thuộc lẫn nhau.

- **`partialize`** chỉ persist state cần thiết — tránh stale/bloat data trong localStorage.

- **Không mutate state**: tất cả store actions dùng spread và `.map()`/`.filter()` — predictable updates.

- **Settings sections độc lập**: sửa ChromeExtension section không rủi ro ảnh hưởng HotkeySection.

#### ⚠️ Điểm trừ

1. **Coupling chặt với window.api** không có abstraction:
   - TranslatePage gọi `window.api.translate`, `window.api.translateImage`, `window.api.rewriteText`
   - ChatPage gọi `window.api.chat`
   - Đổi IPC signature → phải hunt trong toàn bộ pages

2. **switch-case provider vẫn cần update thủ công** khi thêm provider mới (`translate.ts` + `chat.ts` + `tts.ts` + ...). Chưa có registry/strategy pattern cho provider dispatch.

3. **handleTranslate** phụ thuộc ~12 state variables qua closure — khó extract thành service, khó test độc lập.

---

### 5. Testing — 7/10

**Đánh giá:** Cải thiện đáng kể. IPC chat tests mới bổ sung 15+ test cases tốt. Vẫn thiếu tests cho translate.ts, imageTranslate.ts và UI tests còn mỏng.

#### ✅ Điểm tốt

- **`electron/ipc/__tests__/chat.test.ts`** — test file mới, chất lượng tốt:
  - `buildEnforcedSystemPrompt`: 4 tests (empty, whitespace, wrapping, trimming)
  - `isLikelyChatModel`: 5 tests (standard chat, instruct, image, search, legacy)
  - `scoreOpenAIChatModel`: 5 tests (non-chat, gpt-5 vs gpt-4, mini vs nano, 4o bonus)
  - IPC validation: 5 tests (empty messages, too long, boundary 3000, missing key, unknown provider)
  - Error categorization: 2 tests (INVALID_KEY, RATE_LIMIT)

- **Test IPC handler pattern** đúng — dùng mock IpcMain:
  ```ts
  function buildMockIpcMain() {
    const handlers: Record<string, Function> = {}
    const ipcMain = { handle: (channel, handler) => { handlers[channel] = handler } }
    const invoke = (channel, params) => handlers[channel]?.({}, params)
    return { ipcMain, invoke }
  }
  ```

- **useAppStore.test.ts** vẫn đầy đủ — cover store state, edge cases, lifecycle.

- **`beforeEach` reset state** đảm bảo tests độc lập.

#### ⚠️ Điểm trừ

1. **Không có test cho `electron/ipc/translate.ts`** — đây là IPC handler quan trọng nhất:
   - `buildPrompt()` với các mode: translate, phoneticOnly, furigana
   - `splitIntoChunks()` — logic chunking phức tạp, nên có unit test
   - `promisePool()`, `withTimeout()` — pure functions dễ test
   - Error categorization (INVALID_KEY, RATE_LIMIT, NETWORK)

2. **Không có test cho `electron/ipc/imageTranslate.ts`** — image translation pipeline không được test.

3. **UI tests trong `TranslatePage.test.tsx` còn mỏng** (8 test cases cơ bản):
   - Không test: handleTranslate flow, image mode, error display từ API call
   - Không mock `window.api` để test actual translation flow

4. **ChatPage.test.tsx** không có file test mới (chỉ store test + TranslatePage test).

---

### 6. Performance — 8/10

**Đánh giá:** Không thay đổi so với lần trước. Pattern tốt, không có bottleneck rõ ràng.

#### ✅ Điểm tốt

- **Debounce auto-translate** configurable (300ms–2000ms):
  ```ts
  debounceRef.current = setTimeout(() => { handleTranslateRef.current() }, autoTranslateDelay)
  ```

- **Stable refs** cho effects — tránh stale closures và re-subscribe không cần thiết:
  ```ts
  const handleTranslateRef = useRef(handleTranslate)
  handleTranslateRef.current = handleTranslate  // cập nhật mà không trigger re-effect
  ```

- **`lastAssistantIdx` tính ngoài `.map()`** bằng `reduce()` — tránh O(n²):
  ```ts
  const lastAssistantIdx = messages.reduce(
    (acc, m, i) => (m.role === 'assistant' ? i : acc), -1
  )
  ```

- **Image resize + cleanup đúng**:
  ```ts
  URL.revokeObjectURL(url)  // cleanup object URL sau khi dùng
  ```

- **Scroll sync dùng `requestAnimationFrame`** — tránh layout thrashing.

- **Chunked translation với concurrency limit** (CHUNK_CONCURRENCY = 5) + per-chunk timeout (90s).

#### ⚠️ Điểm trừ

1. **SettingsPage vẫn không lazy load sections** — dù đã tách thành component riêng, tất cả đều import và render cùng lúc trong SettingsPage.tsx. Với 8 sections thì impact nhỏ, nhưng có thể dùng `React.lazy` cho sections ít dùng (UpdaterSection, AboutSection).

2. **`scoreOpenAIChatModel`** tạo regex và parse string mỗi lần gọi — chấp nhận được với model list nhỏ.

---

### 7. Security — 5/5

**Đánh giá:** Đã fix vấn đề từ lần trước. Bảo mật hoàn chỉnh cho desktop app quy mô này.

#### ✅ Điểm tốt

- **API keys chỉ đọc từ OS Keychain trong main process**:
  ```ts
  // chat.ts:40-42
  async function getApiKey(provider: string): Promise<string | null> {
    return getStoredApiKey(provider)  // Keychain only, never exposed to renderer
  }
  ```

- **`MAX_CHAT_REQUEST_CHARS` đã enforce tại IPC handler** (đã fix):
  ```ts
  // chat.ts:334-344
  if (lastMsgTextChars > MAX_CHAT_REQUEST_CHARS) {
    return { success: false, error: `Message too long...` }
  }
  ```
  Ngăn bypass từ direct IPC call không qua UI.

- **Error messages không lộ sensitive info / stack trace**:
  ```ts
  return { success: false, error: 'Invalid API key. Please check your key in Settings.' }
  ```

- **Input validation trước khi gọi AI provider** — check `sourceText.trim()`, `!apiKey`, empty messages.

- **IPC channel validation** — check provider trước khi dispatch:
  ```ts
  default: return { success: false, error: `Unknown provider: ${provider}` }
  ```

---

### 8. Documentation — 4/5

**Đánh giá:** README xuất sắc, JSDoc đúng chỗ. Còn thiếu documentation cho `window.api` interface.

#### ✅ Điểm tốt

- **README đầy đủ**: download links, getting started, API keys, dev setup (`npm install`, `npm run rebuild`, `npm run dev`), build commands, project structure, tech stack, changelog.

- **JSDoc đúng chuẩn** cho các functions phức tạp:
  ```ts
  /**
   * Wrap a raw translate function with automatic chunking, per-chunk timeout,
   * and concurrency-limited parallel execution.
   * ...
   */
  async function translateChunked(...)
  ```

  ```ts
  /**
   * Register all chat-related IPC handlers with the Electron main process.
   * Handlers registered: `chat:send`
   * All handlers: read API key from Keychain, validate inputs, categorize errors.
   */
  export function registerChatHandlers(ipcMain: IpcMain)
  ```

- **Comment giải thích "tại sao"** chất lượng cao:
  ```ts
  // Hard fallback — only reached when models API itself fails
  // Sentinel value set on translatedText when a Gemini image-edit result is shown.
  // Non-empty so action buttons conditionally appear...
  ```

- **`biome-ignore` comments** đều giải thích lý do cụ thể.

#### ⚠️ Điểm trừ

1. **`window.api` interface không được document**: người mới vào project không biết các methods có sẵn, signature, error shape. Nên thêm JSDoc cho preload.ts hoặc tạo `window.api.d.ts`.

2. **README không link đến CONTRIBUTING.md** và không có hướng dẫn chạy test (`npm test`).

---

## So Sánh Trước / Sau

| Tiêu chí        | 12:10 (trước) | 16:27 (sau) | Thay đổi |
|-----------------|---------------|-------------|----------|
| Correctness     | 22/25         | 23/25       | +1       |
| Architecture    | 12/15         | 13/15       | +1       |
| Code Quality    | 11/15         | 13/15       | +2       |
| Maintainability | 10/15         | 12/15       | +2       |
| Testing         | 6/10          | 7/10        | +1       |
| Performance     | 8/10          | 8/10        | 0        |
| Security        | 4/5           | 5/5         | +1       |
| Documentation   | 4/5           | 4/5         | 0        |
| **Tổng**        | **77/100**    | **85/100**  | **+8**   |

---

## Điểm Mạnh

1. **Cải thiện có hệ thống** — 7/9 khuyến nghị từ lần chấm trước đã được fix trong cùng ngày.

2. **IPC chat tests chất lượng cao** — mock IpcMain pattern đúng, test cases mô tả rõ ràng, cover boundary conditions.

3. **useVoiceInput hook** loại bỏ ~60 dòng duplicate code giữa ChatPage và TranslatePage — DRY principle.

4. **Store architecture sạch** — Zustand slices + persist + PROVIDERS registry tự động.

5. **Chunked translation pipeline** — `splitIntoChunks` + `promisePool` + `withTimeout` là implementation chắc chắn cho long-form translation.

6. **Security model hoàn chỉnh** — keys trong Keychain, IPC validation, error handling không lộ sensitive data.

---

## Điểm Cần Cải Thiện

### 🔴 Ưu tiên cao

1. **Thêm tests cho `electron/ipc/translate.ts`** — đây là core business logic chưa được test:
   ```ts
   // Nên test:
   describe('buildPrompt')   // phoneticOnly mode, furigana, style variants
   describe('splitIntoChunks')  // paragraph/line/sentence/hard split logic
   describe('promisePool')   // concurrency, ordering, error propagation
   describe('withTimeout')   // timeout rejects, cleanup
   describe('registerTranslateHandlers — IPC validation')  // tương tự chat.test.ts
   ```

2. **Thêm tests cho `electron/ipc/imageTranslate.ts`** — image translation pipeline.

### 🟠 Ưu tiên trung bình

3. **Tách component con trong TranslatePage.tsx (733 dòng)**:
   ```tsx
   // Candidates:
   <VoiceOverlay />       // listening overlay (dòng 409–457)
   <ImagePreview />       // image attachment preview (dòng 461–492)
   <SourceBottomBar />    // bottom bar với speak/rewrite/clear (dòng 517–590)
   <ResultBottomBar />    // bottom bar của result panel (dòng 635–714)
   ```

4. **Tách component con trong ChatPage.tsx (807 dòng)**:
   ```tsx
   // MessageBubble đã tách tốt. Còn lại:
   <SystemPromptDropdown />    // dòng 463–565
   <ChatInputArea />           // dòng 657–803
   ```

5. **Service layer cho window.api calls**:
   ```ts
   // src/services/translationService.ts
   export const translateText = (params) => window.api.translate(params)
   export const translateImage = (params) => window.api.translateImage(params)
   // Giảm coupling, dễ mock trong tests
   ```

6. **Thay inline SVG trong ChatPage.tsx** (dòng 742–746) bằng icon component từ `src/components/ui/icons/`.

### 🟡 Ưu tiên thấp

7. **Lazy loading cho UpdaterSection, AboutSection** trong SettingsPage:
   ```tsx
   const UpdaterSection = React.lazy(() => import('./settings/UpdaterSection'))
   ```

8. **Document `window.api` interface** trong `preload.ts` hoặc tạo type declaration file.

9. **Link README → CONTRIBUTING.md** và thêm `npm test` vào Dev section.

---

## Tổng Kết

**Điểm tổng: 85/100** (+8 so với lần chấm trước)

Lotus đã có những cải thiện đáng kể trong cùng ngày sau lần chấm đầu tiên. Đặc biệt:
- **SettingsPage refactor hoàn toàn** (1570 → 8 files riêng biệt) giải quyết vấn đề lớn nhất
- **IPC chat tests** bổ sung chứng minh khả năng test được của kiến trúc IPC
- **Provider registry pattern** giảm hard-code đáng kể

Để đạt 90+, cần tập trung:
1. **Testing coverage** cho `translate.ts` và `imageTranslate.ts` IPC handlers
2. **Tách component** trong TranslatePage và ChatPage
3. **Service layer** để giảm coupling pages ↔ window.api
