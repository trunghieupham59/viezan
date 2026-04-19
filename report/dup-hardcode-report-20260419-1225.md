# Báo cáo Duplicate Code & Hardcode
**Ngày:** 19/04/2026 12:25  
**Phạm vi:** Toàn bộ project (`src/` + `electron/`)  
**Workflow:** check-dup-hardcode v1.0.0

---

## Tổng quan

| Loại vấn đề | Critical | High | Medium | Low | Tổng |
|---|---|---|---|---|---|
| Exact Duplicate | 0 | 0 | 1 | 0 | 1 |
| Near Duplicate | 0 | 1 | 2 | 0 | 3 |
| Structural Duplicate | 0 | 0 | 1 | 1 | 2 |
| Semantic Duplicate | 0 | 0 | 0 | 0 | 0 |
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Magic Number | 0 | 0 | 3 | 2 | 5 |
| Magic String | 0 | 0 | 4 | 2 | 6 |
| Hardcode Config | 0 | 0 | 1 | 1 | 2 |
| Hardcode UI | 0 | 0 | 3 | 1 | 4 |
| Hardcode Icon | 0 | 1 | 1 | 0 | 2 |
| **Tổng** | **0** | **2** | **16** | **7** | **25** |

> ✅ Không có **Critical** issue (credential, large exact duplicate).  
> ✅ Không có API key / token / password hardcode trong source code.  
> ✅ Nhiều HC/DUP đã được fix trong lần refactor trước (HC-01 đến HC-11, DUP-01 đến DUP-07).

---

## Duplicate Code

### 🟠 DUP-NEW-01 — Near Duplicate: `renderInline()` tồn tại ở 2 file

**Severity:** 🟠 High  
**Loại:** Near Duplicate (Type-2 clone — logic giống hệt, một số comment khác nhau)

**Vị trí:**
- `src/components/MarkdownEditor.tsx` — lines 17–37
- `src/components/MarkdownText.tsx` — lines 12–46

**Code trích dẫn (MarkdownEditor.tsx):**
```tsx
function renderInline(raw: string): React.ReactNode[] {
  const result: React.ReactNode[] = []
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(_(.+?)_)|(`(.+?)`)/g
  let last = 0
  let match: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional
  while ((match = pattern.exec(raw)) !== null) {
    if (match.index > last) result.push(raw.slice(last, match.index))
    if (match[1]) result.push(<strong key={match.index}>{match[2]}</strong>)
    else if (match[3]) result.push(<em key={match.index}>{match[4]}</em>)
    else if (match[5]) result.push(<em key={match.index}>{match[6]}</em>)
    else if (match[7]) result.push(
      <code key={match.index} className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[0.85em] font-mono text-gray-800 dark:text-gray-200">
        {match[8]}
      </code>
    )
    last = match.index + match[0].length
  }
  if (last < raw.length) result.push(raw.slice(last))
  return result
}
```

**Giải thích:** Hai function `renderInline` có regex pattern, loop logic, và JSX output giống hệt nhau. Khác biệt duy nhất là MarkdownText.tsx có thêm comment inline. Nếu thay đổi styling `<code>` hay thêm pattern mới (strikethrough, link), phải sửa 2 nơi.

**Gợi ý refactor:**
```tsx
// src/utils/markdownInline.tsx
export function renderInline(raw: string): React.ReactNode[] {
  // ... single implementation
}

// Cả MarkdownEditor và MarkdownText import từ đây:
import { renderInline } from '../../utils/markdownInline'
```

---

### 🟡 DUP-NEW-02 — Near Duplicate: Image preview thumbnail trong `ChatPage.tsx` vs `ImageAttachmentPreview.tsx`

**Severity:** 🟡 Medium  
**Loại:** Near Duplicate (Type-2 — cùng JSX structure, khác prop names)

**Vị trí:**
- `src/pages/ChatPage.tsx` — lines 464–484
- `src/components/translate/ImageAttachmentPreview.tsx` — lines 20–43

