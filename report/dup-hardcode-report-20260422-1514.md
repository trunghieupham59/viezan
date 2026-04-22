# Báo cáo Duplicate Code & Hardcode
**Ngày:** 2026-04-22 15:14  
**Phạm vi:** Toàn bộ codebase (`src/`, `electron/ipc/`)  
**Workflow:** `check-dup-hardcode` v1.0.0

---

## Tổng quan

| Chỉ số | Giá trị |
|--------|---------|
| File đã kiểm tra | ~80 file (src/, electron/ipc/) |
| Vấn đề tìm được | 15 |
| 🔴 Critical | 0 |
| 🟠 High | 5 |
| 🟡 Medium | 5 |
| 🟢 Low | 5 |
| Icon hardcode | ✅ Sạch (0 vi phạm) |

---

## Duplicate Code

### [🟠 High] Near Duplicate — LANG_NAMES map định nghĩa 2 lần

**File 1:** `src/hooks/useLiveTranslate.ts:187–193`  
**File 2:** `electron/ipc/imageTranslate.ts:153–160`

**Code (useLiveTranslate.ts):**
```ts
const LANG_NAMES: Record<string, string> = {
  vi: 'Vietnamese', en: 'English', zh: 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)', ja: 'Japanese', ko: 'Korean',
  fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', th: 'Thai', id: 'Indonesian',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', hi: 'Hindi',
}
```

**Code (imageTranslate.ts):**
```ts
const LANG_NAMES: Record<string, string> = {
  auto: 'the detected language',
  vi: 'Vietnamese', en: 'English', zh: 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese', ja: 'Japanese', ko: 'Korean',
  ...
}
```

**Vấn đề:** Cùng khái niệm "language code → English name for AI prompts" được implement 2 lần. Tên cũng khác nhau một chút (ví dụ: `'Chinese (Simplified)'` vs `'Simplified Chinese'`). Nếu thêm ngôn ngữ mới phải cập nhật cả 2 nơi.

**Sửa:** Tạo `src/constants/langNames.ts` (hoặc thêm vào `src/constants/providers.ts`) làm single source of truth. `imageTranslate.ts` có thể bổ sung entry `auto: 'the detected language'` cục bộ khi cần.

```ts
// src/constants/langNames.ts
export const LANG_NAMES_FOR_AI: Record<string, string> = {
  vi: 'Vietnamese', en: 'English', zh: 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)', ja: 'Japanese', ko: 'Korean',
  fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', th: 'Thai', id: 'Indonesian',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', hi: 'Hindi',
}
```

---

### [🟠 High] Near Duplicate — Message content mapping pattern lặp trong ChatPage

**File:** `src/pages/ChatPage.tsx`  
**Vị trí 1:** `handleRegenerate`, lines 169–176  
**Vị trí 2:** `handleSend`, lines 252–260

**Code (cả 2 đoạn giống hệt nhau):**
```ts
content: m.content.map((c) => ({
  type: c.type,
  text: c.text,
  imageBase64: c.imageBase64,
  imageMimeType: c.imageMimeType,
}))
```

**Vấn đề:** Đoạn convert `ChatMessage` → IPC format bị copy-paste giữa `handleSend` và `handleRegenerate`. Nếu IPC format thay đổi (thêm field mới) phải cập nhật 2 nơi.

**Sửa:** Trích xuất thành helper function:
```ts
// Trong ChatPage.tsx hoặc chatService.ts
function toIpcMessage(msg: ChatMessage) {
  return {
    role: msg.role,
    content: msg.content.map((c) => ({
      type: c.type,
      text: c.text,
      imageBase64: c.imageBase64,
      imageMimeType: c.imageMimeType,
    })),
  }
}
// Dùng trong handleSend:
const messages = session.messages.filter(...).map(toIpcMessage)
// Dùng trong handleRegenerate:
messages: historyMessages.map(toIpcMessage),
```

---

### [🟡 Medium] Semantic Duplicate — getApiKey wrapper thừa trong transcribe.ts

**File:** `electron/ipc/transcribe.ts:4–6`

**Code:**
```ts
function getApiKey(provider: string): string | null {
  return getStoredApiKey(provider)
}
```

