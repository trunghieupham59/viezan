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
- Prefer focused, reversible changes. Do not edit generated `dist/`,
  `dist-electron/`, `release/`, or dependency contents.

## Product and Architecture

- Viezan is a local-first Electron application with a React renderer.
- Keep the trust boundary `renderer -> typed preload API -> Electron main`.
  Renderer code must not import Node or Electron internals directly.
- Keep secrets, provider credentials, filesystem access, and privileged OS
  operations behind the existing preload/main-process APIs.
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
- Known pre-existing debt, do not extend it further: `src/index.css` still
  carries literal colors in legacy rules (`npm run check:design` prints the
  inventory; `codex.css` is at zero), and `tailwind.config.mjs` keeps a few
  literals of its own (line heights, the `pulse-fast` easing) beside the
  font-size/radius/shadow/duration scales it already derives from
  `tokens.css`. If you touch a rule there, migrate it to reference
  `tokens.css` rather than adding a new literal beside it.
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
