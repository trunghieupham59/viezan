# Báo Cáo: Duplicate Code & Hardcode Analysis
**Ngày:** 2026-04-15 17:10  
**Workflow:** check-dup-hardcode v1.0.0  
**Phạm vi:** Toàn bộ codebase (`src/`, `electron/`)  
**Files kiểm tra:** 30+ files

---

## Tổng quan

| Loại vấn đề | Critical | High | Medium | Low | Tổng |
|---|---|---|---|---|---|
| Exact Duplicate | 0 | 1 | 0 | 0 | 1 |
| Near Duplicate | 0 | 2 | 1 | 0 | 3 |
| Structural Duplicate | 0 | 0 | 3 | 0 | 3 |
| Semantic Duplicate | 0 | 0 | 0 | 1 | 1 |
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Magic Number | 0 | 2 | 2 | 0 | 4 |
| Magic String | 0 | 1 | 2 | 0 | 3 |
| Hardcode Config | 0 | 0 | 3 | 0 | 3 |
| Hardcode UI | 0 | 0 | 0 | 2 | 2 |
| **Tổng** | **0** | **6** | **11** | **3** | **20** |

---

## 1. Duplicate Code

---

### DUP-01 🟠 High — Near Duplicate: Error handling pattern lặp lại

**Loại:** Near Duplicate (Clone Type 2)  
**Files liên quan:**
- `electron/ipc/translate.ts` (lines 543–555, 615–626, 675–685)
- `electron/ipc/chat.ts` (lines 377–386)
- `electron/ipc/imageTranslate.ts` (lines 326–335)

**Mô tả:** Cùng một pattern phân loại lỗi từ provider AI (401/invalid_api_key → INVALID_KEY, 429/rate_limit → RATE_LIMIT, ENOTFOUND/network → NETWORK) được viết lại hoàn toàn giống nhau ở 5 vị trí khác nhau.

**Code vi phạm:**

```typescript
// electron/ipc/translate.ts — handler 'translate' (line 615–626)
if (msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('authentication')) {
  return { success: false, error: 'Invalid API key. Please check your key in Settings.', errorCode: 'INVALID_KEY' }
}
if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('quota')) {
  return { success: false, error: 'Rate limit exceeded. Please wait and try again.', errorCode: 'RATE_LIMIT' }
}
if (msg.includes('ENOTFOUND') || msg.includes('network') || msg.includes('fetch')) {
  return { success: false, error: 'No internet connection.', errorCode: 'NETWORK' }
}

// electron/ipc/translate.ts — handler 'translate:rewrite' (line 675–685) — gần như giống hệt
// electron/ipc/chat.ts — handler 'chat:send' (line 377–386) — gần như giống hệt
// electron/ipc/imageTranslate.ts — handler 'image:translate' (line 326–335) — gần như giống hệt
```

**Gợi ý sửa:** Tạo một utility function dùng chung trong `electron/ipc/errorUtils.ts`:

```typescript
// electron/ipc/errorUtils.ts
export type IpcErrorResponse = {
  success: false
  error: string
  errorCode: 'INVALID_KEY' | 'RATE_LIMIT' | 'NETWORK' | string
}

export function classifyProviderError(msg: string): IpcErrorResponse {
  if (msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('authentication')) {
    return { success: false, error: 'Invalid API key. Please check your key in Settings.', errorCode: 'INVALID_KEY' }
  }
  if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('quota')) {
    return { success: false, error: 'Rate limit exceeded. Please wait and try again.', errorCode: 'RATE_LIMIT' }
  }
  if (msg.includes('ENOTFOUND') || msg.includes('network') || msg.includes('fetch')) {
    return { success: false, error: 'No internet connection.', errorCode: 'NETWORK' }
  }
  return { success: false, error: msg, errorCode: 'UNKNOWN' }
}
```

---

### DUP-02 🟠 High — Exact Duplicate: `getApiKey` helper bị define lại

**Loại:** Exact Duplicate (Clone Type 1)  
**Files liên quan:**
- `electron/ipc/translate.ts` (line 26–28)
- `electron/ipc/imageTranslate.ts` (line 39–41)
- `electron/ipc/chat.ts` (line 40–42)
- `electron/ipc/models.ts` (line 10–12)

**Code vi phạm:**

```typescript
// Xuất hiện 4 lần hoàn toàn giống nhau:
async function getApiKey(provider: string): Promise<string | null> {
  return getStoredApiKey(provider)
}
```

