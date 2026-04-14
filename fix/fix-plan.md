# 🛠️ Kế Hoạch Fix — Tăng Điểm Từ 70 → 93/100

> **Dựa trên:** `lotus-agent/fix/score-code-report.md`  
> **Mục tiêu:** 70 → 93 điểm (+23 điểm)  
> **Nguyên tắc:** Ưu tiên theo ROI = điểm tăng / effort bỏ ra

---

## 📈 Mục Tiêu Điểm Sau Fix

| Tiêu chí     | Hiện tại | Mục tiêu | Tăng | Effort |
|--------------|:--------:|:--------:|:----:|--------|
| Correctness  | 20/25    | 24/25    | +4   | 🟡 Trung bình (1-2h) |
| Architecture | 12/15    | 14/15    | +2   | 🟡 Trung bình (2h) |
| Code Quality | 11/15    | 14/15    | +3   | 🟡 Trung bình (2-3h) |
| Maintainability | 11/15 | 14/15   | +3   | 🟡 Trung bình (2-3h) |
| Testing      | 0/10     | 8/10     | +8   | 🔴 Cao (5-7h) |
| Performance  | 8/10     | 9/10     | +1   | 🟢 Thấp (15 phút) |
| Security     | 4/5      | 5/5      | +1   | 🟢 Thấp (30 phút) |
| Documentation| 4/5      | 5/5      | +1   | 🟢 Thấp (15 phút) |
| **TỔNG**     | **70**   | **93**   | **+23** | |

---

## 🗓️ Lộ Trình Thực Hiện (3 Phase)

```
Phase 1 — Quick Wins (1-2h): +7 điểm   [Performance, Security, Documentation, Correctness một phần]
Phase 2 — Code Cleanup (4-5h): +8 điểm [Code Quality, Architecture, Maintainability, Correctness còn lại]
Phase 3 — Testing (5-7h): +8 điểm      [Vitest setup + test cho pure functions + store]
```

---

## ⚡ Phase 1 — Quick Wins (+7 điểm, ~2 giờ)

### TASK-01 · Performance +1 · `LiveTranslatePage.tsx` · 15 phút

**Vấn đề:** `fullRawForSummaryRef.current` tăng không giới hạn cho sessions dài.

**Fix:**
```typescript
// Thêm constant
const MAX_RAW_TRANSCRIPT_CHARS = 50_000  // ~10-15 phút nói chuyện

// Trong processChunk, dòng cập nhật fullRawForSummaryRef:
// TRƯỚC:
fullRawForSummaryRef.current = fullRawForSummaryRef.current
  ? `${fullRawForSummaryRef.current} ${newText}`
  : newText

// SAU:
const updated = fullRawForSummaryRef.current
  ? `${fullRawForSummaryRef.current} ${newText}`
  : newText
// Giữ 50k ký tự cuối — đủ context cho AI summarize
fullRawForSummaryRef.current = updated.length > MAX_RAW_TRANSCRIPT_CHARS
  ? updated.slice(-MAX_RAW_TRANSCRIPT_CHARS)
  : updated
```

**Điểm tăng:** Performance 8 → 9

---

### TASK-02 · Security +1 · `TranslatePage.tsx` + `ChatPage.tsx` · 30 phút

**Vấn đề:** Không validate độ dài input trước khi gửi API.

**Fix — Thêm constant và warning UI:**

**`src/constants/providers.ts`** — thêm:
```typescript
/** Giới hạn ký tự tối đa cho input dịch — vừa tránh chi phí cao vừa tránh timeout */
export const MAX_INPUT_CHARS = 5000
```

**`src/pages/TranslatePage.tsx`** — thêm warning khi vượt giới hạn:
```typescript
// Thêm vào JSX phần source panel bottom bar, cạnh charCount
{charCount > MAX_INPUT_CHARS && (
  <span className="text-xs text-amber-500 font-medium">
    ⚠ {charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()} ký tự
  </span>
)}
```

