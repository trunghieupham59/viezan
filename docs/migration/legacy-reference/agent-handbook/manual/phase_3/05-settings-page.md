# Phase 3 – SettingsPage Plan

## Tổng quan

SettingsPage/Modal được thiết kế theo macOS System Settings (như ảnh tham chiếu). Layout 2 cột: sidebar trái (navigation) + content panel phải.

---

## 1. Layout Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  [Window Titlebar: traffic lights + "Cài đặt"]              │
├──────────────────┬──────────────────────────────────────────┤
│  SIDEBAR (260px) │  CONTENT PANEL                           │
│                  │                                          │
│  [🔍 Tìm kiếm]  │  ┌──────────────────────────────────┐   │
│                  │  │  [Icon 56px]                     │   │
│  [🤖] Providers  │  │  Providers                       │   │
│  [🔑] API Keys   │  │  Quản lý AI providers...         │   │
│  [🌐] Ngôn ngữ  │  └──────────────────────────────────┘   │
│  [⌨️] Phím tắt  │                                          │
│  [🎨] Giao diện  │  ┌──────────────────────────────────┐   │
│  [📊] Sử dụng   │  │  API Key Section                  │   │
│  [ℹ️] Thông tin  │  │  [ListRow: OpenAI] [>]           │   │
│                  │  │  [ListRow: Claude] [>]            │   │
│                  │  │  [ListRow: Gemini] [>]            │   │
│                  │  └──────────────────────────────────┘   │
└──────────────────┴──────────────────────────────────────────┘
```

---

## 2. Modal vs Page

SettingsModal được refactor thành:
- **Modal**: Popup từ main app (Cmd+,)
- **Full modal**: `max-w-4xl`, `h-[80vh]`, rounded-xl, shadow-lg
- **Backdrop**: `rgba(0,0,0,0.4)` với blur nhẹ

```tsx
// Modal container
<dialog className="
  fixed inset-0 z-50 flex items-center justify-center
  bg-black/40 backdrop-blur-sm
">
  <div className="
    w-[900px] h-[600px] rounded-xl overflow-hidden
    bg-[var(--apple-bg-secondary)] shadow-2xl
    flex
  ">
    <SettingsSidebar />
    <SettingsContent />
  </div>
</dialog>
```

---

## 3. Settings Sidebar

### File: `src/components/settings/SettingsSidebar.tsx`

```
Props:
  activeSection: string
  onSectionChange: (id: string) => void
