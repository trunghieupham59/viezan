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

## Follow-up from the first repair run

At `97d17eb`, Native CI run `41567601827` passed macOS 15 tests and the Release
build. CodeQL's JavaScript analysis marked alert 249 fixed; its inline thread
was resolved after that confirmation. Documentation and Dependency Review passed.

Qt still crashed, but the Windows stack moved from `QQuickDialogButtonBox` to
`QQuickRepeater` under the Chat content loader. The fixed five-bar voice icon
used a deferred repeater inside another inline component. It now draws five
static bars with the same geometry, eliminating unnecessary delegate creation.
An isolated construction/geometry regression covers that icon in addition to
the full shell tests. The next remote run remains the Qt 6.8 acceptance gate.
Local Release rebuild and focused tests passed (9 cases); full CTest passed
1/1 in 44.87 seconds, with QTest 142 passed and 0 failed/skipped. The shared
domain/catalog tests and fix whitespace checks also passed. Logs are under
`/private/tmp/pr185-qt-waveform-{build,focused,full}.log`.

## Model popup and full-matrix runtime

At `1e5817e`, Native CI run `41568393570` passed macOS and both CodeQL analyses.
Linux passed 97 Qt cases before a later crash in
`glassComposerKeepsEditorAndModelOwnership`. The test changes Glass to Graphite
and back before opening the model popup. Qt 6.8.3's
[`QQuickComboBox::setDelegate`](https://github.com/qt/qtdeclarative/blob/v6.8.3/src/quicktemplates/qquickcombobox.cpp#L1195)
deletes the previous delegate; the conditional Binding restored a destroyed
component on that round trip. The fix keeps one native MenuItem delegate for
the ComboBox's lifetime and changes only its appearance. A QPointer regression
checks that the same delegate survives both preset changes.

The model picker lives in `SessionModelPicker.qml`, with explicit shell/bridge
dependencies and a prompt-deletion signal. Existing editor/model/session
ownership checks remain, including popup dismissal when switching sessions.

Focused visibility checks also exposed a blank native model label after
Glass-to-Graphite switching: Qt hides an outgoing content item, and restoring
the saved pointer does not make it visible again. The picker now keeps native
content/background objects mounted and applies Glass decoration as child
layers, with conditional visibility that restores the native style bindings.
This also preserves hover-only native menu backgrounds.
The same round-trip test exposed a parentless restored native popup: Qt detaches
an outgoing popup. The picker now reattaches whichever popup is installed to
its ComboBox. Tests open both popup variants and check labels/backgrounds,
selection and session ownership after repeated preset changes.

Windows reached the foundation matrix and streaming tests with no failed
assertions before the 300-second CTest budget expired. The complete Qt matrix
now has a bounded 600-second budget on both runners; no cases are removed.

Final local Release rebuild passed. Focused composer light/dark checks passed
4 cases, including both popup variants and visibility/ownership restoration;
full CTest passed 1/1 in 42.13 seconds, QTest 142 passed with no failures/skips.
Logs: `/private/tmp/pr185-qt-final-{build,focused,full}.log`. Shared catalog
and domain checks, documentation and whitespace validation passed. Independent
review checked the extracted picker dependencies and session invalidation.
