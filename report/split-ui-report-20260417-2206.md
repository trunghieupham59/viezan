# Báo cáo phân tích UI Component — split-ui-component
**Ngày:** 17/04/2026 22:06  
**Cập nhật:** 17/04/2026 22:18 — Bổ sung đánh giá chi tiết `src/components/ui/`  
**Phạm vi:** `src/components/` và `src/pages/`  
**Workflow:** `split-ui-component v1.0.0`

---

## Tổng quan

| Loại vấn đề | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|-------------|--------|---------|------|------|
| SVG Icon Hardcode Inline | 16 | 0 | 4 | 20 |
| UI Pattern Duplicate | 2 | 1 | 0 | 3 |
| Sub-component Inline quá lớn | 0 | 4 | 0 | 4 |
| Component đặt sai thư mục | 0 | 1 | 0 | 1 |
| Emoji dùng làm Icon | 0 | 3 | 0 | 3 |
| **Tổng** | **18** | **9** | **4** | **31** |

**File bị ảnh hưởng nhiều nhất:**
1. `src/pages/HistoryPage.tsx` — 13 SVG inline + 3 sub-component lớn + 3 duplicate buttons
2. `src/pages/ChatPage.tsx` — 1 sub-component lớn (113 dòng) + 1 UI pattern duplicate
3. `src/components/Sidebar.tsx` — 2 SVG inline (navigation icons)

---

## Bản đồ Component

### Reusable (src/components/ui/) — 20 component

| Component | Tiêu chí | Dùng ở (file) | Ghi chú |
|-----------|----------|--------------|--------|
| AutoTranslateToggle.tsx | ⚠️ 4/5 | `TranslatePage` | Tiêu chí 5 fail: `'Auto'`/`'Manual'` hardcode — cần `labelAuto`, `labelManual` props |
| BookmarkletDragLink.tsx | ⚠️ 4/5 | `BrowserIntegrationSection` | Tiêu chí 5 fail: `'🌐 Lotus Translate'` hardcode — cần `label` prop |
| ButtonGroup.tsx | ✅ 5/5 | `FontSizePicker`, `TokenTtlPicker` | Base component cho 2 picker — tái sử dụng tốt |
| CheckUpdateButton.tsx | ✅ 5/5 | `UpdaterSection` | Đúng vị trí |
| ClearButton.tsx | ✅ 5/5 | `TranslatePage` | 24 dòng — nhỏ nhưng pass 5/5, đúng vị trí |
| CopyButton.tsx | ✅ 5/5 | `TranslatePage` | Đúng vị trí |
| FontSizePicker.tsx | ✅ 5/5 | `PreferencesSection` | 26 dòng — đúng vị trí |
| HotkeyRecordButton.tsx | ✅ 5/5 | `HotkeySection` | Đúng vị trí |
| ImageTranslateButton.tsx | ✅ 5/5 | `TranslatePage` | 27 dòng — đúng vị trí |
| MiniToggleTrack.tsx | ✅ 5/5 | `AutoTranslateToggle`, `PhoneticToggle` | Shared visual sub-component — tái sử dụng đúng |
| PhoneticToggle.tsx | ✅ 5/5 | `TranslatePage` | Đúng vị trí |
| PresetActions.tsx | ✅ 5/5 | `ChatPresetsSection` | Props-only — đúng vị trí |
| RewriteButton.tsx | 🔶 5/5* | `TranslatePage` (×2) | Pass 5/5 nhưng type `RewritePanel='source'\|'translated'` hơi domain-specific — giữ nguyên OK |
| SettingsCopyButton.tsx | ✅ 5/5 | `BrowserIntegrationSection` | Đúng vị trí |
| SettingsFormActions.tsx | ✅ 5/5 | `BrowserIntegration` + `ChatPresets` **(2 nơi)** | Tái sử dụng tốt |
| SpeakButton.tsx | 🔶 5/5* | `TranslatePage` (×2) | Pass 5/5 nhưng type `SpeakPanel='source'\|'translated'` hơi domain-specific — giữ nguyên OK |
| ToggleSwitch.tsx | ✅ 5/5 | `BrowserIntegration`+`Hotkey`+`Preferences` **(3 nơi)** | Tái sử dụng nhiều nhất |
| TokenTtlPicker.tsx | ✅ 5/5 | `BrowserIntegrationSection` | 28 dòng — đúng vị trí |
| TranslateButton.tsx | ✅ 5/5 | `TranslatePage` | Đúng vị trí |
| TtsVoicePicker.tsx | 🔶 4.5/5 | `TtsSection` | Hardcode `VOICE_COLORS` cho 6 TTS voices — domain logic bên trong, nhưng chấp nhận được |

