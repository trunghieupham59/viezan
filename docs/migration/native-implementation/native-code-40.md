# Review 18 audit follow-up — 2026-10-28

## Scope and ownership

Follow-up to code 39. Existing dirty Swift/Qt changes were preserved. The user paused the concurrent Claude UI session; stable captures were then
collected from the audit build.
The current source is not a clean commit and build success is not visual acceptance.

## Changes in this pass

- Settings: dedicated Voice, Modules and Updates categories in both native UIs.
  General retains language, startup/permissions, recovery and real automatic
  translation controls (including the existing persisted delay). Existing
  provider, local-model, desktop, extension and data deep links remain available.
- Reuse existing EN/VI/JA descriptions for language, startup, persona and accent.
  Qt settings content aligns with its navigation instead of floating farther away.
- Shared setting rows use an alternate stacked arrangement when their copy and
  controls do not fit side by side. Swift exposes child controls individually
  instead of combining switches and buttons into one accessibility element.
- Dictionary: Meaning/Examples tabs, explicit empty examples, a first example
  in Meaning and all examples in Examples; notes and translation details remain
  available. Qt meanings are readable without expanding the detail toggle.
  Tab selection resets only when changing the entry, not on unrelated state updates.
- Qt Voice exposes the existing explicit/automatic STT provider setting.

## Capture evidence

Current-run images are in `evidence/native-ui-40/`. Native captures were obtained
through Computer Use, and Review 18 was opened in the in-app browser from the
existing localhost preview. Reference viewport: 1432 × 940; native initial window:
1400 × 860 logical points, captured at 2×. Comparison images normalize scale.

The initial Settings capture directly demonstrates Voice/Modules nested under
General, Updates under About and missing row descriptions. The Dictionary source
and UI demonstrate missing Meaning/Examples tabs. Home/Chat/Translation/
Interpretation/Everywhere/Applications/Thermal captures include real native data
and prototype sample data; differing content or unavailable services are not
visual defects. `compare-utilities.png` is REJECTED: an external automation changed
the native route to Home during capture. Do not treat it as a Launcher defect.

## Checks

- Atomic boundaries: PASS.
- Generated resources: PASS (EN/VI/JA).
- Native docs consistency: PASS.
- QML parser for SettingsWorkspace, DictionaryResult and Kit: PASS.
- macOS Release build: PASS, including entry-reset/blocked-state adjustments,
  `.native-build/r18-audit40-final-mac/Viezan.app`; log
  `/private/tmp/viezan-r18-audit40-final-build.log` (59.93 seconds).
- Qt Release build on macOS: PASS, `.native-build/r18-audit40-qt/`; incremental
  rebuild included final QML changes. This is not Windows/Linux runtime evidence.
- Full tests: not run; this pass targets UI alignment and visual review.
- Final macOS Release build: PASS, `.native-build/r18-audit41-mac/Viezan.app`;
  includes the measured SettingsRowLayout fix. Launched through Computer Use.
- Isolated Review18LayoutTests: PASS; 24 fixture renders at window-equivalent
  640/820/1400 widths, light/dark. These are NSHostingView renders, not real
  window resize or provider acceptance. The fixture uses no user storage/network.
- Stable live light-mode captures: all nine workspaces at 1016 × 1193 logical
  points. Activity and command overlays open and dismiss with Escape.
- Final Settings light capture confirms startup controls remain beside wrapping
  copy; dark appearance restored. Original Glass preset/text size preserved.

## Remaining acceptance boundaries

Review 18 contains illustrative settings that are not equivalent to existing
native domain behavior (e.g. smart expiry and provider fallback). This pass does
not add inert toggles or silently enable network fallbacks to imitate the mock.
Provider-dependent states, VoiceOver/IME and real Windows/Linux desktop acceptance
remain distinct from source alignment and local compilation.

Workflow: `native-migration`; skills: `viezan-native-migration`,
`viezan-native-ux`, Product Design `audit`; rules: `native-migration`,
`viezan-product-engineering`, project UI/UX. The earlier Electron retention rule
is superseded by the user's explicit completed native cutover instruction.

## Review status by step

1. Settings: category/description alignment and narrow layout corrected in Swift
   and Qt. Live final Settings capture confirms controls no longer stack early.
2. Dictionary: tabs and hierarchy corrected on Swift/Qt; isolated populated
   fixture rendered in both modes and three widths. Provider-populated runtime
   acceptance remains separate; no provider requests were made.
3. Main workspaces: stable light-mode captures include Home, Chat, Translation,
   Interpretation, Dictionary, Everywhere, Applications, Thermal and Launcher.
   Real data differs from prototype samples. The earlier rejected Launcher
   capture is superseded by `stable-light-utilities.png`.
4. Layout fixtures include general, appearance, voice and dictionary at all three
   widths. Small-width contact sheet was inspected for text/control overlap.
   Live captures are at 1016 points; attempted manual edge drags did not resize
   the window and are not evidence of 640/820-point real-window acceptance.

The previous concurrent-window observation remains diagnostic only. The final
macOS audit build is open for review in dark mode. Qt compiled on macOS but its
final live visual pass and real Windows/Linux runtime acceptance remain pending.
Source changes remain uncommitted; unrelated dirty changes are preserved.
README reviewed against source; native limitations remain accurate. `docs:review`
and `test:docs` are not defined in the current native package; `check:docs` passed.
