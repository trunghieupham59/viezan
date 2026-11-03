# AI Chat Glass controls — four selected references

Started 2026-11-02; verification continued after midnight on 2026-11-03.
Scope: AI Chat composer and its model/tools controls in
SwiftUI/AppKit and Qt Quick. The existing cyan shell and Home are retained.

The user subsequently rejected the painted button material. Its replacement
and the expanded whole-app scope are recorded in
[Glass button material throughout Viezan](native-migration-report-20261103-glass-buttons.md).
The layout results below do not constitute acceptance of that earlier material.

## Reference analysis and mapping

| Reference | Defining feature | Viezan implementation |
| --- | --- | --- |
| Purple button | Capsule silhouette, clean face, stronger upper-left and lower-right rim | Separate Send/Stop control, directional hairline and restrained face shading, existing semantic accent |
| Black model menu | A persistent raised selected row and a checkmark | Selected lens plus check; keyboard navigation draws a separate outline; unselected labels remain readable |
| Green composer | One long outer capsule, circular plus, a second lens for trailing tools | 52 pt single-line composer, 36 pt controls, grouped model/recording, separate Send/Stop |
| Light segmented toolbar | Related actions share one surface; principal action sits apart | One neutral model/audio group instead of a box around every icon |

The neon scene, sparkles, near-invisible unselected model names, sample model
names and simulated voice activity are not product requirements. Viezan uses
its actual model/provider IDs, existing recording behavior, current theme and
accent. Waveform is the idle recording icon, not a new voice-chat mode.

Text entry and model-list faces stay opaque. Edge lighting is decorative and
does not intercept input. Primary buttons darken towards the lower edge rather
than washing their label background with white. Dark neutral faces use a
reduced light wash; selected, hover, keyboard focus and disabled remain distinct.
macOS Reduce Transparency / Increase Contrast use a solid boundary.

## Implementation

- SwiftUI: `ChatGlassSurface` and opt-in `ChatButtonStyle`; opt-in model,
  attachment and audio controls. Model/tools rows keep their selected lens.
  Anchored panels use the space available above/below the opening control,
  preventing the empty-state model panel from extending below the window.
- Qt: opt-in control lenses, actual ComboBox popup/delegate, and one TextArea
  moved through GridLayout coordinates. Popup ownership is restored after
  preset changes and dismissed when the owning session changes.
- Both toolkits preserve one editor while moving controls below multiline or
  narrow input. A stable hypothetical inline width avoids alternating layouts
  when a long sentence wraps. The five-line cap is retained; Qt measures real
  text-layout rectangles to account for Japanese fallback glyphs.
- The existing semantic `action-active` role is exported by the resource
  generator and both native bundles were regenerated. No palette literal,
  provider service, credential flow or localization copy was introduced.

Used UI UX Pro Max through the native UX adapter, with query
`Liquid Glass controls --domain style -n 1`, and the native migration workflow.
The guidance was adapted to desktop controls and accessibility; web blur and
mobile dimensions were not copied. Source edits are local, without dependency
installation, commit, push or publication. This round's baseline is
`/private/tmp/viezan-chat-glass-baseline/`.

## Verification

- Generated resource parity: passed; 3 locales, 58 metrics.
- Shared Node contract tests: 11/11 passed. Native Python tooling tests: 7/7.
- Final sequential Swift run: 46 native + 59 domain tests passed. New production
  workspace test covers light/dark at 640/820/1200, one editor identity across
  draft shapes/resizes, draft/session/model retention, control geometry and
  long-sentence layout stability. It first reproduced the layout oscillation,
  then passed after the fix. The earlier two unrelated image tests remain
  excluded and unresolved: `composerPasteHandsImagesToTheIntakeInsteadOfTheText`
  and `pastedImageBytesIngestLikeAFileAndRejectNonImages`. This is not an entirely
  green unfiltered suite. Final log: `/private/tmp/viezan-chat-glass-swift-final.log`.
  A separate AppKit regression verifies the focus callback before any typing
  and again on resignation; the empty editor retains its empty undo history.
- Qt build and 28 focused checks passed on macOS, with no new QML warnings.
  Tests cover editor identity, cursor/selection, five-line VI/JA layout,
  model/refresh/record bounds at 640/820/1200, empty-to-active placement,
  raw-ID selection by keyboard and popup ownership across session/preset changes.
  Logs: `qt/final-focused.txt` and `qt/build.log` in the evidence directory.
  Final screenshot review confirms separated controls, five intact mixed-script
  lines at 640, and a selected lens distinct from focus on another model.
- Live macOS: composer and selected model lens inspected; Down shows a keyboard
  outline, Escape closes the panel and restores focus to its model button.
  Final dev bundle reload `8B117610-8C78-414B-981A-02B40E2B31FA` completed;
  direct inspection confirms the empty composer gains its focus outline before
  typing. The app is left on AI Chat with the existing session and draft intact.
  No AI request, recording or model change was performed on the user's session.
- Synthetic evidence is under `/private/tmp/viezan-chat-glass-evidence/`.
  AppKit cache captures omit some composited window material; they are layout
  evidence, not a replacement for live window inspection.
- Default Glass contrast from generated roles, macOS light/dark respectively:
  placeholder 5.65/7.20, selected detail at the brightest face 5.52/5.50,
  selected title 11.92/11.92, primary label 5.23/5.25. The dark face wash was
  reduced to keep secondary labels readable; the thin rim remains brighter.
  These values do not certify every optional accent combination.
- Qt default primary contrast is 5.23 light / 5.54 dark. Existing optional
  accents remain below 4.5 with a white primary label: violet dark 4.45;
  teal/green/amber light 3.74/3.30/3.19. Shared accent values were not changed
  in this scoped pass; those combinations still need a separate token correction.
- Documentation references and `git diff --check` passed.

Qt still uses its existing ComboBox model selection flow; this pass does not
claim full feature parity with the macOS searchable ModelPanel. Windows/Linux
runtime, live IME, VoiceOver, fullscreen and the complete locale/text-size/
system-accessibility matrix remain NOT RUN for this round. User visual
acceptance remains pending.
