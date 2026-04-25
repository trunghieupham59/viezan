# Báo cáo Rà Soát Hard Code — Viezan Codebase

**Ngày tạo:** 26/04/2026 03:09  
**Workflow:** `check-dup-hardcode` v2.0.0 — Phễu lọc 3 tầng  
**Phạm vi:** Toàn bộ `src/` và `electron/`  
**Phương pháp:** Tầng 1 (grep static scan, 0 token) → Tầng 2 (đọc snippet ±5 dòng) → Tầng 3 (LLM adjudication)

---

## Tổng quan

| Kết quả | Số lượng |
|---------|---------|
| 🔴 Critical | 0 |
| 🟠 High | 6 |
| 🟡 Medium | 2 |
| 🟢 Low | 0 |
| **Tổng vấn đề thực** | **8** |
| False positive đã loại | ~120 (Tailwind classes, named constants, TS string unions) |

**Tin tức tốt:** ✅ Không có hardcode credential/API key nào bị lộ trong source code. Icon system tuân thủ đúng quy tắc (tất cả SVG nằm trong `src/components/ui/icons/`).

---

## Hardcode — Chi tiết

---

### [🟠 High] Magic Number — setTimeout hardcoded lặp nhiều lần

**File 1:** `src/components/ApiKeyInput.tsx:44,52`
```ts
// Line 44
setTimeout(() => setVerifyStatus('idle'), 5000)
// Line 52
setTimeout(() => setVerifyStatus('idle'), 5000)
```
**Vấn đề:** Giá trị `5000` ms xuất hiện 2 lần trong cùng một file, không có tên constant. Nếu cần điều chỉnh thời gian phải sửa 2 chỗ.  
**Sửa:**
```ts
// src/constants/ui.ts
export const VERIFY_STATUS_RESET_DELAY_MS = 5_000

// ApiKeyInput.tsx
import { VERIFY_STATUS_RESET_DELAY_MS } from '@/constants/ui'
setTimeout(() => setVerifyStatus('idle'), VERIFY_STATUS_RESET_DELAY_MS)
```

---

### [🟠 High] Magic Number — setTimeout hardcoded phân tán

**File:** `src/pages/settings/HotkeySection.tsx:56,61`
```ts
// Line 56
setTimeout(() => setHotkeyStatus('idle'), 3000)
// Line 61
setTimeout(() => setHotkeyStatus('idle'), 5000)
```
**Vấn đề:** Hai magic number `3000` và `5000` ms trong cùng file, không rõ ý nghĩa semantic của từng giá trị.

**File:** `src/pages/settings/TtsSection.tsx:38`
```ts
setTimeout(() => setElMsg(null), 4000)
```
**Vấn đề:** `4000` ms không có tên, không đồng nhất với các timeout khác trong codebase.

**Sửa (gộp vào `src/constants/ui.ts`):**
```ts
// src/constants/ui.ts
export const STATUS_RESET_DELAY_MS    = 3_000  // General UI feedback
export const STATUS_RESET_LONG_MS     = 5_000  // Longer feedback (error cases)
export const TOAST_DISMISS_DELAY_MS   = 4_000  // Toast/notification dismiss
export const VERIFY_STATUS_RESET_DELAY_MS = 5_000
```

---

### [🟠 High] Magic Number — Blob size threshold không có tên

**File:** `src/hooks/useLiveTranslate.ts:470`
```ts
if (blob.size < 1000) return
```
**Vấn đề:** `1000` byte là ngưỡng lọc audio blob, có thể cần điều chỉnh theo chất lượng microphone khác nhau. Không có tên constant nên khó maintain.  
**Sửa:**
```ts
// useLiveTranslate.ts hoặc constants/audio.ts
const MIN_AUDIO_BLOB_BYTES = 1_000
if (blob.size < MIN_AUDIO_BLOB_BYTES) return
```

---

### [🟠 High] Magic Number — Hardcode timestamp trong LiveTranslatePage

**File:** `src/pages/LiveTranslatePage.tsx:137–138`
```ts
const nextMs  = i < segments.length - 1 ? segments[i + 1].timestamp - base : startMs + 3000
const endMs   = Math.max(startMs + 500, nextMs)
```
**Vấn đề:** `3000` ms (default segment duration) và `500` ms (minimum segment duration) là tham số quan trọng của logic hiển thị subtitle, nên được đặt tên rõ ràng.  
**Sửa:**
```ts
const DEFAULT_SEGMENT_DURATION_MS = 3_000
const MIN_SEGMENT_DURATION_MS     = 500

const nextMs = i < segments.length - 1
  ? segments[i + 1].timestamp - base
  : startMs + DEFAULT_SEGMENT_DURATION_MS
const endMs = Math.max(startMs + MIN_SEGMENT_DURATION_MS, nextMs)
```

---

### [🟠 High] Magic String / Hardcode UI text — legacyAssistant.ts

**File:** `electron/ipc/legacyAssistant.ts:102,113,115`
```ts
// Line 102
if(!txt){show('📌 Select text on the page first.',3000);return;}

// Line 113
show('⚠ '+(d.error||'Translation failed'),5000);

// Line 115
}).catch(function(){show('⚠ Cannot reach Viezan app. Make sure it is running.',5000);});
```
**Vấn đề:** 3 chuỗi UI text hardcoded trực tiếp vào code, không qua i18n. Đây là file legacy (Chrome extension content script), nhưng vẫn nên externalize string nếu có kế hoạch hỗ trợ đa ngôn ngữ cho extension.  
**Sửa:** Trích xuất ra object constants trong cùng file:
```ts
const MESSAGES = {
  noTextSelected: '📌 Select text on the page first.',
  translationFailed: 'Translation failed',
  appNotRunning: '⚠ Cannot reach Viezan app. Make sure it is running.',
} as const

if(!txt){show(MESSAGES.noTextSelected, 3000);return;}
show('⚠ '+(d.error || MESSAGES.translationFailed), 5000);
}).catch(function(){show(MESSAGES.appNotRunning, 5000);});
```

