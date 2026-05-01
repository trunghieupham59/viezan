# 02 — Architecture

> If you have 10 minutes, read this file end-to-end. It links out to deeper docs for each section.

## 1. Process Model

Viezan is an Electron app, so it runs in **three independent execution contexts**:

```
┌──────────────────────────────────────────────────────┐
│  Main Process    (Node.js, electron/main.ts)         │
│  • Full Node.js + Electron APIs                      │
│  • Manages BrowserWindow lifecycle                   │
│  • Registers all ipcMain.handle() handlers           │
│  • Owns provider SDK calls + local OpenAI-compat HTTP│
│  • Owns API-key encryption via safeStorage           │
└──────────────────────┬───────────────────────────────┘
                       │ IPC
┌──────────────────────▼───────────────────────────────┐
│  Preload Script    (electron/preload.ts)             │
│  • Runs in renderer, isolated world (contextBridge)  │
│  • Wraps ipcRenderer.invoke() into window.api.*      │
│  • Per-domain modules under electron/preload/        │
│  • API key VALUES never pass through this layer      │
└──────────────────────┬───────────────────────────────┘
                       │ window.api.*
┌──────────────────────▼───────────────────────────────┐
│  Renderer Process    (React, src/)                   │
│  • Vite + React 18 + TypeScript                      │
│  • No Node.js access (sandbox: true)                 │
│  • All outside calls go through window.api.*         │
└──────────────────────────────────────────────────────┘
```

There are also **two secondary windows** in the same Renderer/Preload model:

- **Subtitle overlay** — a small always-on-top floating window (`public/subtitle.html`) with its own preload (`electron/subtitle-preload.ts`) that exposes a minimal API for receiving subtitle updates.
- **Quick Chat panel** — a separate Raycast-style window (renderer entry `src/quick-chat-main.tsx`) that mounts only the `<AIChatPopup />` component and reuses the main `window.api` surface plus a small `quickChat` namespace.

> Golden rule — the renderer **never** sees an API key value. Keys live only in the Main Process and OS keychain.

## 2. Source Layout

