# Báo cáo Phân tích UI Component — split-ui-component

**Ngày:** 22/4/2026  
**Phạm vi:** `src/components/` + `src/pages/` (toàn bộ)  
**Workflow:** split-ui-component v1.0.0  
**Tổng file đã đọc:** 50+ file TSX/TS

---

## Tổng kết

| Severity | Loại vấn đề | Số lượng |
|----------|-------------|----------|
| 🟠 High | UI Pattern Duplicate | 1 |
| 🟡 Medium | Sub-component Inline quá lớn | 2 |
| 🟡 Medium | Component đặt sai thư mục | 2 |
| 🟡 Medium | Emoji dùng làm Icon | 1 (2 instances) |
| **Tổng** | | **6 vấn đề** |

### ✅ Không có vấn đề
- **SVG icon hardcode inline:** Không phát hiện `<svg>` nào ngoài `src/components/ui/icons/` ✅
- **Toàn bộ `src/components/ui/`:** 25 components — tất cả pass 5 tiêu chí reusable ✅
- **Toàn bộ `src/components/translate/`:** 8 components — đặt đúng vị trí ✅
- **Toàn bộ `src/components/chat/`:** 2 components — đặt đúng vị trí ✅

---

## Vấn đề Chi tiết

---

### 🟠 [HIGH-01] UI Pattern Duplicate — Speaker Badge (3 lần)

**File:** `src/pages/LiveTranslatePage.tsx`

Speaker badge — pill có màu dựa theo speaker index — xuất hiện 3 lần với cùng visual pattern nhưng dưới dạng element khác nhau. Nếu cần đổi font size, padding, hay border radius thì phải sửa ở 3 nơi.

#### Lần 1 — `SegmentRow` (line 801–810) — dạng `<button>` với rename
```tsx
<button
  type="button"
  onClick={() => { setRenameValue(displayName); setIsRenaming(true) }}
  title="Click to rename speaker"
  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
              font-semibold flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-80
              group ${colorClass}`}
>
  {displayName}
  <PencilIcon className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
</button>
```

#### Lần 2 — `TranslationRow` (line 838–841) — dạng `<span>` đơn
```tsx
<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px]
                  font-semibold flex-shrink-0 mt-0.5 ${colorClass}`}>
  {displayName}
</span>
```

#### Lần 3 — `SpeakerAnalysisText` (line 869–873) — dạng `<span>` đơn
```tsx
<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px]
                  font-semibold flex-shrink-0 ${colorClass}`}>
  {label}
</span>
```

#### Sửa: Tách thành `SpeakerBadge`

```tsx
// ✅ src/components/live/SpeakerBadge.tsx
import { useState } from 'react'
import { PencilIcon } from '../ui/icons'

interface SpeakerBadgeProps {
  /** Display name of the speaker */
  name: string
  /** Tailwind color class for the badge background/text */
  colorClass: string
  /**
   * Khi truyền vào: badge trở thành button click-to-rename.
   * Khi undefined: badge là span read-only.
   */
  onRename?: (original: string, newName: string) => void
  /** Extra Tailwind class để override margin/spacing nếu cần */
  className?: string
}

export function SpeakerBadge({ name, colorClass, onRename, className = '' }: SpeakerBadgeProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [value, setValue] = useState(name)

  if (isRenaming) {
    const submit = () => {
      if (value.trim()) onRename?.(name, value.trim())
      setIsRenaming(false)
    }
    return (
      <input
        // biome-ignore lint/a11y/noAutofocus: intentional for rename UX
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setIsRenaming(false)
        }}
        onBlur={submit}
        className="w-20 px-1.5 py-0.5 text-[10px] rounded-full border border-blue-300
                   dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-700
                   dark:text-gray-300 focus:outline-none focus:border-blue-500 flex-shrink-0 mt-0.5"
      />
    )
  }

  if (onRename) {
    return (
      <button
        type="button"
        onClick={() => { setValue(name); setIsRenaming(true) }}
        title="Click to rename speaker"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                    font-semibold flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-80
                    group ${colorClass} ${className}`}
      >
        {name}
        <PencilIcon className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    )
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px]
                      font-semibold flex-shrink-0 mt-0.5 ${colorClass} ${className}`}>
      {name}
    </span>
  )
}
```

Sau đó dùng trong `SegmentRow`, `TranslationRow`, `SpeakerAnalysisText`:
```tsx
// SegmentRow — có rename
<SpeakerBadge name={displayName} colorClass={colorClass} onRename={onRename} />

