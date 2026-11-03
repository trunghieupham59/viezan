# 16 — Build & Release

Viezan ships as native installers via **electron-builder 26**, with auto-update served from **GitHub Releases**. The Chrome Extension is published alongside.

## Build Artifacts

The `build` block of `package.json` is the source of truth. Highlights:

- `appId`: `com.Viezan.app`
- `productName`: `Viezan`
- `artifactName`: `Viezan-${version}-${arch}.${ext}`
- `asar: true`, `compression: 'maximum'`
- `asarUnpack`: `**/*.wasm` and `**/*.onnx` (so the Silero VAD ONNX model and ort-wasm files are loadable at runtime).
- `directories.output`: `release/`
- `files`: `dist/**/*` and `dist-electron/**/*`.

### macOS

- Targets: **DMG** + **ZIP** for `arm64` and `x64`.
- `hardenedRuntime: true`, custom entitlements at `build/entitlements.mac.plist` (microphone, system events, JIT, etc.).
- `notarize: false` is set in JSON because notarization is performed by the `afterSign` hook (`scripts/notarize.mjs`), so electron-builder doesn't try to do it twice.
- Default Apple Developer signing requires `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` (and `APPLE_TEAM_ID` if multiple teams) at release time.

### Windows

- Target: **NSIS** (`oneClick: false`, allow change install dir, desktop + start menu shortcuts).
- `requestedExecutionLevel: asInvoker` (no admin elevation needed).
- `verifyUpdateCodeSignature: false` because the project ships unsigned Windows builds today. If you add a code signing certificate, set this back to `true`.
- Optional SignPath integration via `build/signpath-artifact-config.xml`.

### Linux

- Target: **AppImage** for x64.

### GitHub Publishing

```json
"publish": [{ "provider": "github", "releaseType": "release" }]
```

`electron-updater` consumes this feed in production.

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | `build:electron` (TS + esbuild preloads) + `vite build` |
| `npm run build:mac` | full build + `electron-builder --mac` |
| `npm run build:win` | full build + `electron-builder --win` |
| `npm run build:linux` | full build + `electron-builder --linux` |
| `npm run dist:mac` | build + `electron-builder --mac --arm64 --x64` (no publish) |
| `npm run dist:win` | build + `electron-builder --win nsis --x64` (no publish) |
| `npm run release:mac` | check docs + build + publish to GitHub Releases (mac arm64+x64) |
| `npm run release:win` | check docs + build + publish to GitHub Releases (win x64) |
| `npm run docs:sync` | regenerate bounded README facts from source |
| `npm run docs:review -- --summary "..."` | record a completed source-to-README review |
| `npm run check:docs` | verify facts, version/lock, page links, notes and review freshness |
| `npm run test:docs` | run isolated regression tests for the documentation guard |

## Pre-Build Steps

`npm run build:electron` runs:

1. `npm run build:native` — builds platform native helpers where supported.
2. `tsc -p tsconfig.electron.json` — compiles `electron/**/*.ts` to `dist-electron/`.
3. `npm run bundle:preloads` — esbuild bundles main, subtitle and update-notification preloads to single files in `dist-electron/`.

`vite build` then writes the renderer + Quick Chat bundles to `dist/`.

## Notarization (macOS)

`scripts/notarize.mjs` is the `afterSign` hook. It:

1. Reads `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` from env.
2. Calls `@electron/notarize` to submit the signed `.app`.
3. Staples the ticket on success.

If env vars are missing the script logs a warning and exits 0 — local `dist:mac` builds still produce installers, but they are **not** notarized and Gatekeeper will flag them on first run. The README documents `xattr -dr com.apple.quarantine /Applications/Viezan.app` as the manual workaround for end users running unsigned builds.

## Release Flow (GitHub Actions)

The recommended flow:

1. Review changes since the previous release against the actual source and tests.
   Update README features, setup and platform limitations through `sync-docs`.
2. Bump `version` in `package.json` and both root versions in `package-lock.json`.
   Add a curated `## [X.Y.Z]` changelog entry with features, fixes and limitations;
   move applicable items out of `Unreleased`.
3. Run `npm run docs:sync`, read the complete README, then record the review with
   `npm run docs:review -- --summary "Describe the source and limitations reviewed"`.
   Include the review record in the same commit as the reviewed source/docs.
