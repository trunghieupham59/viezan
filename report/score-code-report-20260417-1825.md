# Code Quality Report — Diff HEAD~1 → HEAD
**Ngày:** 17/04/2026 18:25  
**Workflow:** score-code v1.0.0 (Project type)  
**Commit:** `2bc390c` ← HEAD  
**Rubric áp dụng:** Project lớn (Correctness 25% · Architecture 15% · Code Quality 15% · Maintainability 15% · Testing 10% · Performance 10% · Security 5% · Documentation 5%)

---

## Step 1 — Xác định loại bài

**Loại:** Project lớn / Electron desktop app (multi-provider AI translation)  
**Phạm vi diff:** 14 files, +632 / −57 lines  
**Tính năng mới:** Image translation với vision fallback, Gemini image-edit, shared image utilities, i18n keys

---

## Step 2 — Tổng quan diff

| File | Thay đổi |
|------|----------|
| `electron/ipc/imageTranslate.ts` | Refactor toàn bộ: vision fallback, provider registry, timeout |
| `electron/ipc/__tests__/imageTranslate.test.ts` | **Mới** — unit tests cho imageTranslate |
| `electron/ipc/ipcConstants.ts` | Thêm constants: vision scores, model names, base URLs |
| `electron/preload.ts` | Thêm `onImageModelSwitched` IPC bridge |
| `src/types/index.ts` | Thêm `ImageTextRegion`, `ImageTranslateResult`, `onImageModelSwitched` |
| `src/pages/TranslatePage.tsx` | Tích hợp image translate UI + model-switch notice |
| `src/pages/ChatPage.tsx` | Dùng shared `resizeImageFile`, `extractImageFromClipboard` |
| `src/utils/imageUtils.ts` | **Mới** — shared canvas resize + clipboard extraction |
| `src/utils/__tests__/imageUtils.test.ts` | **Mới** — unit tests cho imageUtils |
| `src/components/translate/ImageAttachmentPreview.tsx` | Extract thành component riêng |
| `src/i18n/locales/{en,ja,vi}.ts` | Thêm `image_model_switched_title/body` |
| `src/i18n/types.ts` | Khai báo type cho i18n keys mới |

---

## Step 3 — Chấm từng tiêu chí

---

### 🔴 1. Correctness — 45/100

**Bằng chứng tốt:**
- `imageTranslate.ts` L433: `if (!imageBase64) return { success: false, error: 'No image data provided' }` — guard đúng.
- Vision fallback loop dùng `triedModels` Set để tránh retry cùng model vô tận.
- JSON parse có `try/catch` ở tất cả 3 provider functions:
  ```ts
  try { return JSON.parse(jsonMatch[0]) as TextRegion[] } catch { return [] }
  ```
- `scoreModelForVision` trả `0` cho các model không hỗ trợ vision (gpt-3.5, o1, o3, o4).
- `translateGenerationRef` pattern trong TranslatePage để cancel stale async jobs — thiết kế đúng.

**Vấn đề nghiêm trọng (R-COR-02, R-COR-04):**

**BUG NGHIÊM TRỌNG #1 — TranslatePage.tsx có code bị hỏng (lines 176–226):**

```ts
// Line 176: khai báo detectLanguageInBackground
const detectLanguageInBackground = useCallback((...) => {
  setIsDetectingLang(true)
  translationService.detectLanguage(...)
    .then((res) => {
      if              // ← SYNTAX ERROR: thiếu điều kiện
        sourceLang,   // ← đây là argument list, không phải điều kiện
        targetLang,
      })
      // Tiếp theo là code của handleTranslate (referencing `result`, `imageAttachment`...)
      if (translateGenerationRef.current !== generation) return
      if (result.success && result.editedImageBase64) { ... }
```

Đây là code bị hỏng: body của `detectLanguageInBackground` (line 176) chứa code thuộc về `handleTranslate`, bao gồm tham chiếu đến `result` (chưa định nghĩa), `imageAttachment`, và luồng xử lý image translation. Đây rõ ràng là kết quả của một merge/edit sai.

**BUG NGHIÊM TRỌNG #2 — `detectLanguageInBackground` bị khai báo trùng:**
- Khai báo 1 (hỏng): line 176 — body bị nhiễm code của `handleTranslate`
- Khai báo 2 (đúng): line 380 — implement đúng, clean

Trong TypeScript/React không thể có 2 `const` cùng tên trong cùng scope → **compile error**.

**BUG #3 — `translateImageWithGeminiEdit` thiếu timeout (R-REL-03):**
```ts
// Line 257: raw fetch không có AbortController
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
// Trong khi đó fetchWithTimeout đã được định nghĩa sẵn ngay phía trên!
```
`fetchWithTimeout` đã được viết (line 14) nhưng không được dùng ở đây.

