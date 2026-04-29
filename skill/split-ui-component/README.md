# Skill: split-ui-component

Skill phân loại UI component, phát hiện **SVG icon hardcode inline**, **UI pattern duplicate**, và đề xuất kế hoạch tách component theo nguyên tắc **Reusable vs Feature-specific**.

## Mô tả

Skill này giúp AI agent kiểm tra codebase và đưa ra phân tích toàn diện về tổ chức UI components:

1. **Phân loại component** — Reusable hay Feature-specific theo 5 tiêu chí rõ ràng
2. **Phát hiện SVG icon hardcode** — Icon viết thẳng vào JSX thay vì dùng icon registry
3. **Phát hiện UI pattern duplicate** — Đoạn JSX giống nhau lặp lại mà chưa được abstract
4. **Phát hiện component sai vị trí** — Reusable đặt trong feature/, hoặc ngược lại
5. **Phát hiện inline sub-component quá lớn** — Component ≥ 30 dòng viết inline trong page

## Cách dùng

```
Hãy dùng skill split-ui-component để phân tích [thư mục / file / toàn bộ src/components + src/pages]
```

---

## Tiêu chí phân loại: Reusable vs Feature-specific

### ✅ REUSABLE — `src/components/ui/`

Component **reusable** khi thỏa **TẤT CẢ** 5 tiêu chí:

| # | Tiêu chí | ✅ Pass | ❌ Fail |
|---|---------|--------|--------|
| 1 | **Không import business logic** | `CopyButton` không biết gì về translate | `SystemPromptDropdown` import `chatSystemPrompt` |
| 2 | **Props-only interface** | `ButtonGroup` nhận `value`, `onChange`, `options` | Component tự gọi `useAppStore()` bên trong |
| 3 | **Domain-agnostic** | `ClearButton`, `DownloadButton` | `VoiceTranslatePanel` tên gắn chặt với feature |
| 4 | **Icon từ registry** | `import { CopyIcon } from './icons'` | SVG `<path d="...">` inline trong JSX |
| 5 | **Label qua props** | `label={t.translate_copy}` | `<span>Copy</span>` hardcode |

> ⚠️ **Không cần dùng ở 2+ nơi** — 1 lần dùng vẫn là reusable nếu pass 5 tiêu chí

**Cũng là Reusable:** Component ở `src/components/` root (như `Sidebar.tsx`, `AppLogo.tsx`) — những component không nằm trong feature subfolder.

### 🔷 FEATURE-SPECIFIC — `src/components/{feature}/`

Component **feature-specific** khi **vi phạm ÍT NHẤT 1**:

| Dấu hiệu | Ví dụ |
|----------|-------|
| Tên nói rõ feature | `VoiceOverlay`, `DragOverlay`, `ImageAttachmentPreview` |
| Import store/service của feature | `SystemPromptDropdown` biết `chatSystemPrompt` |
| Layout chỉ có nghĩa trong 1 feature | `MessageBubble` chỉ có nghĩa trong chat |
| Chứa complex state gắn domain | Drag state, voice recording state |

```
src/components/
  ui/           ← Reusable (CopyButton, ButtonGroup, icons/...)
  translate/    ← Feature: Translate (DragOverlay, ImageAttachmentPreview, VoiceOverlay)
  chat/         ← Feature: Chat (SystemPromptDropdown, MessageBubble)
  *.tsx         ← Root-level reusable (Sidebar, AppLogo, LanguageSelector...)
```

---

## Phân loại vấn đề

### 🟠 High: SVG Icon Hardcode Inline

Icon viết trực tiếp trong JSX thay vì import từ `src/components/ui/icons/`.

```tsx
// ❌ SVG inline trong Sidebar.tsx
<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25..." />
</svg>

// ✅ Dùng icon từ registry
import { ChatIcon } from '../components/ui/icons'
<ChatIcon className="w-5 h-5" />
```

**Cách phát hiện:**
```bash
rg -n --glob '*.tsx' '<svg' src -g '!src/components/ui/icons/**'
```

**Quy tắc sửa:**
1. Xác định icon → kiểm tra `src/components/ui/icons/index.ts` xem đã có chưa
2. **Nếu có** → import và dùng
3. **Nếu chưa** → tạo mới trong category file phù hợp:

| Category | Icon thuộc về |
|----------|---------------|
| `actions.tsx` | copy, delete, download, upload, rewrite, translate, send, reuse, swap |
| `navigation.tsx` | chevron, arrow, gear, history, chat-bubble, home, menu |
| `media.tsx` | speaker, microphone, stop, spinner, camera |
| `status.tsx` | warning, error, success, info |
| `auth.tsx` | lock, eye, user |
| `files.tsx` | document, clipboard, folder |
| `providers.tsx` | provider logos/icons |

