# Fix Prompts — dup-hardcode
**Dựa theo:** `lotus-agent/report/dup-hardcode-report-20260417-2255.md`  
**Mục đích:** Copy-paste từng prompt vào AI để fix theo thứ tự ưu tiên  
**Thứ tự:** Sprint 1 (High) → Sprint 2 (i18n) → Sprint 3 (Structural) → Sprint 4 (Low)

---

## Prompt 1 — 🟠 High: DUP-01 — Merge 2 system prompt constants trùng nhau

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần DUP-01.

Vấn đề: EXT_SYSTEM_PROMPT trong electron/ipc/localServer.ts (line 131) và HOTKEY_SYSTEM_PROMPT trong electron/ipc/globalHotkey.ts (line 111) có nội dung hoàn toàn giống nhau.

Thực hiện:

BƯỚC 1 — Thêm constant vào ipcConstants.ts:
- Mở electron/ipc/ipcConstants.ts
- Thêm vào cuối file:

  /** Shared system prompt cho các lightweight translation calls (bookmarklet, global hotkey).
   *  Khác với SYSTEM_PROMPT trong translate.ts — bản đó có cultural nuance rules phức tạp hơn. */
  export const LIGHTWEIGHT_TRANSLATOR_PROMPT =
    'You are an expert translator. Translate accurately and naturally. ' +
    'Output ONLY the translation — no notes, no alternatives, no explanations.'

BƯỚC 2 — Cập nhật localServer.ts:
- Thêm LIGHTWEIGHT_TRANSLATOR_PROMPT vào import từ './ipcConstants'
- Xóa const EXT_SYSTEM_PROMPT (line 131-133)
- Thay tất cả reference EXT_SYSTEM_PROMPT bằng LIGHTWEIGHT_TRANSLATOR_PROMPT

BƯỚC 3 — Cập nhật globalHotkey.ts:
- Thêm LIGHTWEIGHT_TRANSLATOR_PROMPT vào import từ './ipcConstants'
- Xóa const HOTKEY_SYSTEM_PROMPT (line 111-113)
- Thay tất cả reference HOTKEY_SYSTEM_PROMPT bằng LIGHTWEIGHT_TRANSLATOR_PROMPT

Không thay đổi logic khác. Kiểm tra TypeScript compile sau khi xong.
```

---

## Prompt 2 — 🟠 High: DUP-02 — Extract hàm `tpl` thành shared utility

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần DUP-02.

Vấn đề: Hàm tpl() bị copy-paste ở 2 file:
- src/pages/settings/BrowserIntegrationSection.tsx line 13-14
- src/pages/settings/UpdaterSection.tsx line 13-14

Thực hiện:

BƯỚC 1 — Tạo file src/utils/tpl.ts:
  /**
   * Simple template helper — replaces {key} placeholders with values.
   * Usage: tpl('Hello {name}!', { name: 'World' }) → 'Hello World!'
   */
  export function tpl(str: string, vars: Record<string, string | number>): string {
    return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
  }

BƯỚC 2 — Cập nhật BrowserIntegrationSection.tsx:
- Xóa dòng: const tpl = (str: string, vars: Record<string, string | number>) => str.replace(...)
- Thêm import: import { tpl } from '../../utils/tpl'

BƯỚC 3 — Cập nhật UpdaterSection.tsx:
- Xóa dòng: const tpl = (str: string, vars: Record<string, string | number>) => str.replace(...)
- Thêm import: import { tpl } from '../../utils/tpl'

Không thay đổi logic khác. Kiểm tra TypeScript compile.
```

---

## Prompt 3 — 🟠 High: HC-01 — Fix magic `2048` + HC-09 — Fix default model hardcode

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-01 và HC-09.

Thực hiện:

BƯỚC 1 — Thêm constant vào electron/ipc/ipcConstants.ts:
  /** HC-01: Max output tokens cho lightweight translation calls (global hotkey, bookmarklet extension).
   *  Nhỏ hơn MAX_CHAT_OUTPUT_TOKENS (4096) vì các call này cần nhanh, output ngắn. */
  export const MAX_LIGHTWEIGHT_TRANSLATE_TOKENS = 2_048

  /** HC-09: Default Gemini model cho local server extension endpoint. */
  export const EXT_DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