**BUG #4 — Unknown provider không được xử lý đúng:**
Test tại line 175 expect `result.error.includes('Unknown provider')` nhưng trong code, với provider không có trong `IMAGE_TRANSLATE_PROVIDERS`, loop chạy qua hết rồi trả `NO_VISION` error — không phải "Unknown provider". Test sẽ **FAIL**.

---

### 🟢 2. Architecture — 82/100

**Bằng chứng tốt:**
- Provider registry pattern (R-ARC-01, R-MNT-04): thay thế switch/case bằng map
  ```ts
  const IMAGE_TRANSLATE_PROVIDERS: Record<string, ImageTranslateFn> = {
    gemini: translateImageWithGemini,
    claude: translateImageWithClaude,
    openai: translateImageWithOpenAI,
  }
  ```
- `ipcConstants.ts`: centralize toàn bộ magic numbers/strings — đúng pattern.
- Tách `imageUtils.ts` thành shared utility, dùng lại ở cả `ChatPage` và `TranslatePage` (R-STR-02, R-MNT-05).
- Layer rõ ràng: IPC handler (main process) ↔ preload bridge ↔ renderer service ↔ UI.
- `fetchWithTimeout` được tách thành pure utility function — đúng single responsibility.

**Cần cải thiện:**
- `registerImageTranslateHandlers` tại line 429 dài ~125 lines — vi phạm R-QUA-02 (max 40 lines). Logic fallback nên được tách thành `attemptImageTranslation(candidates, ...)` riêng.
- `fetchVisionModels` có nhánh `if/else if/else if` dài — có thể refactor thành strategy map tương tự provider registry.

---

### 🟡 3. Code Quality — 72/100

**Bằng chứng tốt:**
- Tên biến rõ nghĩa: `triedModels`, `fallbacksFetched`, `candidateKey`, `isVisionUnsupportedError`, `isModelNotFoundError`, `scoreModelForVision` — đều mô tả đúng mục đích.
- Constants được đặt tên rõ ràng (R-QUA-04):
  ```ts
  export const VISION_SCORE_CHEAP   = 100
  export const VISION_SCORE_MID     = 70
  export const VISION_SCORE_LITE_PENALTY = 30
  ```
- `LANG_NAMES` map thay vì switch/case dài.
- `buildPrompt` tách riêng — pure function, testable.

**Vấn đề (R-QUA-02, R-QUA-03):**
- `ipcMain.handle('image:translate', ...)` callback: ~125 lines, vi phạm giới hạn 40 lines nghiêm trọng. Cần tách thành các hàm nhỏ hơn:
  - `handleGeminiEditPath()`
  - `runVisionFallbackLoop()`
- `scoreModelForVision`: gọi `parseFloat(`${gen[1]}.${gen[2] || 0}`)` — implicit string concatenation, nên dùng arithmetic rõ ràng hơn.
- `TranslatePage.tsx` (915 lines) vi phạm giới hạn 300 lines/file (R-STR-02). File cần được split ra.
- `ChatPage.tsx` (703 lines) cũng vượt ngưỡng.

---

### 🟢 4. Maintainability — 80/100

**Bằng chứng tốt:**
- DRY được áp dụng tốt:
  - `resizeImageFile` & `extractImageFromClipboard` extracted thành shared `imageUtils.ts` (DUP-05)
  - `getStoredApiKey` dùng trực tiếp thay vì wrapper riêng mỗi file (DUP-02)
  - `classifyProviderError` và `noApiKeyResponse` dùng từ `errorUtils` (DUP-01)
- Config tách khỏi code (R-MNT-02): tất cả timeout, model names, base URLs nằm trong `ipcConstants.ts`.
- `VISION_DISCOVERY_TIMEOUT_MS`, `MAX_CHAT_OUTPUT_TOKENS` — thay đổi 1 chỗ áp dụng toàn app.
- Comment `NOTE: Must stay in sync with...` rõ ràng cho các giá trị duplicate-by-design (R-DOC-04).

**Cần cải thiện:**
- `translateImageWithGeminiEdit` không dùng `fetchWithTimeout` — khi cần sửa timeout policy, phải sửa 2 nơi.
- Coupling trực tiếp với `window.api.onImageModelSwitched` trong `TranslatePage` (line 77) — không có null guard pattern nhất quán (có `if (!window.api?.onImageModelSwitched) return` thì tốt).

---

### 🟢 5. Testing — 78/100

