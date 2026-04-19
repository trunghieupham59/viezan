# Báo cáo Phân tích UI Component
**Ngày:** 19/04/2026 12:33  
**Phạm vi:** `src/components/` + `src/pages/`  
**Workflow:** split-ui-component v1.0.0

---

## Tổng quan

| Loại vấn đề | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|---|---|---|---|---|
| SVG Icon Hardcode Inline | 1 | 1 | 0 | 2 |
| UI Pattern Duplicate | 1 | 0 | 0 | 1 |
| Sub-component Inline quá lớn | 0 | 1 | 0 | 1 |
| Component đặt sai thư mục | 0 | 0 | 0 | 0 |
| Emoji dùng như Icon | 0 | 0 | 0 | 0 |
| **Tổng** | **2** | **2** | **0** | **4** |

> ✅ Không có component đặt sai thư mục.  
> ✅ Không có emoji dùng làm icon (provider emoji là metadata, không phải icon).  
> ✅ Hầu hết components đều được tổ chức tốt theo Reusable / Feature-specific.  
> ✅ Icon registry (`src/components/ui/icons/`) đã được thiết lập và sử dụng rộng rãi.

---

## Bản đồ Component (phân loại hiện trạng)

### Root-level `src/components/`

| Component | Loại | Vị trí hiện tại | Vị trí đúng | Ghi chú |
|---|---|---|---|---|
| `AppLogo.tsx` | Root-reusable ✅ | `src/components/` | `src/components/` | Đúng vị trí |
| `ProviderIcon.tsx` | Root-reusable ✅ | `src/components/` | `src/components/` | Đúng vị trí; có SVG inline cần move sang icons/ |
| `ApiKeyInput.tsx` | Reusable ✅ | `src/components/` | `src/components/` | Domain-agnostic (nhận provider như prop); đúng vị trí |
| `FuriganaText.tsx` | Reusable ✅ | `src/components/` | `src/components/` | Stateless, pure display |
| `ImageTranslator.tsx` | Reusable ✅ | `src/components/` | `src/components/` | Modal upload, domain-agnostic |
| `LanguageSelector.tsx` | Reusable ✅ | `src/components/` | `src/components/` | Generic dropdown |
| `MarkdownEditor.tsx` | Reusable ✅ | `src/components/` | `src/components/` | Pure editor component |
| `MarkdownText.tsx` | Reusable ✅ | `src/components/` | `src/components/` | Pure renderer |
| `ModelSelector.tsx` | Reusable ✅ | `src/components/` | `src/components/` | Dùng store nhưng domain-agnostic (translate + chat) |
| `VoiceRecorder.tsx` | Reusable ✅ | `src/components/` | `src/components/` | Đúng vị trí; có SVG inline cần move |

### `src/components/chat/`

| Component | Loại | Vị trí hiện tại | Vị trí đúng | Ghi chú |
|---|---|---|---|---|
| `MessageBubble.tsx` | Feature-specific ✅ | `src/components/chat/` | `src/components/chat/` | Chat-specific display |
| `SystemPromptDropdown.tsx` | Feature-specific ✅ | `src/components/chat/` | `src/components/chat/` | Chat-specific, nhận `chatSystemPrompt` |

### `src/components/translate/`

| Component | Loại | Vị trí hiện tại | Vị trí đúng | Ghi chú |
|---|---|---|---|---|
| `ImageAttachmentPreview.tsx` | Feature-specific ✅ | `src/components/translate/` | `src/components/translate/` | Nhưng ChatPage duplicate JSX này |
| `ImageSwitchToast.tsx` | Feature-specific ✅ | `src/components/translate/` | `src/components/translate/` | Translate-specific toast |
| `ResultPanelActions.tsx` | Feature-specific ✅ | `src/components/translate/` | `src/components/translate/` | Translate-specific |
| `SourcePanelActions.tsx` | Feature-specific ✅ | `src/components/translate/` | `src/components/translate/` | Translate-specific; 2 exports |
| `TranslateError.tsx` | Feature-specific ✅ | `src/components/translate/` | `src/components/translate/` | Đúng vị trí |
| `TranslateLanguageBar.tsx` | Feature-specific ✅ | `src/components/translate/` | `src/components/translate/` | Đúng vị trí |
| `TranslateToolbar.tsx` | Feature-specific ✅ | `src/components/translate/` | `src/components/translate/` | Đúng vị trí |
| `VoiceOverlay.tsx` | Feature-specific ✅ | `src/components/translate/` | `src/components/translate/` | Đúng vị trí |

