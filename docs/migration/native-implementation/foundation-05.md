# Foundation 05 — resumed implementation and evidence

Date: 2026-10-27. Host: macOS 27.0.1, arm64, Qt 6.12.0/Fusion.
Base HEAD: `8aa4311`, dirty source. The source manifest in
[evidence/foundation-05-source-sha256.txt](evidence/foundation-05-source-sha256.txt)
identifies the tested inputs; this is not a committed release.

Status: **IN PROGRESS**. Both previews build and tests pass. Full F01–F08
acceptance and user review remain open; do not begin Home.

## Implemented in this continuation

- Finished the WIP Swift shell compilation and removed the toolbar actor warning.
  Toolbar controls have a native minimum control size, translated AX labels and
  clear the accessibility count when it returns to zero.
- Overlay state is exclusive; switching from commands to history preserves the
  original opener. Toolbar mouse activation explicitly establishes that opener.
  Compact navigation and Activity establish initial keyboard focus.
- New requests focus Chat's AppKit composer or Translation's source editor.
  Commands and native menus hide/disable unavailable History and blocked routes.
- Qt now embeds generated registry SVGs/brand assets and uses a reusable
  PrimaryNavigation with 236/60 widths, persisted user preference, and temporary
  expansion below 900. Resize never dispatches a preference change.
- Qt command search, keyboard selection, menu shortcuts, exclusive bounded
  popups and focus return are wired to existing routes/actions. Escape respects
  input-method composition; real IME acceptance remains outstanding.
- Settings remains reachable during a blocked load. Feature actions remain
  disabled. Settings/library switch layout from their actual available width;
  their two-column threshold uses the existing reading metric.
- Shared tests cover optional shell preference backward compatibility, invalid
  values, save failures/retry and preservation of sessions/tasks.

## Verification

| Check | Result |
| --- | --- |
| Swift build and tests | PASS: 17 domain + 5 AppKit/presentation tests; final log has no compiler warnings/errors |
| Qt CMake configure/build | PASS |
| Qt CTest | PASS: 49 scenarios, 51 QtTest passes including init/cleanup |
| Foundation Qt matrix | PASS: EN/VI/JA × 640/820/1200/1440 × light/dark = 24 offscreen cases; each verifies navigation width, persisted collapse across resize/reload, unchanged sessions, palette bounds/search focus and overlay exclusivity |
| Node domain tests | PASS: 10 |
| Generated resource freshness | PASS: 3 locales, 17 metrics, generated icons/brand |
| Biome scoped check | PASS: 9 files |
| TypeScript renderer / Electron noEmit | PASS / PASS |
| Atomic / Design checks | PASS / PASS |
| Manual native token audit | Changed geometry uses generated metrics/system controls; no duplicated literal colors or sizes added. Zero layout spacing and count/ratio values are structural. |
| Docs sync/review/check + tests | PASS; 13 docs tests |

Logs retained with this source:
[Swift](evidence/foundation-05-swift-test.log),
[Qt](evidence/foundation-05-qt-test.log).
The Qt offscreen font alias warning is an environment warning; the cases assert
zero QML engine warnings. Offscreen tests do not prove native OS rendering.

## Observed UI checks through CUA

- Swift: sidebar Commands opens with search focus; Escape returns to sidebar.
  Typing `lich su` filters History; Return opens Quick History. New from Translation
  focuses its input. Toolbar AX names are now localized instead of symbol names.
- Swift: Close leaves the app running; reopening its bundle restores the window.
  Normal Quit and relaunch were exercised. No forced quit was used.
- Swift compact: rail, navigation overlay, Tab into commands, palette bounds and
  Settings compact layout inspected. Japanese/dark palette fits; History is absent
  while in Settings. Locale and appearance restored to Vietnamese/system afterward.
- Qt: sidebar Commands → `lich su` → Return → Quick History → Escape restores the
  sidebar opener. At compact width, navigation opens with focus on Commands;
  Escape restores the navigation toggle. Cmd-N focuses the new Chat composer.
- Screenshots below are 2× captures around 642-point window width from manual
  resizing, not an assertion of exact 640-point coverage (the Qt tests cover 640).

| Evidence | State |
| --- | --- |
| [Swift compact navigation](evidence/swift-foundation-compact-navigation-05.png) | Vietnamese, light/system |
| [Swift compact commands](evidence/swift-foundation-compact-commands-05.png) | Vietnamese, light/system |
| [Swift Japanese dark](evidence/swift-foundation-ja-dark-05.png) | Settings commands; no unavailable History entry |
| [Qt compact](evidence/qt-foundation-compact-05.png) | Chat content and composer retained |
| [Qt compact navigation](evidence/qt-foundation-compact-navigation-05.png) | Temporary navigation overlay |

The Swift screenshots precede only the final toolbar mouse-focus adjustment;
that adjustment was rebuilt/tested and checked separately afterward: Escape then Space reopens the same navigation
control. The native toolbar does not always expose its focused element in AX.

## Remaining acceptance work

- Full Swift and on-screen Qt visual matrix, including exact dimensions, minimum
  height, all overlay transitions/outside dismissal, text sizes and clipping.
- VI/JA IME composition with actual input sources; VoiceOver/screen-reader flow
  rather than AX-label inspection alone; system theme changes live, Reduce
  Transparency and Reduce Motion in runtime.
- UI-level blocked-load/save-failure scenarios, and lifecycle while tasks run;
  domain regressions pass but do not substitute for all UI acceptance cases.
- Windows/Linux hardware, DPI/Wayland, packaging/signing and user design review.
  These require target environments not available in this macOS run.
- Fable cross-review remains unverified; no new external model submission was made.

Full Electron test/build/web suites were not run: the behavior change is confined
to native previews; Electron shared edits are locale/icon/token inputs checked
with Biome, both TypeScript projects and Atomic/Design. No dependency install,
commit, push, release, Electron data import or privileged product permission change.

## Workflow used

`native-migration` and scoped `sync-docs`; rules `native-migration` and
`viezan-product-engineering`; skills `viezan-native-migration`,
`viezan-native-ux`, `viezan-doc-sync`, scoped `viezan-i18n-audit` locale parity.
The shipped Electron screen spec remains unchanged; these are preview behaviors.
