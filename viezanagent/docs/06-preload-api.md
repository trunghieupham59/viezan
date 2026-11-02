# 06 — Preload `window.api` Surface

The preload script (`electron/preload.ts`) runs inside the renderer's isolated world and uses `contextBridge.exposeInMainWorld('api', …)` to publish a strongly-typed object the React app calls.

The aggregator imports per-domain modules from `electron/preload/` and merges them. Each domain module is a plain TypeScript module exporting a function that takes `ipcRenderer` and returns its slice of the API.

> Why a thin aggregator? It keeps each domain testable in isolation, prevents accidental coupling, and makes "what is exposed to the renderer" auditable in one place.

## Security Properties

- `contextIsolation: true` — preload's globals are in a different JS world than the renderer; the renderer cannot patch them.
- `sandbox: true` — preload itself runs without Node integration; only `electron`, `electron/renderer` and a small allowlist of Node modules are reachable.
- API keys are **never** exposed: there is no `keychain.get()` returning a raw key. The only way to read a key value is server-side (Main) — the renderer can only `keychain.has()` or get a masked display string.

## Top-Level Shape (TypeScript)

The full type lives in `src/types/index.ts` (search for `interface WindowApi`). High-level shape:

```ts
interface WindowApi {
  // Translation
  translate(params: TranslateParams): Promise<TranslateResult>
  detectLanguage(params: DetectParams): Promise<DetectResult>
  rewrite(params: RewriteParams): Promise<RewriteResult>
  verifyKey(params: VerifyKeyParams): Promise<VerifyKeyResult>

  liveStream: {
    start(params: LiveStreamParams): Promise<{ sessionId: string }>
    cancel(sessionId: string): Promise<void>
    onDelta(cb: (e: LiveStreamDelta) => void): () => void
    onDone(cb: (e: LiveStreamDone) => void): () => void
    onError(cb: (e: LiveStreamError) => void): () => void
  }

  chat: {
    send(params: ChatParams): Promise<ChatResult>
    onDelta(cb: (e: ChatDelta) => void): () => void
    onDone(cb: (e: ChatDone) => void): () => void
    onError(cb: (e: ChatError) => void): () => void
  }

  imageTranslate(params: ImageTranslateParams): Promise<ImageTranslateResult>

  audio: {
    transcribe(params: TranscribeParams): Promise<TranscribeResult>
    tts(params: TtsParams): Promise<TtsResult>
  }

  models: {
    fetch(params: ModelsFetchParams): Promise<ModelsFetchResult>
  }

  keychain: {
    save(provider: Provider, apiKey: string): Promise<{ success: boolean; error?: string }>
    get(provider: Provider): Promise<{ exists: boolean; masked: string | null; error?: string }>
    delete(provider: Provider): Promise<{ success: boolean; error?: string }>
    hasKey(provider: Provider): Promise<{ exists: boolean; error?: string }>
  }

  localAi: {
    discover(): Promise<LocalAiDiscoverResult>
    benchmark(opts?: { runModelProbe?: boolean }): Promise<LocalAiBenchmarkResult>
    installOllama(): Promise<{ success: boolean; error?: string }>
    cancelInstallOllama(): Promise<void>
    downloadModel(params: { runtime: 'ollama'; modelId: string }): Promise<{ success: boolean }>
    removeModel(params: { runtime: 'ollama'; modelId: string }): Promise<{ success: boolean }>
    resolveAuto(): Promise<{ runtime: string; modelId: string } | null>
    onInstallProgress(cb): () => void
    onModelDownloadProgress(cb): () => void
  }

  subtitle: {
    enable(): Promise<void>
    disable(): Promise<void>
    update(payload: { source: string; translated: string }): void
    setStyle(style): Promise<void>
    setVisible(visible: boolean): Promise<void>
  }

  hotkey: {
    get(): Promise<string>
    set(accelerator: string): Promise<{ success: boolean; error?: string }>
    clear(): Promise<void>
    onTriggered(cb: () => void): () => void
  }

  system: {
    openExternal(url: string): Promise<{ success: boolean; error?: string }>
    getInfo(): Promise<AppInfo>
    checkPermissions(): Promise<Permissions>
    requestPermissions(kind: 'microphone' | 'screen'): Promise<{ granted: boolean }>
    openLogs(): Promise<void>
  }

  updater: {
    check(): Promise<void>
    download(): Promise<void>
    install(): Promise<void>
    dismiss(): Promise<void>
    onChecking(cb): () => void
    onAvailable(cb): () => void
    onNotAvailable(cb): () => void
    onDownloadProgress(cb): () => void
    onDownloaded(cb): () => void
    onError(cb): () => void
  }

  localServer: {
    createToken(params: { name: string; ttlDays: number }): Promise<{
      success: boolean; token?: string; id?: string; name?: string
      createdAt?: number; expiresAt?: number; error?: string
    }>
    listTokens(): Promise<{
      success: boolean; port: number
      tokens: Array<{ id: string; name: string; createdAt: number; expiresAt: number }>
    }>
    deleteToken(params: { id: string }): Promise<{ success: boolean; error?: string }>
    regenerateToken(params: { id: string; ttlDays?: number }): Promise<{
      success: boolean; token?: string; id?: string; name?: string
      createdAt?: number; expiresAt?: number; error?: string
    }>
    syncConfig(params: {
      provider: string
      model: string
      ttsMode?: 'free' | 'auto' | 'premium'
      ttsVoice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
    }): Promise<{ success: boolean }>
  }

  webSearch: {
    search(params): Promise<WebSearchResult>
    fetchPage(url: string): Promise<{ html: string }>
  }

  quickChat: {
    show(): Promise<void>
    hide(): Promise<void>
    toggle(): Promise<void>
    setHotkey(accelerator: string): Promise<{ success: boolean }>
    onText(cb: (e: { text: string }) => void): () => void
  }

  legacyAssistant: {
    getBookmarklet(): Promise<string>
    translate(params): Promise<TranslateResult>
  }
}

declare global {
  interface Window { api: WindowApi }
}
```

