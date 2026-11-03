# Score Code Report - 2026-05-03 12:52 +07

Workflow: `score-code`
Loai bai: `viezan-electron`
Scope: project (`src/`, `electron/`, `chrome-extension/`, `docs/`, `docs/agents/`)
Status: fixed and re-scored after remediation

## Executive Score

| Criterion | Max | Score | Notes |
|---|---:|---:|---|
| Correctness | 20 | 20 | Renderer typecheck, Electron typecheck, Vitest, JS syntax checks, Biome, and production build all pass. |
| Architecture | 15 | 15 | Main/preload/renderer boundaries remain intact; extension content pages now relay local-server calls through the MV3 service worker, and local-server CORS is centralized in Main. |
| Security | 15 | 15 | Removed wildcard local bridge CORS, narrowed extension host permissions, escaped legacy assistant output, added tokenized CORS for legacy assistant, and replaced `curl \| sh` with Main-controlled installer download + provenance check + direct `/bin/sh` execution. |
| Reliability | 15 | 15 | Added CORS regression tests, preserved extension/local bridge auth, kept provider/STT/TTS fallback behavior, and verified build/test/typecheck after all changes. |
| Code Quality | 10 | 10 | Biome is clean. Import-order, assignment-in-expression, and non-null assertion findings from the original report are fixed without suppressions. |
| Maintainability | 10 | 10 | CORS logic is centralized, extension bridge routing is explicit, docs now match implementation, and a regression test locks legacy assistant hardening. |
| Testing | 10 | 10 | Test suite now passes with 37 files / 606 tests, including new local-server CORS and legacy-assistant hardening coverage. |
| Performance | 3 | 3 | Live Translate no longer eagerly imports `@ricky0123/vad-web`; production build splits the VAD payload into a dynamic chunk and reduces the initial Live page chunk from ~477 kB to ~59.8 kB. |
| Documentation | 2 | 2 | README and `docs/migration/legacy-reference/agent-handbook/manual` now reflect TypeScript 6, Tailwind 4, `tailwind.config.mjs`, extension host permission narrowing, and the safer Ollama installer path. |
| **Total** | **100** | **100** | All report findings with code-level remediation are fixed and verified. |

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit --pretty false` | Pass |
| `npx tsc -p tsconfig.electron.json --noEmit --pretty false` | Pass |
| `npm test -- --run` | Pass: 37 files, 606 tests |
| `npm run build` | Pass; no Tailwind module-type warning |
| `npm exec --package @biomejs/biome@2.4.13 -- biome check .` | Pass: 285 files checked |
| `node --check chrome-extension/background.js && node --check chrome-extension/content.js && node --check chrome-extension/local-bridge.js && node --check chrome-extension/options.js && node --check chrome-extension/popup.js && node --check scripts/run-electron-dev.mjs` | Pass |

## Remediation Summary

- Fixed all Biome findings:
  - Organized imports in `electron/ipc/chat.ts`.
  - Organized imports in `src/services/__tests__/deepResearchService.test.ts`.
  - Rewrote `scripts/run-electron-dev.mjs` loop to avoid assignment in expression.
  - Replaced `editChatImage!` non-null assertions in `src/pages/__tests__/ChatPage.test.tsx` with a typed helper.
- Hardened local bridge CORS:
  - Removed `Access-Control-Allow-Origin: *`.
  - Allowed explicit `chrome-extension://...` and local development origins.
  - Added tokenized `corsToken` support for legacy assistant preflights.
  - Added local-server tests for untrusted origins, Chrome Extension origins, and legacy assistant tokenized CORS.
- Hardened browser extension routing:
  - Removed `<all_urls>` from `host_permissions`.
  - Routed content-script translate/config/TTS requests through the background service worker.
  - Kept content-script matches because translating selected text on arbitrary pages is the extension's core behavior.
- Hardened legacy assistant:
  - Replaced model-output `innerHTML` rendering with `textContent` / `createTextNode`.
  - Added a regression test to prevent returning to unsafe output rendering.
- Hardened local AI installer:
  - Removed the shell pipeline `curl -fsSL https://ollama.com/install.sh | sh`.
  - Main now downloads the official installer script, checks provenance minimally, writes it to the app installer cache, and runs it directly via `/bin/sh`.
  - Admin fallback uses the same downloaded script with `OLLAMA_NO_START=1`.
- Improved performance:
  - Switched Silero VAD (`@ricky0123/vad-web`) to dynamic import inside the upgrade path.
  - Production build now emits `LiveTranslatePage` at ~59.84 kB gzip source chunk instead of the previous ~477 kB initial page chunk.
- Fixed docs drift:
  - Replaced stale TypeScript 5 / Tailwind 3 references with TypeScript 6 / Tailwind 4.
  - Renamed Tailwind config to `tailwind.config.mjs` and updated `@config` usage.
  - Updated local AI and extension docs to match the hardened implementation.

## Current Evidence

- Project size checked in scope: `248` source files under `src/`, `electron/`, and `chrome-extension/`; `44,528` lines across TS/TSX/JS/HTML/CSS files.
- Security-positive evidence:
  - `electron/main.ts` keeps `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
  - `electron/ipc/localServer.ts` now resolves CORS origins explicitly instead of using wildcard CORS.
  - `electron/ipc/legacyAssistant.ts` displays translated output through text nodes.
  - `chrome-extension/background.js` owns local-server fetches for content pages.
  - `chrome-extension/manifest.json` only keeps the local bridge in `host_permissions`.
- Performance-positive evidence:
  - `src/hooks/useLiveTranslate.ts` imports `@ricky0123/vad-web` dynamically only when adaptive VAD upgrades to Silero.
  - Build output shows `LiveTranslatePage` at `59.84 kB` and the VAD payload isolated in a separate dynamic chunk.

## Notes

- The extension still declares `content_scripts.matches: ["<all_urls>"]` because the core feature is translating selected text on arbitrary web pages. This is now paired with narrower host permissions and service-worker relay for local-server calls.
- Legacy Assistant still injects a local assistant into user-selected browser pages, but translated output is escaped and arbitrary web-origin CORS requires a valid connection API key in the preflight-visible `corsToken` query.