**`src/pages/ChatPage.tsx`** — thêm constant và disable send khi quá dài:
```typescript
const MAX_CHAT_INPUT_CHARS = 3000
// Trong send button disabled condition:
disabled={(!inputText.trim() && !attachedImage) || isSending || !hasKey || inputText.length > MAX_CHAT_INPUT_CHARS}
```

**Điểm tăng:** Security 4 → 5

---

### TASK-03 · Documentation +1 · Tạo `CONTRIBUTING.md` · 15 phút

**Tạo file `/CONTRIBUTING.md`:**

```markdown
# Contributing to Lotus Translate

## Development Setup
1. Fork & clone repository
2. `npm install`
3. `npm run rebuild`
4. `npm run dev`

## Project Structure
- `electron/` — Main process (Node.js/IPC handlers)
- `src/` — Renderer process (React)
- `src/pages/` — Full-page components
- `src/components/` — Reusable UI components
- `src/hooks/` — Custom React hooks
- `src/store/` — Zustand global state
- `src/constants/` — Config & static data
- `src/i18n/` — UI translations (EN/VI/JA)

## Adding a New AI Provider
1. Add provider config to `src/constants/providers.ts`
2. Implement IPC handler in `electron/ipc/`
3. Add types to `src/types/index.ts`
4. Update `keyStatus` initial state in `useAppStore.ts`

## Adding a New UI Language
1. Add locale code to `AppLocale` type in `src/i18n/index.ts`
2. Add translation object to `TRANSLATIONS`
3. Add locale name to `LOCALE_NAMES`
4. Add to `SUPPORTED_LOCALES` in `App.tsx` and `SettingsPage.tsx`

## Code Style
- Formatter: Biome (`npm run lint`)
- TypeScript strict mode enabled
- No `any` unless strictly necessary (add comment explaining why)

## Commit Convention
`type(scope): message`
- `feat(translate): add rewrite button`
- `fix(live): limit transcript buffer size`
- `refactor(store): split into slices`
- `test(utils): add hallucination filter tests`
```

**Điểm tăng:** Documentation 4 → 5

---

### TASK-04 · Correctness +2 · Nhiều files · 45 phút

#### 4a. Fix catch rỗng trong `SettingsPage.tsx`

**TRƯỚC** (3 chỗ: handleCreateToken, handleDeleteToken, handleRegenerateToken):
```typescript
} catch { /* ignore */ }
```

**SAU** (thêm error state):
```typescript
// Thêm state ở đầu component (cạnh các state khác)
const [tokenActionError, setTokenActionError] = useState<string>('')

// Trong handleCreateToken:
} catch (e) {
  setTokenActionError(e instanceof Error ? e.message : 'Không thể tạo token. Vui lòng thử lại.')
} finally { setCreating(false) }

// Trong handleDeleteToken:
} catch (e) {
  setTokenActionError(e instanceof Error ? e.message : 'Không thể xóa token.')
} finally { setDeletingId(null) }

// Trong handleRegenerateToken:
} catch (e) {
  setTokenActionError(e instanceof Error ? e.message : 'Không thể cấp phát lại token.')
} finally { setRegeneratingId(null) }

// Thêm vào JSX (cạnh token list):
{tokenActionError && (
  <p className="text-xs text-red-500 px-1">{tokenActionError}</p>
)}
```

#### 4b. Fix `detectSystemLocale()` duplicate

**Tạo `src/utils/locale.ts`:**
```typescript
import type { AppLocale } from '../i18n'

export const SUPPORTED_LOCALES: AppLocale[] = ['en', 'vi', 'ja']

export function detectSystemLocale(): AppLocale {
  const lang = (navigator.language || 'en').split('-')[0]
  return SUPPORTED_LOCALES.includes(lang as AppLocale) ? (lang as AppLocale) : 'en'
}
```

**Cập nhật `App.tsx`** và **`SettingsPage.tsx`**: xóa khai báo local, import từ utils:
```typescript
import { detectSystemLocale, SUPPORTED_LOCALES } from '../utils/locale'
```

#### 4c. Fix `setCopiedId` trong `ChatPage.tsx`

**TRƯỚC:**
```typescript
setCopiedId(text.slice(0, 20))
```