> 🔶 = Borderline tiêu chí 3 (domain-agnostic) — vẫn đúng vị trí, không cần di chuyển

**Cần tạo thêm vào ui/:**
| Component | Lý do | Tách từ đâu |
|-----------|-------|-------------|
| `DownloadImageButton` | 2 download button giống hệt nhau trong TranslatePage | `TranslatePage.tsx:823-855` |
| `HistoryDeleteButton` | Delete button giống hệt lặp 3 lần trong HistoryPage | `HistoryPage.tsx:179,316,503` |

---

### Feature-specific (src/components/{feature}/)

| Component | Feature | Trạng thái | Ghi chú |
|-----------|---------|----------|--------|
| chat/SystemPromptDropdown.tsx | chat | ✅ Đúng vị trí | Quản lý dropdown state, nhận chatSystemPrompt qua props |
| translate/DragOverlay.tsx | translate | ⚠️ SAI VỊ TRÍ | Pass **5/5** reusable criteria, dùng ở cả translate + chat → nên ở `ui/` |
| translate/ImageAttachmentPreview.tsx | translate | ✅ Đúng vị trí | Layout đặc thù preview ảnh đính kèm |
| translate/VoiceOverlay.tsx | translate | ✅ Đúng vị trí | Complex animation + state gắn với voice recording |

---

### Root-level Reusable (src/components/*.tsx)

| Component | Ghi chú |
|-----------|--------|
| AppLogo.tsx | ✅ OK — pass 5/5 |
| ApiKeyInput.tsx | ⚠️ Gọi `useT()` bên trong — acceptable ở root |
| FuriganaText.tsx | ✅ OK — pass 5/5 |
| ImageTranslator.tsx | ⚠️ Gọi `useT()`; có 1 SVG inline cần sửa |
| LanguageSelector.tsx | ⚠️ Gọi `useT()` bên trong — acceptable ở root |
| MarkdownEditor.tsx | ✅ OK — pass 5/5 |
| MarkdownText.tsx | ✅ OK — pass 5/5 |
| ModelSelector.tsx | ⚠️ Gọi `useAppStore()` bên trong — tightly coupled với store |
| ProviderIcon.tsx | ⚠️ Chứa 3 SVG brand logos — special case, xem mục SVG |
| Sidebar.tsx | ⚠️ Gọi `useAppStore()`; 2 SVG inline cần sửa |
| VoiceRecorder.tsx | ⚠️ 1 SVG inline (rect stop) — intentional, xem mục SVG |

---

### Component cần tách thành file riêng

| Component | File hiện tại | Dòng | Kích thước | Vị trí đề xuất |
|-----------|--------------|------|------------|----------------|
| `MessageBubble` | `ChatPage.tsx` | 36-148 | **113 dòng** | `src/components/chat/MessageBubble.tsx` |
| `TranslationHistoryTab` | `HistoryPage.tsx` | 42-201 | **160 dòng** | `src/pages/history/TranslationHistoryTab.tsx` |
| `ChatHistoryTab` | `HistoryPage.tsx` | 204-339 | **136 dòng** | `src/pages/history/ChatHistoryTab.tsx` |
| `LiveHistoryTab` | `HistoryPage.tsx` | 342-527 | **186 dòng** | `src/pages/history/LiveHistoryTab.tsx` |

---

## Đánh giá chi tiết src/components/ui/ — Vấn đề cần sửa

### ⚠️ Component fail tiêu chí 5 (Label hardcode thay vì qua props)

#### [UI-Fix-01] AutoTranslateToggle.tsx — Tiêu chí 5 FAIL
**File:** `src/components/ui/AutoTranslateToggle.tsx:39`  
**Kích thước:** 42 dòng | **Dùng ở:** `TranslatePage.tsx` (1 lần)

```tsx
// ❌ Hiện tại — hardcode "Auto" / "Manual" tiếng Anh
<span>{autoTranslate ? 'Auto' : 'Manual'}</span>
```

**Vấn đề:** Tiêu chí 5 (Label qua props) FAIL — labels hiển thị trực tiếp trên button phải nhận từ ngoài để support i18n.

**Sửa — thêm 2 props:**
```tsx
// src/components/ui/AutoTranslateToggle.tsx
interface AutoTranslateToggleProps {
  autoTranslate: boolean
  onChange: (value: boolean) => void
  titleAuto: string
  titleManual: string
  labelAuto: string    // ← thêm mới
  labelManual: string  // ← thêm mới
}

export function AutoTranslateToggle({
  autoTranslate, onChange, titleAuto, titleManual,
  labelAuto, labelManual,  // ← thêm
}: AutoTranslateToggleProps) {
  return (
    <button ...>
      <MiniToggleTrack checked={autoTranslate} color="green" />
      <span>{autoTranslate ? labelAuto : labelManual}</span>  {/* ← dùng props */}
    </button>
  )
}

// TranslatePage.tsx — cập nhật nơi dùng
<AutoTranslateToggle
  autoTranslate={autoTranslate}
  onChange={setAutoTranslate}
  titleAuto={t.translate_mode_auto_title}
  titleManual={t.translate_mode_manual_title}
  labelAuto={t.translate_mode_auto}    // ← thêm (cần thêm key i18n)
  labelManual={t.translate_mode_manual} // ← thêm (cần thêm key i18n)
/>
```