BƯỚC 2 — Cập nhật electron/ipc/localServer.ts:
- Thêm MAX_LIGHTWEIGHT_TRANSLATE_TOKENS và EXT_DEFAULT_GEMINI_MODEL vào import từ './ipcConstants'
- Thay tất cả max_completion_tokens: 2048 → max_completion_tokens: MAX_LIGHTWEIGHT_TRANSLATE_TOKENS
- Thay tất cả max_tokens: 2048 → max_tokens: MAX_LIGHTWEIGHT_TRANSLATE_TOKENS
- Thay model = 'gemini-2.0-flash' (line 142) → model = EXT_DEFAULT_GEMINI_MODEL

BƯỚC 3 — Cập nhật electron/ipc/globalHotkey.ts:
- Thêm MAX_LIGHTWEIGHT_TRANSLATE_TOKENS vào import từ './ipcConstants'
- Thay tất cả max_completion_tokens: 2048 → max_completion_tokens: MAX_LIGHTWEIGHT_TRANSLATE_TOKENS
- Thay tất cả max_tokens: 2048 → max_tokens: MAX_LIGHTWEIGHT_TRANSLATE_TOKENS

Không thay đổi logic khác. Kiểm tra TypeScript compile.
```

---

## Prompt 4 — 🟠 High: HC-02 — Fix `'vi-VN'` locale hardcoded trong BrowserIntegrationSection

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-02.

Vấn đề: 'vi-VN' hardcoded 3 lần trong BrowserIntegrationSection.tsx (line 95, 392, 440). User đang dùng app tiếng Anh vẫn thấy date format kiểu Việt Nam.

Thực hiện:

BƯỚC 1 — Thêm helper vào src/utils/tpl.ts (đã tạo ở Prompt 2):
  import type { AppLocale } from '../i18n'

  /** Map app locale → browser locale string cho toLocaleDateString */
  const LOCALE_TO_BCP47: Record<string, string> = {
    vi: 'vi-VN', en: 'en-US', ja: 'ja-JP',
  }

  /** Format date theo app locale hiện tại */
  export function formatDate(ts: number, locale: AppLocale): string {
    const bcp47 = LOCALE_TO_BCP47[locale] ?? 'en-US'
    return new Date(ts).toLocaleDateString(bcp47, { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

BƯỚC 2 — Cập nhật BrowserIntegrationSection.tsx:
- Thêm import: import { tpl, formatDate } from '../../utils/tpl'
- Thêm vào store destructure: const { targetLang, locale } = useAppStore()
- Thay line 95:
  Cũ: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  Mới: formatDate(Date.now(), locale)

- Thay line 392:
  Cũ: new Date(revealedToken.expiresAt).toLocaleDateString('vi-VN', { ... })
  Mới: formatDate(revealedToken.expiresAt, locale)

- Thay line 440:
  Cũ: new Date(tk.expiresAt).toLocaleDateString('vi-VN', { ... })
  Mới: formatDate(tk.expiresAt, locale)

Không thay đổi UI hiện tại. Kiểm tra TypeScript compile.
```

---

## Prompt 5 — 🟠 High: HC-03 — Fix Vietnamese strings hardcode trong BrowserIntegrationSection

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-03.

Vấn đề: Có 3 string tiếng Việt hardcoded trong BrowserIntegrationSection.tsx không qua i18n:
- Line 360: 'Token "{revealedToken.name}" — sao chép ngay!'
- Line 369: title="Đóng"
- Line 402: title="Đóng"

Thực hiện:

BƯỚC 1 — Thêm i18n keys vào tất cả locale files (src/i18n/locales/):
Kiểm tra cấu trúc các file locale hiện có, sau đó thêm vào mỗi file:

  en.ts:
    settings_token_reveal_title: 'Token "{name}" — copy it now!',
    settings_token_close: 'Close',

  vi.ts:
    settings_token_reveal_title: 'Token "{name}" — sao chép ngay!',
    settings_token_close: 'Đóng',

  ja.ts (nếu có):
    settings_token_reveal_title: 'Token "{name}" — コピーしてください！',
    settings_token_close: '閉じる',

  (Thêm cho tất cả locale file có trong src/i18n/locales/)

