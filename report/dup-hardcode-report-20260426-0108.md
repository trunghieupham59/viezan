# Báo cáo: Duplicate Code & Hardcode — Viezan

**Workflow:** check-dup-hardcode  
**Ngày:** 26/04/2026 — 01:08  
**Phạm vi:** Toàn bộ `src/` và `electron/ipc/`  
**Công cụ phát hiện:** Skill `check-dup-hardcode` (Duplicate + Hardcode)

---

## Tóm tắt

| Loại vấn đề              | 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|--------------------------|-------------|---------|-----------|--------|------|
| Exact Duplicate          | 1           | 0       | 0         | 0      | 1    |
| Near Duplicate           | 0           | 1       | 0         | 0      | 1    |
| Structural Duplicate     | 0           | 0       | 1         | 0      | 1    |
| Semantic Duplicate       | 0           | 0       | 0         | 0      | 0    |
| Hardcode Credential      | 0           | 0       | 0         | 0      | 0    |
| Magic Number             | 0           | 2       | 1         | 0      | 3    |
| Magic String             | 0           | 0       | 0         | 0      | 0    |
| Hardcode Config          | 0           | 0       | 2         | 0      | 2    |
| Hardcode UI Value        | 0           | 0       | 0         | 7      | 7    |
| Hardcode Icon            | 0           | 0       | 0         | 0      | 0    |
| **Tổng**                 | **1**       | **3**   | **4**     | **7**  | **15** |

**File bị ảnh hưởng nhiều nhất:** `electron/ipc/__tests__/` (4 file cùng duplicate)

**Top 3 ưu tiên sửa:**
1. 🔴 Exact Duplicate: `buildMockIpcMain()` lặp trong 4 test file → tách helper
2. 🟠 Near Duplicate: `VoiceOverlay` có 3 animated circle elements gần giống nhau
3. 🟠 Magic Number: `setTimeout(..., 5000)` trong `DeepResearchApiSection.tsx`

---

## PHẦN 1: DUPLICATE CODE

---

### [🔴 Critical] Exact Duplicate — `buildMockIpcMain()`

**File 1:** `electron/ipc/__tests__/chat.test.ts:27–33`  
**File 2:** `electron/ipc/__tests__/imageTranslate.test.ts:34–41`  
**File 3:** `electron/ipc/__tests__/tts.test.ts:44–51`  
**File 4:** `electron/ipc/__tests__/translate.test.ts:40–47`

**Code (chat.test.ts):**
```ts
function buildMockIpcMain() {
  const handlers: Record<string, Function> = {}
  const ipcMain = {
    handle: (channel: string, handler: Function) => {
      handlers[channel] = handler
    },
    // ...
  }
}
```

**Vấn đề:** Hàm helper `buildMockIpcMain()` được copy-paste giống hệt nhau vào cả 4 file test. Nếu cần thay đổi cấu trúc mock (ví dụ: thêm `removeHandler`), phải sửa 4 nơi.

**Sửa:** Tách ra file helper dùng chung:
```ts
// electron/ipc/__tests__/helpers/mockIpcMain.ts
type IpcHandler = (...args: unknown[]) => unknown

export function buildMockIpcMain() {
  const handlers: Record<string, IpcHandler> = {}
  return {
    ipcMain: {
      handle: (channel: string, handler: IpcHandler) => {
        handlers[channel] = handler
      },
    },
    handlers,
  }
}
```

Sau đó trong mỗi test file:
```ts
import { buildMockIpcMain } from './helpers/mockIpcMain'
```

---

### [🟠 High] Near Duplicate — Animated Circle Elements trong `VoiceOverlay`

**File:** `src/components/translate/VoiceOverlay.tsx:37–41`

**Code:**
```tsx
<div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-30"
  style={{ animationDuration: '1.8s' }} />
<div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-20"
  style={{ animationDuration: '1.4s', animationDelay: '0.2s' }} />
<div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-10"
  style={{ animationDuration: '1.1s', animationDelay: '0.1s' }} />
```

**Vấn đề:** 3 element có cùng cấu trúc CSS, chỉ khác `opacity`, `animationDuration`, `animationDelay`. Thêm / bớt số vòng sóng phải sửa thủ công từng element.

