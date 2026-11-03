# Native Glass local-change publication checks

Date: 2026-11-03. Branch: `codex/native-liquid-glass`, targeting `develop`.
The user requested committing all current local changes and opening a PR.
Scope includes the existing `cc637ad` agent/legacy-document relocation, pinned
UI UX Pro Max import/integration, native Glass work, development reload tooling,
generated resources, regression tests and design/evidence documentation.

## Publication review fixes

- Full Swift testing exposed cross-suite interference: multiple fixture windows
  observed the same process-wide model-panel notification. A shared serialized
  `AppKitFixtureTests` parent now contains the AppKit fixtures, including native
  transcript and composer tests. Existing assertions and product routing remain
  unchanged; model/parser tests can still run independently.
- Development reload rechecks the native field editor when the build becomes
  ready. Composition begun during compilation defers both saving and quitting;
  a failed final save cancels restart. Regression tests use real NSTextView
  marked text for Japanese/Vietnamese and a failing persistence adapter.
- Updated stale design statements to match neutral text-input focus and the
  raised selected filter shared by SwiftUI and Qt.

## Exact local verification

| Check | Result |
| --- | --- |
| `swift test --package-path apps/macos` | Exit 0; native reports 49 tests in 7 suites, with 46 executed and 3 opt-in evidence renders skipped; domain 60 passed. Build passed. |
| Qt Release app/test build | Passed on the macOS host. |
| Full Qt CTest | 1/1 passed; underlying QTest 138 passed, 0 failed/skipped, 43.70 seconds. Offscreen/Fusion/software, existing `.native-build/electron-cleanup-qt` build tree. |
| Shared domain/contracts | 11 passed. |
| Python native tooling | 7 passed. |
| Agent registry | 36 JSON files and 246 references passed. |
| Resources | 3 locales and 58 metrics verified; generated bundles match source. |
| Documentation | Passed, version remains 2.4.2 and matches package lock. |
| Pinned skill data | Validator passed for 12 domains, 22 stacks and reasoning data. |
| Diff review | First-party whitespace passed; no new build/log/database/credential artifacts found. Pinned upstream `design_system.py` blank-line whitespace is retained unchanged. |

Logs are local: `/private/tmp/viezan-pr-swift-final.log`,
`/private/tmp/viezan-pr-qt-full.log`, and
`/private/tmp/viezan-pr-qt-full-details.log`. The initial Swift run failed two
fixture functions due to the interference above; it is not counted as passing
evidence. The default full command passed after the isolation fix.

## Acceptance and capability boundaries

Used native-migration inventory/verification, native-migration and
product-engineering rules, CONTRIBUTING checks and the repository PR template.
The earlier component/sidebar reports record the native UX skills and live
visual review separately. No new UI direction or provider behavior was added
while preparing publication.

Windows/Linux runtime, Qt GPU rendering, full live dark/accessibility preference
coverage, physical VI/JA IME and VoiceOver remain Not run on this macOS host.
The full upstream skill test suite is Not run because its repository-root
maintenance scripts are intentionally outside the pinned import. Release
packaging and complete OS acceptance are not established by this PR.