BƯỚC 2 — Thêm vào type định nghĩa (src/i18n/types.ts hoặc tương tự):
  settings_token_reveal_title: string
  settings_token_close: string

BƯỚC 3 — Cập nhật BrowserIntegrationSection.tsx:
- Import tpl từ '../../utils/tpl' (đã có)
- Line 360: Thay 'Token "{revealedToken.name}" — sao chép ngay!'
  bằng: {tpl(t.settings_token_reveal_title, { name: revealedToken.name })}
- Line 369: Thay title="Đóng" bằng title={t.settings_token_close}
- Line 402: Thay title="Đóng" bằng title={t.settings_token_close}

Không thay đổi layout. Kiểm tra TypeScript compile.
```

---

## Prompt 6 — 🟠 High: HC-04 — Thay emoji `🔑` + HC-05 — Fix `160px` textarea constant

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-04 và HC-05.

PHẦN A — HC-04: Thay emoji 🔑 bằng icon component

1. Mở src/components/ui/icons/auth.tsx
   Kiểm tra xem đã có KeyIcon chưa. Nếu chưa có, thêm:
   
   export function KeyIcon({ className }: IconProps) {
     return (
       <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
         <circle cx="7.5" cy="15.5" r="5.5" />
         <path d="M21 2l-9.6 9.6" />
         <path d="M15.5 7.5l3 3L22 7l-3-3" />
       </svg>
     )
   }
   
   Thêm KeyIcon vào export trong src/components/ui/icons/index.ts (nếu file dùng explicit exports).

2. Cập nhật BrowserIntegrationSection.tsx:
   - Thêm KeyIcon vào import từ '../../components/ui/icons'
   - Line 357: Thay <span className="text-amber-500 text-sm flex-shrink-0">🔑</span>
     bằng: <KeyIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />

PHẦN B — HC-05: Fix magic 160px trong ChatPage.tsx

1. Mở src/pages/ChatPage.tsx
2. Thêm vào đầu file (sau imports):
   /** Max height (px) của textarea input — giới hạn scroll khi text dài */
   const CHAT_TEXTAREA_MAX_HEIGHT_PX = 160

3. Line 88: Thay Math.min(el.scrollHeight, 160) → Math.min(el.scrollHeight, CHAT_TEXTAREA_MAX_HEIGHT_PX)
4. Line 563: Thay style={{ maxHeight: '160px', ... }} → style={{ maxHeight: `${CHAT_TEXTAREA_MAX_HEIGHT_PX}px`, ... }}

Không thay đổi behavior. Kiểm tra TypeScript compile.
```

---

## Prompt 7 — 🟡 Medium: HC-06 + HC-08 — Fix hardcode labels trong History tabs

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-06 và HC-08.

Thực hiện:

BƯỚC 1 — Fix HC-06: 'You'/'AI' trong ChatHistoryTab.tsx (line 90)

Thêm vào locale files (src/i18n/locales/):
  en.ts: history_chat_role_user: 'You', history_chat_role_ai: 'AI',
  vi.ts: history_chat_role_user: 'Bạn', history_chat_role_ai: 'AI',
  ja.ts: history_chat_role_user: 'あなた', history_chat_role_ai: 'AI',
  (Thêm cho tất cả locales)

Thêm vào types.ts: history_chat_role_user: string, history_chat_role_ai: string

Cập nhật ChatHistoryTab.tsx:
  Thêm const t = useT() nếu chưa có (kiểm tra — có thể đã có)
  Line 90: Thay {msg.role === 'user' ? 'You' : 'AI'}
  bằng: {msg.role === 'user' ? t.history_chat_role_user : t.history_chat_role_ai}

BƯỚC 2 — Fix HC-08: 'entry'/'entries' và 'session'/'sessions'

