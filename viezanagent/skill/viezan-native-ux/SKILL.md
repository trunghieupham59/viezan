---
name: viezan-native-ux
description: Design and review Viezan native multitasking desktop UX, Figma screens and platform-specific acceptance scenarios.
---

# viezan-native-ux

Read docs/migration/workbench-ux.md, acceptance.md and existing affected screen
specs in docs/design/screens/. Treat migration proposals separately from shipped UI.

Choose a real user journey and show content-rich states, not a marketing dashboard.
Keep primary navigation, feature history and background tasks distinct. Maintain
one composer, recoverable drafts, stable task identity and explicit failure paths.

Use available Figma skills before Figma operations; inspect libraries and source
tokens, reuse compatible components, bind semantic variables, use editable layers.
Build only needed states; explicitly mark font substitutions and static controls.
Connect review hotspots and verify targets. Inspect rendered screenshots and repair
overflow before delivery. Never upload user secrets or real private conversations.

For runtime acceptance, test keyboard/IME/screen reader, widths, text scaling,
light/dark and VI/EN/JA, plus concurrent jobs/cancel/recovery. Figma is not proof
of these behaviors. Report Design, Prototype, Runtime and User acceptance separately.
Use docs/migration/acceptance.md IDs in evidence; unrun checks remain NOT RUN.