**SAU** — dùng timestamp làm unique ID:
```typescript
const copiedKey = `${Date.now()}`
setCopiedId(copiedKey)
setTimeout(() => setCopiedId(null), 1500)
// ... và thay check `copiedId` thành so sánh theo cách khác, hoặc đơn giản dùng boolean:
```

Hoặc đơn giản hơn, đổi type state:
```typescript
const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)

// Trong MessageBubble, truyền message.id thay vì text:
onCopy={(id) => { navigator.clipboard.writeText(text).catch(() => {}); setCopiedMsgId(id); setTimeout(() => setCopiedMsgId(null), 1500) }}

// Hiển thị checkmark khi copiedMsgId === message.id
```

**Điểm tăng:** Correctness 20 → 22

---

## 🧹 Phase 2 — Code Cleanup (+8 điểm, ~4-5 giờ)

### TASK-05 · Code Quality +2 · Tạo `Spinner` component · 30 phút

**Tạo `src/components/ui/SpinnerIcon.tsx`:**
```typescript
interface SpinnerIconProps {
  className?: string  // ví dụ: 'w-3.5 h-3.5' hoặc 'w-5 h-5'
}

export function SpinnerIcon({ className = 'w-4 h-4' }: SpinnerIconProps) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
```

**Thay thế trong:** `TranslatePage.tsx`, `ChatPage.tsx`, `SettingsPage.tsx`, `VoiceRecorder.tsx`, `LiveTranslatePage.tsx` — tổng khoảng 12+ chỗ.

**Điểm tăng:** Code Quality 11 → 12 (DRY, ít lặp code)

---

### TASK-06 · Code Quality +1 · Maintainability +1 · Magic strings → i18n · 45 phút

**`src/i18n/index.ts`** — thêm keys:
```typescript
// Extension / Token section
ext_error_no_connection: 'Không thể kết nối — đảm bảo app đang chạy qua Electron.',
ext_error_load_tokens: 'Không thể tải danh sách token.',
ext_error_create_token: 'Không thể tạo token. Vui lòng thử lại.',
ext_error_delete_token: 'Không thể xóa token.',
ext_error_regen_token: 'Không thể cấp phát lại token.',
```

**`SettingsPage.tsx`** — thay thế hard-coded strings:
```typescript
// TRƯỚC:
setExtTokensError('Không thể kết nối — đảm bảo app đang chạy qua Electron.')
// SAU:
setExtTokensError(t.ext_error_no_connection)
```

**Thêm tương tự cho tiếng Anh và Nhật** trong `src/i18n/index.ts`.

**Điểm tăng:** Code Quality +1, Maintainability +1

---

### TASK-07 · Architecture +1 · Maintainability +1 · Extract canvas utils · 20 phút

**Tạo `src/utils/canvas.ts`** — move 2 functions từ `TranslatePage.tsx`:
```typescript
import type { ImageTextRegion } from '../types'

/**
 * Split `text` into lines that fit within `maxWidth` pixels on the given ctx.
 * CJK characters are split per-character (no word boundaries).
 */
export function canvasWrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] { /* ... same implementation ... */ }

/**
 * Draw translated-text overlays onto a canvas.
 * Each region is filled with opaque background, then text is rendered with wrapping.
 */
export function renderTranslatedRegions(
  ctx: CanvasRenderingContext2D,
  regions: ImageTextRegion[],
  cw: number,
  ch: number,
): void { /* ... same implementation ... */ }
```

**`TranslatePage.tsx`** — xóa 2 functions trên, thêm import:
```typescript
import { canvasWrapText, renderTranslatedRegions } from '../utils/canvas'
```

**Điểm tăng:** Architecture +1 (tổ chức đúng chỗ), Maintainability +1 (dễ test)

---

### TASK-08 · Architecture +1 · Code Quality +1 · Tách SettingsPage sections · 2-3 giờ

Tách `SettingsPage.tsx` (1555 dòng) thành các sub-components. Mỗi file chứa 1 section độc lập:

**Tạo `src/pages/settings/` directory:**

