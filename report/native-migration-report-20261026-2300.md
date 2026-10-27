# Native migration — Qt toolchain and runtime verification

Date: 2026-10-26. Purpose/workflow: native-migration. This follows implementation
01 and the user's explicit approval to install Qt 6 and CMake.

## Outcome

Installed CMake 4.4.4 and Qt 6.12.0 using official Homebrew formulae (`cmake`,
`qtbase`, `qtdeclarative` and required dependencies). Homebrew also upgraded
required existing dependencies. No cleanup, commit, push, release or Electron
data migration was performed.

The Qt application now builds as a local macOS development bundle. It was opened
and exercised through native UI automation. This verifies the Qt adapter on
macOS only; it does not satisfy Windows/Linux host acceptance or distribution.

## Changes driven by runtime findings

- Fixed QVariantList / JavaScript Array contract mismatch that broke restoration.
- Removed QML `data` property shadowing using explicit `root.workspace` bindings.
- Fixed history anchoring after layout, longest model labels and editor widths.
- Added a C++-only persistence/worker injection seam and eight Qt scenario rows:
  atomic roundtrip/drafts, corrupt storage, recovery/stale events, language changes,
  save failure/retry, actual provider timers, and loading Chat/Translation QML.
- Added local macOS bundle metadata and CTest configuration without changing
  Windows/Linux style selection. Updated generated navigation accessibility labels.

## Verified

Qt CMake build and all eight Qt scenarios pass (QtTest reports ten including
init/cleanup). Seven Node contract tests, resource freshness, focused Biome,
Atomic Design, design contract checks and whitespace checks pass. Native metrics
were checked manually because React design scanners do not cover QML.
The full README was reviewed, its review record refreshed, and documentation
freshness plus all 13 documentation tests passed.

Native UI checks confirmed streaming, independent Chat/Translation drafts,
history positioning/search focus/Escape focus restoration, language invalidation,
disabled Copy on stale output, and a new simulated result. Command-Q was followed
by app inventory confirming stopped state; reopening restored input, output,
language pair, conversation and unsent Chat draft.

Screenshots and limits are recorded in
`docs/migration/native-implementation/verification.md`. Qt uses Fusion in these
macOS screenshots; this is not evidence of Windows Fluent or Linux compositor
behavior. Full platform/accessibility/IME/640-point/stress acceptance remains open.
Real providers and the remaining product modules remain outside this first slice.

Swift implementation and Electron behavior were not changed in this follow-up;
their earlier check results remain documented separately. Full Electron build and
web tests were not repeated. The Fable 5.1 review still has no successful result
after the reported authentication failure. No findings are attributed to Claude.
