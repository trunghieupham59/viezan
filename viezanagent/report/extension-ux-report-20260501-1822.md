# Chrome Extension UX / Local Bridge Report - 2026-05-01 18:22

Workflow: `audit-extension-ux`
Scope: `chrome-extension/`, `electron/ipc/localServer.ts`, preload local-server API.

## Surface Map

| Surface | Files | Status |
|---|---|---|
| Popup | `popup.html`, `popup.js`, `extension-ui.css`, `model-display.js` | Pass with minor hardcoded text debt. |
| Options | `options.html`, `options.js`, `extension-ui.css` | Pass. |
| Content script | `content.js`, `content.css`, `model-display.js` | Pass with broad host permission expected for selection UI. |
| Background | `background.js` | Pass. |
| Local bridge | `electron/ipc/localServer.ts`, `electron/preload/localServer.ts` | Pass with CORS hardening follow-up. |

## Findings

| Severity | Surface | Issue | Fix |
|---|---|---|---|
| Medium | Local bridge | `Access-Control-Allow-Origin: *` plus PNA allows any local webpage to attempt token-authenticated requests. Token auth still protects data, but explicit origin handling would reduce attack surface. | Add allowlist for `chrome-extension://<id>` and trusted local dev origins if extension ID is stable. |
| Medium | Manifest | `host_permissions` includes `<all_urls>` for content script coverage. This is expected for selected-text UI, but broad. | Keep unless product scope narrows supported pages. |
| Low | Extension i18n | Popup/options/content are English-only. | Add locale table if extension localization becomes release requirement. |
| Low | Extension theme | Provider colors repeated in popup/content/options. | Centralize shared extension theme constants. |

## State UX Verdict

| State | Covered |
|---|---|
| Missing token | Yes: popup not-connected panel and options token input. |
| Offline app | Yes: status/config fetch failures show offline/unavailable copy. |
| Loading | Yes: translate/listen loading states. |
| Error | Yes: request failure text and fallback labels. |
| Success | Yes: translation result, copied/replaced/listen states. |

## Bridge Security Verdict

| Check | Verdict |
|---|---|
| Bind address | Good: `127.0.0.1` only. |
| Token format | Good: `sk-vie-<64 hex>`, TTL, named tokens. |
| Token comparison | Good: `crypto.timingSafeEqual`. |
| Token listing | Good: token value is not returned from list endpoint. |
| Payload validation | Mixed: `/api/translate` delegates validation to `lightweightTranslate`; `/api/tts` validates minimal fields. |
| Origin allowlist | Needs hardening: wildcard CORS. |

## Verification

| Command | Result |
|---|---|
| `node --check chrome-extension/popup.js` | Pass |
| `node --check chrome-extension/options.js` | Pass |
| `node --check chrome-extension/content.js` | Pass |
| `node --check chrome-extension/background.js` | Pass |
| `node --check chrome-extension/model-display.js` | Pass |
| `npm run build` | Pass |

Manual smoke not run: translate/copy/replace/listen in an installed Chrome extension still needs browser QA.