```
src/pages/settings/
├── ApiKeysSection.tsx        (~120 dòng) — API key inputs
├── PreferencesSection.tsx    (~180 dòng) — locale, font, furigana, auto-translate
├── TtsSection.tsx            (~80 dòng)  — TTS voice selector
├── HotkeySection.tsx         (~180 dòng) — global hotkey recorder + status
├── ExtensionSection.tsx      (~350 dòng) — legacy assistant + chrome extension tokens
└── UpdaterSection.tsx        (~120 dòng) — app version + auto-update
```

**`SettingsPage.tsx`** sau khi refactor còn ~200 dòng:
```typescript
export function SettingsPage() {
  const store = useAppStore()
  const t = useT()

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-gray-950">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        <Header t={t} />
        <SecurityNotice t={t} />
        <ApiKeysSection t={t} />
        <PreferencesSection t={t} />
        <TtsSection t={t} />
        <HotkeySection t={t} />
        <ExtensionSection t={t} />
        <UpdaterSection t={t} />
      </div>
    </div>
  )
}
```

**Điểm tăng:** Architecture +1, Code Quality +1 (file size reduction)

---

### TASK-09 · Maintainability +1 · Comment `initRef` pattern · 30 phút

**`src/pages/TranslatePage.tsx`** — thêm comment giải thích pattern:
```typescript
// ── Skip-first-render refs ─────────────────────────────────────────────────
// Pattern: các effect dưới đây cần re-translate khi style/lang/model thay đổi,
// nhưng KHÔNG chạy khi component mount lần đầu (tránh double-translate).
// Mỗi initRef bắt đầu là false → effect đầu tiên set true và return sớm.
// Sau đó mọi lần trigger tiếp theo đều chạy handleTranslate thông qua stable ref.
const styleInitRef = useRef(false)  // guard cho effect translationStyle
const langInitRef  = useRef(false)  // guard cho effect targetLang/sourceLang
const modelInitRef = useRef(false)  // guard cho effect selectedProvider/selectedModels

// Stable ref cho handleTranslate — tránh stale closure trong debounce effects
// mà không cần thêm handleTranslate vào dependency array (sẽ gây loop vô hạn
// vì handleTranslate thay đổi khi isTranslating flip true→false sau mỗi lần dịch).
const handleTranslateRef = useRef(handleTranslate)
handleTranslateRef.current = handleTranslate
```

Thêm magic values thành named constants:
```typescript
// Trên đầu file hoặc trong constants/
const TEXTAREA_MAX_HEIGHT_PX = 160
const IMAGE_JPEG_QUALITY = 0.85
const EXT_LOCAL_SERVER_PORT = 39875
```

**Điểm tăng:** Maintainability +1

---

### TASK-10 · Correctness +2 · Fix `handleOpenLive` · 20 phút

**Vấn đề:** `handleOpenLive` trong `LiveHistoryTab` không navigate đến đúng session.

**Cần thêm vào store** (`useAppStore.ts`) — state `activeSessionForReview`:
```typescript
// Hoặc đơn giản hơn — không cần store, vì LiveTranslatePage không có "review mode":
// Fix: bỏ tham số _session, hiển thị tooltip/note cho user biết đây chỉ mở Live page mới
const handleOpenLive = () => {
  setActivePage('live')
  // Note: Live page không hỗ trợ replay session — chỉ mở để bắt đầu session mới
}
```

Hoặc nếu muốn đúng hoàn toàn — thêm state vào store:
```typescript
// useAppStore.ts — thêm:
reviewingLiveSession: LiveSession | null
setReviewingLiveSession: (session: LiveSession | null) => void

// LiveHistoryTab:
const handleOpenLive = (session: LiveSession) => {
  setReviewingLiveSession(session)
  setActivePage('live')
}

// LiveTranslatePage — đầu file:
const reviewingSession = useAppStore(s => s.reviewingLiveSession)
// Nếu có reviewingSession → hiển thị readonly transcript thay vì recording UI
```

**Điểm tăng:** Correctness 22 → 24

---