```

**Items:**
```ts
const sections = [
  { id: 'providers', label: 'AI Providers', icon: Bot, iconBg: '#5856D6' },
  { id: 'api-keys',  label: 'API Keys',     icon: Key, iconBg: '#FF9500' },
  { id: 'translate', label: 'Dịch thuật',   icon: Globe, iconBg: '#34C759' },
  { id: 'hotkeys',   label: 'Phím tắt',     icon: Keyboard, iconBg: '#007AFF' },
  { id: 'appearance',label: 'Giao diện',    icon: Palette, iconBg: '#FF2D55' },
  { id: 'about',     label: 'Thông tin',    icon: Info, iconBg: '#8E8E93' },
]
```

**Visual:**
- Background: `rgba(246,246,246,0.85)` / dark: `rgba(30,30,30,0.85)`
- `backdrop-filter: blur(20px)`
- `border-right: 1px solid var(--apple-separator)`
- Width: 220px
- Padding: 16px 8px
- Item: SidebarNav pattern (32px height, 8px radius)
- Icon: 22px square, rounded 6px, icon 13px white

---

## 4. Content Panel Header

```
┌──────────────────────────────────────────────────┐
│  [Icon 48px rounded-xl]                          │
│  Section Title (title2, 22px 700)                │
│  Description (body, label-secondary)             │
└──────────────────────────────────────────────────┘
```

Sau header: ListGroup sections

---

## 5. Section: AI Providers

```
Header:
  [Bot icon 48px #5856D6 bg] "AI Providers"
  "Chọn và cấu hình các nhà cung cấp AI"

Content Groups:

[ACTIVE PROVIDER]
  ListRow: OpenAI     [checkmark if active] [>]
  ListRow: Claude     [checkmark if active] [>]  
  ListRow: Gemini     [checkmark if active] [>]
  ListRow: Groq       [checkmark if active] [>]
  ListRow: Local AI   [checkmark if active] [>]

[LOCAL MODEL]
  ListRow: Ollama URL    [text field inline]
  ListRow: Test Connection [Button]
```

---

## 6. Section: API Keys

```
Header:
  [Key icon 48px #FF9500 bg] "API Keys"
  "Lưu trữ an toàn trong macOS Keychain"

Content Groups:

[OPENAI]
  ListRow: API Key   [masked: sk-****abc] [Show] [>]
  
[ANTHROPIC CLAUDE]
  ListRow: API Key   [masked] [Show] [>]

[GOOGLE GEMINI]
  ListRow: API Key   [masked] [Show] [>]

[GROQ]
  ListRow: API Key   [masked] [Show] [>]
```

**API Key Input Row (expanded):**
- Khi click vào row → expand inline
- Input field với show/hide toggle
- Save + Cancel buttons
- "Lưu vào Keychain" badge

---

## 7. Section: Translate Settings

```
Header:
  [Globe icon 48px #34C759 bg] "Dịch thuật"
  "Tùy chỉnh hành vi dịch"

Content Groups:

[NGÔN NGỮ]
  ListRow: Ngôn ngữ nguồn mặc định   [Select: Auto]
  ListRow: Ngôn ngữ đích mặc định    [Select: Tiếng Việt]

[TỰ ĐỘNG]
  ListRow: Tự động dịch              [Toggle]
  ListRow: Thời gian chờ             [Select: 1s / 2s / 3s]
  ListRow: Lưu lịch sử              [Toggle]

[PROMPT]
  ListRow: Custom system prompt      [>]
  ListRow: Furigana tự động          [Toggle]
```

---

## 8. Section: Hotkeys

```
Header:
  [Keyboard icon 48px #007AFF bg] "Phím tắt"
  "Tùy chỉnh phím tắt global"

Content Groups:

[GLOBAL]
  ListRow: Mở app nhanh    [KeyBadge: ⌘+Shift+T]  [Edit]
  ListRow: Chat nhanh      [KeyBadge: ⌘+Shift+C]  [Edit]
  ListRow: Dịch clipboard  [KeyBadge: ⌘+Shift+X]  [Edit]

[TRONG APP]
  ListRow: Thực hiện dịch  [KeyBadge: ⌘+Enter]
  ListRow: Đổi ngôn ngữ   [KeyBadge: ⌘+Shift+S]
  ListRow: Xoá text        [KeyBadge: ⌘+Shift+V]
```

**KeyBadge component:**
- Pill bg: `rgba(120,120,128,0.15)`
- Font: caption1 monospace
- Keys styled như macOS: `⌘`, `⇧`, `⌥`, `⌃`

---

## 9. Section: Appearance

```
Header:
  [Palette icon 48px #FF2D55 bg] "Giao diện"

Content Groups:

[CHỦ ĐỀ]
  ListRow: Chế độ màu   [SegmentedControl: Tự động | Sáng | Tối]
  
[CỠ CHỮ]
  ListRow: Cỡ chữ       [SegmentedControl: Nhỏ | Vừa | Lớn]

[NGÔN NGỮ]
  ListRow: Ngôn ngữ giao diện  [Select: VI | EN | JA]
```

**SegmentedControl component:**
- Apple-style segmented control
- Pill bg, sliding indicator
- 2-4 segments

---

## 10. Section: About

```
Header:
  [App icon 48px] "Viezan"
  "v2.1.4"

Content Groups:

[PHIÊN BẢN]
  ListRow: Phiên bản         [2.1.4]
  ListRow: Cập nhật          [>] [Badge: "Mới" nếu có update]

[LIÊN KẾT]
  ListRow: Trang web         [ExternalLink: viezan.is-a.dev]
  ListRow: GitHub            [ExternalLink]
  ListRow: Báo lỗi          [ExternalLink]

[DỮ LIỆU]
  ListRow: Xoá cache         [Button destructive]
  ListRow: Xoá toàn bộ dữ liệu [Button destructive]
```

---

## 11. Inline Toggle Pattern

```tsx
// Toggle row
<ListRow
  label="Tự động dịch"
  value={
    <Toggle 
      checked={autoTranslate}
      onChange={setAutoTranslate}
    />
  }
/>
```

**Toggle (iOS-style switch):**
- Size: 51×31px (standard iOS)
- On: #34C759 green (not accent blue – follows iOS convention for settings)
- Thumb: white circle, shadow
- Animation: slide 200ms spring

---

## 12. Search in Settings

Search input ở đầu sidebar:
- Filter sections và items theo text
- Highlight matching text
- "Không tìm thấy" empty state

---

## 13. Animation Specs

- Section transition: fade + slide-left 200ms
- Sidebar active change: instant bg color
- Toggle: 200ms spring
- Expand row: max-height animation 250ms ease

---

## 14. Stories

```
settings/SettingsSidebar
  - Default
  - WithActiveItem

settings/ListRow
  - WithToggle
  - WithSelect
  - WithChevron
  - WithKeyBadge

settings/ApiKeyInput
  - Masked
  - Revealed
  - Editing

settings/Toggle
  - On
  - Off
  - Disabled

settings/SegmentedControl
  - 2 segments
  - 3 segments

pages/SettingsPage
  - Providers section
  - API Keys section
  - Appearance section
```

---

## 15. Implementation Checklist

- [ ] Refactor `SettingsModal.tsx` → 2-column layout
- [ ] Create `SettingsSidebar.tsx`
- [ ] Create `SettingsContentHeader.tsx`
- [ ] Refactor `ApiKeyInput.tsx` – inline expand pattern
- [ ] Create `Toggle.tsx` (iOS-style)
- [ ] Create `SegmentedControl.tsx`
- [ ] Create `KeyBadge.tsx`
- [ ] Implement sections: Providers, API Keys, Translate, Hotkeys, Appearance, About
- [ ] Add search functionality
- [ ] Write Storybook stories
