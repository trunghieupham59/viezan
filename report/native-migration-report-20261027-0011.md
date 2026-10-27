# Native migration — settings implementation 03

Date: 2026-10-27. User request: continue implementation according to the design.

Resolved native-migration purpose/CAPABILITY_CONTRACT, native-migration workflow,
native-migration and product-engineering rules, project-local native-migration
and native-ux skills. Read the UI/UX rules, component contract, Settings screen
spec, Review 18 handoff, architecture, native UX/acceptance and adapter ADR.
Used scoped sync-docs and its doc-sync/i18n rubric for the affected catalogs,
contract, native guides and README. Existing Electron screen semantics remain
separate from proposed/native preview behavior.

Built General/Appearance/About as a native settings workspace on SwiftUI and Qt.
Added localized row search, section navigation, compact menu, current-section
state, Light/Dark/System and content size with immediate preview. Preferences
use the existing atomic isolated snapshot, optional v1 defaults and validated
values. Changes preserve session/task identity, drafts and provider/model IDs.
Resources derive text scales from canonical tokens and share section metadata.
Added native Preferences shortcuts; SwiftUI New now returns to its newly created
work instead of leaving it hidden behind Settings.

Verified: both native builds; 14 Swift tests; 19 Qt scenario rows (21 with
init/cleanup); nine Node contract tests; resource freshness; focused Biome;
renderer/Electron TypeScript; Atomic/Design and manual native value review.
Actual app checks covered Light/Dark, large/default content, accent-insensitive
search and no results, preserved Chat draft, Preferences shortcuts and normal
quit/relaunch preference recovery. Review preferences restored afterward.
Reviewed the complete README and refreshed its review record after source edits;
check:docs and all 13 documentation tests passed. Markdownlint was invoked, but
the repository disables its rules, so that result provides no lint assurance.

Evidence, exact acceptance scope and NOT RUN gates:
`docs/migration/native-implementation/settings-03.md` and `verification.md`.
Windows/Linux, live IME, full accessibility and manual compact acceptance remain
NOT RUN; Qt compact geometry is automated host evidence only. Fable is still
unavailable after the earlier authentication failure. Full Electron build and
broad/web tests were not repeated because only native runtime behavior changed;
the Electron changes are native-preview catalog additions. No install, commit,
push, release, real provider call or Electron data migration was performed.
