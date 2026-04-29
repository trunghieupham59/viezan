# Provider Routing Architecture

Translation IPC is intentionally split into thin handler code and focused provider modules.

## Module Boundaries

- `electron/ipc/translate.ts`
  - Registers IPC handlers.
  - Validates parsed payloads through `translateValidation.ts`.
  - Loads API keys from main-process storage.
  - Selects provider functions from registries.
  - Converts provider exceptions into stable IPC error codes.

- `electron/ipc/translateValidation.ts`
  - Owns renderer-controlled payload parsing for translate, rewrite, and language detection.
  - Rejects malformed provider, model, language, enum, and boolean fields before routing.

- `electron/ipc/translatePrompts.ts`
  - Owns translation, rewrite, and language-detection prompt construction.
  - Keeps tone/style policy out of IPC handler registration.

- `electron/ipc/translateChunking.ts`
  - Owns document chunk splitting, per-chunk timeout, and concurrency-limited execution.
  - Exposes pure helpers for direct unit tests.

- `electron/ipc/translateProviders.ts`
  - Owns the central registries for translate, rewrite, detection, verification, and streaming.
  - Exposes `streamTranslation()` while keeping IPC handler registration unaware of provider SDK APIs.

- `electron/ipc/translateProviderOpenAI.ts`
- `electron/ipc/translateProviderClaude.ts`
- `electron/ipc/translateProviderGemini.ts`
- `electron/ipc/translateProviderLocal.ts`
  - Own SDK-specific adapter implementations.
  - Keep OpenAI, Claude, Gemini, and local OpenAI-compatible API surface differences out of the IPC handler and out of the central registry.

- `electron/ipc/localAi.ts`
  - Detects existing local AI runtimes on localhost.
  - Normalizes OpenAI-compatible model lists from Ollama, LM Studio, and llama.cpp.
  - Benchmarks CPU/RAM synthetic workload, optionally measures a short local
    model completion, scores local models against the measured hardware tier,
    and resolves `local-auto`.
  - Exposes `local-ai:discover`, `local-ai:benchmark`, `local-ai:installOllama`,
    `local-ai:cancelInstallOllama`, and `local-ai:downloadModel`
    without letting the renderer make direct provider calls.

- `electron/ipc/translateProviderTypes.ts`
  - Defines the adapter function contracts shared by provider modules and registries.

## Adding A Provider

1. Add the provider ID to `electron/ipc/providers/types.ts`.
2. Implement provider adapters in a provider-specific module.
3. Register adapters in `translateProviders.ts`.
4. Add validation and routing tests for the new provider behavior.
5. Keep renderer metadata in sync with `src/constants/providers.ts`.

## Local Provider Notes

The `local` provider is keyless. It uses a placeholder key internally because
Ollama, LM Studio, and llama.cpp expose OpenAI-compatible APIs that accept the
same client shape but do not require a paid API key. Runtime selection is
resolved in the main process from detected localhost endpoints; renderer code
only receives safe metadata such as engine, endpoint, model list, hardware tier,
and recommendation.

Ollama is a runtime/manager, not the only model family. The curated suggestion
catalog includes multiple model families such as Llama, DeepSeek, Qwen, Gemma,
Mistral, and Phi. Suggested models include an estimated size in GB. Direct
Ollama installation is routed through `local-ai:installOllama`, emits
`local-ai:installProgress`, supports cancellation through
`local-ai:cancelInstallOllama`, and runs a fixed Main Process command
(`curl -fsSL https://ollama.com/install.sh | sh`). The renderer cannot pass a
custom command or arguments. Direct model download uses Ollama's management API
(`/api/pull`) with curated model IDs. LM Studio and llama.cpp remain supported
for detected/running model lists and
OpenAI-compatible inference, but installer/model-management flows should stay
runtime-specific until their APIs are normalized in Viezan.