Thêm vào locale files:
  en.ts: history_translate_count: '{n} entries', history_live_count: '{n} sessions',
  vi.ts: history_translate_count: '{n} mục', history_live_count: '{n} phiên',
  ja.ts: history_translate_count: '{n} 件', history_live_count: '{n} セッション',

Thêm vào types.ts: history_translate_count: string, history_live_count: string

Cập nhật TranslationHistoryTab.tsx (line 38):
  Import tpl từ '../../utils/tpl'
  Thay: {history.length} {history.length === 1 ? 'entry' : 'entries'}
  bằng: {tpl(t.history_translate_count, { n: history.length })}

Cập nhật LiveHistoryTab.tsx (line 35):
  Import tpl từ '../../utils/tpl'
  Thay: {liveSessions.length} {liveSessions.length === 1 ? 'session' : 'sessions'}
  bằng: {tpl(t.history_live_count, { n: liveSessions.length })}

Kiểm tra TypeScript compile.
```

---

## Prompt 8 — 🟡 Medium: HC-07 + HC-10 — Fix pageSize inconsistency + Subtitle default settings

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-07 và HC-10.

PHẦN A — HC-07: Fix pageSize=50 trong models.ts

Mở electron/ipc/models.ts:
- Thêm GEMINI_MODELS_PAGE_SIZE vào import từ './ipcConstants'
- Line 99: Thay `&pageSize=50` bằng `&pageSize=${GEMINI_MODELS_PAGE_SIZE}`

Chỉ 1 dòng thay đổi.

PHẦN B — HC-10: Tách subtitle default settings thành constant

1. Mở src/hooks/useLiveTranslate.ts:
   - Thêm export constant trước function useLiveTranslate:
   
     /** Default subtitle appearance settings — also used by reset button in LiveTranslatePage */
     export const DEFAULT_SUBTITLE_SETTINGS = {
       textColor: '#ffffff',
       fontSize:  18,
       bgOpacity: 84,
     } as const satisfies SubtitleSettings
   
   - Thay useState init (line 164-168):
     Cũ: useState<SubtitleSettings>({ textColor: '#ffffff', fontSize: 18, bgOpacity: 84 })
     Mới: useState<SubtitleSettings>({ ...DEFAULT_SUBTITLE_SETTINGS })

2. Mở src/pages/LiveTranslatePage.tsx:
   - Import DEFAULT_SUBTITLE_SETTINGS từ '../hooks/useLiveTranslate'
   - Line 460 (reset button onClick):
     Cũ: setSubtitleSettings({ textColor: '#ffffff', fontSize: 18, bgOpacity: 84 })
     Mới: setSubtitleSettings({ ...DEFAULT_SUBTITLE_SETTINGS })

Kiểm tra TypeScript compile.
```

---

## Prompt 9 — 🟡 Medium: DUP-03 — Extract shared lightweight translate function

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần DUP-03.

Vấn đề: Hàm handleTranslate trong localServer.ts (line 135-185) và translateText trong globalHotkey.ts (line 119-163) implement cùng per-provider translation pattern.

Thực hiện:

