# Viezan Agent Guide

This file is the shared project contract for coding agents. Keep it concise,
verifiable, and aligned with the repository rather than personal preferences.

## Start Here

- Inspect the relevant code and nearby tests before editing.
- Preserve unrelated work in the dirty worktree. Never reset, restore, or
  overwrite changes you did not create.
- For a task matching a purpose under `viezanagent/agent/`, read that purpose
  definition and resolve its workflow, skills, and rules as required by
  `viezanagent/agent/CAPABILITY_CONTRACT.md`.
- Before UI work, read `src/components/README.md` and run the Atomic Design
  check after changing presentation layers.
- Before UI/UX or copy work, read `.claude/rules/ui-ux.md` (settled design
  decisions: typography, localization, layout, focus, shortcuts, behaviour)
  and the screen's spec in `docs/design/screens/`. Any agent applies it, not
  only Claude Code.
- Prefer focused, reversible changes. Do not edit generated `dist/`,
  `dist-electron/`, `release/`, or dependency contents.

## Product and Architecture

- Viezan is a local-first native application: SwiftUI/AppKit and Swift on macOS;
  Qt Quick/QML and C++ on Windows/Linux. Build entrypoints live in `scripts/native/`.
- Keep privileged operations in `ViezanDomain` or the C++ service layer. Views
  must not gain arbitrary shell, credential or filesystem access.
- Preserve OS credential stores, bounded provider requests, atomic persistence,
  explicit operation ownership and helper authorization boundaries.
- Reuse Zustand slices, services, utilities, i18n keys, and icon registry
  before introducing parallel abstractions.
- User-facing text must use the existing EN/VI/JA localization system.

## Atomic UI Contract

Dependency direction is:

```text
pages -> templates -> organisms -> molecules -> atoms
```

- Atoms and molecules are reusable and props-driven. They must not import
  stores, services, feature hooks, pages, organisms, or templates.
- Organisms may compose feature state. Templates arrange slots. Pages connect
  stores/services and orchestrate a screen.
- Import through a layer's public API from outside that layer. Keep icons in
  `src/components/ui/icons/`.
- Search the component catalog before adding a component. Extend an existing
  atom when the interaction contract is shared.
- Use the `Button` atom for app controls. Sibling controls in one toolbar must
  share one semantic size: `xs = 28px` for inline message actions, `sm = 32px`,
  `md = 36px` for forms/composers, and `lg = 40px`. Icon buttons are square;
  pill/rect buttons may grow horizontally but keep the same height.
- Button variants are semantic: `neutral` for reversible utilities such as
  copy/download/close; blue `primary` for active/selected/create/new/send;
  red `danger` for alerts/delete/clear/reset/stop and other destructive acts.
- Button appearance controls emphasis independently: `solid` for the single
  primary action in a region, `soft` for selected/active state, `outline` for
  bounded secondary actions, and `ghost` for quiet toolbar utilities.
- Use native `disabled`; it must override every variant with gray background,
  border, and text. Color is never the only state signal—keep labels, icons,
  ARIA state, and native attributes accurate.
- A raw `<button>` is allowed only inside an atom or for a deliberate native
  exception. Document the exception when it is not obvious.
- Every icon-only control needs an accessible name. Toggle and menu controls
  expose `aria-pressed`, `aria-expanded`, and `aria-haspopup` as appropriate.

## Codex-Inspired Visual Language

- Favor quiet neutral canvases, subtle dividers, restrained shadows, rounded
  white/graphite surfaces, and semantic color only where it communicates state.
- `src/styles/tokens.css` is the single source of truth for every literal
  design value (color, spacing, radius, shadow, duration, easing, font size,
  control height, icon size). Editing a token there must be enough to change
  that value everywhere it is used. No other file may declare a literal value
  that duplicates or could drift from a token: not another CSS file, not
  `tailwind.config.*`, not inline `style={{}}`, not a Tailwind arbitrary-value
  bracket (`text-[18px]`, `shadow-[0_0_0_3px_rgba(...)]`). Reference
  `var(--vzn-*)` (or the Tailwind utility mapped to it) instead. When a value
  is close to an existing token, use that token rather than adding a nearby
  literal (e.g. do not add `font-size: 15px` beside `--vzn-font-size-lg: 14px`
  / `--vzn-font-size-title: 16px`); if no token fits, add one to `tokens.css`
  and reuse it everywhere that need recurs.
- Every stylesheet under `src/` is now at zero literal colors (`npm run
  check:design` prints the inventory); keep it that way. Remaining debt, do
  not extend it: `tailwind.config.mjs` keeps a few literals of its own (line
  heights, the `pulse-fast` easing) beside the font-size/radius/shadow/
  duration scales it already derives from `tokens.css`. If you touch a rule
  there, migrate it to reference `tokens.css` rather than adding a new
  literal beside it.
