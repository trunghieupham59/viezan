---
paths:
  - "src/**/*.{ts,tsx,css}"
  - "tailwind.config.mjs"
  - "docs/design/**"
---

# UI/UX Design Rules

Decisions settled while building the "quiet workbench" design. They extend
`AGENTS.md` (Atomic UI, tokens, chat invariants) and `atomic-ui.md`; follow
both. Each rule names the code that already implements it, so a new change
can copy the pattern instead of inventing one.

## Sources of truth

- Precedence when sources disagree: `src/styles/tokens.css` (values) →
  `AGENTS.md` (rules) → `docs/design/foundations.md` → the screen spec in
  `docs/design/screens/*.md` → the boards in `docs/design/boards/`.
- Boards are mocks. Their Inter / JetBrains Mono fonts and literal colours are
  not requirements; the specs and tokens are.
- Before changing a screen, read its spec. When behaviour changes, update the
  spec in the same change and delete the matching line from its section 10
  ("Chênh lệch với bản dựng hiện tại").
- Record a settled design decision under "Quyết định thiết kế" in
  `docs/design/findings.md`, one line with the reason. Do not reverse one of
  those decisions without the user asking.
- A screen's three-language behaviour lives in `docs/design/locales.md`;
  persona behaviour in `docs/design/personas.md`.

## Typography

- One interface family: `var(--vzn-font-sans)` (system font with the CJK
  fallback). Mono text uses `var(--vzn-font-mono)` or Tailwind `font-mono`
  (mapped to the token). Serif appears only through `--vzn-font-display` /
  `--vzn-font-reading` in the Paper persona. Never write a `font-family`
  stack by hand.
- Every font size is a `--vzn-font-size-*` token, never a px/rem/em literal or
  a Tailwind bracket. The tokens multiply `--vzn-text-scale`, which the Text
  size setting drives through `html[data-text-size]`; a literal size silently
  ignores the setting.
- Never set the root `font-size`. `rem` is fixed by `--vzn-root-font-size` and
  sizes layout, not type.
- Role sizes (foundations §4): page title `title-lg` (18) · section card title
  `subtitle` (15) · primary and Settings navigation items, row labels `lg`
  (14) · body text and buttons `md` (13) · descriptions `sm` (12) · uppercase
  group labels `caption` (11). Keep the hierarchy; do not shrink navigation
  below row labels.

## Copy and localization

- Vietnamese is the source copy; EN and JA say the same thing, no more.
- Never build a sentence from fragments. Use one key with placeholders
  (`{name}`, `{key}`, `{count}`) and `tpl()`; word order differs per language.
  To place a component inside a sentence, split the template on the
  placeholder (see `pressStepTitle` in `HotkeySection.tsx`).
- One concept, one name, in every screen and language (e.g. "Chất lượng cao",
  "token" for the Chrome extension credential, never "API key").
- Japanese: no space between Latin words and kana/kanji (`AIチャット`,
  `APIキー`), full-width punctuation (`：`, `（）`), the verb last
  (`{key}を押す`), and katakana instead of English words (`キー`, not `key`).
  The exception is a third-party UI name quoted verbatim.
- Quote another product's UI exactly as that product localizes it (Chrome
  menu names come from Chromium's translation files, e.g. "Chế độ dành cho
  nhà phát triển", "デベロッパー モード").
- EN uses sentence case. A visible label must appear inside the control's
  accessible name (WCAG 2.5.3): a short visible label is fine when
  `aria-label`/`title` carry the full phrase that contains it
  (`nav_search_label` / `nav_search_or_run`).
- Untitled stored data (e.g. the default chat title) is shown through a
  helper in the UI language (`chatSessionTitle`), never as the raw string.

## Layout

- Size feature layout from container queries on `app-main`, not the window.
- A page header stays on one row while it fits: the language pair shrinks
  first, then text labels collapse to icons that keep `aria-label` and
  `title`; only below the stated width do actions wrap to a second row
  (`.live-page-header`, `.translate-page-header`). Never let a header wrap at
  a width where it fits when compacted.
- Header controls are `sm` (32px). A language pair in a page header uses
  `size="sm"` and the shared separated style (`.page-header
  .language-pair-bar`): two framed language buttons with the swap, arrow or
  lock standing between them, on every page.
- Side-by-side panels keep their toolbars the same height so their dividers
  line up (`.live-panel-toolbar` min block size), even when only one holds a
  control.
- After a change, nothing may overflow its frame: a child taller than its
  container, text clipped without an ellipsis and `title`, or a horizontal
  page scroll are bugs.

## Overriding the Button atom

- `.ui-button` sets its size, colours and disabled state with `!important`
  inside `@layer components`. A layered `!important` beats any unlayered
  `!important`, so `height: … !important` in a feature stylesheet has no
  effect. Change the atom through its custom properties instead
  (`--vzn-button-height`, `--vzn-button-min-height`, `--vzn-button-bg`,
  `--vzn-button-border`, …).
- Scope colour overrides to `:not(:disabled)` so a disabled control keeps the
  atom's gray disabled contract.

## Focus

- Buttons, links, selects and other controls show keyboard focus with the
  shared `:focus-visible` ring (`--vzn-focus-ring`, `tokens.css`). Inside a
  connected control (language pair, navigation rows) draw it inset with a
  negative `outline-offset`.
- Text fields (text inputs, textareas, the chat composer, filter inputs)
  never show an accent ring or outline. Focus is the caret plus the border
  moving to `--vzn-border-strong`. Reset the outline explicitly: leaving a
  field out of the shared rule brings back the browser's `outline: auto` in
  the system accent colour. `src/styles/__tests__/focusRing.test.ts` guards
  this.
- Never remove focus outlines globally (`*:focus { outline: none }`).

## Shortcuts

- A shortcut hint lives inside the control it triggers, never beside it as a
  separate non-clickable chip (`.ai-chat-header-new`, `.sidebar-search-trigger`).
- Format key caps with `shortcutKeyCaps()`: `⌘N` on macOS, `Ctrl N`
  elsewhere. Also set `title` with the shortcut and `aria-keyshortcuts`.
- Enter and Escape handlers ignore IME composition (`isComposing` or
  `keyCode === 229`); use `shouldSendChatMessage` for send keys.

## Behaviour

- Navigating to a page keeps its state (drafts, results). Only an explicit
  "start new" action clears it (`navigateEffect` is used by Home's quick
  start only). Completed, durably saved Translate/Dictionary work may also start
  fresh on return after 2 hours/30 minutes away when smart session reset is on.
  Keep drafts and busy work; provide a persistent action to reopen the previous
  work. Reading without leaving never expires a screen. Recovery never calls AI.
- Reversible deletes (history entries, conversations) happen immediately and
  show a toast with Undo through the notification store's `actions`. Use a
  confirm dialog only for what cannot be undone (removing an API key,
  uninstalling a local model), worded as one templated sentence.
- Errors that belong to a field appear under that field with `aria-invalid`
  and `aria-describedby`; errors about a whole action or pair (e.g. same
  source and target language) use a toast.
- Async results announce politely (`aria-live="polite"`), with `aria-busy`
  while streaming so partial text is not read word by word.

## Verifying UI changes

- Check in the web preview (`npm run dev:web -- --port 5174`) at 1200px and 820px
  windows, in light and dark, and for typography changes at all three text
  sizes. Measure (`getComputedStyle`, `scrollWidth` vs `clientWidth`,
  bounding boxes) rather than judging screenshots alone.
- A preview tab running in the background freezes CSS transitions; disable
  transitions before measuring values that animate.
- Restore any preview state you changed (theme, preset, page, text size).
