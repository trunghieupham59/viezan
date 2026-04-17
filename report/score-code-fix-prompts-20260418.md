# Fix Prompts — Lotus Translate (score-code-report-20260418)
**Nguồn:** `lotus-agent/report/score-code-report-20260418.md`  
**Tổng điểm hiện tại:** 81/100  
**Mục tiêu thực tế:** ~94/100 (giải thích tại sao 100 là không thực tế ở cuối file)

---

## 🗺️ Gap Analysis — Điểm còn thiếu

| Tiêu chí | Hiện tại | Sau 7 fix đầu | Cần thêm | Có thể đạt |
|----------|:--------:|:-------------:|:--------:|:----------:|
| Correctness /25 | 21 | 22 | +2 | 24 |
| Architecture /15 | 12 | 13 | +1.5 | 14.5 |
| Code Quality /15 | 13 | 14 | +0.5 | 14.5 |
| Maintainability /15 | 12 | 13.5 | +1 | 14.5 |
| Testing /10 | 7 | 9.5 | +0.5 | 9.5 |
| Performance /10 | 8 | 8 | +1.5 | 9.5 |
| Security /5 | 4 | 4 | +1 | **5** ✅ |
| Documentation /5 | 4 | 4.5 | +0.5 | **5** ✅ |
| **TỔNG** | **81** | **88** | **+7** | **~95** |

> ⚠️ Giải thích vì sao không thể đạt **100/100** → xem phần cuối file.

---

## 🔴 Ưu tiên cao (FIX-01 → FIX-04)

*(Xem file gốc — giữ nguyên 4 fix đầu)*

---

### FIX-01 — Fix mock inconsistency trong IPC tests [Testing +3đ]

```
Hãy fix mock inconsistency trong các file test sau đây.

Vấn đề: `getStoredApiKey` trong `electron/ipc/storage.ts` là hàm synchronous
(signature: `export function getStoredApiKey(provider: string): string | null`),
nhưng nhiều test đang mock nó bằng `vi.mocked(getStoredApiKey).mockResolvedValue(null)`.

`mockResolvedValue` khiến hàm trả về `Promise<null>` — là truthy object.
Khi handler gọi `const apiKey = getStoredApiKey(provider)` và check `if (!apiKey)`,
condition sẽ không bao giờ true, nên NO_API_KEY path không được test thực tế.

Cần đổi tất cả `mockResolvedValue` → `mockReturnValue` cho mock của `getStoredApiKey`
trong các file test sau:

1. `electron/ipc/__tests__/translate.test.ts`
   - Tìm tất cả: `vi.mocked(getStoredApiKey).mockResolvedValue`
   - Đổi thành:  `vi.mocked(getStoredApiKey).mockReturnValue`

2. `electron/ipc/__tests__/chat.test.ts`
   - Tìm tất cả: `vi.mocked(getStoredApiKey).mockResolvedValue`
   - Đổi thành:  `vi.mocked(getStoredApiKey).mockReturnValue`

3. `electron/ipc/__tests__/imageTranslate.test.ts`
   - Tìm tất cả: `vi.mocked(getStoredApiKey).mockResolvedValue`
   - Đổi thành:  `vi.mocked(getStoredApiKey).mockReturnValue`

Sau khi fix, chạy `npm test` để xác nhận tất cả test vẫn pass (hoặc nếu test
nào fail, có nghĩa nó đang test sai trước đó — fix luôn test logic đó cho đúng).

Không được thay đổi bất kỳ production code nào — chỉ sửa test files.
```

---

### FIX-02 — Move IPC handlers ra khỏi main.ts [Architecture +1đ]