**Giải thích:** Function này chỉ là wrapper 1 dòng cho `getStoredApiKey` — được copy vào từng file riêng lẻ thay vì re-export từ `storage.ts`.

**Gợi ý sửa:** Xóa tất cả local `getApiKey` và gọi trực tiếp `getStoredApiKey` (hoặc export từ `storage.ts`):

```typescript
// electron/ipc/storage.ts — thêm re-export alias
export { getStoredApiKey as getApiKey }

// Trong các file khác — xóa local definition, dùng trực tiếp:
const apiKey = await getStoredApiKey(provider)
```

---

### DUP-03 🟠 High — Near Duplicate: `getApiKey` no-key response pattern lặp lại

**Loại:** Near Duplicate (Clone Type 2)  
**Files liên quan:**
- `electron/ipc/translate.ts` (lines 567–572, 638–643)
- `electron/ipc/chat.ts` (lines 347–353)
- `electron/ipc/imageTranslate.ts` (lines 281–287)

**Code vi phạm:**

```typescript
// Lặp lại ở 4 chỗ:
const apiKey = await getApiKey(provider)
if (!apiKey) {
  return {
    success: false,
    error: `No API key found for ${provider}. Please add it in Settings.`,
    errorCode: 'NO_API_KEY',
  }
}
```

**Gợi ý sửa:** Tạo helper trong `errorUtils.ts`:

```typescript
export function noApiKeyResponse(provider: string): IpcErrorResponse {
  return {
    success: false,
    error: `No API key found for ${provider}. Please add it in Settings.`,
    errorCode: 'NO_API_KEY',
  }
}
```

---

### DUP-04 🟡 Medium — Structural Duplicate: `translateWith{Provider}` functions có cùng skeleton

**Loại:** Structural Duplicate (Clone Type 3)  
**Files:** `electron/ipc/translate.ts` (lines 276–351)

**Mô tả:** Ba hàm `translateWithGemini`, `translateWithClaude`, `translateWithOpenAI` có cùng cấu trúc: import SDK → tạo client → gọi API với systemPrompt + prompt → return trimmed text. Phần khác nhau chỉ là SDK call.

**Code vi phạm:**

```typescript
// translateWithGemini — lines 276–294
async function translateWithGemini(apiKey, model, sourceText, ...) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT })
  const result = await genModel.generateContent(buildPrompt(...))
  return result.response.text().trim()
}

// translateWithClaude — lines 296–322 — cùng skeleton
// translateWithOpenAI — lines 324–351 — cùng skeleton
```

Tương tự cho `rewriteWith{Provider}` (lines 355–389).

**Gợi ý sửa:** Dùng abstraction layer hoặc adapter pattern:

```typescript
type TranslateAdapter = (prompt: string) => Promise<string>

function geminiAdapter(apiKey: string, model: string): TranslateAdapter {
  return async (prompt) => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const genModel = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT })
    const result = await genModel.generateContent(prompt)
    return result.response.text().trim()
  }
}

// Sau đó dùng:
const adapter = provider === 'gemini' ? geminiAdapter(apiKey, model) : ...
const result = await adapter(buildPrompt(...))
```

---

### DUP-05 🟡 Medium — Structural Duplicate: Image resize logic bị duplicate

**Loại:** Structural Duplicate (Clone Type 3)  
**Files liên quan:**
- `src/components/ImageTranslator.tsx` (lines 39–72): `processImageFile`
- `src/pages/ChatPage.tsx` (lines 24–54): `resizeImageToBase64`

**Mô tả:** Cả hai hàm đều: tạo canvas, đọc file, scale down nếu quá lớn, convert sang base64. Khác nhau ở: `ImageTranslator` dùng compression loop, `ChatPage` dùng fixed quality.

**Code vi phạm:**

```typescript
// ImageTranslator.tsx — processImageFile
const canvas = document.createElement('canvas')
canvas.width = width; canvas.height = height
const ctx = canvas.getContext('2d')!
ctx.drawImage(img, 0, 0, width, height)
// ...

// ChatPage.tsx — resizeImageToBase64 (gần giống)
const canvas = document.createElement('canvas')
canvas.width = width; canvas.height = height
const ctx = canvas.getContext('2d')!
ctx.drawImage(img, 0, 0, width, height)
const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
```

**Gợi ý sửa:** Tạo `src/utils/imageUtils.ts` với shared helper:

