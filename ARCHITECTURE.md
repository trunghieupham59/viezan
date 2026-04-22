# Viezan — Architecture Guide

> Target audience: new developers joining the project. Read this file in ~10 minutes and you'll understand how everything connects.

---

## 1. Process Model

Viezan is an Electron app — it has **3 independent execution contexts**:

```
┌─────────────────────────────────────────────────┐
│  Main Process  (Node.js — electron/main.ts)     │
│  • Full Node.js + Electron APIs                 │
│  • Manages BrowserWindow lifecycle              │
│  • Registers all ipcMain.handle() handlers      │
│  • Calls AI SDKs (OpenAI, Anthropic, Gemini)    │
│  • Stores API keys via safeStorage (Keychain)   │
└──────────────────┬──────────────────────────────┘
                   │ IPC (inter-process communication)
┌──────────────────▼──────────────────────────────┐
│  Preload Script  (electron/preload.ts)          │
│  • Runs inside renderer but with Node.js access │
│  • Uses contextBridge.exposeInMainWorld()       │
│  • Wraps ipcRenderer.invoke() into window.api  │
│  • API key values NEVER pass through here       │
│  • Each domain has its own module in            │
│    electron/preload/ (translate, audio, chat…)  │
└──────────────────┬──────────────────────────────┘
                   │ window.api.*
┌──────────────────▼──────────────────────────────┐
│  Renderer Process  (React — src/)               │
│  • Vite + React + TypeScript                    │
│  • No Node.js access (nodeIntegration: false,   │
│    sandbox: true)                               │
│  • Communicates outside only via window.api.*  │
└─────────────────────────────────────────────────┘
```

**Golden rule**: The renderer never sees an API key. Keys exist only in the Main Process.

---

## 2. IPC Protocol

### Basic flow

```
Renderer (React)
  └─► window.api.translate(params)          ← preload wrapper
        └─► ipcRenderer.invoke('translate', params)
              └─► ipcMain.handle('translate', ...)  ← electron/ipc/translate.ts
                    └─► withRetry(() => translateFn(apiKey, ...))
                          └─► OpenAI / Anthropic / Gemini SDK
                                └─► { success, translatedText }
                                      └─► (returned up the chain)
```

### Main IPC channels

| Channel | File | Purpose |
|---|---|---|
| `translate` | `ipc/translate.ts` | Translate text, detect language, rewrite |
| `translate:live-stream` | `ipc/translate.ts` | Stream tokens → subtitle window in realtime |
| `audio:transcribe` | `ipc/transcribe.ts` | Whisper STT (OpenAI) |
| `audio:tts` | `ipc/tts.ts` | Text-to-Speech (OpenAI → Gemini → Edge TTS fallback chain) |
| `chat:send` | `ipc/chat.ts` | Multi-turn AI chat |
| `image:translate` | `ipc/imageTranslate.ts` | Translate text inside images (Gemini vision) |
| `keychain:*` | `ipc/keychain.ts` | Save/get/delete API keys via safeStorage |
| `models:fetch` | `ipc/models.ts` | Fetch model list from provider API |
| `subtitle:*` | `ipc/subtitle.ts` | Control the floating subtitle overlay window |
| `hotkey:*` | `ipc/globalHotkey.ts` | Register / update global OS shortcut |
| `app:openExternal` | `ipc/system.ts` | Open URL in system browser (allowlisted) |

All channel names follow the `domain:action` pattern. Add new channels in the same style.

### Preload domain modules

`electron/preload.ts` is a thin aggregator. Each domain has its own module:

```
electron/preload/
├── keychain.ts       — API key operations
├── translate.ts      — Translation, rewrite, detect, stream
├── audio.ts          — TTS + STT transcription
├── chat.ts           — AI chat + image translate
├── subtitle.ts       — Floating subtitle window
├── system.ts         — OS permissions, external URLs, app metadata
├── updater.ts        — Auto-update check/download/install
├── hotkey.ts         — Global hotkey registration + events
├── legacyAssistant.ts — Browser injection bookmarklet
└── localServer.ts    — Chrome Extension bridge server
```

Adding a new renderer-facing API: create/update the relevant domain module, then re-export from `preload.ts`.

---

## 3. State Management

All client state uses **Zustand** with the **slice pattern** — each feature is its own slice, composed together in `src/store/useAppStore.ts`.