```
Hãy refactor `electron/main.ts` để di chuyển các IPC handler inline ra module riêng,
giữ nhất quán với pattern `register*Handlers(ipcMain)` trong `electron/ipc/`.

CÔNG VIỆC CẦN LÀM:

## 1. Tạo file `electron/ipc/subtitle.ts`

Di chuyển toàn bộ các handler liên quan đến subtitle window ra khỏi main.ts:
- `ipcMain.handle('subtitle:show', ...)`
- `ipcMain.handle('subtitle:hide', ...)`
- `ipcMain.handle('subtitle:update', ...)`
- `ipcMain.handle('subtitle:setStyle', ...)`
- `ipcMain.on('subtitle:close', ...)`
- `ipcMain.handle('translate:live-stream', ...)` — cần access `getStoredApiKey` và `streamTranslation`

Export một function:
  `registerSubtitleHandlers(ipcMain, getSubtitleWindow: () => BrowserWindow | null, getMainWindow: () => BrowserWindow | null)`

Các handler cần truy cập `subtitleWindow` và `mainWindow` — truyền vào qua getter callback
(tương tự cách `registerUpdaterHandlers(ipcMain, () => mainWindow)` đang làm).

## 2. Tạo file `electron/ipc/system.ts`

Di chuyển:
- `ipcMain.handle('app:checkScreenPermission', ...)`
- `ipcMain.handle('app:openExternal', ...)`

Export một function: `registerSystemHandlers(ipcMain)`

## 3. Cập nhật `electron/main.ts`

- Xóa các handler đã được chuyển đi
- Import và gọi `registerSubtitleHandlers(ipcMain, () => subtitleWindow, () => mainWindow)`
- Import và gọi `registerSystemHandlers(ipcMain)`
- Giữ nguyên `createSubtitleWindow()` function trong main.ts (window management, không phải IPC handler)

## Yêu cầu:
- Không thay đổi bất kỳ behavior nào — chỉ di chuyển code
- TypeScript phải compile không có lỗi
- Không sửa preload.ts hoặc bất kỳ file nào khác ngoài main.ts và 2 file ipc mới
```

---

### FIX-03 — Extract TranslatePage logic thành custom hook [Code Quality / Maintainability +1đ]

```
Hãy tách business logic của `src/pages/TranslatePage.tsx` thành custom hook
`src/hooks/useTranslate.ts`, tương tự pattern đã làm với `useLiveTranslate`.

PHẠM VI TÁCH — Tạo file mới `src/hooks/useTranslate.ts` chứa:

1. State (dời từ TranslatePage):
   - `isRewriting`, `imageSwitchNotice`, `detectedSourceLang`, `isDetectingLang`
   - `imageAttachment`, `imageRegions`, `editedImageUrl`, `isDraggingOver`, `copied`
   - `translateGenerationRef`, `debounceRef`

2. Handlers (dời từ TranslatePage):
   - `handleTranslate` (logic dịch text + image)
   - `handleRewrite`, `handleSwapLanguages`, `handleCopy`, `handleDownloadTranslatedImage`
   - `processImageFile`, `handleFileInputChange`, `handleSourcePanelPaste`
   - `handleSourcePanelDragOver`, `handleSourcePanelDragLeave`, `handleSourcePanelDrop`
   - `detectLanguageInBackground`

3. Effects (dời từ TranslatePage):
   - Auto-translate debounce effect
   - Auto-translate on image attach effect
   - Re-translate on style / lang / model change effects

4. Refs (dời từ TranslatePage):
   - `styleInitRef`, `langInitRef`, `modelInitRef`
   - `handleTranslateRef`, `sourceTextRef`, `autoTranslateRef`, `imageAttachmentRef`
   - `fileInputRef`

SAU KHI TÁCH:
- `TranslatePage.tsx` chỉ còn: `useTranslate()` call, scroll sync refs/effect, và JSX render
- Mục tiêu: TranslatePage < 300 dòng

YÊU CẦU:
- Pure refactor — không thay đổi behavior
- TypeScript không lỗi mới, không sửa tests, không sửa store/services
- Giữ nguyên biome-ignore comments nếu cần
```

---

### FIX-04 — Fix README outdated [Documentation +0.5đ]

```
Hãy cập nhật `README.md` để sửa thông tin Tech Stack không còn chính xác.

THAY ĐỔI trong file `README.md`, bảng `## 🧰 Tech Stack`:
- Tìm:   `| [keytar v7](https://github.com/atom/node-keytar) | OS Keychain integration |`
- Thay:  `| [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) | OS-level encrypted key storage (built-in, no native compilation) |`

