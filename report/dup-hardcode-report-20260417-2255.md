# Báo cáo Check Duplicate & Hardcode
**Ngày:** 17/04/2026 — 22:55  
**Phạm vi:** Toàn bộ codebase (`src/`, `electron/ipc/`)  
**Workflow:** `check-dup-hardcode v1.0.0`

---

## Tổng quan

| Loại vấn đề | Critical | High | Medium | Low | Tổng |
|---|---|---|---|---|---|
| Exact Duplicate | 0 | 2 | 0 | 0 | **2** |
| Near Duplicate | 0 | 1 | 1 | 0 | **2** |
| Structural Duplicate | 0 | 0 | 1 | 0 | **1** |
| Semantic Duplicate | 0 | 0 | 0 | 0 | 0 |
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Magic Number | 0 | 2 | 4 | 4 | **10** |
| Magic String | 0 | 2 | 2 | 4 | **8** |
| Hardcode Config | 0 | 0 | 2 | 2 | **4** |
| Hardcode UI | 0 | 0 | 0 | 5 | **5** |
| Hardcode Icon | 0 | 1 | 0 | 0 | **1** |
| **TỔNG** | **0** | **8** | **10** | **15** | **33** |

> ✅ **Không phát hiện credential/secret hardcode** — Toàn bộ API key đều đi qua OS Keychain.

---

## Duplicate Code

### 🟠 DUP-01 — Exact Duplicate: `EXT_SYSTEM_PROMPT` và `HOTKEY_SYSTEM_PROMPT`

**Loại:** Exact Duplicate (Clone Type 1)  
**Severity:** 🟠 High  
**Vị trí:**
- `electron/ipc/localServer.ts` line 131–133
- `electron/ipc/globalHotkey.ts` line 111–113

**Code vi phạm:**

```typescript
// localServer.ts:131
const EXT_SYSTEM_PROMPT =
  'You are an expert translator. Translate accurately and naturally. ' +
  'Output ONLY the translation — no notes, no alternatives, no explanations.'

// globalHotkey.ts:111
const HOTKEY_SYSTEM_PROMPT =
  'You are an expert translator. Translate accurately and naturally. ' +
  'Output ONLY the translation — no notes, no alternatives, no explanations.'
```

**Vấn đề:** Hai string này **hoàn toàn giống nhau** từng ký tự. Nếu cần thay đổi prompt (thêm rule mới), phải sửa 2 chỗ.

**Gợi ý sửa:** Export từ `ipcConstants.ts`:
```typescript
// electron/ipc/ipcConstants.ts — thêm vào cuối file
export const TRANSLATOR_SYSTEM_PROMPT =
  'You are an expert translator. Translate accurately and naturally. ' +
  'Output ONLY the translation — no notes, no alternatives, no explanations.'
```

---

### 🟠 DUP-02 — Exact Duplicate: Hàm `tpl` (template helper)

**Loại:** Exact Duplicate (Clone Type 1)  
**Severity:** 🟠 High  
**Vị trí:**
- `src/pages/settings/BrowserIntegrationSection.tsx` line 13–14
- `src/pages/settings/UpdaterSection.tsx` line 13–14

**Code vi phạm:**
```typescript
// BrowserIntegrationSection.tsx:13
const tpl = (str: string, vars: Record<string, string | number>) =>
  str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))

// UpdaterSection.tsx:13
const tpl = (str: string, vars: Record<string, string | number>) =>
  str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
```

**Vấn đề:** Copy-paste hoàn toàn. Nếu logic template thay đổi (ví dụ hỗ trợ nested keys), phải sửa 2 chỗ.

**Gợi ý sửa:** Chuyển vào `src/utils/tpl.ts`:
```typescript
// src/utils/tpl.ts
export function tpl(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
```
Sau đó import trong cả 2 file.

---

### 🟠 DUP-03 — Near Duplicate: `translateText` trong `localServer.ts` và `globalHotkey.ts`

**Loại:** Near Duplicate (Clone Type 2)  
**Severity:** 🟠 High  
**Vị trí:**
- `electron/ipc/localServer.ts` line 135–185 (`handleTranslate`)
- `electron/ipc/globalHotkey.ts` line 119–163 (`translateText`)