```tsx
// Tạo mới trong category file phù hợp
export function ChatIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M8.625 12a.375.375 0 11-.75 0 ..." />
    </svg>
  )
}
```

---

### 🟠 High: UI Pattern Duplicate không tách Component

Đoạn JSX cùng cấu trúc lặp lại 2+ lần trong cùng file.

```tsx
// ❌ TranslatePage.tsx — 2 download buttons gần như giống hệt
{editedImageUrl && (
  <button type="button" title={t.image_translate_download}
    onClick={() => { /* download editedImageUrl */ }}
    className="relative flex items-center justify-center w-8 h-8 rounded-full
               transition-all duration-200 cursor-pointer
               text-gray-400 hover:text-emerald-500 hover:bg-emerald-50
               dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
  >
    <DownloadIcon />
  </button>
)}

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

// ✅ Tách thành DownloadButton component
// src/components/ui/DownloadButton.tsx
<DownloadButton onClick={handleDownload} title={t.image_translate_download} />
```

---

### 🟡 Medium: Emoji dùng làm Icon

```tsx
// ❌ Emoji thay thế icon trong UI
<span>⚠ {charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}</span>

// ✅ Dùng icon component
<AlertTriangleIcon className="w-3.5 h-3.5" />
<span className="tabular-nums">{charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}</span>
```

---

### 🟡 Medium: Sub-component Inline quá lớn (≥ 30 dòng)

```tsx
// ❌ Component lớn inline trong page
function LargeFeaturePanel({ value, onChange, ... }) {
  // 30+ dòng logic/render...
}
export function FeaturePage() { ... }

// ✅ Tách ra file riêng
// src/components/{feature}/LargeFeaturePanel.tsx
export function LargeFeaturePanel({ value, onChange, ... }: LargeFeaturePanelProps) { ... }

// FeaturePage.tsx
import { LargeFeaturePanel } from '../components/{feature}/LargeFeaturePanel'
```

---

### 🟡 Medium: Component đặt sai thư mục

```tsx
// ❌ Component reusable nằm trong feature folder
// src/components/translate/ClearButton.tsx  ← sai
// (nếu ClearButton pass 5 tiêu chí reusable)

// ✅ Đặt đúng vị trí
// src/components/ui/ClearButton.tsx  ← đúng
```

---

## Quy tắc không báo False Positive

| Trường hợp | Lý do không phải vấn đề |
|-----------|------------------------|
| `<svg>` bên trong `src/components/ui/icons/` | Đây là icon definition hợp lệ |
| Emoji trong provider badge (`p?.emoji ?? '🤖'`) | Metadata của provider, không phải UI icon |
| Component dùng 1 lần nhưng pass 5 tiêu chí | Vẫn là reusable, không cần phải dùng 2+ nơi |
| Sub-component inline < 30 dòng | Chấp nhận được, không cần tách |
| Emoji trong text content của người dùng | Không phải UI icon |

---

## Output Format

### Báo cáo từng vấn đề

```
[🟠 High] SVG Icon Hardcode Inline
File: path/to/component.tsx:line
Code:
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path d="M8.625 12a.375.375 0 11-.75 0 ..." />
  </svg>
Vấn đề: Icon viết SVG trực tiếp thay vì dùng icon registry
Tên đề xuất: <MeaningfulName>Icon
Category: actions/navigation/media/status/auth/files/providers theo ý nghĩa icon
Sửa:
  // 1. Thêm vào src/components/ui/icons/navigation.tsx
  export function ChatIcon({ className = 'w-4 h-4' }: IconProps) { ... }
  // 2. Import và dùng
  import { ChatIcon } from '../components/ui/icons'
  <ChatIcon className="w-5 h-5" />
```

### Bảng phân loại Component

```
## Bản đồ Component

### Reusable (src/components/ui/)
| Component | Tiêu chí pass | Ghi chú |
|-----------|-------------|--------|
| CopyButton | ✅ 5/5 | Đang đúng vị trí |
| ButtonGroup | ✅ 5/5 | Đang đúng vị trí |
| DownloadButton | ❌ Chưa có | Cần tách từ TranslatePage |

### Feature-specific (src/components/{feature}/)
| Component | Feature | Lý do |
|-----------|---------|-------|
| DragOverlay | translate | Layout đặc thù cho drag-drop translate |
| MessageBubble | chat | Cần tách từ ChatPage.tsx |

### Root-level Reusable (src/components/)
| Component | Ghi chú |
|-----------|--------|
| Sidebar.tsx | Reusable nhưng có 2 inline SVG cần sửa |
| AppLogo.tsx | Đang đúng |
```

---

## Tham khảo

- Workflow sử dụng skill này: [`../../workflow/split-ui-component/README.md`](../../workflow/split-ui-component/README.md)
- Skill JSON definition: [`./split-ui-component.json`](./split-ui-component.json)
- Icon registry: `src/components/ui/icons/`