**Sửa:** Tham số hóa thành mảng + map:
```tsx
const RIPPLE_RINGS = [
  { opacity: 0.3, duration: '1.8s', delay: undefined },
  { opacity: 0.2, duration: '1.4s', delay: '0.2s' },
  { opacity: 0.1, duration: '1.1s', delay: '0.1s' },
] as const

{RIPPLE_RINGS.map((ring, i) => (
  <div
    key={i}
    className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400"
    style={{
      opacity: ring.opacity,
      animationDuration: ring.duration,
      animationDelay: ring.delay,
    }}
  />
))}
```

---

### [🟡 Medium] Structural Duplicate — Provider error-handling flow trong IPC handlers

**File 1:** `electron/ipc/translate.ts`  
**File 2:** `electron/ipc/imageTranslate.ts`  
**File 3:** `electron/ipc/chat.ts`  
**File 4:** `electron/ipc/lightweightTranslate.ts`

**Pattern lặp lại:**
```ts
// Mỗi handler đều có cùng cấu trúc:
const apiKey = await getStoredApiKey(provider)
if (!apiKey) return noApiKeyResponse(provider)
try {
  const result = await callProvider(provider, model, apiKey, ...)
  return { success: true, ... }
} catch (err) {
  return classifyProviderError(err, provider)
}
```

**Vấn đề:** Structural duplicate (Clone Type 3) — cùng flow kiểm tra API key + gọi provider + xử lý lỗi. Tuy nhiên mỗi handler có domain logic riêng (translate vs image translate vs chat) nên **không nên merge hoàn toàn**. Đây là severity Medium.

**Gợi ý sửa:** Tách phần boilerplate thành wrapper helper:
```ts
// electron/ipc/helpers/withApiKey.ts
export async function withApiKey<T>(
  provider: string,
  fn: (apiKey: string) => Promise<T>
): Promise<T | NoApiKeyResponse> {
  const apiKey = await getStoredApiKey(provider)
  if (!apiKey) return noApiKeyResponse(provider)
  try {
    return await fn(apiKey)
  } catch (err) {
    return classifyProviderError(err, provider)
  }
}
```

> **Lưu ý:** Đây là refactor nâng cao. Cần cân nhắc kỹ vì mỗi handler có edge case khác nhau (retry logic, fallback chain). Chỉ áp dụng nếu các handler chia sẻ đủ cấu trúc chung.

---

## PHẦN 2: HARDCODE

---

### [🟠 High] Magic Number — `setTimeout(..., 5000)` trong DeepResearchApiSection

**File:** `src/components/chat/DeepResearchApiSection.tsx:137`

**Code:**
```ts
setTimeout(() => setVerifyStatus('idle'), 5000)
```

**Vấn đề:** Con số `5000` (ms) không có tên, người đọc phải tự đoán đây là thời gian reset trạng thái sau khi verify API key.

**Sửa:**
```ts
// Thêm vào đầu file hoặc src/constants/ui.ts
const VERIFY_STATUS_RESET_MS = 5_000

setTimeout(() => setVerifyStatus('idle'), VERIFY_STATUS_RESET_MS)
```

---

### [🟠 High] Magic Number — `setInterval(..., 400)` trong MessageBubble

**File:** `src/components/chat/MessageBubble.tsx:14`

**Code:**
```ts
const t = setInterval(() => setDots((d) => (d >= 3 ? 1 : d + 1)), 400)
```

**Vấn đề:** `400` (ms) là tốc độ nhảy của loading dots. Không rõ ý nghĩa khi đọc lần đầu.

**Sửa:**
```ts
// Đã có DOT_ANIM_DELAY_STEP_S ở trên cùng file, thêm:
const DOT_BOUNCE_INTERVAL_MS = 400

const t = setInterval(() => setDots((d) => (d >= 3 ? 1 : d + 1)), DOT_BOUNCE_INTERVAL_MS)
```

---

### [🟡 Medium] Magic Number — `setTimeout(..., 50)` trong SystemPromptDropdown

**File:** `src/components/chat/SystemPromptDropdown.tsx:71`