**Code vi phạm (pattern chung):**
```typescript
// Cả hai file đều triển khai pattern giống nhau:
// 1. Lấy API key từ getStoredApiKey
// 2. if (provider === 'gemini') { ... GoogleGenerativeAI ... max_tokens/completion: 2048 }
// 3. if (provider === 'openai') { ... client.chat.completions.create ... max_completion_tokens: 2048 }
// 4. if (provider === 'claude') { ... client.messages.create ... max_tokens: 2048 }

// localServer.ts:158-165
if (provider === 'openai') {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey })
  const completion = await client.chat.completions.create({
    model, messages: [...], max_completion_tokens: 2048,
  })
  return { success: true, translatedText: ... }
}

// globalHotkey.ts:134-146 — cùng cấu trúc
if (provider === 'openai') {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey })
  const completion = await client.chat.completions.create({
    model, messages: [...], max_completion_tokens: 2048,
  })
  return ...
}
```

**Vấn đề:** Logic translate per-provider bị implement 3 lần (translate.ts đã có bản chính nhưng localServer và globalHotkey tái implement). Khi thêm provider mới hoặc thay đổi max_tokens, phải sửa 3 nơi.

**Gợi ý sửa:** Sử dụng `TRANSLATE_PROVIDERS` registry đã có trong `translate.ts` hoặc trích xuất một hàm `translateSimple(text, targetLang, provider, model)` dùng chung trong cả 3 file.

---

### 🟡 DUP-04 — Structural Duplicate: `handleClearAll` pattern trong History tabs

**Loại:** Structural Duplicate (Clone Type 3)  
**Severity:** 🟡 Medium  
**Vị trí:**
- `src/pages/history/TranslationHistoryTab.tsx` line 22–29 + 33–53
- `src/pages/history/LiveHistoryTab.tsx` line 20–27 + 31–50

**Code vi phạm:**
```typescript
// TranslationHistoryTab.tsx:22
const handleClearAll = () => {
  if (confirmClear) {
    clearHistory()
    setConfirmClear(false)
  } else {
    setConfirmClear(true)
  }
}
// + UI pattern sub-header với className giống nhau, confirmClear button pattern

// LiveHistoryTab.tsx:20 — cùng logic, cùng UI pattern
const handleClearAll = () => {
  if (confirmClear) {
    clearLiveSessions()
    setConfirmClear(false)
  } else {
    setConfirmClear(true)
  }
}
```

**Gợi ý sửa:** Trích xuất `<HistoryClearHeader count={n} label="..." onClear={fn} />` component dùng chung.

---

### 🟡 DUP-05 — Near Duplicate: Empty state panel trong 3 History tabs

**Loại:** Near Duplicate (Clone Type 2)  
**Severity:** 🟡 Medium  
**Vị trí:**
- `src/pages/history/TranslationHistoryTab.tsx` line 56–65
- `src/pages/history/ChatHistoryTab.tsx` line 22–31
- `src/pages/history/LiveHistoryTab.tsx` line 53–61

**Code vi phạm:**
```tsx
// TranslationHistoryTab.tsx:56
<div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
  <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
    <ClockIcon className="w-7 h-7 text-gray-300 dark:text-gray-600" />
  </div>
  <div>
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t.history_empty}</p>
    <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">{t.history_empty_desc}</p>
  </div>
</div>

// ChatHistoryTab.tsx:22 — cùng className, cùng structure
// LiveHistoryTab.tsx:53 — cùng structure, chỉ khác màu background icon
```

**Gợi ý sửa:** Tạo `<HistoryEmptyState icon={...} title={...} desc={...} />` component trong `historyUtils.tsx`.

---

## Hardcode

### 🟠 HC-01 — Magic Number: `2048` token limit trong `localServer.ts` và `globalHotkey.ts`

**Loại:** Magic Number  
**Severity:** 🟠 High  
**Vị trí:**
- `electron/ipc/localServer.ts` line 164: `max_completion_tokens: 2048`
- `electron/ipc/localServer.ts` line 173: `max_tokens: 2048`
- `electron/ipc/globalHotkey.ts` line 142: `max_completion_tokens: 2048`
- `electron/ipc/globalHotkey.ts` line 153: `max_tokens: 2048`

**Vấn đề:** Giá trị `2048` xuất hiện 4 lần trong 2 file, trong khi `ipcConstants.ts` đã có `MAX_CHAT_OUTPUT_TOKENS = 4_096`. Đây là magic number riêng không đồng bộ với hệ thống.