```
useAppStore  (Zustand + persist) — thin aggregator
├── CoreSlice       ← translation state + active page + provider/model selection
├── SettingsSlice   ← user preferences (autoTranslate, fontSize, locale, TTS voice…)
├── HistorySlice    ← translation history + live session history
└── ChatSlice       ← chat sessions + system prompt presets
```

Each slice lives in its own file under `src/store/slices/` — add new state domains there, not in `useAppStore.ts`.

**Persist strategy** — only necessary fields are saved via `partialize`:
```ts
// Persisted to localStorage (debounced 500ms):
sourceLang, targetLang, selectedProvider, selectedModels,
autoTranslate, showFurigana, translationStyle, fontSize, locale,
history, liveSessions, chatSessions, chatSystemPrompt, systemPromptPresets

// NOT persisted: isTranslating, translateError, sourceText, translatedText
```

When adding new state: if it needs to survive a reload, add it to `partialize`. For ephemeral UI state, use component-local `useState`.

---

## 4. Provider System

Three providers are supported: **Gemini**, **Claude**, **OpenAI**. Each provider has a config entry in `src/constants/providers.ts` and per-function implementations in `electron/ipc/`.

### Provider contract

The `ITranslationProvider` interface in `electron/ipc/providers/types.ts` defines what each provider must implement. The `SUPPORTED_PROVIDERS` constant and `isValidProvider()` type guard are the authoritative source for valid provider IDs.

Each IPC handler uses a **registry pattern** — a plain object mapping provider ID to function:

```ts
const TRANSLATE_PROVIDERS: Record<string, TranslateFn> = {
  gemini: translateWithGemini,
  claude: translateWithClaude,
  openai: translateWithOpenAI,
}
// Dispatch:
const translateFn = TRANSLATE_PROVIDERS[provider]
if (!translateFn) return unknownProviderError(provider)
```

This pattern appears for `TRANSLATE_PROVIDERS`, `REWRITE_PROVIDERS`, `DETECT_PROVIDERS`, `STREAM_PROVIDERS`, and `CHAT_PROVIDERS`.

### How to add a new provider (step-by-step)

**Step 1** — Declare provider config (`src/constants/providers.ts`):
```ts
PROVIDERS.push({
  id: 'myprovider',
  name: 'My Provider',
  color: '#FF0000',
  keyPrefix: 'mp-',
  docsUrl: 'https://...',
  models: [{ id: 'my-model-v1', name: 'My Model', tag: 'recommended' }],
})
```

**Step 2** — Extend the `Provider` union type (`src/types/index.ts`):
```ts
export type Provider = 'gemini' | 'claude' | 'openai' | 'myprovider'
```

**Step 3** — Add to `SUPPORTED_PROVIDERS` in `electron/ipc/providers/types.ts`:
```ts
export const SUPPORTED_PROVIDERS = ['gemini', 'claude', 'openai', 'myprovider'] as const
```

**Step 4** — Add a `defaultModels` entry in `DEFAULT_SETTINGS` (`src/constants/providers.ts`).

**Step 5** — Implement SDK calls and register in the provider registries:
- `electron/ipc/translate.ts` — add to `TRANSLATE_PROVIDERS`, `REWRITE_PROVIDERS`, `DETECT_PROVIDERS`, `STREAM_PROVIDERS`
- `electron/ipc/chat.ts` — add to `CHAT_PROVIDERS` (if chat is supported)
- `electron/ipc/tts.ts` — add TTS candidate if provider supports audio synthesis
- `electron/ipc/models.ts` — add model list fetch (if the provider has an API)

**Step 6** — Add a `VERIFY_MODEL_*` constant to `electron/ipc/ipcConstants.ts` for API key verification.

---

## 5. Error Handling & Retry

### Error classification

All AI provider errors are classified in `electron/ipc/errorUtils.ts`:

| Error | Code | Description |
|---|---|---|
| 401 / invalid_api_key | `INVALID_KEY` | Bad API key → show Settings prompt |
| 429 / rate_limit / quota | `RATE_LIMIT` | Too many requests → wait and retry |
| ENOTFOUND / ECONNREFUSED | `NETWORK` | No internet connection |
| Unknown | _(none)_ | Pass message through as-is |

### Retry with exponential backoff

