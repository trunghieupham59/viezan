# Duplicate / Hardcode Report - 2026-05-02 02:45

Workflow: `check-dup-hardcode`
Scope: `src/`, `electron/`, `chrome-extension/`, `.github/workflows/`
Focus: hardcode / secret / config literals

## Summary

| Category | Result | Notes |
|---|---:|---|
| Hardcoded credential literals in app code | 0 | No `apiKey/secret/password/token = "..."` style literal found in `src`, `electron`, or `chrome-extension`. |
| Private key material | Fixed | `chrome-extension/chrome-extension.pem` was removed from the repo; release CRX signing now uses `CHROME_EXTENSION_PEM_BASE64`. |
| Secret-like tokens | Low/Accepted | `EDGE_TTS_TRUSTED_TOKEN` is a named public protocol token, not an app secret, but remains a brittle external-service constant. |
| Hardcoded URL / endpoint | Medium | Provider/API base URLs are mostly centralized; local extension and local AI loopback endpoints are expected. |
| Inline SVG outside icon registry | Low/Accepted | `ChartBlock.tsx` renders data charts with SVG. This is not an icon-registry violation. |
| External icon-library imports | 0 | No direct `lucide-react` / `react-icons` / `@heroicons` imports outside the icon registry. |
| User-facing literal text | Fixed | Chart labels now come from `src/i18n`. |
| Repeated provider brand colors | Fixed | Extension provider colors now live in `chrome-extension/provider-meta.js`. |

## Findings

### [Fixed / Critical] Tracked Chrome extension private key

Files:

- `chrome-extension/chrome-extension.pem:1`
- `.github/workflows/release.yml:481`
- `.github/workflows/release.yml:484`

Issue: the repository tracks a PEM private key, and the main release workflow packs the Chrome extension with `--pack-extension-key=chrome-extension/chrome-extension.pem`. This is real key material committed to source control. Even if the key is only for extension packaging, it should be treated as compromised once tracked in a repo.

Resolution:

1. Removed `chrome-extension/chrome-extension.pem` from the working tree.
2. Added `*.pem`, `*.key`, `*.p12`, and `*.pfx` to `.gitignore`.
3. Updated `.github/workflows/release.yml` to restore the CRX signing key from `CHROME_EXTENSION_PEM_BASE64` into `$RUNNER_TEMP` at runtime.
4. Updated `docs/migration/legacy-reference/agent-handbook/manual/12-chrome-extension.md` to document CI-secret signing and the no-PEM-in-repo rule.

Operational note: the old committed key should still be treated as compromised; create and store a rotated base64-encoded PEM value in the GitHub secret before the next CRX release.

### [Fixed / Medium] Legacy assistant injects hardcoded UI/CSS/SVG through a JS string

File: `electron/ipc/legacyAssistant.ts:80`

Issue: `buildAssistantScript()` returns an inline script containing CSS values, an inline SVG, local endpoint construction, and English UI strings. It is isolated from React UI, but it still violates the strict hardcode/icon/style rule.

Resolution: moved the injected CSS/message payload into named constants, escaped injected token/language values with `JSON.stringify`, and replaced the inline SVG payload with a text mark. The legacy path still has a self-contained injected script by design, but the hardcoded payload is no longer scattered inside the generated script body.

### [Fixed / Medium] Provider brand colors are duplicated across extension surfaces

Files:

- `chrome-extension/content.js:199`
- `chrome-extension/popup.js:147`
- `chrome-extension/options.js:92`
- `src/constants/providers.ts:3`

Issue: provider color values are repeated in multiple extension files and desktop constants. This creates drift risk when provider branding or palette changes.

Resolution: added `chrome-extension/provider-meta.js`, loaded it in `manifest.json`, `popup.html`, `options.html`, and the background re-injection path, then replaced duplicated provider color tables in `content.js`, `popup.js`, and `options.js`.

### [Fixed / Low] Chart rendering keeps English UI fallbacks outside i18n

File: `src/components/markdown/ChartBlock.tsx:147`

Issue: chart accessibility labels and one visible chart label are hardcoded English strings: `Bar chart`, `Line chart`, `Pie chart`, and `Total`. The inline SVG is acceptable because this component draws charts, not icons, but the text should still go through locale keys if charts are considered app UI.

Resolution: added chart label keys to `src/i18n/types.ts` and `src/i18n/locales/{en,vi,ja}.ts`, then passed localized labels from `MarkdownText` into `ChartBlock` and `parseChartArtifact`.

