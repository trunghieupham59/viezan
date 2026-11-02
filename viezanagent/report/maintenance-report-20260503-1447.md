# Maintenance Report - 2026-05-03 14:47

Agent: `viezanagent/agent/maintenance`
Primary workflow: `viezanagent/workflow/maintenance/maintenance.json`

## Scope

Repository root: `/Users/phamtrunghieu/Github/personal/viezan`

Branch state:

- Root repo: `develop...origin/develop`, clean except modified `viezanagent` submodule content.
- `viezanagent`: detached `HEAD`, modified docs and this report.
- Submodule pointer before maintenance: `2daaa4a4824376dae4e641c79d7122f2dde26649 viezanagent (heads/main-22-g2daaa4a)`.

Maintenance scope:

- `src/`
- `electron/`
- `chrome-extension/`
- `README.md`, `chrome-extension/README.md`
- `viezanagent/agent`, `viezanagent/rule`, `viezanagent/skill`, `viezanagent/workflow`, `viezanagent/docs`, `viezanagent/report`

Capabilities used:

- Rules: `viezan-product-engineering`, `generate-code`
- Workflows: `maintenance`, `fix-vscode-problems`, `check-dup-hardcode`, `score-code`, `split-ui-component`, `sync-docs`, `audit-i18n-coverage`, `audit-local-first-security`, `audit-extension-ux`, `audit-live-perf`, `release-readiness`
- Skills: `fix-vscode-problems`, `check-dup-hardcode`, `score-code`, `split-ui-component`, `viezan-doc-sync`, `viezan-i18n-audit`, `viezan-ipc-security-audit`, `viezan-extension-ux`, `viezan-live-perf-audit`

## Maintenance Gate Matrix

| Gate | Status | Evidence | Report Section | Follow-up |
|---|---|---|---|---|
| Repo Scope | Pass | `git status --short --branch`; `git submodule status`; recent reports listed from `viezanagent/report` and `viezanagent/fix` | Scope | Commit/update submodule pointer when ready |
| Diagnostics | Pass | `npm run build`, `npm run build:electron`, `npm test -- --run`, `npx --no-install biome check .` all passed | Diagnostics | None |
| System Score | Pass | `score-code` Viezan Electron rubric applied against diagnostics, scans and source evidence | System Score | Keep manual product smoke before release |
| Duplicate Code Audit | Pass | `jscpd`: 266 files, 32,239 lines, 265,068 tokens, 0 clones | Duplicate Code Audit | None |
| Hardcode & Secret Audit | Pass | credential assignment scan clean; private key/env scan clean; extension hex clean; direct icon library import clean; committed secret regex reviewed as false positives | Hardcode & Secret Audit | Continue manual review for new generated docs examples |
| UI/Component/Extension Audit | Pass | 92 TSX UI/page files, 7 icon registry files, 14 extension root files scanned; no extension emoji/SVG hits; accepted `ChartBlock` data SVG only | UI/Component/Extension Audit | Manual visual smoke remains outside CLI |
| Docs/I18n/Security Gates | Pass | i18n key parity: 609 keys in VI/EN/JA with 0 missing; security scans reviewed; docs drift fixed and stale markers re-scanned clean | Docs/I18n/Security Gates | None |
| Live/Performance Gate | Partial | Static lifecycle/perf scans show mounted guards, cleanup paths and named constants; manual live audio smoke not run in CLI | Docs/I18n/Security Gates | Run live audio/subtitle smoke before release |
| Release Readiness | Partial | Build/test/Biome passed; `build:mac` and `build:win` passed; signing/notarization/product smoke still require release environment | Docs/I18n/Security Gates | Run interactive product smoke and signed/notarized CI release gate before publishing |

## Diagnostics