**Code trích dẫn (ChatPage.tsx lines 464-484):**
```tsx
{attachedImage && (
  <div className="px-4 pt-4 pb-1 flex items-start">
    <div className="relative group">
      <img
        src={attachedImage.previewUrl}
        alt={attachedImage.fileName}
        className="w-32 h-32 object-cover rounded-3xl shadow-sm
                   border border-gray-200 dark:border-gray-700"
      />
      <button
        type="button"
        onClick={() => setAttachedImage(null)}
        title={t.chat_remove_image}
        className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center
                   rounded-full bg-gray-700/90 hover:bg-gray-900 text-white cursor-pointer shadow-md
                   opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
)}
```

**Giải thích:** `ImageAttachmentPreview` đã được tách ra để dùng trong TranslatePage, nhưng ChatPage vẫn inlining cùng JSX pattern. Khác biệt: ChatPage dùng `previewUrl` còn ImageAttachmentPreview dùng `previewDataUrl` (naming inconsistency); ChatPage không có `z-10` trên button.

**Gợi ý sửa:**
```tsx
// ChatPage.tsx — thay inline JSX bằng component
{attachedImage && (
  <ChatImagePreview
    previewUrl={attachedImage.previewUrl}
    fileName={attachedImage.fileName}
    removeTitle={t.chat_remove_image}
    onRemove={() => setAttachedImage(null)}
  />
)}
```
Hoặc mở rộng `ImageAttachmentPreview` để accept thêm shape từ ChatPage (chuẩn hóa `previewUrl` vs `previewDataUrl`).

---

### 🟡 DUP-NEW-03 — Structural Duplicate: Per-provider verify/detect/chat functions trong `translate.ts`

**Severity:** 🟡 Medium  
**Loại:** Structural Duplicate (Type-3 — cùng pattern, khác SDK)

**Vị trí:**
- `electron/ipc/translate.ts` — `verifyGeminiKey`, `verifyClaudeKey`, `verifyOpenAIKey` (lines 410–439)
- `electron/ipc/translate.ts` — `detectWithGemini`, `detectWithClaude`, `detectWithOpenAI` (lines 485–521)

**Giải thích:** Đây là **justified structural duplicate** — mỗi provider có SDK khác nhau (GoogleGenerativeAI, Anthropic, OpenAI) nên không thể abstract thêm mà không mất type safety. Code đã comment rõ: *"Per-provider implementations are kept separate because each SDK has a fundamentally different API surface"*. Đã có registry pattern (`DETECT_PROVIDERS`, `TRANSLATE_PROVIDERS`, `CHAT_PROVIDERS`) để dispatch. **Không cần refactor thêm.**

---

### 🟢 DUP-NEW-04 — Structural Duplicate: `badge()` function inline trong `ApiKeyInput.tsx`

**Severity:** 🟢 Low  
**Loại:** Structural Duplicate (inline function, 33 dòng)

**Vị trí:** `src/components/ApiKeyInput.tsx` — lines 82–115

**Giải thích:** Function `badge()` trả về JSX có 3 nhánh (error/success/idle). Được gọi 1 lần (`{badge()}`). Vì nó truy cập `isError`, `isSuccess`, `hasKey`, và i18n keys từ closure, nó là inline sub-component hơn là duplicate. Tuy nhiên, nếu pattern badge này được tái dùng ở component khác trong tương lai, nên extract thành `<ApiKeyStatusBadge>`.

---

## Hardcode

### 🟠 HC-NEW-01 — Hardcode Icon: SVG inline trong `ProviderIcon.tsx`

**Severity:** 🟠 High  
**Loại:** Hardcode Icon

**Vị trí:**
- `src/components/ProviderIcon.tsx` — lines 13–38 (GeminiIcon)
- `src/components/ProviderIcon.tsx` — lines 46–65 (ClaudeIcon)
- `src/components/ProviderIcon.tsx` — lines 72–107 (OpenAIIcon)

**Code trích dẫn:**
```tsx
function GeminiIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" ...>
      <path d="M12 2C12.3 5.5..." fill="#1A73E8" />
      ...
    </svg>
  )
}
```

**Giải thích:** `ProviderIcon.tsx` là nơi tập trung icon cho các AI provider — đây là **justified** (provider-specific branding icons), nhưng theo workflow quy định, tất cả SVG cần được quản lý qua `src/components/ui/icons/`. Cần di chuyển 3 icons này vào `src/components/ui/icons/` trong một category mới (`providers`) hoặc `auth`.

