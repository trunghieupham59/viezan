# Phase 3 – TranslatePage Plan

## Tổng quan

TranslatePage là màn hình chính và được dùng nhiều nhất. Refactor theo Apple Design Language với layout 2-panel sạch, toolbar translucent, và interaction tinh tế.

---

## 1. Layout Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  [Toolbar - blur/translucent]                               │
│  [ModelSelector] [SourceLang ↔ TargetLang]  [Settings icon] │
├──────────────────────┬──────────────────────────────────────┤
│   SOURCE PANEL       │   RESULT PANEL                       │
│                      │                                      │
│   [SourceLangBadge]  │   [TargetLangBadge]  [FuriganaToggle]│
│                      │                                      │
│   [Textarea]         │   [ResultText / Markdown]            │
│                      │                                      │
│   ─────────────────  │   ─────────────────────────────────  │
│   [PanelActions]     │   [PanelActions]                     │
└──────────────────────┴──────────────────────────────────────┘
```

### Dimensions
- Toolbar: height 52px, sticky top
- Panels: `flex-1`, split 50/50 với resizable divider
- Divider: 1px, `var(--apple-separator)`, draggable (cursor: col-resize)
- Minimum panel width: 240px

---

## 2. TranslateToolbar

### File: `src/components/translate/TranslateToolbar.tsx`

```
Layout: [Left: ModelSelector] [Center: LanguagePair] [Right: Actions]
```

**Visual:**
- Background: `rgba(246,246,246,0.88)` / dark: `rgba(28,28,30,0.88)`
- `backdrop-filter: blur(20px) saturate(180%)`
- `border-bottom: 1px solid var(--apple-separator)`
- Height: 52px
- Padding: 0 16px

**ModelSelector in toolbar:**
- Compact size (sm)
- Show provider icon + model name (truncated)
- Dropdown: popover style (see ModelSelector spec)

**LanguagePair:**
- `[Source Flag+Name] [⇄ button] [Target Flag+Name]`
- Swap button: circular, 28px, secondary variant, rotate 180° animation on click
- Language buttons: ghost variant, with flag emoji

---

## 3. Source Panel

### Components

#### SourcePanel container
- Background: `var(--apple-bg-primary)` 
- Padding: 16px

#### Source Language Selector
- Position: top-left của panel
- Style: ghost button, footnote size, flag + name
- Dropdown khi click

#### Textarea (Source)
```
- Placeholder: "Nhập văn bản cần dịch..." (i18n)
- No resize handle (resizable via panel split only)
- Background: transparent
- Border: none
- Font: body (17px) light, headline (17px 600) dark
- Min height: fill panel
- Auto-focus khi load
```

#### SourcePanelActions
Bottom bar của source panel:
```
[Voice Input] [Image/Camera] [Clear]    [Char count]    [Translate →]
```

| Button | Icon | Variant | Tooltip |
|--------|------|---------|---------|
| Voice | Mic | ghost-sm | "Nhập giọng nói" |
| Image | Image | ghost-sm | "Dịch ảnh" |
| Clear | X | ghost-sm | "Xoá" (show khi có text) |
| Translate | ArrowRight | primary-sm | "Dịch" |

**Translate button:**
- Primary variant, sm size
- Loading state khi đang dịch (spinner)
- Disabled khi không có text
- Keyboard shortcut: Cmd+Enter (badge hiển thị)

---

## 4. Result Panel

### Components

#### Target Language Selector
- Top-left của panel
- Style: ghost button với flag + name

#### Furigana Toggle (Japanese specific)
- Top-right của panel
- Chỉ hiển thị khi target = Japanese
- Pill toggle: `ruby` / `text`

#### Result Text Area
```
- Read-only
- Markdown rendered (MarkdownText component)
- Furigana support (FuriganaText)
- Font: body size, same as source
- Background: rgba(246,246,246,0.5) light | rgba(28,28,30,0.5) dark
  (slightly different from source để phân biệt)
```

**Empty State:**
- Khi chưa dịch: illustration nhỏ + "Nhập văn bản và nhấn Dịch" (footnote, label-tertiary)

**Loading State:**
- Skeleton lines animation (Apple-style pulse)
- 3 dòng skeleton với độ rộng khác nhau

**Error State:**
- TranslateError component với alert style
- Icon: AlertTriangle (orange)
- Message + retry button

#### ResultPanelActions
Bottom bar của result panel:
```
[Copy] [Read Aloud] [Retry?]           [Quality indicator]
```

| Button | Icon | Variant | Tooltip |
|--------|------|---------|---------|
| Copy | Copy | ghost-sm | "Sao chép" (toggle thành Checkmark) |
| Read Aloud | Volume2 | ghost-sm | "Đọc to" |
| Save | BookmarkPlus | ghost-sm | "Lưu vào lịch sử" |

---

## 5. Image Translation Mode

Khi user attach ảnh:
- Source panel: hiển thị `ImageAttachmentPreview` thay textarea
- Preview: rounded-lg thumbnail với overlay X button
- Image Switch Toast: toast nhỏ khi switch từ text→image

---

## 6. Voice Input Overlay

### VoiceOverlay
- Covers source panel
- Background: `rgba(246,246,246,0.95)` blur
- Center: animated waveform + "Đang nghe..."
- Bottom: Stop button (large, red, pill)

---

## 7. Drag Overlay

### DragOverlay
- Full panel overlay khi drag file vào
- Dashed border: 2px dashed #007AFF
- Background: `rgba(0,122,255,0.05)`
- Center: Upload icon + "Thả ảnh vào đây"

---

## 8. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Translate |
| `Cmd+Shift+C` | Copy result |
| `Cmd+Shift+V` | Clear source |
| `Cmd+Shift+S` | Swap languages |
| `Cmd+Shift+M` | Toggle voice input |

---

## 9. Animation Specs

- Panel resize: no animation (instant)
- Language swap: icon rotates 180° in 200ms
- Copy button: checkmark appears/disappears in 150ms/2s
- Loading skeleton: pulse 1.5s ease-in-out infinite
- Error appearance: slide-up 200ms

---

## 10. Stories

```
translate/TranslateToolbar
  - Default
  - WithModel (with selected model)
  - Dark

translate/SourcePanel
  - Empty
  - WithText
  - WithImage
  - Loading

translate/ResultPanel
  - Empty (no translation yet)
  - WithResult
  - WithMarkdown
  - WithFurigana
  - Loading
  - Error

pages/TranslatePage
  - Default (full page)
```

---

## 11. Implementation Checklist

- [ ] Refactor `TranslateToolbar.tsx` – Apple toolbar style
- [ ] Refactor `SourceLanguageSelector.tsx` – ghost button style
- [ ] Refactor `TargetLanguageSelector.tsx` – ghost button style
- [ ] Refactor `SourcePanelActions.tsx` – Apple icon buttons
- [ ] Refactor `ResultPanelActions.tsx` – Apple icon buttons
- [ ] Add loading skeleton to result panel
- [ ] Refactor `VoiceOverlay.tsx` – frosted glass style
- [ ] Refactor `DragOverlay.tsx` – Apple drop zone style
- [ ] Refactor `TranslateError.tsx` – Apple alert style
- [ ] Refactor `TranslatePage.tsx` layout – resizable panels
- [ ] Write stories for all components above
