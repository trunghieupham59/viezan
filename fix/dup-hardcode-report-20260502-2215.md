# Duplicate / Hardcode Report - 2026-05-02 22:15

Workflow: `check-dup-hardcode`
Scope: `src/`, `electron/`, `chrome-extension/`, plus repo-level secret/key-file scan
Mode: report-only; no source fixes applied

## Tổng Quan

| Category | Result | Notes |
|---|---:|---|
| Hardcoded credential literals | 0 | Không tìm thấy `apiKey/secret/password/token = "..."` style literal trong `src`, `electron`, `chrome-extension`. |
| Private key / env / cert files | 0 | Không còn `.pem`, `.key`, `.p12`, `.pfx`, `.env` trong phạm vi repo scan. |
| Duplicate code | 15 raw clone groups | `jscpd` quét 258 source files, 32,292 lines, 422 duplicated lines (1.31%). Sau dedupe còn 7 nhóm đáng theo dõi. |
| Inline SVG outside icon registry | Accepted | Chỉ còn `src/components/markdown/ChartBlock.tsx`; đây là data visualization, không phải hardcoded icon. |
| Direct icon-library imports | 0 | Không có import trực tiếp `lucide-react`, `react-icons`, `@heroicons`, `@phosphor-icons` ngoài icon registry. |
| Hardcoded UI text | Medium | Chrome Extension vẫn hardcode English strings trong popup/options/content tooltip; chưa có policy EN-only hoặc `chrome.i18n`. |
| Hardcoded CSS values | Low | Extension CSS có palette variables nhưng vẫn dùng nhiều hex trực tiếp ở rule body. |

## Duplicate Code

### [High] Chrome Extension lặp local app/TTS helper giữa content script và popup

Files:

- `chrome-extension/content.js:183-193` and `chrome-extension/popup.js:33-43`
- `chrome-extension/content.js:282-366` and `chrome-extension/popup.js:55-139`

Issue: `getAppConfig`, `/api/tts` request, `TTS_LANG_TO_BCP47`, browser speech fallback, base64 audio URL, and stop/reset flow are duplicated across the content tooltip and popup. This is the largest extension duplicate group and will drift when local bridge response shape or TTS state handling changes.

Suggested refactor: extract shared browser-extension runtime helpers into a loaded script such as `chrome-extension/local-bridge.js` or `chrome-extension/tts-client.js`, then call it from both `content.js` and `popup.js`.

### [High] API-key card UI duplicated between provider keys and deep-search keys

Files:

- `src/components/ApiKeyInput.tsx:100-124` and `src/components/chat/DeepResearchApiSection.tsx:160-184`
- `src/components/ApiKeyInput.tsx:150-158` and `src/components/chat/DeepResearchApiSection.tsx:205-213`
- `src/components/ApiKeyInput.tsx:170-238` and `src/components/chat/DeepResearchApiSection.tsx:224-292`
- `src/components/ApiKeyInput.tsx:194-248` and `src/components/chat/DeepResearchApiSection.tsx:248-300`

Issue: the saved/empty badge, masked password input, delete action, verify/save button, and result message structure are near-duplicates with only provider metadata and error states changed.

Suggested refactor: introduce a small shared `ApiCredentialCard` / `CredentialInputCard` component that accepts provider icon, docs action, saved state, masked value, verify/delete callbacks, and status text.

### [Medium] History tab selection/list patterns repeat across three tabs

Files:

- `src/pages/history/ChatHistoryTab.tsx:39-61`
- `src/pages/history/TranslationHistoryTab.tsx:43-65`
- `src/pages/history/LiveHistoryTab.tsx:48-70`
- `src/pages/history/TranslationHistoryTab.tsx:102-137` and `src/pages/history/LiveHistoryTab.tsx:109-145`

Issue: bulk selection state, select-all, selected delete, card border classes, checkbox rendering, and expand/open skeleton are repeated per history tab.

Suggested refactor: extract a generic `useHistoryBulkSelection(ids, onDelete)` hook first. If UI drift stays low after that, extract a `HistorySelectableRow` shell.

### [Medium] STT/TTS provider key blocks repeat the same masked input flow

Files:

- `src/pages/settings/SttSection.tsx:292-330`
- `src/pages/settings/TtsSection.tsx:190-225`

Issue: Groq STT and ElevenLabs TTS key cards share saved/empty badge, masked input, `Enter` save, delete button, placeholder, and input styling.