> **Cần thêm i18n key:** `translate_mode_auto` = "Auto" (vi: "Tự động", ja: "自動"), `translate_mode_manual` = "Manual" (vi: "Thủ công", ja: "手動") vào `src/i18n/locales/`.

---

#### [UI-Fix-02] BookmarkletDragLink.tsx — Tiêu chí 5 FAIL
**File:** `src/components/ui/BookmarkletDragLink.tsx:56`  
**Kích thước:** 60 dòng | **Dùng ở:** `BrowserIntegrationSection.tsx` (1 lần)

```tsx
// ❌ Hiện tại — hardcode brand text + emoji trong draggable link
🌐 Lotus Translate
```

**Vấn đề:** Tiêu chí 5 FAIL — "🌐 Lotus Translate" là text hiển thị UI hardcode trong component thay vì nhận qua props.

**Sửa — thêm prop `label`:**
```tsx
// src/components/ui/BookmarkletDragLink.tsx
interface BookmarkletDragLinkProps {
  href: string
  loadingText: string
  label: string  // ← thêm mới
}

export function BookmarkletDragLink({ href, loadingText, label }: BookmarkletDragLinkProps) {
  // ...
  return (
    <a ...>
      <LayersIcon className="w-4 h-4 text-blue-500" />
      {label}   {/* ← thay hardcode */}
      <ArrowUpIcon className="w-3.5 h-3.5 text-blue-400" />
    </a>
  )
}

// BrowserIntegrationSection.tsx — cập nhật nơi dùng
<BookmarkletDragLink
  href={bookmarkletHref}
  loadingText={t.settings_bookmarklet_loading}
  label={t.settings_bookmarklet_label}  // ← thêm (cần thêm key i18n)
/>
```

> **Cần thêm i18n key:** `settings_bookmarklet_label` = "🌐 Lotus Translate" (giữ emoji trong i18n string vì là branding, hoặc remove emoji nếu muốn thuần text).

---

### 🔶 Component borderline tiêu chí 3 — Không cần thay đổi ngay

| Component | Vấn đề | Verdict |
|-----------|--------|---------|
| `RewriteButton` | Exports `RewritePanel = 'source' \| 'translated'` — tên type gắn domain | ✅ Giữ nguyên — logic generic (2-state button), tên type không ảnh hưởng tính reusable |
| `SpeakButton` | Exports `SpeakPanel = 'source' \| 'translated'` — tương tự | ✅ Giữ nguyên |
| `TtsVoicePicker` | Hardcode `VOICE_COLORS` cho 6 TTS voices OpenAI bên trong | ⚠️ Optional: refactor `VOICE_COLORS` ra props nếu muốn strict reusable |

---

### ❓ Câu hỏi: Component nào nên để inline thay vì tách?

**Không có component nào cần về inline.** Quy tắc workflow:

> *"Sub-component inline < 30 dòng — chấp nhận được"* có nghĩa: nếu đang **ở inline** và < 30 dòng, **không bắt buộc phải tách**. Không có nghĩa: component đã tách ra file riêng thì phải xóa đi vì nó nhỏ.

Các component nhỏ trong ui/ (ClearButton 24, FontSizePicker 26, ImageTranslateButton 27, TokenTtlPicker 28 dòng) đều **pass 5/5 tiêu chí** → **đúng vị trí**, không cần về inline.

---

## Vấn đề: SVG Icon Hardcode Inline

### 🟠 HIGH — 16 vi phạm rõ ràng

---

#### [High-SVG-01] Sidebar.tsx — Chat bubble icon
**File:** `src/components/Sidebar.tsx:74-78`
```tsx
<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97..." />
</svg>
```
**Vấn đề:** Chat bubble icon viết SVG trực tiếp vào JSX thay vì dùng icon registry  
**Icon đề xuất:** `ChatBubbleIcon` → `navigation.tsx` (icon điều hướng chat)  
**Dùng lại ở:** `HistoryPage.tsx:221`, `HistoryPage.tsx:309` (cùng path data)  
**Sửa:**
```tsx
// 1. Thêm vào src/components/ui/icons/navigation.tsx
/** Chat bubble icon — used on chat navigation items. */
export function ChatBubbleIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  )
}
// 2. Dùng trong Sidebar.tsx, HistoryPage.tsx
import { ChatBubbleIcon } from './ui/icons'
<ChatBubbleIcon className="w-5 h-5" />
```