BƯỚC 1 — Tạo file electron/ipc/lightweightTranslate.ts:

  import { getStoredApiKey } from './storage'
  import { LIGHTWEIGHT_TRANSLATOR_PROMPT, MAX_LIGHTWEIGHT_TRANSLATE_TOKENS } from './ipcConstants'

  export interface LightweightTranslateParams {
    text: string
    targetLang: string
    provider?: string
    model?: string
  }

  /**
   * Lightweight translation — dùng cho global hotkey và browser extension.
   * Không có chunking, style, furigana — chỉ dịch nhanh.
   */
  export async function lightweightTranslate({
    text,
    targetLang,
    provider = 'gemini',
    model,
  }: LightweightTranslateParams): Promise<{ success: boolean; translatedText?: string; error?: string }> {
    if (!text?.trim()) return { success: false, error: 'Text is empty' }
    
    const resolvedModel = model ?? (provider === 'gemini' ? 'gemini-2.0-flash'
      : provider === 'openai' ? 'gpt-4o-mini'
      : 'claude-3-5-haiku-20241022')
    
    const apiKey = await getStoredApiKey(provider)
    if (!apiKey) return { success: false, error: `No API key configured for ${provider}` }
    
    const prompt = `Translate into ${targetLang}. Tone: neutral. Output only the translation.\n\n${text}`

    try {
      if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai')
        const genAI = new GoogleGenerativeAI(apiKey)
        const genModel = genAI.getGenerativeModel({ model: resolvedModel, systemInstruction: LIGHTWEIGHT_TRANSLATOR_PROMPT })
        const result = await genModel.generateContent(prompt)
        return { success: true, translatedText: result.response.text().trim() }
      }
      if (provider === 'openai') {
        const OpenAI = (await import('openai')).default
        const client = new OpenAI({ apiKey })
        const completion = await client.chat.completions.create({
          model: resolvedModel,
          messages: [{ role: 'system', content: LIGHTWEIGHT_TRANSLATOR_PROMPT }, { role: 'user', content: prompt }],
          max_completion_tokens: MAX_LIGHTWEIGHT_TRANSLATE_TOKENS,
        })
        return { success: true, translatedText: (completion.choices[0]?.message?.content ?? '').trim() }
      }
      if (provider === 'claude') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const client = new Anthropic({ apiKey })
        const msg = await client.messages.create({
          model: resolvedModel,
          max_tokens: MAX_LIGHTWEIGHT_TRANSLATE_TOKENS,
          system: LIGHTWEIGHT_TRANSLATOR_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        })
        const block = msg.content[0]
        if (block.type === 'text') return { success: true, translatedText: block.text.trim() }
        return { success: false, error: 'Unexpected response from Claude' }
      }
      return { success: false, error: `Unknown provider: ${provider}` }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

BƯỚC 2 — Cập nhật localServer.ts:
- Import lightweightTranslate từ './lightweightTranslate'
- Xóa hàm handleTranslate cũ (line 135-185)
- Xóa const EXT_SYSTEM_PROMPT (đã xóa ở Prompt 1)
- Thay gọi handleTranslate(JSON.parse(...)) bằng lightweightTranslate(JSON.parse(...))

BƯỚC 3 — Cập nhật globalHotkey.ts:
- Import lightweightTranslate từ './lightweightTranslate'
- Xóa hàm translateText cũ (line 119-163)
- Xóa const HOTKEY_SYSTEM_PROMPT (đã xóa ở Prompt 1)
- Thay `const translated = await translateText(selectedText, currentSettings)`
  bằng:
  const result = await lightweightTranslate({
    text: selectedText,
    targetLang: settings.targetLang,
    provider: settings.provider,
    model: settings.model,
  })
  if (!result.success || !result.translatedText) throw new Error(result.error ?? 'Translation failed')
  const translated = result.translatedText

Kiểm tra TypeScript compile sau khi xong.
```

---

## Prompt 10 — 🟡 Medium: DUP-04 + DUP-05 — Extract HistoryClearHeader + HistoryEmptyState

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần DUP-04 và DUP-05.

Thực hiện:

BƯỚC 1 — Thêm 2 shared components vào src/pages/history/historyUtils.tsx:

// === HistoryClearHeader ===
interface HistoryClearHeaderProps {
  count: number
  countLabel: string       // ví dụ: "5 mục" hay "3 phiên"
  confirmClear: boolean
  labelClear: string       // t.history_clear_all
  labelConfirm: string     // t.history_clear_confirm
  onClear: () => void
  onBlur: () => void
}

export function HistoryClearHeader({
  countLabel, confirmClear, labelClear, labelConfirm, onClear, onBlur,
}: HistoryClearHeaderProps) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2
                    bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <span className="text-xs text-gray-400">{countLabel}</span>
      <button
        type="button"
        onClick={onClear}
        onBlur={onBlur}
        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-150 ${
          confirmClear
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
        }`}
      >
        {confirmClear ? labelConfirm : labelClear}
      </button>
    </div>
  )
}