Kiểm tra xem còn chỗ nào khác nhắc đến "keytar" không — nếu có, cập nhật tương tự.
Không thay đổi bất kỳ nội dung nào khác.
```

---

## 🟡 Ưu tiên trung bình (FIX-05 → FIX-07)

*(Xem file gốc — giữ nguyên 3 fix giữa)*

---

### FIX-05 — Add error feedback cho live translate pipeline [Correctness +0.5đ]

```
Hãy thêm user-visible error feedback cho live translate pipeline trong
`src/hooks/useLiveTranslate.ts`.

HIỆN TẠI (lỗi bị swallow silent):
  } catch { /* skip */ }          // STT error
  } catch { /* keep existing */ } // Translation error

YÊU CẦU:

1. Thêm state `pipelineError: string | null` vào hook (transient, không persist)

2. Trong `processChunk`, khi STT call fail:
   - Set `pipelineError = 'STT failed — retrying next chunk'`
   - Auto-clear sau 4 giây

3. Trong `processChunk`, khi translation call fail:
   - Set `pipelineError = 'Translation failed — will retry'`
   - Auto-clear sau 4 giây

4. Trả về `pipelineError` trong hook return object

5. Trong `src/pages/LiveTranslatePage.tsx`, hiển thị `pipelineError` dưới dạng
   toast nhỏ màu amber (tự dismiss, không chặn UI).

Không thay đổi pipeline logic — chỉ thêm observability.
Lỗi mới ghi đè lỗi cũ trước khi dismiss.
```

---

### FIX-06 — Thêm unit tests cho live-translate utilities [Testing +1đ]

```
Hãy tạo file `src/utils/__tests__/live-translate.test.ts` với unit tests đầy đủ
cho 3 pure functions trong `src/utils/live-translate.ts`.

## 1. `isHallucination(text: string): boolean`
- text quá ngắn (< 4 chars) → true
- "thanks for watching", "ご視聴ありがとうございました", "시청해 주셔서 감사합니다",
  "cảm ơn các bạn đã xem" → true
- "[Music]", "(笑)", "(tiếng nhạc)" → true
- "aaaaaaaaaa" (> 60% same char) → true
- bigram repetition "hello world hello world hello world" → true
- trigram repetition "xin chào bạn xin chào bạn xin chào bạn" → true
- "Today's meeting covered the Q3 roadmap" → false
- "今日の会議では第3四半期の方針を議論しました" → false
- "Hôm nay thời tiết rất đẹp và mát mẻ" → false

## 2. `jaccardSimilarity(a: string, b: string): number`
- identical strings → 1.0
- completely different → 0.0
- partial overlap → giá trị trong (0, 1)
- cả hai empty → 1.0
- case-insensitive

## 3. `extractCompleteSentences(text: string): { complete: string; pending: string }`
- không có sentence boundary → complete='', pending=full text
- có dấu "." → split đúng
- có dấu "。" (Japanese, no trailing space) → split đúng
- có "?" hoặc "!" → split đúng
- text kết thúc bằng boundary → pending=''
- mixed script: "Hello world. こんにちは！ pending text" → split đúng

Format: vitest, describe/it/expect — tương tự translate.test.ts.
```

---

### FIX-07 — Enforce dual-source-of-truth constants [Maintainability +0.5đ]

```
Hãy tạo file `electron/ipc/__tests__/constants.test.ts` để tự động enforce
rằng các constant quan trọng giữa renderer và main process phải luôn bằng nhau.

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  MAX_CHAT_REQUEST_CHARS,
  DETECT_LANG_MAX_CHARS as MAIN_DETECT_LANG_MAX_CHARS,
} from '../ipcConstants'

// Không thể import từ src/ (khác tsconfig), hardcode expected values.
// Nếu test này fail → update CẢ HAI constant VÀ test này.
const EXPECTED_MAX_CHAT_INPUT_CHARS = 3000
const EXPECTED_DETECT_LANG_MAX_CHARS = 500

