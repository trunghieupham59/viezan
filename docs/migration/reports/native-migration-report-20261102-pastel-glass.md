# Light pastel Glass refinement — 2026-11-02

## Request and source

The user requested direct application to Viezan of light frosted panels, soft
lighting, blue/purple pastels and restrained depth. The corrected size request
is a freely resizable desktop app, not a 16:9 image or window constraint.

Applied the existing native UX workflow and pinned UI UX Pro Max guidance
(`glassmorphism`, style domain). The references guide material placement and
contrast; web blur recipes are not native implementation requirements.

- Canonical Glass **light** tokens now provide lavender navigation, pale blue
  header material, brighter frosted controls and darker secondary chrome labels.
  Both native resource bundles were regenerated (59 metrics).
- macOS retains native glass, with the semantic lavender wash over its light
  material so the color survives AppKit adaptation to a neutral desktop. The
  pane shadow uses Glass `shadow-sm` opacity (0.08) instead of overlay opacity.
  Reduce Transparency/Increase Contrast retain opaque fallback and no shadow.
- The default blue solid action is `blue-700`. SwiftUI light Glass action roles
  use the same Glass palette as Qt; reading surfaces/text retain Graphite.
- Qt light Glass `palette.base` and `alternateBase` composite over the opaque
  sidebar base. Reading, composer and history therefore stay opaque. The shared
  primary button now tints its SVG icon with the declared foreground color,
  including its disabled color, through the existing `IconImage` pattern.
- Dark Glass, non-Glass palettes, navigation state and independent appearance
  preferences remain intact. Shared primary-button icon tinting applies across
  Qt presets. No dependency, network service or permission boundary changed.
- Native default size remains 1044 × 760, minimum 640 × 480, with the existing
  900 pt compact breakpoint. No aspect ratio is imposed. The earlier pane/header
  clearance and 12 pt logo inset remain in place.

The current dev app was set through Appearance to **Glass / Light / By preset**
to show the requested blue/lavender direction. Accent choice remains editable;
no private preference file was read or rewritten directly.

## Verification

- **Source review:** both generated catalogs match. Deep comparison against the
  pre-pass snapshot confines palette changes to Glass light and the new shadow
  metric. Dark and other preset palettes are unchanged.
- **macOS tests:** `LiquidGlassShellTests` **4/4 passed**, covering light/dark
  header actions, 1200/820 layouts, expanded/rail/overlay state, native-control
  clearance, focus return, disabled behavior and opaque fallback. Final log:
  `/private/tmp/viezan-pastel-glass-swift-tests.log`.
- **macOS build:** the final Debug dev bundle built and cooperatively reloaded;
  `.native-build/dev/reload-status.json` reports `complete`. Build evidence is
  `.native-build/dev/build.log`.
- **Live macOS:** inspected Appearance in expanded and collapsed navigation.
  Lavender pane, blue header, neutral selected pill and full logo are visible;
  content remains opaque. Restored expanded navigation. Cmd-K opens the command
  palette and Escape returns focus to the navigation toggle. Screenshots remain
  in the conversation, not copied into repository artifacts.
- **Qt:** local macOS Qt build succeeded and final focused QML checks passed
  **12/12**. Inspected isolated Home 1200 × 820, Home 820 × 820 and Settings
  1200 × 820 captures. Controls/labels fit and the primary-action plus icon is
  white. No new QML/binding warnings; existing offscreen macOS audio/permission
  and font warnings remain. Fixtures use temporary state with provider probing
  disabled, not the user's saved workspace.
- **Shared checks:** 11/11 Node domain tests, `check:resources`, `check:agent`,
  `check:docs` and `git diff --check` passed.

Qt evidence directory: `/private/tmp/viezan-pastel-glass-evidence/qt/`.
Files: `glass-home-light-1200.png`, `glass-home-light-820.png`,
`glass-settings-light-1200.png`, `qml-smoke.txt`, `pixel-contrast.json`,
`action-contrast.json`.

## Contrast and remaining acceptance

Default blue/white text contrast is **5.54:1**, hover **7.70:1**. Representative
opaque fallback contrast is **5.13:1** for muted sidebar text and **4.84:1** for
soft sidebar text. Qt captured opaque surface samples give muted text contrast
of **6.72:1** reading, **5.60:1** navigation and **5.80:1** header. These figures
are token/composited or sampled opaque-color checks, not proof over every live
translucent wallpaper. Existing alternate teal/green/amber solid accents were
not changed; this is not a claim of full contrast compliance for every accent.

Windows/Linux runtime, macOS 15 fallback runtime, live VoiceOver/IME, live
minimum-size/fullscreen and a new EN/JA/large-text matrix were **NOT RUN** in this
palette pass. Automated resize/fallback checks do not replace those gates.
No commit, push or release was performed; final user visual acceptance remains
separate from source, tests and local preview.
