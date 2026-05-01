# 05 — IPC Reference

This file lists every IPC channel registered by the Main process. Channels are grouped by domain. Each entry shows: invocation pattern, payload shape, response shape, file owning the handler.

> Convention — every handler returns `{ success: true, ... }` on success, or `{ success: false, error: string, errorCode?: string }` on failure. Streaming channels also push events back through `webContents.send(...)`.

## Common Error Codes

`errorCode` is set by `electron/ipc/errorUtils.ts → classifyProviderError()` and the validation helpers:

| Code | Meaning |
|---|---|
| `INVALID_INPUT` | Renderer payload failed validation |
| `NO_API_KEY` | Provider needs a key but none is stored |
| `INVALID_KEY` | Provider rejected the key (401 / `invalid_api_key`) |
| `RATE_LIMIT` | 429 / quota / `rate_limit_exceeded` |
| `NETWORK` | `ENOTFOUND` / `ECONNREFUSED` / `ECONNRESET` / fetch timeout |
| `TIMEOUT` | Internal `withTimeout()` fired |
| `UNKNOWN_PROVIDER` | Provider id is not in `SUPPORTED_PROVIDERS` |

---

## Translate (`electron/ipc/translate.ts`)

### `translate`

```ts
window.api.translate({
  provider: 'local' | 'gemini' | 'claude' | 'openai',
  model: string,
  sourceLang: 'auto' | string,
  targetLang: string,
  text: string,
  style?: 'standard' | 'formal' | 'casual' | 'technical' | 'literal' | 'localized' | 'concise',
  showFurigana?: boolean,        // adds furigana / pinyin / romanization to result
  signal?: AbortSignal,
}) → Promise<{
  success: true; translatedText: string; phonetic?: string;
} | IpcErr>
```

- Long inputs are split into chunks (`translateChunking.ts`) and joined back with a per-chunk timeout.
- Goes through `withRetry()` for transient network errors.

### `translate:detect`

Detects the source language. Payload `{ provider, model, text }`. Response `{ success, lang }` where `lang` is a normalized language code from `electron/ipc/translateLanguage.ts`.

### `translate:rewrite`

Rewrites text in the same language, optionally with a tone. Payload `{ provider, model, text, tone?, targetLang? }`. Response `{ success, rewritten }`.

### `translate:verify-key`

Validates a temporary API key with a tiny call to the provider. Payload `{ provider, apiKey, model? }`. Response `{ success, valid: boolean, error? }`. The verify model defaults to `VERIFY_MODEL_<PROVIDER>` from `ipcConstants.ts`.

### `translate:live-stream`

Starts a streaming translation that pushes tokens to the subtitle window.

```ts
window.api.translate.liveStream({
  sessionId: string,
  provider, model, sourceLang, targetLang, text, style?,
})
```

Events emitted to the renderer / subtitle window:

| Event | Payload |
|---|---|
| `translate:live-stream:delta` | `{ sessionId, delta, full }` |
| `translate:live-stream:done`  | `{ sessionId, full }` |
| `translate:live-stream:error` | `{ sessionId, error, errorCode }` |

To cancel, the renderer calls `translate:live-stream:cancel` with `{ sessionId }`.

---

## Chat (`electron/ipc/chat.ts`)

### `chat:send`

```ts
window.api.chat.send({
  provider, model,
  messages: ChatMessage[],
  systemPrompt?: string,
  images?: { mime: string; base64: string }[],   // multimodal attachments
  webSearch?: { enabled: boolean; provider?: 'tavily' | 'brave' | 'jina' },
  stream?: boolean,
  signal?: AbortSignal,
}) → Promise<{ success: true; reply: string; usage?: object } | IpcErr>
```

When `stream: true`, deltas are forwarded through:

- `chat:delta` `{ sessionId, delta, full }`
- `chat:done` `{ sessionId, full, usage? }`
- `chat:error` `{ sessionId, error, errorCode }`

---

## Image Translate (`electron/ipc/imageTranslate.ts`)

### `image:translate`

```ts
window.api.imageTranslate({
  provider, model,
  sourceLang, targetLang,
  image: { mime: string; base64: string },
  mode?: 'extract' | 'edit',  // edit produces a translated image when supported
}) → Promise<{
  success: true;
  text?: string;             // when mode = 'extract'
  imageBase64?: string;      // when mode = 'edit' and provider supports it
} | IpcErr>
```

- Validates MIME against an allowlist (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).
- Image size is capped (see `src/constants/image.ts`).

---

## Audio (`electron/ipc/transcribe.ts`, `electron/ipc/tts.ts`)