**Bằng chứng tốt:**
- `imageTranslate.test.ts`: 358 lines, cover đầy đủ:
  - `langName`: known codes, `auto`, unknown → fallback
  - `buildImageTranslatePrompt`: source/target inclusion, JSON schema, different langs
  - IPC validation: empty image, missing image, no API key, unknown provider
  - Error categorization: 401→INVALID_KEY, 429→RATE_LIMIT
  - `scoreModelForVision`: flash > pro, lite penalty, claude haiku > sonnet > opus, openai zero for no-vision
  - `isVisionUnsupportedError` và `isModelNotFoundError`: cả true/false cases, case-insensitive
- `imageUtils.test.ts`: cover đủ edge cases cho `extractImageFromClipboard` (null, empty, multiple items, non-image).
- Test names mô tả rõ scenario (R-TST-02):
  ```ts
  it('gives zero score to gpt-3.5-turbo (no vision support)', ...)
  it('returns false for 404 without model context', ...)
  ```
- Mock cleanup: `beforeEach(() => { vi.clearAllMocks() })` — đúng chuẩn (R-TST-04).

**Thiếu:**
- `resizeImageFile` không được test (ghi nhận trong comment — hợp lý do Canvas API limitation).
- TranslatePage integration test: không có test cho `translateGenerationRef` cancellation pattern.
- Test cho `fetchVisionModels` và `translateImageWithGeminiEdit` — các hàm quan trọng nhất về business logic.
- Test case `it('returns error for unknown provider')` (line 175) sẽ FAIL vì code trả `NO_VISION` không phải "Unknown provider" (xem Correctness #4).

---

### 🟡 6. Performance — 72/100

**Bằng chứng tốt:**
- `fetchVisionModels` timeout 5s (`VISION_DISCOVERY_TIMEOUT_MS`) — ngăn hang.
- `triedModels` Set → O(1) lookup thay vì O(n) array check.
- Fallback candidates được fetch **lazily** (chỉ khi có failure), không upfront — tránh N API calls khi happy path.
- `lastAssistantIdx` trong ChatPage tính 1 lần bằng `reduce` — tránh O(n²) per-render (R-PRF-01).
- Vision fallback: thử same-provider models trước cross-provider → minimize latency.

**Vấn đề (R-PRF-02):**
- `scoreModelForVision` được gọi **2 lần cho mỗi cặp** trong sort (line 134–135):
  ```ts
  .sort((a, b) => scoreModelForVision(provider, b) - scoreModelForVision(provider, a))
  ```
  Với n models, cost = O(n log n × 2) thay vì O(n + n log n). Nên precompute scores:
  ```ts
  const scored = ids.map(id => ({ id, score: scoreModelForVision(provider, id) }))
  return scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.id)
  ```
- Cross-provider fallback: `fetchVisionModels` cho mỗi other provider được gọi tuần tự trong loop (line 521–526) — có thể `Promise.all` song song.

---

### 🟢 7. Security — 85/100

**Bằng chứng tốt:**
- Không hardcode API key/secret ở bất kỳ đâu trong diff (R-SEC-01).
- `getStoredApiKey` lấy key từ keychain (main process), không bao giờ expose sang renderer.
- preload.ts: raw IPC keys không đi qua `contextBridge` — comment rõ `Raw API keys NEVER leave the main process`.
- `imageBase64` input được validate (empty check) trước khi xử lý.

**Nhỏ:**
- `translateImageWithGeminiEdit` không sanitize `imageMimeType` trước khi đưa vào JSON request body. Nếu renderer gửi MIME type độc hại, có thể inject vào request. Nên whitelist: `['image/jpeg', 'image/png', 'image/webp', 'image/gif']`.

---

### 🟢 8. Documentation — 80/100

**Bằng chứng tốt:**
- `ipcConstants.ts`: mỗi constant có JSDoc giải thích context, lý do tồn tại, và sync requirement.
- `imageUtils.ts`: JSDoc đầy đủ với `@param`, description của cả 2 compression strategies.
- Comment `// DUP-02`, `// HC-06` tracking refactor decisions — rất hữu ích cho review.
- `NOTE: Must stay in sync with...` cho `MAX_CHAT_REQUEST_CHARS` và `DETECT_LANG_MAX_CHARS`.
- Test file có comment header rõ ràng về scope của tests.
- `buildPrompt` prompt rõ ràng với step-by-step instructions cho AI.

**Thiếu (R-DOC-04, R-DOC-05):**
- `registerImageTranslateHandlers` thiếu JSDoc mô tả side effects (emit `image:model-switched` event).
- `scoreModelForVision` không có comment giải thích tại sao các score values cụ thể được chọn (CHEAP=100, MID=70...).
- Comment `// Fall through to OCR+regions approach below` (line 453) — tốt, nhưng không giải thích tại sao Gemini edit được ưu tiên.

---

## Step 4 — Tổng hợp kết quả

| Tiêu chí | Trọng số | Điểm raw | Điểm có trọng số |
|----------|----------|----------|-----------------|
| **Correctness** | 25% | **45** | 11.25 |
| **Architecture** | 15% | **82** | 12.30 |
| **Code Quality** | 15% | **72** | 10.80 |
| **Maintainability** | 15% | **80** | 12.00 |
| **Testing** | 10% | **78** | 7.80 |
| **Performance** | 10% | **72** | 7.20 |
| **Security** | 5% | **85** | 4.25 |
| **Documentation** | 5% | **80** | 4.00 |
| **TỔNG** | 100% | — | **69.6 / 100** |

---

## Điểm mạnh 🟢

1. **Kiến trúc provider registry** — loại bỏ switch/case, dễ thêm provider mới.
2. **Centralized constants** — `ipcConstants.ts` giải quyết sạch toàn bộ magic numbers/strings.
3. **DRY được áp dụng nghiêm túc** — `imageUtils.ts` dùng chung cho ChatPage và TranslatePage.
4. **Vision fallback strategy** — lazy fetch, same-provider first, no hardcoded model IDs.
5. **Test coverage tốt** cho `imageTranslate` và `imageUtils` — đủ cases, tên test mô tả rõ.
6. **`translateGenerationRef` pattern** — xử lý cancellation đúng chuẩn.
7. **Security hygiene** — không có hardcoded secrets, API keys đi qua keychain.

---

## Điểm cần cải thiện 🔴

### P0 — Phải fix trước khi merge

| # | File | Vấn đề | Rule |
|---|------|---------|------|
| 1 | `src/pages/TranslatePage.tsx` L176–226 | **Code bị hỏng**: body của `detectLanguageInBackground` chứa code `handleTranslate`. TypeScript sẽ không compile. | R-COR-01 |
| 2 | `src/pages/TranslatePage.tsx` L176 & L380 | **Duplicate `const detectLanguageInBackground`** — compile error trong strict TypeScript. | R-COR-04 |
| 3 | `electron/ipc/__tests__/imageTranslate.test.ts` L175–184 | Test `'returns error for unknown provider'` expect `'Unknown provider'` nhưng code trả `NO_VISION` — **test sẽ FAIL**. | R-TST-01 |

### P1 — Nên fix sớm

| # | File | Vấn đề | Rule |
|---|------|---------|------|
| 4 | `electron/ipc/imageTranslate.ts` L257 | `translateImageWithGeminiEdit` dùng raw `fetch` không có timeout — có thể hang vô tận. Dùng `fetchWithTimeout` đã có sẵn. | R-REL-03 |
| 5 | `electron/ipc/imageTranslate.ts` L429 | `ipcMain.handle` callback ~125 lines — vi phạm SRP. Tách thành `attemptGeminiEdit()` và `runVisionFallbackLoop()`. | R-QUA-02 |
| 6 | `electron/ipc/imageTranslate.ts` L134-135 | `scoreModelForVision` gọi 2 lần/cặp trong sort — precompute scores trước. | R-PRF-02 |

### P2 — Cải thiện chất lượng

| # | File | Vấn đề | Rule |
|---|------|---------|------|
| 7 | `src/pages/TranslatePage.tsx` | File 915 lines — quá ngưỡng 300 lines. Tách image translation logic ra `useImageTranslate` hook. | R-STR-02 |
| 8 | `src/pages/ChatPage.tsx` | File 703 lines — cần tách `MessageBubble` ra file riêng. | R-STR-02 |
| 9 | `electron/ipc/imageTranslate.ts` | `imageMimeType` không được whitelist validate trước khi dùng. | R-SEC-02 |
| 10 | `electron/ipc/imageTranslate.ts` | Cross-provider fallback fetch (`fetchVisionModels` calls) nên chạy `Promise.all` thay vì tuần tự. | R-PRF-02 |

---

## Khuyến nghị

1. **Ngay lập tức:** Sửa `TranslatePage.tsx` — đây là breaking bug. Tách `handleTranslate` ra khỏi phần code bị nhiễm và xóa duplicate `detectLanguageInBackground`.

2. **Trước khi ship:** Thêm timeout vào `translateImageWithGeminiEdit` với `fetchWithTimeout` đã có sẵn.

3. **Refactor tiếp theo:**
   - Tách `registerImageTranslateHandlers` thành 2–3 hàm nhỏ hơn.
   - Extract `useImageTranslate` custom hook từ `TranslatePage`.
   - Thêm test cho `translateImageWithGeminiEdit` (mock fetch).

4. **Điều chỉnh test:** Fix test "unknown provider" để match với behavior thực tế của code, hoặc thêm explicit check trong code cho unknown provider.

---

*Báo cáo sinh bởi workflow score-code v1.0.0 · lotus-agent*