| Command | Status | Evidence |
|---|---|---|
| `npm run build` | Pass | Electron TypeScript, preload bundles and Vite production build completed; 162 modules transformed |
| `npm run build:electron` | Pass | `tsc -p tsconfig.electron.json` and both preload bundles completed |
| `npm test -- --run` | Pass | 37 test files passed; 606 tests passed |
| `npx --no-install biome check .` | Pass | 291 files checked; no fixes applied |
| `node --check chrome-extension/popup.js` | Pass | Syntax check passed |
| `node --check chrome-extension/options.js` | Pass | Syntax check passed |
| `node --check chrome-extension/content.js` | Pass | Syntax check passed |
| `node --check chrome-extension/background.js` | Pass | Syntax check passed |
| `git diff --check` | Pass | No whitespace errors |
| `markdownlint-cli2 "viezanagent/**/*.md" "README.md" "chrome-extension/README.md"` | Pass | 78 Markdown files linted; 0 errors |
| `npm run maintenance:verify` | Pass | Build, tests, Biome, duplicate scan, docs lint and agent JSON/ref validation pass through local dev tooling |
| `npm run build:mac` | Pass | Built macOS DMG/ZIP for arm64 and x64; signing/notarization skipped due missing valid Developer ID / Apple credentials |
| `npm run build:win` | Pass | Built Windows NSIS installer `Viezan-2.0.0-x64.exe`; Wine emitted FreeType warnings but command exited 0 |
| `viezanagent` JSON parse/ref validation | Pass | 31 JSON files parsed; 229 relative refs checked |

Environment notes:

- `npm exec --package jscpd` and `markdownlint-cli2` first failed in sandbox with `ENOTFOUND registry.npmjs.org`.
- Both were rerun with approved npm registry access and passed.
- Follow-up fix added `jscpd` and `markdownlint-cli2` as devDependencies plus local maintenance scripts, so repeat runs no longer require transient `npm exec` package resolution.

## System Score

Rubric: `score-code` with `viezan-electron` overlay.

Weighted total: **92.1 / 100**

| Criterion | Weight | Score | Evidence | Reason for deduction |
|---|---:|---:|---|---|
| Correctness | 20 | 96 | Build and 606 tests pass; extension JS syntax passes | Manual product smoke not run |
| Architecture | 15 | 91 | Main/preload/renderer split preserved; local server, provider and UI modules remain separated | `viezanagent/docs/06-preload-api.md` high-level type sample still intentionally compact rather than exhaustive |
| Security | 15 | 92 | No committed secrets; local bridge binds `127.0.0.1`; docs now match `X-Viezan-Token` and one-time key reveal model | Renderer still transiently handles user-entered provider keys for save/verify, which is expected but sensitive |
| Reliability | 15 | 90 | Live Translate has `mountedRef`, cleanup listeners, stream/track stops and AudioContext close paths | Live audio/subtitle manual smoke not run |
| Code Quality | 10 | 91 | Biome clean; jscpd 0 clones; icon import scan clean | Several intentional enum/status string comparisons remain |
| Maintainability | 10 | 90 | Agent capability refs validated; docs drift fixed in one focused patch | Agent docs require continued sync after bridge changes |
| Testing | 10 | 94 | 37 files / 606 tests passed; extension syntax checks passed | No browser extension manual smoke in CLI |
| Performance | 3 | 88 | Live pipeline uses named timing/threshold constants and cleanup; no obvious repaint/leak finding from static scan | Runtime latency not measured |
| Documentation | 2 | 92 | Local bridge docs corrected and markdownlint clean | Some API examples are summarized, not full generated types |

## Duplicate Code Audit

Command:

```bash
npm exec --yes --package jscpd -- jscpd --min-lines 8 --min-tokens 80 --threshold 0 --reporters console --output /private/tmp/viezan-jscpd-maintenance src electron chrome-extension --ignore "**/__tests__/**,**/*.test.ts,**/*.test.tsx,src/i18n/locales/**,src/components/ui/icons/**,**/node_modules/**,**/dist/**,**/build/**"
```

Result:

| Format | Files | Lines | Tokens | Clones | Duplicated Lines | Duplicated Tokens |
|---|---:|---:|---:|---:|---:|---:|
| JavaScript | 86 | 6,620 | 55,720 | 0 | 0% | 0% |
| Markup | 2 | 229 | 2,587 | 0 | 0% | 0% |
| JSON | 1 | 70 | 367 | 0 | 0% | 0% |
| CSS | 3 | 1,450 | 9,478 | 0 | 0% | 0% |
| Markdown | 1 | 79 | 1,109 | 0 | 0% | 0% |
| TypeScript | 91 | 13,880 | 115,058 | 0 | 0% | 0% |
| TSX | 82 | 9,911 | 80,749 | 0 | 0% | 0% |
| Total | 266 | 32,239 | 265,068 | 0 | 0% | 0% |

Top prioritized findings:

| Priority | Finding | Status |
|---|---|---|
| High | Exact / near duplicate clone groups | Clean |
| Medium | Extension markup/CSS duplication previously tracked in `dup-hardcode-report-20260502-2246.md` | Clean after previous fix; current jscpd confirms 0 clones |
| Low | None | No action |

## Hardcode & Secret Audit

| Category | Command / Evidence | Result | Severity |
|---|---|---|---|
| Credential assignment literals | `rg "(api[_-]?key\|secret\|password\|token\|credential)\s*=\s*['\"][^'\"]{8,}" src electron chrome-extension` | 0 hits | Pass |
| Private key / env / cert files | `find` excluding `node_modules`, `dist`, `dist-electron`, `release` for `*.pem`, `*.key`, `.env*` | 0 hits | Pass |
| Potential committed secrets | `rg "sk-[A-Za-z0-9]\|AIza...\|OPENAI_API_KEY..."` | Hits are docs examples, tests, provider key prefixes and generated `sk-vie-*` format code; no real secret found | Pass |
| Magic timeout/port/limit/size literals | `rg "(setTimeout\|setInterval\|port\|limit\|size\|delay)\s*[,)]\s*[0-9]{3,}"` | 0 hits | Pass |
| Hardcoded URL / endpoint | Provider endpoints, local dev URLs, local AI endpoints and URL tests found; they are constants/config/test fixtures | Accepted |
| Direct icon library imports | `rg "from ['\"](lucide-react\|react-icons\|@heroicons\|@phosphor-icons)" src -g "!src/components/ui/icons/**"` | 0 hits | Pass |
| Inline SVG outside icon registry | `rg "<svg" src -g "!src/components/ui/icons/**"` | 3 hits in `src/components/markdown/ChartBlock.tsx`; accepted as data chart rendering, not icon hardcode | Accepted |
| Extension CSS hex values | `rg "#[0-9a-fA-F]{3,6}" chrome-extension` | 0 hits | Pass |
| Magic strings | Equality scan found enum/status/event/platform comparisons; no Critical/High hardcode requiring refactor | Accepted |

False-positive notes:

- `src/components/markdown/ChartBlock.tsx` uses SVG to render user-visible chart data.
- `sk-vie-*` hits in docs/tests are format examples or generated token pattern code.
- Provider URL constants and local AI defaults are intentional integration endpoints.

## UI/Component/Extension Audit

Scope:

- `src/components/`
- `src/pages/`
- `src/components/ui/icons/`
- `chrome-extension/`

Component map summary:

| Surface | Count / Evidence | Verdict |
|---|---:|---|
| TSX component/page files | 92 files from `find src/components src/pages -name "*.tsx" -maxdepth 3` | Pass |
| Icon registry files | 7 files in `src/components/ui/icons` | Pass |
| Extension root files | 14 root files under `chrome-extension` | Pass |
| Extension storage usage | `chrome.storage.local` used for `treToken`, `treTargetLang`, `treTranslationStyle` | Pass |
| Local bridge security surface | `server.listen(..., "127.0.0.1")`, CORS origin filtering and `X-Viezan-Token` header found | Pass |

Inline SVG / icon findings:

