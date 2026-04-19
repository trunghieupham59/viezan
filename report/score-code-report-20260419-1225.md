# Báo cáo Chấm Điểm Source Code
**Ngày:** 19/04/2026 12:30  
**Loại bài:** Project lớn (Electron + React desktop app)  
**Phạm vi:** Toàn bộ `src/` và `electron/`  
**Workflow:** score-code v1.0.0

---

## Kết quả tổng hợp

| Tiêu chí | Điểm tối đa | Điểm đạt | Nhận xét |
|---|---|---|---|
| Correctness | 25 | 22 | Logic core đúng, một số edge case chưa phủ |
| Architecture | 15 | 13 | Kiến trúc rõ ràng, phân tách tốt; một số minor violation |
| Code Quality | 15 | 12 | Chất lượng cao, còn duplicate nhỏ và hardcode |
| Maintainability | 15 | 13 | Comment đầy đủ, naming tốt; file dài |
| Testing | 10 | 6 | Test ở electron/ipc, thiếu component tests |
| Performance | 10 | 8 | Debounce, chunking, concurrency tốt; một số optimization minor |
| Security | 5 | 4 | Electron security tốt; một số input validation thiếu |
| Documentation | 5 | 4 | JSDoc phủ rộng, một số nơi thiếu |
| **Tổng** | **100** | **82** | |

---

## Chi tiết từng tiêu chí

---

### 1. Correctness — 22/25

#### Điểm mạnh
- **Translation pipeline hoàn chỉnh:** Text translate, image translate (Gemini edit + Claude/OpenAI region fallback), rewrite, phonetic annotation — tất cả đều có error handling.
- **Generation counter pattern (`translateGenerationRef`):** Cancels in-flight requests đúng cách khi user thay đổi input, tránh race condition và stale result.
- **Language swap logic:** `swapLanguages` trong store dùng detected language làm new target thay vì hardcode, xử lý đúng `'auto'` → `'ja'` fallback.
- **Chat session management:** `ensureSession()`, message history building, regenerate last assistant message — đều xử lý edge case.
- **VAD three-gate system** trong `useLiveTranslate.ts`: Gate 1 (RMS), Gate 2 (sustained), Gate 3 (peak) giúp loại false positive hiệu quả.
- **Whisper confidence gates** (`noSpeechProb`, `avgLogprob`, `compressionRatio`) để lọc hallucination.
- **Chunked translation** với `splitIntoChunks` tìm natural break points (paragraph → line → sentence → hard split), concurrency limit.

#### Điểm trừ (−3)
- **`renderInline()` duplicate** (MarkdownEditor vs MarkdownText): Nếu một file sửa regex pattern (thêm strikethrough `~~text~~` hay link `[text](url)`), file còn lại sẽ bị lỗi divergence. (−1)
- **`ImageAttachmentPreview` không được dùng trong ChatPage:** ChatPage có inline JSX duplicate với `previewUrl` thay vì `previewDataUrl`, nhất quán UI nhưng thiếu `z-10` trên button — hover experience không consistent giữa 2 trang. (−1)
- **Fallback message cứng trong `handleStart` của `useLiveTranslate.ts` (line 530):** `'System audio not available — please check "Share audio"...'` — hardcoded English error không qua i18n, user Vi/Ja không đọc được. (−1)

---

### 2. Architecture — 13/15

#### Điểm mạnh
- **Electron IPC separation:** Renderer không gọi API trực tiếp. Toàn bộ AI calls đi qua `window.api.*` IPC bridge. API keys ở OS Keychain, không bao giờ expose sang renderer.
- **Hook extraction pattern nhất quán:**
  - `useTranslate` — tách toàn bộ business logic từ TranslatePage (~600 dòng)
  - `useLiveTranslate` — pipeline audio/STT/translate/subtitle
  - `useTTS`, `useVoiceInput` — shared cross-page
