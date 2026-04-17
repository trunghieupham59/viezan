# Báo cáo Chấm Điểm Source Code — Lotus Translate
**Ngày:** 2026-04-18  
**Loại bài:** Project lớn  
**Phạm vi:** `src/` và `electron/`  
**Rubric áp dụng:** `workflow/score-code` → type: `project`

---

## 📋 Tổng quan Project

**Lotus** là Electron desktop app dành cho dịch thuật AI đa nền tảng (macOS/Windows), tích hợp ba AI provider (Google Gemini, Anthropic Claude, OpenAI GPT). Stack: Electron v41 + React v18 + TypeScript v5 + Zustand v5 + Vite v5 + Tailwind.

Tính năng chính: dịch văn bản, dịch ảnh (OCR), voice input (Whisper STT), TTS, live translate real-time với subtitle overlay, AI chat, translation history, global hotkey, Chrome Extension bridge, multi-language UI (EN/VI/JA).

---

## 📊 Bảng Điểm

| Tiêu chí | Trọng số | % đạt | Điểm đạt | Nhận xét ngắn |
|----------|:--------:|:-----:|:--------:|--------------|
| Correctness | 25 | 84% | **21** | Logic đúng, có nhiều guard, một vài chỗ swallow lỗi |
| Architecture | 15 | 82% | **12** | IPC layer rõ ràng, còn vài handler inline trong main.ts |
| Code Quality | 15 | 85% | **13** | Naming tốt, DRY tốt, TranslatePage.tsx quá dài |
| Maintainability | 15 | 80% | **12** | Abstraction tốt, dual-source-of-truth cho 2 constant |
| Testing | 10 | 70% | **7** | Coverage tốt nhưng mock không nhất quán |
| Performance | 10 | 83% | **8** | Chunking, debounce, bounded collection đúng |
| Security | 5 | 88% | **4** | Rất tốt, chỉ có `sandbox: false` cần lưu ý |
| Documentation | 5 | 82% | **4** | README đầy đủ nhưng còn một chỗ outdated |
| **TỔNG** | **100** | **83%** | **81/100** | |

---

## 🔍 Phân tích chi tiết

---

### 1. Correctness — 21/25

**Điểm mạnh:**

- **Generation ref pattern** chống race condition triệt để trong async translation:
  ```ts
  // TranslatePage.tsx
  const generation = ++translateGenerationRef.current
  // ...
  if (translateGenerationRef.current !== generation) return // guard ở mọi checkpoint async
  ```

- **Chunked translation** với timeout và concurrency control cho văn bản dài:
  ```ts
  // translate.ts
  const CHUNK_CHAR_LIMIT = 12_000
  const CHUNK_TIMEOUT_MS = 90_000
  const CHUNK_CONCURRENCY = 5
  // withTimeout() + promisePool() được test đầy đủ
  ```

- **Whisper 3-gate VAD** + confidence gates ngăn hallucination trong live translate:
  ```ts
  if (typeof stt?.noSpeechProb === 'number' && stt.noSpeechProb > NO_SPEECH_PROB_MAX) return
  if (typeof stt?.avgLogprob === 'number' && stt.avgLogprob < AVG_LOGPROB_MIN) return
  if (typeof stt?.compressionRatio === 'number' && stt.compressionRatio > COMPRESSION_RATIO_MAX) return
  ```

- **Input validation** ở cả renderer và main process (defense-in-depth):
  ```ts
  // chat.ts — server-side enforcement kể cả khi renderer bị bypass
  if (lastMsgTextChars > MAX_CHAT_REQUEST_CHARS) { return { success: false, error: `Message too long...` } }
  ```

- **swapLanguages** xử lý edge case `sourceLang === 'auto'`:
  ```ts
  const newTargetLang = state.sourceLang === 'auto' ? 'ja' : state.sourceLang
  ```

**Điểm trừ:**

- **Silent error swallowing** trong live translate pipeline:
  ```ts
  // useLiveTranslate.ts
  } catch { /* keep existing */ }  // ← lỗi translation trong live mode bị bỏ qua hoàn toàn, không có user feedback
  } catch { /* skip */ }           // ← STT call fail cũng bị bỏ qua
  ```