Suggested refactor: reuse the credential-card component from the API-key refactor, or extract a smaller `MaskedSecretInputRow` first.

### [Medium] IPC provider/model validation duplicated in chat and image translate

Files:

- `electron/ipc/chatValidation.ts:40-58`
- `electron/ipc/imageTranslate.ts:183-201`

Issue: both parsers validate payload object, provider, provider support, model string, trim model, and max model length with almost identical flow.

Suggested refactor: add shared helper in `electron/ipc/ipcValidation.ts`, e.g. `parseProviderModel(rawParams, { payloadName, maxModelChars })`.

### [Low] Search result formatting helpers duplicated between research services

Files:

- `src/services/deepResearchService.ts:135-151`
- `src/services/smartThinkingService.ts:96-114`

Issue: `getDate`, `hasWebSearch`, and `formatSearchResults` share the same purpose and nearly the same implementation.

Suggested refactor: extract to `src/services/researchFormatting.ts` if both services keep evolving together.

### [Low / Accepted] Popup/options static HTML shares language and style options

Files:

- `chrome-extension/options.html:75-108`
- `chrome-extension/popup.html:48-80`

Issue: target-language and translation-style option markup is duplicated, but these are static MV3 HTML entry points without a build-time templating layer.

Suggested refactor: only worth fixing if the extension adds `chrome.i18n` or a shared DOM builder for popup/options.

## Hardcode

### [Medium] Chrome Extension has hardcoded English UI strings

Files:

- `chrome-extension/content.js:70-115`
- `chrome-extension/content.js:236-256`
- `chrome-extension/popup.js:185-205`
- `chrome-extension/options.html:75-116`
- `chrome-extension/popup.html:48-86`

Issue: visible labels and statuses such as `Style`, `Original`, `Translation`, `Active`, `Provider unavailable`, `Model unavailable`, `Default Target Language`, and option labels are embedded directly in extension HTML/JS. This is acceptable only if the extension is intentionally English-only, but that policy is not stated in `chrome-extension/README.md`.

Suggested fix: either document the extension as EN-only, or add `_locales/*/messages.json` plus `chrome.i18n.getMessage()` and generate option labels from shared locale data.

### [Low] Extension CSS still repeats raw hex colors outside palette variables

Files:

- `chrome-extension/extension-ui.css:7-26`
- `chrome-extension/extension-ui.css:84`
- `chrome-extension/extension-ui.css:104-105`
- `chrome-extension/content.css:20-44`
- `chrome-extension/content.css:68-83`
- `chrome-extension/content.css:125-138`

Issue: `extension-ui.css` defines `--vzn-*` palette variables, but both extension CSS files still use direct hex values in many selectors. This is not a runtime bug, but it weakens theme consistency and makes extension style updates repetitive.

Suggested fix: move shared colors/shadows into CSS variables in one extension stylesheet and replace direct hex usages with `var(--vzn-...)`.

### [Low / Accepted] ChartBlock uses inline SVG for data visualization

File: `src/components/markdown/ChartBlock.tsx:166`, `src/components/markdown/ChartBlock.tsx:223`, `src/components/markdown/ChartBlock.tsx:292`

Issue: static scan flags `<svg>` outside `src/components/ui/icons/`. Manual review confirms this component draws bar/line/pie charts, not icons. It already receives localized labels via `labels`.

Decision: accepted; do not move these SVGs into the icon registry.

### [Low / Accepted] Local/dev URLs and ports are named runtime constants

Files:

- `electron/ipc/localServer.ts:33`
- `chrome-extension/content.js:20`
- `chrome-extension/options.js:1`
- `chrome-extension/popup.js:1`
- `chrome-extension/background.js:10`
- `electron/main.ts:98-100`, `electron/main.ts:183-184`, `electron/main.ts:254-255`, `electron/main.ts:358`
- `electron/ipc/localAi.ts:146-148`

Issue: static scan finds loopback ports and dev URLs. These are expected for the local browser bridge, Vite dev renderer, and local AI runtime defaults. They are named or guarded in the main Electron process; the extension repeats `39875` because it runs as plain browser JS outside the renderer bundle.

Suggested fix: optional only. If extension build tooling is introduced, generate the extension port from the same source as `LOCAL_SERVER_PORT`.

### [Low / Accepted] Edge TTS public protocol token

File: `electron/ipc/ipcConstants.ts:150-154`