## 🧪 Phase 3 — Testing (+8 điểm, ~5-7 giờ)

### TASK-11 · Testing 0 → 8 · Setup Vitest + Tests

#### Bước 1: Setup Vitest (30 phút)

**`package.json`** — thêm devDependencies:
```json
"@vitest/ui": "^1.6.0",
"@testing-library/react": "^16.0.0",
"@testing-library/user-event": "^14.5.0",
"vitest": "^1.6.0",
"jsdom": "^25.0.0"
```

**`vite.config.ts`** — thêm test config:
```typescript
import { defineConfig } from 'vite'
// ...
export default defineConfig({
  // ... existing config
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

**`src/test/setup.ts`:**
```typescript
import '@testing-library/jest-dom'
// Mock window.api (Electron IPC không có trong jsdom)
Object.defineProperty(window, 'api', {
  value: {
    translate: vi.fn(),
    transcribeAudio: vi.fn(),
    speakText: vi.fn(),
    keychain: { hasKey: vi.fn(), get: vi.fn(), save: vi.fn(), delete: vi.fn() },
    chat: vi.fn(),
    platform: 'darwin',
  },
  writable: true,
})
```

**`package.json`** scripts:
```json
"test": "vitest",
"test:ui": "vitest --ui",
"test:coverage": "vitest --coverage"
```

---

#### Bước 2: Test pure functions từ LiveTranslatePage (2 giờ)

**Trước tiên, extract ra files riêng** để dễ import trong test:

**`src/utils/live-translate.ts`** — move từ `LiveTranslatePage.tsx`:
```typescript
export { isHallucination, jaccardSimilarity, extractCompleteSentences }
```

**`src/utils/__tests__/live-translate.test.ts`:**
```typescript
import { describe, it, expect } from 'vitest'
import { isHallucination, jaccardSimilarity, extractCompleteSentences } from '../live-translate'

describe('isHallucination', () => {
  it('rejects text shorter than 4 chars', () => {
    expect(isHallucination('hi')).toBe(true)
    expect(isHallucination('ok')).toBe(true)
  })

  it('rejects English hallucination patterns', () => {
    expect(isHallucination('Thanks for watching!')).toBe(true)
    expect(isHallucination('Please like and subscribe')).toBe(true)
    expect(isHallucination('[Music]')).toBe(true)
  })

  it('rejects Japanese hallucination patterns', () => {
    expect(isHallucination('ご視聴ありがとうございました')).toBe(true)
    expect(isHallucination('（音楽）')).toBe(true)
  })

  it('rejects Vietnamese hallucination patterns', () => {
    expect(isHallucination('Cảm ơn các bạn đã xem video')).toBe(true)
    expect(isHallucination('Đăng ký kênh nhé!')).toBe(true)
  })

  it('rejects character flooding', () => {
    expect(isHallucination('aaaaaaaaaaaaaaaaaaa')).toBe(true)
  })

  it('rejects n-gram repetition', () => {
    expect(isHallucination('hello hello hello hello hello hello')).toBe(true)
    expect(isHallucination('xin chào xin chào xin chào xin chào')).toBe(true)
  })

  it('accepts valid speech', () => {
    expect(isHallucination('Today we are going to talk about machine learning')).toBe(false)
    expect(isHallucination('Hôm nay chúng ta sẽ nói về học máy')).toBe(false)
    expect(isHallucination('今日は機械学習について話します')).toBe(false)
  })
})

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1)
  })

  it('returns 0.0 for completely different strings', () => {
    expect(jaccardSimilarity('hello', 'world')).toBeCloseTo(0, 1)
  })

  it('returns 1.0 for two empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(1)
  })

  it('detects near-duplicate text', () => {
    const sim = jaccardSimilarity(
      'The meeting is scheduled for Monday morning',
      'The meeting is scheduled for Monday afternoon'
    )
    expect(sim).toBeGreaterThan(0.7)
  })
})

