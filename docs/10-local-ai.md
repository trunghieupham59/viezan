# 10 — Local AI

Viezan ships a fully offline AI experience by routing the `local` provider to OpenAI-compatible runtimes the user already has on `127.0.0.1`. No keys, no relay, no telemetry.

This page describes the runtime detection, hardware benchmarking, model recommendation and Ollama install/pull flow. The implementation lives in **`electron/ipc/localAi.ts`** plus the SDK adapter in **`electron/ipc/translateProviderLocal.ts`**.

For the broader provider/registry pattern, see [`09-providers.md`](./09-providers.md). For an actionable phase-2 task list, see [`phase_2/local-ai-agent-tasks.md`](./phase_2/local-ai-agent-tasks.md).

## Supported Runtimes

| Runtime | Default endpoint | Detected by |
|---|---|---|
| **Ollama** | `http://127.0.0.1:11434/v1` | `GET /api/tags` (native) and `GET /v1/models` |
| **LM Studio** | `http://127.0.0.1:1234/v1` | `GET /v1/models` |
| **llama.cpp** | `http://127.0.0.1:8080/v1` | `GET /v1/models` |

All three speak the OpenAI-compatible `chat.completions` and `completions` API surface, which is why a single adapter (`translateProviderLocal.ts`) is enough.

## Discovery

`local-ai:discover` probes each known endpoint with a small timeout and returns:

```ts
{
  runtimes: [
    {
      id: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      available: true,
      models: [{ id: 'llama3.1:8b', name: 'Llama 3.1 8B', sizeBytes: 4_700_000_000 }, …]
    },
    { id: 'lmstudio', endpoint: '…', available: false, models: [] },
    { id: 'llamacpp', endpoint: '…', available: false, models: [] },
  ]
}
```

The renderer uses this to populate the Local AI section in Settings → API Keys. If no runtime is detected, the UI shows the "Install Ollama" button and a list of curated model suggestions.

## Hardware Benchmark

`local-ai:benchmark` does:

1. **CPU score** — runs a fixed JS workload (matrix multiplication / hashing burst) and measures wall time.
2. **RAM tier** — reads `os.totalmem()` and bands it into `low` / `medium` / `high`.
3. **(Optional) Model probe** — if a runtime is up, sends a tiny prompt to the active model to measure tokens/sec.
4. **Score curated models** — each entry in the curated catalog has an estimated size and difficulty; the scorer ranks them based on the measured tier.

The result includes a recommendation list the UI surfaces as "Recommended for your machine":

```ts
{
  hardware: { cpuTier: 'medium', ram: 16_000_000_000, ramTier: 'medium', arch: 'arm64' },
  recommendations: [
    { runtime: 'ollama', modelId: 'qwen2.5:7b-instruct-q4_K_M', size: 4.7, score: 0.92 },
    { runtime: 'ollama', modelId: 'llama3.1:8b-instruct-q4_K_M', size: 4.9, score: 0.87 },
    …
  ]
}
```

## Curated Model Catalog

The catalog covers multiple families: Llama, DeepSeek, Qwen, Gemma, Mistral, Phi. Each entry has:

- `modelId` — the exact Ollama tag (`llama3.1:8b`, `qwen2.5:7b-instruct`, …).
- `size` — approximate size in GB used by the scorer.
- `family` — display group.
- `tasks` — which tasks (translate/chat/code) it is recommended for.

The catalog is intentionally short. Users can pull any model Ollama supports through the same `local-ai:downloadModel` channel.

## `local-auto`

`local-auto` is a synthetic model id that the renderer can pass when it doesn't want to hard-code a specific model. The Main process resolves it lazily:

```ts
// resolved per request
const { runtime, modelId } = await resolveAutoLocalModel()
// → { runtime: 'ollama', modelId: 'qwen2.5:7b-instruct-q4_K_M' }
```

Resolution prefers a running runtime, then falls back to the highest-scoring recommendation. If no runtime is available, the request returns `{ success: false, errorCode: 'NO_LOCAL_RUNTIME' }`.