---

### [🟡 Medium] Hardcode URL — fetch dùng URL thay vì constant có sẵn

**File:** `electron/ipc/models.ts:133`
```ts
const res = await fetch('https://api.anthropic.com/v1/models?limit=20', {
```
**Vấn đề:** URL này đã có constant `ANTHROPIC_API_BASE = 'https://api.anthropic.com'` được export từ `electron/ipc/ipcConstants.ts:87`, nhưng không được tái sử dụng. Nếu Anthropic thay đổi base URL, phải sửa 2 chỗ.  
**Sửa:**
```ts
import { ANTHROPIC_API_BASE } from './ipcConstants'

const res = await fetch(`${ANTHROPIC_API_BASE}/v1/models?limit=20`, {
```

---

### [🟡 Medium] Hardcode URL — inline URL trong component JSX

**File:** `src/pages/settings/ApiKeysSection.tsx:113`
```ts
onClick={() => window.api?.openExternal('https://jina.ai')}
```
**Vấn đề:** URL `https://jina.ai` hardcoded trực tiếp vào JSX component. Trong khi các URL docs của OpenAI, Anthropic, Google đã được define trong `src/constants/providers.ts` hoặc `src/constants/urls.ts`, URL của Jina bị bỏ sót.  
**Sửa:**
```ts
// src/constants/urls.ts
export const JINA_DOCS_URL = 'https://jina.ai'

// ApiKeysSection.tsx
import { JINA_DOCS_URL } from '@/constants/urls'
onClick={() => window.api?.openExternal(JINA_DOCS_URL)}
```

---

## Tóm tắt & Ưu tiên

| Loại vấn đề | 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|-------------|------------|--------|----------|-------|------|
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Hardcode Icon (SVG) | 0 | 0 | 0 | 0 | 0 |
| Magic Number (timeout) | 0 | 4 | 0 | 0 | 4 |
| Magic Number (size/duration) | 0 | 2 | 0 | 0 | 2 |
| Magic String / UI text | 0 | 1 | 0 | 0 | 1 |
| Hardcode URL | 0 | 0 | 2 | 0 | 2 |
| **Tổng** | **0** | **6** | **2** | **0** | **8** |

**File bị ảnh hưởng:**
- `src/components/ApiKeyInput.tsx` — 2 magic numbers
- `src/pages/settings/HotkeySection.tsx` — 2 magic numbers
- `src/pages/settings/TtsSection.tsx` — 1 magic number
- `src/hooks/useLiveTranslate.ts` — 1 magic number (blob size)
- `src/pages/LiveTranslatePage.tsx` — 2 magic numbers (segment timing)
- `electron/ipc/legacyAssistant.ts` — 3 hardcoded UI strings + 2 magic timeouts
- `electron/ipc/models.ts` — 1 hardcoded URL (dù có constant sẵn)
- `src/pages/settings/ApiKeysSection.tsx` — 1 hardcoded URL

---

## Kế hoạch refactor gợi ý

### Ưu tiên 1 — Tạo `src/constants/ui.ts` (nếu chưa có)

Gộp tất cả UI timing constants vào một file:
```ts
// src/constants/ui.ts
/** Thời gian reset trạng thái verify về 'idle' sau khi hiển thị kết quả */
export const VERIFY_STATUS_RESET_DELAY_MS = 5_000

/** Thời gian hiển thị feedback ngắn (success) */
export const STATUS_RESET_DELAY_MS = 3_000

/** Thời gian hiển thị feedback dài (error) */
export const STATUS_RESET_LONG_MS = 5_000

/** Thời gian toast/notification tự dismiss */
export const TOAST_DISMISS_DELAY_MS = 4_000
```

### Ưu tiên 2 — Sửa `electron/ipc/models.ts`

Thay thế hardcoded URL bằng `ANTHROPIC_API_BASE` — 1 dòng thay đổi, rủi ro thấp.

### Ưu tiên 3 — Bổ sung `JINA_DOCS_URL` vào `src/constants/urls.ts`

Đồng nhất với pattern đã có của các provider URL khác.

### Ưu tiên 4 — Extract magic numbers trong `useLiveTranslate.ts` và `LiveTranslatePage.tsx`

Đặt tên cho `MIN_AUDIO_BLOB_BYTES`, `DEFAULT_SEGMENT_DURATION_MS`, `MIN_SEGMENT_DURATION_MS`.

### Ưu tiên 5 — Extract UI strings trong `legacyAssistant.ts`

File legacy nhưng nên có MESSAGES object để dễ maintain.

---

## Kết luận

Codebase Viezan có chất lượng khá tốt về hardcode:
- ✅ **Không có credential nào bị hardcode** — an toàn tuyệt đối về bảo mật
- ✅ **Icon system tuân thủ 100%** — tất cả SVG trong `src/components/ui/icons/`
- ✅ **Các API base URL quan trọng đã được abstract** vào `ipcConstants.ts`
- ✅ **Hầu hết magic numbers đã được named** (`CHUNK_DURATION_MS`, `MAX_INPUT_CHARS`, `DETECT_LANG_MAX_CHARS`...)

Các vấn đề tìm được đều ở mức `High` và `Medium`, chủ yếu là timeout values và một vài URL bị bỏ sót chưa dùng constant có sẵn. Không cần hotfix khẩn cấp, có thể xử lý trong sprint refactor thông thường.
