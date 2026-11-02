# Phase 3 – Implementation Rules

## Mục đích

Bộ rules này là **law** cho mọi component được tạo hoặc sửa trong Phase 3. Không có ngoại lệ trừ khi có lý do kỹ thuật rõ ràng và được comment.

---

## RULE-UI-001: Không dùng border màu đậm

❌ Sai:
```tsx
<div className="border border-gray-300">
<div style={{ border: '1px solid #ccc' }}>
```

✅ Đúng:
```tsx
<div className="border border-[var(--apple-separator)]">
<div className="divide-y divide-[var(--apple-separator)]">
```

---

## RULE-UI-002: Focus visible phải dùng --apple-accent ring

❌ Sai:
```tsx
<button className="focus:outline-none">
<button className="focus:ring-blue-500">
```

✅ Đúng:
```tsx
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2">
```

Dùng `focus-visible:` không phải `focus:` – chỉ hiện ring khi dùng keyboard.

---

## RULE-UI-003: Border radius phải theo thang đã định

| Use case | Value |
|----------|-------|
| Tags, badges nhỏ | `rounded` (4px) |
| Buttons, inputs | `rounded-lg` (8px) |
| Cards, panels nhỏ | `rounded-xl` (12px) |
| Cards lớn, modals | `rounded-2xl` (16px) |
| Pill/circle | `rounded-full` |

❌ Sai: `rounded-[5px]`, `rounded-3px`, `rounded-[7px]`  
✅ Đúng: `rounded`, `rounded-lg`, `rounded-xl`

---

## RULE-UI-004: Transition chỉ dùng 150ms/250ms ease

❌ Sai:
```tsx
<div className="transition-all duration-500">
<div style={{ transition: 'all 0.3s' }}>
```

✅ Đúng:
```tsx
// Fast interactions (hover, active)
<div className="transition-all duration-150 ease-out">

// Medium (expand, slide)
<div className="transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]">

// No animation for layout changes
<div> // no transition
```

---

## RULE-UI-005: Icons phải dùng lucide-react với stroke-width 1.5

❌ Sai:
```tsx
import { Settings } from 'some-other-icon-lib'
<Settings size={20} /> // no strokeWidth
```

✅ Đúng:
```tsx
import { Settings } from 'lucide-react'
<Settings size={18} strokeWidth={1.5} />

// Hoặc dùng wrapper:
<Icon icon={Settings} size={18} />
```

Sizes chuẩn: 12, 14, 16, 18, 20, 24px  
Stroke width: 1.5 (default), 2.0 (chỉ khi cần nhấn mạnh)

---

## RULE-UI-006: Không hardcode màu, luôn dùng CSS custom property hoặc token chuẩn

❌ Sai:
```tsx
<div className="text-gray-600">
<div style={{ color: '#666' }}>
<div className="bg-blue-500">
```

✅ Đúng:
```tsx
<div className="text-[var(--apple-label-secondary)]">
<div className="text-[#007AFF] dark:text-[#0A84FF]">  // accent color pair
<div className="bg-[var(--apple-bg-secondary)]">
```

**Màu được phép hardcode** (vì chúng là Apple system colors, không thay đổi theo theme):
- Accent: `#007AFF` / `#0A84FF`
- Red: `#FF3B30` / `#FF453A`
- Green: `#34C759` / `#30D158`
- Orange: `#FF9500` / `#FF9F0A`
- (Phải luôn có cặp light/dark)

---

## RULE-UI-007: Dark mode phải dùng Tailwind dark: prefix

❌ Sai:
```tsx
// CSS-only dark mode
.my-class { background: white; }
.dark .my-class { background: black; }
```

✅ Đúng:
```tsx
<div className="bg-white dark:bg-[#1C1C1E]">
<div className="text-black dark:text-white">
```

Lý do: Tailwind `dark:` tự động respond với `html.dark` class, nhất quán với cách project đang làm.

---

## RULE-UI-008: Mọi component PHẢI có Storybook story

```
Tạo component → Tạo story ngay cùng lúc.
Không được merge component không có story.
```

Cấu trúc story tối thiểu:
```tsx
export const Default: Story = { args: { ... } }
export const Dark: Story = { ... } // dark theme variant
// + các edge cases quan trọng
```

---

## RULE-UI-009: Typography phải dùng đúng SF Pro scale

Mapping Tailwind:

```tsx
// Large Title: 34px 700
className="text-[34px] leading-[41px] font-bold"

// Title 1: 28px 700
className="text-[28px] leading-[34px] font-bold"

// Title 2: 22px 700
className="text-[22px] leading-[28px] font-bold"

// Title 3: 20px 600
className="text-[20px] leading-[25px] font-semibold"

// Headline: 17px 600
className="text-[17px] leading-[22px] font-semibold"

// Body: 17px 400
className="text-[17px] leading-[22px] font-normal"

// Callout: 16px 400
className="text-[16px] leading-[21px] font-normal"

// Subheadline: 15px 400
className="text-[15px] leading-[20px] font-normal"

// Footnote: 13px 400
className="text-[13px] leading-[18px] font-normal"

// Caption 1: 12px 400
className="text-[12px] leading-[16px] font-normal"

// Caption 2: 11px 400
className="text-[11px] leading-[13px] font-normal"
```

