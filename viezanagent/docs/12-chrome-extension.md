# 12 — Chrome Extension

The browser extension under `chrome-extension/` lets users translate selected web text without leaving the page. It connects to the desktop app over a local HTTP server (`127.0.0.1:39875`) authenticated with a Viezan-internal connection key.

> The extension never holds a cloud provider API key. Its only secret is the `sk-vie-…` connection key, which is scoped to the local desktop app on the same machine.

## Manifest (MV3)

`chrome-extension/manifest.json` declares:

- `manifest_version: 3`.
- `permissions`: `storage`, `activeTab`, `scripting`, `contextMenus`.
- `host_permissions`: `http://127.0.0.1:39875/*` for the local bridge. Page
  access is handled by declared content-script matches plus `activeTab` for
  user-triggered scripting.
- `background`: `background.js` (service worker).
- `action`: popup `popup.html`.
- `options_page`: `options.html`.
- `commands`:
  - `translate-selection` — `Alt+T` / `Option+T` (default).
- `content_scripts` matching `<all_urls>` injecting `content.js` + `content.css`
  and bridge helpers. Local server calls from content pages are relayed through
  the extension service worker so the native bridge can keep a narrow CORS
  policy.

## Files

| File | Role |
|---|---|
| `background.js` | Service worker — registers context menu, commands, message routing, calls the local server. |
| `content.js` | Injected on every page — selection detection, floating button, in-page tooltip with translation result. |
| `content.css`, `extension-ui.css` | Styles for the floating button and tooltip; uses isolated class names to minimize host-page collisions. |
| `popup.html`, `popup.js` | Toolbar popup — quick translate textarea + status indicator (connected / disconnected). |
| `options.html`, `options.js` | Options page — server URL, connection key, default languages, default provider, theme. |
| `model-display.js` | Helper to pretty-print provider/model labels (mirrors `src/utils/modelDisplay.ts`). |
| `provider-meta.js` | Shared extension-side provider badge colors, aligned with `src/constants/providers.ts`. |
| `icons/` | 16/32/48/128 icons. |
| `README.md` | User-facing extension guide. |

## Local Bridge Protocol

The desktop app starts an HTTP server on `127.0.0.1:39875` (configurable, but the extension defaults to this). It accepts only loopback connections and requires:

```
X-Viezan-Token: sk-vie-<64 lowercase hex chars>
Origin: chrome-extension://<extension id>
Content-Type: application/json
```

Endpoints (subset; see `electron/ipc/localServer.ts`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/status` | `{ success, version }` |
| GET | `/api/config` | Current provider/model/TTS config synced from the desktop app |
| POST | `/api/translate` | Lightweight translate path (delegates to `lightweightTranslate.ts`) |
| POST | `/api/tts` | Text-to-speech path (delegates to `tts.ts`) |

The server runs **only while the desktop app is open**. If the user closes the app, the extension's status indicator goes red and the floating button is disabled.

### Connection key (`sk-vie-…`)

- Created from **Settings → Browser Extension** as a named connection API key with a configurable day-based TTL.
- Stored by `electron/ipc/localServer.ts` in the user's userData folder; active key values are never returned by `listTokens`.
- The key value is shown only at creation or regeneration time. The user must copy it into the extension options page then.
- Each request from the extension carries this key in `X-Viezan-Token`.
- Multiple API keys can coexist so users can revoke or regenerate one browser/device without replacing every connection.

## End-to-End Flow

```
User selects text on a webpage
  └─ content.js detects selection → shows floating "Viezan" button near caret
        └─ click button (or Alt+T)
              └─ message → background.js
                    └─ POST http://127.0.0.1:39875/api/translate
                          X-Viezan-Token: sk-vie-…
                          { text, sourceLang, targetLang, translationStyle, provider, model }
                                └─ Electron localServer → lightweightTranslate
                                      └─ provider selected in the desktop app or request
                                            └─ { translatedText }
                                                  └─ JSON response
                                                        └─ background → content.js
                                                              └─ tooltip renders translation in-page
```

The extension never holds the provider's API key. The desktop app's Main process owns the key and uses it server-side.

## Options Page

Stored in `chrome.storage.local`:

- `treToken` — the `sk-vie-…` connection API key.
- `treTargetLang` — default target language.
- `treTranslationStyle` — default translation style.

If `treToken` is missing, the popup and floating button show a "Connect Viezan" CTA pointing to the desktop app's Settings → Browser Extension.

## States the UI Must Cover

The `audit-extension-ux` workflow asserts each state has a clear visual:

| State | Trigger | Expected UX |
|---|---|---|
| **Missing token** | First install, no key pasted | Popup: "Open Viezan to copy your connection key" |
| **Disconnected** | Server not running | Popup + floating button: red "Viezan offline" pill |
| **Loading** | Translation in flight | Spinner near the selection |
| **Error** | 401 / 429 / 5xx | Toast with mapped message ("Connection key invalid", "Rate limit", "Network") |
| **Success** | 200 | Tooltip with translation, copy button, "Open in Viezan" link |

## Local Development

Load `chrome-extension/` in Chrome → `chrome://extensions` → Developer Mode → "Load unpacked".

To test against a dev desktop build:

1. Run `npm run dev` so the local server is up on `39875`.
2. In the extension's Options, paste the connection key from Settings → Browser Extension.
3. Open any page, select text, click the Viezan button.

For local ZIP testing, load `chrome-extension/` as an unpacked extension or zip the folder without any signing key. Official releases use `.github/workflows/release.yml` to create `viezan-chrome-extension.zip`, which contains the `chrome-extension/` folder and excludes PEM/private-key files.

## Security Notes

- The local server **only binds to `127.0.0.1`** (never `0.0.0.0`).
- PEM/private-key files must stay out of source control and release ZIPs.
- Only an allowed extension/local origin plus a valid `X-Viezan-Token` key passes the auth filter.
- API key values are one-time reveal values in the desktop UI; list responses expose metadata only.
- The extension's content script keeps style + behavior isolated from the host page (no global event listeners, no direct DOM mutation outside its own elements).
- See [`security-boundaries.md`](./security-boundaries.md) for the boundary rules; the `audit-extension-ux` and `audit-local-first-security` workflows cover this surface during audits.
