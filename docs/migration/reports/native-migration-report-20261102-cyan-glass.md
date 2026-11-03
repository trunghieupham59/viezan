# Cyan layered Glass — selected dashboard reference

Date: 2026-11-02. Scope: native light Glass shell, shared cards and Home.

## Reference diagnosis

The user rejected the previous milky Finder pass as visually unlike the
selected cyan dashboard. That image depends on four visible brightness levels:
blue scene → pale-blue navigation → ice workspace → milky cards. Its separate
panels and gaps matter more than blur. Earlier page and card fills were identical,
and a full-column opaque surface hid the canvas. Sky/sage and periwinkle also
followed an older reference instead of the selected cyan image.

The updated implementation uses app-bg #A5D9F0, sidebar-bg #B7E1F3,
canvas #CEEAF7 and surface #E7F5FC from canonical tokens. A broad blue scene
gradient supplies soft lighting. Navigation floats below the native control row;
the workspace has a bounded rounded surface with visible gutters. Card edges
are soft, with restrained depth. Home uses real quick actions, recent work and
model readiness. It adds no fabricated KPI, duplicate navigation or new route.

The native workspace moves part of the 44 pt page inset outside the panel
(16 pt desktop/12 pt compact), retaining the content width budget. Qt rebudgets
its existing 24 pt shell inset separately. Light navigation/search use 10 pt
rounded rectangles; circular rail search remains circular. Dark styling is
retained. Reading and composing stay opaque; appearance axes remain independent.

## Research and implementation

Used the installed UI UX Pro Max skill through the Viezan native adapter.
Query: `glassmorphism layered cards --domain style`; its layered background,
subtle edges and contrast guidance informed the review. Web blur values and
mobile metrics were not copied into either native toolkit.

Source is edited locally; no dependency installation, commit or publication.
The baseline for this round is /private/tmp/viezan-cyan-glass-baseline.

## Verification

- macOS dev bundle built, signed and reloaded successfully; current reload
  request E7F66EBF-9673-403D-9ED5-781E766C6B51 completed.
- Final Swift run with explicit `--no-parallel`: 44 native tests and 59 domain
  tests passed. Native tests cover 1200/820 and compact 640/820 navigation,
  light/dark, VI/JA, focus/draft preservation, control bounds and Interpretation
  layouts. Two image-related tests were excluded after failing in the full run:
  `composerPasteHandsImagesToTheIntakeInsteadOfTheText` (clipboard intake) and
  `pastedImageBytesIngestLikeAFileAndRejectNonImages` (`invalidResponse`). These
  failures remain unresolved; this is not a claim that the entire suite is green.
  An obsolete pre-logo-clearance geometry assertion was updated to require the
  overlay close button below the header and stable across compact widths.
  A parallel run also had one timing-sensitive restored-pane assertion;
  the final AppKit run was sequential.
- Domain contract Node tests 11/11; generated resource parity, documentation
  checks and `git diff --check` pass.
- Qt builds locally on macOS; focused QML 12/12 pass. Isolated captures cover
  Home 1200/820/640, Settings 1200 and dark 820. Theme switching preserves Home's
  filter. The dark 820 image is byte-identical to the prior round.
- Live macOS: reviewed Home and Settings, expanded/rail navigation, native
  window tiling and restoration, command palette open/Escape. Logo and pane
  edges stay clear of controls. Final dev app is left on Home; navigation and
  window size were restored. No AI request or recording was started.
- Contrast from shared roles: card body 10.11:1, card secondary 5.65:1, canvas
  secondary 5.02:1, default action white 5.23:1; Qt header secondary 4.56:1 at the
  darkest scene color. This covers the default Glass accent, not every optional
  accent combination.

Visual review found the structural mismatch corrected: the blue scene, separate
navigation, workspace and bright cards are identifiable at thumbnail size.
The first Qt capture still looked flat and used old beveled buttons; it was
iterated to roomy quiet actions, separate overview cards, broad scene lighting
and a soft card light wash. The smaller sidebar search is an intentional
adaptation of Viezan's real navigation, not the reference's wide top search.
No claim of pixel identity or Qt desktop blur is made.

Evidence: /private/tmp/viezan-cyan-glass-evidence/qt/ (synthetic isolated profile),
/private/tmp/viezan-cyan-glass-swift-serial.log and the original full-run failure
log /private/tmp/viezan-cyan-glass-swift-tests.log. Live macOS review used the app
without exporting private recent-work data.

Windows/Linux runtime, live IME, VoiceOver, fullscreen and the complete
locale/text-size/system-accessibility matrix remain NOT RUN for this round.
User visual acceptance remains pending.