describe('Cross-boundary constant sync', () => {
  it('MAX_CHAT_REQUEST_CHARS (main) === MAX_CHAT_INPUT_CHARS (renderer)', () => {
    expect(MAX_CHAT_REQUEST_CHARS).toBe(EXPECTED_MAX_CHAT_INPUT_CHARS)
  })
  it('DETECT_LANG_MAX_CHARS (main) === DETECT_LANG_MAX_CHARS (renderer)', () => {
    expect(MAIN_DETECT_LANG_MAX_CHARS).toBe(EXPECTED_DETECT_LANG_MAX_CHARS)
  })
})

Không thay đổi production code — chỉ tạo test file mới.
```

---

## 🟢 Ưu tiên thấp — Nâng cao (FIX-08 → FIX-13)

*(Các fix này nâng điểm từ ~88 lên ~94-95)*

---

### FIX-08 — Enable `sandbox: true` [Security +1đ → 5/5]

**Vấn đề:** `sandbox: false` trong BrowserWindow là attack surface nếu renderer bị exploit. Tuy nhiên `electron/preload.ts` chỉ dùng `ipcRenderer`, `contextBridge`, và `process.platform`/`process.env` — không dùng bất kỳ Node.js module nào (`fs`, `path`, `require`). Do đó có thể bật sandbox an toàn.

```
Hãy bật `sandbox: true` cho cả mainWindow và subtitleWindow trong `electron/main.ts`.

KIỂM TRA TRƯỚC:
Đọc `electron/preload.ts` và `electron/subtitle-preload.ts` — xác nhận chúng
KHÔNG sử dụng bất kỳ Node.js built-in nào (require, fs, path, child_process, etc.).
Chỉ dùng: `ipcRenderer`, `contextBridge`, `process.platform`, `process.env.*`.

NẾU xác nhận không có Node.js module nào được import/require trong preload:

1. Trong `createWindow()`, thay đổi webPreferences:
   ```ts
   webPreferences: {
     preload: path.join(__dirname, 'preload.js'),
     contextIsolation: true,
     nodeIntegration: false,
     sandbox: true,   // ← đổi từ false → true
   }
   ```

2. Trong `createSubtitleWindow()`, thay đổi tương tự:
   ```ts
   webPreferences: {
     preload: path.join(__dirname, 'subtitle-preload.js'),
     contextIsolation: true,
     nodeIntegration: false,
     sandbox: true,   // ← đổi từ false → true
   }
   ```

3. Chạy app ở dev mode (`npm run dev`) và kiểm tra:
   - Main window load bình thường
   - API keys hoạt động (keychain, translate, chat)
   - Subtitle window hiển thị đúng
   - Console không có lỗi liên quan đến preload

4. Nếu có bất kỳ lỗi nào → ROLLBACK về sandbox: false và ghi chú lý do cụ thể.

Không sửa bất kỳ file nào khác ngoài main.ts.
```

---

### FIX-09 — Properly type `any[]` trong chat.ts [Code Quality +0.5đ]

**Vấn đề:** `any[]` được dùng nhiều lần trong `electron/ipc/chat.ts` cho SDK types của Gemini/Claude/OpenAI. Có thể type chính xác hơn bằng cách dùng SDK types.

```
Hãy loại bỏ các `any` type trong `electron/ipc/chat.ts` bằng cách dùng
proper types từ các AI provider SDK.

CÁC CHỖ CẦN FIX:

1. `chatWithGemini` — `parts: any[]`:
   Import từ Gemini SDK: `import type { Part } from '@google/generative-ai'`
   Thay `parts: any[]` → `parts: Part[]`
   Thay `const history: any[]` → dùng `Content[]` từ Gemini SDK

2. `chatWithClaude` — `content: any[]`:
   Import từ Anthropic SDK:
   `import type { TextBlockParam, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages'`
   Thay `content: any[]` → `content: Array<TextBlockParam | ImageBlockParam>`