```typescript
// src/utils/imageUtils.ts
export async function processImageForUpload(
  file: File,
  maxDimension: number,
  maxBytes?: number,
  quality = 0.85
): Promise<{ base64: string; mimeType: string; previewUrl: string; width: number; height: number; fileName: string }> {
  // unified implementation
}
```

---

### DUP-06 🟡 Medium — Structural Duplicate: Switch-per-provider pattern lặp trong nhiều handler

**Loại:** Structural Duplicate (Clone Type 3)  
**Files:** `electron/ipc/translate.ts`, `electron/ipc/chat.ts`, `electron/ipc/imageTranslate.ts`

**Mô tả:** Mỗi IPC handler đều có `switch(provider) { case 'gemini': ...; case 'claude': ...; case 'openai': ...; default: return unknown provider }`. Pattern này xuất hiện ít nhất 6 lần trong codebase.

**Gợi ý sửa:** Dùng provider registry/strategy pattern:

```typescript
type ProviderFn<T> = (apiKey: string, model: string, ...args: any[]) => Promise<T>

const TRANSLATE_ADAPTERS: Record<string, ProviderFn<string>> = {
  gemini: translateWithGemini,
  claude: translateWithClaude,
  openai: translateWithOpenAI,
}

const adapter = TRANSLATE_ADAPTERS[provider]
if (!adapter) return { success: false, error: `Unknown provider: ${provider}` }
const result = await adapter(apiKey, model, ...)
```

---

### DUP-07 🟢 Low — Semantic Duplicate: `ChatMessageContent` type định nghĩa 2 nơi

**Loại:** Semantic Duplicate (Clone Type 4)  
**Files liên quan:**
- `electron/ipc/chat.ts` (lines 4–9): `export interface ChatMessageContent`
- `src/services/chatService.ts` (lines 14–19): `export interface ChatMessageContent`

**Mô tả:** Cùng interface nhưng ở 2 layer khác nhau (main process và renderer). Fields giống nhau: `type`, `text`, `imageBase64`, `imageMimeType`.

**Gợi ý sửa:** Đây là trường hợp borderline — do Electron IPC yêu cầu plain objects, cần giữ tách biệt. Tuy nhiên có thể consolidate vào `src/types/index.ts` làm single source of truth và import vào cả hai nơi (cần xem xét Electron architecture constraints).

---

## 2. Hardcode

---

### HC-01 🟠 High — Magic Number: Token limits hardcode trực tiếp

**Loại:** Magic Number  
**Files liên quan:**
- `electron/ipc/translate.ts` line 310: `max_tokens: 16000`
- `electron/ipc/translate.ts` line 348: `max_completion_tokens: 16384`
- `electron/ipc/translate.ts` line 370: `max_tokens: 16000`
- `electron/ipc/translate.ts` line 387: `max_completion_tokens: 16384`
- `electron/ipc/translate.ts` line 461: `max_completion_tokens: 16384`
- `electron/ipc/translate.ts` line 484: `max_tokens: 16000`

**Code vi phạm:**
```typescript
// translate.ts:310 — Claude translate
max_tokens: 16000,

// translate.ts:348 — OpenAI translate
max_completion_tokens: 16384,

// translate.ts:484 (streaming Claude)
max_tokens: 16000,
```

**Giải thích:** Các số 16000 và 16384 là magic numbers không có tên, xuất hiện nhiều lần, không nhất quán (16000 vs 16384).

**Gợi ý sửa:**
```typescript
// electron/ipc/translate.ts — thêm constants ở đầu file
const MAX_OUTPUT_TOKENS_CLAUDE = 16_000  // Claude max output tokens for translation
const MAX_OUTPUT_TOKENS_OPENAI = 16_384  // OpenAI max_completion_tokens for translation
```

---

### HC-02 🟠 High — Magic Number: Token limit cho chat vs translate không nhất quán

**Loại:** Magic Number  
**Files liên quan:**
- `electron/ipc/chat.ts` line 280: `max_completion_tokens: 4096`
- `electron/ipc/chat.ts` line 121: `max_tokens: 4096`
- `electron/ipc/imageTranslate.ts` line 193: `max_tokens: 4096`
- `electron/ipc/imageTranslate.ts` line 239: `max_completion_tokens: 4096`

**Code vi phạm:**
```typescript
// chat.ts:121
max_tokens: 4096,

// imageTranslate.ts:193
max_tokens: 4096,
```