- **Service layer abstraction:** `translationService.ts`, `chatService.ts` — tách IPC calls thành interface có thể mock trong tests.
- **Store slices:** `chatSlice`, `historySlice`, `settingsSlice` — state được chia thành functional areas, không phải một monolithic store.
- **Registry pattern cho provider dispatch:** `TRANSLATE_PROVIDERS`, `REWRITE_PROVIDERS`, `CHAT_PROVIDERS`, `DETECT_PROVIDERS` loại bỏ switch/case lặp (đã refactor DUP-04, DUP-06).
- **Constants centralized:** `src/constants/` (providers, image, audio, ui, urls) + `electron/ipc/ipcConstants.ts` — single source of truth.
- **Settings tách thành sections:** `ApiKeysSection`, `PreferencesSection`, `TtsSection`, `BrowserIntegrationSection`, `ChatPresetsSection`, `UpdaterSection`, `AboutSection` — mỗi section có lifecycle độc lập.

#### Điểm trừ (−2)
- **`ProviderIcon.tsx` có 3 SVG inline** thay vì dùng icon registry (`src/components/ui/icons/`). Đây là vi phạm quy tắc icon centralization mà project đã đặt ra. (−1)
- **`SCREEN_RECORDING_PREFS` URL** define inline trong `LiveTranslatePage.tsx` thay vì `constants/urls.ts`. Nhỏ nhưng là architecture consistency issue. (−1)

---

### 3. Code Quality — 12/15

#### Điểm mạnh
- **TypeScript coverage tốt:** Interface được define rõ ràng cho mọi component (props, hook return, IPC params/results). `type` vs `interface` dùng đúng convention.
- **Consistent naming:** `handle*` prefix cho event handlers, `is*` cho booleans, `set*` cho state setters, `on*` cho callback props.
- **Biome linting:** `biome-ignore` comments mỗi cái đều có justification rõ ràng (không suppress blindly).
- **Error handling pattern nhất quán:** `classifyProviderError()` tập trung error classification, `noApiKeyResponse()` tập trung no-key response — không có copy-paste error handling.
- **`useCallback`/`useMemo` dùng đúng chỗ:** Chỉ dùng khi cần tránh re-render hay ổn định dependency trong effect.
- **Ref pattern cho stable callbacks:** `handleTranslateRef`, `autoTranslateRef`, `sourceTextRef` — pattern đúng để tránh stale closure trong effects mà không cần re-register.
- **Debounced storage:** `createDebouncedStorage(500)` trong `useAppStore` — tránh flood localStorage writes khi state thay đổi nhanh.

#### Điểm trừ (−3)
- **`renderInline` duplicate** giữa MarkdownEditor và MarkdownText — DRY violation rõ ràng. (−1)
- **Hardcode strings không qua i18n** trong một số component quan trọng: `ApiKeyInput` placeholder, `SystemPromptDropdown` "None"/"No system prompt", `VoiceRecorder` "Speech API unavailable", `handleStart` system audio error. (−1.5)
- **`ChatPage.tsx` 592 dòng** — file dài, một số inline JSX (voice bar animation, image preview) nên extract thêm. (−0.5)

---

### 4. Maintainability — 13/15

#### Điểm mạnh
- **Changelog comments cực kỳ hữu ích:** Comments như `// DUP-05: resizeImageToBase64 replaced by shared resizeImageFile`, `// HC-09: MAX_TRANSLATE_IMAGE_DIMENSION imported from constants/image.ts` — developer sau có thể trace lịch sử refactor mà không cần git blame.
- **Inline documentation chất lượng cao:**
  - `useLiveTranslate.ts`: Giải thích chi tiết VAD thresholds, silence reset, Whisper confidence gates với số liệu cụ thể.
  - `electron/ipc/translate.ts`: Giải thích chunking strategy, context tail, concurrency pool.
  - `constants/providers.ts`: JSDoc hướng dẫn MAINTENANCE khi thêm model mới.
- **`FONT_SIZE_MAP` trong `App.tsx`**: Tập trung pixel values, dễ thay đổi.
- **`DEFAULT_SETTINGS` dùng `getRecommendedModel()`** thay vì hardcode model ID — khi đổi recommended model chỉ cần thay `tag` trong PROVIDERS array.
- **`tpl()` utility** cho template string interpolation thay vì string concatenation.
- **`formatDate()` utility** nhất quán cho date display.