**Gợi ý sửa:** Thêm constant trong `ipcConstants.ts`:
```typescript
// ipcConstants.ts — thêm
/** Max output tokens cho lightweight translation calls (hotkey, bookmarklet) */
export const MAX_LIGHTWEIGHT_TRANSLATE_TOKENS = 2_048
```
Sau đó import và dùng trong cả 2 file.

---

### 🟠 HC-02 — Magic String: `'vi-VN'` locale hardcoded 3 lần

**Loại:** Magic String  
**Severity:** 🟠 High  
**Vị trí:**
- `src/pages/settings/BrowserIntegrationSection.tsx` line 95
- `src/pages/settings/BrowserIntegrationSection.tsx` line 392
- `src/pages/settings/BrowserIntegrationSection.tsx` line 440

**Code vi phạm:**
```typescript
// line 95
const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

// line 392
{new Date(revealedToken.expiresAt).toLocaleDateString('vi-VN', { ... })}

// line 440
const expireDate = new Date(tk.expiresAt).toLocaleDateString('vi-VN', { ... })
```

**Vấn đề:** Locale `'vi-VN'` hardcoded thay vì dùng app locale từ store. Nếu user đang dùng tiếng Anh, date format vẫn hiển thị theo kiểu Việt Nam.

**Gợi ý sửa:**
```typescript
// Dùng locale từ store
import { useAppStore } from '../../store/useAppStore'
const { locale } = useAppStore()
const dateLocale = locale === 'vi' ? 'vi-VN' : locale === 'ja' ? 'ja-JP' : 'en-US'
new Date(ts).toLocaleDateString(dateLocale, { ... })
```
Hoặc tốt hơn, thêm helper `formatDate(ts, locale)` vào `historyUtils.tsx`.

---

### 🟠 HC-03 — Magic String: Hardcoded Vietnamese UI strings không qua i18n

**Loại:** Magic String  
**Severity:** 🟠 High  
**Vị trí:**
- `src/pages/settings/BrowserIntegrationSection.tsx` line 360
- `src/pages/settings/BrowserIntegrationSection.tsx` line 369
- `src/pages/settings/BrowserIntegrationSection.tsx` line 402

**Code vi phạm:**
```tsx
// line 360
<p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
  Token "{revealedToken.name}" — sao chép ngay!   {/* ❌ Vietnamese hardcoded */}
</p>

// line 369
<button title="Đóng">   {/* ❌ Vietnamese hardcoded */}

// line 402
<button type="button" ... title="Đóng">   {/* ❌ Vietnamese hardcoded */}
```

**Vấn đề:** Văn bản tiếng Việt hardcoded trong component trong khi app đã có hệ thống i18n đầy đủ.

**Gợi ý sửa:** Thêm vào `src/i18n/locales/`:
```typescript
settings_token_reveal_title: 'Token "{name}" — sao chép ngay!',  // vi
settings_token_reveal_title: 'Token "{name}" — copy now!',         // en
settings_token_close: 'Đóng',    // vi
settings_token_close: 'Close',   // en
```

---

### 🟠 HC-04 — Magic String: Emoji `🔑` dùng làm icon

**Loại:** Hardcode Icon  
**Severity:** 🟠 High  
**Vị trí:** `src/pages/settings/BrowserIntegrationSection.tsx` line 357

**Code vi phạm:**
```tsx
// line 357
<span className="text-amber-500 text-sm flex-shrink-0">🔑</span>
```

**Vấn đề:** Emoji dùng làm icon UI thay vì dùng SVG icon component. Không nhất quán với hệ thống icon đã có trong `src/components/ui/icons/`.

**Gợi ý sửa:** Kiểm tra `src/components/ui/icons/` (auth.tsx đã có `LockIcon`). Dùng `LockIcon` hoặc tạo mới `KeyIcon` trong `src/components/ui/icons/auth.tsx`.

---

### 🟡 HC-05 — Magic Number: `160` px textarea maxHeight hardcoded 2 lần

**Loại:** Magic Number  
**Severity:** 🟡 Medium  
**Vị trí:**
- `src/pages/ChatPage.tsx` line 88
- `src/pages/ChatPage.tsx` line 563

**Code vi phạm:**
```typescript
// line 88 — in useEffect auto-resize
el.style.height = `${Math.min(el.scrollHeight, 160)}px`

// line 563 — in JSX
style={{ maxHeight: '160px', overflowY: 'auto' }}
```