**Gợi ý:**
```
src/components/ui/icons/providers.tsx  ← GeminiIcon, ClaudeIcon, OpenAIIcon
src/components/ui/icons/index.ts       ← export * from './providers'
```
Sau đó `ProviderIcon.tsx` import từ `./ui/icons`.

---

### 🟡 HC-NEW-02 — Hardcode Icon: Inline SVG `<rect>` trong `VoiceRecorder.tsx`

**Severity:** 🟡 Medium  
**Loại:** Hardcode Icon

**Vị trí:** `src/components/VoiceRecorder.tsx` — line 355

**Code trích dẫn:**
```tsx
{/* Stop square — rect-based design kept intentionally (distinct from path-based StopIcon) */}
<svg className="w-3.5 h-3.5 relative z-10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <rect x="6" y="6" width="12" height="12" rx="2" />
</svg>
```

**Giải thích:** Comment giải thích lý do giữ inline (khác StopIcon), nhưng theo quy tắc icon registry, nên extract thành `StopSquareIcon` trong `src/components/ui/icons/media.tsx`.

**Gợi ý:**
```tsx
// src/components/ui/icons/media.tsx
export function StopSquareIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

// VoiceRecorder.tsx
import { StopSquareIcon } from './ui/icons'
// ...
<StopSquareIcon className="w-3.5 h-3.5 relative z-10" />
```

---

### 🟡 HC-NEW-03 — Hardcode UI: Placeholder text không qua i18n trong `ApiKeyInput.tsx`

**Severity:** 🟡 Medium  
**Loại:** Hardcode UI / Magic String

**Vị trí:** `src/components/ApiKeyInput.tsx` — line 157

**Code trích dẫn:**
```tsx
placeholder={hasKey ? 'Enter new key to replace…' : `Paste your ${provider.name} API key…`}
```

**Giải thích:** Chuỗi placeholder hardcoded tiếng Anh không qua i18n system. Khi app đổi ngôn ngữ (vi/ja), placeholder vẫn hiện tiếng Anh.

**Gợi ý sửa:**
```tsx
// src/i18n/locales/*.ts — thêm:
settings_key_placeholder_new: 'Enter new key to replace…',
settings_key_placeholder_paste: 'Paste your {name} API key…',

// ApiKeyInput.tsx
placeholder={hasKey ? t.settings_key_placeholder_new : tpl(t.settings_key_placeholder_paste, { name: provider.name })}
```

---

### 🟡 HC-NEW-04 — Hardcode UI: Strings tiếng Anh không qua i18n trong `SystemPromptDropdown.tsx`

**Severity:** 🟡 Medium  
**Loại:** Hardcode UI / Magic String

**Vị trí:** `src/components/chat/SystemPromptDropdown.tsx` — lines 103–104

**Code trích dẫn:**
```tsx
<span className="font-medium">None</span>
<p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No system prompt</p>
```

**Gợi ý sửa:**
```tsx
// i18n: chat_system_prompt_none: 'None', chat_system_prompt_none_desc: 'No system prompt'
<span className="font-medium">{t.chat_system_prompt_none}</span>
<p ...>{t.chat_system_prompt_none_desc}</p>
```

---

### 🟡 HC-NEW-05 — Hardcode UI: Error message hardcoded trong `VoiceRecorder.tsx`

**Severity:** 🟡 Medium  
**Loại:** Hardcode UI / Magic String

**Vị trí:** `src/components/VoiceRecorder.tsx` — line 379

**Code trích dẫn:**
```tsx
{errorMsg === 'network' ? 'Speech API unavailable' : errorMsg}
```

**Gợi ý:**
```tsx
// i18n: voice_error_network: 'Speech API unavailable'
{errorMsg === 'network' ? t.voice_error_network : errorMsg}
```

---

### 🟡 HC-NEW-06 — Hardcode Config: Label "Chrome Extension" không qua i18n

**Severity:** 🟡 Medium  
**Loại:** Hardcode UI / Config

**Vị trí:** `src/pages/settings/BrowserIntegrationSection.tsx` — line 167

**Code trích dẫn:**
```tsx
{/* TODO: H-8 — move to i18n key (settings_chrome_extension_label) */}
<p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Chrome Extension</p>
```

**Giải thích:** Đã có TODO comment nhắc fix nhưng chưa làm.