### `src/components/ui/` — Reusable UI primitives

| Component | Loại | Ghi chú |
|---|---|---|
| `AutoTranslateToggle.tsx` | Reusable ✅ | Props-driven, no store dependency |
| `BookmarkletDragLink.tsx` | Reusable ✅ | Generic link component |
| `ButtonGroup.tsx` | Reusable ✅ | Generic selection component |
| `CheckUpdateButton.tsx` | Reusable ✅ | State-driven, props-only |
| `ClearButton.tsx` | Reusable ✅ | Generic ghost button |
| `CopyButton.tsx` | Reusable ✅ | Generic copy button |
| `DownloadImageButton.tsx` | Reusable ✅ | |
| `DragOverlay.tsx` | Reusable ✅ | |
| `FontSizePicker.tsx` | Reusable ✅ | |
| `HistoryDeleteButton.tsx` | Reusable ✅ | |
| `HotkeyRecordButton.tsx` | Reusable ✅ | |
| `ImageTranslateButton.tsx` | Reusable ✅ | |
| `InlineErrorBanner.tsx` | Reusable ✅ | |
| `MiniToggleTrack.tsx` | Reusable ✅ | |
| `PhoneticToggle.tsx` | Reusable ✅ | |
| `PresetActions.tsx` | Reusable ✅ | |
| `RewriteButton.tsx` | Reusable ✅ | |
| `SettingsCopyButton.tsx` | Reusable ✅ | |
| `SettingsFormActions.tsx` | Reusable ✅ | |
| `SpeakButton.tsx` | Reusable ✅ | |
| `ToggleSwitch.tsx` | Reusable ✅ | |
| `TokenTtlPicker.tsx` | Reusable ✅ | |
| `TranslateButton.tsx` | Reusable ✅ | |
| `TtsVoicePicker.tsx` | Reusable ✅ | |

### `src/pages/`

| Component | Loại | Ghi chú |
|---|---|---|
| `TranslatePage.tsx` | Feature-specific ✅ | Logic ở useTranslate hook |
| `ChatPage.tsx` | Feature-specific ✅ | 592 dòng, có inline sub-component |
| `HistoryPage.tsx` | Feature-specific ✅ | Tách 3 tabs |
| `LiveTranslatePage.tsx` | Feature-specific ✅ | Có inline sub-components (Notice, EmptyPanel) |
| `SettingsPage.tsx` | Feature-specific ✅ | Composition của sections |

### `src/pages/settings/`

| Component | Loại | Ghi chú |
|---|---|---|
| `ApiKeysSection.tsx` | Feature-specific ✅ | |
| `BrowserIntegrationSection.tsx` | Feature-specific ✅ | |
| `ChatPresetsSection.tsx` | Feature-specific ✅ | |
| `PreferencesSection.tsx` | Feature-specific ✅ | |
| `TtsSection.tsx` | Feature-specific ✅ | |
| `UpdaterSection.tsx` | Feature-specific ✅ | |
| `AboutSection.tsx` | Feature-specific ✅ | |

### `src/pages/history/`

| Component | Loại | Ghi chú |
|---|---|---|
| `TranslationHistoryTab.tsx` | Feature-specific ✅ | |
| `ChatHistoryTab.tsx` | Feature-specific ✅ | |
| `LiveHistoryTab.tsx` | Feature-specific ✅ | |

---

## Vấn đề 1: SVG Icon Hardcode Inline

### 🟠 SPLIT-ICON-01 — ProviderIcon.tsx: 3 SVG provider icons inline (High)

**File:** `src/components/ProviderIcon.tsx` — lines 13–38, 46–65, 72–107

**Grep result:**
```
src/components/ProviderIcon.tsx:15:  <svg width={size} height={size} viewBox="0 0 24 24" ...>
src/components/ProviderIcon.tsx:48:  <svg width={size} height={size} viewBox="0 0 24 24" ...>
src/components/ProviderIcon.tsx:74:  <svg width={size} height={size} viewBox="0 0 24 24" ...>
```

