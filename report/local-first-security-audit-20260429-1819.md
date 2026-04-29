# Local-First Security Audit — Phase 2 Local AI

## Findings

- No Critical or High findings.
- Renderer boundary is intact: no Electron, `fs`, `path`, `child_process`, or `os` imports were found under `src/`.
- Local AI network calls are owned by Electron Main Process in `electron/ipc/localAi.ts`; renderer only invokes `local-ai:discover` through preload.
- Benchmark, runtime install, install cancellation, and direct model download stay behind preload/IPC: `local-ai:benchmark`, `local-ai:installOllama`, `local-ai:cancelInstallOllama`, and `local-ai:downloadModel`.
- Local provider uses the placeholder key `local-ai` only for OpenAI-compatible local APIs; no raw API key is exposed to renderer.
- Direct model download is limited to curated model IDs and Ollama's loopback `/api/pull` endpoint.
- Direct Ollama install uses one fixed Main Process command (`curl -fsSL https://ollama.com/install.sh | sh`); renderer code does not provide shell input, command text, or arguments.
- Install progress is emitted from Main Process over `local-ai:installProgress`; cancellation only terminates the tracked installer process group.
- Potential secret search hits are documentation examples or provider key-prefix metadata, not committed live secrets.

## Security Boundary Verdict

Pass for Phase 2 scope.

- Cloud BYOK providers still use keychain-backed storage.
- Local provider does not require or persist an API key.
- User prompt/image/chat data for local AI is sent only to detected localhost runtimes.
- Runtime detection is restricted to loopback OpenAI-compatible endpoints.
- Runtime installation is limited to Ollama on macOS/Linux through a fixed allowlisted command; Windows returns a recoverable unsupported result for now.
- Benchmarking does not download models or call the network beyond loopback runtime probes; the synthetic CPU/RAM benchmark runs in Main Process and the optional runtime benchmark sends only a short fixed prompt to the local runtime.
- Model download does not receive user prompt/history data; it sends only the selected curated model name to Ollama on loopback.

## Required Fixes

None blocking.

Follow-up candidates:

- Add byte-accurate download progress later if the selected runtime installer exposes reliable transfer totals.
- Consider a manual endpoint override later for advanced users who run local inference on a non-default port.
- Consider progress streaming for long model downloads after the baseline pull flow is stable.

## Verification

Commands run:

```bash
npm test -- --run electron/ipc/__tests__/providers.test.ts electron/ipc/__tests__/localAi.test.ts src/store/__tests__/settingsSlice.test.ts
npm run build:electron
npm test -- --run
npm run build
```

Static searches run:

```bash
rg -n "from ['\"]electron['\"]|require\(['\"]electron['\"]\)|from ['\"](fs|path|child_process|os)['\"]" src
rg -n "safeStorage|encryptString|decryptString|localStorage|partialize" electron src
rg -n "fetch\(|WebSocket|new WebSocket|axios|telemetry|analytics|localhost|127\.0\.0\.1" electron src chrome-extension
rg -n "contextBridge|ipcMain\.handle|ipcRenderer\.invoke|local-ai|discoverLocalAi" electron src
rg -n "sk-[A-Za-z0-9]|AIza[0-9A-Za-z_-]|ANTHROPIC_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY" .
rg -n "openExternal|will-navigate|setWindowOpenHandler|allowlist|allowed" electron
```