**Gợi ý:** Thêm key `settings_chrome_extension_label: 'Chrome Extension'` vào tất cả locale files.

---

### 🟡 HC-NEW-07 — Hardcode Config: `SCREEN_RECORDING_PREFS` URL nên ở `constants/urls.ts`

**Severity:** 🟡 Medium  
**Loại:** Hardcode Config

**Vị trí:** `src/pages/LiveTranslatePage.tsx` — line 25

**Code trích dẫn:**
```tsx
const SCREEN_RECORDING_PREFS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
```

**Giải thích:** URL system preferences này nên được đặt trong `src/constants/urls.ts` cùng với `GITHUB_RELEASES_URL` để quản lý tập trung.

**Gợi ý:**
```tsx
// src/constants/urls.ts
export const MACOS_SCREEN_RECORDING_PREFS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

// LiveTranslatePage.tsx
import { MACOS_SCREEN_RECORDING_PREFS } from '../constants/urls'
```

---

### 🟡 HC-NEW-08 — Magic Number: Window kích thước cứng trong `electron/main.ts`

**Severity:** 🟡 Medium  
**Loại:** Magic Number

**Vị trí:** `electron/main.ts` — lines 29–30, 101–102, 108

**Code trích dẫn:**
```ts
width: 1200, height: 700, minWidth: 780, minHeight: 520,
// ...
const winW = 620
const winH = 100
// ...
y: Math.round(workAreaSize.height - winH - 40),
```

**Giải thích:** `40` là khoảng cách từ bottom taskbar — magic number. `winW/winH` đã là local const nhưng `40` thì không.

**Gợi ý:**
```ts
const SUBTITLE_BOTTOM_MARGIN = 40  // px above taskbar
```

---

### 🟡 HC-NEW-09 — Magic Number: `max_tokens: 10` inline trong verify handlers

**Severity:** 🟡 Medium  
**Loại:** Magic Number

**Vị trí:**
- `electron/ipc/translate.ts` — lines 423, 428 (verifyClaudeKey, verifyOpenAIKey: `max_tokens: 10`)

**Code trích dẫn:**
```ts
const message = await client.messages.create({
  model: VERIFY_MODEL_CLAUDE,
  max_tokens: 10,    // ← magic number
  messages: [...]
})
```

**Giải thích:** `10` là max tokens cho verify call. Đã có hằng số cho verify models (`VERIFY_MODEL_CLAUDE`, `VERIFY_MODEL_OPENAI`) nhưng token limit thì chưa.

**Gợi ý:**
```ts
// ipcConstants.ts
/** Minimum tokens needed for key verification responses ("ok" = 1 token) */
export const VERIFY_MAX_TOKENS = 10
```

---

### 🟢 HC-NEW-10 — Hardcode UI: Provider names hardcoded trong `AboutSection.tsx`

**Severity:** 🟢 Low  
**Loại:** Hardcode UI

**Vị trí:** `src/pages/settings/AboutSection.tsx` — lines 24–26

**Code trích dẫn:**
```tsx
<p className="text-xs text-gray-400">Google Gemini</p>
<p className="text-xs text-gray-400">Anthropic Claude</p>
<p className="text-xs text-gray-400">OpenAI GPT</p>
```

**Giải thích:** Provider names đã được define trong `PROVIDERS` constant. AboutSection nên dùng `PROVIDERS.map(p => p.name)` thay vì hardcode.

**Gợi ý:**
```tsx
import { PROVIDERS } from '../../constants/providers'
// ...
{PROVIDERS.map((p) => (
  <p key={p.id} className="text-xs text-gray-400">{p.name}</p>
))}
```

---

### 🟢 HC-NEW-11 — Magic Number: `backgroundColor: '#1a1a2e'` trong `electron/main.ts`

**Severity:** 🟢 Low  
**Loại:** Magic Number / Magic String

**Vị trí:** `electron/main.ts` — line 36

**Code trích dẫn:**
```ts
backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#ffffff',
```

**Giải thích:** `#1a1a2e` là màu nền dark mode — nên define thành named constant.

**Gợi ý:**
```ts
const DARK_BG_COLOR  = '#1a1a2e'
const LIGHT_BG_COLOR = '#ffffff'
backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_BG_COLOR : LIGHT_BG_COLOR,
```

