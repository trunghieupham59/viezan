# Reference-image Glass refinement — 2026-11-02

The user's seven UI references are applied to Viezan's native shell and shared
components. This is implemented code, with design acceptance pending user review.
Evidence covers the working tree; HEAD at final review is `cc637ad`. Existing
dirty work was preserved, with a pre-change snapshot of relevant files under
`/private/tmp/viezan-reference-glass-baseline`. No commit or publication was made.

## Design mapping and source

| Reference | Applied to Viezan |
| --- | --- |
| Capsule navigation and floating website toolbar | Neutral selected pills with accent icons, separate circular rail search, compact toolbar controls and a thin illuminated rim. |
| Finder and desktop glass sidebar | Existing inset native material pane refined to 26 pt corners; expanded/rail geometry and independent saved navigation state retained. |
| Light card collage and dark dashboard | Glass cards use 18 pt corners; shared SwiftUI buttons and Qt toolbar controls use 16 pt corners, with a restrained edge gradient. Other Qt controls retain toolkit styling. Reading, composing and history backgrounds remain opaque. |
| Colorful compact widgets | Existing semantic status colors and concise controls carry the emphasis; no unrelated KPI widgets or decorative animation added. |
| Glass social-app layout | Clear navigation/content hierarchy and bounded surfaces; the reference does not replace Viezan's feature layouts or content. |

- `NativeFoundation.swift`: shared noninteractive selection/search lens, circular
  rail search, native pane corner metric. The expanded magnifier is also visible
  in other presets; their surfaces retain the existing treatment.
- `NativeKit.swift`: bounded card/control edge and Glass filter-group styling.
- `InterpretationWorkspace.swift`: summary tabs and the intact action group wrap
  when the reading column narrows; busy/disabled/callback behavior is retained.
- Qt `Kit.qml`, `PrimaryNavigation.qml`, `Main.qml`: corresponding pane, neutral
  selection, search, toolbar and card presentation. Qt uses opaque compositing,
  not Apple materials or desktop backdrop blur.
- `resources/tokens.css` and `generate-resources.mjs`: dark Glass edge highlight
  and three semantic corner metrics; both generated native catalogs updated.
- README, direction, findings, shell and Interpretation specifications updated.

## Skill use

Applied `ui-ux-pro-max` through the Viezan native UX adapter and the
native-migration agent/workflow. The installed source remains pinned to
`3a13158ff1f32156cbe144108de48eda2ecaed9a`.

- Query `Liquid Glass`, domain `style`: matched `liquid-glass`; adopted bounded
  navigation/control material, translated to the existing native components.
- Query `keyboard focus`, stack `swiftui`: used focus guidance while retaining
  AppKit first-responder and IME bridges; iOS-only keyboard assumptions excluded.
- Query `reduced motion`, stack `swiftui`: retained accessibility-aware motion;
  this refinement introduces no new animation.
- Qt has no upstream stack entry. Shared UX guidance maps to Qt Quick Controls,
  generated tokens and existing focus/accessibility semantics.

## Verification

| Gate | Actual evidence |
| --- | --- |
| macOS build | PASS: Debug dev bundle built, signed and cooperatively relaunched after the final Swift change; `.native-build/dev/build.log`, reload status `complete`. Host: macOS 27.2 (26B123). |
| Swift regression suite | PASS: 44 native tests and 60 domain tests; `/private/tmp/viezan-reference-swift-tests.log`. Two unrelated opt-in render cases remained skipped. |
| Summary width regression | PASS after the follow-up layout correction: 1 focused test with 640/820/1200 cases. Checks action bounds, full label widths, no overlap and narrow wrapping using synthetic controls. |
| Qt build and tests | PASS on macOS Qt 6.12: application/test build and full CTest suite (109 passed). After the final neutral-selection color correction, rebuild and focused QML real-bridge checks passed again (12 passed). `.native-build/electron-cleanup-qt/qt-test-results.txt`; `/private/tmp/viezan-reference-evidence/qt/final-qml-smoke.txt`. |
| Shared/resource checks | PASS: 11 Node domain tests; `check:resources` (3 locales, 58 metrics), `check:agent`, `check:docs`, `git diff --check`. |
| UX07 keyboard | Live PASS for Tab to search, Space to open command palette, Escape to close and return focus to search. Native tests also verify toolbar focus return and disabled controls. Actual VI/JA IME composition is NOT RUN. |
| UX08 layout | Live Home reviewed at 1400 pt and approximately 1018 pt after native Window resizing; rail/expanded inspected. Isolated shell geometry covers 1200/820, content fixtures 640/820/1400; summary test covers 640/820/1200. Live resizing below 900 pt remains NOT RUN: CUA edge drags did not change width reliably. |
| UX09 appearance | Live light Home/rail and dark Settings inspected with Vietnamese UI. Glass preset, pink accent, medium text and original light mode restored after review. Content fixtures generated across light/dark and three widths; dark Appearance at 640 was inspected. Full EN/JA and text-scale live matrix is NOT RUN. |
| UX10/accessibility | AX names/selected states and keyboard navigation inspected. VoiceOver and live OS Reduce Transparency/Increase Contrast propagation are NOT RUN; fallback logic was exercised in isolated tests. |
| Windows/Linux/macOS 15 | NOT RUN on target OS. Qt on macOS and macOS 27 material checks do not establish these runtime gates. |

