# Phase 3 – Shared Components Plan

## Tổng quan

Các shared components được tổ chức theo thứ tự dependency (atoms → molecules → organisms).  
Tất cả components phải:
1. Tuân thủ Apple Design Language (xem `00-design-system.md`)
2. Có Storybook story đầy đủ
3. Support dark mode qua `dark:` Tailwind classes
4. Export từ `src/components/ui/index.ts`

---

## 1. Button

### File: `src/components/ui/Button.tsx`

```
Props:
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'tinted'
  size: 'sm' | 'md' | 'lg'
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  + tất cả HTMLButtonElement props
```

### Visual Spec

| Variant | Light | Dark |
|---------|-------|------|
| `primary` | bg: #007AFF, text: white | bg: #0A84FF, text: white |
| `secondary` | bg: rgba(120,120,128,0.2), text: label | bg: rgba(120,120,128,0.3), text: label |
| `ghost` | bg: transparent, text: accent | bg: transparent, text: accent |
| `destructive` | bg: #FF3B30, text: white | bg: #FF453A, text: white |
| `tinted` | bg: rgba(0,122,255,0.1), text: accent | bg: rgba(10,132,255,0.15), text: accent |

### Sizes

| Size | Height | Padding H | Font | Radius |
|------|--------|-----------|------|--------|
| `sm` | 28px | 10px | 13px | 6px |
| `md` | 34px | 14px | 15px | 8px |
| `lg` | 44px | 20px | 17px | 10px |

### States
- Hover: `brightness(0.92)` filter hoặc darker bg
- Active: `scale(0.97)`, `brightness(0.88)`
- Disabled: `opacity-40 cursor-not-allowed`
- Loading: spinner replaces leftIcon, disabled interaction
- Focus: `ring-2 ring-apple-accent ring-offset-2`

### Tailwind Implementation

```tsx
const variants = {
  primary: 'bg-[#007AFF] dark:bg-[#0A84FF] text-white hover:brightness-90 active:scale-[0.97]',
  secondary: 'bg-black/10 dark:bg-white/15 text-[var(--apple-label-primary)] hover:bg-black/15 dark:hover:bg-white/20',
  ghost: 'bg-transparent text-[#007AFF] dark:text-[#0A84FF] hover:bg-[#007AFF]/10',
  destructive: 'bg-[#FF3B30] dark:bg-[#FF453A] text-white hover:brightness-90',
  tinted: 'bg-[#007AFF]/10 dark:bg-[#0A84FF]/15 text-[#007AFF] dark:text-[#0A84FF]',
}
```

---

## 2. Input

### File: `src/components/ui/Input.tsx`

```
Props:
  type?: 'text' | 'password' | 'email' | 'number' | 'search'
  size?: 'sm' | 'md' | 'lg'
  leftIcon?: ReactNode
  rightElement?: ReactNode
  error?: string
  label?: string
  hint?: string
  + tất cả HTMLInputElement props
```

### Visual Spec

- Background: `rgba(120,120,128,0.12)` light | `rgba(255,255,255,0.08)` dark
- Border: `1px solid transparent` (no border normally)
- Focus: border `1px solid #007AFF` + `box-shadow: 0 0 0 3px rgba(0,122,255,0.25)`
- Error: border `1px solid #FF3B30` + error text bên dưới (footnote style)
- Radius: 8px
- Padding: 8px 12px (md)

### Search Input variant
- Có search icon bên trái
- Clear button bên phải khi có value
- Background: `rgba(120,120,128,0.12)`

---

## 3. Textarea

### File: `src/components/ui/Textarea.tsx`

```
Props:
  autoResize?: boolean (default: true)
  minRows?: number (default: 3)
  maxRows?: number (default: 10)
  showCharCount?: boolean
  maxLength?: number
  + tất cả HTMLTextareaElement props
```

### Visual Spec

- Cùng style với Input
- Auto-resize: sử dụng `field-sizing: content` (CSS) hoặc JS resize
- Char count: bottom-right, footnote style, đỏ khi gần limit

---

## 4. Select

### File: `src/components/ui/Select.tsx`

```
Props:
  options: Array<{ value: string; label: string; icon?: ReactNode; disabled?: boolean }>
  placeholder?: string
  size?: 'sm' | 'md' | 'lg'
  error?: string
  + tất cả HTMLSelectElement props
```

### Visual Spec

- Native select với custom styling (cross-platform compatible)
- Chevron icon bên phải (lucide ChevronDown)
- Appearance: none + custom background arrow
- Cùng sizing với Input

---

## 5. Badge

### File: `src/components/ui/Badge.tsx`

```
Props:
  variant: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'neutral'
  size?: 'sm' | 'md'
  dot?: boolean (chỉ hiển thị dot, không có text)
```

| Variant | Background | Text |
|---------|-----------|------|
| `default` | `rgba(120,120,128,0.2)` | label-secondary |
| `accent` | `rgba(0,122,255,0.1)` | #007AFF |
| `success` | `rgba(52,199,89,0.1)` | #34C759 |
| `warning` | `rgba(255,149,0,0.1)` | #FF9500 |
| `error` | `rgba(255,59,48,0.1)` | #FF3B30 |
| `neutral` | `rgba(120,120,128,0.12)` | label-secondary |

---

## 6. Spinner

### File: `src/components/ui/Spinner.tsx`

```
Props:
  size?: 'xs' | 'sm' | 'md' | 'lg' (12, 16, 20, 24px)
  color?: 'accent' | 'white' | 'current'
```