**Gợi ý sửa:**
```typescript
// electron/ipc/chat.ts
const MAX_CHAT_OUTPUT_TOKENS = 4_096

// electron/ipc/imageTranslate.ts
const MAX_IMAGE_TRANSLATE_TOKENS = 4_096
```

---

### HC-03 🟡 Medium — Magic Number: Timeout và delay values

**Loại:** Magic Number  
**Files liên quan:**
- `electron/ipc/translate.ts` line 177: `const CHUNK_TIMEOUT_MS = 90_000`
- `src/pages/TranslatePage.tsx` line 201: `setTimeout(..., 300)`
- `src/pages/TranslatePage.tsx` line 255: `setTimeout(() => setCopied(false), 1500)`
- `src/pages/ChatPage.tsx` line 419: `setTimeout(() => setCopiedId(null), 1500)`

**Code vi phạm:**
```typescript
// TranslatePage.tsx:201
debounceRef.current = setTimeout(() => { handleTranslateRef.current() }, 300)

// TranslatePage.tsx:255
setTimeout(() => setCopied(false), 1500)

// ChatPage.tsx:419
setTimeout(() => setCopiedId(null), 1500)
```

**Giải thích:** `1500` xuất hiện ở cả TranslatePage và ChatPage — magic number lặp lại. `300` là image auto-translate delay không tên.

**Gợi ý sửa:**
```typescript
// src/constants/ui.ts
export const COPY_FEEDBACK_DURATION_MS = 1_500  // How long "Copied!" feedback is shown
export const IMAGE_AUTO_TRANSLATE_DELAY_MS = 300 // Delay before auto-translating an attached image
```

---

### HC-04 🟡 Medium — Magic Number: Score constants trong model selection

**Loại:** Magic Number  
**Files:** `electron/ipc/models.ts` (lines 23–57), `electron/ipc/chat.ts` (lines 161–195)

**Code vi phạm:**
```typescript
// models.ts:25
if (id.includes('flash')) score += 200
else if (id.includes('pro')) score += 80
// ...
if (id.includes('lite') || id.includes('nano')) score -= 50

// chat.ts:177
score += major * 1000 + minor * 10
if (lower.includes('nano')) score -= 5
else if (lower.includes('mini')) score -= 2
```

**Gợi ý sửa:** Đặt tên constants cho các score weights:

```typescript
// electron/ipc/models.ts
const SCORE_FLASH_BONUS = 200
const SCORE_PRO_BONUS = 80
const SCORE_LITE_PENALTY = 50
```

---

### HC-05 🟡 Medium — Magic String: Model IDs hardcode trong verify functions

**Loại:** Magic String  
**Files:** `electron/ipc/translate.ts` (lines 391–421)

**Code vi phạm:**
```typescript
// translate.ts:395 — verifyGeminiKey
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

// translate.ts:404 — verifyClaudeKey
model: 'claude-3-haiku-20240307',

// translate.ts:415 — verifyOpenAIKey
model: 'gpt-4o-mini',
```

**Giải thích:** Các model IDs dùng để verify key (`gemini-2.0-flash`, `claude-3-haiku-20240307`, `gpt-4o-mini`) hardcode trực tiếp thay vì tham chiếu đến danh sách model đã có trong `src/constants/providers.ts`.

**Gợi ý sửa:**
```typescript
// electron/ipc/translate.ts — thêm constants
const VERIFY_MODEL_GEMINI = 'gemini-2.0-flash'        // cheap + fast for key verification
const VERIFY_MODEL_CLAUDE = 'claude-3-haiku-20240307'  // cheapest Claude model
const VERIFY_MODEL_OPENAI = 'gpt-4o-mini'              // cheapest OpenAI chat model
```

---

### HC-06 🟠 High — Magic String: Gemini endpoint URL hardcode trực tiếp

**Loại:** Magic String / Hardcode Config  
**Files liên quan:**
- `electron/ipc/imageTranslate.ts` line 98: Gemini REST URL
- `electron/ipc/tts.ts` line 94: Gemini TTS URL
- `electron/ipc/models.ts` line 77: Gemini models list URL

**Code vi phạm:**
```typescript
// imageTranslate.ts:98
const url = `https://generativelanguage.googleapis.com/v1beta/models/${editModel}:generateContent?key=${apiKey}`

// tts.ts:94
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`

// models.ts:77
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`
```

**Giải thích:** Base URL `https://generativelanguage.googleapis.com/v1beta` lặp 3 lần. Nếu Gemini thay đổi API version, phải sửa nhiều chỗ.