Native fixture images are under `/private/tmp/viezan-reference-evidence`.
Qt synthetic offscreen/software captures under its `qt/` folder were inspected:
Home light at 1200, Home dark at 820 and Settings dark at 1200. They show bounded
pane/search/toolbar rims and opaque cards, and are not target-OS runtime evidence.
`cacheDisplay` can omit native layer content, so shell PNGs are layout diagnostics,
not proof of rendered glass quality. Actual macOS appearance was inspected through
CUA; live screenshots remain in the task conversation, without copying private
conversation content into repository artifacts. No provider requests or audio
recording were started for this review.

User design acceptance, full assistive-input checks, target-OS rendering and
performance measurement remain separate from the source/build/test results above.

## Window-control clearance follow-up

The user reported the expanded Glass rim surrounding the macOS traffic lights.
The material was noninteractive, but its bounds included the window-control row.
`SidebarSurface` now starts `headerHeight + small` below the top in expanded,
rail and temporary-overlay presentations. The Glass overlay's clear spacer also
uses `headerHeight` so its close button remains within the pane. Window controls,
navigation toggle coordinates and non-Glass layouts are unchanged.

- Source: `NativeFoundation.swift`, `ViezanApp.swift`; existing
  `LiquidGlassShellTests` geometry regression strengthened. No Qt/token changes.
- Tests: **4/4 focused tests passed**; header coverage includes light/dark.
  Expanded 1200, rail 1200/820, compact overlay 820 and restored states assert
  material below the header and all native controls, with at least 8 pt control
  clearance and the overlay close button inside its pane. The first run caught
  the shorter overlay spacer; the final run passes after correcting it.
  Log: `/private/tmp/viezan-glass-titlebar-tests.log`.
- Build: final Debug dev bundle built, signed and relaunched; reload status
  `complete`, `.native-build/dev/build.log`.
- Live: expanded light-mode pane inspected after reload; its rounded rim is
  below the traffic-light/toggle row. Screenshot remains in the conversation.
  Compact-overlay live interaction, VoiceOver/IME and macOS 15 remain NOT RUN
  for this geometry follow-up; automated geometry is separate evidence.
- Resources/docs: `check:resources`, `check:docs` and `git diff --check` passed.
  Direction, shell spec, findings and README reflect the corrected boundary.
- Applied the same native-migration/native-UX workflow; UI UX Pro Max query
  `focus not obscured` (UX domain) supplied the general unobscured-control
  principle. Its Web/WCAG example was not treated as a native implementation rule.

## Logo inset follow-up

The next user screenshot exposed missing content clearance after moving the pane
below the header: the logo was only about 2 pt below the pane edge and touched its
rounded shoulder. `NativeNavigation` now adds `gap` (12 pt) top padding in Glass,
giving the unchanged 28 pt logo approximately 14 pt clearance in expanded/rail
states. The same padding applies to the compact overlay; window controls and
the pane position remain fixed. Other presets retain their padding.

The existing `LiquidGlassShellTests` passed **4/4** again, including resize,
overlay, native-control clearance, light/dark header and focus/disabled checks.
Log: `/private/tmp/viezan-glass-logo-inset-tests.log`. Final Debug dev build and
cooperative reload completed. Live light-mode expanded and rail presentations
were both inspected: the entire logo now sits inside the rounded pane. Expanded
navigation was restored afterward. Compact-overlay live review and the earlier
unrun accessibility/target-OS gates remain separate; no new test probes were added.
Resource/docs checks and whitespace validation passed; direction, findings and
shell specification record the inset. This uses the same native UX workflow.
