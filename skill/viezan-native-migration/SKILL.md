---
name: viezan-native-migration
description: Plan and implement incremental Viezan desktop migration from Electron to SwiftUI and Qt, including shared-core spikes and data rollback.
---

# viezan-native-migration

Read docs/migration/architecture.md and acceptance.md from repository root. Resolve
viezanagent/agent/native-migration/native-migration.json before work.

1. Inspect dirty state, relevant source/tests and current phase evidence. Inventory
   platform capabilities; distinguish existing runtime from planned behavior.
2. Select one vertical slice. Define request/event/error/ownership/cancellation
   contracts and parity fixtures before changing native implementations.
3. Prototype SwiftUI and Qt against deterministic fake providers. Validate real OS
   builds before committing to Rust bridge design; record alternatives if blocked.
4. Preserve session/provider identity, local-first trust boundary and resource cleanup.
5. Import into isolated storage only; dry-run, transaction, checksum and rollback.
6. Run applicable checks and record OS-specific evidence. Never infer Linux/Windows
   parity from Mac. No background automatic retries that can incur provider charges.

Electron rules continue for src/ and electron/. Native platform controls use native
semantics; do not force React atoms/preload names into Swift/QML. No production
rewrite, toolchain install, release or data migration is implied by a plan-only ask.
Report phase, changed files, actual checks, residual risks and next smallest slice.