// TranslationRow — read-only
<SpeakerBadge name={displayName} colorClass={colorClass} />

// SpeakerAnalysisText — read-only, không cần mt-0.5
<SpeakerBadge name={label} colorClass={colorClass} className="mt-0" />
```

---

### 🟡 [MED-01] Sub-component Inline quá lớn — `SegmentRow` (62 dòng)

**File:** `src/pages/LiveTranslatePage.tsx:759–820`  
**Kích thước:** 62 dòng (ngưỡng tách: 30 dòng)

```tsx
// lines 759-820
function SegmentRow({
  speaker, text, speakerNameMap, onRename,
}: {
  speaker: string
  text: string
  speakerNameMap: Record<string, string>
  onRename: (original: string, newName: string) => void
}) {
  // ── State ──
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(displayName)
  const displayedText = useTypewriter(text)          // typewriter animation
  // ── Handlers ──
  const handleRenameSubmit = () => { ... }
  // ── JSX ── (badge + text content)
  return ( ... )
}
```

**Vấn đề:**
- Có state riêng (rename UX): `isRenaming`, `renameValue`
- Có hook riêng (`useTypewriter`)
- Logic rename handler 6 dòng
- 62 dòng → vượt ngưỡng gấp đôi
- Feature-specific: gắn với real-time transcript + speaker diarization của Live Translate

**Đề xuất:** Tách ra `src/components/live/SegmentRow.tsx`

**Bonus: `useTypewriter` hook (lines 735–756, 22 dòng)**  
Không phải component nên không vi phạm quy tắc ≥ 30 dòng, nhưng nên tách ra `src/hooks/useTypewriter.ts` để `SegmentRow` và `TranslationRow` có thể import dùng chung sau khi cả hai được tách ra file riêng.

```
src/hooks/useTypewriter.ts        ← new
src/components/live/
  SegmentRow.tsx                  ← tách từ LiveTranslatePage.tsx
  TranslationRow.tsx              ← tách (28 dòng, borderline nhưng nên tách nếu đã tách SegmentRow)
  SpeakerAnalysisText.tsx         ← tách (xem MED-02)
  SpeakerBadge.tsx                ← mới (xem HIGH-01)
```

---

### 🟡 [MED-02] Sub-component Inline quá lớn — `SpeakerAnalysisText` (33 dòng)

**File:** `src/pages/LiveTranslatePage.tsx:852–884`  
**Kích thước:** 33 dòng (ngưỡng tách: 30 dòng)

```tsx
// lines 852-884
function SpeakerAnalysisText({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean)
  const speakerColorMap = new Map<string, string>()
  return (
    <div className="space-y-1.5 text-xs">
      {lines.map((line, i) => {
        const match = line.match(/^\[([^\]]+)\]:\s*(.*)/)
        if (match) {
          // parse [Speaker]: content format
          // render colored badge + content
        }
        return <p key={i}>{line}</p>
      })}
    </div>
  )
}
```

**Vấn đề:**
- Parse định dạng `[Speaker]: content` — logic đặc thù Live Translate / meeting analysis
- Quản lý `speakerColorMap` state trung gian trong render
- 33 dòng → vượt ngưỡng
- Feature-specific: chỉ có nghĩa trong post-meeting speaker analysis panel

**Đề xuất:** Tách ra `src/components/live/SpeakerAnalysisText.tsx`

---

### 🟡 [MED-03] Component đặt sai thư mục — `ImageTranslator.tsx`

**File hiện tại:** `src/components/ImageTranslator.tsx` (root-level)  
**Vị trí đúng:** `src/components/translate/ImageTranslator.tsx`

```tsx
// src/components/ImageTranslator.tsx — root level, nhưng...
export interface ImageAttachment { ... }          // ← type được dùng bởi translate/