// === HistoryEmptyState ===
interface HistoryEmptyStateProps {
  icon: React.ReactNode
  title: string
  desc: string
}

export function HistoryEmptyState({ icon, title, desc }: HistoryEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">{desc}</p>
      </div>
    </div>
  )
}

BƯỚC 2 — Cập nhật TranslationHistoryTab.tsx:
- Import HistoryClearHeader, HistoryEmptyState từ './historyUtils'
- Thay sub-header block (line 35-53) bằng:
  <HistoryClearHeader
    countLabel={tpl(t.history_translate_count, { n: history.length })}
    confirmClear={confirmClear}
    labelClear={t.history_clear_all}
    labelConfirm={t.history_clear_confirm}
    onClear={handleClearAll}
    onBlur={() => setTimeout(() => setConfirmClear(false), 200)}
  />
- Thay empty state block (line 56-65) bằng:
  <HistoryEmptyState
    icon={<ClockIcon className="w-7 h-7 text-gray-300 dark:text-gray-600" />}
    title={t.history_empty}
    desc={t.history_empty_desc}
  />

BƯỚC 3 — Cập nhật LiveHistoryTab.tsx:
- Import HistoryClearHeader, HistoryEmptyState từ './historyUtils'
- Tương tự: thay sub-header và empty state bằng 2 components mới

BƯỚC 4 — Cập nhật ChatHistoryTab.tsx:
- Import HistoryEmptyState từ './historyUtils'
- Thay empty state block bằng:
  <HistoryEmptyState
    icon={<ChatBubbleIcon className="w-7 h-7 text-gray-300 dark:text-gray-600" />}
    title={t.history_chat_empty}
    desc={t.history_chat_empty_desc}
  />

Kiểm tra TypeScript compile.
```

---

## Prompt 11 — 🟢 Low: HC-11 + HC-12 — Fix timing constants

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-11 và HC-12.

PHẦN A — HC-11: Named timing constants trong globalHotkey.ts

Mở electron/ipc/globalHotkey.ts:
Thêm vào đầu file (sau imports):

  /** Thời gian chờ sau khi gửi Cmd+C để OS cập nhật clipboard (ms) */
  const CLIPBOARD_COPY_WAIT_MS  = 220
  /** Thời gian chờ sau khi gửi Cmd+V để paste hoàn thành (ms) */
  const CLIPBOARD_PASTE_WAIT_MS = 100
  /** Thời gian trước khi restore clipboard sau khi paste (ms) */
  const CLIPBOARD_RESTORE_WAIT_MS = 1_500

Thay các setTimeout hardcoded:
- 3 chỗ setTimeout(resolve, 220) → setTimeout(resolve, CLIPBOARD_COPY_WAIT_MS)
- 3 chỗ setTimeout(resolve, 100) → setTimeout(resolve, CLIPBOARD_PASTE_WAIT_MS)
- Line 207 setTimeout(..., 1500) → setTimeout(..., CLIPBOARD_RESTORE_WAIT_MS)

PHẦN B — HC-12: Dùng COPY_FEEDBACK_DURATION_MS trong LiveTranslatePage.tsx

Mở src/pages/LiveTranslatePage.tsx:
- Thêm import: import { COPY_FEEDBACK_DURATION_MS } from '../constants/ui'
- Line 50: Thay setTimeout(() => setFlag(false), 1500)
  bằng: setTimeout(() => setFlag(false), COPY_FEEDBACK_DURATION_MS)

Không thay đổi behavior. Kiểm tra TypeScript compile.
```

---

## Prompt 12 — 🟢 Low: HC-13 + HC-14 + HC-15 — Fix magic numbers & config

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-13, HC-14, HC-15.

PHẦN A — HC-13: Named constant cho preview chars trong LiveHistoryTab.tsx

Mở src/pages/history/LiveHistoryTab.tsx:
Thêm vào đầu file:
  /** Số ký tự preview hiển thị trong danh sách live session history */
  const LIVE_HISTORY_PREVIEW_CHARS = 120