#### Điểm trừ (−2)
- **TODO comment tồn đọng:** `BrowserIntegrationSection.tsx` line 166: `{/* TODO: H-8 — move to i18n key */}` — tồn đọng từ lần refactor trước. (−1)
- **`MarkdownEditor.tsx` không có JSDoc** ở component-level dù là component phức tạp nhất (live markdown editing, line-by-line rendering, keyboard navigation). (−0.5)
- **`useLiveTranslate.ts` 785 dòng** — file rất dài, tuy có tổ chức rõ ràng nhưng khó navigate. Audio capture, VAD, pipeline, subtitle IPC, summarize có thể tách thêm. (−0.5)

---

### 5. Testing — 6/10

#### Điểm mạnh
- **IPC handler tests tồn tại:**
  - `electron/ipc/__tests__/chat.test.ts`
  - `electron/ipc/__tests__/translate.test.ts`
  - `electron/ipc/__tests__/imageTranslate.test.ts`
  - `electron/ipc/__tests__/constants.test.ts`
- **Store tests:** `src/store/__tests__/` — test state management logic.
- **Utils tests:** `src/utils/__tests__/` — test utility functions.
- **Vitest setup**: `vitest.config.ts`, `src/test/setup.ts` — testing infrastructure tốt.

#### Điểm trừ (−4)
- **Không có component tests:** Các component phức tạp như `MarkdownEditor`, `VoiceRecorder`, `ModelSelector`, `ApiKeyInput` không có tests. (−2)
- **Không có hook tests:** `useTranslate`, `useLiveTranslate`, `useTTS`, `useVoiceInput` — các hooks quan trọng nhất không có test file. (−1.5)
- **Không có E2E tests:** Không có Playwright/Cypress tests cho user flows quan trọng (translate text, image translate, chat). (−0.5)

---

### 6. Performance — 8/10

#### Điểm mạnh
- **Auto-translate debounce** (`autoTranslateDelay` configurable 300–2000ms) — tránh spam API.
- **`translateGenerationRef` cancellation** — abandoned requests không update state.
- **Chunked translation với concurrency pool** (`CHUNK_CONCURRENCY = 5`) — document dài được translate song song, có timeout per chunk.
- **`createDebouncedStorage(500)`** — batches localStorage writes.
- **VAD three-gate** — loại silent chunks trước khi gọi Whisper API, tránh wasted calls.
- **`lastChunkTextRef` + Jaccard similarity** — phát hiện và bỏ duplicate STT chunks.
- **`CHUNK_MAX_QUEUE_AGE_MS = 10000`** — discard stale audio chunks khi queue chậm.
- **`MAX_RAW_TRANSCRIPT_CHARS = 50000`** — giới hạn memory growth cho long sessions.
- **Lazy import** `await import('@google/generative-ai')` etc. — provider SDKs chỉ load khi cần.

#### Điểm trừ (−2)
- **`FuriganaText.tsx` dùng `key` không ổn định:** `key={\`ruby-${seg.base}-${seg.reading}\`}` — nếu có 2 từ giống nhau trong text, key bị trùng → React warning + potential rendering issue. (−0.5)
- **`MarkdownText.tsx` rebuild toàn bộ elements array mỗi render** không có memoization — với long AI responses có thể expensive. (−0.5)
- **`ModelSelector` re-fetches models mỗi khi provider thay đổi và key exists nhưng `currentDynamic.length === 0`** — không có cache expiry, không biết khi nào models list stale. (−1)

---

### 7. Security — 4/5

#### Điểm mạnh
- **API keys stored in OS Keychain** — không trong localStorage, không trong file, không trong IPC params từ renderer. `getStoredApiKey(provider)` là single access point.
- **Electron security best practices:**
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
  - `setWindowOpenHandler` intercepts external links → `shell.openExternal`
- **`noApiKeyResponse()`** + `classifyProviderError()` — không leak raw error messages với sensitive context.
- **`MAX_CHAT_REQUEST_CHARS` validation trong main process** — defense-in-depth even if renderer check bypassed.
- **Content navigation restriction** (`will-navigate` handler) — prevents renderer từ navigating ra ngoài app domain.
- **`ContextBridge` preload** — expose minimal API surface, không expose `ipcRenderer` trực tiếp.

