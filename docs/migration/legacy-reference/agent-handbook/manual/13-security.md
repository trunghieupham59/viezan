# 13 — Security & Privacy Model

Viezan's security posture is built around one principle: **the renderer is treated as untrusted**. All sensitive operations (API keys, network calls, file access, local server) live in the Main process.

This page summarizes the threat model, the boundaries enforced, and the audit checklist. For low-level rules see [`security-boundaries.md`](./security-boundaries.md).

---

## Threat Model

| Threat | Mitigation |
|---|---|
| XSS / supply-chain compromise of renderer JS | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. No raw API keys are reachable from the renderer. |
| Malicious URL opened via the renderer | `shell.openExternal` is gated by `isAllowedExternalUrl()`. Renderer navigation restricted to `file://` and `localhost:5173`. |
| Renderer-controlled command execution (e.g. install Ollama) | Install command is **fixed** in Main; the renderer cannot pass any argument. |
| API key exfiltration | Keys live only in OS keychain via `safeStorage`; renderer can only ask `hasKey` or get a masked display string. |
| Chrome extension or third-party app talking to the local server | Loopback-only bind, allowed extension/local origin check, `X-Viezan-Token: sk-vie-...` connection API key, one-time key reveal, metadata-only key listing. |
| Provider key leaking via logs / errors | Errors are classified and the original message is sanitized server-side. Keys are never serialized to console or shipped logs. |
| Telemetry / data exfiltration | No analytics. No Viezan-hosted server. The only network egress is to the configured AI provider (or the local runtime). |

---

## Process Boundaries

### `contextIsolation: true`

Preload's globals run in a different JS world than the renderer. Even if the renderer is compromised, it cannot access preload globals or `electron`. The bridge is `contextBridge.exposeInMainWorld('api', …)` exposing **only the typed `window.api` surface**.

### `nodeIntegration: false`

The renderer cannot use `require`, `__dirname`, `process` or any Node.js global. All Node code is in the Main process or preload.

### `sandbox: true`

The Renderer process runs inside Chromium's OS-level sandbox. No filesystem access, no child processes, no raw sockets.

### `webSecurity: true`

CORS / mixed-content rules apply normally. The renderer cannot disable them.

---

## Navigation Policy

Defined in `electron/main.ts` and `electron/ipc/externalUrl.ts`.

- `will-navigate` on the main window is restricted to `file://` (production load) and `http://localhost:5173` (dev). Anything else is cancelled.
- `setWindowOpenHandler` routes external URLs through `isAllowedExternalUrl(url)`:
  - HTTPS only.
  - Host must be in `ALLOWED_HTTPS_HOSTS` (provider docs, GitHub, MoMo, etc.).
  - GitHub is restricted to `/trunghieupham59/viezan/releases` and child paths.
  - The macOS scheme `x-apple.systempreferences:` is allowed only for the Screen Recording deep-link used by Live Translate.
- Allowed → `shell.openExternal(url)` and the window-open is denied (we never open in-app); blocked → silent deny.

> Do not call `shell.openExternal()` directly from a new IPC handler. Add an entry to the allowlist or extend `isAllowedExternalUrl()` if the product needs a new destination.

---

## API Key Storage

`electron/ipc/keychain.ts` is the only module that touches keys.

- Stored as encrypted strings via `safeStorage.encryptString()` (OS Keychain on macOS, Credential Manager on Windows, libsecret on Linux).
- Persisted to a small JSON file under `app.getPath('userData')`.
- On read, `safeStorage.decryptString()` returns the cleartext **only inside Main**.
- The renderer-facing API exposes only:
  - `keychain:set` — accepts a key, returns success.
  - `keychain:has` — returns `boolean`.
  - `keychain:delete` — returns success.
  - `keychain:get-mask` — returns a masked string for display (`sk-***...****abcd`).

There is **no** `keychain:get` returning a raw key. Server-side calls retrieve the key directly via `getStoredApiKey(provider)` inside Main and pass it into the provider adapter.

If `safeStorage.isEncryptionAvailable()` returns false (Linux without a keychain backend), `keychain:set` returns `{ success: false, errorCode: 'NO_ENCRYPTION' }` and the UI tells the user to install/launch a keyring agent.

---

## IPC Input Validation

Every handler validates payloads **before** destructuring or routing.

- Generic helpers in `electron/ipc/ipcValidation.ts` (string, enum, length, MIME, language code).
- Domain-specific validators sit alongside their handler:
  - `electron/ipc/translateValidation.ts`
  - `electron/ipc/chatValidation.ts`
  - Inline guards inside `imageTranslate.ts`, `transcribe.ts`, `tts.ts`, `webSearch.ts`.
- Invalid payload → `{ success: false, errorCode: 'INVALID_INPUT', error: <human-readable> }`.
- The provider field is parsed as a non-empty string before any provider-specific routing.

When changing these boundaries, write or update specs that prove:

- Allowed and blocked external URLs (`externalUrl.ts`).
- Representative invalid IPC payloads.
- Any new enum / MIME / language-code / length checks.
- Any handler that introduces a new `shell.openExternal()` path.

---

## Local Server (Chrome Extension Bridge)

Runs in Main via `electron/ipc/localServer.ts`.

- Bound to `127.0.0.1:39875` only — never `0.0.0.0`.
- Auth requirements:
  1. `X-Viezan-Token: sk-vie-<64 lowercase hex chars>` — matches one active connection API key.
  2. `Origin: chrome-extension://<id>` or another explicitly allowed local/extension origin.
- Endpoints are intentionally narrow: `/api/status`, `/api/config`, `/api/translate`, `/api/tts`. No filesystem or shell access is reachable.
- Key management is exposed through `localServer:createToken`, `localServer:listTokens`, `localServer:deleteToken` and `localServer:regenerateToken`. Key values are returned only on create/regenerate.

---

## Provider Errors and Logs

`electron/ipc/errorUtils.ts → classifyProviderError()` maps SDK / fetch errors to a small set of `errorCode` values (`INVALID_KEY`, `RATE_LIMIT`, `NETWORK`, …) without reflecting the original key or sensitive headers back to the renderer.

Logs in development go to the terminal; production logs are written via Electron's default log facility. Keys are not part of any log statement (lint via `check-dup-hardcode` workflow if you suspect an accidental log).

---

## Audit Checklist (use with `audit-local-first-security` workflow)

- [ ] Renderer cannot reach a raw provider API key.
- [ ] All new IPC handlers register through `register*Handlers` and validate inputs before routing.
- [ ] No new `shell.openExternal()` outside `externalUrl.ts` allowlist.
- [ ] Renderer navigation policy unchanged or tightened (`will-navigate`).
- [ ] Local server still bound to loopback; auth and rate limit unchanged.
- [ ] No new direct `fetch` from renderer to a provider (must go through Main).
- [ ] No new persisted blob containing sensitive data outside `safeStorage`.
- [ ] No new background telemetry / metrics endpoint.
- [ ] Tests cover the boundary changes.

---

## Privacy Promises (User-Facing)

- No Viezan-hosted relay server.
- No analytics collected by the app.
- Translation, chat and live audio are sent **only** to the runtime/provider the user chose, and **only** when the user explicitly triggers them.
- API keys live encrypted in the OS keychain on the user's machine.
- The Chrome Extension carries a Viezan-internal key (`sk-vie-…`), not a provider key.

These statements should match `docs/migration/legacy-reference/agent-handbook/product-intro.md` and the README. The `sync-docs` workflow checks for drift.
