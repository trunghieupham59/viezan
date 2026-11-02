# Phase 3 – Apple Design Language System

## Tổng quan

Viezan Phase 3 áp dụng ngôn ngữ thiết kế Apple (macOS/iOS HIG) làm nền tảng cho toàn bộ UI/UX. Mục tiêu: tạo ra trải nghiệm native-feeling, nhất quán và dễ dùng như macOS System Settings.

Tham chiếu chính: [Apple Human Interface Guidelines – macOS](https://developer.apple.com/design/human-interface-guidelines/macos)

---

## 1. Color System

### Base Colors (CSS Custom Properties)

```css
/* === APPLE DESIGN TOKENS === */

/* Accent */
--apple-accent:           #007AFF;  /* Blue – light */
--apple-accent-dark:      #0A84FF;  /* Blue – dark */
--apple-accent-hover:     #0066CC;  /* Hover state */

/* Backgrounds */
--apple-bg-window:        #ECECEC;  /* Window chrome – light */
--apple-bg-window-dark:   #1C1C1E;  /* Window chrome – dark */

--apple-bg-primary:       #FFFFFF;  /* Content area – light */
--apple-bg-primary-dark:  #1C1C1E;  /* Content area – dark */

--apple-bg-secondary:     #F2F2F7;  /* Sidebar, secondary – light */
--apple-bg-secondary-dark:#2C2C2E;  /* Sidebar, secondary – dark */

--apple-bg-tertiary:      #FFFFFF;  /* Cards, list rows – light */
--apple-bg-tertiary-dark: #3A3A3C;  /* Cards, list rows – dark */

--apple-bg-grouped:       #F2F2F7;  /* Grouped table bg – light */
--apple-bg-grouped-dark:  #000000;  /* Grouped table bg – dark */

/* Vibrancy / Glass */
--apple-vibrancy-bg:      rgba(246,246,246,0.85);   /* Sidebar vibrancy – light */
--apple-vibrancy-bg-dark: rgba(30,30,30,0.85);       /* Sidebar vibrancy – dark */

/* Labels / Text */
--apple-label-primary:    rgba(0,0,0,1.0);            /* – light */
--apple-label-primary-dark:rgba(255,255,255,1.0);     /* – dark */

--apple-label-secondary:  rgba(60,60,67,0.6);         /* – light */
--apple-label-secondary-dark:rgba(235,235,245,0.6);   /* – dark */

--apple-label-tertiary:   rgba(60,60,67,0.3);         /* – light */
--apple-label-tertiary-dark:rgba(235,235,245,0.3);    /* – dark */

--apple-label-quaternary: rgba(60,60,67,0.18);        /* – light */
--apple-label-quaternary-dark:rgba(235,235,245,0.18); /* – dark */

/* Separators */
--apple-separator:        rgba(60,60,67,0.29);        /* – light */
--apple-separator-dark:   rgba(84,84,88,0.65);        /* – dark */

--apple-opaque-separator: #C6C6C8;                    /* – light */
--apple-opaque-separator-dark: #38383A;               /* – dark */

/* Fill Colors */
--apple-fill-primary:     rgba(120,120,128,0.2);
--apple-fill-secondary:   rgba(120,120,128,0.16);
--apple-fill-tertiary:    rgba(118,118,128,0.12);
--apple-fill-quaternary:  rgba(116,116,128,0.08);

/* System Colors */
--apple-red:              #FF3B30;
--apple-orange:           #FF9500;
--apple-yellow:           #FFCC00;
--apple-green:            #34C759;
--apple-teal:             #5AC8FA;
--apple-blue:             #007AFF;
--apple-indigo:           #5856D6;
--apple-purple:           #AF52DE;
--apple-pink:             #FF2D55;

/* System Colors – Dark */
--apple-red-dark:         #FF453A;
--apple-orange-dark:      #FF9F0A;
--apple-yellow-dark:      #FFD60A;
--apple-green-dark:       #30D158;
--apple-teal-dark:        #64D2FF;
--apple-blue-dark:        #0A84FF;
--apple-indigo-dark:      #5E5CE6;
--apple-purple-dark:      #BF5AF2;
--apple-pink-dark:        #FF375F;
```

### Mapping sang Tailwind CSS v4

Sử dụng `@theme` trong `index.css` để map sang Tailwind utilities:

```css
@theme {
  --color-apple-accent: var(--apple-accent);
  --color-apple-bg-primary: var(--apple-bg-primary);
  --color-apple-bg-secondary: var(--apple-bg-secondary);
  /* ... */
}
```

---

## 2. Typography

### SF Pro Type Scale (Apple HIG)

| Role | Size | Line Height | Weight | Tailwind class |
|------|------|-------------|--------|----------------|
| Large Title | 34px | 41px | 700 | `apple-large-title` |
| Title 1 | 28px | 34px | 700 | `apple-title1` |
| Title 2 | 22px | 28px | 700 | `apple-title2` |
| Title 3 | 20px | 25px | 600 | `apple-title3` |
| Headline | 17px | 22px | 600 | `apple-headline` |
| Body | 17px | 22px | 400 | `apple-body` |
| Callout | 16px | 21px | 400 | `apple-callout` |
| Subheadline | 15px | 20px | 400 | `apple-subhead` |
| Footnote | 13px | 18px | 400 | `apple-footnote` |
| Caption 1 | 12px | 16px | 400 | `apple-caption1` |
| Caption 2 | 11px | 13px | 400 | `apple-caption2` |

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
             'Helvetica Neue', Arial, sans-serif;
```

---

## 3. Spacing (4pt Grid)

```
4px   → gap-1, p-1, m-1
8px   → gap-2, p-2, m-2
12px  → gap-3, p-3, m-3
16px  → gap-4, p-4, m-4
20px  → gap-5, p-5, m-5
24px  → gap-6, p-6, m-6
32px  → gap-8, p-8, m-8
40px  → gap-10, p-10, m-10
48px  → gap-12, p-12, m-12
```

---

## 4. Border Radius

| Tên | Value | Dùng cho |
|-----|-------|----------|
| `radius-sm` | 4px | Tags, small badges |
| `radius-md` | 8px | Buttons, inputs, cards nhỏ |
| `radius-lg` | 12px | Cards, panels, modals |
| `radius-xl` | 16px | Large cards, sheets |
| `radius-2xl` | 20px | Windows, drawers |
| `radius-pill` | 9999px | Pill buttons, tags |

---

## 5. Shadows

```css
/* macOS-style shadows */
--apple-shadow-sm:    0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08);
--apple-shadow-md:    0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.10);
--apple-shadow-lg:    0 10px 30px rgba(0,0,0,0.20), 0 4px 10px rgba(0,0,0,0.12);
--apple-shadow-panel: 0 0 0 1px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.12);
```

---

## 6. Transitions & Animation

```css
/* Standard transitions */
--apple-transition-fast:   150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
--apple-transition-normal: 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
--apple-transition-slow:   350ms cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Spring animation (for modals, drawers) */
--apple-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## 7. Component Patterns