**Mô tả vi phạm:** Ba SVG icons cho Gemini, Claude, OpenAI được define inline trong `ProviderIcon.tsx` thay vì được quản lý qua icon registry `src/components/ui/icons/`. File `ProviderIcon.tsx` cũng export `PROVIDER_COLORS` map — đây là business data (màu sắc, Tailwind classes) nên giữ lại ở đây, nhưng phần SVG icon cần di chuyển.

**Icon registry hiện có:** `src/components/ui/icons/` có categories: actions, navigation, media, status, auth, files. Chưa có category `providers`.

**Kế hoạch fix:**
```
Bước 1: Tạo src/components/ui/icons/providers.tsx
Bước 2: Move GeminiIcon, ClaudeIcon, OpenAIIcon vào providers.tsx (export public)
Bước 3: src/components/ui/icons/index.ts ← export * from './providers'
Bước 4: ProviderIcon.tsx import { GeminiIcon, ClaudeIcon, OpenAIIcon } from './ui/icons'
Bước 5: Giữ PROVIDER_COLORS và ProviderIcon component trong ProviderIcon.tsx
```

**Code template:**
```tsx
// src/components/ui/icons/providers.tsx
import type { IconProps } from './types'

/** Google Gemini — Official 4-pointed star (sparkle) icon. Brand color: #1A73E8 */
export function GeminiProviderIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Google Gemini</title>
      <path d="M12 2C12.3 5.5 13.8 8.8 16 10.5C13.8 12.2 12.3 15.5 12 19C11.7 15.5 10.2 12.2 8 10.5C10.2 8.8 11.7 5.5 12 2Z" fill="#1A73E8" />
      {/* ... other paths */}
    </svg>
  )
}

export function ClaudeProviderIcon({ size = 20 }: { size?: number }) { /* ... */ }
export function OpenAIProviderIcon({ size = 20 }: { size?: number }) { /* ... */ }
```

---

### 🟡 SPLIT-ICON-02 — VoiceRecorder.tsx: Stop square SVG inline (Medium)

**File:** `src/components/VoiceRecorder.tsx` — line 355

**Grep result:**
```
src/components/VoiceRecorder.tsx:355: <svg className="w-3.5 h-3.5 relative z-10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
```

**Code trích dẫn:**
```tsx
{/* Stop square — rect-based design kept intentionally (distinct from path-based StopIcon) */}
<svg className="w-3.5 h-3.5 relative z-10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <rect x="6" y="6" width="12" height="12" rx="2" />
</svg>
```

**Mô tả vi phạm:** Comment giải thích tại sao khác `StopIcon` (rect vs path), nhưng icon này vẫn nên được định nghĩa trong registry để có thể tái sử dụng ở nơi khác (e.g., future video recorder).

**Icon đã có trong registry:** `StopIcon` trong `media.tsx` dùng `path`. Cần thêm `StopSquareIcon` riêng.

**Kế hoạch fix:**
```
Bước 1: Thêm StopSquareIcon vào src/components/ui/icons/media.tsx
Bước 2: Export qua index.ts (đã auto-export qua export * from './media')
Bước 3: VoiceRecorder.tsx: import { StopSquareIcon } from './ui/icons'
Bước 4: Replace inline SVG bằng <StopSquareIcon className="w-3.5 h-3.5 relative z-10" />
```

**Code template:**
```tsx
// src/components/ui/icons/media.tsx — thêm vào cuối file:
/** Stop square — rounded rectangle variant (distinct from path-based StopIcon). Used in VoiceRecorder. */
export function StopSquareIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}
```

---

## Vấn đề 2: UI Pattern Duplicate

### 🟠 SPLIT-DUP-01 — Image attachment preview pattern duplicate (High)

**Mô tả:** `ImageAttachmentPreview.tsx` đã tồn tại và được dùng trong `TranslatePage.tsx`, nhưng `ChatPage.tsx` vẫn inline lại cùng JSX pattern thay vì dùng component.