4. Run `npm run check:docs`, `npm run test:docs` and the required `release-readiness`
   gates (including application tests/build and product smoke tests).
5. When the version change is pushed to `develop`, `auto-tag.yml` checks docs
   before creating the tag and dispatching `release.yml`. Manual `vX.Y.Z` tag
   pushes use the same release gate. A branch dispatch or tag/package mismatch fails.
6. Before creating the public release, `release.yml` checks the reviewed snapshot
   and extracts the exact version entry from `CHANGELOG.md`. All platform packaging
   and extension-upload jobs depend on that gate. CI never rewrites package versions.
7. The matrix builds macOS arm64/x64, Windows x64 and Linux AppImage, and uploads
   the Chrome extension ZIP. Current macOS jobs disable automatic identity discovery;
   do not infer notarization from a successful build.
8. Published release assets feed `electron-updater`.

### What the documentation gate proves

The dependency-free Node checker validates generated README facts, root package/lock
versions, links to every routed feature page, local README paths and a non-placeholder
changelog entry for the package version. `.github/readme-review.json` binds a review
summary to that version, README, changelog and product-source fingerprint.

The fingerprint covers source text under `src/`, `electron/`, `shared/`, `native/`
and `chrome-extension/`, plus `package.json` and `package-lock.json`. It includes
new source files, ignores tests/mocks/fixtures and generated build/binary directories,
and normalizes CRLF line endings. It does not certify screenshots, runtime behavior,
external services or arbitrary files outside those roots.

After a product-source edit, review the changed behavior again. Internal-only fixes
may leave README prose unchanged if the summary explains why. `docs:sync` never
refreshes the review record, and CI must never run `docs:review`. A matching hash
proves freshness of a recorded review, not correctness of its conclusions.

The independent `Documentation / README freshness` workflow runs on PRs and pushes,
including docs-only and version-only changes. Repository branch protection can require
that check; adding the workflow does not itself change branch protection settings.

## Auto-Update Channel

- Provider: `github` (see `package.json → build.publish`).
- Channel: `latest` by default. To ship a beta, set the `releaseType` to `prerelease` and tag with `-beta.N`.
- The renderer surfaces updater state via `electron/ipc/updater.ts` events. See [`05-ipc-reference.md`](./05-ipc-reference.md#updater-electronipcupdaterts).

## Code-Signing Reference

| Platform | Status | Where the secret comes from |
|---|---|---|
| macOS | Current CI disables automatic signing identity discovery; signed/notarized builds need explicit setup | Apple Developer ID Application certificate; `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` envs |
| Windows | Optional today (project ships unsigned) | If using SignPath, see `build/signpath-artifact-config.xml`. Future Authenticode certs go through electron-builder env (`CSC_LINK`, `CSC_KEY_PASSWORD`) |
| Linux | Not required | — |

## Smoke Checklist Before Tagging A Release

Use the `release-readiness` workflow for the full list. Quick subset:

- [ ] `npm install` clean — no peer warnings introduced.
- [ ] `npm test -- --run` green.
- [ ] `npm run build` succeeds locally on macOS, Windows or Linux (whichever you're on).
- [ ] App opens, Translate works (cloud + local), Live works (mic permission), Chat streams, Subtitle window appears + closes cleanly, Auto-update check works against the previous tag.
- [ ] Chrome Extension connects to the new build, translates, handles "offline" state when the desktop app is closed.
- [ ] README feature/setup/limitation review is current; `check:docs` and `test:docs` pass; changelog covers the version; screenshots reviewed where UI changed.
- [ ] No new secret in the bundle (run `check-dup-hardcode` workflow).
- [ ] No new privacy regression (run `audit-local-first-security` workflow).

## Known Issues / Notes

- **macOS Skia/Metal flicker** — mitigated by `--disable-features=UseSkiaRenderer` in `main.ts`. Re-test if upgrading Electron.
- **Windows audio device hot-swap** — Live Translate needs the user to restart capture if they change devices mid-session.
- **Linux libsecret** — required for `safeStorage`. We document this and surface a clear error when missing (see [`13-security.md`](./13-security.md)).