Thay tất cả hardcode 120:
  session.rawTranscript.slice(0, 120) → session.rawTranscript.slice(0, LIVE_HISTORY_PREVIEW_CHARS)
  session.translation.slice(0, 120)   → session.translation.slice(0, LIVE_HISTORY_PREVIEW_CHARS)
  session.rawTranscript.length > 120  → session.rawTranscript.length > LIVE_HISTORY_PREVIEW_CHARS
  session.translation.length > 120    → session.translation.length > LIVE_HISTORY_PREVIEW_CHARS

PHẦN B — HC-14: Named constant cho persist key trong useAppStore.ts

Mở src/store/useAppStore.ts:
Thêm trước useAppStore:
  /** Zustand persist storage key — đổi giá trị này nếu cần reset toàn bộ persisted state */
  const STORE_PERSIST_KEY = 'translate-app-settings'

Thay: name: 'translate-app-settings' → name: STORE_PERSIST_KEY

PHẦN C — HC-15: Dùng app.getVersion() thay '1.0.0' trong localServer.ts

Mở electron/ipc/localServer.ts:
- app đã được import từ 'electron' ở line 21 — không cần thêm import
- Line 227: Thay:
  sendJSON(res, 200, { success: true, version: '1.0.0', appName: 'Lotus' })
  bằng:
  sendJSON(res, 200, { success: true, version: app.getVersion(), appName: app.getName() })

Kiểm tra TypeScript compile.
```

---

## Prompt 13 — 🟢 Low: HC-16 + HC-17 — i18n formatTime + subtitle font size constant

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-16 và HC-17.

PHẦN A — HC-17: Named constant cho subtitle font sizes (dễ hơn, làm trước)

Mở src/pages/LiveTranslatePage.tsx:
Thêm constant (nên đặt gần DEFAULT_SUBTITLE_SETTINGS hoặc đầu component):

  const SUBTITLE_FONT_SIZES = [
    { size: 14 as const, label: 'S' },
    { size: 18 as const, label: 'M' },
    { size: 22 as const, label: 'L' },
    { size: 28 as const, label: 'XL' },
    { size: 34 as const, label: '2X' },
  ]

Thay block hiện tại (line 416-434):
  Cũ: {([14, 18, 22, 28, 34] as const).map((size, i) => { const labels = ['S', 'M', 'L', 'XL', '2X'] ...
  Mới: {SUBTITLE_FONT_SIZES.map(({ size, label }) => (
         <button key={size} type="button"
           onClick={() => setSubtitleSettings(s => ({ ...s, fontSize: size }))}
           className={[...].join(' ')}
         >{label}</button>
       ))}

PHẦN B — HC-16: i18n cho formatTime trong historyUtils.tsx

Thêm vào locale files:
  en.ts: time_just_now: 'Just now', time_m_ago: '{n}m ago', time_h_ago: '{n}h ago', time_d_ago: '{n}d ago',
  vi.ts: time_just_now: 'Vừa xong', time_m_ago: '{n} phút trước', time_h_ago: '{n}h trước', time_d_ago: '{n} ngày trước',
  ja.ts: time_just_now: 'たった今', time_m_ago: '{n}分前', time_h_ago: '{n}時間前', time_d_ago: '{n}日前',

Thêm vào types.ts: time_just_now: string, time_m_ago: string, time_h_ago: string, time_d_ago: string

Cập nhật src/pages/history/historyUtils.tsx:
- Cập nhật signature: export function formatTime(ts: number, t: { time_just_now: string; time_m_ago: string; time_h_ago: string; time_d_ago: string }): string
- Thay các return string:
  'Just now' → t.time_just_now
  `${diffMin}m ago` → tpl(t.time_m_ago, { n: diffMin })
  `${diffHour}h ago` → tpl(t.time_h_ago, { n: diffHour })
  `${diffDay}d ago` → tpl(t.time_d_ago, { n: diffDay })
- Import tpl từ '../../utils/tpl'

Cập nhật tất cả callers của formatTime để truyền t:
- TranslationHistoryTab.tsx: formatTime(item.timestamp, t)
- ChatHistoryTab.tsx: formatTime(session.updatedAt, t)
- LiveHistoryTab.tsx: formatTime(session.createdAt, t)

Kiểm tra TypeScript compile.
```