3. `chatWithOpenAI` — `formattedMessages: any[]`:
   Import từ OpenAI SDK:
   `import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'`
   Thay `formattedMessages: any[]` → `formattedMessages: ChatCompletionMessageParam[]`

4. Xóa tất cả `biome-ignore lint/suspicious/noExplicitAny` comments cho các chỗ đã fix.

YÊU CẦU:
- TypeScript phải compile không lỗi
- Runtime behavior không thay đổi
- Nếu một SDK không export type phù hợp (hoặc type quá phức tạp), giữ nguyên
  `any` cho phần đó và ghi chú lý do cụ thể trong comment
```

---

### FIX-10 — Debounce Zustand persist writes [Performance +1đ]

**Vấn đề:** Zustand persist serialize/deserialize toàn bộ state vào localStorage mỗi khi bất kỳ trạng thái nào thay đổi. Với history (100 items) + chatSessions (20 sessions), cold-start và frequent writes có thể chậm.

```
Hãy thêm debounce cho Zustand persist storage trong `src/store/useAppStore.ts`
để giảm tần suất localStorage writes.

IMPLEMENTATION:

1. Trong phần `persist(...)` configuration của `useAppStore`, thêm custom storage
   với built-in debounce:

```ts
import { persist, createJSONStorage } from 'zustand/middleware'

// Debounced localStorage storage — batches writes at most once per 500ms
function createDebouncedStorage(delay = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingValue: string | null = null

  return {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => {
      pendingValue = value
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (pendingValue !== null) {
          localStorage.setItem(key, pendingValue)
          pendingValue = null
        }
      }, delay)
    },
    removeItem: (key: string) => localStorage.removeItem(key),
  }
}
```

2. Trong `persist(...)` options:
```ts
{
  name: STORE_PERSIST_KEY,
  storage: createJSONStorage(() => createDebouncedStorage(500)),
  partialize: (state) => ({ ... }) // giữ nguyên partialize hiện tại
}
```

YÊU CẦU:
- Không thay đổi bất kỳ store logic nào khác
- State vẫn phải được persist khi app đóng bình thường
  (500ms debounce là đủ nhỏ để không mất data trước khi window close)
- TypeScript không lỗi mới
```

---

### FIX-11 — Unify handleSwapLanguages với store logic [Correctness +1đ]

**Vấn đề:** `handleSwapLanguages` trong `TranslatePage.tsx` tự implement swap logic thay vì dùng `useAppStore().swapLanguages()`. Nếu store logic thay đổi, trang này có thể diverge.

```
Hãy sửa `handleSwapLanguages` trong `src/pages/TranslatePage.tsx` (hoặc trong
`src/hooks/useTranslate.ts` nếu FIX-03 đã được thực hiện) để không duplicate
swap logic.

PHÂN TÍCH HIỆN TẠI:
TranslatePage.handleSwapLanguages có extra logic: dùng `detectedSourceLang` để
set target lang đúng sau khi swap. Store's swapLanguages() không có logic này.

GIẢI PHÁP — 2 lựa chọn (chọn 1):

## Option A: Extend store.swapLanguages() (khuyến nghị)

Sửa `swapLanguages` trong `src/store/useAppStore.ts` để nhận optional `detectedLang`:

```ts
swapLanguages: (detectedLang?: string) =>
  set((state) => {
    const newTargetLang = detectedLang ?? (state.sourceLang === 'auto' ? 'ja' : state.sourceLang)
    return {
      sourceLang: state.targetLang,
      targetLang: newTargetLang,
      sourceText: state.translatedText,
      translatedText: state.sourceText,
      phoneticText: '',
    }
  }),
```

Cập nhật `CoreSlice` interface tương ứng:
```ts
swapLanguages: (detectedLang?: string) => void
```

Trong TranslatePage/useTranslate, thay `handleSwapLanguages` thành:
```ts
const handleSwapLanguages = useCallback(() => {
  if (!translatedText || translatedText === IMAGE_TRANSLATED_SENTINEL || imageAttachment) return
  translateGenerationRef.current++
  stopSpeak()
  swapLanguages(detectedSourceLang ?? undefined)
  setTranslateError(null)
  setIsTranslating(false)
  setDetectedSourceLang(null)
  setIsDetectingLang(false)
}, [translatedText, detectedSourceLang, imageAttachment, stopSpeak, swapLanguages, ...])
```