- **handleSwapLanguages** trong TranslatePage tự implement swap logic riêng thay vì dùng `useAppStore().swapLanguages()`:
  ```ts
  // TranslatePage.tsx — logic riêng
  setSourceText(translatedText)
  setTranslatedText('')
  if (detectedSourceLang) setTargetLang(detectedSourceLang)
  // vs store.swapLanguages() — có thể diverge nếu logic thay đổi
  ```

---

### 2. Architecture — 12/15

**Điểm mạnh:**

- **IPC layer phân tách rõ ràng**: `electron/ipc/` có từng module riêng (translate.ts, chat.ts, imageTranslate.ts, tts.ts, transcribe.ts, models.ts, keychain.ts, storage.ts, errorUtils.ts, ipcConstants.ts). Mỗi module đăng ký handler qua `register*Handlers(ipcMain)`.

- **Security boundary đúng**: `contextIsolation=true`, `nodeIntegration=false`, API key chỉ tồn tại trong main process, renderer chỉ nhận kết quả.

- **Provider registry pattern** (DUP-04/DUP-06) loại bỏ switch/case dispatch:
  ```ts
  const TRANSLATE_PROVIDERS: Record<string, TranslateFn> = {
    gemini: translateWithGemini,
    claude: translateWithClaude,
    openai: translateWithOpenAI,
  }
  // Thêm provider mới → chỉ cần thêm 1 entry vào registry
  ```

- **Zustand slice pattern**: store được tách thành CoreSlice + SettingsSlice + HistorySlice + ChatSlice, mỗi slice có interface rõ ràng và tự quản lý state riêng.

- **Service layer**: `translationService`, `chatService` tách renderer khỏi IPC interface — thay đổi IPC chỉ cần sửa service, không cần sửa các Page.

- **useLiveTranslate hook** extract toàn bộ business logic ra khỏi LiveTranslatePage — component chỉ còn render logic.

**Điểm trừ:**

- **Một số IPC handler nằm trực tiếp trong main.ts** thay vì có module riêng trong `electron/ipc/`:
  ```ts
  // main.ts (dài 330 dòng)
  ipcMain.handle('subtitle:show', ...)        // nên vào ipc/subtitle.ts
  ipcMain.handle('subtitle:hide', ...)
  ipcMain.handle('subtitle:update', ...)
  ipcMain.handle('subtitle:setStyle', ...)
  ipcMain.on('subtitle:close', ...)
  ipcMain.handle('translate:live-stream', ...) // nên vào ipc/translate.ts
  ipcMain.handle('app:checkScreenPermission', ...)
  ipcMain.handle('app:openExternal', ...)
  ```
  Tổng cộng 8 handler inline trong main.ts, không nhất quán với pattern của toàn dự án.

- **TranslatePage.tsx dài 904 dòng** — đây là page component nhưng bao gồm quá nhiều responsibilities: image processing, voice input, drag-drop, scroll sync, TTS, rewrite, language swap. Nhiều handler có thể extract thành custom hooks tương tự `useLiveTranslate`.

---

### 3. Code Quality — 13/15

**Điểm mạnh:**

- **Naming rất rõ ràng**: `translateGenerationRef`, `jaccardSimilarity`, `isHallucination`, `buildEnforcedSystemPrompt`, `splitIntoChunks`, `promisePool` — đọc tên là hiểu.

- **Constants được đặt tên có nghĩa** và tập trung:
  ```ts
  // ipcConstants.ts — 128 dòng, mỗi constant có JSDoc giải thích tại sao
  export const CHUNK_CHAR_LIMIT = 12_000   // ~3000 tokens
  export const SPEECH_RMS_THRESHOLD = 6    // sustained sensitivity - slightly above room hum
  export const NO_SPEECH_PROB_MAX = 0.65   // Whisper's own estimate
  export const MAX_WORDS_PER_CHUNK = 40    // human speech tops at ~5 words/sec
  ```

- **DRY tốt**: errorUtils.ts (classifyProviderError, noApiKeyResponse) được tái sử dụng ở 3 IPC handler khác nhau. DUP-xx comment markers ghi lại những chỗ đã resolve duplication.

- **Coding style nhất quán**: biome linting được enforce, biome.json tồn tại.