---

#### [High-SVG-02] Sidebar.tsx — Clock/History icon
**File:** `src/components/Sidebar.tsx:103-107`
```tsx
<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
</svg>
```
**Vấn đề:** Đồng hồ/lịch sử icon viết inline  
**Icon đề xuất:** `ClockIcon` → `navigation.tsx`  
**Dùng lại ở:** `HistoryPage.tsx:93` (cùng path data)  
**Sửa:**
```tsx
// 1. Thêm vào src/components/ui/icons/navigation.tsx
/** Clock icon — used on history navigation items. */
export function ClockIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
// 2. Dùng trong Sidebar.tsx, HistoryPage.tsx
<ClockIcon className="w-5 h-5" />
```

---

#### [High-SVG-03] ImageTranslator.tsx — Upload icon (đã có trong registry!)
**File:** `src/components/ImageTranslator.tsx:157-160`
```tsx
<svg className={`w-7 h-7 transition-colors ${isDragging ? 'text-emerald-500' : 'text-gray-400'}`}
     viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round"
    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
</svg>
```
**Vấn đề:** `UploadIcon` đã có trong registry nhưng không được dùng  
**Icon đề xuất:** `UploadIcon` (đã có trong `actions.tsx`)  
**Sửa:**
```tsx
import { UploadIcon } from './ui/icons'
<UploadIcon className={`w-7 h-7 transition-colors ${isDragging ? 'text-emerald-500' : 'text-gray-400'}`} />
```

---

#### [High-SVG-04] HistoryPage.tsx — Clock icon (dùng ClockIcon mới)
**File:** `src/pages/HistoryPage.tsx:93-96`  
**Nội dung:** Cùng path data với `Sidebar.tsx:103` (clock/history icon)  
**Sửa:** Dùng `ClockIcon` sau khi tạo ở [High-SVG-02]
```tsx
import { ClockIcon } from '../components/ui/icons'
<ClockIcon className="w-7 h-7 text-gray-300 dark:text-gray-600" />
```

---

#### [High-SVG-05] HistoryPage.tsx — Chevron down (đã có trong registry!)
**File:** `src/pages/HistoryPage.tsx:123-128`
```tsx
<svg className={`flex-shrink-0 w-4 h-4 text-gray-300 ...`}
  fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
</svg>
```
**Vấn đề:** `ChevronDownIcon` đã có nhưng không được dùng  
**Sửa:**
```tsx
import { ChevronDownIcon } from '../components/ui/icons'
<ChevronDownIcon className={`flex-shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600 transition-transform duration-200 mt-0.5 ${isExpanded ? 'rotate-180' : ''}`} />
```
**Xuất hiện tại:** `HistoryPage.tsx:123`, `HistoryPage.tsx:257`, `HistoryPage.tsx:428` (3 lần — cùng pattern)

---

#### [High-SVG-06] HistoryPage.tsx — Reuse/back arrow icon (cần tạo mới)
**File:** `src/pages/HistoryPage.tsx:170-173`
```tsx
<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
</svg>
```
**Vấn đề:** Icon "reuse" (mũi tên quay về) viết inline, chưa có trong registry  
**Icon đề xuất:** `ReuseIcon` → `actions.tsx`  
**Sửa:**
```tsx
// 1. Thêm vào src/components/ui/icons/actions.tsx
/** Reuse / return-arrow icon — used on "reuse in translate" history buttons. */
export function ReuseIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  )
}
// 2. Dùng trong HistoryPage.tsx
import { ReuseIcon } from '../components/ui/icons'
<ReuseIcon />
```

---

#### [High-SVG-07] HistoryPage.tsx — Trash icon (đã có trong registry! ×3 lần)
**File:** `src/pages/HistoryPage.tsx:184-187`, `HistoryPage.tsx:323-326`, `HistoryPage.tsx:510-513`
```tsx
<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
</svg>
```
**Vấn đề:** `TrashIcon` đã có nhưng không được dùng — lặp **3 lần**  
**Sửa:**
```tsx
import { TrashIcon } from '../components/ui/icons'
<TrashIcon className="w-3.5 h-3.5" />
```

---

