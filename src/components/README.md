# Atomic Design in Viezan

Viezan adopts Atomic Design incrementally so existing renderer features keep
working while components move behind stable public APIs.

## Layers

```text
src/components/
├── ui/
│   ├── atoms/       Primitive, reusable controls and the icon registry
│   └── molecules/   Small props-driven compositions of atoms
├── organisms/       App sections and feature-aware compositions
└── templates/       Layout-only shells with slots
src/pages/            Page state, data access, and feature orchestration
```

The existing `ui/`, root component files, and feature directories (`chat/`,
`live/`, and `translate/`) are migration zones; Dictionary already lives in
`organisms/dictionary/` on top of shared molecules. Their components
are re-exported from the appropriate layer first, then can be moved in focused
follow-up changes without breaking current imports.

## Dependency direction

```text
pages -> templates -> organisms -> molecules -> atoms
```

- A layer may depend only on layers to its right in the diagram above.
- Atoms and molecules are reusable and props-driven; they do not import stores,
  services, feature hooks, or pages.
- Organisms may own feature UI state and use application hooks or stores.
- Templates define layout only. They receive content through props/slots.
- Pages connect services, stores, and routing/page selection to the UI tree.
- Icons remain centralized in `src/components/ui/icons/`.

Run `npm run check:atomic` after changing a layer. The check rejects upward
layer imports and business-logic imports from pure UI layers.
Run `npm run check:design` after changing tokens or atomic UI; it verifies the
canonical imports and rejects literal colors in the Atomic Design catalog.

## Button semantics

All feature controls use the `Button` atom and one of these variants:

| Variant | Meaning | Examples |
| --- | --- | --- |
| `neutral` | Reversible utility or dismiss | Copy, download, close, menus |
| `primary` | Active, selected, create or start | New, send, active mode |
| `danger` | Alert, destructive or stop | Delete, clear, reset, stop |

Use native `disabled` for unavailable actions. Disabled styling always becomes
gray regardless of the original variant. Controls in the same toolbar share a
semantic size (`xs` 28px, `sm` 32px, `md` 36px, or `lg` 40px).

Variant answers “what does this action mean?” Appearance answers “how much
attention does it deserve?” Keep those decisions separate:

| Appearance | Use |
| --- | --- |
| `solid` | One decisive action per work area: Send, Resume, Confirm |
| `soft` | Selected modes, active state, non-dominant danger |
| `outline` | Bounded secondary actions and standalone utilities |
| `ghost` | Dense toolbars, message actions, dismiss/copy/download |

Use `rect` for full-width/task actions, `pill` for compact labels/modes, and
`icon` only when the icon has an accessible name.

Standard controls keep their atom height even when feature styles are attached.
Prompt cards deliberately grow with their multi-line content and use the
existing prompt-card tokens instead of toolbar heights. Native buttons remain
for full-surface backdrops, image previews, renameable speaker badges, and
content-driven menu/list/choice rows in migration-zone components; these are
not toolbar controls. New ordinary actions must use the `Button` atom.

## Visual foundation

`src/styles/tokens.css` is the canonical source for the rendered application.
It defines primitive palettes and semantic aliases for both themes.

| Foundation | Scale |
| --- | --- |
| Spacing | 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48px |
| Radius | 4, 6, 8, 10 control, 12, 16, 20, 24px, pill |
| Controls | 28 inline, 32 compact, 36 default, 40 prominent, 48 touch |
| Icons | 12, 14, 16, 20, 24px |
| Brand marks | 28px compact/avatar, 36px standard, 48px hero |
| Type | 10 metadata, 11 caption, 12 small, 13 control, 14 body, 16 title |
| Elevation | `xs`, `sm`, `md`, `lg`, `overlay` |
| Layers | Context 60, navigation backdrop 65, navigation overlay 70, modal 80 |
| Motion | 120ms fast, 180ms normal, standard easing |

Components consume semantic names such as `surface-muted`, `text-soft`,
`action-soft`, `danger`, and `disabled-fg`; they must not select palette values
directly. Tailwind neutral/brand colors, radii, and shadows map back to these
tokens so migration-zone components render consistently with atoms.

## Color palette

`tokens.css` layers two kinds of color variable. Primitives are raw scales
that only `tokens.css` itself should reference; semantic tokens are named
roles that every component references instead.

### Primitives

| Scale | Steps | Use |
| --- | --- | --- |
| Neutral | 0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950 | Base gray ramp behind every background, border, and text token |
| Blue | 50–900 | Accent/action ramp (Apple system blue) |
| Red | 50, 200, 500–700 | Danger ramp |
| Green | 50, 500, 600 | Success ramp |
| Amber | 50, 500, 600 | Warning ramp |

### Semantic tokens

