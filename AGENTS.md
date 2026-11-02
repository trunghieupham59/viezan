# Viezan Agent Guide

## Source ownership

- Inspect relevant code and nearby tests before editing. Preserve unrelated
  work. Follow the matching purpose under `viezanagent/agent/` according to
  `viezanagent/agent/CAPABILITY_CONTRACT.md`.
- macOS uses SwiftUI/AppKit in `apps/macos/Sources/ViezanNative` and Swift
  services in `ViezanDomain` in the same package. The helper executables and
  authorization boundaries live under `native/`.
- Windows/Linux use Qt Quick/QML views and C++ services in `apps/desktop-qt`.
  Keep privileged filesystem, process and credential operations in services.
- Build and packaging entrypoints live in `scripts/native/`. Keep portable
  schemas, policies and fixtures in `contracts/native-workbench/`.
- For migration work resolve `viezanagent/agent/native-migration/native-migration.json`
  and its linked workflow and skills. Record acceptance evidence in `docs/migration/`.

## Presentation and behavior

- Before UI or copy work read `.claude/rules/ui-ux.md` and the affected spec
  in `docs/design/screens/`. Reuse native controls and semantic tokens.
- Edit shared tokens in `resources/tokens.css` and native strings in the EN/VI/JA
  JSON files under `resources/locales/`. Regenerate both native bundles with
  `npm run resources`. Qt icons are SVG sources in `apps/desktop-qt/qml/icons/`.
- Preserve accessible names, native disabled states, keyboard focus, shortcuts,
  IME composition and meaningful state indicators in both toolkits.
- Keep app navigation and chat history independent. Compact overlays are
  mutually exclusive. Responsive layout preserves each stored preference.
- At widths of 900px and above, app navigation and chat history respect their
  own saved state. Below that breakpoint, use the app rail and open history
  on demand. Size the reading column from the feature container.
- Use quiet neutral surfaces and semantic control emphasis. Keep sibling
  toolbar controls the same size. Reserve destructive styling for destructive
  actions. Theme mode, preset and optional accent remain independent.
- Empty and active chat use one composer. Keep deletion in history management.
  Preserve conversation-specific provider and model IDs across async loads,
  retries, cancellation and session changes.

## Safety and verification

- Preserve OS credential stores, bounded provider requests, atomic persistence,
  operation ownership and helper authorization. Keep personal settings, secrets
  and credentials out of inspection and output.
- Do not install dependencies, publish, commit, push or perform destructive
  cleanup without explicit authorization. Keep build products out of source edits.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md#verification) for native checks.
  Compare generated resources after changes and update README setup, features
  and limitations when affected. Keep version, lockfile and changelog in sync.
- For native UI work verify the relevant platform, states, window sizes,
  themes and assistive input. Report source, tests, builds and live acceptance
  separately, including checks skipped and why.