#### [High-SVG-08] HistoryPage.tsx — Chat bubble icon ×2 (dùng ChatBubbleIcon mới)
**File:** `src/pages/HistoryPage.tsx:221-225` và `src/pages/HistoryPage.tsx:309-313`  
**Nội dung:** Cùng path data với `Sidebar.tsx:74` (chat bubble icon)  
**Sửa:** Dùng `ChatBubbleIcon` sau khi tạo ở [High-SVG-01]
```tsx
import { ChatBubbleIcon } from '../components/ui/icons'
<ChatBubbleIcon className="w-7 h-7 text-gray-300 dark:text-gray-600" />
<ChatBubbleIcon className="w-3.5 h-3.5" />
```

---

#### [High-SVG-09] HistoryPage.tsx — Microphone icon (đã có trong registry! ×2 lần)
**File:** `src/pages/HistoryPage.tsx:390-396` và `src/pages/HistoryPage.tsx:495-499`
```tsx
<svg className="w-7 h-7 text-purple-300 dark:text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
    d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 10v2a7 7 0 0 1-14 0v-2" />
  <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" strokeWidth={1.5} />
  <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" strokeWidth={1.5} />
</svg>
```
**Vấn đề:** Path data giống hệt `MicrophoneIcon` trong `media.tsx` nhưng không import  
**Sửa:**
```tsx
import { MicrophoneIcon } from '../components/ui/icons'
<MicrophoneIcon className="w-7 h-7 text-purple-300 dark:text-purple-700" />
```

---

#### [High-SVG-10] LiveTranslatePage.tsx — Arrow right (đã có trong registry!)
**File:** `src/pages/LiveTranslatePage.tsx:78-80`
```tsx
<svg className="flex-shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
</svg>
```
**Vấn đề:** `ArrowRightIcon` đã có trong `actions.tsx` nhưng không được dùng  
**Sửa:**
```tsx
import { ArrowRightIcon } from '../components/ui/icons'
<ArrowRightIcon className="flex-shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600" />
```

---

### 🟢 LOW — 4 trường hợp đặc biệt (không yêu cầu sửa ngay)

#### [Low-SVG-11] ProviderIcon.tsx — Brand logos (3 SVG)
**File:** `src/components/ProviderIcon.tsx:15`, `:48`, `:74`  
**Nội dung:** SVG icon cho Gemini, Claude, OpenAI — brand logos cụ thể  
**Đánh giá:** Đây là brand identity SVGs, không thể thay bằng generic icon. Nằm trong component chuyên dụng `ProviderIcon.tsx`. **Chấp nhận được** nhưng lý tưởng là tách thành `src/components/ui/icons/providers.tsx`.

#### [Low-SVG-12] VoiceRecorder.tsx — Rect-based stop icon (intentional)
**File:** `src/components/VoiceRecorder.tsx:355-357`
```tsx
{/* Stop square — rect-based design kept intentionally (distinct from path-based StopIcon) */}
<svg className="w-3.5 h-3.5 relative z-10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <rect x="6" y="6" width="12" height="12" rx="2" />
</svg>
```
**Đánh giá:** Có comment giải thích ý đồ thiết kế — dùng `<rect>` thay vì `<path>` để khác biệt thị giác với `StopIcon`. **Chấp nhận được** nhưng lý tưởng là tạo `StopSquareIcon` trong registry để giữ tính nhất quán.

---

## Vấn đề: Emoji dùng làm Icon

### 🟡 MEDIUM

#### [Med-Emoji-01] TranslatePage.tsx — ⚠ Warning emoji
**File:** `src/pages/TranslatePage.tsx:706`
```tsx
<span className="text-xs tabular-nums text-amber-500 font-medium" title={t.translate_limit}>
  ⚠ {charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
</span>
```
**Vấn đề:** `⚠` emoji dùng làm warning indicator trong UI  
**Sửa:**
```tsx
import { AlertTriangleIcon } from '../components/ui/icons'
<span className="flex items-center gap-1 text-xs tabular-nums text-amber-500 font-medium" title={t.translate_limit}>
  <AlertTriangleIcon className="w-3 h-3 flex-shrink-0" />
  {charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
</span>
```

---

#### [Med-Emoji-02] BrowserIntegrationSection.tsx — ⚠ Warning emoji ×2
**File:** `src/pages/settings/BrowserIntegrationSection.tsx:400`, `:411`
```tsx
<span>⚠</span>
```
**Vấn đề:** `⚠` emoji dùng như warning icon trong settings form  
**Sửa:**
```tsx
import { AlertTriangleIcon } from '../../components/ui/icons'
<AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
```

---

### FALSE POSITIVE — Không phải vi phạm

| Trường hợp | Lý do |
|-----------|-------|
| `HistoryPage.tsx:36` — `{p?.emoji ?? '🤖'}` trong `ProviderBadge` | Provider metadata badge — không phải UI icon |
| `BookmarkletDragLink.tsx:56` — `🌐 Lotus Translate` | Text label/branding của bookmarklet draggable |