**Gợi ý sửa:**
```typescript
// electron/ipc/geminiApi.ts hoặc constants
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Dùng:
const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`
```

---

### HC-07 🟡 Medium — Magic String: Claude API version hardcode

**Loại:** Magic String / Hardcode Config  
**Files:** `electron/ipc/models.ts` line 110

**Code vi phạm:**
```typescript
// models.ts:110
'anthropic-version': '2023-06-01',
```

**Gợi ý sửa:**
```typescript
const ANTHROPIC_API_VERSION = '2023-06-01'
```

---

### HC-08 🟡 Medium — Hardcode Config: `MAX_CHAT_REQUEST_CHARS` tách rời `MAX_CHAT_INPUT_CHARS`

**Loại:** Hardcode Config  
**Files liên quan:**
- `src/constants/providers.ts` line 103: `export const MAX_CHAT_INPUT_CHARS = 3000`
- `electron/ipc/chat.ts` line 28: `const MAX_CHAT_REQUEST_CHARS = 3000`

**Code vi phạm:**
```typescript
// providers.ts:103 — renderer side
export const MAX_CHAT_INPUT_CHARS = 3000

// chat.ts:28 — main process side (comment nhắc về sync nhưng hardcode)
const MAX_CHAT_REQUEST_CHARS = 3000
```

**Giải thích:** Cùng giá trị 3000 định nghĩa 2 lần ở 2 nơi khác nhau (main process và renderer). Comment trong code đã nhận thức vấn đề này ("Mirrors MAX_CHAT_INPUT_CHARS") nhưng không giải quyết.

**Gợi ý sửa:** Tạo file shared constants có thể import từ cả main và renderer:
```typescript
// src/constants/limits.ts (shared)
export const MAX_CHAT_CHARS = 3_000
export const MAX_INPUT_CHARS = 5_000

// electron/ipc/chat.ts
import { MAX_CHAT_CHARS } from '../../src/constants/limits'
```

---

### HC-09 🟡 Medium — Hardcode Config: `MAX_IMAGE_SIZE` và `MAX_DIMENSION` tách rời

**Loại:** Hardcode Config  
**Files liên quan:**
- `src/pages/ChatPage.tsx` line 18: `const MAX_IMAGE_SIZE = 1200`
- `src/components/ImageTranslator.tsx` line 6: `const MAX_DIMENSION = 1500`

**Code vi phạm:**
```typescript
// ChatPage.tsx:18
const MAX_IMAGE_SIZE = 1200

// ImageTranslator.tsx:6
const MAX_DIMENSION = 1500
```

**Giải thích:** Hai tên khác nhau, hai giá trị khác nhau cho cùng khái niệm "max image dimension" — dễ gây nhầm lẫn khi maintain.

**Gợi ý sửa:**
```typescript
// src/constants/image.ts
export const MAX_CHAT_IMAGE_DIMENSION = 1_200    // Smaller for chat — reduce token cost
export const MAX_TRANSLATE_IMAGE_DIMENSION = 1_500 // Larger for image translate — needs detail
export const IMAGE_JPEG_QUALITY = 0.85            // Shared quality setting
export const MAX_IMAGE_BYTES = 900_000            // Max compressed size before quality reduction
```

---

### HC-10 🟢 Low — Hardcode UI: Inline string không qua i18n trong component

**Loại:** Hardcode UI Value  
**Files liên quan:**
- `src/components/ImageTranslator.tsx` line 178: `'Resizing & compressing…'`
- `src/components/ImageTranslator.tsx` line 96: `'Please upload an image file (JPEG, PNG, WebP, GIF)'`
- `src/pages/ChatPage.tsx` line 619: `labelTranscribing="…"`
- `src/pages/ChatPage.tsx` line 620: `labelRecording="…"`
- `src/pages/ChatPage.tsx` line 143: `title="Copy"` (hardcode)
- `src/pages/ChatPage.tsx` line 157: `title={regenerateLabel ?? 'Regenerate response'}`
- `src/pages/ChatPage.tsx` line 162: `{regenerateLabel ?? 'Regenerate'}`

**Code vi phạm:**
```typescript
// ImageTranslator.tsx:178
<p className="text-xs text-gray-400 ...">Resizing & compressing…</p>

// ImageTranslator.tsx:96
setErrorMsg('Please upload an image file (JPEG, PNG, WebP, GIF)')