## Event Subscriptions

All `on<Event>` methods follow the same pattern:

```ts
const unsubscribe = window.api.chat.onDelta((evt) => { /* … */ })
// later
unsubscribe()
```

Internally the preload module wires `ipcRenderer.on('chat:delta', listener)` and returns a function that calls `ipcRenderer.removeListener`. **Always call the returned function on unmount** to avoid leaks (`useEffect` cleanup).

## Per-Domain Module Map

| Preload module | Provides |
|---|---|
| `electron/preload/translate.ts` | `translate`, `detectLanguage`, `rewrite`, `verifyKey`, `liveStream.*` |
| `electron/preload/chat.ts` | `chat.*`, `imageTranslate` |
| `electron/preload/audio.ts` | `audio.transcribe`, `audio.tts` |
| `electron/preload/keychain.ts` | `keychain.*`, `models.fetch` |
| `electron/preload/system.ts` | `system.*` |
| `electron/preload/updater.ts` | `updater.*` |
| `electron/preload/hotkey.ts` | `hotkey.*` |
| `electron/preload/subtitle.ts` | `subtitle.*` |
| `electron/preload/legacyAssistant.ts` | `legacyAssistant.*` |
| `electron/preload/localServer.ts` | `localServer.*` |
| `electron/preload/quickChat.ts` | `quickChat.*` |
| `electron/preload/webSearch.ts` | `webSearch.*` |

The subtitle window has its own minimal preload (`electron/subtitle-preload.ts`) exposing only `window.subtitle.onUpdate(cb)` and `window.subtitle.ready()`.

## Adding A New API

1. Pick (or create) a domain module under `electron/preload/`.
2. Define typed wrappers around `ipcRenderer.invoke('<domain>:<action>', payload)`.
3. Re-export the slice from `electron/preload.ts` so it ends up on `window.api`.
4. Update the `ViezanApi` interface in `src/types/index.ts`.
5. (If it's a streaming channel) export `on<Event>` returning an unsubscribe.
6. Bundle is built by esbuild via `npm run bundle:preloads` (already part of `build:electron`).

## Pitfalls

- **Don't pass functions or non-cloneable objects across IPC.** The structured-clone algorithm rejects them. Keep payloads to plain JSON + `ArrayBuffer`/`Uint8Array` for binary.
- **Don't expose anything that returns a raw API key.** If you need to make a request server-side using a key, do it in Main and return the result, not the key.
- **AbortSignal** is not natively transferable. If you need cancellation, the preload should send a separate `…:cancel` message with the same `sessionId`.
- **Keep the surface flat.** Prefer `window.api.audio.transcribe(...)` over deep nesting; it makes types and the IPC reference doc readable.