**File 1:** `src/components/translate/ImageAttachmentPreview.tsx` (component đã tách)
```tsx
export function ImageAttachmentPreview({ imageAttachment, onRemove }) {
  return (
    <div className="flex-shrink-0 px-4 pt-4 pb-1 flex items-start">
      <div className="relative group">
        <img
          src={imageAttachment.previewDataUrl}   // ← field: previewDataUrl
          alt={imageAttachment.fileName}
          className="w-32 h-32 object-cover rounded-3xl shadow-sm border ..."
        />
        <button
          onClick={onRemove}
          title="Remove image"
          className="absolute -top-2 -right-2 ... z-10"  // ← có z-10
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
```

**File 2:** `src/pages/ChatPage.tsx` — lines 464–484 (inline duplicate)
```tsx
{attachedImage && (
  <div className="px-4 pt-4 pb-1 flex items-start">   // ← thiếu flex-shrink-0
    <div className="relative group">
      <img
        src={attachedImage.previewUrl}              // ← field: previewUrl (khác!)
        alt={attachedImage.fileName}
        className="w-32 h-32 object-cover rounded-3xl shadow-sm border ..."
      />
      <button
        onClick={() => setAttachedImage(null)}
        title={t.chat_remove_image}
        className="absolute -top-2 -right-2 ... "   // ← thiếu z-10
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
)}
```

**Inconsistency:**
1. `flex-shrink-0` missing trong ChatPage version
2. `z-10` missing trên button trong ChatPage version  
3. Field name khác: `previewDataUrl` vs `previewUrl` — type mismatch giữa `ImageAttachment` (translate) và chat attachment type

**Kế hoạch fix — Option A (recommended): Mở rộng ImageAttachmentPreview**
```tsx
// src/components/translate/ImageAttachmentPreview.tsx
// Thêm optional prop cho chat use case:
interface ImageAttachmentPreviewProps {
  previewDataUrl: string   // ← rename từ imageAttachment.previewDataUrl
  fileName: string
  onRemove: () => void
  removeTitle?: string     // ← optional i18n title
}

// Hoặc tạo ChatImagePreview dùng cùng pattern:
// src/components/chat/ChatImagePreview.tsx
```

**Kế hoạch fix — Option B: Tạo generic component**
```tsx
// src/components/ui/ImagePreviewThumbnail.tsx
interface ImagePreviewThumbnailProps {
  src: string
  alt: string
  removeTitle: string
  onRemove: () => void
  className?: string
}

export function ImagePreviewThumbnail({ src, alt, removeTitle, onRemove }: ImagePreviewThumbnailProps) {
  return (
    <div className="flex-shrink-0 px-4 pt-4 pb-1 flex items-start">
      <div className="relative group">
        <img src={src} alt={alt} className="w-32 h-32 object-cover rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700" />
        <button
          type="button"
          onClick={onRemove}
          title={removeTitle}
          className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center
                     rounded-full bg-gray-700/90 hover:bg-gray-900 text-white cursor-pointer shadow-md
                     opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// Dùng trong ChatPage.tsx:
{attachedImage && (
  <ImagePreviewThumbnail
    src={attachedImage.previewUrl}
    alt={attachedImage.fileName}
    removeTitle={t.chat_remove_image}
    onRemove={() => setAttachedImage(null)}
  />
)}

// Dùng trong ImageAttachmentPreview.tsx:
export function ImageAttachmentPreview({ imageAttachment, onRemove }) {
  return (
    <ImagePreviewThumbnail
      src={imageAttachment.previewDataUrl}
      alt={imageAttachment.fileName}
      removeTitle="Remove image"
      onRemove={onRemove}
    />
  )
}
```

---

## Vấn đề 3: Sub-component Inline quá lớn

### 🟡 SPLIT-INLINE-01 — `badge()` function trong `ApiKeyInput.tsx` (33 dòng)

**File:** `src/components/ApiKeyInput.tsx` — lines 82–115

**Code trích dẫn:**
```tsx
// Badge element (33 dòng)
const badge = () => {
  if (isError) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
        {t.settings_key_invalid}
      </span>
    )
  }
  if (isSuccess || hasKey) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 ...">
        ...
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 ...">
      ...
    </span>
  )
}
```

**Mô tả:** `badge()` là 33-dòng inline function (vượt ngưỡng 30). Được gọi 1 lần (`{badge()}`). Nó truy cập `isError`, `isSuccess`, `hasKey`, `t` từ closure của component cha — nên nó là implicit inline component.