Tạo `@layer utilities` trong `index.css` để shortcut:
```css
.text-apple-headline { font-size: 17px; line-height: 22px; font-weight: 600; }
.text-apple-body { font-size: 17px; line-height: 22px; font-weight: 400; }
/* ... */
```

---

## RULE-UI-010: Spacing phải tuân thủ 4pt grid

❌ Sai: `p-[5px]`, `gap-[7px]`, `mt-[9px]`  
✅ Đúng: `p-1` (4px), `p-2` (8px), `p-3` (12px), `p-4` (16px), `p-5` (20px)

Tailwind spacing scale mặc định: 1=4px, 2=8px, 3=12px, 4=16px, 5=20px, 6=24px

---

## RULE-UI-011: Accessible names cho icon-only buttons

❌ Sai:
```tsx
<button><Settings /></button>
<button><X /></button>
```

✅ Đúng:
```tsx
<button aria-label="Cài đặt"><Settings /></button>
<button aria-label="Đóng"><X /></button>
// Hoặc dùng Tooltip wrapper:
<Tooltip content="Cài đặt">
  <button aria-label="Cài đặt"><Settings /></button>
</Tooltip>
```

---

## RULE-UI-012: Animation phải respect prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Thêm vào `src/index.css`. Không viết thêm vào từng component.

---

## RULE-UI-013: Không dùng `px` cứng cho layout width/height

❌ Sai:
```tsx
<div style={{ width: '600px', height: '400px' }}>
```

✅ Đúng:
```tsx
<div className="w-[600px] min-h-[400px]">  // max-width OK
<div className="flex-1 min-h-0">           // flexible preferred
```

---

## RULE-UI-014: Component props phải có TypeScript strict types

❌ Sai:
```tsx
function Button({ variant, onClick, children }: any) { ... }
```

✅ Đúng:
```tsx
type ButtonProps = {
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  onClick?: () => void
  children: ReactNode
} & Omit<HTMLButtonElement, 'onClick'>

function Button({ variant, size = 'md', loading = false, ...props }: ButtonProps) { ... }
```

---

## RULE-UI-015: Stacking context và z-index phải theo thang chuẩn

```ts
// z-index scale
const Z_INDEX = {
  base:    0,
  raised:  10,      // cards, dropdowns
  overlay: 100,     // modals, drawers
  tooltip: 500,     // tooltips
  toast:   1000,    // notifications
  max:     9999,    // emergency
} as const
```

Dùng Tailwind: `z-0`, `z-10`, `z-[100]`, `z-[500]`, `z-[1000]`

---

## RULE-UI-016: Lỗi và loading states phải được xử lý

Mọi component có async data phải có:
1. **Loading state**: Skeleton hoặc Spinner
2. **Error state**: Error message + retry action
3. **Empty state**: Helpful message

---

## RULE-UI-017: i18n cho tất cả text user-facing

❌ Sai:
```tsx
<p>Translate</p>
<button>Clear</button>
```

✅ Đúng:
```tsx
const { t } = useT()
<p>{t('translate.action')}</p>
<button>{t('common.clear')}</button>
```

---

## Checklist trước khi commit

```
- [ ] Component có TypeScript types đầy đủ (không `any`)
- [ ] Có Storybook story
- [ ] Dark mode hoạt động
- [ ] Focus-visible ring hiển thị đúng
- [ ] Aria labels cho icon-only buttons
- [ ] Text dùng i18n key
- [ ] Không hardcode màu (ngoài system colors đã define)
- [ ] Spacing tuân thủ 4pt grid
- [ ] Transitions ≤ 250ms
- [ ] No console errors in Storybook
```

---

## Quick Reference

```tsx
// ✅ Apple Accent color
text-[#007AFF] dark:text-[#0A84FF]
bg-[#007AFF] dark:bg-[#0A84FF]

// ✅ Separator
border-[var(--apple-separator)]
divide-[var(--apple-separator)]

// ✅ Secondary background
bg-[var(--apple-bg-secondary)]

// ✅ Label colors
text-[var(--apple-label-primary)]
text-[var(--apple-label-secondary)]
text-[var(--apple-label-tertiary)]

// ✅ Focus ring
focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2 focus-visible:outline-none

// ✅ Standard card
rounded-xl bg-[var(--apple-bg-tertiary)] shadow-[var(--apple-shadow-sm)]

// ✅ Vibrancy sidebar
bg-[var(--apple-vibrancy-bg)] dark:bg-[var(--apple-vibrancy-bg-dark)] backdrop-blur-[20px] backdrop-saturate-[180%]
```