- Animation: CSS `spin` 0.8s linear infinite
- Style: SVG ring, Apple-like thin stroke
- `currentColor` by default

---

## 7. Divider

### File: `src/components/ui/Divider.tsx`

```
Props:
  orientation?: 'horizontal' | 'vertical' (default: horizontal)
  label?: string (shows label in center)
  className?: string
```

- Color: `var(--apple-separator)`
- Label: footnote style, label-tertiary color, bg matches parent

---

## 8. ListRow

### File: `src/components/ui/ListRow.tsx`

Implements macOS Settings row pattern:

```
Props:
  icon?: ReactNode | { element: ReactNode; bgColor: string }
  label: string
  description?: string
  value?: ReactNode
  chevron?: boolean
  onClick?: () => void
  destructive?: boolean
  disabled?: boolean
  badge?: ReactNode
```

### Visual Spec

```
┌─────────────────────────────────────────────────────┐
│  [Icon 28x28]  Label Text               Value  [>]  │
│                Description (optional)               │
└─────────────────────────────────────────────────────┘
```

- Height: 44px (no description), 56px (with description)
- Icon: 28×28px với bgColor, rounded 6px, icon 16px white
- Hover: `rgba(0,0,0,0.04)` light | `rgba(255,255,255,0.04)` dark
- Active: `rgba(0,0,0,0.08)`
- Chevron: ChevronRight 16px, label-tertiary color
- Separator: 1px, inset-left 44+16=60px

### Grouped List

```tsx
// GroupedList wrapper
<ListGroup label="GENERAL">
  <ListRow ... />
  <ListRow ... />
</ListGroup>
```

- Group label: caption1, allcaps, label-secondary, 16px left padding

---

## 9. SidebarNav

### File: `src/components/ui/SidebarNav.tsx`

macOS System Settings-style sidebar navigation.

```
Props:
  items: SidebarItem[]
  activeId: string
  onSelect: (id: string) => void
  searchable?: boolean

SidebarItem:
  id: string
  label: string
  icon?: ReactNode | string (emoji fallback)
  iconBg?: string (CSS color for icon background)
  group?: string
  badge?: string | number
```

### Visual Spec

```
┌──────────────────────┐
│  🔍 Tìm kiếm         │  ← SearchInput
├──────────────────────┤
│  [Avatar] Tên        │  ← Profile item (special)
│  [Avatar] Gia đình   │
├──────────────────────┤
│  [📶] Wi-Fi          │
│  [🔵] Bluetooth      │
├──────────────────────┤
│  [⚙️] Cài đặt chung ←│  ← Active: accent bg + white text
└──────────────────────┘
```

- Width: 260px
- Padding: 8px horizontal
- Item height: 32px
- Item radius: 8px
- Active bg: `#007AFF` (light) / `#0A84FF` (dark)
- Active text: white
- Icon bg: rounded 6px, 22×22px, icon 14px white
- Hover: `rgba(0,0,0,0.06)` light | `rgba(255,255,255,0.06)` dark
- Group separator: `rgba(0,0,0,0.12)` line, 8px margin

---

## 10. Toolbar

### File: `src/components/ui/Toolbar.tsx`

```
Props:
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
  transparent?: boolean
  className?: string
```

### Visual Spec

- Height: 52px
- Background: `rgba(246,246,246,0.85)` light | `rgba(28,28,30,0.85)` dark
- Backdrop: `blur(20px) saturate(180%)`
- Border-bottom: `1px solid var(--apple-separator)`
- Padding: 0 16px

---

## 11. Tooltip

### File: `src/components/ui/Tooltip.tsx`

```
Props:
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right' (default: top)
  delay?: number (default: 600ms – Apple standard)
  children: ReactNode
```

- Background: `rgba(50,50,50,0.9)` (both modes)
- Text: white, caption1 (12px)
- Radius: 6px
- Padding: 4px 8px
- Arrow: 6px
- Delay: 600ms (Apple HIG recommendation)
- Animation: fade in 150ms

---

## 12. Export index

### `src/components/ui/index.ts`

```ts
export { Button } from './Button'
export { Input } from './Input'
export { Textarea } from './Textarea'
export { Select } from './Select'
export { Badge } from './Badge'
export { Spinner } from './Spinner'
export { Divider } from './Divider'
export { ListRow, ListGroup } from './ListRow'
export { SidebarNav } from './SidebarNav'
export { Toolbar } from './Toolbar'
export { Tooltip } from './Tooltip'
```

---

## Implementation Checklist

- [ ] `Button.tsx` + `Button.stories.tsx`
- [ ] `Input.tsx` + `Input.stories.tsx`
- [ ] `Textarea.tsx` + `Textarea.stories.tsx`
- [ ] `Select.tsx` + `Select.stories.tsx`
- [ ] `Badge.tsx` + `Badge.stories.tsx`
- [ ] `Spinner.tsx` + `Spinner.stories.tsx`
- [ ] `Divider.tsx` + `Divider.stories.tsx`
- [ ] `ListRow.tsx` + `ListRow.stories.tsx`
- [ ] `SidebarNav.tsx` + `SidebarNav.stories.tsx`
- [ ] `Toolbar.tsx` + `Toolbar.stories.tsx`
- [ ] `Tooltip.tsx` + `Tooltip.stories.tsx`
- [ ] `ui/index.ts` barrel export
