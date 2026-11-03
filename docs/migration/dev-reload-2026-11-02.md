# macOS development reload — 2026-11-02

Base: `develop` at `242aafa`. Evidence covers uncommitted changes in this checkout.

## Scope and contracts

- `npm run dev` builds the macOS Debug bundle at `.native-build/dev/Viezan.app`.
- Debug-only Development menu: Command-Shift-R builds, saves and relaunches;
  the command is disabled while running. A process lock also rejects concurrent CLI builds.
- The worker regenerates changed resources, reuses `dev/swift`, stages and verifies
  the signed bundle before asking the app to quit. Workspace saving is checked
  before build and again before normal app termination. Failed saving, a busy
  performance benchmark or a refused quit prevents bundle replacement.
- A request ID distinguishes the current worker's ready signal from stale files.
  The worker waits up to 30 seconds for the requesting PID to exit and never kills it.
- Successful builds rotate current → previous. Failed launches restore the old
  bundle. `open -n` avoids LaunchServices trying to reactivate the just-exited PID.
- Compiler failures retain the running app and show a localized error with a log action.
- Existing numbered dev bundles are untouched. Qt keeps its existing build entrypoint.
- Active requests/audio stop through normal shutdown; recovery does not replay them.
  Uncommitted IME composition blocks the reload action. The ready-to-restart
  poll checks composition again, so input begun during the build defers saving
  and quitting until it is committed. The worker timeout leaves the current app
  intact if input never finishes. This is not in-process hot reload.

## Verification

| Gate | Evidence |
| --- | --- |
| Python runner | 7 tests passed: build failure, lock/log preservation, quit refusal/timeout, ready ordering, bundle rotation/cache retention, launch rollback. |
| Swift tests | 39 native tests + 60 domain tests passed. |
| Shared domain | 11 tests passed. |
| Resource/docs/agent | `check:resources`, `check:docs`, `check:agent` passed. Both generated native catalogs reviewed: only six new keys in each locale. |
| Incremental resources | Running generation with unchanged inputs preserved mtimes for both catalogs and Qt brand asset. |
| Debug | Built and signature verified; live Development menu and disabled rebuilding state observed. |
| Release | `swift build --package-path apps/macos --configuration release --product ViezanNative` passed; `nm` showed no DevelopmentReload symbols. Build metadata injection is only requested by the Debug dev runner. |
| Live successful reload | Hotkey changed PID and returned to the same Chat/session/model with an unsent Vietnamese/Japanese test draft intact. No AI submission made. |
| Live failure | A temporary `#error` source forced compiler failure. PID stayed 11226, error sheet appeared, draft/window remained. Probe then removed. |
| Live retry | After removing the probe, the same hotkey rebuilt and relaunched successfully. Test draft cleared and Home restored. |
| Launch failure | First live attempt hit LaunchServices -600; old bundle was restored and reopened. Fixed with `open -n`; subsequent attempts completed. |
| Performance | A no-source-change Swift build reported 0.29 seconds; this excludes helper compilation, signing and relaunch. No total-time guarantee. |

Existing Swift warnings remain (deprecated APIs, capture/sendability, trailing closures).
No version bump, commit, push, dependency install or release was performed.

## Coverage boundaries

Live checks used the current macOS/Vietnamese desktop configuration. Other window
sizes, theme variants, VoiceOver, active VI/JA IME composition, active audio/AI tasks,
and Windows/Linux runtime were **Not run**: this change adds a macOS developer menu
and build lifecycle, not a new product screen. Unicode draft recovery was tested;
that does not count as live IME acceptance. User review remains pending.

## Capability coverage

Applied `ship-viezan-feature` with `viezan-feature-planner`, product-engineering
and generate-code rules; scoped i18n coverage and docs-sync checks. Native ownership,
normal shutdown and credential/signing boundaries were preserved. Provider, extension,
live translation and release publication workflows were **Not run** because those
implementations were not changed. Legacy renderer-specific workflow commands were
mapped to the native checks in CONTRIBUTING.md.
