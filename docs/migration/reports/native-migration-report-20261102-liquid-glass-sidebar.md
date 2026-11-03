# Floating Liquid Glass sidebar — 2026-11-02

The user's follow-up requests Liquid Glass on the sidebar itself. This replaces
the Glass preset's continuous column with one native floating pane. Other presets
retain the previous presentation. Existing dirty work was preserved; no commit,
push, dependency installation or release was performed.

## Source and design

- `SidebarSurface` provides an 8 pt inset, 20 pt continuous corners, a light rim
  and restrained shadow, using existing semantic metrics and colors.
- On macOS 26+, `NavigationGlassMaterial` combines behind-window vibrancy with
  `NSGlassEffectView`. macOS 15 uses the existing material fallback. Reduce
  Transparency/Increase Contrast use an opaque pane with a uniform stronger edge.
- Expanded navigation includes its title row. The 68 pt rail starts below the
  header so its rounded corner does not intersect the system window controls.
  The compact navigation overlay uses the same pane; the underlying Glass rail
  is visually hidden and excluded from accessibility while it is open.
- The 236 pt column, icon/text axes, row heights, saved navigation preference and
  fixed toggle/window-control positions are retained. The row-to-pane gap is 4 pt.
- Material views are noninteractive and hidden from accessibility. Reading
  surfaces and the existing header controls are unchanged by this follow-up.

Capabilities: native-migration agent/workflow, `viezan-native-ux` and
`viezan-native-migration` skills, `AGENTS.md`, `.claude/rules/ui-ux.md` and the
native-migration/product rules. README, direction, findings and shell spec were
updated from the implementation using the scoped documentation-sync workflow.

## Verification

| Gate | Evidence |
| --- | --- |
| Source/build | PASS: macOS 27.2 Debug dev build, signing and cooperative relaunch; `.native-build/dev/build.log`, reload status `complete`. |
| Automated native checks | PASS: final source, 35 tests across LiquidGlassShellTests and FoundationRuntimeTests; `/tmp/viezan-liquid-glass-sidebar-final.log`. Two optional broad render tests were not enabled. |
| UX07/UX08 state and geometry | PASS in isolated tests: expanded → rail → compact overlay → desktop, close-button bounds, focus return, saved route/draft/preference, restored pane width and traffic-light alignment. |
| Resources/docs | PASS: `npm run check:resources`, `npm run check:docs`, `git diff --check`. No new tokens or strings were needed. |
| Live macOS appearance | Inspected expanded and collapsed pane in the actual `.native-build/dev/Viezan.app`; inset, rounded rim and depth are visible. Final rebuilt rail was inspected again. CUA screenshots remain in the task conversation. |
| Design acceptance | Pending user review. |
| Remaining runtime gates | NOT RUN: live compact resize/overlay, dark mode, VoiceOver, actual VI/JA IME, OS accessibility preference propagation and macOS 15 runtime. Width/theme fixture checks are not substitutes. |
| Windows/Linux | NOT RUN; this is the ongoing macOS sidebar refinement, with no Qt material renderer change. |

The cacheDisplay images in `/tmp/viezan-liquid-glass-sidebar-evidence` can omit
native layers; they are layout diagnostics, not proof of rendered glass quality.
Final source fingerprints are in
`.native-build/liquid-glass-check/sidebar-source-sha256.txt`.