Issue: `EDGE_TTS_TRUSTED_TOKEN` looks secret-like to scanners. The inline comment documents it as a public Edge TTS protocol token used by open-source clients, not a user/provider credential.

Decision: accepted; keep the explanatory comment and monitor if Microsoft changes the protocol.

## False Positives / Clean Areas

- No hardcoded cloud provider key or local bridge API key literal was found.
- No private key/certificate/env file was found in the repo scan.
- Test fixture URLs and fake keys are ignored.
- Provider API bases in `electron/ipc/ipcConstants.ts`, web-search URLs in `electron/ipc/webSearch.ts`, and public docs URLs in `src/constants/urls.ts` are centralized constants, not scattered hardcode.
- `src/components/ui/icons/**` SVG and brand colors are allowed by the icon-registry rule.

## Tóm Tắt & Ưu Tiên

| Loại vấn đề | Critical | High | Medium | Low | Tổng |
|---|---:|---:|---:|---:|---:|
| Duplicate Code | 0 | 2 | 3 | 2 | 7 |
| Hardcode Credential | 0 | 0 | 0 | 0 | 0 |
| Hardcode URL / Config | 0 | 0 | 0 | 2 accepted | 2 |
| Hardcoded UI String | 0 | 0 | 1 | 0 | 1 |
| Hardcoded UI Value | 0 | 0 | 0 | 1 | 1 |
| Hardcode Icon | 0 | 0 | 0 | 1 accepted | 1 |

Top priorities:

1. Extract Chrome Extension local app/TTS helper shared between `content.js` and `popup.js`.
2. Extract reusable credential-card UI for provider keys and deep-search keys.
3. Decide Chrome Extension i18n policy: document EN-only or implement `chrome.i18n`.

## Commands Run

```bash
rg -n --glob '*.{ts,tsx,js}' "(api[_-]?key|secret|password|token|credential)\s*=\s*['\"][^'\"]{8,}" src electron chrome-extension
rg -n --glob '*.{ts,tsx,js}' "['\"]https?://[^'\"]+['\"]" src electron chrome-extension
rg -n --glob '*.{ts,tsx,js}' "(setTimeout|setInterval|port|limit|size|delay)\s*[,(]\s*[0-9]{3,}" src electron chrome-extension
rg -n --glob '*.{tsx,ts}' '<svg' src -g '!src/components/ui/icons/**'
rg -n --glob '*.{ts,tsx}' "from ['\"](lucide-react|react-icons|@heroicons|@phosphor-icons)" src -g '!src/components/ui/icons/**'
rg -n --glob '*.{ts,tsx,js}' "===\s*['\"][a-zA-Z_-]{3,}['\"]" src electron chrome-extension
rg -n --glob '*.{ts,tsx,css}' "#[0-9a-fA-F]{3,6}" src chrome-extension
rg -n "apiKey|secret|token|password" src electron/preload chrome-extension
rg -n --pcre2 --glob '*.{ts,tsx,js,jsx,html,css}' "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src electron chrome-extension
rg -n "BEGIN (RSA |EC |OPENSSH |DSA |)?PRIVATE KEY|AIza[0-9A-Za-z_-]{20,}|sk-(ant-|proj-)?[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{20,}|ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}" -g '!node_modules/**' -g '!dist/**' -g '!dist-electron/**' -g '!release/**' -g '!*.png' -g '!*.jpg' -g '!*.jpeg' -g '!*.gif' -g '!*.icns' -g '!*.ico' .
rg --files -g '*.pem' -g '*.key' -g '*.p12' -g '*.pfx' -g '*.crt' -g '*.cer' -g '*.env' -g '.env*' -g '!node_modules/**' -g '!dist/**' -g '!dist-electron/**' -g '!release/**'
npm exec --package jscpd -- jscpd --min-lines 8 --min-tokens 80 --threshold 0 --reporters console,json --output /private/tmp/viezan-jscpd src electron chrome-extension --ignore "**/__tests__/**,**/*.test.ts,**/*.test.tsx,src/i18n/locales/**,src/components/ui/icons/**,**/node_modules/**,**/dist/**,**/build/**"
```

## Current Status

| Item | Status |
|---|---|
| Report saved | Done |
| Source code changed | No |
| Secret/key leak check | Clean |
| Duplicate scan | 15 raw groups, grouped into 7 report findings |
| Follow-up fixes | Not applied in this run |
