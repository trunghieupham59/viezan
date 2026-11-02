# Duplicate / Hardcode Clean Report - 2026-05-02 23:06

Workflow: `check-dup-hardcode`
Input reports:

- `docs/agents/fixes/dup-hardcode-report-20260502-2215.md`
- `docs/agents/fixes/dup-hardcode-report-20260502-2246.md`

Scope: `src/`, `electron/`, `chrome-extension/`, plus repo-level secret/key-file scan
Mode: residual bugs fixed, then re-scan and verify

## Tổng Quan

| Category | Previous | Current | Status |
|---|---:|---:|---|
| Duplicate code | 2 raw clone groups | 0 raw clone groups | Clean |
| Markup duplicate | 2 accepted groups | 0 groups | Clean |
| JavaScript duplicate | 0 | 0 | Clean |
| TypeScript/TSX duplicate | 0 | 0 | Clean |
| CSS duplicate | 0 | 0 | Clean |
| Hardcoded credential literals | 0 | 0 | Clean |
| Private key / env / cert files | 0 | 0 | Clean |
| Extension CSS hex hardcode | Low residual | 0 hits | Clean |
| Direct icon-library imports | 0 | 0 | Clean |
| Inline SVG outside icon registry | Accepted `ChartBlock` only | Accepted `ChartBlock` only | Accepted |

## Fixes Applied In This Pass

### [Fixed] Content script missing option helper at runtime

Files:

- `chrome-extension/local-bridge.js`
- `chrome-extension/extension-options.js`
- `chrome-extension/content.js`
- `chrome-extension/popup.js`
- `chrome-extension/options.js`

Issue:

- `content.js` could throw `Cannot read properties of undefined (reading 'populateTargetLanguageSelect')` when a tab kept an older content-script context or `extension-options.js` was not injected before `content.js`.

Change:

- Moved the shared language/style option helpers into `ViezanLocalBridge`, which is already a required dependency for content/popup/options flows.
- Kept `extension-options.js` as a backward-compatible alias to `ViezanLocalBridge`.
- Added a content-script guard plus local select-population fallback so stale/misordered injections do not throw into the host page.
- Updated popup/options to fall back to `ViezanLocalBridge` if `ViezanExtensionOptions` is unavailable.

Result:

- `content.js` no longer reads `populateTargetLanguageSelect` from an undefined global.
- The shared option metadata still has one implementation, so `jscpd` remains clean.

### [Fixed] Static option-list duplication in Chrome Extension HTML

Files:

- `chrome-extension/extension-options.js`
- `chrome-extension/popup.html`
- `chrome-extension/options.html`
- `chrome-extension/content.js`
- `chrome-extension/popup.js`
- `chrome-extension/options.js`
- `chrome-extension/manifest.json`
- `chrome-extension/background.js`

Change:

- Added `ViezanExtensionOptions` as a shared plain-script module for target-language and translation-style metadata.
- Removed duplicated `<option>` blocks from `popup.html` and `options.html`.
- Removed the same option-list HTML from the content-script tooltip.
- Loaded `extension-options.js` in popup, options, manifest content scripts, and background reinjection.

Result:

- `jscpd` markup clones dropped from `2` to `0`.
- The extension now has one source of truth for language/style option values.

### [Fixed] Extension CSS direct hex hardcode

Files:

- `chrome-extension/extension-ui.css`
- `chrome-extension/content.css`

Change:

- Converted extension theme colors from scattered hex literals into CSS custom properties using `rgb(...)` values.
- Replaced direct selector-level hex colors with `var(--vzn-...)` / `var(--tre-...)`.
- Kept content-script variables scoped to `#Viezan-btn` and `#tre-result-tooltip` to avoid leaking theme variables into host pages.

Result:

- `rg -n --glob '*.{ts,tsx,css}' "#[0-9a-fA-F]{3,6}" chrome-extension` returns no matches.

## Re-scan Results

### jscpd

```text
Files analyzed: 266
Total lines: 32,083
Total tokens: 263,371
Clones found: 0
Duplicated lines: 0 (0%)
Duplicated tokens: 0 (0%)

javascript: 0 clones
markup: 0 clones
json: 0 clones
css: 0 clones
markdown: 0 clones
typescript: 0 clones
tsx: 0 clones
```

### Hardcode / Secret Scan

| Scan | Result |
|---|---|
| Credential assignment literal scan | Clean |
| Private key / token regex scan | Clean |
| Private key / env file scan | Clean |
| Extension CSS hex scan | Clean |
| Direct icon-library import scan | Clean |
| Inline SVG outside icon registry | Only accepted chart SVG in `ChartBlock` |

## Remaining Items

No duplicate-code or hardcode bug remains from `dup-hardcode-report-20260502-2246.md`.

Accepted item:

- `src/components/markdown/ChartBlock.tsx` uses inline SVG for bar/line/pie chart rendering. This is data visualization, not an icon-hardcode issue.

## Verification

```bash
node --check chrome-extension/background.js
node --check chrome-extension/content.js
node --check chrome-extension/extension-options.js
node --check chrome-extension/local-bridge.js
node --check chrome-extension/model-display.js
node --check chrome-extension/options.js
node --check chrome-extension/popup.js
node --check chrome-extension/provider-meta.js
npm exec --package @biomejs/biome@2.4.13 -- biome check chrome-extension/background.js chrome-extension/content.js chrome-extension/extension-options.js chrome-extension/local-bridge.js chrome-extension/options.js chrome-extension/popup.js chrome-extension/manifest.json chrome-extension/options.html chrome-extension/popup.html chrome-extension/content.css chrome-extension/extension-ui.css chrome-extension/README.md
npx tsc --noEmit --pretty false
npx tsc -p tsconfig.electron.json --noEmit --pretty false
npm test -- --run
npm run build
npm exec --package jscpd -- jscpd --min-lines 8 --min-tokens 80 --threshold 0 --reporters console,json --output /private/tmp/viezan-jscpd-clean src electron chrome-extension --ignore "**/__tests__/**,**/*.test.ts,**/*.test.tsx,src/i18n/locales/**,src/components/ui/icons/**,**/node_modules/**,**/dist/**,**/build/**"
rg -n --glob '*.{ts,tsx,css}' "#[0-9a-fA-F]{3,6}" chrome-extension
```

Results:

- Extension JS syntax checks: passed.
- Biome changed-file check: passed.
- Renderer TypeScript: passed.
- Electron TypeScript: passed.
- Vitest: 36 files passed, 602 tests passed.
- Production build: passed.
- `jscpd`: 0 clones, exit code 0.
- Extension CSS hex scan: clean.
- Runtime helper hotfix verification: `node --check`, Biome, TypeScript, `jscpd`, and `npm run build` passed after the fallback change.

## Current Status

| Item | Status |
|---|---|
| Residual static markup duplicate | Fixed |
| Residual extension CSS hex hardcode | Fixed |
| Duplicate scan | Clean |
| Hardcode scan | Clean for reported categories |
| Report refreshed | Done |
