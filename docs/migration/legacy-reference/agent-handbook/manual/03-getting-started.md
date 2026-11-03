# 03 — Getting Started

## Prerequisites

- **Node.js 18+** (Electron 41 ships Chromium-based runtime; build tooling assumes Node 18+).
- **npm** (lockfile is committed).
- macOS, Windows or Linux.
- For macOS code-signing/notarization (release only): an Apple Developer ID and `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` env vars used by `scripts/notarize.mjs`.

## Install

```bash
git clone https://github.com/trunghieupham59/Viezan.git
cd Viezan
npm install
```

`postinstall` runs `electron-builder install-app-deps` to compile any native deps for your Electron version (errors are intentionally non-fatal).

## Daily Development

```bash
npm run dev
```

This runs two processes in parallel via `concurrently`:

| Process | Command | Role |
|---|---|---|
| `VITE` | `npm run dev:vite` | Vite dev server on `http://localhost:5173` (Renderer HMR) |
| `ELECTRON` | `npm run dev:electron` | Wait for port 5173, build the main + preload bundles, then start Electron pointing at the dev server |

Internally `dev:electron` runs:

1. `wait-on tcp:5173`
2. `npm run build:electron` — `tsc -p tsconfig.electron.json` + esbuild bundle of `electron/preload.ts` and `electron/subtitle-preload.ts` into `dist-electron/`
3. `electron dist-electron/main.js`

When you change main/preload code you typically need to restart `npm run dev` (only renderer code is HMR-ed).

### Quick Chat window in dev

Quick Chat is a separate `BrowserWindow` whose renderer entry is `quick-chat.html` → `src/quick-chat-main.tsx`. Vite serves it at `/quick-chat.html` in dev. If you change `quick-chat-main.tsx`, HMR works. If you change the window creation logic in `electron/main.ts`, restart `npm run dev`.

### Subtitle overlay in dev

The subtitle overlay loads `public/subtitle.html` (copied to `dist/subtitle.html` in build) with `electron/subtitle-preload.ts`. To iterate visually, open the Live Translate page → enable Subtitle.

## Tests

```bash
npm test                 # Vitest watch UI off
npm run test:ui          # Vitest interactive UI
npm run test:coverage    # Vitest with coverage report
```

Specs live in:

- `src/__tests__/` and `src/**/__tests__/`
- `electron/ipc/__tests__/`

See [`15-testing.md`](./15-testing.md) for what is covered and the `vitest.config.ts` setup.

## Lint / Format

The repo uses **Biome** (`biome.json`) and **markdownlint** (`.markdownlint.json`). Most editors auto-pick this up. There is no top-level `npm run lint` script; lint is wired through the editor and CI.

## Build

```bash
npm run build            # Build both main + preload (TS) and renderer (Vite)
npm run build:mac        # mac DMG + ZIP for arm64 + x64
npm run build:win        # Windows NSIS x64
npm run build:linux      # Linux AppImage x64
npm run dist:mac         # mac arm64 + x64 (no publish)
npm run dist:win         # Windows NSIS x64 (no publish)
npm run release:mac      # build + publish to GitHub Releases
npm run release:win      # build + publish to GitHub Releases
```

Outputs land in `release/`. See [`16-build-release.md`](./16-build-release.md) for the full release pipeline including notarization and updater feed.

## Repo Configuration Files

| File | Purpose |
|---|---|
| `package.json` | Scripts, deps, electron-builder config (`build`) |
| `tsconfig.json` | Renderer TypeScript |
| `tsconfig.electron.json` | Electron main TypeScript |
| `tsconfig.node.json` | Node tooling TypeScript |
| `vite.config.ts` | Renderer build (also handles `quick-chat.html` entry) |
| `vitest.config.ts` | Test runner config (jsdom, setup file) |
| `tailwind.config.mjs`, `postcss.config.mjs` | Tailwind + PostCSS |
| `biome.json` | Lint / format |
| `build/entitlements.mac.plist` | macOS hardened-runtime entitlements (mic, network, JIT) |
| `scripts/notarize.mjs` | electron-builder `afterSign` hook for macOS notarization |
| `scripts/generate-icons.mjs` | Generates platform icons from a single source |

## First-Run Setup as a User

1. Launch Viezan.
2. **Local AI** path: open Settings → Local AI → Discover → benchmark and pick / pull a recommended model.
3. **Cloud** path: open Settings → API Keys → paste a Gemini / Claude / OpenAI key. Keys are encrypted in the OS keychain; the renderer only ever sees `hasKey: boolean`.
4. (Optional) Settings → Browser Extension → copy/regenerate the connection key, install the extension and paste the key into its Options page.

## Quick Smoke Test (after pulling)

```bash
npm install
npm run build:electron      # main + preloads
npm test -- --run           # full Vitest run
npm run dev                 # start the app
```

Then in the app:

- Translate page → paste English → set target Vietnamese → Translate.
- Settings → Local AI → Discover (verifies `local-ai:*` channels work).
- Settings → API Keys → enter a dummy key → Verify (verifies `translate:verify-key` and keychain).
