# Sidebar refinement — 2026-11-02

Scope: implement the user's three-point review of the native sidebar. Base
checkout `cc637ad`, with existing uncommitted development-reload work preserved.
No commit, push, dependency installation, data migration or release was performed.

## Source

- macOS: the brand row uses the existing `compactControl` minimum, growing for
  the compact overlay's close button. Remove the extra spacer above Home while
  retaining navigation-row heights, width, focus and selected semantics.
- macOS: replace the selected row's white `material-highlight` stroke with the
  quieter semantic `material-border`; retain selection fill and semibold text.
- macOS/Qt: separate the static storage footer with a divider and neutral
  storage/device icon. Wrap the label, hide the decorative icon from accessibility,
  and expose the processing explanation through tooltip and accessibility help.
- EN/VI/JA: identify history saved on the device, with an explanation that AI
  processing runs locally or in the cloud depending on the model. Regenerated
  both native resource bundles, preserving the pre-existing dev-reload strings.
- Qt: compact the brand row and use the specified "Viezan" capitalization.
  Its existing focus-only border is unchanged. No new background-service feature.
- README, shell specification, design direction and design decisions updated.
  Concurrent translation of the shell specification/findings into English was
  retained; the new sidebar notes were added to the translated documents.

## Verification

Evidence directory: `/tmp/viezan-sidebar-review-20261102/` (local, temporary).

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Generated resources | PASS | `npm run resources`, `npm run check:resources`; identical bundles and three-locale key parity |
| Documentation | PASS | `npm run check:docs`, `git diff --check` |
| Shared domain contract | PASS | 11 Node tests |
| Native scripts | PASS | 7 Python tests |
| Swift compilation/tests | PASS with exclusions | 94 passed, 3 existing opt-in render tests skipped, 2 explicitly excluded after sandbox failures; `swift-tests-final.log` |
| macOS Debug bundle | PASS | `.native-build/sidebar-review/bundle/Viezan.app`; `macos-build.log`; no accessible stable signing identity, not release/signing acceptance |
| Qt configure/build | PASS on macOS | Fresh `/tmp/viezan-sidebar-review-20261102/qt-build`; old cache referenced a removed checkout |
| Qt CTest | PASS on macOS | 105 passed, 0 failed; `qt-ctest.log` and `qt-build/qt-test-results.txt` |
| QML lint | Unchanged warnings | 35 pre-existing unqualified-access warnings; no new footer warning |
| Independent source review | PASS | No blocking issue; brand minimum allows the larger native close control |

Swift initially needed writable toolchain caches. Tests were rerun with
`CLANG_MODULE_CACHE_PATH`, `SWIFTPM_MODULECACHE_OVERRIDE` and SwiftPM cache paths
under the evidence directory, with the package-manager nested sandbox disabled.
The two excluded tests are `composerPasteHandsImagesToTheIntakeInsteadOfTheText`
(uses the general OS clipboard) and
`pastedImageBytesIngestLikeAFileAndRejectNonImages` (writes to the real attachment
directory). Their sandbox failures are recorded in `swift-tests.log`; they were
not rerun with broader access for this visual-only change. No new tests were
added for this reversible visual/copy edit.

## Visual and interaction acceptance

- UX08/UX09: existing AppKit-hosted window tests produced 24 final-source images
  under `window-evidence/`, covering VI/JA, light/dark, desktop 1200×760,
  compact 640/820 widths and 480/600 heights, including rail and navigation
  overlays. The relevant tests use large text. Inspected the JA light desktop
  and VI dark compact overlay: footer fits/wraps, selection is subtle, and the
  close control is not clipped. These are fixture renders, not a complete live
  platform acceptance pass.
- Live macOS: observed the changed footer, divider and selected border in the
  running dev app through CUA and confirmed its accessible storage hint.
  This preceded the final brand-row minimum-height adjustment, whose final
  rendering is covered by the fixture evidence above.
- UX07: existing navigation/focus/IME-related automated checks passed; live
  collapse/expand, Command-K, IME, fullscreen/resize remain NOT RUN for the final
  bundle. CUA reported concurrent user changes, so further control was stopped.
- UX09: complete live EN/VI/JA × all text sizes × themes remains NOT RUN.
- UX10: VoiceOver remains NOT RUN; source semantics and AX storage help were
  inspected, which is not screen-reader acceptance.
- OS02: actual Windows/Linux and live Qt visual checks remain NOT RUN; a Qt
  build and CTest on macOS do not establish their runtime behavior.
- User visual acceptance remains pending. No real AI requests were made.

## Applied capabilities

Workflow: `native-migration`, scoped documentation synchronization from `sync-docs`.
Rules: repository `AGENTS.md`, `.claude/rules/ui-ux.md`, `native-migration`,
`viezan-product-engineering`. Skills: `viezan-native-migration`,
`viezan-native-ux`, `viezan-cross-platform-ui-qa`. Current native direction takes
precedence over historical Electron/Review 18 layout details.

## Sidebar toggle alignment follow-up

The user reported intermittent vertical mismatch between the traffic lights
and sidebar toggle. The toggle remained centered in the 48 pt header, while
AppKit could reset the standard controls/titlebar after the original alignment
pass. Existing resize-only tests did not exercise this late native relayout.

- Added a regression on real AppKit views for three late resets: button y,
  titlebar origin, and container origin, with parent heights unchanged. All
  three failed before the fix with a 10 pt offset on each traffic light;
  window frame, toggle frame and horizontal coordinates remained stable.
- `WindowDragRegion` now has a single explicit alignment owner at `sidebarTop`.
  Other drag surfaces no longer reposition the controls. The owner observes
  native frame/bounds changes and window activation, resize, deminiaturization
  and fullscreen exit. Updates coalesce; self-generated geometry notifications
  are ignored. Same-height parent-origin resets are repaired as well.
- No new tokens, strings, Qt changes, native control actions or hit-target sizes.
  Earlier sidebar and development-reload edits are preserved.
- Regression results: RED before / GREEN after. The five focused tests pass,
  including three late-reset cases, two light/dark window-layout cases, fixed
  toggle position, four compact VI/JA cases and titlebar focus-ring geometry.
  Logs: `toggle-baseline.log`, `toggle-fixed.log` in the evidence directory.
- The wider foundation test file also passes: 28 executed, 2 existing opt-in
  renders skipped, with the previously sandbox-blocked general-clipboard test
  explicitly excluded. Log: `toggle-foundation-final.log`. The first broader
  run's clipboard failure remains in `toggle-foundation-suite.log`.
- macOS dev bundle rebuilt, signed and relaunched through the existing
  Development menu. CUA exercised collapse/expand and entered/exited fullscreen
  through the native View menu (confirmed Enter/Exit Full Screen labels).
  Screenshot inspection found the toggle stable before/after these operations.
  The OS window-sharing indicator obscures the individual traffic-light glyphs
  during capture; exact vertical equality is established by the AppKit tests.
  Expanded sidebar, normal window mode, original route and source-field focus
  were restored. No translation request or data edit was made.
- Actual minimize/reopen, theme matrix and VoiceOver were not rerun for this
  follow-up. Qt/Windows/Linux gates are not applicable to this macOS-only fix.
- Independent code review found no blocking issue. The pre-existing reliance
  on AppKit's titlebar ancestor structure remains an OS-compatibility limit.