```
electron/
├── main.ts                  Lifecycle, windows, single-instance lock, navigation policy
├── preload.ts               Aggregator that imports each preload domain module
├── subtitle-preload.ts      Minimal preload for the floating subtitle window
├── ipc/
│   ├── ipcConstants.ts      Shared constants (verify models, default models, ports)
│   ├── ipcValidation.ts     Generic input guards used by every handler
│   ├── retry.ts             withRetry() — exponential backoff for transient errors
│   ├── errorUtils.ts        classifyProviderError() and helpers
│   ├── externalUrl.ts       Allowlist for shell.openExternal()
│   ├── keychain.ts          safeStorage encrypt/decrypt for API keys
│   ├── storage.ts           Generic encrypted-blob storage helpers
│   ├── system.ts            OS info, perms, openExternal handler
│   ├── globalHotkey.ts      Register/update OS-level shortcut
│   ├── updater.ts           electron-updater integration
│   ├── translate.ts         translate / detect / rewrite / verify-key / live-stream
│   ├── translateValidation.ts
│   ├── translatePrompts.ts  Tone prompts, rewrite prompts
│   ├── translateChunking.ts splitIntoChunks, withTimeout, promisePool
│   ├── translateLanguage.ts Language code helpers
│   ├── translateProviders.ts Central registry of provider adapters
│   ├── translateProviderTypes.ts adapter contracts
│   ├── translateProvider{OpenAI,Claude,Gemini,Local}.ts SDK-specific adapters
│   ├── chat.ts              Multi-turn chat
│   ├── chatValidation.ts
│   ├── imageTranslate.ts    Image OCR-style translation (Gemini vision, etc.)
│   ├── transcribe.ts        Whisper / Gemini / Groq STT
│   ├── tts.ts               OpenAI/Gemini/Edge/ElevenLabs TTS chain
│   ├── models.ts            Fetch model lists from each provider
│   ├── subtitle.ts          Subtitle overlay window control
│   ├── localAi.ts           Local runtime discovery, benchmark, install/pull, recommendation
│   ├── localServer.ts       Local HTTP server for the Chrome Extension bridge
│   ├── webSearch.ts         Tavily / Brave / Jina web search
│   ├── legacyAssistant.ts   Bookmarklet-style browser injection
│   ├── lightweightTranslate.ts Tiny path used by browser bridge
│   ├── quickChat.ts         Quick Chat window control + chat helpers
│   └── providers/types.ts   SUPPORTED_PROVIDERS + isValidProvider() type guard
├── ipc/__tests__/           Vitest specs for IPC modules
└── preload/                 Per-domain preload modules
    ├── translate.ts, chat.ts, audio.ts, subtitle.ts, system.ts,
    ├── updater.ts, hotkey.ts, keychain.ts, legacyAssistant.ts,
    ├── localServer.ts, quickChat.ts, webSearch.ts
    └── (each one defines a slice of window.api.*)

src/
├── main.tsx                 Renderer entry → mounts <App />
├── App.tsx                  Layout, lazy routing, system bridges
├── quick-chat-main.tsx      Renderer entry for the Quick Chat window
├── pages/                   TranslatePage, LiveTranslatePage, ChatPage,
│                            HistoryPage, SettingsPage (with settings/* sections)
├── components/              Shared UI + chat/, live/, translate/, ui/
├── hooks/                   useTranslate, useLiveTranslate, useTTS,
│                            useVoiceInput, useTypewriter,
│                            live/{vadPolicy,transcriptAssembly,speakerDiarization,useLiveAiActions}
├── services/                translationService, chatService, deepResearchService,
│                            smartThinkingService
├── store/                   useAppStore + slices/{core,settings,history,chat}
├── i18n/                    index.ts + locales/{en,ja,vi}.ts
├── constants/               providers, audio, image, langNames, ui, urls
├── types/index.ts           Shared TS types (Provider, Settings, Message, …)
├── utils/                   canvas, imageUtils, keyboardShortcuts, locale,
│                            markdownInline, modelDisplay, tpl, wav-encoder,
│                            live-translate
└── test/setup.ts            Vitest jsdom setup
```

## 3. IPC Protocol

### Naming and shape

Every channel follows `domain:action`. Handlers return either:

```ts
type IpcOk = { success: true; /* domain-specific fields */ }
type IpcErr = { success: false; error: string; errorCode?: 'INVALID_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'INVALID_INPUT' | 'NO_API_KEY' | 'UNKNOWN_PROVIDER' | 'TIMEOUT' }
```

Streaming channels (e.g. `translate:live-stream`) push events back via `webContents.send(...)` and use a stable session id.

For the complete list see [`05-ipc-reference.md`](./05-ipc-reference.md).

### Typical request flow

```
React component
  └─► hook / service               (src/hooks, src/services)
        └─► window.api.translate(params)        (electron/preload/translate.ts)
              └─► ipcRenderer.invoke('translate', params)
                    └─► ipcMain.handle('translate', …)   (electron/ipc/translate.ts)
                          ├─► validateTranslatePayload (translateValidation.ts)
                          ├─► getStoredApiKey(provider) (keychain.ts)
                          ├─► splitIntoChunks + promisePool (translateChunking.ts)
                          └─► withRetry(() => TRANSLATE_PROVIDERS[provider](…))
                                └─► provider SDK / local OpenAI-compat HTTP
                                      └─► { success, translatedText | error }
```

### Key channels at a glance