describe('extractCompleteSentences', () => {
  it('extracts complete sentence ending with period', () => {
    const { complete, pending } = extractCompleteSentences('Hello world. How are you')
    expect(complete).toBe('Hello world.')
    expect(pending).toBe('How are you')
  })

  it('extracts multiple sentences', () => {
    const { complete, pending } = extractCompleteSentences('First sentence. Second sentence! Third')
    expect(complete).toBe('First sentence. Second sentence!')
    expect(pending).toBe('Third')
  })

  it('returns empty complete when no sentence boundary', () => {
    const { complete, pending } = extractCompleteSentences('No ending here')
    expect(complete).toBe('')
    expect(pending).toBe('No ending here')
  })

  it('handles Japanese sentence endings', () => {
    const { complete, pending } = extractCompleteSentences('こんにちは。元気ですか')
    expect(complete).toBe('こんにちは。')
    expect(pending).toBe('元気ですか')
  })
})
```

---

#### Bước 3: Test canvas utils (45 phút)

**`src/utils/__tests__/canvas.test.ts`:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canvasWrapText } from '../canvas'

// Mock canvas context
const mockCtx = {
  measureText: vi.fn(),
  font: '',
} as unknown as CanvasRenderingContext2D

describe('canvasWrapText', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns empty array for empty text', () => {
    expect(canvasWrapText(mockCtx, '', 200)).toEqual([])
  })

  it('returns single line when text fits', () => {
    mockCtx.measureText = vi.fn().mockReturnValue({ width: 50 })
    const result = canvasWrapText(mockCtx, 'Hello', 200)
    expect(result).toEqual(['Hello'])
  })

  it('wraps long text into multiple lines', () => {
    // First call (full text) too wide, subsequent calls fit
    let callCount = 0
    mockCtx.measureText = vi.fn().mockImplementation((text: string) => {
      callCount++
      // "Hello World" is too wide, "Hello" fits, "World" fits
      return { width: text.includes(' ') && text.length > 5 ? 250 : 80 }
    })
    const result = canvasWrapText(mockCtx, 'Hello World', 200)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('handles CJK characters by splitting per character', () => {
    mockCtx.measureText = vi.fn().mockImplementation((text: string) => ({
      width: text.length * 20  // each char = 20px
    }))
    // 3 chars × 20px = 60px per 3 chars; max 50px → each line = 2 chars
    const result = canvasWrapText(mockCtx, '日本語', 45)
    expect(result.length).toBeGreaterThan(1)
  })
})
```

---

#### Bước 4: Test Zustand store (1.5 giờ)

**`src/store/__tests__/useAppStore.test.ts`:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useAppStore } from '../useAppStore'

// Reset store state before each test
beforeEach(() => {
  useAppStore.setState({
    history: [],
    chatSessions: [],
    liveSessions: [],
    systemPromptPresets: [],
    activeChatSessionId: null,
    chatSystemPrompt: '',
  })
})

describe('Translation History', () => {
  it('adds item to history', () => {
    const item = {
      id: '1', timestamp: Date.now(), provider: 'gemini' as const,
      model: 'gemini-2.0-flash', sourceLang: 'auto', targetLang: 'vi',
      sourceText: 'Hello', translatedText: 'Xin chào',
    }
    act(() => useAppStore.getState().addHistory(item))
    expect(useAppStore.getState().history).toHaveLength(1)
    expect(useAppStore.getState().history[0].sourceText).toBe('Hello')
  })

  it('limits history to MAX_HISTORY (100)', () => {
    const items = Array.from({ length: 105 }, (_, i) => ({
      id: String(i), timestamp: Date.now(), provider: 'gemini' as const,
      model: 'test', sourceLang: 'auto', targetLang: 'vi',
      sourceText: `text ${i}`, translatedText: `dịch ${i}`,
    }))
    act(() => items.forEach(item => useAppStore.getState().addHistory(item)))
    expect(useAppStore.getState().history).toHaveLength(100)
  })

  it('deletes history item by id', () => {
    const item = {
      id: 'abc', timestamp: Date.now(), provider: 'openai' as const,
      model: 'gpt-4o', sourceLang: 'en', targetLang: 'vi',
      sourceText: 'Test', translatedText: 'Thử',
    }
    act(() => {
      useAppStore.getState().addHistory(item)
      useAppStore.getState().deleteHistoryItem('abc')
    })
    expect(useAppStore.getState().history).toHaveLength(0)
  })

  it('clears all history', () => {
    act(() => {
      useAppStore.getState().addHistory({ id: '1', timestamp: Date.now(), provider: 'gemini' as const, model: 'm', sourceLang: 'en', targetLang: 'vi', sourceText: 'a', translatedText: 'b' })
      useAppStore.getState().clearHistory()
    })
    expect(useAppStore.getState().history).toHaveLength(0)
  })
})

