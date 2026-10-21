---
paths:
  - "src/**/*.{ts,tsx,css}"
  - "tailwind.config.mjs"
---

# Atomic UI

- Read `src/components/README.md` before changing presentation code.
- Search atoms/molecules/organisms/templates before creating UI.
- Respect `pages -> templates -> organisms -> molecules -> atoms`.
- Keep atoms/molecules props-driven and free of stores, services, and feature
  orchestration.
- Use public layer exports outside a layer and the central icon registry.
- Controls in one toolbar share the same `Button` size token (`xs` 28, `sm` 32,
  `md` 36, `lg` 40); do not hand-code competing heights.
- Use `neutral` for utility/dismiss, blue `primary` for active/create/new/send,
  and red `danger` for alert/delete/clear/stop. Native disabled always renders
  gray and overrides the original variant.
- Use `solid` only for the region's primary action, `soft` for active/selected,
  `outline` for bounded secondary controls, and `ghost` for toolbar utilities.
- Keep semantic labels/ARIA/native state; never rely on color alone or hard-code
  a feature color when an action token exists.
- Treat `src/styles/tokens.css` as the single source of truth for every
  literal design value. Use semantic tokens instead of literal colors,
  spacing, radius, shadow, type, motion, or control dimensions — in any file,
  not only the Atomic Design catalog (`codex.css`, `tailwind.config.mjs`,
  inline `style={{}}`, and Tailwind arbitrary-value brackets all count).
  `check:design`/`check:atomic` only scan atoms/molecules/organisms/templates;
  manually verify `src/pages`, migration-zone feature dirs, and `.css` files
  too. All `src/` stylesheets are at zero literal colors; keep them there.
  Known debt not to extend: `tailwind.config.mjs` keeps a few literals (line
  heights, `pulse-fast` easing) — migrate rather than add beside them.
- Style presets live in `tokens.css` as `[data-theme="<id>"]` blocks (light)
  and `html.dark [data-theme="<id>"], html.dark[data-theme="<id>"]` (dark),
  each with the identical token set (surfaces, accent, chrome, tones, shape,
  depth, type). Never style a preset from TSX. Primary chrome (title bar and
  primary navigation) reads `--vzn-chrome-*`, not the canvas text tokens, so a
  preset can paint it darker than the workspace.
- Use `Input` for reusable single-line fields and the same size token as nearby
  buttons. Verify light/dark plus relevant responsive states.
- Use container queries for feature geometry. Keep chat messages, suggestion
  cards, and composer on one stage axis, with a separate readable prose cap.
- Responsive sidebar compaction is an effective UI state only; never overwrite
  the user's persisted collapse preference. Compact expansion is dismissible.
- Keep desktop primary navigation as a persistent 60px/236px layout column and
  preserve its user preference across features. Use a portal overlay only at
  compact widths. Never overlap the logo and toggle or merge it with AI Chat
  contextual navigation.
- Do not change primary navigation mode merely because a feature adds contextual
  navigation. At `>=900px`, respect both independent stored sidebar states;
  below `900px`, use compact rails and mutually exclusive overlays. Preferences
  must survive every feature transition.
- Run `npm run check:atomic` after presentation-layer changes.
