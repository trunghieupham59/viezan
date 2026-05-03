# 09 — Provider System

Viezan supports four AI providers as first-class citizens: **Local AI**, **Google Gemini**, **Anthropic Claude**, and **OpenAI**. Each one plugs into a small set of registries on the Main side and a metadata list on the Renderer side.

This document complements [`provider-routing.md`](./provider-routing.md), which focuses on the translate-pipeline split.

## Single Sources of Truth

| Where | What |
|---|---|
| `electron/ipc/providers/types.ts` | `SUPPORTED_PROVIDERS` allowlist + `isValidProvider()` type guard |
| `src/constants/providers.ts` | `PROVIDERS` (renderer metadata: id, name, color, keyPrefix, models, docs URL), `LANGUAGES`, `DEFAULT_SETTINGS` |
| `electron/ipc/ipcConstants.ts` | Default models per task and per provider, plus `VERIFY_MODEL_<PROVIDER>` constants |
| `electron/ipc/translateProviders.ts` | `TRANSLATE_PROVIDERS`, `REWRITE_PROVIDERS`, `DETECT_PROVIDERS`, `STREAM_PROVIDERS`, `VERIFY_PROVIDERS` |
| `electron/ipc/chat.ts` | `CHAT_PROVIDERS` |
| `electron/ipc/tts.ts` | TTS fallback chain |
| `electron/ipc/transcribe.ts` | STT provider routing |
| `electron/ipc/imageTranslate.ts` | Image translate routing |
| `electron/ipc/models.ts` | Per-provider models endpoint |

## Adapter Contract

`electron/ipc/translateProviderTypes.ts` defines the function shapes that each provider module must implement. Roughly:

```ts
export type TranslateFn = (params: {
  apiKey: string
  model: string
  sourceLang: string
  targetLang: string
  text: string
  prompt: string             // built by translatePrompts.ts
  signal?: AbortSignal
}) => Promise<string>

export type RewriteFn = (params: {
  apiKey: string; model: string; prompt: string; signal?: AbortSignal
}) => Promise<string>

export type DetectFn = (params: {
  apiKey: string; model: string; text: string
}) => Promise<string>   // returns BCP-47-ish code

export type StreamFn = (params: {
  apiKey: string; model: string; prompt: string;
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}) => Promise<string>   // returns full text

export type VerifyFn = (params: { apiKey: string; model?: string }) => Promise<void>

export type ChatFn = (params: {
  apiKey: string; model: string;
  messages: ChatMessage[]; systemPrompt?: string;
  images?: { mime: string; base64: string }[];
  stream?: boolean; onDelta?: (s: string) => void;
  signal?: AbortSignal;
}) => Promise<{ reply: string; usage?: object }>
```

The `apiKey` argument is supplied by the IPC handler from `getStoredApiKey(provider)`. For the `local` provider, the constant `LOCAL_AI_PLACEHOLDER_KEY` is passed instead.