export function ImageTranslator({ onImageReady, onClose }: ImageTranslatorProps) {
  const t = useT()   // nhiều label i18n
  // Modal dialog: drag-drop upload → resize → callback
  ...
}
```

**Vấn đề:**
- `src/components/translate/ImageAttachmentPreview.tsx` import type từ đây:  
  `import type { ImageAttachment } from '../ImageTranslator'`
- `src/hooks/useTranslate.ts` import type từ đây:  
  `import type { ImageAttachment } from '../components/ImageTranslator'`
- Tên component (`ImageTranslator`) và logic (image upload cho translate modal) gắn chặt với translate feature
- Root-level vị trí không hợp lý khi toàn bộ consumers đều trong translate context

**Kế hoạch di chuyển:**
```
src/components/ImageTranslator.tsx                     ← XÓA (move)
  → src/components/translate/ImageTranslator.tsx       ← đặt đúng

# Cập nhật imports:
src/components/translate/ImageAttachmentPreview.tsx:
  - import type { ImageAttachment } from '../ImageTranslator'
  + import type { ImageAttachment } from './ImageTranslator'

src/hooks/useTranslate.ts:
  - import type { ImageAttachment } from '../components/ImageTranslator'
  + import type { ImageAttachment } from '../components/translate/ImageTranslator'
```

**Bonus:** Cân nhắc di chuyển `ImageAttachment` type vào `src/types/index.ts` để giảm coupling giữa các file.

---

### 🟡 [MED-04] Shared UI Components đặt trong `src/pages/`

**File:** `src/pages/history/historyUtils.tsx`

File này chứa 2 UI component pass đủ 5 tiêu chí reusable nhưng được đặt trong `src/pages/history/` thay vì `src/components/`:

| Component | Lines | Tiêu chí | Hiện tại | Nên đặt |
|-----------|-------|----------|----------|---------|
| `HistoryClearHeader` | 49–70 (22 dòng) | ✅ 5/5 | `src/pages/history/historyUtils.tsx` | `src/components/ui/HistoryClearHeader.tsx` |
| `HistoryEmptyState` | 80–92 (13 dòng) | ✅ 5/5 | `src/pages/history/historyUtils.tsx` | `src/components/ui/HistoryEmptyState.tsx` |

**`HistoryClearHeader` phân tích 5 tiêu chí:**
- ✅ Không import business logic — chỉ nhận props
- ✅ Props-only (`countLabel`, `confirmClear`, `labelClear`, `labelConfirm`, `onClear`, `onBlur`)
- ✅ Domain-agnostic — pattern header-with-clear-button dùng được ở nhiều nơi
- ✅ Không có SVG inline
- ✅ Tất cả label qua props

**`HistoryEmptyState` phân tích 5 tiêu chí:**
- ✅ Không import business logic
- ✅ Props-only (`icon: ReactNode`, `title: string`, `desc: string`)
- ✅ Domain-agnostic — generic empty state pattern
- ✅ Icon truyền vào qua `ReactNode` prop — không hardcode
- ✅ Label qua props

**Lưu ý không phải false positive:**  
`ProviderBadge` trong cùng file dùng `p?.emoji ?? '🤖'` là provider metadata từ `PROVIDERS` constant — đây là emoji data, không phải UI icon. Không cần sửa.

---

### 🟡 [MED-05] Emoji dùng làm Icon — `SttSection.tsx`

**File:** `src/pages/settings/SttSection.tsx:74,78`

```tsx
{/* lines 70-80 — Feature tags section */}
<div className="px-4 py-3 flex flex-wrap gap-1.5">
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium
                   bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
    🎤 {t.settings_stt_feature_voice}         {/* ← line 74 */}
  </span>
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium
                   bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
    🎙 {t.settings_stt_feature_live}          {/* ← line 78 */}
  </span>
</div>
```

**Vấn đề:** Hai emoji microphone (`🎤`, `🎙`) dùng như icon trong feature tag badges.

**Sửa:**
```tsx
import { MicrophoneIcon } from '../../components/ui/icons'
// Nếu cần 🎙 (studio mic) → tạo StudioMicIcon trong src/components/ui/icons/media.tsx

{/* line 74 — dùng MicrophoneIcon đã có trong registry */}
<span className="inline-flex items-center gap-1 ...">
  <MicrophoneIcon className="w-3 h-3" />
  {t.settings_stt_feature_voice}
</span>

