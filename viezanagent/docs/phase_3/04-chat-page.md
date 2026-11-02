# Phase 3 – ChatPage Plan

## Tổng quan

ChatPage là màn hình chat AI. Refactor theo Apple Messages/iMessage style với bubble layout, translucent input bar, và smooth scrolling.

---

## 1. Layout Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  [Toolbar]                                                  │
│  [Model icon] Chat AI              [New Chat] [History]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [AssistantBubble]                                          │
│  Xin chào! Tôi có thể giúp gì cho bạn?                     │
│                                                             │
│                             [UserBubble]                    │
│                       Dịch câu này sang tiếng Nhật          │
│                                                             │
│  [AssistantBubble – loading: BouncingDots]                  │
│                                                             │
│                                              [↓ scroll]     │
├─────────────────────────────────────────────────────────────┤
│  [Input Bar - blur]                                         │
│  [+] [textarea.....................]  [Send ↑]              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. ChatToolbar

```
Left:   [ProviderIcon 20px] "Chat AI" (headline)
Right:  [Pencil icon - New Chat] [Clock icon - History]
```

- Style: Apple Toolbar (blur + separator)
- Title: headline 17px 600
- Buttons: ghost-sm với tooltips

---

## 3. Chat Bubbles

### UserBubble
```
- Background: #007AFF (light) / #0A84FF (dark)
- Text: white
- Radius: 18px 18px 4px 18px (bottom-right less rounded)
- Max width: 75%
- Align: flex-end (right side)
- Padding: 10px 14px
- Font: body (17px)
- Shadow: 0 1px 2px rgba(0,122,255,0.3)
- Margin bottom: 4px (same sender consecutive), 16px (different sender)
```

### AssistantBubble
```
- Background: rgba(120,120,128,0.12) light | rgba(255,255,255,0.1) dark
- Text: var(--apple-label-primary)
- Radius: 18px 18px 18px 4px (bottom-left less rounded)
- Max width: 80%
- Align: flex-start (left side)
- Padding: 10px 14px
- Has provider icon in top-left (16px)
- Supports Markdown content (MarkdownText)
```

### Thinking State
```
AssistantBubble trong thinking state:
- BouncingDots animation: 3 dots, bounce sequentially
- Color: label-secondary
- Duration: 0.6s per dot, offset 0.15s
```

### Smart Thinking Steps
```
- Collapsible section phía trên answer
- Header: "Đang suy nghĩ..." với icon Brain (purple) + chevron
- Content: step list với check marks
- Background: rgba(175,82,222,0.05)
- Border: 1px solid rgba(175,82,222,0.2)
- Radius: 12px
```

---

## 4. Message Timestamp
```
- Hiển thị khi hover vào message group
- Font: caption2 (11px), label-tertiary
- Align: dưới bubble, cùng side với bubble
```

---

## 5. Input Bar

```
Background: rgba(246,246,246,0.88) / dark: rgba(28,28,30,0.88)
backdrop-filter: blur(20px)
border-top: 1px solid var(--apple-separator)
padding: 12px 16px
```

### Components

#### Attachment Button (+)
- Circle icon button, 32px
- ghost-sm variant
- Opens popover: [Image, File, Screenshot]

#### Textarea
- Auto-resize (1–8 rows)
- Background: rgba(120,120,128,0.1)
- Border: 1px solid transparent
- Focus: 1px solid rgba(0,122,255,0.4)
- Radius: 20px (pill shape, Apple Messages style)
- Padding: 8px 16px
- Font: body (17px)
- Placeholder: "Nhắn tin..." (i18n)

#### Send Button
- Icon: ArrowUp (filled circle)
- Size: 32px circle
- Background: #007AFF khi có text, rgba(120,120,128,0.15) khi không có
- Icon: white
- Disabled khi không có text (opacity 0.4, no pointer)
- Animation: scale 0.95 on click
- Keyboard: Enter to send (Shift+Enter for newline)

---

## 6. Empty State

Khi chưa có message:
```
[Provider Icon 56px]
"Chat với [Provider Name]"       ← title2
"Tôi có thể giúp bạn dịch, giải thích..." ← body, label-secondary

[Suggestion Chips]
  [🌐 Dịch văn bản]  [📖 Giải thích]  [✏️ Viết lại]
```

**Suggestion Chips:**
- Pill shape, secondary variant
- Tap để pre-fill input
- 3-4 chips, horizontal scroll on overflow

---

## 7. Card Actions (message hover)

Khi hover vào AssistantBubble:
```
[Copy] [Retry] [TTS] [Share?]  ← floating above bubble, 200ms delay
```

- Style: floating pill, `rgba(246,246,246,0.95)` blur
- Icons: 16px, ghost-sm
- Shadow: shadow-md
- Disappear: 500ms after mouse leaves

---

## 8. History Sidebar / Panel

Slide từ phải (hoặc modal):
```
┌──────────────────────────────┐
│ Lịch sử chat            [X] │
├──────────────────────────────┤
│ [Search]                     │
├──────────────────────────────┤
│ Hôm nay                      │
│  > Dịch báo cáo Q3           │
│  > Giải thích thuật ngữ      │
├──────────────────────────────┤
│ Hôm qua                      │
│  > So sánh ngữ pháp          │
└──────────────────────────────┘
```

- Sheet/modal style (slide in từ right)
- Group by date
- Item: 1 line truncated, footnote date

---

## 9. Scroll Behavior

- Auto-scroll to bottom khi nhận message mới
- Scroll down button: circle button bottom-right, fade in khi scroll lên
- Smooth scroll: `behavior: 'smooth'`

---

## 10. Animation Specs

- New user message: slide-up 200ms from input
- New AI message: fade-in 200ms
- Thinking dots: bounce sequence 0.6s
- Smart thinking expand/collapse: 250ms ease
- Card actions: fade-in 150ms, fade-out 200ms

---

## 11. Stories

```
chat/ChatBubble
  - User
  - Assistant  
  - AssistantThinking
  - AssistantWithMarkdown
  - AssistantSmartThinking

chat/ChatInputBar
  - Empty
  - WithText
  - Loading (sending)

chat/EmptyState
  - Default (all providers)

pages/ChatPage
  - Empty
  - WithMessages
  - Loading
```

---

## 12. Implementation Checklist

- [ ] Refactor chat bubble components (user/assistant)
- [ ] Refactor thinking state animations
- [ ] Refactor input bar (pill textarea + send button)
- [ ] Add empty state with suggestion chips
- [ ] Add message card actions on hover
- [ ] Refactor chat toolbar
- [ ] Smooth scroll + scroll-to-bottom button
- [ ] Refactor history panel/modal
- [ ] Write Storybook stories