- **Hàm pure được tách riêng** để có thể test: `splitIntoChunks`, `buildPrompt`, `withTimeout`, `promisePool`, `normalizeDetectedLang`, `isHallucination`, `jaccardSimilarity`, `extractCompleteSentences`.

**Điểm trừ:**

- **TranslatePage.tsx** có `handleTranslate` callback ~90 dòng — quá dài cho một callback, nên extract ra custom hook.

- **`any` types** xuất hiện nhiều lần trong chat.ts do Gemini/Claude/OpenAI SDK type incompatibilities:
  ```ts
  const parts: any[] = []  // ×4 lần trong chatWithGemini
  const formattedMessages: { role: 'user' | 'assistant'; content: any[] }[]  // chatWithClaude
  const formattedMessages: any[]  // chatWithOpenAI
  ```
  Được biome-ignore comment, nhưng vẫn là code smell cần monitor.

---

### 4. Maintainability — 12/15

**Điểm mạnh:**

- **Thêm provider mới**: chỉ cần (1) thêm entry vào `PROVIDERS` array, (2) thêm function vào registry — không cần sửa bất kỳ page nào:
  ```ts
  // settingsSlice.ts — tự build từ PROVIDERS registry
  keyStatus: Object.fromEntries(PROVIDERS.map((p) => [p.id, false]))
  dynamicModels: Object.fromEntries(PROVIDERS.map((p): [string, FetchedModel[]] => [p.id, []]))
  ```

- **Config tách khỏi code**: `DEFAULT_SETTINGS` dùng `getRecommendedModel()` — đổi tag trong PROVIDERS tự động cập nhật default model.

- **Error handling nhất quán** qua `classifyProviderError()` — thêm error pattern mới chỉ cần sửa 1 chỗ.

**Điểm trừ:**

- **Dual-source-of-truth cho 2 constant quan trọng**:
  ```ts
  // src/constants/providers.ts
  export const MAX_CHAT_INPUT_CHARS = 3000
  export const DETECT_LANG_MAX_CHARS = 500
  
  // electron/ipc/ipcConstants.ts
  export const MAX_CHAT_REQUEST_CHARS = 3_000   // "Must stay in sync with ↑"
  export const DETECT_LANG_MAX_CHARS = 500      // "Must stay in sync with ↑"
  ```
  Comment nhắc sync là tốt, nhưng không có automation để enforce — lập trình viên mới dễ quên cập nhật cả hai.

- **TranslatePage.tsx** quá monolithic (904 dòng) — khi cần thay đổi bất kỳ feature nào trong page này (image, voice, TTS, rewrite) đều phải đọc toàn bộ component để hiểu context.

---

### 5. Testing — 7/10

**Điểm mạnh:**

- **Test coverage đa dạng**: 4 test suite chính với tổng ~1377 dòng test code:
  - `translate.test.ts` (490 dòng): splitIntoChunks (6 cases), buildPrompt (7 cases), withTimeout (4), promisePool (5), normalizeDetectedLang (13), IPC validation (10)
  - `chat.test.ts` (242 dòng): buildEnforcedSystemPrompt, isLikelyChatModel, scoreOpenAIChatModel, IPC validation
  - `imageTranslate.test.ts` (358 dòng): langName, buildImageTranslatePrompt, scoreModelForVision, isVisionUnsupportedError, isModelNotFoundError
  - `useAppStore.test.ts` (287 dòng): history, swapLanguages, chat sessions, system prompts, clearTranslation

- **Test cover edge cases**: boundary (exactly at limit), empty/whitespace, unknown provider, missing API key, consecutive default preset.

- **Code được thiết kế testable**: pure functions exposed, IPC handlers wrap-able với mock ipcMain.

**Điểm trừ:**

- **Mock inconsistency nghiêm trọng**: `getStoredApiKey` là synchronous (`returns string | null`) nhưng nhiều test mock nó như async:
  ```ts
  // translate.test.ts line 265 — SAI: mockResolvedValue cho sync function
  vi.mocked(getStoredApiKey).mockResolvedValue(null)
  // → getStoredApiKey() sẽ trả về một Promise (truthy), không phải null
  // → if (!apiKey) KHÔNG bao giờ true → test NO_API_KEY thực ra không test đúng path
  
  // Nhưng line 474 — ĐÚNG:
  vi.mocked(getStoredApiKey).mockReturnValue(null)
  ```
  Điều này có nghĩa một số test "pass" nhưng không test đúng production behavior.

