# 04 — Electron Main Process

The main process is the privileged side of the app: full Node.js + Electron APIs, OS keychain access, BrowserWindow lifecycle, and the home of every `ipcMain.handle` registration. The entry point is **`electron/main.ts`**.

## Responsibilities

- Create and manage all native windows.
- Enforce a renderer security baseline (`contextIsolation`, `nodeIntegration: false`, `sandbox: true`, `will-navigate` policy).
- Hold a single-instance lock to avoid `EADDRINUSE` on the local-server port.
- Wire every IPC domain handler (translate, chat, tts, subtitle, …).
- Own external URL gatekeeping via `electron/ipc/externalUrl.ts`.
- Start the Chrome Extension local server and the auto-updater on app ready.
- Tear everything down cleanly on quit.

## Boot Sequence

1. **Command-line switches** are set early:
   - `--autoplay-policy=no-user-gesture-required` so TTS playback can start after async work without requiring a click.
   - On macOS only, `--disable-features=UseSkiaRenderer` to dodge a Metal/Skia overlay rendering glitch in some Electron 41 builds.
2. **Single-instance lock** — `app.requestSingleInstanceLock()`. If a second launch happens, the existing main window is focused and the new process exits. This protects port `39875` from collisions.
3. `app.whenReady()` then:
   - Creates the main `BrowserWindow`.
   - Calls `registerXxxHandlers(ipcMain)` for every IPC domain.
   - Starts the local server (Chrome Extension bridge) on `127.0.0.1:39875`.
   - Initializes `electron-updater` (in production only).
   - Registers the global hotkey from persisted settings.
4. On `window-all-closed` Viezan does not quit on macOS (standard convention) and unregisters global hotkeys before terminating elsewhere.

## Windows

### Main window

- `width: 1280`, `height: 800`, custom traffic-light region on macOS (`titleBarStyle: 'hiddenInset'`, `trafficLightPosition`).
- `webPreferences`:
  - `preload: dist-electron/preload.js`
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
  - `webSecurity: true`
- Loads `http://localhost:5173` in dev, `dist/index.html` in prod.

### Quick Chat window

- Frameless, transparent, on top, skipped from taskbar/dock pre-2.0; in 2.0 macOS focus stealing and dock reopen behaviour were fixed.
- Renderer entry: `quick-chat.html` → `src/quick-chat-main.tsx` → mounts `<AIChatPopup />`.
- Show/hide is controlled by:
  - the global hotkey (default `Alt+Space` / `Option+Space`),
  - the `quickChat:show/hide/toggle` IPC channels.
- Position is computed relative to the active display so it appears centred horizontally near the top.

### Subtitle overlay window

- Frameless, transparent, always-on-top, click-through (`setIgnoreMouseEvents(true, { forward: true })`).
- Loads `public/subtitle.html` (copied to `dist/subtitle.html`).
- Preload: `electron/subtitle-preload.ts` exposing a tiny `window.subtitle` API for receiving `subtitle:update` events.
- Created lazily when the user enables subtitles in Live Translate; destroyed on disable or app quit.

## Navigation Policy

Inside `createWindow()` the main window registers:

```ts
mainWindow.webContents.on('will-navigate', (e, url) => {
  // Only allow file:// (prod) and localhost:5173 (dev).
  // Everything else is blocked.
})
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  // Routed through isAllowedExternalUrl(url). If allowed → shell.openExternal(url) and deny.
  // Otherwise → deny.
})
```

This guarantees the renderer can never escape into a regular browsing context, and any "open in browser" action is host-allowlisted (see [`security-boundaries.md`](./security-boundaries.md)).

## IPC Registration

`main.ts` imports each `register*Handlers` function and calls them once at boot:

```ts
registerKeychainHandlers(ipcMain)
registerSystemHandlers(ipcMain)
registerTranslateHandlers(ipcMain)
registerChatHandlers(ipcMain)
registerImageTranslateHandlers(ipcMain)
registerTranscribeHandlers(ipcMain)
registerTtsHandlers(ipcMain)
registerModelsHandlers(ipcMain)
registerSubtitleHandlers(ipcMain)
registerLocalAiHandlers(ipcMain)
registerLocalServerHandlers(ipcMain)
registerWebSearchHandlers(ipcMain)
registerLegacyAssistantHandlers(ipcMain)
registerHotkeyHandlers(ipcMain)
registerUpdaterHandlers(ipcMain)
registerQuickChatHandlers(ipcMain)
```

If you add a new IPC domain, follow the same pattern: export `register<Domain>Handlers(ipcMain)` from your file and add the call here.

## Storage Locations

| Data | Where | How |
|---|---|---|
| API keys | OS keychain (macOS Keychain, Windows Credential Manager, libsecret) | `safeStorage.encryptString` via `keychain.ts` |
| App preferences (debounced) | `localStorage` in the renderer | Zustand `persist` middleware |
| Encrypted small blobs (e.g. browser bridge connection key) | `app.getPath('userData')` | `storage.ts` (`safeStorage` + JSON file) |
| Auto-updater cache | platform default | `electron-updater` |
| Crash dumps | platform default | Electron built-in |

## Auto-Updater

`electron/ipc/updater.ts` wraps `electron-updater`:

- `updater:check` → `autoUpdater.checkForUpdates()`
- `updater:download` → `autoUpdater.downloadUpdate()`
- `updater:install` → `autoUpdater.quitAndInstall()`
- Events `updater:checking`, `updater:available`, `updater:not-available`, `updater:download-progress`, `updater:downloaded`, `updater:error` are forwarded to the renderer via `webContents.send`.

Updates use the GitHub provider configured in `package.json` `build.publish`. Code signature verification is disabled on Windows (`verifyUpdateCodeSignature: false`) because the project ships unsigned Windows builds today.

## Global Hotkey

`electron/ipc/globalHotkey.ts` registers a single OS-level shortcut (default `Alt+T` / `Option+T` for "Translate selection"). The renderer can update it via `hotkey:set`. On registration failure (e.g. another app holding it) the handler returns `{ success: false, error }` so settings can show a clear error.

## Cleanup

On `before-quit` and `window-all-closed`:

- Global hotkey is unregistered (`globalShortcut.unregisterAll()`).
- Local server is closed.
- Subtitle and Quick Chat windows are destroyed.
- Active streams are aborted (each provider adapter respects `AbortSignal`).

## When to Touch `main.ts`

| Change | Touch `main.ts`? |
|---|---|
| Add/modify a BrowserWindow | yes |
| Add a new IPC domain | yes (call its `register` function) |
| Change command-line switches / autoplay / GPU flags | yes |
| Tweak navigation / openExternal policy | usually `externalUrl.ts`; only touch `main.ts` if it's a per-window event |
| Add a renderer-only feature | no |
