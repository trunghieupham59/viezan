# Sidebar glass selection refinement

Date: 2026-11-03. Scope: the primary sidebar's control material and geometry,
with the existing palette retained. Local, uncommitted work; not release or user
acceptance evidence.

Base HEAD: `cc637ad` with pre-existing dirty work preserved. macOS host: 27.2.

## Reference analysis and diagnosis

The two supplied references share a translucent navigation container, clear idle
destinations, and a raised capsule for selection. The compact reference makes
Search a separate round target. Directional highlights, curved edges and local
depth distinguish the selected lens from an ordinary painted row; neither
reference outlines every idle destination. Their yellow/green colors and
photographic backgrounds are not requirements.

Live macOS inspection and source review confirmed the mismatch: Search already
used ControlGlass, but navigation selection still used ChromeControlSurface's
painted fill and hairline edge, with a 10 pt corner radius on a 32 pt row.

## Source changes

- NativeFoundation.swift replaces that painted selection with a shared
  NavigationButtonStyle. Native ControlGlass sits in a passive background,
  leaving the Button label and accessibility identity stable across state
  changes. No opaque decorative face covers the material.
- Selected and Search controls keep a full lens. Unselected hover shows a
  softer lens, press has visible feedback, and idle destinations remain clear.
  Background-service buttons receive transient interaction feedback too.
- Expanded rows use full capsules; the compact rail centers round 32 pt
  controls. Icon/text axes, row heights, routing, enabled state, accessible
  selected traits and semibold selection remain intact. The native focus effect
  follows the capsule through contentShape(.focusEffect), preserving the
  rectangular pointer hit region and keyboard behavior.
- Disabled opacity applies only to the label, preserving an opaque fallback
  under Reduce Transparency / Increase Contrast. The shared material retains
  its older-system fallback and Reduce Motion behavior.
- Qt PrimaryNavigation.qml reuses ControlGlassSurface with capsule/round
  geometry, softer hover and enabled-only hover/pressed feedback. It preserves
  native checked/focus semantics. No desktop backdrop blur is claimed.
- README, shell spec and design findings describe the same behavior. No shared
  token, locale, provider, session, credential or persistence changes in this pass.

## Verification

- Swift: LiquidGlassShellTests passed (4 tests, 9 parameterized cases) and
  FoundationRuntimeTests passed (31 tests; opt-in render cases skipped). These
  include light/dark pane layout, collapse, 1200/820 reflow, compact overlay,
  saved navigation/drafts, focus return and disabled controls. Logs:
  `/private/tmp/viezan-sidebar-swift-verified.log` and
  `/private/tmp/viezan-sidebar-foundation.log`.
- An intermediate capture-enabled run, concurrent with the dev build, failed a
  timing-sensitive History expanded-state assertion after dismissal. The
  diagnostic subsequently read false; clean sequential reruns passed without
  changes to that behavior or test. This is recorded rather than counted as an
  all-green run.
- Qt application/test build passed; 72 focused passes, zero failures/skips.
  The existing repeated click/Space activation regression now includes Glass
  light/dark and Graphite across VI/EN/JA at 640/820/1200/1440 widths. Logs:
  `/private/tmp/viezan-sidebar-qt-build.log` and
  `/private/tmp/viezan-sidebar-qt-final-tests.txt`. Four software-rendered
  expanded/rail light/dark captures were inspected in
  `/private/tmp/viezan-sidebar-qt-evidence/`; no clipped lenses or QML errors.
  Existing audio/font warnings remain.
- Resources passed: three locales, 58 metrics. Shared domain/contracts: 11
  passed. Python native tooling: seven passed. Documentation references and
  whitespace validation passed.
- The macOS dev bundle was built, signed/verified and cooperatively reloaded.
  Live light-mode inspection confirmed native glass depth in selected sidebar
  rows and distinct keyboard focus. Tab reached an unselected Home row and
  Space activated it; Tab/Space then returned to Chat. The round selected rail
  target was inspected live and the sidebar was restored to expanded. Native
  capsule focus was inset to keep the first row's halo within the scroll area.
  No theme, locale, text-size, provider or model preference was changed; no
  request or recording was started. Final source fingerprints are in
  `/private/tmp/viezan-sidebar-lens-source-manifest.txt`.
  Final reload `EA7215C2-D523-4085-AFC1-4F149C498C97` completed. Live inspection
  confirmed the first row's complete capsule focus outline. Shift-Tab to Search,
  Space and Escape opened/closed Commands and restored the visible Search focus
  ring. The app is left on AI Chat with expanded navigation.
- AppKit cache-display captures omit much of SwiftUI/compositor output on this
  host and are unsuitable for visual acceptance. The structural tests and live
  inspection are separate evidence; the partial images are not a visual pass.

## Capability and acceptance boundaries

Applied native-migration workflow/rules, product-engineering guardrails,
viezan-native-ux and its UI UX Pro Max adapter, plus scoped documentation sync.
Research used `Liquid Glass --domain style -n 1` (matched liquid-glass) and
`keyboard focus --stack swiftui` (text-field-focused guidance; existing native
Button focus ownership retained). The native mapping follows the
[Apple custom glass guide](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
and the installed SwiftUI SDK's ContentShapeKinds.focusEffect API. No new design
system, dependency, commit, push or publication was introduced.

UX07/UX08/UX09 have focused structural and partial live evidence, not complete
acceptance. Live dark mode, the full text-size/locale/accent matrix, OS preference
propagation for Reduce Transparency/Increase Contrast, live VI/JA IME and
VoiceOver (UX10) remain Not run in this pass. Windows/Linux runtime and Qt GPU
rendering (OS02) remain Not run: the available Qt execution host is macOS.
No release/package/update gate was requested. User visual acceptance is pending.