- **Không có test cho `useLiveTranslate` hook** — đây là hook phức tạp nhất (771 dòng) với nhiều state, VAD logic, STT pipeline, nhưng hoàn toàn thiếu test.

- **Không có test cho `isHallucination`, `jaccardSimilarity`, `extractCompleteSentences`** — các pure function này quan trọng với live translate nhưng chưa có test file riêng (có file `src/utils/__tests__/` nhưng không thấy nội dung).

---

### 6. Performance — 8/10

**Điểm mạnh:**

- **Chunked translation với concurrency pool**: văn bản dài được chia nhỏ, tối đa 5 chunk song song, mỗi chunk có timeout 90s riêng.

- **Stale chunk discard** trong live translate pipeline:
  ```ts
  const queuedAt = Date.now()
  queueRef.current = queueRef.current.then(async () => {
    if (Date.now() - queuedAt > CHUNK_MAX_QUEUE_AGE_MS) return // discard stale chunk
    await processChunk(blob, recMime)
  })
  ```

- **Bounded collections** ngăn memory leak:
  - `MAX_HISTORY = 100`, `MAX_CHAT_SESSIONS = 20`, `MAX_LIVE_SESSIONS = 50`
  - `MAX_RAW_TRANSCRIPT_CHARS = 50_000` cho long-running live sessions

- **Passive event listeners** cho scroll sync:
  ```ts
  source.addEventListener('scroll', syncFromSource, { passive: true })
  ```

- **Background language detection** không block main translation flow.

**Điểm trừ:**

- **Zustand persist với full state** — history (100 items) + chatSessions (20, mỗi session có nhiều messages) được serialize/deserialize vào localStorage mỗi khi state thay đổi. Với max items, cold-start parsing có thể chậm.

- **Image transfer qua IPC** dưới dạng base64 — với ảnh lớn (sau khi resize), đây là overhead đáng kể do IPC serialization. Đây là giới hạn của Electron IPC model, không phải lỗi thiết kế, nhưng cần biết.

---

### 7. Security — 4/5

**Điểm mạnh:**

- **Electron security best practices**:
  ```ts
  contextIsolation: true,
  nodeIntegration: false,
  ```
  
- **API keys không bao giờ rời main process** — renderer chỉ biết `keyStatus` (boolean):
  ```ts
  // storage.ts — OS-level encryption
  safeStorage.encryptString(apiKey).toString('base64')
  // keys chỉ được decrypt tại thời điểm gọi API
  ```

- **URL allowlist cho openExternal**:
  ```ts
  const allowed = url.startsWith('https://') || url.startsWith('x-apple.systempreferences:')
  if (!allowed) return  // silently deny
  ```

- **Navigation restriction** chặn renderer navigate sang URLs không hợp lệ.

- **Token-based auth** cho local HTTP server (Chrome Extension bridge) với TTL.

- **Renderer input sanitization ở main process** (defense-in-depth — MAX_CHAT_REQUEST_CHARS).

**Điểm trừ:**

- **`sandbox: false`** trong BrowserWindow webPreferences:
  ```ts
  sandbox: false,  // ← Required vì preload cần Node.js modules
  ```
  Đây là trade-off cần thiết cho preload script, nhưng là attack surface nếu renderer bị exploit. Cần kết hợp với contextIsolation (đã có) để mitigate.

---

### 8. Documentation — 4/5

**Điểm mạnh:**

- **README đầy đủ**: features, download links, getting started, API key setup, project structure, tech stack, changelog.

- **Inline comments giải thích deep logic**:
  ```ts
  /**
   * VAD Gate 1 — RMS amplitude threshold (sustained):
   * Pure silence: ~0-3; AC hum/room noise: ~3-6; Quiet speech: ~10-20; Normal speech: ~20-80
   * Gate 2 — sustained speech: MIN_SPEECH_SAMPLES × 80ms = 320ms minimum
   * Gate 3 — peak RMS: rules out AC hum that accumulates enough samples
   */
  ```