#### Điểm trừ (−1)
- **`dangerouslySetInnerHTML`** trong `LiveTranslatePage.tsx` line 182: `dangerouslySetInnerHTML={{ __html: t.live_screen_recording_hint }}`. i18n strings có thể bị XSS nếu content từ user input hoặc untrusted source. Trong trường hợp này string là từ locale file của developer nên risk thấp, nhưng pattern này là bad practice. (−1)

---

### 8. Documentation — 4/5

#### Điểm mạnh
- **Service files:** `translationService.ts`, `chatService.ts` — có JSDoc đầy đủ với usage example.
- **Hook files:** `useTTS.ts`, `useVoiceInput.ts` — JSDoc với interface definitions và usage pattern.
- **Constants files:** `constants/providers.ts` MAINTENANCE comment, `constants/image.ts`, `constants/ui.ts`, `constants/audio.ts` — mỗi constant có inline comment.
- **`ipcConstants.ts`** — mỗi constant có comment giải thích purpose, cross-reference (HC-01 đến HC-09).
- **`errorUtils.ts`** — usage examples trong JSDoc.
- **`ARCHITECTURE.md`** có trong project root.
- **Comment density cao ở complex algorithms** (VAD, chunking, concurrency pool).

#### Điểm trừ (−1)
- **`MarkdownEditor.tsx` và `MarkdownText.tsx`** không có file-level JSDoc comment. Hai component này phức tạp nhất trong UI layer nhưng thiếu overview. (−0.5)
- **`ChatPage.tsx`** (592 dòng) không có section headers hoặc JSDoc giải thích state machine / flow. (−0.5)

---

## Điểm mạnh tổng thể

1. **Architecture phân tách rất tốt** — hooks, services, store slices, IPC registry pattern đều mature.
2. **Security-first Electron setup** — keychain storage, sandbox, contextIsolation.
3. **Chunked translation với concurrency** — xử lý document dài real-world.
4. **VAD + Whisper confidence gates** — live translate pipeline production-ready.
5. **Constants centralization** — history of refactor preserved trong comments.
6. **i18n coverage rộng** — hầu hết UI text đều qua i18n system.
7. **Provider registry pattern** — thêm provider mới chỉ cần thêm 1 entry vào registry.

---

## Điểm cần cải thiện

1. **Testing gap lớn ở component/hook layer** — no tests cho hooks quan trọng nhất.
2. **`renderInline` duplicate** giữa 2 markdown renderers.
3. **Hardcode strings không qua i18n** trong một số components.
4. **`dangerouslySetInnerHTML`** pattern nên tránh.
5. **`FuriganaText` key collision** risk.
6. **Không có model cache expiry** trong ModelSelector.
7. **File length:** `useLiveTranslate.ts` (785 dòng), `useTranslate.ts` (616 dòng), `ChatPage.tsx` (592 dòng) — cần monitor.

---

## Khuyến nghị

### Ưu tiên cao
```
1. Viết tests cho useTranslate, useTTS, useVoiceInput hooks
   → Jest + React Testing Library + mock window.api
2. Extract renderInline() thành src/utils/markdownInline.tsx
3. Fix FuriganaText key collision: dùng index-based key
   key={`seg-${idx}`} thay vì key={`ruby-${seg.base}-${seg.reading}`}
```

### Ưu tiên trung bình
```
4. Thêm i18n keys cho hardcoded strings (H-8, placeholder, "None", error messages)
5. Replace dangerouslySetInnerHTML với safe HTML rendering
6. Add model cache với expiry time (e.g. 30 min) trong ModelSelector
7. Extract ChatPage image preview → dùng ImageAttachmentPreview component
```

### Ưu tiên thấp
```
8. MarkdownText memoization cho long AI responses
9. JSDoc cho MarkdownEditor.tsx và ChatPage.tsx
10. Move SCREEN_RECORDING_PREFS vào constants/urls.ts
11. Provider icons vào src/components/ui/icons/providers.tsx
```
