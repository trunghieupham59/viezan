# PR #185 CI and review fixes

Date: 2026-11-03. Branch: `codex/native-liquid-glass`.
Reviewed the current PR checks, inline review threads and conversation before
editing. Initial head: `0702924`; failing Native CI run: `41566570070`.

## Failures and corrections

- **macOS:** the hosted test required `usesGlass` even when Reduce Transparency
  or increased contrast selected the solid accessibility surface. The test now
  checks the owned control shape in either mode, actual native material only
  when supported/enabled, and visible solid fallback otherwise. Existing focus,
  activation and disabled assertions remain. The deterministic fallback matrix
  also checks disabled controls while hovered/pressed. Product code is unchanged.
- **Qt:** Windows and Linux crashed while the first window constructed standard
  dialog buttons on Qt 6.8.3; the Windows stack entered
  `QQuickDialogButtonBox::createStandardButton` / `QQmlObjectCreator`. Move the
  shared dialog into `GlassDialog.qml`, separating its compilation context from
  the sibling inline button delegate. Native standard button roles, ordering,
  footer, focus and signals remain intact. The regression now constructs fresh
  dialogs for both presets in both light/dark modes. Qt 6.8 confirmation belongs
  to the new remote CI run; the installed local Qt is 6.12.
- **CodeQL alert 249:** resource generation checked a path before overwriting it.
  Direct reads now preserve equal outputs; changed JSON/brand bytes are staged
  in a private sibling directory and published with atomic rename. A deterministic
  symlink-swap regression fails against the original generator and passes after
  this change, leaving the symlink target intact. Generated assets are unchanged.
  The Documentation workflow now includes all native Node test files.

## Local verification

| Gate | Result |
| --- | --- |
| Full `swift test --package-path apps/macos` | Passed: 60 domain tests; 49 native tests including 3 existing opt-in render skips. |
| Qt Release application/test build | Passed on macOS with Qt 6.12. |
| Focused Qt undo/dialog tests | 8 passed, 0 failed/skipped. |
| Full Qt CTest, offscreen/Fusion/software | 1/1 passed in 44.43 seconds; QTest 141 passed, 0 failed/skipped. |
| `node --test scripts/native/__tests__/*.test.mjs` | 13 passed, including 2 generator regressions. |
| Python native tooling | 7 passed. |
| Resources | Generation/check passed; tracked generated JSON/brand assets unchanged. |
| Documentation and agent registry | Passed; 36 JSON files, 246 references. |
| Fix diff whitespace | Passed. |

Local logs: `/private/tmp/pr185-macos-full.log`,
`/private/tmp/pr185-qt-focused.log`, `/private/tmp/pr185-qt-full.log`.

## Review and acceptance boundaries

Used the native-migration capability/workflow and skill, native-migration and
product-engineering rules, and CONTRIBUTING verification requirements. This is
a compatibility/security correction; no new visual direction is introduced.

The PR's hosted Codex review could not run because the account reached its code
review usage limit. That service limit is independent of the code fixes and
cannot be repaired in this checkout. No failed check or security rule was disabled.

Remote macOS 15, Windows/Linux Qt 6.8 and CodeQL results must be read from the
new PR head after publication; the original run remains failed evidence. Live
IME, screen reader, GPU rendering and full desktop acceptance were not repeated
for these fixes. CI does not establish those acceptance gates.