| Channel | Purpose | File |
|---|---|---|
| `translate` | Translate text, optional chunking | `ipc/translate.ts` |
| `translate:detect` | Source language detection | `ipc/translate.ts` |
| `translate:rewrite` | Rewrite text with tone | `ipc/translate.ts` |
| `translate:verify-key` | Validate a provider API key | `ipc/translate.ts` |
| `translate:live-stream` | Stream tokens to subtitle window | `ipc/translate.ts` |
| `chat:send` | Multi-turn chat (with images) | `ipc/chat.ts` |
| `image:translate` | Translate text inside images | `ipc/imageTranslate.ts` |
| `audio:transcribe` | STT (Whisper / Gemini / Groq) | `ipc/transcribe.ts` |
| `audio:tts` | TTS with provider fallback chain | `ipc/tts.ts` |
| `models:fetch` | Pull live model list from provider | `ipc/models.ts` |
| `keychain:set/get/has/delete` | Encrypted API key storage | `ipc/keychain.ts` |
| `local-ai:discover` | Detect local runtimes + models | `ipc/localAi.ts` |
| `local-ai:benchmark` | CPU/RAM tiering + recommendation | `ipc/localAi.ts` |
| `local-ai:installOllama` | Run install script (fixed cmd) | `ipc/localAi.ts` |
| `local-ai:downloadModel` | Pull an Ollama model | `ipc/localAi.ts` |
| `subtitle:*` | Floating subtitle overlay control | `ipc/subtitle.ts` |
| `hotkey:*` | Global OS shortcut | `ipc/globalHotkey.ts` |
| `app:openExternal` | Allowlisted external URLs | `ipc/system.ts` |
| `updater:*` | Auto-update | `ipc/updater.ts` |
| `localServer:*` | Chrome Extension bridge mgmt | `ipc/localServer.ts` |
| `webSearch:*` | Tavily / Brave / Jina | `ipc/webSearch.ts` |
| `quickChat:*` | Quick Chat window | `ipc/quickChat.ts` |

## 4. Preload Surface

`electron/preload.ts` is a thin aggregator. Each domain has its own module under `electron/preload/`:

```
electron/preload/
├── keychain.ts          API key set/has/delete + verify
├── translate.ts         Text translate / detect / rewrite / live-stream
├── audio.ts             STT + TTS
├── chat.ts              Chat + image translate
├── subtitle.ts          Floating subtitle window
├── system.ts            OS perms, app metadata, openExternal
├── updater.ts           Auto-update
├── hotkey.ts            Global hotkey + events
├── legacyAssistant.ts   Browser injection bookmarklet
├── localServer.ts       Chrome Extension bridge management
├── quickChat.ts         Quick Chat window control
└── webSearch.ts         Tavily / Brave / Jina
```

To add a new renderer-facing API: extend the relevant domain module (or create a new one) and re-export from `preload.ts`.

For the full typed surface, see [`06-preload-api.md`](./06-preload-api.md).

## 5. State Management

All client state uses **Zustand** with the slice pattern. Each feature is its own slice composed in `src/store/useAppStore.ts`:

```
useAppStore (Zustand + persist) — thin aggregator
├── CoreSlice       core translate state, active page, provider/model selection
├── SettingsSlice   user preferences (autoTranslate, fontSize, locale, TTS, …)
├── HistorySlice    translate + live session history
└── ChatSlice       chat sessions + system prompt presets
```

Persisted (debounced 500 ms): `sourceLang`, `targetLang`, `selectedProvider`, `selectedModels`, `autoTranslate`, `showFurigana`, `translationStyle`, `fontSize`, `locale`, `history`, `liveSessions`, `chatSessions`, `chatSystemPrompt`, `systemPromptPresets`, …

Not persisted: ephemeral fields like `isTranslating`, `translateError`, `sourceText`, `translatedText`.

See [`08-state-management.md`](./08-state-management.md) for the full slice contract.

## 6. Provider System

Four AI providers: **Local AI**, **Gemini**, **Claude**, **OpenAI** — declared in `src/constants/providers.ts` and `electron/ipc/providers/types.ts`.

Each IPC handler uses a registry pattern. Example for translate:

```ts
const TRANSLATE_PROVIDERS: Record<Provider, TranslateFn> = {
  local: translateWithLocal,
  gemini: translateWithGemini,
  claude: translateWithClaude,
  openai: translateWithOpenAI,
}
```

The same shape exists for `REWRITE_PROVIDERS`, `DETECT_PROVIDERS`, `STREAM_PROVIDERS`, `CHAT_PROVIDERS` and `VERIFY_PROVIDERS`. SDK-specific code lives in `translateProvider{OpenAI,Claude,Gemini,Local}.ts` so the central registries stay declarative.