---

## Vấn đề: UI Pattern Duplicate

### 🟠 HIGH

#### [High-Dup-01] TranslatePage.tsx — 2 download image buttons giống hệt nhau
**File:** `src/pages/TranslatePage.tsx:823-840` và `src/pages/TranslatePage.tsx:843-855`

```tsx
{/* Button 1 — line 823: Gemini image-edit result */}
{editedImageUrl && (
  <button type="button" title={t.image_translate_download}
    onClick={() => { const a = document.createElement('a'); a.href = editedImageUrl; a.download = ...; a.click() }}
    className="relative flex items-center justify-center w-8 h-8 rounded-full
               transition-all duration-200 cursor-pointer
               text-gray-400 hover:text-emerald-500 hover:bg-emerald-50
               dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
  >
    <DownloadIcon />
  </button>
)}

{/* Button 2 — line 843: canvas-overlay regions fallback */}
{imageRegions && imageAttachment && !editedImageUrl && (
  <button type="button" onClick={handleDownloadTranslatedImage}
    title={t.image_translate_download}
    className="relative flex items-center justify-center w-8 h-8 rounded-full
               transition-all duration-200 cursor-pointer
               text-gray-400 hover:text-emerald-500 hover:bg-emerald-50
               dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
  >
    <DownloadIcon />
  </button>
)}
```
**Vấn đề:** Cùng className (5 dòng), cùng icon, cùng title → duplicate  
**Đề xuất:** Tách thành `DownloadImageButton` trong `src/components/ui/DownloadImageButton.tsx`
```tsx
// src/components/ui/DownloadImageButton.tsx
interface DownloadImageButtonProps {
  onClick: () => void
  title: string
}
export function DownloadImageButton({ onClick, title }: DownloadImageButtonProps) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="relative flex items-center justify-center w-8 h-8 rounded-full
                 transition-all duration-200 cursor-pointer
                 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50
                 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
    >
      <DownloadIcon />
    </button>
  )
}

// TranslatePage.tsx — dùng lại
import { DownloadImageButton } from '../components/ui/DownloadImageButton'
{editedImageUrl && (
  <DownloadImageButton title={t.image_translate_download}
    onClick={() => { const a = document.createElement('a'); a.href = editedImageUrl; a.download = `translated_${Date.now()}.png`; a.click() }}
  />
)}
{imageRegions && imageAttachment && !editedImageUrl && (
  <DownloadImageButton title={t.image_translate_download} onClick={handleDownloadTranslatedImage} />
)}
```

---

#### [High-Dup-02] HistoryPage.tsx — Delete button lặp 3 lần (3 tab)
**File:** `src/pages/HistoryPage.tsx:179-188` (TranslationHistoryTab), `:316-327` (ChatHistoryTab), `:503-515` (LiveHistoryTab)

Cả 3 nơi đều có pattern:
```tsx
<button type="button"
  onClick={() => deleteXxx(item.id)}
  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
             bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500
             dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-red-950 dark:hover:text-red-400
             font-medium transition-colors"
>
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862 a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
  {t.history_xxx_delete}
</button>
```
**Vấn đề:** Cùng className 6 dòng + cùng SVG TrashIcon inline, lặp **3 lần** đúng nguyên xi  
**Đề xuất:** Tách thành component chung (có thể đặt trong `src/components/ui/`)
```tsx
// src/components/ui/HistoryDeleteButton.tsx  (hoặc generic IconTextButton)
interface HistoryDeleteButtonProps {
  onClick: () => void
  label: string
}
export function HistoryDeleteButton({ onClick, label }: HistoryDeleteButtonProps) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                 bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500
                 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-red-950 dark:hover:text-red-400
                 font-medium transition-colors"
    >
      <TrashIcon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}
```

---

### 🟡 MEDIUM

#### [Med-Dup-03] ChatPage.tsx — Inline image preview duplicate ImageAttachmentPreview
**File:** `src/pages/ChatPage.tsx:576-595`

```tsx
{/* ChatPage.tsx — inline (576-595) */}
{attachedImage && (
  <div className="px-4 pt-4 pb-1 flex items-start">
    <div className="relative group">
      <img src={attachedImage.previewUrl} alt={attachedImage.fileName}
        className="w-32 h-32 object-cover rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700" />
      <button type="button" onClick={() => setAttachedImage(null)}
        title={t.chat_remove_image}
        className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center
                   rounded-full bg-gray-700/90 hover:bg-gray-900 text-white cursor-pointer shadow-md
                   opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
)}
```

So sánh với `translate/ImageAttachmentPreview.tsx` — layout gần giống hệt (className img, className button, vị trí button overlay, XIcon).

