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
  - Own SDK-specific adapter implementations.
  - Keep OpenAI, Claude, and Gemini API surface differences out of the IPC handler and out of the central registry.

- `electron/ipc/translateProviderTypes.ts`
  - Defines the adapter function contracts shared by provider modules and registries.

## Adding A Provider

1. Add the provider ID to `electron/ipc/providers/types.ts`.
2. Implement provider adapters in a provider-specific module.
3. Register adapters in `translateProviders.ts`.
4. Add validation and routing tests for the new provider behavior.
5. Keep renderer metadata in sync with `src/constants/providers.ts`.