- **JSDoc cho exported functions** với usage examples:
  ```ts
  /**
   * Classify a raw error message from an AI provider into a structured IPC error response.
   * Usage:
   *   } catch (error: unknown) {
   *     const msg = error instanceof Error ? error.message : String(error)
   *     return classifyProviderError(msg)
   *   }
   */
  ```

- **DUP-xx và HC-xx comment markers** track các refactor đã thực hiện — hữu ích cho code archaeology.

**Điểm trừ:**

- **README outdated**: Tech Stack table vẫn ghi "keytar v7" nhưng `storage.ts` đã migrate sang Electron's built-in `safeStorage`:
  ```ts
  // storage.ts:
  // "Secure key storage using Electron's built-in safeStorage API.
  //  Replaces keytar — no native module compilation required."
  ```

---

## 🏆 Điểm Mạnh Nổi Bật

1. **IPC Security model xuất sắc**: Context isolation, safeStorage, URL allowlist, token auth cho extension — đây là Electron security best practices được áp dụng đầy đủ.

2. **Live Translate pipeline kỹ lưỡng**: VAD 3-gate, Whisper confidence gates, hallucination filter (30+ patterns đa ngôn ngữ), Jaccard similarity dedup, stale chunk discard — xử lý rất nhiều edge case thực tế.

3. **Extensibility pattern tốt**: Provider registry + PROVIDERS array → thêm provider mới chỉ cần thay đổi ở một chỗ, toàn bộ hệ thống tự cập nhật.

4. **Pure function extraction**: các utility phức tạp được extract thành pure functions testable (splitIntoChunks, withTimeout, promisePool, normalizeDetectedLang, isHallucination, jaccardSimilarity, extractCompleteSentences).

5. **useLiveTranslate hook**: 771 dòng business logic được tách hoàn toàn khỏi UI — tốt cho maintainability và testability tiềm năng.

---

## ⚠️ Điểm Cần Cải Thiện (Ưu tiên cao)

### 1. Fix mock inconsistency trong tests [Testing]
```ts
// SAI — mockResolvedValue cho synchronous function
vi.mocked(getStoredApiKey).mockResolvedValue(null)
// ĐÚNG — dùng mockReturnValue
vi.mocked(getStoredApiKey).mockReturnValue(null)
```
File bị ảnh hưởng: `translate.test.ts` (line 265, 299, 347), `chat.test.ts` (line 155, 167, 199), `imageTranslate.test.ts` (line 152, 163, 197).

### 2. Move inline IPC handlers ra khỏi main.ts [Architecture]
Các handler `subtitle:*`, `translate:live-stream`, `app:checkScreenPermission`, `app:openExternal` nên được chuyển vào modules riêng (`ipc/subtitle.ts`, `ipc/system.ts`) để nhất quán với pattern hiện có.

### 3. Extract TranslatePage business logic vào custom hooks [Code Quality / Maintainability]
`handleTranslate`, image processing, scroll sync, drag-drop có thể thành `useTranslate()` hook tương tự `useLiveTranslate`.

### 4. Fix README outdated [Documentation]
Cập nhật Tech Stack table: keytar → Electron safeStorage.

---

## ⚠️ Điểm Cần Cải Thiện (Ưu tiên thấp)

- Add user-visible error feedback cho live translate pipeline (hiện tại errors bị swallow silently)
- Add tests cho `useLiveTranslate` hook và `src/utils/live-translate.ts`
- Consider `AbortController` thay `translateGenerationRef` pattern cho tương lai
- Explore automated enforcement (type-level hoặc CI check) cho dual-source-of-truth constants

---

## 💡 Khuyến nghị

1. **Fix test mocks ngay** (30 phút) — lỗi mock tuy nhỏ nhưng làm một số test NO_API_KEY không test đúng production code path.
2. **Tách TranslatePage** thành `useTranslate()` hook khi có thời gian refactor.
3. **Move subtitle/system IPC handlers** vào modules riêng trong sprint tiếp theo.
4. **Thêm test cho `live-translate.ts` utilities** — code quan trọng nhưng chưa có test cover.