| Category | Tokens | Purpose |
| --- | --- | --- |
| App chrome | `app-bg`, `titlebar-bg`, `sidebar-bg`, `chat-sidebar-bg` | Window-level backgrounds outside content surfaces |
| Surfaces | `canvas`, `surface`, `surface-raised`, `surface-muted`, `surface-subtle`, `surface-hover`, `surface-selected` | Content panels, cards, and their interactive states |
| Text | `text`, `text-strong`, `text-muted`, `text-soft`, `text-disabled`, `text-inverse` | Type hierarchy from primary to inverse-on-accent |
| Borders | `border`, `border-strong`, `divider` | Outlines and separators, low to higher contrast |
| Materials | `titlebar-material`, `primary-nav-material`, `context-nav-material`, `overlay-material`, `material-border`, `material-highlight` | Translucent vibrancy surfaces; native blur backs them on macOS |
| Action (accent) | `action`, `action-hover`, `action-active`, `action-soft`, `action-soft-hover`, `action-border`, `action-text`, `action-fg`, `focus-ring` | The single accent color: primary buttons, active/selected state, links, focus ring |
| Feedback | `success`, `success-soft`, `success-border`, `warning`, `warning-soft`, `warning-border`, `danger`, `danger-hover`, `danger-soft`, `danger-soft-hover`, `danger-border` | Status colors; each pairs a soft background and border for banners/badges |
| Disabled | `disabled-bg`, `disabled-border`, `disabled-fg` | Overrides every variant's colors when a control is natively disabled |

### Light vs dark

- Light is the default (`:root`); dark activates under `html.dark`.
- The accent stays the same blue family in both themes (`blue-600` light,
  `blue-500` dark) — only surfaces, text, and border opacity shift, so the app
  keeps one identity across themes.
- Feedback colors get theme-tuned values in dark mode instead of reusing the
  light-mode primitive scale; low-saturation red/green reads poorly on dark
  surfaces.

### Rules

- Reference the semantic token, never a literal hex/rgba value, in atoms,
  molecules, organisms, and templates. `npm run check:design` rejects literal
  colors found in those directories.
- Assert the variant/state in tests, not a literal hex/RGB value.
- Add a semantic alias when component code needs a new name; add a primitive
  only when no existing scale can express the need.

## Control hierarchy

- Message action rows use `xs`; contextual toolbars use `sm`; forms, search,
  and chat composers use `md`; global navigation targets use `lg`.
- Send/confirm may use primary solid. Persistent create actions in navigation
  use primary ghost; active modes use primary soft.
- Time, token usage, and cost are metadata: muted text without pills or borders.
- Red is reserved for warnings and destructive/stop actions. Recency and counts
  remain neutral.
- Brand marks retain the original two-tone color. Do not grayscale them;
  functional navigation icons remain monochrome.

## Responsive layout modes

Chat geometry responds to the width of `.app-main` through container queries,
so opening either navigation organism does not leave stale window-based gaps.
Messages, suggestions, and composer share a stage axis while prose keeps a
separate readable maximum width.

| Main container | Structure |
| --- | --- |
| `< 760px` | One-column cards, full-width stage, 12px gutter |
| `760–999px` | Two-column cards, compact stage, 20px gutter |
| `1000–1199px` | Four-column cards, 24px gutter |
| `1200–1759px` | Standard desktop stage, 32px gutter |
| `>= 1760px` | Wider stage and composer, prose remains capped, 40px gutter |

The AI Chat sidebar auto-compacts below the desktop threshold but preserves
the user's stored preference. Expanding it in compact mode creates a temporary
overlay that closes on selection, outside click, or Escape.

On desktop, primary navigation is a persistent `60px` collapsed or `236px`
expanded layout column. The stored user preference survives navigation, and an
expanded primary column sits before—not above—the independent AI Chat session
sidebar. At compact widths only, labelled mode becomes a portal overlay and
closes after navigation, outside click, or Escape. The logo and toggle always
occupy separate layout slots: the logo stays in navigation and the toggle is
hosted in the window header, outside its draggable region. On macOS the header
reserves space for native traffic lights.

Sidebar structure does not change merely because a feature adds contextual
navigation. At `>=900px`, primary and AI Chat sidebars respect their independent
stored preferences across feature navigation. Collapsed AI Chat history is
fully hidden and consumes no layout width. Its history toggle and New Chat
action stay in the feature header beside the current conversation title.
Below `900px`, primary navigation keeps its rail; chat history opens from its
header as a temporary overlay. The overlays are mutually exclusive and close
on selection, outside click, or Escape. Effective responsive states never
rewrite preferences, including when opening history from a saved collapsed state.

## Imports

Use a layer public API from outside that layer:

```tsx
import { ToggleSwitch } from '@/components/ui/atoms'
import { InlineErrorBanner } from '@/components/ui/molecules'
import { Sidebar } from '@/components/organisms'
import { AppShell } from '@/components/templates'
```

Within a layer, prefer direct file imports to avoid barrel-file cycles.

## Placement checklist

1. If it cannot be split into smaller meaningful UI pieces, place it in atoms.
2. If it combines a few atoms into one reusable control, place it in molecules.
3. If it represents a substantial app/feature section, place it in organisms or
   keep it in its feature directory during migration.
4. If it only arranges sections into a page shape, place it in templates.
5. If it fetches/connects data or chooses feature state, keep it in pages.
