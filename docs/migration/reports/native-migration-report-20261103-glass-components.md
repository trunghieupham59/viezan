# Shared Liquid Glass components

Date: 2026-11-03. Base HEAD: `cc637ad`, with pre-existing dirty work preserved.
Scope: continue the approved sidebar material into shared inputs, filters,
selection controls and floating panels. Existing palette retained. Local source
and development-build evidence only; no commit, publication or release claim.

## Screenshot review and decisions

The user's Chat screenshot and live macOS views were reviewed before editing.
The sidebar references define shape and optical depth, not their colors or
photographic backdrops. Four inconsistencies were visible:

1. Chat's thick accent focus border dominated the composer. The input now has
   an opaque inset face, a stronger neutral editing edge and its native caret.
   Buttons retain their distinct keyboard focus indication. This follows the
   existing text-input focus contract in `docs/design/foundations.md`.
2. Model/command/Settings searches had older corner geometry unrelated to the
   new capsule controls. Shared search now uses half its actual height as the
   Glass radius, a recessed edge and an opaque reading center.
3. Home filters and secondary navigation used painted selection fills. Filters
   now have one quiet group with a raised selected lens and clear idle segments.
   Settings navigation and the active command result use the same lens language.
4. Floating panels had different corners and perimeter treatments. History,
   Activity, Commands and anchored composer panels now share one reading
   surface with a directional perimeter and bounded shadow. Qt dialogs share
   that treatment only in Glass; other dialog presets retain toolkit styling.

Glass is concentrated on controls/navigation; text-heavy centers stay stable
and opaque. This interpretation follows Apple's
[Materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials)
and [custom Liquid Glass guidance](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views).
No wallpaper, palette change or new visual asset was introduced.

## Source implementation

- macOS `InsetInputSurface` is shared by `SearchBox` and the Chat composer.
  Decoration is passive and hidden from accessibility. The native search field,
  composer editor, focus callbacks, IME ownership and session/model bindings
  remain intact. Solid accessibility modes remove optical decoration.
- `FilterTabs`, Settings navigation and command results reuse the existing
  native control material. The selected state remains accessible independently
  of keyboard focus. `ReadingPanelSurface` centralizes the opaque panel shell.
- Qt `Kit.SearchField`, `FilterGroup`, `FilterButton` and `ReadingPanelSurface`
  replace duplicated styling in their consumers. Search keeps native TextField
  semantics and its callers' key handlers; Launcher retains its integrated
  borderless field to avoid a nested control frame. Shared search covers shell
  headers, Commands, History, Settings, Apps, Comparison and Interpretation.
- Qt Home and Settings filter groups synchronize keyboard selection as well as
  pointer selection. A new interaction regression caught and fixed the previous
  behavior where an arrow moved the selected tab without applying its value.
  Dialog footer roles, default/cancel actions and non-Glass backgrounds remain
  owned by the native toolkit. Qt uses composed surfaces, not desktop blur.
- No changes to shared palette tokens, locale catalogs, provider/service code,
  credentials or persistence schemas in this pass. README and affected screen
  specs document the new components.

## Verification

- Swift `LiquidGlassShellTests`: 4 tests passed (9 parameterized cases).
  `FoundationRuntimeTests`, `ChatGlassLayoutTests` and
  `InterpretationLayoutTests`: 34 tests passed in a focused run, with two
  opt-in render cases skipped. After the command-selection follow-up,
  `FoundationRuntimeTests` passed again (31 tests). Coverage includes marked
  text guards, empty-input focus, editor identity through growth/resize,
  light/dark structural layout, search recovery, panel focus return, disabled
  actions and command keyboard navigation. Logs:
  `/private/tmp/viezan-components-swift-glass.log`,
  `/private/tmp/viezan-components-swift-runtime.log`,
  `/private/tmp/viezan-components-swift-runtime-final.log`.
- Shared resources verified: three locales, 58 metrics. Domain/contracts: 11
  passed. Python native tooling: seven passed. No regeneration was needed.
- Qt application/test build passed. Final focused suite: 34 passed, zero
  failed/skipped, in 12.378 seconds with Fusion/offscreen/software rendering.
  It covers search composition/selection through resize, Home/Settings keyboard
  filters, dialog standard actions and Graphite/Glass restoration, composer
  model ownership, overlay exclusivity and compact/light/dark layouts. Logs:
  `/private/tmp/viezan-components-qt-build.log` and
  `/private/tmp/viezan-components-qt-final-tests.log`. Earlier runs exposed the
  filter-state mismatch and a dialog implicit-width loop; both were fixed and
  are not counted as passing evidence. Existing microphone-permission/audio
  warnings remain on the macOS offscreen host.
- Synthetic Qt light/dark component and titled-dialog captures were inspected
  in `/private/tmp/viezan-components-qt-evidence/`. The review corrected a bright
  dark-mode shadow and native title/footer strips covering the rounded shell.
  Native dialog content/footer geometry remains intact; only the Glass title
  inset changes. The directory includes `source-sha256.txt`. macOS fingerprints
  are in `/private/tmp/viezan-components-native-source-manifest.txt`.
  Documentation checks and whitespace validation passed.
- macOS dev app built, signed and cooperatively reloaded. Live light-mode
  inspection verified Home's raised filter selection and actual filtered
  results; the All filter was restored. Chat's focused composer shows a neutral
  edge/caret with the original model and empty draft. Model search filters and
  clears without selecting a model. Settings search enters and recovers from
  an empty-result state. Its selected section has a raised capsule. Commands
  and model panels have the shared corners and readable center.
- Final macOS reload `6C126765-7227-490E-8D4E-84964B99FF75` completed.
  The command-result lens moved from Home to Chat with Down while focus stayed
  in its search field. History and Activity were inspected live; switching
  overlays closed the previous one, and Escape returned focus to the Activity
  trigger. The app is left on AI Chat with expanded navigation and no overlay.
  No AI request/recording was started, model changed or appearance preference
  edited during live review.
- Screenshots from the live CUA review are displayed in the conversation;
  persistent PNG copies were not exported by the available native UI API.
  AppKit cache-display renders are not substituted for live compositor evidence.

## Boundaries

Applied native-migration/product-engineering rules, viezan-native-ux and its
UI UX Pro Max adapter (`Liquid Glass --domain style -n 1`), plus Product Design
Audit for screenshot-led review. A read-only second review found the unintended
non-Glass Qt dialog background change; it was corrected before final validation.

Full live dark mode, OS Reduce Transparency/Increase Contrast propagation,
VoiceOver and physical VI/JA IME acceptance were not run in this pass. Automated
composition and light/dark structural checks do not close those gates. Native
Windows/Linux runtime and Qt GPU rendering are also not verified on this macOS
host. Full unfiltered Swift/Qt suites and release packaging were not run; checks
were focused on the changed components and their interaction contracts.
User visual acceptance remains separate from builds and tests.