### [Low/Accepted] Edge TTS trusted token is a public protocol constant

File: `electron/ipc/ipcConstants.ts:154`

Issue: `EDGE_TTS_TRUSTED_TOKEN` looks like a secret to static scanners and is sent as `TrustedClientToken`. The code documents it as public and uses it to reproduce Edge TTS' browser protocol, so it is not a leaked user/API secret.

Recommended fix: leave it as a named constant, but keep the comment explicit and consider making Edge TTS fallback behavior tolerant if Microsoft changes or blocks this public token.

## False Positives / Accepted Constants

- Test URLs in `*.test.ts` are fixtures.
- Provider API bases in `electron/ipc/ipcConstants.ts` and web-search URLs in `electron/ipc/webSearch.ts` are named constants.
- Dev URLs `http://localhost:5173` in `electron/main.ts` are guarded by dev mode.
- Local AI endpoints `127.0.0.1:11434`, `1234`, and `8080` in `electron/ipc/localAi.ts` are expected runtime discovery defaults.
- Local extension bridge port `39875` is centralized in `electron/ipc/localServer.ts` and repeated in plain Chrome extension scripts because they run outside the bundled renderer.
- `src/components/markdown/ChartBlock.tsx` inline `<svg>` is data visualization, not a hardcoded icon.
- Brand SVG paths and colors under `src/components/ui/icons/` are allowed by the icon-registry rule.

## Commands Run

```bash
rg -n --glob '*.{ts,tsx,js}' "(api[_-]?key|secret|password|token|credential)\s*=\s*['\"][^'\"]{8,}" src electron chrome-extension
rg -n --glob '*.{ts,tsx,js}' "['\"]https?://[^'\"]+['\"]" src electron chrome-extension
rg -n --glob '*.{ts,tsx,js}' "(setTimeout|setInterval|port|limit|size|delay)\s*[,(:=]\s*[0-9]{3,}" src electron chrome-extension
rg -n --glob '*.{tsx,ts}' '<svg' src -g '!src/components/ui/icons/**'
rg -n --glob '*.{ts,tsx}' "from ['\"](lucide-react|react-icons|@heroicons|@phosphor-icons)" src -g '!src/components/ui/icons/**'
rg -n "apiKey|secret|token|password" src electron/preload chrome-extension
rg -n "BEGIN (RSA |EC |OPENSSH |DSA |)?PRIVATE KEY|AIza[0-9A-Za-z_-]{20,}|sk-(ant-|proj-)?[0-9A-Za-z_-]{20,}|xox[baprs]-[0-9A-Za-z-]{20,}|ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}" -g '!node_modules/**' -g '!dist/**' -g '!release/**' -g '!*.png' -g '!*.jpg' -g '!*.jpeg' -g '!*.gif' .
rg --files -g '*.pem' -g '*.key' -g '*.p12' -g '*.pfx' -g '*.crt' -g '*.cer' -g '*.env' -g '.env*' -g '!node_modules/**' -g '!dist/**' -g '!release/**'
npm exec --package @biomejs/biome@2.4.13 -- biome check .github/workflows/release.yml .gitignore chrome-extension/background.js chrome-extension/content.js chrome-extension/manifest.json chrome-extension/options.html chrome-extension/options.js chrome-extension/popup.html chrome-extension/popup.js chrome-extension/provider-meta.js electron/ipc/legacyAssistant.ts src/components/MarkdownText.tsx src/components/__tests__/MarkdownText.test.tsx src/components/markdown/ChartBlock.tsx src/i18n/types.ts src/i18n/locales/en.ts src/i18n/locales/vi.ts src/i18n/locales/ja.ts
npx tsc -p tsconfig.json --noEmit --pretty false
npx tsc -p tsconfig.electron.json --noEmit --pretty false
npx vitest run src/components/__tests__/MarkdownText.test.tsx
node --check chrome-extension/provider-meta.js
node --check chrome-extension/content.js
node --check chrome-extension/background.js
```

## Current Status

| Item | Status |
|---|---|
| Tracked PEM key removed | Done |
| Release workflow uses CI secret | Done |
| Docs aligned with CI-secret signing | Done |
| Extension provider colors consolidated | Done |
| Chart labels moved to i18n | Done |
| Legacy assistant payload extracted from generated script body | Done |
| Private key rotation in GitHub/Chrome release process | Manual follow-up required |
