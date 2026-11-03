# Liquid Glass shell — 2026-11-02

## Scope and design

User reference: translucent navigation, restrained light edges and rounded glass
controls. This pass updates the macOS Glass shell; reading/composer/history
surfaces retain their existing opaque colors. Mode, preset and accent remain
independent. Qt receives regenerated shared tokens, not a new material renderer.
Windows/Linux visual parity is not claimed.

Source baseline: `cc637ad` plus existing uncommitted sidebar/development work.
Those changes were preserved. No commit, push, dependency install or release.

## Capabilities used

- Agent/workflow: `docs/agents/agent/native-migration/native-migration.json`,
  `docs/agents/workflow/native-migration/native-migration.json`.
- Skills: `viezan-native-ux`, `viezan-native-migration`; documentation sync scoped
  to source-backed README, direction, shell specification and design decisions.
- Rules: `AGENTS.md`, `.claude/rules/ui-ux.md`, native-migration and applicable
  native product-engineering boundaries.
- References: shell specification, `workbench-ux.md`, `acceptance.md`;
  [Apple materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials)
  and [NSGlassEffectView](https://developer.apple.com/documentation/appkit/nsglasseffectview).

## Source

- `NativeFoundation.swift`: Increase Contrast joins Reduce Transparency in the
  opaque shell fallback; a noninteractive navigation edge reuses material tokens.
  Header buttons keep their original native button and focus/AX behavior, with
  a separate `NSGlassEffectView` behind them on macOS 26+. Material updates also
  follow deferred disabling. Opaque fallback flattens hover/press/selection tint.
- `ViezanApp.swift`: Glass header uses behind-window material; only header actions
  opt into glass. Other presets retain their header background and compact buttons.
- `resources/tokens.css`: lower Glass navigation/header tint in light and dark;
  both generated `native.json` bundles refreshed and compared by resource check.
- `LiquidGlassShellTests.swift`: isolated in-memory shell fixtures, with provider
  automation disabled, cover actual header layout, focus, disabled actions and
  material mounting/fallback. No user conversations are fixture data.

The first NSButton glass-bezel implementation compiled but did not visibly draw
its bezel with the custom cell in the live window. The final implementation uses
the separate native material view; live inspection confirmed the visible rim and
depth after rebuilding.

## Verification

Environment: macOS 27.2, arm64, local Xcode SDK. Final source fingerprints are in
`.native-build/liquid-glass-check/source-sha256.txt`.

| Gate | Result and evidence |
| --- | --- |
| Build | PASS. Debug dev build, helper signing and cooperative relaunch completed through the development menu; `.native-build/dev/build.log`, reload state `complete`. |
| Swift | PASS. Full package: native runner reports 43 tests (3 opt-in render tests skipped), domain runner 60 tests. `/tmp/viezan-glass-final-test.log`. |
| Focused material tests | PASS. Chat and Translate at 820/1200, light/dark; button bounds, AX names, focus restoration, disabled activation; same mounted button across material fallback. |
| UX08/UX09 layout | PASS within fixtures only: eight images in `/tmp/viezan-liquid-glass-evidence`. Offscreen images do not prove glass refraction. |
| Shared resources/docs | PASS: `npm run check:resources`, `npm run check:docs`, `git diff --check`; native JS contract tests 11/11. |
| Live macOS | Partial PASS. Exact path `.native-build/dev/Viezan.app`; rebuilt source, light Translate window, visible glass header controls, Activity open/Escape close, navigation collapse/expand with original state restored. CUA evidence is in the task conversation. |
| Design/user acceptance | Pending user review of the first material pass. |
| Live dark/compact, UX07/UX10 | NOT RUN this pass: live dark/true window resize, VI/JA IME, VoiceOver, text-size matrix and OS accessibility-preference propagation. Automated fallback/focus assertions are not substitutes. |
| macOS 15 fallback | Source availability guarded; NOT RUN on macOS 15 hardware/runtime. |
| Windows/Linux, release | NOT RUN: no target host verification or release requested. |

The three optional Swift render tests require separate evidence environment
variables and were not enabled; the new targeted eight-image capture was enabled.
No system appearance/accessibility preferences were changed for verification.

The initial app lookup by display name selected `/Applications/Viezan.app`.
After the user flagged this, all subsequent UI work used the absolute dev path.
The installed app's data was not edited.