**Vấn đề:** Đây là leftover từ refactor DUP-02. Tất cả IPC handler khác (`translate.ts`, `chat.ts`, `imageTranslate.ts`) đã xoá local wrapper và gọi `getStoredApiKey` trực tiếp, nhưng `transcribe.ts` chưa được clean up. Function này không thêm giá trị gì.

**Sửa:** Xoá hàm wrapper, thay `getApiKey('openai')` bằng `getStoredApiKey('openai')` tại dòng 111.

```ts
// Trước:
const apiKey = await getApiKey('openai')
// Sau:
const apiKey = await getStoredApiKey('openai')
```

---

### [🟡 Medium] Structural Duplicate — Blob-download pattern lặp 2 lần trong LiveTranslatePage

**File:** `src/pages/LiveTranslatePage.tsx`  
**Vị trí 1:** `handleExportTxt`, lines 74–96  
**Vị trí 2:** `handleExportSrt`, lines 99–131

**Code (lặp trong cả 2):**
```ts
const dateStr = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `meeting-${dateStr}.txt` // hoặc .srt
a.click()
URL.revokeObjectURL(url)
```

**Vấn đề:** Pattern tạo file download (dateStr + Blob + anchor click) giống nhau 100%, chỉ khác filename và nội dung.

**Sửa:** Trích xuất helper:
```ts
function downloadTextFile(content: string, filename: string) {
  const dateStr = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${dateStr}.${filename.endsWith('srt') ? 'srt' : 'txt'}`
  a.click()
  URL.revokeObjectURL(url)
}
```

---

## Hardcode

### [🟠 High] Magic String — Hardcoded OpenAI TTS model 'tts-1'

**File:** `electron/ipc/tts.ts:121`

**Code:**
```ts
const response = await client.audio.speech.create({
  model: 'tts-1',  // ← hardcoded
  voice,
  input: text,
  response_format: 'mp3',
})
```

**Vấn đề:** Model TTS của OpenAI được hardcode thẳng vào code. Trong khi `GEMINI_TTS_MODEL` và `ELEVENLABS_TTS_MODEL` đã có constant trong `ipcConstants.ts`, OpenAI TTS model lại bị bỏ sót. Nếu OpenAI release `tts-2` hoặc `tts-1-hd` cần cập nhật, sẽ khó tìm.

**Sửa:** Thêm constant vào `electron/ipc/ipcConstants.ts`:
```ts
/** OpenAI TTS model — standard quality, low latency. */
export const OPENAI_TTS_MODEL = 'tts-1'
```
Dùng trong `tts.ts`:
```ts
model: OPENAI_TTS_MODEL,
```

---

### [🟠 High] Magic String — Hardcoded Whisper model 'whisper-1'

**File:** `electron/ipc/transcribe.ts:147`

**Code:**
```ts
const rawResponse = await (client.audio.transcriptions.create({
  file,
  model: 'whisper-1',  // ← hardcoded
  language: whisperLang,
  response_format: 'verbose_json',
```

**Vấn đề:** Tương tự TTS, model STT không được đặt là constant. Không nhất quán với cách các model khác được quản lý trong `ipcConstants.ts`.

**Sửa:** Thêm constant vào `electron/ipc/ipcConstants.ts`:
```ts
/** OpenAI Whisper STT model. */
export const WHISPER_MODEL = 'whisper-1'
```
Dùng trong `transcribe.ts`:
```ts
model: WHISPER_MODEL,
```

---

### [🟠 High] Magic String — Model fallback IDs hardcode trong lightweightTranslate.ts

**File:** `electron/ipc/lightweightTranslate.ts:23–25`

**Code:**
```ts
const resolvedModel = model ?? (provider === 'gemini' ? 'gemini-2.0-flash'
  : provider === 'openai' ? 'gpt-4o-mini'
  : 'claude-3-5-haiku-20241022')
```

**Vấn đề:** 
- `'gemini-2.0-flash'` đã có constant `EXT_DEFAULT_GEMINI_MODEL` trong `ipcConstants.ts` nhưng không được import và dùng ở đây
- `'gpt-4o-mini'` và `'claude-3-5-haiku-20241022'` chưa có constant tương ứng
- Không nhất quán: `ipcConstants.ts` có `VERIFY_MODEL_OPENAI = 'gpt-4o-mini'` nhưng đây là model cho verify, không hẳn phù hợp dùng cho lightweight translate

**Sửa:** Thêm constant vào `ipcConstants.ts` và import:
```ts
// Thêm vào ipcConstants.ts:
export const EXT_DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
export const EXT_DEFAULT_CLAUDE_MODEL = 'claude-3-5-haiku-20241022'
```
```ts
// lightweightTranslate.ts:
import { EXT_DEFAULT_GEMINI_MODEL, EXT_DEFAULT_OPENAI_MODEL, EXT_DEFAULT_CLAUDE_MODEL } from './ipcConstants'

const resolvedModel = model ?? (
  provider === 'gemini' ? EXT_DEFAULT_GEMINI_MODEL
  : provider === 'openai' ? EXT_DEFAULT_OPENAI_MODEL
  : EXT_DEFAULT_CLAUDE_MODEL
)
```

---

### [🟡 Medium] Magic Number — Edge TTS timeout 8_000 không có constant

**File:** `electron/ipc/tts.ts:197`

**Code:**
```ts
const timeout = setTimeout(() => {
  ws.terminate()
  reject(new Error('Edge TTS: connection timeout'))
}, 8_000)  // ← magic number
```

**Vấn đề:** Các Edge TTS constants khác (`EDGE_TTS_WS_URL`, `EDGE_TTS_TRUSTED_TOKEN`, v.v.) đều có trong `ipcConstants.ts`, nhưng timeout 8 giây không được đặt tên. Không rõ tại sao là 8 giây (comment giải thích nhưng giá trị không có tên).

**Sửa:** Thêm vào `ipcConstants.ts`:
```ts
/** Safety timeout (ms) for Edge TTS WebSocket connection.
 *  8 s cho phép fail nhanh để fallback chain hoạt động kịp thời. */
export const EDGE_TTS_TIMEOUT_MS = 8_000
```

---

### [🟡 Medium] Magic Number — MAX_SUMMARIZE_SECTION_CHARS định nghĩa bên trong useCallback

**File:** `src/hooks/useLiveTranslate.ts:940`

**Code:**
```ts
const handleSummarize = useCallback(async () => {
  // ...
  const MAX_SUMMARIZE_SECTION_CHARS = 10_000  // ← defined inside callback
```

**Vấn đề:** Constant `MAX_SUMMARIZE_SECTION_CHARS` được khai báo bên trong một `useCallback` function. Kỹ thuật đây không sai (constant sẽ được inlined bởi JS engine), nhưng về mặt design:
- Không thể reference từ bên ngoài function
- Không nhất quán với các hằng số khác trong file (tất cả đều ở module level)
- Khó tìm khi cần điều chỉnh

**Sửa:** Chuyển lên module level, nhóm cùng với các constants của live translate:
```ts
// Thêm vào phần constants đầu file, sau MAX_RAW_TRANSCRIPT_CHARS:
/**
 * Maximum characters per section sent to AI for summarization.
 * Keeps the last N chars — most recent & relevant content.
 */
const MAX_SUMMARIZE_SECTION_CHARS = 10_000
```

---

### [🟡 Medium] Magic Number — Pipeline error auto-clear timer 4000ms

**File:** `src/hooks/useLiveTranslate.ts:388`

**Code:**
```ts
pipelineErrorTimerRef.current = setTimeout(() => setPipelineError(null), 4000)
```

**Vấn đề:** 4000ms hardcoded mà không có tên. Khó phân biệt với các timer khác trong file (như `CHUNK_DURATION_MS = 1500`). Cùng một file, có các constants được đặt tên cẩn thận nhưng giá trị này thì không.

**Sửa:** Thêm constant cùng nhóm:
```ts
/** How long (ms) a pipeline error toast is shown before auto-dismissing. */
const PIPELINE_ERROR_DISPLAY_MS = 4_000
```

---

### [🟡 Medium] Magic Numbers — ElevenLabs voice_settings parameters

**File:** `electron/ipc/tts.ts:379–383`

**Code:**
```ts
voice_settings: {
  stability: 0.5,           // ← magic number
  similarity_boost: 0.75,   // ← magic number
  style: 0.0,               // ← magic number
  use_speaker_boost: true,
}
```

**Vấn đề:** ElevenLabs API voice settings có 4 parameters ảnh hưởng đến chất lượng audio, tất cả đều hardcode. Không thể tune mà không biết ý nghĩa. Nên có comment hoặc constants.

**Sửa:** Thêm vào `ipcConstants.ts`:
```ts
// ElevenLabs voice quality settings
export const ELEVENLABS_STABILITY = 0.5          // balance giữa stability và variability
export const ELEVENLABS_SIMILARITY_BOOST = 0.75  // giữ đặc trưng giọng cao
export const ELEVENLABS_STYLE = 0.0              // 0 = tắt style exaggeration
```

---

### [🟢 Low] Hardcode UI — Strings tiếng Anh không qua i18n trong TtsSection.tsx

**File:** `src/pages/settings/TtsSection.tsx`

**Locations:**
- Line 37: `text: '✓ ElevenLabs key saved!'`
- Line 40: `text: \`✗ ${result.error ?? 'Failed to save'}\``
- Line 43: `text: \`✗ ${err instanceof Error ? err.message : 'Error'}\``
- Line 75: `'Edge TTS is free — always available as fallback even without any API key.'`
- Line 149: `placeholder={elKey.exists ? t.settings_key_placeholder_new : 'Paste your ElevenLabs API key…'}`
- Line 69: `{t.settings_tts_section} — Priority` (chỉ phần `— Priority` bị hardcode)

**Vấn đề:** Nhiều string tiếng Anh trong TtsSection được hardcode trực tiếp, trong khi các section khác trong Settings dùng `t.*` (i18n) hoàn toàn. Sẽ không được dịch khi người dùng chọn ngôn ngữ khác.

**Sửa:** Thêm keys vào i18n:
```ts
settings_tts_el_saved: '✓ ElevenLabs key saved!'
settings_tts_el_failed: 'Failed to save'
settings_tts_el_key_placeholder: 'Paste your ElevenLabs API key…'
settings_tts_edge_free_note: 'Edge TTS is free — always available as fallback.'
settings_tts_priority_label: 'Priority'
```

---

### [🟢 Low] Hardcode UI — Label 'Provider' không qua i18n trong SttSection.tsx

**File:** `src/pages/settings/SttSection.tsx:24`

**Code:**
```tsx
<p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-0.5">
  Provider
</p>
```

**Vấn đề:** Label "Provider" cứng tiếng Anh, không qua i18n. Cùng vị trí trong TtsSection.tsx cũng có vấn đề tương tự với `— Priority`.

**Sửa:** 
```ts
// i18n key:
settings_stt_provider_label: 'Provider'
```
```tsx
<p ...>{t.settings_stt_provider_label}</p>
```

---

### [🟢 Low] Hardcode UI — Inline style height macOS titlebar trong App.tsx

**File:** `src/App.tsx:66`

**Code:**
```tsx
<div className="titlebar-drag flex-shrink-0 w-full bg-white dark:bg-gray-900"
     style={{ height: '40px' }} />
```

**Vấn đề:** Chiều cao 40px của macOS titlebar drag region được hardcode inline. Nếu cần thay đổi (ví dụ: để support các macOS window styles khác) phải tìm trong JSX.

**Sửa:**
```ts
// Đầu file hoặc trong constants/ui.ts:
const MACOS_TITLEBAR_HEIGHT_PX = 40
```
```tsx
style={{ height: `${MACOS_TITLEBAR_HEIGHT_PX}px` }}
```

---

## Icon Check

### ✅ PASS — Không có icon hardcode vi phạm

| Kiểm tra | Kết quả |
|---------|---------|
| `<svg>` inline ngoài `src/components/ui/icons/` | ✅ Không có (0 kết quả) |
| Import từ `lucide-react`, `react-icons`, `@heroicons` | ✅ Không có (0 kết quả) |
| Emoji dùng làm icon trong JSX | ✅ Các emoji (`🟡`, `🟣`, `🟢`) chỉ nằm trong data constants (`providers.ts`), không render trong icon context |
| Icon registry (`src/components/ui/icons/`) | ✅ Đầy đủ: actions, navigation, media, status, auth, files, providers |

Tất cả icon trong toàn bộ codebase đều được quản lý qua `src/components/ui/icons/index.ts`. ✅

---

## Tóm tắt & Ưu tiên

| Loại vấn đề | 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|-------------|------------|--------|----------|-------|------|
| Exact Duplicate | 0 | 0 | 0 | 0 | 0 |
| Near Duplicate | 0 | 2 | 0 | 0 | 2 |
| Structural Duplicate | 0 | 0 | 1 | 0 | 1 |
| Semantic Duplicate | 0 | 0 | 1 | 0 | 1 |
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Magic Number | 0 | 0 | 4 | 1 | 5 |
| Magic String | 0 | 3 | 0 | 0 | 3 |
| Hardcode Config | 0 | 0 | 0 | 0 | 0 |
| Hardcode UI | 0 | 0 | 0 | 4 | 4 |
| Hardcode Icon | 0 | 0 | 0 | 0 | **0 ✅** |
| **Tổng** | **0** | **5** | **6** | **5** | **16** |

**Nhận xét tổng thể:**
- 🎉 **Không có vấn đề Critical** — Không tìm thấy credential hardcode, không có API key/secret/password trong code
- 🎉 **Icon hoàn toàn sạch** — Registry pattern đã được implement tốt, toàn bộ SVG trong icon registry
- ✅ **Constants đã được setup tốt** — `ipcConstants.ts`, `src/constants/` có hệ thống tốt, chỉ còn một số model IDs chưa được đưa vào
- ⚠️ **Main pain point**: Một số model IDs (`tts-1`, `whisper-1`) và fallback models trong `lightweightTranslate.ts` chưa được đặt constant
- ⚠️ **TtsSection.tsx**: Nhiều nhất string không qua i18n — section này có vẻ được thêm vội sau khi i18n system đã có

---

## Kế hoạch refactor gợi ý

### Ưu tiên 1 — Sửa ngay (High, ~1 giờ)

**P1a: Thêm model constants còn thiếu vào ipcConstants.ts**
```ts
export const OPENAI_TTS_MODEL = 'tts-1'
export const WHISPER_MODEL = 'whisper-1'
export const EXT_DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
export const EXT_DEFAULT_CLAUDE_MODEL = 'claude-3-5-haiku-20241022'
export const EDGE_TTS_TIMEOUT_MS = 8_000
```
Import và dùng trong `tts.ts`, `transcribe.ts`, `lightweightTranslate.ts`.

**P1b: Trích xuất toIpcMessage helper trong ChatPage.tsx**
```ts
function toIpcMessage(msg: ChatMessage) { ... }
```
Dùng trong cả `handleSend` và `handleRegenerate`.

### Ưu tiên 2 — Sửa trong sprint tới (Medium, ~2 giờ)

**P2a: Xoá getApiKey wrapper thừa trong transcribe.ts**  
1 dòng code, không risk.

**P2b: Tạo src/constants/langNames.ts**  
Consolidate `LANG_NAMES` từ `useLiveTranslate.ts` và `imageTranslate.ts`. Note: `imageTranslate.ts` là Electron main process, cần shared via copying hoặc tạo một JSON file chung.

**P2c: Chuyển MAX_SUMMARIZE_SECTION_CHARS lên module level**  
Move từ trong `handleSummarize` callback ra ngoài.

**P2d: Thêm ELEVENLABS voice settings constants**  
Thêm `ELEVENLABS_STABILITY`, `ELEVENLABS_SIMILARITY_BOOST`, `ELEVENLABS_STYLE` vào ipcConstants.

**P2e: Trích xuất downloadTextFile helper trong LiveTranslatePage.tsx**  
Giảm 30 dòng code trùng lặp.

### Ưu tiên 3 — Nice-to-have (Low, ~1 giờ)

**P3a: i18n cho TtsSection.tsx**  
Thêm ~6 keys mới vào tất cả locale files.

**P3b: i18n cho SttSection.tsx 'Provider' label**

**P3c: MACOS_TITLEBAR_HEIGHT_PX constant trong App.tsx**

---

*Báo cáo được tạo tự động bởi workflow `check-dup-hardcode` v1.0.0*