Provider-specific files (`translateProvider{OpenAI,Claude,Gemini,Local}.ts`) implement the contract using the official SDKs (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`) or, for `local`, the OpenAI-compatible HTTP API exposed by Ollama / LM Studio / llama.cpp.

## Registry Pattern

Each task has a registry mapping provider id → adapter function:

```ts
const TRANSLATE_PROVIDERS: Record<Provider, TranslateFn> = {
  local: translateWithLocal,
  gemini: translateWithGemini,
  claude: translateWithClaude,
  openai: translateWithOpenAI,
}

// At dispatch time:
if (!isValidProvider(provider)) return unknownProviderError(provider)
const fn = TRANSLATE_PROVIDERS[provider]
return withRetry(() => fn({ apiKey, model, … }))
```

This keeps the IPC handler dumb and declarative; SDK quirks live inside the provider module.

## Adding A New Provider

Below is the canonical recipe. Use the `viezan-provider-integration` skill to walk it for a real change.

### 1. Provider id allowlist (Main)

```ts
// electron/ipc/providers/types.ts
export const SUPPORTED_PROVIDERS = ['local', 'gemini', 'claude', 'openai', 'myprovider'] as const
export type Provider = (typeof SUPPORTED_PROVIDERS)[number]
export const isValidProvider = (v: unknown): v is Provider =>
  typeof v === 'string' && SUPPORTED_PROVIDERS.includes(v as Provider)
```

### 2. Provider type union (Renderer)

```ts
// src/types/index.ts
export type Provider = 'local' | 'gemini' | 'claude' | 'openai' | 'myprovider'
```

### 3. Renderer metadata

```ts
// src/constants/providers.ts
PROVIDERS.push({
  id: 'myprovider',
  name: 'My Provider',
  color: '#FF0000',
  keyPrefix: 'mp-',
  docsUrl: 'https://myprovider.example.com/docs',
  models: [
    { id: 'mp-fast', name: 'My Fast', tag: 'recommended' },
    { id: 'mp-pro',  name: 'My Pro' },
  ],
})

// Add to DEFAULT_SETTINGS.defaultModels
defaultModels: { …, myprovider: 'mp-fast' }
```

### 4. Verify model constant

```ts
// electron/ipc/ipcConstants.ts
export const VERIFY_MODEL_MYPROVIDER = 'mp-fast'
```

### 5. Adapter module

Create `electron/ipc/translateProviderMyProvider.ts` and implement the adapter contract using the provider's SDK / HTTP API. Each function should:

- Accept `apiKey` from the caller, never look it up itself.
- Honor `signal` for cancellation.
- Throw raw provider errors so `classifyProviderError()` can map them.
- Use `withTimeout()` for per-call deadlines.

### 6. Register in registries

```ts
// electron/ipc/translateProviders.ts
import {
  translateWithMyProvider, rewriteWithMyProvider,
  detectWithMyProvider, streamWithMyProvider,
  verifyWithMyProvider,
} from './translateProviderMyProvider'

TRANSLATE_PROVIDERS.myprovider = translateWithMyProvider
REWRITE_PROVIDERS.myprovider   = rewriteWithMyProvider
DETECT_PROVIDERS.myprovider    = detectWithMyProvider
STREAM_PROVIDERS.myprovider    = streamWithMyProvider
VERIFY_PROVIDERS.myprovider    = verifyWithMyProvider
```

Add to `CHAT_PROVIDERS` in `chat.ts` if the provider supports chat. Add to the TTS chain or STT routing if applicable.

### 7. Models endpoint (optional)

If the provider has a `GET /models` endpoint, add a branch to `electron/ipc/models.ts` so the UI can list live models. Otherwise the renderer falls back to the curated list in `providers.ts`.

### 8. Tests

Add unit specs under `electron/ipc/__tests__/`:

- A handler-level spec showing routing happens.
- A provider-module spec mocking the SDK and asserting payload shape, error classification and abort handling.

### 9. UI

`ApiKeysSection.tsx` reads `PROVIDERS` directly, so a new entry shows up automatically. The `Verify` button calls `translate:verify`, which dispatches to `VERIFY_PROVIDERS[provider]`.

### 10. Docs / changelog

- Update [`provider-routing.md`](./provider-routing.md) if the registry pattern changed.
- Add a note in `viezanagent/PROMPTS.md` if a new prompt recipe is needed.

## Local Provider Notes

The `local` provider is keyless. It uses `LOCAL_AI_PLACEHOLDER_KEY` because Ollama / LM Studio / llama.cpp expose OpenAI-compatible APIs that accept the same client shape but don't require a real key.

- Runtime selection happens inside `electron/ipc/localAi.ts` — the renderer never makes raw HTTP calls itself.
- `local-auto` is a synthetic model id that resolves at request time to the best available `(runtime, modelId)` based on `local-ai:benchmark` recommendations.
- Curated suggestions span Llama, DeepSeek, Qwen, Gemma, Mistral, Phi families. Sizes are approximate (GB) and used by the recommendation scorer.
- Direct Ollama install downloads Ollama's official installer in Main, performs a minimal provenance check, then runs the downloaded script via `/bin/sh`; the renderer cannot supply commands or arguments.
- Model pull uses Ollama's management API (`POST /api/pull`) and streams `completed`/`total` to `local-ai:modelDownloadProgress`.

See [`10-local-ai.md`](./10-local-ai.md) for the full workflow.

## TTS Chain

`electron/ipc/tts.ts` doesn't pick a single provider — it tries them in order and returns the first success:

```
preferred (or 'edge' default) → openai → gemini → edge → elevenlabs
```

A provider is skipped if it requires a key that isn't present. Edge TTS works without any key. ElevenLabs is reserved for users with a paid key.

## STT Routing

`electron/ipc/transcribe.ts` accepts a `provider` parameter and dispatches to:

- OpenAI Whisper (`audio.transcriptions.create`).
- Gemini's audio understanding endpoint.
- Groq Whisper (`whisper-large-v3`) — fast, cheap, optional key.

There is no fallback chain here — the renderer chooses explicitly via Settings → STT.

## Validation & Errors

- All payloads pass through `electron/ipc/translateValidation.ts`, `chatValidation.ts` or domain validators before destructuring.
- Bad provider id → `{ success: false, errorCode: 'UNKNOWN_PROVIDER' }`.
- Missing key for a provider that requires one → `{ success: false, errorCode: 'NO_API_KEY' }`.
- SDK errors are mapped by `classifyProviderError()` (see `errorUtils.ts`).