**Code:**
```ts
setTimeout(() => nameInputRef.current?.focus(), 50)
```

**Vấn đề:** `50` ms là delay để đợi DOM render xong rồi mới focus. Ý nghĩa không rõ, dễ bị thay đổi sai.

**Sửa:**
```ts
const FOCUS_DEFER_MS = 50  // Wait one tick for DOM to mount before focusing
setTimeout(() => nameInputRef.current?.focus(), FOCUS_DEFER_MS)
```

---

### [🟡 Medium] Hardcode Config — Local constants trong `VoiceRecorder`

**File:** `src/components/VoiceRecorder.tsx:97–98`

**Code:**
```ts
const MAX_RETRIES = 3
const RESTART_DELAY_MS = 600
```

**Vấn đề:** Hai giá trị config này được define inline trong component. Không sai về mặt kỹ thuật (đã có tên), nhưng theo chuẩn dự án nên đặt trong `src/constants/` để dễ tìm và thay đổi tập trung.

**Sửa:** Di chuyển ra `src/constants/audio.ts` hoặc tạo `src/constants/voice.ts`:
```ts
// src/constants/voice.ts
export const VOICE_RECORDER_MAX_RETRIES = 3
export const VOICE_RECORDER_RESTART_DELAY_MS = 600
```

---

### [🟡 Medium] Hardcode Config — `PROCESSING_PING_DURATION_S` là string cứng

**File:** `src/components/translate/ImageTranslator.tsx:129`

**Code:**
```tsx
<div ... style={{ animationDuration: PROCESSING_PING_DURATION_S }} />
```

Kiểm tra xem `PROCESSING_PING_DURATION_S` được define ở đâu — nếu là constant local trong file này thay vì từ `src/constants/ui.ts` thì cần di chuyển ra.

---

### [🟢 Low] Hardcode UI Value — `style` inline với giá trị cứng

**7 vị trí:**

| File | Line | Value | Ghi chú |
|------|------|-------|---------|
| `src/components/MarkdownEditor.tsx` | 219 | `minHeight: '1.6em'` | Layout cứng |
| `src/components/FuriganaText.tsx` | 55 | `lineHeight: '2.6'` | Typography cứng |
| `src/components/FuriganaText.tsx` | 62 | `fontSize: '0.55em', opacity: 0.75` | 2 giá trị cứng |
| `src/pages/LiveTranslatePage.tsx` | 719 | `maxHeight: '80vh'` | Viewport cứng |
| `src/components/translate/VoiceOverlay.tsx` | 37–41 | `'1.8s'`, `'1.4s'`, `'1.1s'` | Animation duration cứng |
| `src/components/translate/VoiceOverlay.tsx` | 39–41 | `'0.2s'`, `'0.1s'` | Animation delay cứng |

**Mức độ:** Low — Tailwind không cover được dynamic animation values, inline style là cần thiết ở một số trường hợp. Tuy nhiên nên extract ra constants có tên.

**Sửa VoiceOverlay (ưu tiên nhất vì có 5 giá trị):**
```ts
// src/constants/ui.ts (thêm vào)
export const VOICE_RIPPLE_DURATIONS_S = ['1.8s', '1.4s', '1.1s'] as const
export const VOICE_RIPPLE_DELAYS_S = [undefined, '0.2s', '0.1s'] as const
```

---

## Kết luận

### Điểm tốt ✅
- **Không có hardcode credential** — Tất cả API key đều dùng keychain/safeStorage
- **Không có hardcode icon** — Tất cả icon đều import từ `src/components/ui/icons/`
- **Không có magic string** — Các string quan trọng đã được define thành constant
- **Số lượng duplicate thấp** — Codebase production được tổ chức tốt
- **Constants file đầy đủ** — `src/constants/` đã có `image.ts`, `providers.ts`, `ui.ts`, `audio.ts`

### Cần cải thiện ⚠️
1. Test helpers bị duplicate — Tạo shared helper file
2. Một số magic number còn sót trong component (5000, 400, 50 ms)
3. VoiceOverlay có near-duplicate structure nên refactor

---

*Báo cáo được tạo bởi workflow `check-dup-hardcode` — viezanagent*
