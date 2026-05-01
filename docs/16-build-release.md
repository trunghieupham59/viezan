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
| `npm run release:mac` | build + publish to GitHub Releases (mac arm64+x64) |
| `npm run release:win` | build + publish to GitHub Releases (win x64) |

## Pre-Build Steps

`npm run build:electron` runs:

1. `tsc -p tsconfig.electron.json` — compiles `electron/**/*.ts` to `dist-electron/`.
2. `npm run bundle:preloads` — esbuild bundles `electron/preload.ts` and `electron/subtitle-preload.ts` to single files in `dist-electron/`.

`vite build` then writes the renderer + Quick Chat bundles to `dist/`.

## Notarization (macOS)

`scripts/notarize.mjs` is the `afterSign` hook. It:

1. Reads `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` from env.
2. Calls `@electron/notarize` to submit the signed `.app`.
3. Staples the ticket on success.

If env vars are missing the script logs a warning and exits 0 — local `dist:mac` builds still produce installers, but they are **not** notarized and Gatekeeper will flag them on first run. The README documents `xattr -dr com.apple.quarantine /Applications/Viezan.app` as the manual workaround for end users running unsigned builds.

## Release Flow (GitHub Actions)

The recommended flow:

1. Bump `version` in `package.json` and update `CHANGELOG`/README "What's New".
2. Run `npm test -- --run` and the `release-readiness` workflow.
3. Tag the commit (`git tag v2.0.x && git push --tags`).
4. CI matrix runs:
   - `macos-15` arm64 → `npm run release:mac` (Apple sign + notarize).
   - `macos-15-intel` → `npm run release:mac` (x64 slice).
   - `windows-latest` → `npm run release:win`.
   - Linux runner → `npm run build:linux` + manual upload of the AppImage.
   - Chrome Extension job → packs `chrome-extension/` and uploads as a release asset.
5. The published GitHub Release feeds `electron-updater` automatically.

## Auto-Update Channel

- Provider: `github` (see `package.json → build.publish`).
- Channel: `latest` by default. To ship a beta, set the `releaseType` to `prerelease` and tag with `-beta.N`.
- The renderer surfaces updater state via `electron/ipc/updater.ts` events. See [`05-ipc-reference.md`](./05-ipc-reference.md#updater-electronipcupdaterts).

## Code-Signing Reference

| Platform | Status | Where the secret comes from |
|---|---|---|
| macOS | Required for shipping (notarization-friendly) | Apple Developer ID Application certificate; `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` envs |
| Windows | Optional today (project ships unsigned) | If using SignPath, see `build/signpath-artifact-config.xml`. Future Authenticode certs go through electron-builder env (`CSC_LINK`, `CSC_KEY_PASSWORD`) |
| Linux | Not required | — |

## Smoke Checklist Before Tagging A Release

Use the `release-readiness` workflow for the full list. Quick subset:

- [ ] `npm install` clean — no peer warnings introduced.
- [ ] `npm test -- --run` green.
- [ ] `npm run build` succeeds locally on macOS, Windows or Linux (whichever you're on).
- [ ] App opens, Translate works (cloud + local), Live works (mic permission), Chat streams, Subtitle window appears + closes cleanly, Auto-update check works against the previous tag.
- [ ] Chrome Extension connects to the new build, translates, handles "offline" state when the desktop app is closed.
- [ ] README "What's New" + screenshots updated.
- [ ] No new secret in the bundle (run `check-dup-hardcode` workflow).
- [ ] No new privacy regression (run `audit-local-first-security` workflow).

## Known Issues / Notes

- **macOS Skia/Metal flicker** — mitigated by `--disable-features=UseSkiaRenderer` in `main.ts`. Re-test if upgrading Electron.
- **Windows audio device hot-swap** — Live Translate needs the user to restart capture if they change devices mid-session.
- **Linux libsecret** — required for `safeStorage`. We document this and surface a clear error when missing (see [`13-security.md`](./13-security.md)).