## Install Ollama

`local-ai:installOllama` runs **a fixed Main-process command**:

```
curl -fsSL https://ollama.com/install.sh | sh
```

The renderer cannot influence the command in any way. This eliminates the risk of an attacker-controlled renderer executing arbitrary shell.

While the install runs:

- Stdout/stderr is parsed into structured progress events (`downloading` / `extracting` / `starting`).
- The renderer receives `local-ai:installProgress` periodically with `{ phase, pct?, message }`.
- The renderer can call `local-ai:cancelInstallOllama` to send `SIGTERM` and clean up.
- On completion, `local-ai:installDone` fires with `{ success, error? }`.

After install, the Main process re-runs discovery so the UI can show the new runtime without restarting.

## Pull a Model

`local-ai:downloadModel({ runtime: 'ollama', modelId })` calls Ollama's management API:

```http
POST http://127.0.0.1:11434/api/pull
Content-Type: application/json

{ "name": "<modelId>", "stream": true }
```

The streaming response is parsed line-by-line; each `{ status, completed, total }` is forwarded to the renderer through `local-ai:modelDownloadProgress`. On error or completion, the channel sends a final event so the UI can stop the spinner.

LM Studio and llama.cpp don't have a stable management API for pulling models, so for those runtimes the UI shows a "Manage in <runtime>" link instead of an in-app pull button.

## Remove a Model

`local-ai:removeModel` for Ollama hits `DELETE /api/delete`. There is no "remove" path for LM Studio or llama.cpp; the UI tells the user to manage models inside that app.

## Adapter (`translateProviderLocal.ts`)

The local provider is just an OpenAI-compatible HTTP client pointed at the discovered runtime. Highlights:

- Uses the official `openai` SDK with `baseURL` overridden and a placeholder `apiKey: LOCAL_AI_PLACEHOLDER_KEY` (Ollama / LM Studio ignore the value).
- For translate / rewrite / detect, uses `chat.completions` with the same prompts as cloud providers.
- For streaming (Live Translate), uses the SSE stream from `chat.completions` with `stream: true`.
- Catches connection errors and rethrows them so `classifyProviderError()` maps them to `NETWORK`.

## Sequence Diagram (User Flow)

```
User opens Settings → Local AI
  └─► window.api.localAi.discover()
        └─► ipc 'local-ai:discover' → runtimes + models
              └─► UI shows runtimes; hits Benchmark
                    └─► ipc 'local-ai:benchmark' → recommendations
                          └─► User clicks a recommendation
                                ├─ Runtime not installed? →
                                │   ipc 'local-ai:installOllama'
                                │     ⇄ progress events
                                │     └─► ipc 'local-ai:discover' again
                                └─ Model not pulled? →
                                    ipc 'local-ai:downloadModel'
                                      ⇄ progress events
                                      └─► UI marks model ready
                                            └─► User translates with provider='local'
                                                  └─► ipc 'translate' (resolves local-auto)
                                                        └─► translateProviderLocal → Ollama HTTP
```

## Pitfalls and Tips

- **Port collisions** — discovery is fast (≈300 ms timeout) so it's safe to call on every Settings page open.
- **CORS** — runtimes on `127.0.0.1` accept Electron's loopback origin without trouble; no proxy needed.
- **Model size mismatch** — the scorer uses approximate sizes; users with limited RAM can override the recommendation.
- **First-use latency** — Ollama loads a model into RAM on first request; the UI shows a "warming up" hint.
- **Don't expose the runtime endpoint to the renderer for direct calls** — keep all HTTP inside `localAi.ts` or `translateProviderLocal.ts`. The renderer has `window.api.localAi.discover()` for visibility but should never `fetch()` itself.

## Future Work

See [`phase_2/local-ai-agent-tasks.md`](./phase_2/local-ai-agent-tasks.md) for the maintained backlog (e.g. better hardware probing, GPU detection on Windows, expanded LM Studio support, automatic Ollama upgrade prompts).
