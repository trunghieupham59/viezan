---
paths:
  - "apps/macos/Sources/**/*.swift"
  - "apps/desktop-qt/**"
  - "resources/**"
  - "docs/design/**"
---

# UI/UX Design Rules

Apply these decisions to SwiftUI/AppKit and Qt Quick controls.

## Sources of truth

- Precedence when sources disagree: `resources/tokens.css` (values) →
  `AGENTS.md` (rules) → `docs/design/foundations.md` →
  `docs/design/direction.md` (the single native direction, "Quiet Workbench",
  with its Claude Design canvas) → the screen spec in
  `docs/design/screens/*.md` → the Review 18 prototype in
  `docs/migration/desktop-review/`. The boards in `docs/design/boards/`, the
  macOS 27 review and the Figma file are historical reference only.
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

## Design research with UI UX Pro Max

- Use `docs/agents/skill/viezan-native-ux/SKILL.md` and its
  `references/ui-ux-pro-max.md` when designing or reviewing native UI.
  The pinned upstream skill is in `.agents/skills/ui-ux-pro-max/`.
- Search the relevant style, UX concern or SwiftUI stack; check each result's
  platform before applying it. Qt uses general UX results and Qt documentation,
  not a fabricated Qt stack. Existing tokens, native semantics and the source
  precedence above govern the result.
- Keep the existing design system. Do not generate a competing `MASTER.md`,
  replace desktop metrics with web/mobile defaults, or use a search result as
  evidence of native rendering, accessibility or runtime acceptance.

## Typography

- Use native system fonts, the shared reading/mono roles, and generated scale
  metrics. Honor text-size preferences and CJK fallback.
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
  placeholder.
- One concept, one name, in every screen and language (e.g. "Chất lượng cao").
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

## Layout and controls

- Size feature layouts from the available content area. Keep the header on
  one row while it fits. Let the language pair shrink first, then collapse
  labels into named icon controls before wrapping actions.
- Use small controls in headers and align sibling toolbars. Keep language
  selectors on either side of their swap or lock control. Check for clipping
  and horizontal overflow at compact widths.
- Use shared control metrics, a neutral disabled appearance and toolkit
  disabled semantics. Preserve a visible selected state beyond colour.

## Focus and shortcuts

- Draw a visible keyboard focus indicator on actionable controls. For text
  fields, use the caret and a stronger border. Preserve the native focus order.
- Place shortcut hints inside their controls and expose accessible names.
  Use platform key names. Enter and Escape respect active IME composition.

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

- Exercise the changed native screen at desktop and compact widths (1200 and
  820 points or logical pixels), in light and dark modes. For typography
  changes include all three text sizes and EN/VI/JA.
- Check clipping, keyboard focus, accessibility and IME in the running app.
  Restore any theme, locale or text-size settings changed during verification.
