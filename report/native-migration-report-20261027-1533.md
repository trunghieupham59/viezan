# Native migration continuation

Workflow: native-migration. Rules: native-migration, viezan-product-engineering.
Skills: viezan-native-migration, viezan-native-ux. Latest explicit user instructions
override staged production-retention and build/test gates.

Source changes: fix invalid Qt free-function signal use; attempt-bound re-entrant
worker synchronization; no new provider dispatch after failed persistence; bounded
validated native storage; preserve active/favorite comparison parents during
retention; shared currency fetch across cancelled launcher queries; Windows UI
Automation selection replacement and conditional undo.

Detailed source handoff: docs/migration/native-implementation/native-code-37.md
(relative to repository root). Native UI labels regenerated from EN/VI/JA catalogs.

Evidence: source and nearby tests read; source edits and resource generation only.
Build, tests, Atomic Design/design lint, runtime/UI/OS acceptance: NOT RUN, explicitly
deferred by the user. Windows replacement support is limited to compatible plain
value editors and has not been exercised on Windows. No dependency install,
provider request, external-application edit, user-data migration, commit, push or
release was performed. This report is not a runtime-completion assertion.