| Finding | Status | Note |
|---|---|---|
| Inline SVG outside icon registry | Accepted | `ChartBlock` chart rendering only |
| Direct icon library imports outside registry | Pass | 0 hits |
| Extension emoji or inline SVG action/status icon | Pass | 0 hits |

Extension UI drift:

| Check | Result |
|---|---|
| Popup/options/content use local storage keys consistently | Pass |
| Missing/offline/loading/error states present | Pass by static scan |
| Direct cloud provider SDK/API call in extension | Pass; provider names only in display metadata |
| Manual popup/options/selection smoke | Not run; requires browser session |

## Docs/I18n/Security Gates

Docs drift:

| Finding | Severity | Fix |
|---|---|---|
| Local bridge docs still described `Authorization: Bearer`, `/v1/*`, `localServer:getKey`, `rotateKey`, `setTtl`, `bridgeTokenTtl` and per-tab session token behavior | Medium | Updated `viezanagent/docs/05-ipc-reference.md`, `06-preload-api.md`, `08-state-management.md`, `12-chrome-extension.md`, `13-security.md` |

Docs verification:

- Stale marker search for `localServer:getKey`, `localServer:rotateKey`, `localServer:setTtl`, `/v1/translate`, `/v1/health`, `/v1/quick-chat`, `Authorization: Bearer sk-vie`, `bridgeTokenTtl`, `per-tab short-lived token`, `connectionKey`, `interface ViezanApi`, `bearer key`: 0 hits in checked docs/readmes.
- `markdownlint-cli2`: 77 files, 0 errors.

i18n coverage:

| Locale | Key Count | Missing vs Others |
|---|---:|---:|
| `vi` | 609 | 0 |
| `en` | 609 | 0 |
| `ja` | 609 | 0 |

Hardcoded UI string scan:

- Renderer JSX text scan has accepted brand/provider/test/comment hits such as `Viezan`, provider names and icon `<title>` values.
- Extension UI strings are plain JS/HTML by design; they are covered by extension parity/static UX scan.

Security/local-first:

| Check | Result |
|---|---|
| Renderer Node/Electron import scan | No renderer boundary blocker found |
| IPC surface scan | Domain handlers present; build/tests pass |
| External URL scan | `app:openExternal` gates through `isAllowedExternalUrl`; URL tests exist |
| Network/data egress scan | Provider/local runtime/web search endpoints only; no analytics/telemetry hit |
| Local server bind/origin/token scan | Loopback bind, origin filter and `X-Viezan-Token` present |
| Committed secret scan | No real secret found |

Live/performance:

| Check | Result |
|---|---|
| Audio APIs | Expected `MediaRecorder`, `getUserMedia`, `getDisplayMedia`, `AudioContext` usage found |
| Mounted/abort guard | `mountedRef` guards present in `useLiveTranslate.ts` |
| Cleanup | Track stop, recorder stop, AudioContext close and subtitle listener cleanup found |
| Magic performance thresholds | Named constants present for chunk duration, summary limits and VAD thresholds |
| Raw transcript/audio debug logging | No raw transcript log finding; transcribe logs are provider availability/fallback state |
| Manual live smoke | Not run in CLI |

Release readiness:

| Check | Result |
|---|---|
| Automated tests/build | Pass |
| Package build (`build:mac`, `build:win`) | Pass |
| macOS signing/notarization | Partial: package builds pass, but Developer ID identity and Apple notarization credentials are not configured locally |
| Windows installer | Pass: NSIS x64 installer generated |
| Product smoke | Not run: requires interactive desktop/browser session |
| Release notes/assets | Not run: no version/tag/release scope |

## Findings

| Severity | Finding | Status |
|---|---|---|
| Medium | Local bridge docs drifted from current multi-API-key implementation | Fixed |
| Low | Manual extension/live smoke not covered by CLI | Remaining queue |
| Info | `jscpd` and `markdownlint-cli2` required npm registry access when not already installed | Fixed by adding devDependencies and local scripts |
| Info | Unsigned/unnotarized local macOS packages | Expected local environment limitation; release CI needs Developer ID / notarization secrets |