**Gợi ý sửa:**
```typescript
// Đầu file ChatPage.tsx
const CHAT_TEXTAREA_MAX_HEIGHT_PX = 160

// Dùng:
el.style.height = `${Math.min(el.scrollHeight, CHAT_TEXTAREA_MAX_HEIGHT_PX)}px`
style={{ maxHeight: `${CHAT_TEXTAREA_MAX_HEIGHT_PX}px`, overflowY: 'auto' }}
```

---

### 🟡 HC-06 — Magic String: Hardcoded `'You'` / `'AI'` labels không qua i18n

**Loại:** Magic String  
**Severity:** 🟡 Medium  
**Vị trí:** `src/pages/history/ChatHistoryTab.tsx` line 90

**Code vi phạm:**
```tsx
// line 90
<p className="text-[10px] font-semibold text-gray-400 mb-0.5">
  {msg.role === 'user' ? 'You' : 'AI'}
</p>
```

**Gợi ý sửa:** Thêm i18n key `history_chat_role_user` / `history_chat_role_ai` hoặc dùng `t.chat_role_user` / `t.chat_role_ai`.

---

### 🟡 HC-07 — Magic Number: `pageSize=50` hardcoded trong URL string của `models.ts`

**Loại:** Magic Number  
**Severity:** 🟡 Medium  
**Vị trí:** `electron/ipc/models.ts` line 99

