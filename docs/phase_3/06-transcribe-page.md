# Phase 3 – TranscribePage Plan

## Tổng quan

TranscribePage (LiveTranslatePage) cho phép nhận dạng giọng nói và dịch real-time. Refactor theo Apple design với waveform visualization, large record button, và transcript display sạch.

---

## 1. Layout Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  [Toolbar]                                                  │
│  [Model] [Source → Target]                   [Settings]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [RECORDING CONTROLS - Center]                              │
│  ┌───────────────────────────────────────────────────┐     │
│  │                                                   │     │
│  │     [Waveform Visualizer - animated bars]         │     │
│  │                                                   │     │
│  │              ●  (Record Button 80px)              │     │
│  │         "Nhấn để bắt đầu ghi âm"                 │     │
│  │                                                   │     │
│  │    [Timer 0:00:00]  [Provider Badge]              │     │
│  │                                                   │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [TRANSCRIPT AREA - scrollable]                             │
│                                                             │
│  [TranscriptEntry: Original text]                           │
│  [TranscriptEntry: Translated text (indented, accent)]      │
│                                                             │
│  [TranscriptEntry: Original]                                │
│  [TranscriptEntry: Translated]                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Recording Control Area

### RecordButton

**Sizes:**
- **Idle**: 80px circle, `rgba(120,120,128,0.15)` bg, Mic icon 32px
- **Recording**: 80px circle, `#FF3B30` bg (pulsing animation), Square icon 28px
- **Processing**: 80px circle, spinner overlay

**Pulse animation (recording state):**
```css
@keyframes record-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(255,59,48,0.4); }
  70%  { box-shadow: 0 0 0 20px rgba(255,59,48,0); }
  100% { box-shadow: 0 0 0 0 rgba(255,59,48,0); }
}
animation: record-pulse 1.5s ease-out infinite;
```

**State label:**
- Idle: "Nhấn để ghi âm" (footnote, label-secondary)
- Recording: "Đang ghi... Nhấn để dừng" (footnote, red)
- Processing: "Đang xử lý..." (footnote, label-secondary)

---

## 3. Waveform Visualizer

### WaveformVisualizer component

```
Props:
  isActive: boolean
  audioData?: Float32Array (real-time PCM data)
  barCount?: number (default: 32)
```

**Visual:**
- 32 vertical bars
- Height: proportional to audio amplitude
- Min height: 4px (idle state, decorative)
- Max height: 64px
- Width: 3px per bar
- Gap: 2px
- Color: `#007AFF` (active), `rgba(120,120,128,0.3)` (idle)
- Border radius: 2px (each bar)
- Animation idle: gentle wave CSS animation (sin wave)
- Animation active: real-time amplitude

**Idle Animation:**
```css
@keyframes idle-wave {
  0%, 100% { transform: scaleY(1); }
  50%       { transform: scaleY(0.5); }
}
/* Each bar has different animation-delay */
```

---

## 4. Timer Display

```
Format: MM:SS (short) or HH:MM:SS (long)
Font: title3 (20px 600), monospace/tabular-nums
Color: label-primary (idle), #FF3B30 (recording)
```

---

## 5. Provider Badge

```
[Provider Icon 16px] Provider Name
```
- Style: Badge component, neutral variant
- Subtext: model name (caption2)

---

## 6. Transcript Area

### TranscriptEntry component

```
Props:
  original: string
  translated?: string
  language: string
  timestamp: Date
  isLatest?: boolean
```

**Visual:**
```
┌─────────────────────────────────────────────────────┐
│  12:34:56                           [Copy] [Delete] │
│  "Xin chào, tôi muốn hỏi về..."                     │
│                                                     │
│  → "Hello, I wanted to ask about..."                │
│     (accent color, indented 16px)                   │
└─────────────────────────────────────────────────────┘
```

- Original: body (17px), label-primary
- Translated: body (17px), `#007AFF` / `#0A84FF` dark
- Arrow: ChevronRight mini
- Timestamp: caption1, label-tertiary, top-right
- Card: rounded-lg, bg-tertiary
- Hover: show action buttons (Copy, Delete)

**Latest entry (isLatest):**
- Subtle left border: 3px `#007AFF`
- Background: slightly more visible

---

## 7. Empty Transcript State

```
[Mic icon 48px, label-tertiary]
"Chưa có bản ghi nào"        ← headline, label-secondary
"Nhấn nút ghi âm để bắt đầu" ← body, label-tertiary
```

---

## 8. Toolbar Actions

```
Left:  [ModelSelector compact]
Right: [Export button] [Clear All button]
```

**Export:** 
- Icon: Download
- Opens action sheet: [Copy All Text, Export as TXT, Export as SRT]

**Clear All:**
- Icon: Trash2
- Destructive confirmation: `confirm()` dialog (native macOS)

---

## 9. Settings Panel (inline)

Collapsed by default, expandable:
```
[Source Language] [→] [Target Language]
[STT Provider: Whisper / Gemini / Groq]
[Auto-translate: Toggle]
```

---

## 10. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Start/Stop recording |
| `Cmd+E` | Export transcript |
| `Cmd+K` | Clear all |
| `Cmd+C` | Copy last entry |

---

## 11. Animation Specs

- Record button press: scale(0.95) 100ms
- Pulse animation: 1.5s ease-out infinite
- Waveform bars: `transform: scaleY()` 50ms ease
- New transcript entry: slide-up 200ms + fade-in
- Idle waveform: staggered sin wave 3s period

---

## 12. Stories

```
transcribe/RecordButton
  - Idle
  - Recording  
  - Processing

transcribe/WaveformVisualizer
  - Idle
  - Active (with mock data)

transcribe/TranscriptEntry
  - WithTranslation
  - WithoutTranslation
  - IsLatest

transcribe/EmptyState
  - Default

pages/TranscribePage (LiveTranslatePage)
  - Default (idle)
  - Recording
  - WithTranscripts
```

---

## 13. Implementation Checklist

- [ ] Refactor `RecordButton` component
- [ ] Create `WaveformVisualizer` component
- [ ] Create `TimerDisplay` component  
- [ ] Create `TranscriptEntry` component
- [ ] Refactor transcript list with empty state
- [ ] Refactor toolbar (Export, Clear All)
- [ ] Add pulse animation to record button
- [ ] Write Storybook stories