No Critical or High code/security findings were found in this maintenance pass.

## Fixes Applied

Updated documentation to match the current local bridge and preload API:

- `viezanagent/docs/05-ipc-reference.md`
  - Replaced stale System IPC rows with current `app:checkScreenPermission`, `app:openExternal`, `app:relaunch`.
  - Replaced old Local Server lifecycle/key/`/v1/*` docs with current multi-key IPC and `/api/*` routes.
- `viezanagent/docs/06-preload-api.md`
  - Updated type pointer from `ViezanApi` to `WindowApi`.
  - Updated `keychain` and `localServer` API samples.
- `viezanagent/docs/08-state-management.md`
  - Removed stale `bridgeTokenTtl` persistence docs.
- `viezanagent/docs/12-chrome-extension.md`
  - Updated bridge auth to `X-Viezan-Token`.
  - Updated endpoints, storage keys and connection key behavior.
- `viezanagent/docs/13-security.md`
  - Updated local server threat model and key-management details.

Added repeatable maintenance tooling:

- `package.json`
  - Added `check:agent`, `check:biome`, `check:duplicates`, `lint:docs`, `maintenance:verify`.
  - Added `jscpd` and `markdownlint-cli2` to devDependencies.
- `package-lock.json`
  - Locked the new dev tooling dependencies.
- `scripts/validate-viezanagent.mjs`
  - Parses every `viezanagent/**/*.json` file.
  - Validates every relative JSON capability reference.

## Verification

| Command | Status |
|---|---|
| `npm run build` | Pass |
| `npm run build:electron` | Pass |
| `npm test -- --run` | Pass: 37 files / 606 tests |
| `npx --no-install biome check .` | Pass |
| `npm run maintenance:verify` | Pass: build, tests, Biome, duplicate scan, docs lint, agent validation |
| `node --check chrome-extension/popup.js` | Pass |
| `node --check chrome-extension/options.js` | Pass |
| `node --check chrome-extension/content.js` | Pass |
| `node --check chrome-extension/background.js` | Pass |
| `npm run check:duplicates` | Pass: 266 files / 0 clones |
| `npm run lint:docs` | Pass: 78 files / 0 errors |
| `npm run check:agent` | Pass: 31 JSON files / 229 refs |
| `npm run build:mac` | Pass: generated macOS DMG/ZIP for arm64 and x64; signing/notarization skipped locally |
| `npm run build:win` | Pass: generated Windows NSIS x64 installer |
| `git diff --check` | Pass |
| `node` locale parity script | Pass: 609 keys per locale, 0 missing |
| `node` JSON parse validation | Pass: 31 JSON files |
| `node` relative ref validation | Pass: 229 refs |
| Stale bridge docs marker search | Pass: 0 hits |

## Remaining Queue

| Priority | Item | Reason |
|---|---|---|
| Medium | Run browser extension manual smoke | Requires Chrome session: popup/options/selection tooltip translate/copy/replace/listen and app-offline state |
| Medium | Run Live Translate manual smoke | Requires microphone/system audio/subtitle runtime session |
| Medium | Run signed/notarized release gate in CI before publishing | Local macOS package build passed but valid Developer ID/notarization credentials are not available locally |

## Report Completeness Checklist

| Requirement | Status |
|---|---|
| All required gates appear in Maintenance Gate Matrix | Done |
| Every required section exists even when clean | Done |
| Skipped gates use Not run/Partial with reason | Done |
| Commands or scanned scopes are recorded | Done |
| Critical/High findings are fixed or blocked with next action | Done; none found |
| System Score is separate from findings | Done |
| Duplicate Code Audit and Hardcode & Secret Audit are separate | Done |
| UI/Component/Extension Audit is separate | Done |
| Verification lists commands actually run | Done |