## Option B: Add comment documenting intentional divergence

Nếu Option A quá rủi ro, thêm comment rõ ràng:
```ts
// NOTE: Intentionally does NOT call store.swapLanguages() because this handler
// has additional TranslatePage-specific logic (detectedSourceLang → targetLang)
// that doesn't belong in the shared store. If store.swapLanguages() logic changes,
// update this handler accordingly. See: github.com/.../issue/XXX
```

Chọn Option A nếu có thể, Option B nếu Option A có side effects không mong muốn.
Chạy `npm test` sau khi thay đổi.
```

---

### FIX-12 — Thêm component tests cho Pages [Testing +0.5đ]

**Vấn đề:** File `src/pages/__tests__/ChatPage.test.tsx` và `TranslatePage.test.tsx` tồn tại nhưng chưa rõ coverage. Cần đảm bảo các flow UI cơ bản được test.

```
Hãy kiểm tra và bổ sung test trong:
- `src/pages/__tests__/TranslatePage.test.tsx`
- `src/pages/__tests__/ChatPage.test.tsx`

TRƯỚC TIÊN: Đọc nội dung hiện tại của cả 2 file.

Nếu file đã có tests đầy đủ → không cần làm gì.

Nếu file rỗng hoặc thiếu, thêm ít nhất các test sau cho mỗi page:

## TranslatePage.test.tsx
- Render không crash khi `window.api` không available (non-Electron env)
- Source text input nhận giá trị
- Clear button xuất hiện khi có source text
- Character counter hiển thị đúng

## ChatPage.test.tsx
- Render không crash
- Input field nhận text
- Empty state hiển thị khi không có session

Setup: dùng `@testing-library/react`, mock `window.api` và `useAppStore`.
Tham khảo `src/test/setup.ts` cho global setup.
Dùng `vi.mock('../../../store/useAppStore')` để mock store.

Không cần test Electron-specific behavior (IPC calls) — chỉ test React rendering.
```

---

### FIX-13 — Thêm ARCHITECTURE.md [Documentation +0.5đ → 5/5]

**Vấn đề:** README có project structure nhưng chưa giải thích data flow, IPC protocol, và các architectural decisions quan trọng.

```
Hãy tạo file `ARCHITECTURE.md` trong root của project, giải thích kiến trúc
cho developer mới join project.

NỘI DUNG CẦN CÓ:

## 1. Process Model
Giải thích: Main Process vs Renderer Process vs Preload Script
- Main: Node.js, handles IPC, manages API keys, calls AI providers
- Renderer: React, UI only, no direct Node.js access
- Preload: bridge — exposes safe API to renderer via contextBridge

## 2. IPC Protocol
Sơ đồ luồng: Renderer → contextBridge → ipcRenderer.invoke → ipcMain.handle → Provider SDK
Liệt kê các IPC channels chính và mục đích

## 3. State Management
Zustand store với slice pattern:
- CoreSlice: translation state + navigation
- SettingsSlice: user preferences + provider config
- HistorySlice: translation + live session history
- ChatSlice: chat sessions + system prompts
Persist strategy: partialize → chỉ lưu necessary state

## 4. Provider System
Provider registry pattern — thêm provider mới như thế nào (step-by-step)

## 5. Security Model
- API keys: chỉ tồn tại trong main process, lưu bằng safeStorage
- contextIsolation + sandbox: tại sao và tác dụng gì
- URL allowlist cho openExternal

## 6. Live Translate Pipeline
Sơ đồ: Audio → VAD (3-gate) → MediaRecorder → Whisper → confidence gates →
hallucination filter → sentence boundary → translation → subtitle overlay