For the step-by-step "how to add a provider" recipe see [`09-providers.md`](./09-providers.md) and [`provider-routing.md`](./provider-routing.md).

## 7. Error Handling and Retry

`electron/ipc/errorUtils.ts` classifies provider errors:

| Match | `errorCode` | UX |
|---|---|---|
| 401 / `invalid_api_key` | `INVALID_KEY` | Prompt user to update key in Settings |
| 429 / `rate_limit` / `quota` | `RATE_LIMIT` | Wait + retry banner |
| `ENOTFOUND` / `ECONNREFUSED` | `NETWORK` | Show offline message |
| Validation failures | `INVALID_INPUT` | Show inline field error |
| (other) | _(none)_ | Pass through |

`electron/ipc/retry.ts → withRetry()` wraps async provider calls with **exponential backoff** (default 3 attempts: 500 ms → 1 s → 2 s, capped at 8 s). It only retries on transient network errors — never on auth, rate limit or bad-request.

TTS uses a different strategy: a **provider fallback chain** (OpenAI → Gemini → Edge TTS → ElevenLabs) where the first successful provider wins.

## 8. Security Model (summary)

- API keys: encrypted with `safeStorage.encryptString` → stored in OS keychain. Renderer can only ask `hasKey(provider) → boolean`.
- Renderer windows: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- `shell.openExternal()` is gated by `electron/ipc/externalUrl.ts → isAllowedExternalUrl()` (HTTPS + host allowlist + GitHub releases path + macOS Screen Recording deep-link).
- Renderer navigation is restricted in `main.ts` `will-navigate` to `file://` and `localhost:5173`.
- Chrome Extension authenticates to the local server with an **internal Viezan key** (`sk-vie-…`); never a provider key.

Detailed model: [`13-security.md`](./13-security.md). Boundaries reference: [`security-boundaries.md`](./security-boundaries.md).

## 9. Live Translate Pipeline (high level)

```
Microphone / System / Mixed audio
   └─ Web Audio + analyser
         └─ VAD policy (src/hooks/live/vadPolicy.ts) — thresholds + adaptive gain
               └─ MediaRecorder chunks (≈1.5 s with VAD early-stop)
                     └─ ipcRenderer.invoke('audio:transcribe')  → Whisper / Gemini / Groq
                           └─ Confidence / hallucination filters
                                 └─ Sentence assembly (transcriptAssembly.ts)
                                       └─ Speaker diarization (speakerDiarization.ts)
                                             ├─ Subtitle ON  → translate:live-stream → subtitle window
                                             └─ Subtitle OFF → translate (batch)    → page UI
                                                   └─ Post-meeting AI actions (useLiveAiActions.ts)
```

Full document: [`live-translate-pipeline.md`](./live-translate-pipeline.md). Design notes: [`live_trans.md`](./live_trans.md).

## 10. Where Things Live (Quick Reference)

| Task | Where |
|---|---|
| Add an IPC handler | `electron/ipc/<domain>.ts` and register in `electron/main.ts` |
| Expose a new API to the renderer | `electron/preload/<domain>.ts` + re-export in `electron/preload.ts` |
| Add global state | `src/store/slices/<feature>Slice.ts` |
| Add a provider | See [`09-providers.md`](./09-providers.md) (touches `providers.ts`, `providers/types.ts`, `translateProviders.ts`, `chat.ts`, `tts.ts`, `models.ts`, `ipcConstants.ts`) |
| Maintain Local AI | `electron/ipc/localAi.ts`, `translateProviderLocal.ts`, `src/pages/settings/ApiKeysSection.tsx` |
| Add a language | `src/constants/providers.ts` → `LANGUAGES` and `src/constants/langNames.ts` |
| Shared constants | `electron/ipc/ipcConstants.ts` (main) and `src/constants/` (renderer) |
| Provider type guard | `electron/ipc/providers/types.ts → isValidProvider()` |
| Retry network errors | `electron/ipc/retry.ts → withRetry()` |
| Classify provider errors | `electron/ipc/errorUtils.ts → classifyProviderError()` |