### `audio:transcribe`

```ts
window.api.audio.transcribe({
  provider: 'openai' | 'gemini' | 'groq',
  model?: string,
  audio: ArrayBuffer | { mime: string; base64: string },
  language?: string,
  prompt?: string,
}) → Promise<{
  success: true;
  text: string;
  segments?: Array<{ start: number; end: number; text: string; avgLogprob?: number; noSpeechProb?: number; compressionRatio?: number; }>;
} | IpcErr>
```

The Whisper response includes per-segment metadata used by Live Translate's confidence gates (see `useLiveTranslate.ts`).

### `audio:tts`

```ts
window.api.audio.tts({
  text: string,
  voice?: string,
  speed?: number,
  preferred?: 'openai' | 'gemini' | 'edge' | 'elevenlabs',  // first try
}) → Promise<{ success: true; mime: string; base64: string } | IpcErr>
```

Internally a fallback chain is tried in order: OpenAI → Gemini → Edge TTS → ElevenLabs. The first provider that has a key (or doesn't need one) and succeeds wins. Free-tier Edge TTS is the default for users without keys.

---

## Models (`electron/ipc/models.ts`)

### `models:fetch`

```ts
window.api.models.fetch({ provider, apiKey? }) → Promise<{
  success: true; models: Array<{ id: string; name?: string; family?: string; tag?: string }>;
} | IpcErr>
```

Provider-specific:

- **OpenAI** — `GET /v1/models`
- **Anthropic** — `GET /v1/models`
- **Gemini** — `GET /v1beta/models`
- **Local** — uses `local-ai:discover` to enumerate local runtimes

The renderer falls back to the curated list in `src/constants/providers.ts` when the network call fails.

---

## Keychain (`electron/ipc/keychain.ts`)

| Channel | Payload | Response |
|---|---|---|
| `keychain:set` | `{ provider, apiKey }` | `{ success: true }` |
| `keychain:has` | `{ provider }` | `{ success: true, hasKey: boolean }` |
| `keychain:delete` | `{ provider }` | `{ success: true }` |
| `keychain:get-mask` | `{ provider }` | `{ success: true, masked: string }` (e.g. `sk-***...****abcd`) |

Raw key values are **never** returned. The renderer only ever sees a boolean or masked string. `safeStorage.isEncryptionAvailable()` is checked on first set; if unavailable the call returns `{ success: false, errorCode: 'NO_ENCRYPTION' }`.

---

## Local AI (`electron/ipc/localAi.ts`)

### `local-ai:discover`

```ts
window.api.localAi.discover() → Promise<{
  success: true;
  runtimes: Array<{
    id: 'ollama' | 'lmstudio' | 'llamacpp';
    endpoint: string;     // e.g. http://127.0.0.1:11434/v1
    available: boolean;
    models: Array<{ id: string; name: string; sizeBytes?: number }>;
  }>;
} | IpcErr>
```

### `local-ai:benchmark`

```ts
window.api.localAi.benchmark({ runModelProbe?: boolean }) → Promise<{
  success: true;
  hardware: { cpuTier: 'low' | 'medium' | 'high'; ram: number; ramTier: 'low'|'medium'|'high'; arch: string };
  recommendations: Array<{ runtime: 'ollama'|'lmstudio'|'llamacpp'; modelId: string; size: number; score: number }>;
} | IpcErr>
```

Runs a synthetic CPU/RAM workload and (optionally) a short local model completion to measure tokens/sec, then scores curated models against the measured tier.

### `local-ai:installOllama`

Runs the fixed Main-process command `curl -fsSL https://ollama.com/install.sh | sh` and streams progress.

Events:

- `local-ai:installProgress` `{ phase: 'downloading'|'extracting'|'starting'; pct?: number; message: string }`
- `local-ai:installDone` `{ success: boolean; error?: string }`

### `local-ai:cancelInstallOllama`

Cancels the install if in progress.

### `local-ai:downloadModel`

```ts
window.api.localAi.downloadModel({ runtime: 'ollama', modelId: string }) → Promise<{ success: true } | IpcErr>
```

Streams progress through `local-ai:modelDownloadProgress` `{ modelId, completed, total, status }`. Uses Ollama's `POST /api/pull`.

### `local-ai:removeModel`

Removes a downloaded model. Currently supported on Ollama (`DELETE /api/delete`).

### `local-ai:resolveAuto`

Resolves the special `local-auto` model id to a concrete `{ runtime, modelId }` based on currently-running runtimes and recommendation scoring.

---

## Subtitle (`electron/ipc/subtitle.ts`)

| Channel | Purpose |
|---|---|
| `subtitle:enable` | Create the floating subtitle window |
| `subtitle:disable` | Destroy it |
| `subtitle:update` | `{ source, translated }` — fed to the overlay's renderer |
| `subtitle:setStyle` | `{ fontSize, opacity, position }` |
| `subtitle:setVisible` | `{ visible: boolean }` |

The overlay's preload re-emits `subtitle:update` on `window.subtitle.onUpdate(callback)`.

---

## Hotkey (`electron/ipc/globalHotkey.ts`)

| Channel | Payload | Response |
|---|---|---|
| `hotkey:get` | — | `{ success, accelerator: string }` |
| `hotkey:set` | `{ accelerator }` | `{ success }` or `{ success: false, error }` |
| `hotkey:clear` | — | `{ success }` |

When the user presses the hotkey, the main process sends `hotkey:triggered` to the focused window.

---

## System (`electron/ipc/system.ts`)

| Channel | Payload | Response |
|---|---|---|
| `app:openExternal` | `{ url }` | `{ success }` (URL is gated by `isAllowedExternalUrl`) |
| `app:getInfo` | — | `{ version, platform, arch, locale }` |
| `app:checkPermissions` | — | `{ microphone, screen }` (macOS) |
| `app:requestPermissions` | `{ kind: 'microphone' \| 'screen' }` | `{ granted: boolean }` |
| `app:openLogs` | — | `{ success }` opens the Electron log directory |

---

## Updater (`electron/ipc/updater.ts`)

Channels: `updater:check`, `updater:download`, `updater:install`, `updater:dismiss`.

Events: `updater:checking`, `updater:available`, `updater:not-available`, `updater:download-progress`, `updater:downloaded`, `updater:error`.

---

## Local Server (`electron/ipc/localServer.ts`)

The Chrome Extension bridge.

| Channel | Purpose |
|---|---|
| `localServer:start` / `localServer:stop` | Lifecycle (also auto-managed at app boot) |
| `localServer:getStatus` | `{ running: boolean, port: number }` |
| `localServer:getKey` | Returns the current `sk-vie-…` connection key (renderer-side display) |
| `localServer:rotateKey` | Rotates the key, invalidates browser sessions |
| `localServer:setTtl` | Sets the per-session token TTL (Settings → Browser) |

Inbound HTTP routes on `127.0.0.1:39875`:

- `POST /v1/translate` → bridges to `lightweightTranslate.ts`
- `POST /v1/health` → `{ ok: true, version }`
- `POST /v1/quick-chat` → bridges to `quickChat.ts` helpers

All requests must include `Authorization: Bearer sk-vie-...` and `Origin: chrome-extension://...`.

---

## Web Search (`electron/ipc/webSearch.ts`)

| Channel | Payload | Response |
|---|---|---|
| `webSearch:search` | `{ query, provider?: 'tavily'\|'brave'\|'jina', max? }` | `{ success, results: Array<{ title, url, snippet }>}` |
| `webSearch:fetchPage` | `{ url }` | `{ success, html }` (used by Deep Research) |

---

## Quick Chat (`electron/ipc/quickChat.ts`)

| Channel | Purpose |
|---|---|
| `quickChat:show` | Show + focus the Quick Chat window |
| `quickChat:hide` | Hide it |
| `quickChat:toggle` | Toggle |
| `quickChat:setHotkey` | Update the global hotkey for it |
| `quickChat:onText` | Renderer → Main bridge for selected-text payloads |

---

## Legacy Assistant (`electron/ipc/legacyAssistant.ts`)

Bookmarklet-style flow used before the Chrome Extension shipped. Exposes `legacyAssistant:getBookmarklet` and `legacyAssistant:translate` for in-page translation.

---

## How To Add A New Channel

1. Create or extend a file under `electron/ipc/<domain>.ts`.
2. Export `register<Domain>Handlers(ipcMain)` and call `ipcMain.handle('<domain>:<action>', …)` inside.
3. Validate the payload through `electron/ipc/ipcValidation.ts` (or a domain-specific module) before destructuring.
4. Read API keys via `getStoredApiKey(provider)` — never accept them from the renderer.
5. Wrap network calls in `withRetry()` and classify errors with `classifyProviderError()`.
6. Add the registration to `electron/main.ts`.
7. Expose it on `window.api` by extending the matching `electron/preload/<domain>.ts`.
8. Update `src/types/index.ts` with the `window.api` types if needed.
9. Add a Vitest spec under `electron/ipc/__tests__/`.