**Vấn đề:** ChatPage tái tạo inline thay vì dùng component đã tách  
**Sửa:**
```tsx
// ChatPage.tsx
import { ImageAttachmentPreview } from '../components/translate/ImageAttachmentPreview'

// Cần tạo adapter vì ImageAttachmentPreview nhận `imageAttachment: ImageAttachment` (với previewDataUrl)
// ChatPage dùng `attachedImage` với `previewUrl` → cần align types hoặc prop mapping
{attachedImage && (
  <ImageAttachmentPreview
    imageAttachment={{ ...attachedImage, previewDataUrl: attachedImage.previewUrl, fileName: attachedImage.fileName }}
    onRemove={() => setAttachedImage(null)}
  />
)}
```
> **Lưu ý:** Cần đồng nhất type (`previewUrl` vs `previewDataUrl`) giữa 2 nơi dùng.

---

## Vấn đề: Sub-component Inline quá lớn

### 🟡 MEDIUM

#### [Med-Large-01] ChatPage.tsx — MessageBubble (113 dòng)
**File:** `src/pages/ChatPage.tsx:36-148`  
**Kích thước:** 113 dòng  
**Phân loại:** Feature-specific (liên quan chat, dùng `AppLogoIcon`, `MarkdownText`, `UserIcon`)  
**Đề xuất:** `src/components/chat/MessageBubble.tsx`
```tsx
// src/components/chat/MessageBubble.tsx
import type { ChatMessage } from '../../types'
interface MessageBubbleProps {
  message: ChatMessage
  onCopy: (text: string) => void
  onRegenerate?: () => void
  isLastAssistant?: boolean
  isSending?: boolean
  regenerateLabel?: string
}
export function MessageBubble({ ... }: MessageBubbleProps) { ... }

// ChatPage.tsx
import { MessageBubble } from '../components/chat/MessageBubble'
```

---

#### [Med-Large-02] HistoryPage.tsx — TranslationHistoryTab (160 dòng)
**File:** `src/pages/HistoryPage.tsx:42-201`  
**Kích thước:** 160 dòng  
**Phân loại:** Feature-specific (gọi `useAppStore`, `useT`, nhận translate history data)  
**Đề xuất:** `src/pages/history/TranslationHistoryTab.tsx`
```tsx
// src/pages/history/TranslationHistoryTab.tsx
export function TranslationHistoryTab() { ... }

// HistoryPage.tsx
import { TranslationHistoryTab } from './history/TranslationHistoryTab'
```

---

#### [Med-Large-03] HistoryPage.tsx — ChatHistoryTab (136 dòng)
**File:** `src/pages/HistoryPage.tsx:204-339`  
**Kích thước:** 136 dòng  
**Đề xuất:** `src/pages/history/ChatHistoryTab.tsx`

---

#### [Med-Large-04] HistoryPage.tsx — LiveHistoryTab (186 dòng)
**File:** `src/pages/HistoryPage.tsx:342-527`  
**Kích thước:** 186 dòng — **LỚN NHẤT trong codebase**  
**Đề xuất:** `src/pages/history/LiveHistoryTab.tsx`

---

## Vấn đề: Component đặt sai thư mục

### 🟡 MEDIUM

#### [Med-Misplaced-01] translate/DragOverlay.tsx — Pass 5/5 nhưng nằm trong feature folder
**File hiện tại:** `src/components/translate/DragOverlay.tsx`  
**Đánh giá tiêu chí:**

| Tiêu chí | Kết quả |
|----------|--------|
| 1. Không import business logic | ✅ Chỉ import UploadIcon |
| 2. Props-only interface | ✅ `label`, `zIndex`, `showRing` — không gọi store |
| 3. Domain-agnostic | ✅ Tên generic, dùng được ở mọi drop zone |
| 4. Icon từ registry | ✅ Dùng `UploadIcon` |
| 5. Label qua props | ✅ `label: string` via props |

**Thực tế dùng ở:** `TranslatePage.tsx` + `ChatPage.tsx` (2 feature khác nhau!)  
**Đề xuất di chuyển:** `src/components/ui/DragOverlay.tsx`
```tsx
// Update imports trong TranslatePage.tsx, ChatPage.tsx:
import { DragOverlay } from '../components/ui/DragOverlay'
```

---

## Kế hoạch Action (theo thứ tự ưu tiên)

