# Desktop Review 18 → native UI alignment

Date: 2026-10-27. The user explicitly selected Desktop Review 18 as the design
reference. This pass changes SwiftUI/AppKit and Qt/QML source, not the archived
React UI or the review prototype.

## Design inputs

- `docs/migration/review18-handoff.md` and `workbench-ux.md`.
- The saved Review 18 macOS history/translation screenshot, inspected directly.
- Current shell/Chat/Translation screen specs, canonical tokens and UI rules.
- Existing native shell, history, editor, media, model and settings implementations.

## Implemented UI changes

- **Chat:** the editor comes first within the same opaque composer. Swift measures
  the draft for bounded growth rather than always reserving the maximum editor
  height. Chat mode/careful reasoning use a menu; image/OCR/capture actions share
  an attachment menu. Recording remains directly reachable and active recording
  still exposes Stop. Audio provider/speech utilities move into compact controls.
  Model refresh/configuration share the model row instead of adding a permanent
  configuration row. Failure/retry and attachments remain available.
- **Translation/Dictionary:** retain the language/model row and a compact media
  toolbar. Translation style, mode, reasoning, auto-translation delay and model
  comparison move to an explicit scrollable options surface. Session changes close
  it. Source/result retain aligned header/footer metrics; Qt now uses joined,
  opaque surfaces with canonical borders and a subdued result surface.
- **Settings:** dedicated workspace with category navigation. Without a search,
  only the selected category is shown; search retains matching categories. Content
  scroll no longer changes the selected category. Compact widths retain the native
  category picker. Settings do not become a modal dialog.
- **Home:** localized introductory copy, six recent work entries, an Interpreting
  entry alongside Chat/Translation/Dictionary and collapsible system details.
  Opening Interpreting does not start capture or create an unrelated Chat session.
- **Resources:** the new translation-options label is present in VI/EN/JA; Home
  copy reuses the existing locale source. Native resources were regenerated.
  New styling consumes existing metrics and palette roles, with no new literal
  color/spacing scale. The Qt translation options are an independent component.

The existing Review 18 shell contract remains: independent primary navigation,
one context header, modeless quick history, separate library preview and activity,
no session tab strip, and preserved domain task/session identity.

## Evidence and limits

Performed: source/spec/history reads, inspection of a saved reference screenshot,
source edits, call-site/label/resource wiring review and resource generation.
No runtime screenshot was produced for the new native UI.

**Not run at the user's instruction:** build, tests, lint, Atomic Design/design
checks, app launch and visual/runtime QA. In particular UX07–UX10 (IME/focus,
widths, language/text scale and assistive technology) are not marked passed.
The earlier running review binary does not include this pass until rebuilt.
No dependency installation, provider requests, data migration, commit or push.

Workflow: `native-migration`; rules: `native-migration`,
`viezan-product-engineering`, project UI/UX and Atomic UI guidance; project skills:
`viezan-native-ux`, `viezan-native-migration`. User authorization selects Review 18
and keeps build/test gates deferred. Design reference selection is not runtime or
release acceptance.

## Full module source pass — 2026-10-27

The user requested continuing the Review 18 alignment across the remaining
screens. This pass extends the earlier Chat/Translation/Home/Settings work:

| Surface | Source changes |
| --- | --- |
| Shared controls | `NativeFlow` wraps measured native controls without constructing duplicate stateful toolbars. Chat, language tools, interpretation and permission actions reuse it. Qt keeps native Flow/Layout sizing. |
| Interpretation | Bounded setup surface; searchable modeless history with keyboard selection; delete moved into history management; bilingual/translation-only display; meaningful empty state; collapsed analysis results; export menu; active session language/model restored when returning. |
| Background capture | Navigating away no longer stops interpretation. A shell banner identifies background interpretation and provides Open/Stop. Closing the main macOS window stops capture; Quit/module-disable retain domain cancellation. Qt window close still follows its shutdown path. |
| Dictionary | Compact query input with explicit lookup/cancel, optional context and a full result area, instead of a large second text editor. Existing structured definitions, pronunciation, favorites and retry remain. |
| Applications | macOS list/detail layout at desktop widths, single detail at compact widths; search-empty state and readable path metadata. Qt selects an inventory row before explicit Open/Reveal/system-management actions; scanning has a distinct busy state. Reveal still requires a canonical path present in the inventory. |
| Thermal | Sensor data and monitoring precede helper administration. Helper actions are disclosed; fan profiles, calibration and restore remain available. Qt surfaces only real sensor/fan readings and its platform limitation, without fake writable controls. |
| Everywhere / Utilities | Separate workspaces, localized purpose text, scoped shortcut controls and a browser connection section only on Everywhere. General settings/module/startup forms are not repeated on these task pages. |
| Quick Chat / selection panel | One bounded growing composer, native text editing and composition-aware send shortcuts. macOS custom model IDs use an editable draft plus explicit validated Apply, avoiding rejection while typing an incomplete ID. |
| Settings | General/Appearance lead navigation; provider controls retain async owner identity and block changing provider during credential writes. Existing Data, bridge, local-model and update actions remain reachable. |
| Empty/loading/error states | Localized interpretation, application and sensor empty states; application refresh guard and busy feedback; real recording levels separated from processing progress. Shared Qt `EmptyState` uses generated metrics. |

Implementation files are under `apps/macos/Sources/ViezanNative` and
`apps/desktop-qt/qml`, with the Qt inventory-state/reveal wiring in
`DesktopIntegration.h/.cpp`. Added QML files are listed in CMake resources.
VI/EN/JA resources were regenerated from the canonical locale/token sources.
No new literal UI palette or spacing scale was introduced.

Platform contracts are retained: application removal/fan writes remain macOS
capabilities; recording setup is locked while the backend is busy; configuring
controls does not silently reprocess previous segments. This is a native layout
and interaction implementation of the review direction, not a claim that every
prototype control has identical platform behavior.

**Verification remains source-only.** Reference/spec and relevant source/test
files were read; edited code and call sites were inspected. No build, test, lint,
Atomic/design check, application launch, provider call, capture operation or
visual/runtime acceptance was performed. In particular wrapping, popover bounds,
VoiceOver/Narrator/Orca, VI/JA composition and recording navigation/close must be
accepted on the rebuilt apps. No prior screenshot or binary validates this pass.

## macOS review build — 2026-10-27

At the user's subsequent request, `scripts/native/build.py --target macos
--output .native-build/review-ui-20261027` completed successfully, including the
app bundle and native helpers. The old review process quit normally. The new
bundle was opened and its exact executable path confirmed with PID 98839;
Accessibility reported the window `AI Chat / Chat mới`.

Compiler warnings remain in CredentialStore (deprecated authentication constant)
and NativeUpdates (capture ownership). No automated tests or full visual/feature
acceptance ran. Windows/Linux are not covered by this macOS build.
