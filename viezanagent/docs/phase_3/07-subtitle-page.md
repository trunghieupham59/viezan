# Phase 3 – SubtitlePage Plan

## Tổng quan

SubtitlePage là overlay window nổi lên trên màn hình để hiển thị subtitle dịch real-time. Thiết kế tối giản, không gây chú ý, nhưng dễ đọc. Inspired bởi Apple TV+ subtitle style.

---

## 1. Layout Architecture

SubtitlePage chạy trong cửa sổ Electron riêng biệt (subtitle window), frameless, always-on-top.

```
┌─────────────────────────────────────────────────────────────┐
│  (Transparent background - draggable)                       │
│                                                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Original text line]                                │   │
│  │ [Translated text line]    (accent color)            │   │
│  │                                  [Control bar]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Subtitle Container

### SubtitleContainer

```
Props:
  originalText: string
  translatedText: string
  isListening: boolean
  position: 'bottom' | 'top' | 'custom'
```

**Visual:**
```
Background: rgba(0, 0, 0, 0.75)
backdrop-filter: blur(12px)
border-radius: 12px
padding: 12px 20px
max-width: 800px
min-width: 200px
```

**Text:**
- Original: body (17px) / weight 400, white
- Translated: callout (16px) / weight 500, `#64D2FF` (teal – readable on dark bg)
- Line spacing: 6px between original and translated
- Text shadow: `0 1px 3px rgba(0,0,0,0.5)` for readability

**Auto-resize:**
- Container auto-sizes to text
- Max 2 lines per segment
- Overflow: scroll / auto-line-break

---

## 3. Control Bar (appears on hover)

```
┌────────────────────────────────────────────────────┐
│ [⏺ Record] [⏸ Pause] [⚙ Settings]  [✕ Close]      │
└────────────────────────────────────────────────────┘
```

**Behavior:**
- Hidden by default
- Appears on mouse hover với fade-in 150ms
- Disappears 2s after mouse leaves

**Visual:**
- Background: `rgba(0,0,0,0.6)` blur
- Radius: 8px
- Button size: 28px ghost-sm
- Icons: white/70%
- Position: top-right of container (absolute)

---

## 4. Status Indicator

Small dot indicating current state:
```
● (green, pulse)   – Recording/Listening
● (yellow)         – Processing  
● (gray)           – Idle / Paused
```

- Size: 8px dot
- Position: bottom-left of container
- Only visible when hovered

---

## 5. Draggable Behavior

- Toàn bộ subtitle container: draggable (`-webkit-app-region: drag`)
- Buttons trong control bar: `no-drag`
- Constraint: không drag ra ngoài screen bounds

---

## 6. Window Properties (Electron)

```ts
const subtitleWindow = new BrowserWindow({
  width: 900,
  height: 200,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  hasShadow: false,
  skipTaskbar: true,
  resizable: true,
  webPreferences: {
    preload: subtitlePreload,
  },
})
```

---

## 7. Settings Panel (lightweight)

Click Settings icon → small popover:
```
┌────────────────────────────────┐
│ Font size    [−] 17px [+]      │
│ Opacity      [slider: 0-100%]  │
│ Language     [Select]          │
│ Show original [Toggle]         │
└────────────────────────────────┘
```

- Width: 220px
- Position: above control bar
- Background: `rgba(40,40,40,0.95)` blur
- Label: caption1, white/80%

---

## 8. Text Animation

### New text appear:
- Fade in: 150ms
- Slide up: 8px → 0, 150ms ease-out

### Text update (streaming):
- Characters appear one by one (if streaming)
- Or: crossfade old text → new text (200ms)

### Clear/Remove:
- Fade out: 300ms
- Slight scale-down: 1 → 0.98

---

## 9. Accessibility / Readability

- Font: `-apple-system` (system font, best rendering)
- Anti-aliasing: enabled
- Min contrast: AA on dark background
- Font size: adjustable 13–24px
- Bold option for original text

---

## 10. Empty / Idle State

When no active subtitle:
- Container hidden (opacity 0, pointer-events none)
- OR: minimal "●" status indicator only

---

## 11. Stories

Note: Subtitle page is an Electron overlay – Storybook stories simulate the visual appearance only:

```
subtitle/SubtitleContainer
  - WithBothTexts
  - OriginalOnly
  - EmptyTranslation
  - LongText (wrapping)
  - DarkBackground

subtitle/ControlBar
  - Hidden
  - Visible
  - Recording state
```

---

## 12. Implementation Checklist

- [ ] Refactor subtitle container with blur background
- [ ] Add control bar with hover show/hide
- [ ] Add status indicator dot
- [ ] Refactor settings popover
- [ ] Add text appear/disappear animations
- [ ] Ensure draggable behavior works
- [ ] Write Storybook stories