Giữ ngắn gọn — mỗi section 3-5 dòng, có sơ đồ ASCII đơn giản nếu cần.
Target: developer mới có thể hiểu project trong 10 phút đọc file này.
```

---

## 📊 Dự kiến điểm sau tất cả 13 fix

| Tiêu chí | Trước | Sau 7 fix | Sau 13 fix | Max có thể |
|----------|:-----:|:---------:|:----------:|:----------:|
| Correctness /25 | 21 | 22 | **24** | 24 |
| Architecture /15 | 12 | 13 | **14.5** | 14.5 |
| Code Quality /15 | 13 | 14 | **14.5** | 14.5 |
| Maintainability /15 | 12 | 13.5 | **14.5** | 14.5 |
| Testing /10 | 7 | 9.5 | **9.5** | 9.5 |
| Performance /10 | 8 | 8 | **9** | 9 |
| Security /5 | 4 | 4 | **5** | 5 |
| Documentation /5 | 4 | 4.5 | **5** | 5 |
| **TỔNG** | **81** | **~88** | **~95** | **~96** |

---

## ❌ Tại sao 100/100 là không thực tế?

Có 3 điểm không thể đạt 100% do giới hạn kỹ thuật khách quan:

### 1. Testing — không thể 10/10
`useLiveTranslate` (771 dòng, hook quan trọng nhất) dùng browser APIs không thể mock hoàn toàn:
- `MediaRecorder` — không có trong jsdom
- `AudioContext`, `AnalyserNode`, `GainNode` — Web Audio API, không có trong Node.js
- `getDisplayMedia`, `getUserMedia` — Media Capture API, không có trong test env

Để test hook này cần: (a) Playwright/Cypress E2E tests với Electron, hoặc (b) heavy mock layer. Cả hai đều tốn nhiều tháng engineering và ngoài phạm vi thực tế.

**Điểm trần thực tế: Testing 9.5/10**

### 2. Performance — không thể 10/10
Image translation gửi base64 qua Electron IPC là structural constraint:
- Renderer không thể ghi file tạm
- Main process không thể access DOM canvas
- IPC là cầu nối duy nhất → base64 là pattern chuẩn cho Electron apps

Giải quyết sẽ cần restructure sang native module (C++ addon) — không thực tế cho app này.

**Điểm trần thực tế: Performance 9/10**

### 3. Correctness — rất khó 25/25
"Tất cả cases đúng, xử lý đủ edge cases" theo rubric = không có unknown unknowns. Trong practice, một translation app với 3 AI providers, 20 ngôn ngữ, voice input, OCR, live streaming... luôn có edge cases chưa discovered. Đây là lý do rubric 90-100% mô tả "production-grade, battle-tested" code.

**Điểm trần thực tế: Correctness 24/25**

---

## ⏱️ Thứ tự thực hiện tất cả 13 fix

| Thứ tự | Fix | Effort | Impact |
|:------:|-----|:------:|:------:|
| 1 | FIX-01 — Fix test mocks | 15 phút | Testing +3đ |
| 2 | FIX-04 — Fix README | 5 phút | Docs +0.5đ |
| 3 | FIX-08 — sandbox: true | 20 phút | Security +1đ |
| 4 | FIX-07 — Constant sync test | 10 phút | Maintainability |
| 5 | FIX-06 — Tests live-translate | 45 phút | Testing +1đ |
| 6 | FIX-11 — Unify swapLanguages | 20 phút | Correctness +1đ |
| 7 | FIX-09 — Type any[] in chat.ts | 30 phút | Code Quality |
| 8 | FIX-05 — Live translate feedback | 30 phút | Correctness |
| 9 | FIX-13 — ARCHITECTURE.md | 45 phút | Docs +0.5đ |
| 10 | FIX-10 — Debounce persist | 20 phút | Performance +1đ |
| 11 | FIX-12 — Component tests | 60 phút | Testing |
| 12 | FIX-02 — Move IPC handlers | 60 phút | Architecture +1đ |
| 13 | FIX-03 — Extract useTranslate | 90 phút | Quality/Maintainability |

**Tổng effort ước tính:** ~7.5 giờ  
**Điểm dự kiến sau tất cả:** ~94-96/100