- Theme has three independent axes: light/dark mode (`html.dark`, from
  `theme`), the style preset (`html[data-theme]`, from `themePreset`) and an
  optional accent hue (`html[data-accent]`, from `themeAccent`; `'auto'` sets
  no attribute). An accent block in `tokens.css` replaces only the accent
  family of whichever preset is active and is declared after the presets. A
  preset is a persona, not a repaint: it owns surfaces, accent intensity
  (`--vzn-action-fill`, glow, user bubble), primary chrome
  (`--vzn-chrome-*`, read only by the title bar and primary navigation),
  illustrative tones, shape (`--vzn-radius-*`), depth (`--vzn-shadow-*`,
  `--vzn-blur`), and reading type (`--vzn-font-reading`, `--vzn-line-reading`,
  used by chat and translate content). Each preset in `tokens.css` redeclares
  that whole token set for both modes, so a `data-theme` on any element (the
  Settings preview card) renders that persona. A new preset needs a
  `[data-theme]` pair in `tokens.css`, an entry (with its traits: `darkOnly`,
  `nativeMaterial`) in `src/constants/themePresets.ts`,
  `electron/windowPalette.ts`, and i18n labels. A dark-only preset pins
  `html.dark` through `resolveThemeMode`; a native-material preset shows the
  macOS window vibrancy through a transparent shell in every mode.
- `npm run check:design` and `npm run check:atomic` only scan
  `src/components/ui/{atoms,molecules}`, `src/components/organisms`, and
  `src/components/templates` — they do not cover `src/pages`, the
  migration-zone feature directories (`chat/`, `live/`, `translate/`), or any
  `.css`/`tailwind.config.*` file. When editing visual
  code anywhere in the repo, manually check for literal values duplicating a
  token before reporting the change complete, even where the scripts pass.
- The global app sidebar and the AI Chat conversation sidebar are different
  organisms. Keep their tokens, widths, state, and responsibilities separate.
- On desktop, primary navigation is a persistent 60px/236px layout column and
  its stored collapse preference survives feature navigation. At compact
  widths only, expansion becomes a temporary portal overlay. Keep its logo and
  toggle in separate layout slots. AI Chat navigation owns session context and
  remains an independent adjacent organism.
- Sidebar responsive policy must not change the primary navigation merely
  because a feature adds contextual navigation. At `>=900px`, both sidebars
  respect their independent stored states across feature navigation; `<900px`
  keeps primary navigation as a rail and hides AI Chat history until requested.
  Compact overlays remain mutually exclusive. AI Chat history and New Chat
  controls live in the chat header; collapsed history consumes no layout width.
- Preserve readable density and hierarchy at both desktop and narrow widths.
- Size feature layouts from their actual container, not only the outer window.
  Chat uses one shared stage for messages, suggestions, and composer; cap the
  reading column independently so ultrawide windows add breathing room rather
  than excessively long lines.
- Responsive automation may change the effective sidebar presentation, but it
  must not overwrite the user's persisted collapse preference. Compact
  contextual navigation opens as a temporary dismissible overlay.

## Chat Invariants

- Empty and active conversations use the same single `chat-composer` surface.
  Never add an outer frame, border, background panel, or double-container look
  around the active composer.
- Do not expose a destructive Clear/Delete action in the active conversation
  canvas. Conversation deletion belongs in history/session management.
- All primary composer controls use the shared `md` Button size.
- Provider/model selection is conversation-aware. Async model loading must not
  overwrite a different conversation after the user switches sessions.
- Keep provider, model ID, retry/loading/error states, and advanced picker
  behavior available; never replace a dynamic model ID with display text.

## Change Safety

- Do not read or print `.env`, private keys, credentials, tokens, or personal
  `.claude/settings.local.json` contents.
- Do not install/update dependencies, publish releases, commit, push, or run
  destructive Git/filesystem commands unless the user explicitly requests it.
- Validate exact targets before any deletion. Prefer recoverable operations.
- Do not broaden IPC, network, or filesystem permissions to make a test pass.

## Verification

### Documentation and version changes

- Update README features, setup and limitations alongside user-visible changes.
  Use `sync-docs` to compare source/tests with prose; do not infer shipped behavior
  from commit titles alone.
- Version bumps must include matching package-lock root versions and a curated
  `## [X.Y.Z]` entry in `CHANGELOG.md`. Keep README focused on the current product.
- Run `npm run docs:sync` for generated facts, review the complete README, then
  record that review with `npm run docs:review -- --summary "..."`. For internal-only
  changes, explain why existing prose remains accurate. Never refresh the record
  merely to silence a failure or generate it in CI.
- Run `npm run check:docs` and `npm run test:docs`. Include the review record with
  the exact reviewed source/docs; later product-source edits invalidate it.

### Code checks

Run checks proportional to the change, starting focused and expanding when the
surface is shared:

```bash
npx biome check <changed-files>
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.electron.json --noEmit
npm test -- --run <focused-test-files>
npm run check:atomic
npm run check:design
```

For broadly shared or release-relevant changes, also run:

```bash
npm test -- --run
npm run build
npm run test:web
```

- Add or update tests for behavior and state boundaries, not implementation
  trivia. UI changes require visual QA at relevant states and widths.
- Before reporting completion, state what changed, what was verified, and any
  check that was not run with its reason.

## Native migration work

For Electron-to-native migration or native multitasking UX work, resolve
`viezanagent/agent/native-migration/native-migration.json` and its workflow first.
Read the linked `SKILL.md` entrypoints. These project-local skills are routed here;
they are not claimed to be installed globally. Plans and review evidence live in
`docs/migration/`. Native source implementation is separate from compilation and
runtime acceptance. The retired renderer under `src/` supplies canonical design
resources and migration reference; it is not an application entrypoint.
