# Native migration — Chat reading implementation 04

Date: 2026-10-27. User request: continue implementation.

Resolved native-migration purpose/workflow, native-migration and product-engineering
rules, project-local native-migration/native-ux skills, and the related sync-docs
workflow/rubric. Reused the component/UI rules, Chat screen spec, Review 18
interaction contract, architecture/adapter ADR, UX04/UX08/UX09 acceptance and
current implementation evidence. Scope is native Chat presentation with fake
providers; domain IDs, snapshot schema, permissions and production Electron
behavior are unchanged.

SwiftUI now keeps selectable AppKit text views per message, appends to text
storage with UTF-16 selection preservation, measures native wrapping, and offers
Back to latest plus Copy response/confirmation. Scroll-phase handling pauses
following for user reading/selection. Qt now reconciles a persistent message model
and updates native TextAreas instead of recreating delegates per snapshot. It
preserves selection and reading position while chunks arrive, and explicitly
clears selection when resuming follow. Labels are EN/VI/JA resources. Runtime
inspection also found and fixed a compressed SwiftUI model picker.

Verified: both native builds; 17 Swift tests (14 domain + three actual AppKit
text-view tests); 25 Qt scenario rows (27 with init/cleanup); nine Node contract
tests; generated resource freshness; focused Biome; both TypeScript targets;
Atomic/Design and manual native metric review. The six new Qt cases cover
VI/EN/JA, wide/640, native identity/selection/contentY after appended chunks,
explicit return to end and switching sessions without stopping background work.
The full README was reviewed, its review record refreshed, and check:docs plus
all 13 documentation tests passed after the implementation/docs changes.

Direct app checks covered long responses, read selection, Back to latest and Copy
confirmation. SwiftUI copied output was pasted into an empty test draft and
matched all 2,564 characters; the test draft was then cleared. Qt output was also
pasted in a separate test conversation before a long fixture. Original sample
drafts were preserved. Screenshots and exact limitations are in
`docs/migration/native-implementation/chat-reading-04.md`.

A SwiftUI automation call timed out during streaming. Read-only process sampling
found an idle event loop at the sampled time; bundle-ID reconnection later showed
completed output. This is not a proved app hang or a performance pass. The full
interactive under-stream stress matrix remains partial. Actual Windows/Linux,
full screen readers, live IME, manual compact/scaling and lifecycle/performance
gates remain NOT RUN. No successful Fable review is available after the earlier
authentication failure.

Full Electron build, broad unit suite and browser tests were not repeated because
Electron changes are catalog additions for native preview only. No dependency
install, force quit, commit, push, release, data import or real provider call.