{/* line 78 — 🎤 và 🎙 visual tương tự, có thể dùng cùng MicrophoneIcon */}
<span className="inline-flex items-center gap-1 ...">
  <MicrophoneIcon className="w-3 h-3" />
  {t.settings_stt_feature_live}
</span>
```

Icon `MicrophoneIcon` đã có trong `src/components/ui/icons/media.tsx` — **không cần tạo mới**.

---

## Bản đồ Component Toàn bộ

### Root-level Reusable — `src/components/`

| Component | Tiêu chí | Ghi chú |
|-----------|----------|---------|
| `AppLogo.tsx` | ✅ 5/5 | Đúng vị trí |
| `Sidebar.tsx` | Smart component | Dùng `useAppStore()` — root-level OK |
| `LanguageSelector.tsx` | ✅ Reusable | Dùng `useT()` cho lang_names — acceptable |
| `ModelSelector.tsx` | Smart component | Dùng `useAppStore()` full — root-level OK |
| `VoiceRecorder.tsx` | ✅ Gần reusable | Dùng `useT()` cho 1 error string |
| `MarkdownEditor.tsx` | Chưa kiểm tra chi tiết | |
| `MarkdownText.tsx` | Chưa kiểm tra chi tiết | |
| `FuriganaText.tsx` | Chưa kiểm tra chi tiết | |
| `ProviderIcon.tsx` | Chưa kiểm tra chi tiết | |
| `ApiKeyInput.tsx` | Chưa kiểm tra chi tiết | |
| `ImageTranslator.tsx` | ⚠️ Sai vị trí | Nên → `translate/` (xem MED-03) |

### Feature-specific Đúng vị trí — `src/components/chat/`

| Component | Lý do Feature-specific |
|-----------|----------------------|
| `MessageBubble.tsx` | Chat bubble UI, context-gắn chặt với ChatMessage type |
| `SystemPromptDropdown.tsx` | Import `chatSystemPrompt` slice từ store |

### Feature-specific Đúng vị trí — `src/components/translate/`

| Component | Lý do Feature-specific |
|-----------|----------------------|
| `ImageAttachmentPreview.tsx` | Preview ảnh trong translate input panel |
| `ImageSwitchToast.tsx` | Toast notification khi switch sang image-capable model |
| `ResultPanelActions.tsx` | Action bar của result panel — gắn với translate state |
| `SourcePanelActions.tsx` | Action bar của source panel — gắn với translate state |
| `TranslateError.tsx` | Error state display cho translate workflow |
| `TranslateLanguageBar.tsx` | Language selector bar của translate feature |
| `TranslateToolbar.tsx` | Toolbar trên cùng của translate page |
| `VoiceOverlay.tsx` | Overlay hiển thị khi đang ghi âm trong translate |

### Reusable Đúng vị trí — `src/components/ui/`

| Component | Tiêu chí | Ghi chú |
|-----------|----------|---------|
| `AutoTranslateToggle.tsx` | ✅ 5/5 | |
| `BookmarkletDragLink.tsx` | ✅ 5/5 | |
| `ButtonGroup.tsx` | ✅ 5/5 | |
| `CheckUpdateButton.tsx` | ✅ 5/5 | |
| `ClearButton.tsx` | ✅ 5/5 | |
| `CopyButton.tsx` | ✅ 5/5 | |
| `DownloadImageButton.tsx` | ✅ 5/5 | |
| `DragOverlay.tsx` | ✅ 5/5 | Dùng ở cả `TranslatePage` + `ChatPage` |
| `FontSizePicker.tsx` | ✅ 5/5 | |
| `HistoryDeleteButton.tsx` | ✅ 5/5 | |
| `HotkeyRecordButton.tsx` | ✅ 5/5 | |
| `ImagePreviewThumbnail.tsx` | ✅ 5/5 | |
| `ImageTranslateButton.tsx` | ✅ 5/5 | |
| `InlineErrorBanner.tsx` | ✅ 5/5 | |
| `MiniToggleTrack.tsx` | ✅ 5/5 | |
| `PhoneticToggle.tsx` | ✅ 5/5 | |
| `PresetActions.tsx` | ✅ 5/5 | |
| `RewriteButton.tsx` | ✅ 5/5 | |
| `SettingsCopyButton.tsx` | ✅ 5/5 | |
| `SettingsFormActions.tsx` | ✅ 5/5 | |
| `SpeakButton.tsx` | ✅ 5/5 | |
| `ToggleSwitch.tsx` | ✅ 5/5 | |
| `TokenTtlPicker.tsx` | ✅ 5/5 | |
| `TranslateButton.tsx` | ✅ 5/5 | |
| `TtsVoicePicker.tsx` | ✅ 5/5 | |

### Cần Tách mới

| Component đề xuất | Tách từ | Loại | Vị trí đề xuất |
|-------------------|---------|------|----------------|
| `SpeakerBadge.tsx` | `LiveTranslatePage.tsx` | Feature-specific (live) | `src/components/live/SpeakerBadge.tsx` |
| `SegmentRow.tsx` | `LiveTranslatePage.tsx` | Feature-specific (live) | `src/components/live/SegmentRow.tsx` |
| `SpeakerAnalysisText.tsx` | `LiveTranslatePage.tsx` | Feature-specific (live) | `src/components/live/SpeakerAnalysisText.tsx` |
| `TranslationRow.tsx` | `LiveTranslatePage.tsx` | Feature-specific (live) | `src/components/live/TranslationRow.tsx` |
| `useTypewriter.ts` | `LiveTranslatePage.tsx` | Hook | `src/hooks/useTypewriter.ts` |

### Cần Di chuyển

| File hiện tại | Vị trí đúng | Cần cập nhật imports |
|---------------|-------------|---------------------|
| `src/components/ImageTranslator.tsx` | `src/components/translate/ImageTranslator.tsx` | `ImageAttachmentPreview.tsx`, `useTranslate.ts` |
| `HistoryClearHeader` trong `historyUtils.tsx` | `src/components/ui/HistoryClearHeader.tsx` | `ChatHistoryTab.tsx`, `LiveHistoryTab.tsx`, `TranslationHistoryTab.tsx` |
| `HistoryEmptyState` trong `historyUtils.tsx` | `src/components/ui/HistoryEmptyState.tsx` | `ChatHistoryTab.tsx`, `LiveHistoryTab.tsx`, `TranslationHistoryTab.tsx` |

---

## Icon Registry — Kiểm tra

| Icon cần | Đã có? | File | Export name |
|----------|--------|------|-------------|
| Microphone (🎤) | ✅ Có | `media.tsx` | `MicrophoneIcon` |
| Studio mic (🎙) | ❌ Chưa có | Cần tạo trong `media.tsx` | `StudioMicIcon` |
| Pencil (rename) | ✅ Có | `actions.tsx` | `PencilIcon` |
| Speaker badge không cần icon mới | — | — | — |

**Tạo mới `StudioMicIcon` (nếu muốn phân biệt 🎙 với 🎤):**
```tsx
// src/components/ui/icons/media.tsx
/** Studio / condenser microphone — for live recording contexts */
export function StudioMicIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  )
}
```

---

## Top 3 Ưu tiên Fix

| Thứ tự | Issue | File | Lý do ưu tiên |
|--------|-------|------|---------------|
| 1 | 🟠 [HIGH-01] Tách `SpeakerBadge` | `LiveTranslatePage.tsx` | Loại bỏ triplication speaker badge — 3 nơi cần sửa đồng bộ nếu UI thay đổi |
| 2 | 🟡 [MED-01] Tách `SegmentRow` + `useTypewriter` | `LiveTranslatePage.tsx` | 62 dòng inline với state phức tạp — khó test, khó maintain, file 899 dòng quá lớn |
| 3 | 🟡 [MED-03] Di chuyển `ImageTranslator.tsx` | `src/components/` → `src/components/translate/` | Sai vị trí rõ ràng, type `ImageAttachment` export gây tight coupling |

---

## File bị ảnh hưởng nhiều nhất

| File | Số vấn đề | Loại vấn đề |
|------|-----------|-------------|
| `src/pages/LiveTranslatePage.tsx` (899 dòng) | 3 | HIGH-01, MED-01, MED-02 |
| `src/components/ImageTranslator.tsx` | 1 | MED-03 |
| `src/pages/history/historyUtils.tsx` | 1 | MED-04 |
| `src/pages/settings/SttSection.tsx` | 1 | MED-05 |