// ChatPage.tsx:619-620
labelTranscribing="…"
labelRecording="…"
```

**Gợi ý sửa:** Thêm vào i18n locale files:
```typescript
// src/i18n/types.ts
image_processing_status: string // "Resizing & compressing…"
image_upload_type_error: string // "Please upload an image file..."

// ChatPage.tsx — dùng t.chat_voice_transcribing thay vì "…"
```

---

### HC-11 🟢 Low — Hardcode UI: Inline style `animationDuration` và `animationDelay`

**Loại:** Hardcode UI Value  
**Files liên quan:**
- `src/components/ImageTranslator.tsx` line 171: `animationDuration: '1.5s'`
- `src/pages/ChatPage.tsx` line 598: `animationDuration`, `animationDelay`
- `src/pages/ChatPage.tsx` line 111: `style={{ animationDelay: `${i * 0.15}s` }}`

**Code vi phạm:**
```typescript
// ImageTranslator.tsx:171
<div ... style={{ animationDuration: '1.5s' }} />

// ChatPage.tsx:111
style={{ animationDelay: `${i * 0.15}s` }}

// ChatPage.tsx:598
style={{ height: `${6 + (i % 3) * 4}px`, animationDuration: `${0.5 + i * 0.1}s`, animationDelay: `${i * 0.05}s` }}
```

**Gợi ý sửa:** Nhóm animation delays vào Tailwind config hoặc CSS custom properties khi pattern lặp nhiều nơi.

---

## Tóm tắt & Ưu tiên

### 🟠 Top 3 vấn đề ưu tiên sửa ngay

1. **DUP-02 (Exact Duplicate) — `getApiKey` helper lặp 4 lần** *(5 phút fix)*  
   Xóa 4 local function definitions, gọi trực tiếp `getStoredApiKey`. Không có risk, không ảnh hưởng behavior.

2. **DUP-01 (Near Duplicate) — Error classification lặp 5 lần** *(15 phút fix)*  
   Tạo `classifyProviderError()` trong `electron/ipc/errorUtils.ts`, thay thế 5 chỗ. Giảm nguy cơ inconsistency khi thêm error code mới.

3. **HC-06 (Magic String) — Gemini API base URL lặp 3 lần** *(10 phút fix)*  
   Extract `GEMINI_API_BASE` constant. Nếu Google đổi API version path, chỉ cần sửa 1 chỗ.

---

## Kế hoạch Refactor Gợi ý

### Phase 1 — Quick wins (không cần test)
- [ ] Xóa 4 local `getApiKey()` duplicates → dùng `getStoredApiKey()` trực tiếp
- [ ] Extract `GEMINI_API_BASE` constant từ 3 URLs lặp
- [ ] Extract `COPY_FEEDBACK_DURATION_MS = 1500` để dùng chung TranslatePage + ChatPage
- [ ] Đặt tên constants cho token limits: `MAX_OUTPUT_TOKENS_CLAUDE`, `MAX_OUTPUT_TOKENS_OPENAI`

### Phase 2 — Medium refactor (cần test nhẹ)
- [ ] Tạo `electron/ipc/errorUtils.ts` với `classifyProviderError()` và `noApiKeyResponse()`
- [ ] Tạo `src/constants/image.ts` cho `MAX_CHAT_IMAGE_DIMENSION`, `MAX_TRANSLATE_IMAGE_DIMENSION`, `IMAGE_JPEG_QUALITY`
- [ ] Thêm i18n keys cho hardcode UI strings trong `ImageTranslator.tsx` và `ChatPage.tsx`

### Phase 3 — Structural refactor (cần test đầy đủ)
- [ ] Tạo `src/utils/imageUtils.ts` consolidate `processImageFile` (ImageTranslator) + `resizeImageToBase64` (ChatPage)
- [ ] Implement provider adapter pattern thay switch/case trong IPC handlers
- [ ] Tách shared `MAX_CHAT_CHARS` constant ra khỏi cả renderer và main process

### Không cần sửa (false positives)
- Model scoring numbers trong `models.ts` và `chat.ts` — đây là business logic thực sự cần document nhưng không phải hardcode config nguy hiểm
- `DEFAULT_SETTINGS.autoTranslateDelay = 800` — đây là named constant rõ ràng
- Tailwind class numbers (p-4, text-xs, w-8, etc.) — theo design system convention
- `0`, `1`, `-1` trong expressions rõ ràng
