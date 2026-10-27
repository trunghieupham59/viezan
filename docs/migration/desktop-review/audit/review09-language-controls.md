# Language selector UX audit — 2026-10-26

Scope: browser prototype only. Current-run screenshots 36–38; no product edits.

1. Dictionary, Japanese input / Vietnamese output: controls clearly labeled,
   focus visible, Tab moves from input select to swap. Existing English result
   remains visually dominant; small stale-result note is insufficient. No visible
   lookup CTA explains the next action. Recommend a single lookup region with
   source/swap/target above input + Tra cứu, and a clear prior-result state.
2. Interpretation, English input / Japanese output while listening: feature
   settings are independent. Prior English/Vietnamese transcript is preserved.
   No timestamped language-change event or new sample segment demonstrates the
   transition. Recommend a change marker at the transcript boundary and a realistic
   fixture segment in the newly selected pair; never imply real audio processing.
3. Compact preview (640px): selectors fit without visible horizontal overflow.
   Toolbar wraps; headings, explanatory text, selectors and two rows of actions
   push transcript down substantially. Recommend a shorter contextual heading,
   concise Input/Output labels and grouping language/audio as session controls.

Across screenshots: native selects are keyboard focusable and named, swap has an
accessible name. Swap uses a small text glyph rather than the shared icon family.
Use a library swap SVG at the normal icon size. Helper text is visually low emphasis;
contrast has not been measured. Dynamic helper currently has no live-status role
(language-pair.js inspection); verify announcement with VoiceOver after revision.

Prototype limitations are currently repeated inside product guidance. Move the
prototype limitation to review chrome; keep actionable stale-result/next-segment
messages in the app. Only six fixture languages exist; full provider language
availability, search, recent choices, locale variants and native runtime remain
outside this audit.

Verdict: controls pass basic interaction, design acceptance pending. Priority:
P1 stale result/next action clarity; P1 demonstrable live-switch boundary;
P2 vertical density and visual consistency. No implementation changed by audit.