**Phân tích:**
- `badge()` pattern với status (error/success/idle) là pattern tái sử dụng được — có thể cần trong `ModelSelector` hoặc future API integrations.
- Tuy nhiên, nó đang truy cập 4 state variables từ parent — nếu extract thành component riêng cần pass tất cả như props.

**Kế hoạch fix:**
```tsx
// Tách ra hoặc đổi thành JSX trực tiếp trong return:
// Thay vì gọi badge() → dùng conditional JSX trực tiếp,
// hoặc extract thành:

interface ApiKeyStatusBadgeProps {
  isError: boolean
  isSuccess: boolean
  hasKey: boolean
  labelInvalid: string
  labelSaved: string
  labelNoKey: string
}

export function ApiKeyStatusBadge({ isError, isSuccess, hasKey, labelInvalid, labelSaved, labelNoKey }: ApiKeyStatusBadgeProps) {
  if (isError) { return <span ...>{labelInvalid}</span> }
  if (isSuccess || hasKey) { return <span ...>{labelSaved}</span> }
  return <span ...>{labelNoKey}</span>
}
```

---

## Vấn đề 4: Component đặt sai thư mục

**Không phát hiện vi phạm.** Tất cả components đều ở đúng vị trí theo phân loại Reusable / Feature-specific.

> **Lưu ý:** `Notice` và `EmptyPanel` là inline functions trong `LiveTranslatePage.tsx` (10 và 12 dòng) — dưới ngưỡng 30 dòng, chấp nhận được theo quy tắc false positive.

---

## Vấn đề 5: Emoji dùng làm Icon

**Không phát hiện vi phạm.**

- `p?.emoji` trong ModelSelector/ProviderIcon là provider metadata (emoji badge từ PROVIDERS config), **không phải icon UI** — đây là false positive theo quy tắc.
- `{/* TODO: H-8 */}` "Chrome Extension" label không chứa emoji.
- Không có emoji ký tự được render như icon UI trong bất kỳ component nào.

---

## Kế hoạch tách component (action plan)

| Ưu tiên | Action | File nguồn | File đích | Component/Icon mới |
|---|---|---|---|---|
| 🟠 High 1 | Tạo icon category mới | `ProviderIcon.tsx` | `src/components/ui/icons/providers.tsx` | `GeminiProviderIcon`, `ClaudeProviderIcon`, `OpenAIProviderIcon` |
| 🟠 High 2 | Loại bỏ image preview duplicate | `src/pages/ChatPage.tsx` | `src/components/ui/ImagePreviewThumbnail.tsx` | `ImagePreviewThumbnail` |
| 🟡 Medium 3 | Thêm StopSquareIcon | `VoiceRecorder.tsx` | `src/components/ui/icons/media.tsx` | `StopSquareIcon` |
| 🟡 Medium 4 | Extract badge sub-component | `ApiKeyInput.tsx` | `src/components/ui/ApiKeyStatusBadge.tsx` | `ApiKeyStatusBadge` |

---

## Tóm tắt & Ưu tiên

### Nhận xét chung

Project đã có nền tảng component organization **rất tốt**:
- Icon registry `src/components/ui/icons/` được thiết lập với categories rõ ràng (actions, navigation, media, status, auth, files)
- Feature-specific components được tách vào subfolders (`chat/`, `translate/`)
- Reusable UI primitives đặt đúng trong `src/components/ui/`
- Tất cả settings sections đã extract sang `src/pages/settings/`
- History tabs đã extract sang `src/pages/history/`

**4 vấn đề tìm được đều là refinement opportunities**, không phải structural problem. So với report lần trước, project đã tiến bộ đáng kể trong việc tách components.

### Action items theo mức độ ưu tiên

**🟠 Cần làm trước:**
1. **Move provider icons sang registry** — đây là vi phạm rõ ràng nhất của quy tắc icon management đã đặt ra. ~2h.
2. **Tạo `ImagePreviewThumbnail` hoặc dùng lại `ImageAttachmentPreview` trong ChatPage** — loại bỏ UI inconsistency (thiếu `flex-shrink-0`, `z-10`). ~1h.

**🟡 Làm trong sprint tiếp theo:**
3. **Thêm `StopSquareIcon` vào media.tsx** — đơn giản, 15 phút.
4. **Extract `badge()` thành `ApiKeyStatusBadge`** — cải thiện reusability. ~1h.