---

## Tóm tắt & Ưu tiên

### 🟠 High Priority — Cần fix sớm

| # | Vấn đề | File | Action |
|---|---|---|---|
| 1 | **DUP-NEW-01** `renderInline` duplicate | MarkdownEditor + MarkdownText | Extract sang `utils/markdownInline.tsx` |
| 2 | **HC-NEW-01** SVG inline Provider icons | ProviderIcon.tsx | Di chuyển sang `icons/providers.tsx` |

### 🟡 Medium Priority — Fix trong sprint tiếp theo

| # | Vấn đề | File | Action |
|---|---|---|---|
| 3 | DUP-NEW-02 Image preview duplicate | ChatPage.tsx | Dùng `ImageAttachmentPreview` |
| 4 | HC-NEW-02 SVG stop square inline | VoiceRecorder.tsx | Tạo `StopSquareIcon` trong icons/media |
| 5 | HC-NEW-03 Placeholder không i18n | ApiKeyInput.tsx | Thêm i18n keys |
| 6 | HC-NEW-04 "None" strings không i18n | SystemPromptDropdown.tsx | Thêm i18n keys |
| 7 | HC-NEW-05 Error message hardcoded | VoiceRecorder.tsx | Dùng `t.voice_error_network` |
| 8 | HC-NEW-06 "Chrome Extension" label | BrowserIntegrationSection.tsx | Resolve TODO H-8 |
| 9 | HC-NEW-07 SCREEN_RECORDING_PREFS | LiveTranslatePage.tsx | Move sang `constants/urls.ts` |
| 10 | HC-NEW-08 Magic `40` bottom margin | electron/main.ts | Thêm `SUBTITLE_BOTTOM_MARGIN` constant |
| 11 | HC-NEW-09 `max_tokens: 10` verify | electron/ipc/translate.ts | Thêm `VERIFY_MAX_TOKENS` |

### 🟢 Low Priority

| # | Vấn đề | File | Action |
|---|---|---|---|
| 12 | HC-NEW-10 Provider names hardcoded | AboutSection.tsx | Dùng `PROVIDERS.map` |
| 13 | HC-NEW-11 `'#1a1a2e'` magic color | electron/main.ts | Named constants |

---

## Kế hoạch refactor gợi ý

### Sprint 1 — Extract renderInline (1–2h)
```
1. Tạo src/utils/markdownInline.tsx
   - Move renderInline() từ MarkdownText.tsx vào đây
   - Export: export function renderInline(raw: string): React.ReactNode[]
2. Update MarkdownText.tsx: import { renderInline } from '../../utils/markdownInline'
3. Update MarkdownEditor.tsx: import { renderInline } from '../../utils/markdownInline'
4. Chạy tests: npm test
```

### Sprint 2 — Icon registry hoàn thiện (2–3h)
```
1. Tạo src/components/ui/icons/providers.tsx
   - Copy GeminiIcon, ClaudeIcon, OpenAIIcon từ ProviderIcon.tsx
   - Rename thành GeminiProviderIcon, ClaudeProviderIcon, OpenAIProviderIcon
2. Export qua src/components/ui/icons/index.ts
3. Update ProviderIcon.tsx import từ icons/providers
4. Tạo StopSquareIcon trong src/components/ui/icons/media.tsx
5. Update VoiceRecorder.tsx import StopSquareIcon
```

### Sprint 3 — i18n cleanup (1h)
```
Thêm các keys vào src/i18n/locales/en.ts, vi.ts, ja.ts:
- settings_key_placeholder_new
- settings_key_placeholder_paste  
- chat_system_prompt_none
- chat_system_prompt_none_desc
- voice_error_network
- settings_chrome_extension_label (resolve TODO H-8)
```

### Sprint 4 — Constants cleanup (30 min)
```
1. constants/urls.ts ← MACOS_SCREEN_RECORDING_PREFS
2. electron/ipc/ipcConstants.ts ← VERIFY_MAX_TOKENS, SUBTITLE_BOTTOM_MARGIN
3. electron/main.ts ← DARK_BG_COLOR, LIGHT_BG_COLOR
4. AboutSection.tsx ← dùng PROVIDERS.map()
```