describe('Chat Sessions', () => {
  it('creates a new chat session', () => {
    let id: string
    act(() => {
      id = useAppStore.getState().createChatSession('gemini', 'gemini-2.0-flash')
    })
    const sessions = useAppStore.getState().chatSessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].provider).toBe('gemini')
    expect(useAppStore.getState().activeChatSessionId).toBe(id!)
  })

  it('adds message to session', () => {
    let sessionId: string
    act(() => {
      sessionId = useAppStore.getState().createChatSession('openai', 'gpt-4o')
      useAppStore.getState().addChatMessage(sessionId, {
        id: 'msg1', role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        timestamp: Date.now(),
      })
    })
    const session = useAppStore.getState().chatSessions.find(s => s.id === sessionId!)
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages[0].content[0].text).toBe('Hello')
  })

  it('deletes chat session', () => {
    let sessionId: string
    act(() => {
      sessionId = useAppStore.getState().createChatSession('claude', 'claude-3-5-haiku-20241022')
      useAppStore.getState().deleteChatSession(sessionId)
    })
    expect(useAppStore.getState().chatSessions).toHaveLength(0)
    expect(useAppStore.getState().activeChatSessionId).toBeNull()
  })
})

describe('System Prompt Presets', () => {
  it('adds preset', () => {
    let id: string
    act(() => {
      id = useAppStore.getState().addSystemPromptPreset({
        name: 'Formal', content: 'You are a formal translator.'
      })
    })
    const presets = useAppStore.getState().systemPromptPresets
    expect(presets).toHaveLength(1)
    expect(presets[0].name).toBe('Formal')
  })

  it('sets default preset and updates chatSystemPrompt', () => {
    let id: string
    act(() => {
      id = useAppStore.getState().addSystemPromptPreset({
        name: 'Default', content: 'Be concise.', isDefault: true
      })
    })
    expect(useAppStore.getState().chatSystemPrompt).toBe('Be concise.')
  })

  it('deletes preset and clears chatSystemPrompt if it was default', () => {
    let id: string
    act(() => {
      id = useAppStore.getState().addSystemPromptPreset({
        name: 'Test', content: 'Some prompt.', isDefault: true
      })
      useAppStore.getState().deleteSystemPromptPreset(id)
    })
    expect(useAppStore.getState().systemPromptPresets).toHaveLength(0)
    expect(useAppStore.getState().chatSystemPrompt).toBe('')
  })
})

describe('swapLanguages', () => {
  it('swaps source and target languages', () => {
    act(() => {
      useAppStore.setState({ sourceLang: 'en', targetLang: 'vi', sourceText: 'Hello', translatedText: 'Xin chào' })
      useAppStore.getState().swapLanguages()
    })
    const state = useAppStore.getState()
    expect(state.sourceLang).toBe('vi')
    expect(state.targetLang).toBe('en')
    expect(state.sourceText).toBe('Xin chào')
    expect(state.translatedText).toBe('Hello')
  })

  it('falls back to "ja" when sourceLang is "auto"', () => {
    act(() => {
      useAppStore.setState({ sourceLang: 'auto', targetLang: 'vi' })
      useAppStore.getState().swapLanguages()
    })
    expect(useAppStore.getState().targetLang).toBe('ja')
    expect(useAppStore.getState().sourceLang).toBe('vi')
  })
})
```

---

#### Bước 5: Test `locale.ts` utils (20 phút)

**`src/utils/__tests__/locale.test.ts`:**
```typescript
import { describe, it, expect, vi } from 'vitest'
import { detectSystemLocale } from '../locale'