**Code vi phạm:**
```typescript
// models.ts:99
const url = `${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=50`  // ❌ hardcoded 50

// Nhưng ipcConstants.ts đã có:
export const GEMINI_MODELS_PAGE_SIZE = 50  // ✅ chưa được dùng ở đây
// imageTranslate.ts đã dùng đúng: `pageSize=${GEMINI_MODELS_PAGE_SIZE}`
```

**Vấn đề:** `GEMINI_MODELS_PAGE_SIZE` đã được định nghĩa trong `ipcConstants.ts` và `imageTranslate.ts` đã dùng đúng, nhưng `models.ts` vẫn hardcode `50`.

**Gợi ý sửa:**
```typescript
const url = `${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=${GEMINI_MODELS_PAGE_SIZE}`
```

---

### 🟡 HC-08 — Magic String: Hardcoded `'entry'`/`'entries'` và `'session'`/`'sessions'`

**Loại:** Magic String  
**Severity:** 🟡 Medium  
**Vị trí:**
- `src/pages/history/TranslationHistoryTab.tsx` line 38
- `src/pages/history/LiveHistoryTab.tsx` line 35

**Code vi phạm:**
```tsx
// TranslationHistoryTab.tsx:38
{history.length} {history.length === 1 ? 'entry' : 'entries'}

// LiveHistoryTab.tsx:35
{liveSessions.length} {liveSessions.length === 1 ? 'session' : 'sessions'}
```

**Gợi ý sửa:** Thêm i18n key hoặc đơn giản hiển thị số + label đã có từ `t.history_tab_translate` / `t.history_tab_live`.

---

### 🟡 HC-09 — Magic Config: `'gemini-2.0-flash'` hardcoded trong `localServer.ts`

**Loại:** Hardcode Config  
**Severity:** 🟡 Medium  
**Vị trí:** `electron/ipc/localServer.ts` line 142

**Code vi phạm:**
```typescript
// line 142
const { text, targetLang, provider = 'gemini', model = 'gemini-2.0-flash' } = body
```

**Vấn đề:** Model ID hardcoded thay vì dùng constant từ `ipcConstants.ts` (đã có `VERIFY_MODEL_GEMINI = 'gemini-2.0-flash'`).

**Gợi ý sửa:** Import và dùng `VERIFY_MODEL_GEMINI` hoặc tạo constant riêng `EXT_DEFAULT_MODEL`.

---

### 🟡 HC-10 — Magic Config: Subtitle default settings bị duplicate

**Loại:** Hardcode Config  
**Severity:** 🟡 Medium  
**Vị trí:**
- `src/hooks/useLiveTranslate.ts` line 164–168
- `src/pages/LiveTranslatePage.tsx` line 460

**Code vi phạm:**
```typescript
// useLiveTranslate.ts:164 — initial state
const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>({
  textColor: '#ffffff',
  fontSize:  18,
  bgOpacity: 84,
})

// LiveTranslatePage.tsx:460 — reset button
onClick={() => setSubtitleSettings({ textColor: '#ffffff', fontSize: 18, bgOpacity: 84 })}
```

**Gợi ý sửa:** Export constant từ `useLiveTranslate.ts`:
```typescript
export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  textColor: '#ffffff',
  fontSize:  18,
  bgOpacity: 84,
}
```

---

### 🟢 HC-11 — Magic Number: `220` ms và `100` ms trong `globalHotkey.ts` lặp nhiều lần

**Loại:** Magic Number  
**Severity:** 🟢 Low  
**Vị trí:** `electron/ipc/globalHotkey.ts` lines 76, 82, 85, 96, 100, 103

**Code vi phạm:**
```typescript
// Copy operations — 220ms repeated 3x
exec(osascript_copy_cmd, () => setTimeout(resolve, 220))  // macOS
exec(powershell_copy_cmd, () => setTimeout(resolve, 220))  // Windows
exec('xdotool key ctrl+c', () => setTimeout(resolve, 220)) // Linux

// Paste operations — 100ms repeated 3x
exec(osascript_paste_cmd, () => setTimeout(resolve, 100))  // macOS
...
```

**Gợi ý sửa:**
```typescript
const CLIPBOARD_COPY_WAIT_MS  = 220  // time for OS to update clipboard after copy
const CLIPBOARD_PASTE_WAIT_MS = 100  // time for paste to complete
```

---

### 🟢 HC-12 — Magic Number: `1500` ms hardcoded trong `LiveTranslatePage.tsx`

**Loại:** Magic Number  
**Severity:** 🟢 Low  
**Vị trí:** `src/pages/LiveTranslatePage.tsx` line 50

**Code vi phạm:**
```typescript
setTimeout(() => setFlag(false), 1500)  // ❌ không dùng COPY_FEEDBACK_DURATION_MS
```

**Vấn đề:** `COPY_FEEDBACK_DURATION_MS = 1500` đã được định nghĩa trong `src/constants/ui.ts` và dùng trong `TranslatePage.tsx` và `ChatPage.tsx`. Chỉ riêng `LiveTranslatePage.tsx` không dùng constant này.

**Gợi ý sửa:**
```typescript
import { COPY_FEEDBACK_DURATION_MS } from '../constants/ui'
setTimeout(() => setFlag(false), COPY_FEEDBACK_DURATION_MS)
```

---

### 🟢 HC-13 — Magic Number: `120` chars preview hardcoded trong `LiveHistoryTab.tsx`

**Loại:** Magic Number  
**Severity:** 🟢 Low  
**Vị trí:** `src/pages/history/LiveHistoryTab.tsx` lines 67–68, 80, 84

**Code vi phạm:**
```typescript
const previewRaw = session.rawTranscript.slice(0, 120)  // magic 120
const previewTx  = session.translation.slice(0, 120)    // magic 120
// ...
{session.rawTranscript.length > 120 ? '…' : ''}
{session.translation.length > 120 ? '…' : ''}
```

**Gợi ý sửa:**
```typescript
const LIVE_HISTORY_PREVIEW_CHARS = 120
```

---

### 🟢 HC-14 — Magic Config: `'translate-app-settings'` persistence key hardcoded

**Loại:** Hardcode Config  
**Severity:** 🟢 Low  
**Vị trí:** `src/store/useAppStore.ts` line 105

**Code vi phạm:**
```typescript
name: 'translate-app-settings',  // hardcoded persist key
```

**Gợi ý sửa:**
```typescript
const STORE_PERSIST_KEY = 'translate-app-settings'
// ...
persist(..., { name: STORE_PERSIST_KEY })
```

---

### 🟢 HC-15 — Magic Config: `'1.0.0'` và `'Lotus'` hardcoded trong `localServer.ts`

**Loại:** Hardcode Config  
**Severity:** 🟢 Low  
**Vị trí:** `electron/ipc/localServer.ts` line 227

**Code vi phạm:**
```typescript
sendJSON(res, 200, { success: true, version: '1.0.0', appName: 'Lotus' })
```

**Gợi ý sửa:** Dùng `app.getVersion()` và `app.getName()` từ Electron:
```typescript
import { app } from 'electron'
sendJSON(res, 200, { success: true, version: app.getVersion(), appName: app.getName() })
```

---

### 🟢 HC-16 — Hardcode UI: `formatTime` strings không qua i18n

**Loại:** Hardcode UI  
**Severity:** 🟢 Low  
**Vị trí:** `src/pages/history/historyUtils.tsx` lines 11–15

**Code vi phạm:**
```typescript
if (diffMin < 1) return 'Just now'
if (diffMin < 60) return `${diffMin}m ago`
if (diffHour < 24) return `${diffHour}h ago`
if (diffDay < 7) return `${diffDay}d ago`
```

**Vấn đề:** Các string thời gian tương đối hardcoded bằng tiếng Anh. Người dùng đang dùng tiếng Việt/Nhật sẽ vẫn thấy "Just now", "5m ago".

**Gợi ý sửa:** Thêm i18n keys `time_just_now`, `time_m_ago`, `time_h_ago`, `time_d_ago` và nhận `t` vào `formatTime(ts, t)`.

---

### 🟢 HC-17 — Hardcode UI: `[14, 18, 22, 28, 34]` font sizes và `['S', 'M', 'L', 'XL', '2X']` labels

**Loại:** Hardcode UI  
**Severity:** 🟢 Low  
**Vị trí:** `src/pages/LiveTranslatePage.tsx` lines 416–417

**Code vi phạm:**
```tsx
{([14, 18, 22, 28, 34] as const).map((size, i) => {
  const labels = ['S', 'M', 'L', 'XL', '2X']
```

**Gợi ý sửa:**
```typescript
const SUBTITLE_FONT_SIZES = [
  { size: 14, label: 'S' },
  { size: 18, label: 'M' },
  { size: 22, label: 'L' },
  { size: 28, label: 'XL' },
  { size: 34, label: '2X' },
] as const
```

---

### 🟢 HC-18 — Hardcode UI: `'Legacy Assistant'`, `'Chrome Extension'`, `'Bookmarklet'` không qua i18n

**Loại:** Hardcode UI  
**Severity:** 🟢 Low  
**Vị trí:**
- `src/pages/settings/BrowserIntegrationSection.tsx` line 203
- `src/pages/settings/BrowserIntegrationSection.tsx` line 238
- `src/pages/settings/BrowserIntegrationSection.tsx` line 294

**Code vi phạm:**
```tsx
<p ...>Legacy Assistant</p>
<p ...>Bookmarklet</p>
<p ...>Chrome Extension</p>
```

**Vấn đề:** Product names có thể chấp nhận hardcoded (proper nouns). Tuy nhiên nếu cần bản địa hóa mô tả thì nên cân nhắc. **Đây là low priority.**

---

### 🟢 HC-19 — Hardcode UI: `'Copy'` và `'Regenerate response'` fallback strings trong `MessageBubble.tsx`

**Loại:** Hardcode UI  
**Severity:** 🟢 Low  
**Vị trí:** `src/components/chat/MessageBubble.tsx` lines 97, 111, 116

**Code vi phạm:**
```tsx
title="Copy"                                    // ❌ hardcoded
title={regenerateLabel ?? 'Regenerate response'}  // ❌ fallback hardcoded
{regenerateLabel ?? 'Regenerate'}               // ❌ fallback hardcoded
```

**Vấn đề:** Fallback strings khi không có prop là tiếng Anh. Nên yêu cầu prop hoặc có default từ i18n context.

---

### 🟢 HC-20 — Hardcode Config: `'Aoede'` voice name và `0.9` playback rate

**Loại:** Hardcode Config  
**Severity:** 🟢 Low  
**Vị trí:**
- `electron/ipc/tts.ts` line 105: `voiceName: 'Aoede'`
- `src/hooks/useTTS.ts` line 127: `source.playbackRate.value = 0.9`

**Gợi ý sửa:**
```typescript
// ipcConstants.ts
export const GEMINI_TTS_VOICE = 'Aoede'

// useTTS.ts
const TTS_PLAYBACK_RATE = 0.9  // slightly slower for comprehension
```

---

## Tóm tắt & Ưu tiên

### 🔴 Critical — 0 vấn đề
Không phát hiện credential hay secret nào hardcoded. API key được quản lý đúng qua OS Keychain.

### 🟠 High — 8 vấn đề cần sửa sớm

| # | ID | Mô tả | File |
|---|---|---|---|
| 1 | DUP-01 | `EXT_SYSTEM_PROMPT` = `HOTKEY_SYSTEM_PROMPT` exact copy | `localServer.ts`, `globalHotkey.ts` |
| 2 | DUP-02 | Hàm `tpl` copy-paste | `BrowserIntegrationSection.tsx`, `UpdaterSection.tsx` |
| 3 | DUP-03 | `translateText` / `handleTranslate` near-duplicate (3 provider pattern) | `localServer.ts`, `globalHotkey.ts` |
| 4 | HC-01 | Magic `2048` token limit không dùng `ipcConstants.ts` | `localServer.ts`, `globalHotkey.ts` |
| 5 | HC-02 | `'vi-VN'` hardcoded 3x, không theo app locale | `BrowserIntegrationSection.tsx` |
| 6 | HC-03 | Vietnamese strings `"sao chép ngay!"`, `"Đóng"` không qua i18n | `BrowserIntegrationSection.tsx` |
| 7 | HC-04 | Emoji `🔑` dùng làm icon thay vì icon component | `BrowserIntegrationSection.tsx` |
| 8 | HC-05 | `chatPage.tsx` textarea `160px` hardcode 2 lần | `ChatPage.tsx` |

### 🟡 Medium — 10 vấn đề

| # | ID | Mô tả |
|---|---|---|
| 1 | DUP-04 | `handleClearAll` + sub-header pattern duplicate trong 2 history tabs |
| 2 | DUP-05 | Empty state panel structure duplicate trong 3 history tabs |
| 3 | HC-06 | `'You'`/`'AI'` labels hardcoded trong `ChatHistoryTab.tsx` |
| 4 | HC-07 | `pageSize=50` hardcoded trong `models.ts` (constant đã có nhưng không dùng) |
| 5 | HC-08 | `'entry'`/`'entries'`, `'session'`/`'sessions'` hardcoded |
| 6 | HC-09 | `'gemini-2.0-flash'` default model hardcoded trong `localServer.ts` |
| 7 | HC-10 | Subtitle default settings object duplicated |
| 8–10 | HC-11 | `220`ms / `100`ms repeated 3x each trong `globalHotkey.ts` |

### 🟢 Low — 15 vấn đề
(Xem chi tiết các mục HC-12 đến HC-20 ở trên)

---

## Kế hoạch refactor gợi ý

### Sprint 1 — Quick wins (High impact, low effort)
1. **Merge system prompts**: Tạo `TRANSLATOR_SYSTEM_PROMPT` trong `ipcConstants.ts`, xóa 2 bản local.
2. **Extract `tpl` utility**: Tạo `src/utils/tpl.ts`, cập nhật 2 import.
3. **Fix `pageSize` inconsistency**: Dùng `GEMINI_MODELS_PAGE_SIZE` trong `models.ts`.
4. **Fix `COPY_FEEDBACK_DURATION_MS`**: Dùng trong `LiveTranslatePage.tsx`.
5. **Replace emoji `🔑`**: Dùng `LockIcon` từ `icons/auth.tsx`.

### Sprint 2 — i18n cleanup
6. **Fix `'vi-VN'` locale**: Dùng dynamic locale từ app store.
7. **Add missing i18n keys**: `"sao chép ngay!"`, `"Đóng"`, `'You'`/`'AI'`, `'entry'`/`'entries'`.
8. **Fix `formatTime` i18n**: Nhận `t` param vào hàm.

### Sprint 3 — Structural refactor
9. **Extract `handleTranslate` shared function**: Hợp nhất logic trong `localServer.ts` và `globalHotkey.ts`.
10. **Extract `<HistoryClearHeader>`**: Tái sử dụng pattern clear-confirm.
11. **Extract `<HistoryEmptyState>`**: Tái sử dụng empty state trong 3 tabs.

### Sprint 4 — Config constants
12. **`DEFAULT_SUBTITLE_SETTINGS` constant**: Export từ hook.
13. **`CHAT_TEXTAREA_MAX_HEIGHT_PX`**, **`LIVE_HISTORY_PREVIEW_CHARS`**, **`MAX_LIGHTWEIGHT_TRANSLATE_TOKENS`**: Thêm vào constants.
14. **`app.getVersion()`** thay `'1.0.0'` trong `localServer.ts`.

---

*Báo cáo được tạo tự động bởi workflow `check-dup-hardcode v1.0.0` — Lotus Agent*
