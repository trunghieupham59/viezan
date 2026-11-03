# Continuous milky Glass — 2026-11-02

## Request and workflow

The user supplied a Finder-style continuous frosted-glass reference and a light
blue desktop-workspace reference, following explicit authorization to apply the
design directly to Viezan. This refinement replaces the light floating lavender
pane from the preceding pastel pass. It preserves a freely resizable desktop
window rather than treating image framing parameters as app geometry.

Applied `native-migration` workflow/rules, `viezan-native-ux`, the Viezan UI UX Pro
Max adapter and its pinned `glassmorphism` style result. Adopted milky materials,
restrained edge lighting, depth and legible text. CSS blur recipes, catalog
performance claims, Finder file-management content and dashboard KPI widgets
were not treated as native implementation requirements.

## Source

- Glass light tokens use sky/sage chrome, charcoal labels, periwinkle default
  actions and opaque `surface`/`canvas`. Both native catalogs were regenerated.
- macOS light navigation is now a full-column passive `NSVisualEffectView`, using
  the same material as the header and a subtle semantic sky-to-sage wash. It has
  no local rounded frame, refraction layer or pane shadow. The OS retains the
  outer window edge; no full-window blur or wallpaper asset was added.
- The light sidebar divider begins below the header, including compact overlay,
  to avoid crossing native window controls when the rail is narrower than their
  row. Fixed controls, logo size/top clearance, 236/68 pt navigation and saved
  collapse/overlay state remain unchanged.
- Dark Glass retains the floating pane, its inset/rim and existing palette.
  Other presets retain their palettes. Decorative visual-effect views are
  explicitly passive for pointer input and accessibility.
- macOS light Glass reading surfaces now use the opaque shared Glass colors;
  reading text retains Graphite. Actions keep the existing shared palette route.
  Reduce Transparency/Increase Contrast retain solid shell fallback.
- Qt light navigation fills the column with corresponding opaque sky/sage colors,
  joins a full-width header and uses slim dividers. Header controls use the
  matching header base. Dark keeps its inset pane/header capsule.
- Removed the now-unused light pane-shadow metric; generated resources contain
  **58 metrics**. No dependencies, locale strings, services or data formats changed.

Native geometry remains default 1044 × 760, minimum 640 × 480, breakpoint 900,
with no fixed aspect ratio. README, direction, shell, persona notes and findings
describe the current material boundary; earlier reports remain historical.

## Verification

- **macOS source/build:** final Debug dev bundle compiled and cooperatively
  reloaded. `.native-build/dev/reload-status.json` reports `complete`; build log
  is `.native-build/dev/build.log`.
- **macOS tests:** final `LiquidGlassShellTests` **4/4 passed**, including light
  and dark cases for header controls and navigation material geometry. The
  existing navigation test now verifies full-column passive light material and
  the dark pane's control clearance, while retaining resize, overlay close,
  focus return, saved collapse state, draft/session and native-control alignment.
  Log: `/private/tmp/viezan-milky-glass-swift-tests.log`. An initial added bound
  incorrectly treated compact-overlay width as the largest navigation width;
  it was corrected to the maximum of regular/compact widths before the final run.
- **Live macOS:** inspected light expanded/rail Settings, whole logo, joined
  header/sidebar and opaque content. Switched to dark to check the retained pane,
  then restored light. Inspected the final rail seam below the header after
  reloading; restored expanded navigation. Cmd-K focuses the command search;
  Escape closes it and returns focus to the navigation toggle.
- **Qt:** local macOS Qt build succeeded; focused QML **12/12 passed**. Inspected
  Home 1200 × 820, Home 820 × 820, Settings 1200 × 820 and dark Home 820 × 820.
  Text/controls fit and light surfaces are opaque. Dark 820 before/after images
  are byte-identical. No new QML/binding warnings; existing offscreen macOS
  audio/permission/font warnings remain.
- **Shared checks:** Node domain **11/11**, `check:resources`, `check:docs`,
  `check:agent` and `git diff --check` passed.

Isolated Qt artifacts are under `/private/tmp/viezan-milky-glass-evidence/qt/`:
`glass-home-light-1200.png`, `glass-home-light-820.png`,
`glass-settings-light-1200.png`, `glass-home-dark-820.png`, `qml-smoke.txt`.
They use temporary fixture state and disabled provider probing. Live screenshots
remain in the conversation; private workspace contents were not copied into
repository artifacts.

## Contrast and remaining gates

Default periwinkle/white text contrast is **5.41:1**. Opaque macOS reading text
contrast is **13.17:1** on the new surface; muted reading text is **5.39:1**
(canvas **5.09:1**). Qt reading text/muted text are **12.24:1 / 6.03:1**.
These are representative opaque-color calculations, not proof for every live
wallpaper or alternate user accent.

Windows/Linux runtime, macOS 15 fallback runtime, live minimum-size/fullscreen,
live VI/JA composition, VoiceOver and the full locale/text-size matrix were
**NOT RUN** in this material pass. Available checks cover geometry/material
changes; they do not establish all-platform runtime acceptance. No commit, push,
release or new dependency installation was performed. User visual acceptance
remains separate from implementation and local verification.
