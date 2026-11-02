# Phase 3 – Storybook Setup

## Mục tiêu

Storybook là **living style guide** cho Viezan. Mỗi component phải có story tương ứng để:
- Document visual states (default, hover, disabled, dark mode)
- Test component isolation
- Làm tham chiếu cho team khi build feature mới

---

## 1. Cài đặt

```bash
npx storybook@latest init --type react --builder @storybook/react-vite
```

Dependencies cần thêm:
```json
{
  "devDependencies": {
    "@storybook/react": "^8.x",
    "@storybook/react-vite": "^8.x",
    "@storybook/addon-essentials": "^8.x",
    "@storybook/addon-a11y": "^8.x",
    "@storybook/addon-themes": "^8.x",
    "storybook": "^8.x"
  }
}
```

---

## 2. Cấu hình `.storybook/`

### `.storybook/main.ts`

```ts
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal: async (config) => {
    // Reuse project's vite config (postcss, aliases)
    return config
  },
}

export default config
```

### `.storybook/preview.ts`

```ts
import type { Preview } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true, // dùng apple-bg thay vì storybook backgrounds
    },
    layout: 'centered',
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
    (Story) => (
      <div className="font-apple antialiased bg-apple-bg-primary text-apple-label-primary min-h-screen p-4">
        <Story />
      </div>
    ),
  ],
}

export default preview
```

---

## 3. Cấu trúc Stories

```
src/
  components/
    ui/
      Button/
        Button.tsx
        Button.stories.tsx    ← story file
      Input/
        Input.tsx
        Input.stories.tsx
      ...
    translate/
      TranslateToolbar.stories.tsx
    chat/
      ChatBubble.stories.tsx
  pages/
    TranslatePage.stories.tsx
```

---

## 4. Story Template chuẩn

### Ví dụ: `Button.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Apple-style button component với 3 variants: primary, secondary, ghost',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'destructive'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Dịch ngay',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Huỷ',
  },
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Xoá',
  },
}

export const Loading: Story = {
  args: {
    variant: 'primary',
    children: 'Đang dịch...',
    loading: true,
  },
}

export const Disabled: Story = {
  args: {
    variant: 'primary',
    children: 'Không thể dùng',
    disabled: true,
  },
}
```

---

## 5. Scripts trong `package.json`

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

---

## 6. Danh sách stories cần viết

### Tier 1 – Foundation (viết trước)
- [ ] `ui/Button` – variants, sizes, states
- [ ] `ui/Input` – types, states, with icons
- [ ] `ui/Textarea` – auto-resize, states
- [ ] `ui/Select` – options, disabled
- [ ] `ui/Badge` – colors, sizes
- [ ] `ui/Spinner` – sizes
- [ ] `ui/Divider` – horizontal, vertical, with label
- [ ] `ui/ListRow` – with icon, with value, with chevron
- [ ] `ui/Tooltip` – positions

### Tier 2 – Navigation
- [ ] `ui/SidebarNav` – items, active state, groups
- [ ] `ui/Toolbar` – with actions, translucent

### Tier 3 – Complex Components
- [ ] `components/ModelSelector` – all providers
- [ ] `components/ApiKeyInput` – show/hide password
- [ ] `components/LanguageSelector` – source, target
- [ ] `components/ProviderIcon` – all providers

### Tier 4 – Pages (integration)
- [ ] `pages/TranslatePage` – full page story
- [ ] `pages/ChatPage` – with messages
- [ ] `pages/SettingsPage` – with sections

---

## 7. Storybook A11y Rules

Bắt buộc pass:
- `color-contrast` – minimum AA
- `button-name` – all buttons have accessible names
- `image-alt` – all images have alt text
- `focus-trap-d-i` – modals trap focus correctly

Run: `npx storybook test --coverage`
