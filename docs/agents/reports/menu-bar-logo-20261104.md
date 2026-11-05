# macOS menu bar logo and visibility

## Changes

- The native status item uses the existing bundled Viezan brand image at the
  semantic icon size, replacing the generic chat SF Symbol.
- Settings → General → Application has an EN/VI/JA visibility switch.
- The optional workspace preference defaults to visible for older snapshots and
  persists changes. Hidden means the whole status item, including temperature;
  temperature preferences and background services remain independent.
- The visibility setter ignores unchanged values. Live testing found that
  MenuBarExtra sends back its current value during configuration; writing on every
  callback caused a graph-update loop. A focused regression test covers repeated
  callbacks, and the corrected bundle was rebuilt and relaunched.

## Verification

- Pass: `swift test --package-path apps/macos --filter menuBar` (3 tests).
- Pass: `npm run resources`, `npm run check:resources`, `npm run check:docs`,
  `git diff --check`. Both generated native catalogs updated.
- Pass: development build and signing; running `.native-build/dev/Viezan.app`.
- Live UI: General shows the localized label and hint. Switched off and back on;
  the app remained responsive. Restored visible state after testing.
- Not run: separate visual capture of the system menu bar icon, full theme/IME/
  VoiceOver matrices, and Windows/Linux builds (macOS behavior only; Qt receives
  regenerated shared locale entries only).
- No dependency installation, commit, or push. Earlier selection-translation and
  floating-panel fixes and unrelated untracked files were preserved.

## Capabilities

Used `implement` / `ship-viezan-feature`, `generate-code`,
`viezan-product-engineering`, `viezan-feature-planner`, the native UI rules,
`viezan-native-ux` / `ui-ux-pro-max`, scoped `viezan-i18n-audit`, and
`sync-docs` / `viezan-doc-sync`. Provider, extension, live-audio and release gates
were not run because those domains were not changed.

## PR verification

Full `swift test --package-path apps/macos` passed on the final source: 49 native
UI tests in 7 suites and 90 domain tests. Resource, documentation and whitespace
checks also passed. Live acceptance and unrun platform gates remain as listed above.