`electron/ipc/retry.ts` provides `withRetry()` — wraps async provider calls with automatic retry for transient network errors:

```ts
// Only retries on network errors (ENOTFOUND, ECONNRESET, timeout, etc.)
// Never retries auth errors (401), rate limits (429), or bad requests
const result = await withRetry(() => translateWithGemini(apiKey, model, ...))
```

Default: 3 attempts, 500ms → 1000ms → 2000ms backoff (capped at 8s).

TTS uses a **provider fallback chain** instead (OpenAI → Gemini → Edge TTS → ElevenLabs) — the first successful provider wins.

---

## 6. Security Model

### API Keys
- Stored using `safeStorage.encryptString()` → OS Keychain (macOS) / Credential Store (Windows).
- **Live only in the Main Process** — the renderer never receives the actual key value.
- The preload only exposes `hasKey(provider)` → `boolean` so the UI knows whether a key is set.

### contextIsolation + sandbox
```
contextIsolation: true  → Renderer and preload JS worlds are fully isolated.
                          The renderer cannot access Node.js globals even via injected scripts.
nodeIntegration: false  → require() / __dirname do not exist in the renderer.
sandbox: true           → Renderer runs inside Chromium sandbox — no filesystem access.
```
Result: even if an XSS vulnerability exists in the renderer, an attacker cannot read API keys or invoke Node.js APIs.

### openExternal URL allowlist
`ipc/system.ts` validates the URL before calling `shell.openExternal()`. Only `https://` with a domain whitelist is permitted — prevents opening `file://` or `javascript:` URIs.

Renderer navigation is also blocked in `main.ts` via the `will-navigate` event — only `file:` and `localhost:5173` are allowed.

---

## 7. Live Translate Pipeline

```
Microphone / System Audio
        │
        ▼
   AudioContext + AnalyserNode
        │
   ┌────▼────────────────────────────┐
   │  VAD — 3-gate filter            │
   │  Gate 1: RMS amplitude > 2      │
   │  Gate 2: sustained ≥ 80ms       │
   │  Gate 3: peak RMS > 4           │
   └────┬──────────────┬─────────────┘
   has speech        silent
        │                └─► discard chunk
        ▼                    (after 30s silence: reset context)
   MediaRecorder (1.5s chunks with VAD early-stop)
        │
        ▼
   ipcRenderer.invoke('audio:transcribe')  →  OpenAI Whisper
        │
   ┌────▼──────────────────────────────────────────┐
   │  Confidence Gates                              │
   │  • noSpeechProb > 0.90   → drop              │
   │  • avgLogprob < -2.0     → drop              │
   │  • compressionRatio > 3.5 → drop             │
   │  • > 60 words/chunk      → drop              │
   │  • > 15 words/sec        → drop              │
   └────┬──────────────────────────────────────────┘
        │
   Hallucination filter + near-duplicate check (Jaccard > 0.92)
        │
   Sentence boundary detection
   (buffer until . ! ? 。— max 2 chunks fallback)
        │
        ▼
   Background translation (fire-and-forget, mountedRef guard)
   ipcRenderer.invoke('translate' | 'translate:live-stream')
        │
        ├── Subtitle ON  → streaming tokens → subtitle window realtime
        └── Subtitle OFF → batch translate  → UI text panel
```

The entire pipeline lives in `src/hooks/useLiveTranslate.ts`. `LiveTranslatePage` is responsible only for rendering UI. The hook uses `mountedRef` to prevent setState calls after component unmount.

---

## Quick Reference

| Task | Where to look |
|---|---|
| Add a new IPC handler | `electron/ipc/` + register in `electron/main.ts` |
| Expose a new API to the renderer | `electron/preload/<domain>.ts` + aggregate in `electron/preload.ts` |
| Add global state | `src/store/slices/` |
| Add a new provider | See Section 4 above |
| Add a new language | `src/constants/providers.ts` → `LANGUAGES` array |
| Shared constants (no duplication) | `electron/ipc/ipcConstants.ts` (main) and `src/constants/` (renderer) |
| Provider type guard | `electron/ipc/providers/types.ts` → `isValidProvider()` |
| Retry network errors | `electron/ipc/retry.ts` → `withRetry()` |
| Error code classification | `electron/ipc/errorUtils.ts` → `classifyProviderError()` |