### 7.1 List Row (macOS Settings pattern)
```
[Icon] Label                    [value] [>]
```
- Height: 44px minimum (touch target)
- Left padding: 16px
- Icon: 28×28px với background màu, rounded 6px
- Separator: 1px, indented 44px from left

### 7.2 Sidebar Navigation
- Width: 260–280px
- Background: vibrancy blur
- Item height: 32px
- Active: accent blue bg + white text
- Icon: 18px, rounded 4px bg khi có màu

### 7.3 Toolbar
- Height: 52px
- Background: semi-transparent + backdrop blur 20px
- Border bottom: 1px separator

### 7.4 Modal / Sheet
- Max width: 560px (settings), 720px (content)
- Backdrop: rgba(0,0,0,0.4)
- Border radius: 12px
- Shadow: --apple-shadow-lg

### 7.5 Button States
```
Default:  bg + label color
Hover:    bg slightly darker (5% darker in light, 5% lighter in dark)
Active:   scale(0.97)
Disabled: opacity 0.4
Focus:    3px ring với --apple-accent, offset 2px
```

---

## 8. Iconography

- Library: **lucide-react** (đã có trong project)
- Size mặc định: 16px (small), 18px (default), 20px (medium), 24px (large)
- Stroke width: 1.5 (Apple-like thin icons)
- Không dùng filled icons trừ khi cần thiết (active state)

---

## 9. Dark Mode Strategy

- Trigger: `html.dark` class (Tailwind dark mode class)
- Tất cả token dark mode dùng `.dark` prefix
- CSS custom properties override trong `.dark` selector:

```css
.dark {
  --apple-bg-primary: var(--apple-bg-primary-dark);
  --apple-label-primary: var(--apple-label-primary-dark);
  /* ... */
}
```

---

## 10. Accessibility

- Contrast ratio: AA minimum (4.5:1 text, 3:1 UI)
- Focus indicators: visible, 3px accent ring
- Touch targets: minimum 44×44px (macOS 32px minimum acceptable)
- ARIA labels: bắt buộc cho icon-only buttons
- Reduced motion: `@media (prefers-reduced-motion)` → disable animations
