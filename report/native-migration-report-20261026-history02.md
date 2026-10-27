# Native migration — history implementation 02

Date: 2026-10-26. User request: continue implementation according to the design.

Resolved the native-migration purpose and capability contract, native-migration
workflow, native-migration/product-engineering rules, and project-local
viezan-native-migration and viezan-native-ux skills. Read the UI/UX rules,
component contract, Review 18 handoff, architecture, UX and acceptance documents.
Used sync-docs to reconcile the native preview guide and README with this change.

Implemented keyboard quick history and read-only full-history previews in
SwiftUI/AppKit and Qt Quick. Current and previewed sessions are separate; drafts
appear in preview, and only explicit Open changes the active session. Empty
search results invalidate preview selection. Localized labels use existing
EN/VI/JA sources and generated native resources.

Runtime checks found and fixed SwiftUI Escape clearing search instead of closing
the popover, and an overcompressed Qt library list. Built both native apps;
11 Swift tests, 12 Qt scenarios (14 with init/cleanup), seven Node contract tests,
resource parity, focused Biome, both TypeScript checks and Atomic/Design checks
passed. Native metrics were reviewed manually. Direct app checks verified
multi-result keyboard opening, preview isolation, Back/draft preservation, and
SwiftUI explicit Open restoring the previewed session and draft.
Reviewed the complete README, refreshed its review record, and passed check:docs
plus all 13 documentation tests. Generated native resources and whitespace checks
also passed after documentation synchronization.

Evidence and remaining gates:
`docs/migration/native-implementation/history-02.md` and `verification.md`.
Qt compact geometry is tested offscreen; full manual 640-point, Windows/Linux,
screen-reader and live IME acceptance remain pending. SwiftUI library initial
search focus and toolbar focus restoration are not yet confirmed. No successful
Fable review exists after the prior authentication failure.

Electron behavior did not change; full Electron build, broad tests and web tests
were not repeated. No install, commit, push, release or data migration was done.