| # | Ưu tiên | Action | File nguồn | File đích | Mô tả |
|---|---------|--------|-----------|-----------|-------|
| 1 | 🟠 High | Tạo `ChatBubbleIcon` | Sidebar.tsx:74, HistoryPage.tsx:221,309 | `navigation.tsx` | Thay 3 SVG chat bubble inline |
| 2 | 🟠 High | Tạo `ClockIcon` | Sidebar.tsx:103, HistoryPage.tsx:93 | `navigation.tsx` | Thay 2 SVG clock/history inline |
| 3 | 🟠 High | Tạo `ReuseIcon` | HistoryPage.tsx:170 | `actions.tsx` | Thay SVG reuse arrow inline |
| 4 | 🟠 High | Dùng `UploadIcon` có sẵn | ImageTranslator.tsx:157 | — | Import UploadIcon thay SVG inline |
| 5 | 🟠 High | Dùng `ChevronDownIcon` có sẵn | HistoryPage.tsx:123,257,428 | — | 3 lần dùng inline cùng icon |
| 6 | 🟠 High | Dùng `TrashIcon` có sẵn | HistoryPage.tsx:184,323,510 | — | 3 lần dùng inline cùng icon |
| 7 | 🟠 High | Dùng `MicrophoneIcon` có sẵn | HistoryPage.tsx:390,495 | — | 2 lần dùng inline cùng icon |
| 8 | 🟠 High | Dùng `ArrowRightIcon` có sẵn | LiveTranslatePage.tsx:78 | — | Import thay SVG inline |
| 9 | 🟠 High | Tạo `DownloadImageButton` | TranslatePage.tsx:823-855 | `ui/DownloadImageButton.tsx` | Tách 2 download buttons giống nhau |
| 10 | 🟠 High | Tạo `HistoryDeleteButton` | HistoryPage.tsx:179,316,503 | `ui/HistoryDeleteButton.tsx` | Tách 3 delete buttons giống nhau |
| 11 | 🟡 Medium | Tách `MessageBubble` | ChatPage.tsx:36-148 | `chat/MessageBubble.tsx` | 113 dòng inline |
| 12 | 🟡 Medium | Tách 3 HistoryTab | HistoryPage.tsx | `pages/history/` | 160+136+186 dòng inline |
| 13 | 🟡 Medium | ChatPage dùng `ImageAttachmentPreview` | ChatPage.tsx:576-595 | — | Align type + import component sẵn có |
| 14 | 🟡 Medium | Di chuyển `DragOverlay` → `ui/` | `translate/DragOverlay.tsx` | `ui/DragOverlay.tsx` | Pass 5/5, dùng ở 2 feature |
| 15 | 🟡 Medium | Thay `⚠` emoji | TranslatePage.tsx:706, BrowserIntegrationSection.tsx:400,411 | — | Dùng `AlertTriangleIcon` |
| 16 | 🟡 Medium | Fix hardcode labels | AutoTranslateToggle.tsx, BookmarkletDragLink.tsx | — | Externalize "Auto"/"Manual", "🌐 Lotus Translate" qua props |

---

## Tóm tắt & Ưu tiên

### Bảng tóm tắt số lượng

| Loại vấn đề | 🟠 High | 🟡 Medium | 🟢 Low | Tổng |
|-------------|--------|---------|------|------|
| SVG Icon Hardcode Inline | 16 | 0 | 4 | 20 |
| UI Pattern Duplicate | 2 | 1 | 0 | 3 |
| Sub-component Inline quá lớn | 0 | 4 | 0 | 4 |
| Component đặt sai thư mục | 0 | 1 | 0 | 1 |
| Emoji dùng làm Icon | 0 | 3 | 0 | 3 |
| **Tổng** | **18** | **9** | **4** | **31** |

---

### Icon Registry — Cần bổ sung

| Icon mới | Category file | Dùng ở | Lần dùng |
|----------|--------------|--------|----------|
| `ChatBubbleIcon` | `navigation.tsx` | Sidebar, HistoryPage | 3 |
| `ClockIcon` | `navigation.tsx` | Sidebar, HistoryPage | 2 |
| `ReuseIcon` | `actions.tsx` | HistoryPage | 1 |

---

### Top 3 ưu tiên sửa ngay

1. **Actions 1-8 (SVG icon inline):** Tạo 3 icon mới (`ChatBubbleIcon`, `ClockIcon`, `ReuseIcon`) + import 7 icon đã có → loại bỏ **16/20 SVG inline violations** trong vài giờ, không rủi ro regression.

2. **Actions 9-10 (UI Pattern Duplicate):** Tạo `DownloadImageButton` + `HistoryDeleteButton` → giảm **5 button duplicates**, dễ maintain hơn khi cần thay đổi style.

3. **Action 11-12 (Large inline sub-component):** Tách `MessageBubble` + 3 HistoryTab → **495 dòng** được chuyển ra file riêng, ChatPage và HistoryPage trở nên ngắn gọn và dễ đọc hơn đáng kể.

---

*Báo cáo tạo bởi workflow `split-ui-component v1.0.0` — 17/04/2026 22:06*