describe('detectSystemLocale', () => {
  it('detects Vietnamese locale', () => {
    Object.defineProperty(navigator, 'language', { value: 'vi-VN', configurable: true })
    expect(detectSystemLocale()).toBe('vi')
  })

  it('detects Japanese locale', () => {
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true })
    expect(detectSystemLocale()).toBe('ja')
  })

  it('falls back to English for unsupported locale', () => {
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true })
    expect(detectSystemLocale()).toBe('en')
  })
})
```

**Điểm tăng Testing:** 0 → 8 (+8)

---

## 📊 Tổng Kết Kế Hoạch

### Điểm tăng dự kiến theo Phase

| Phase | Tasks | Thời gian | Điểm tăng | Điểm mới |
|-------|-------|-----------|-----------|----------|
| **Phase 1** | TASK-01 đến TASK-04 | ~2 giờ | +7 | 77/100 |
| **Phase 2** | TASK-05 đến TASK-10 | ~4-5 giờ | +8 | 85/100 |
| **Phase 3** | TASK-11 | ~5-7 giờ | +8 | **93/100** |

### Thứ tự ưu tiên tuyệt đối (làm trước nhất → sau nhất)

```
1. TASK-01 — Performance giới hạn fullRawRef          (15 phút, +1)
2. TASK-03 — Tạo CONTRIBUTING.md                       (15 phút, +1)
3. TASK-02 — Security input validation                 (30 phút, +1)
4. TASK-04b — Extract detectSystemLocale utils         (20 phút, +1)
5. TASK-04a — Fix catch rỗng trong SettingsPage        (30 phút, +1)
6. TASK-04c — Fix setCopiedId trong ChatPage           (20 phút, +1)
7. TASK-07 — Extract canvas utils                      (20 phút, +2)
8. TASK-05 — Tạo SpinnerIcon component                 (30 phút, +2)
9. TASK-06 — Magic strings → i18n                      (45 phút, +2)
10. TASK-09 — Comment initRef + magic values           (30 phút, +1)
11. TASK-08 — Tách SettingsPage sections               (2-3 giờ, +2)
12. TASK-10 — Fix handleOpenLive                       (20 phút, +2)
13. TASK-11 — Setup Vitest + viết tests               (5-7 giờ, +8)
```

### Checklist thực hiện

- [ ] TASK-01: Giới hạn `fullRawForSummaryRef` trong `LiveTranslatePage.tsx`
- [ ] TASK-02: Thêm `MAX_INPUT_CHARS` validation trong `TranslatePage.tsx` + `ChatPage.tsx`
- [ ] TASK-03: Tạo `CONTRIBUTING.md`
- [ ] TASK-04a: Fix catch rỗng trong `SettingsPage.tsx` (createToken/deleteToken/regenerateToken)
- [ ] TASK-04b: Tạo `src/utils/locale.ts`, cập nhật `App.tsx` + `SettingsPage.tsx`
- [ ] TASK-04c: Fix `setCopiedId` dùng `message.id` trong `ChatPage.tsx`
- [ ] TASK-05: Tạo `src/components/ui/SpinnerIcon.tsx`, thay thế 12+ chỗ inline SVG
- [ ] TASK-06: Thêm i18n keys cho error strings trong `SettingsPage.tsx`
- [ ] TASK-07: Tạo `src/utils/canvas.ts`, cập nhật `TranslatePage.tsx`
- [ ] TASK-08: Tách `SettingsPage.tsx` thành 6 sub-components trong `src/pages/settings/`
- [ ] TASK-09: Thêm comment cho `initRef` pattern, đặt tên magic values
- [ ] TASK-10: Fix `handleOpenLive` để truyền session đúng
- [ ] TASK-11: Setup Vitest + viết tests cho pure functions, canvas, store, locale

---

*Kế hoạch fix được lập dựa trên báo cáo `score-code-report.md` — mục tiêu 93/100 điểm*
