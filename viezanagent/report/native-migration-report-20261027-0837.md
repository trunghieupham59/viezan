# Native migration — foundation continuation

Phase: foundation, IN PROGRESS; Home remains gated. Base HEAD 8aa4311 plus dirty
source. Preserved pre-existing work; no stage/commit/push/install/release.

Workflow: native-migration and scoped sync-docs. Rules: native-migration,
viezan-product-engineering, project AGENTS/UI rules. Skills: viezan-native-migration,
viezan-native-ux, viezan-doc-sync and scoped viezan-i18n-audit (native locale parity).

Implemented Swift toolbar/focus/commands and Qt navigation/commands/menu/overlays,
resource embedding, backward-compatible preference tests, responsive library and
Settings behavior. See docs/migration/native-implementation/foundation-05.md for
exact source manifest, retained test logs, CUA observations and screenshots.

Verified: Swift 22 tests; Node 10; Qt 49 scenarios (51 passes), with 24 EN/VI/JA ×
width × mode cases; resource freshness; Biome; both TS noEmit projects; Atomic;
Design; manual native token audit; docs sync/review/check and 13 docs tests.

Runtime partial: compact on-screen Swift/Qt, palette accent-insensitive search,
Return/Escape, New focus, Mac Close/reopen, normal Quit/relaunch, Japanese/dark
Swift palette, localized AX toolbar labels. Full visual/input-source/screen-reader,
system live/Reduce Transparency/Motion and UI storage failure acceptance Not run.
Windows/Linux/DPI/Wayland Blocked by unavailable target hosts. Cross-model review
Not run: prior authentication remains unverified, no new submission. Electron
full test/build/web Not run: native preview scope, shared inputs checked separately.

Next: close the remaining F01–F08 runtime matrix before requesting foundation user
acceptance. Do not begin Home or present this build/test result as completed migration.
