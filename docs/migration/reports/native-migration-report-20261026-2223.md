# Native migration — implementation 01

Date: 2026-10-26. Purpose/workflow: native-migration. User request: tiến hành implement.

## Scope and outcome

Implemented the first Review 18 slice alongside Electron: SwiftUI/AppKit macOS
shell, Chat, text Translation, history and Activity with isolated session state,
fake streaming providers and atomic preview persistence. Added Qt Quick/QML and
C++ source plus a pure reducer for the same contract. No real provider, migration
of user data, mobile work, dependency installation, commit, push or release.

macOS build and direct UI interaction passed for the documented scenarios. Qt
build/runtime is NOT RUN because Qt/CMake are absent. Dependency installation
permission was requested under AGENTS.md Change Safety; no response has been
received. Windows/Linux acceptance remains blocked independently of macOS.

## Artifacts

- `apps/macos/`: runnable Swift package and native UI/domain tests.
- `apps/desktop-qt/`: Qt application source and reducer; build unverified.
- `contracts/native-workbench/`: state contract and shared fixtures.
- `scripts/native/`: one-way resources, app packaging and reducer tests.
- `docs/migration/native-implementation/`: build guide, ADR and verification evidence.
- EN/VI/JA locale additions and README native-preview section/review record.

## Verification

11 Swift tests and 7 Node contract tests passed. Native UI checks include send,
restart recovery, independent model/draft state, language invalidation, quick
history and full library, failure/retry. A discovered empty-query history bug was
fixed and covered by a regression test. Coalesced disk writes avoid serializing
an entire workspace on every streamed character. Build and test use no external
Swift dependencies.

Renderer/Electron TypeScript checks, changed-file Biome, Atomic Design, design
contracts, generated native-resource freshness, docs freshness and docs tests
passed. Existing Electron UI/behavior is unchanged; broad Electron build and
web-preview tests were not run. Existing dirty AGENTS.md and viezanagent changes
were preserved.

See `docs/migration/native-implementation/verification.md` for exact remaining
gates: Qt compilation/real hosts, 640-point geometry, IME/accessibility, appearance
preferences, lifecycle/stress and full feature parity. The native preview is not
release-ready. Fable 5.1 cross-review remains unavailable after its API-key error;
none of this work is presented as a Claude review result.