---

## Prompt 14 — 🟢 Low: HC-19 + HC-20 — Fix fallback strings + named config constants

```
Đọc file lotus-agent/report/dup-hardcode-report-20260417-2255.md phần HC-19 và HC-20.

PHẦN A — HC-19: Fix fallback strings trong MessageBubble.tsx

Mở src/components/chat/MessageBubble.tsx:
- Interface MessageBubbleProps đã có regenerateLabel?: string — chỉ cần đảm bảo copyLabel cũng là prop

Thêm vào interface:
  copyLabel?: string    // title cho copy button

Cập nhật button copy (line 94-103):
  Thay title="Copy" bằng title={copyLabel ?? 'Copy'}

Cập nhật ChatPage.tsx nơi render MessageBubble:
  Thêm copyLabel={t.translate_copy} (key này đã có sẵn)

Với regenerateLabel: đã được pass từ ChatPage, chỉ cần đảm bảo không có hardcode fallback trong render.
  Line 116: {regenerateLabel ?? 'Regenerate'} → {regenerateLabel}
  (Bỏ fallback vì prop luôn được truyền từ ChatPage)

PHẦN B — HC-20: Named constants cho Gemini TTS voice và playback rate

1. Thêm vào electron/ipc/ipcConstants.ts:
   /** Tên preset voice dùng cho Gemini TTS. Xem: https://ai.google.dev/gemini-api/docs/speech */
   export const GEMINI_TTS_VOICE_NAME = 'Aoede'

2. Cập nhật electron/ipc/tts.ts:
   - Thêm GEMINI_TTS_VOICE_NAME vào import từ './ipcConstants'
   - Line 105: Thay voiceName: 'Aoede' → voiceName: GEMINI_TTS_VOICE_NAME

3. Mở src/hooks/useTTS.ts:
   Thêm vào đầu file (sau imports):
   /** Tốc độ phát audio TTS — thấp hơn 1.0 để dễ nghe hơn */
   const TTS_PLAYBACK_RATE = 0.9

   Line 127: Thay source.playbackRate.value = 0.9 → source.playbackRate.value = TTS_PLAYBACK_RATE

Kiểm tra TypeScript compile.
```

---

## Thứ tự thực hiện gợi ý

| Prompt | ID | Effort | Impact | Ghi chú |
|---|---|---|---|---|
| **1** | DUP-01 | S | High | Merge 2 system prompts trùng nhau |
| **2** | DUP-02 | S | High | Extract tpl utility (cần trước Prompt 4, 5, 7) |
| **3** | HC-01, HC-09 | S | High | Fix magic 2048 token limit |
| **4** | HC-02 | M | High | Fix vi-VN locale (cần Prompt 2 xong trước) |
| **5** | HC-03 | M | High | Fix Vietnamese strings không qua i18n |
| **6** | HC-04, HC-05 | S | High | Thay emoji 🔑, fix 160px textarea |
| **7** | HC-06, HC-08 | M | Medium | Fix hardcode labels trong history tabs |
| **8** | HC-07, HC-10 | S | Medium | pageSize inconsistency + subtitle defaults |
| **9** | DUP-03 | L | Medium | Extract shared translate function |
| **10** | DUP-04, DUP-05 | L | Medium | Extract HistoryClearHeader + HistoryEmptyState |
| **11** | HC-11, HC-12 | S | Low | Timing constants |
| **12** | HC-13, HC-14, HC-15 | S | Low | Misc magic numbers/config |
| **13** | HC-16, HC-17 | M | Low | i18n formatTime, subtitle font sizes |
| **14** | HC-19, HC-20 | S | Low | Fallback strings + Gemini TTS constants |

*S=Small (<1h), M=Medium (1-2h), L=Large (2-4h)*

---

*Fix prompts được tạo theo báo cáo `dup-hardcode-report-20260417-2255.md` — Lotus Agent*
