# Source Code Check - 2026-04-29

Scope: current source in `src`, `electron`, and `chrome-extension`.

Applied ViezanAgent assets:
- Workflow: `score-code`
- Workflow: `check-dup-hardcode`
- Workflow: `audit-local-first-security`
- Workflow: `release-readiness`
- Skill: `score-code`
- Skill: `check-dup-hardcode`
- Skill: `viezan-ipc-security-audit`
- Rule: `viezan-product-engineering`
- Rule: `generate-code`

## Executive Summary

After the final follow-up pass, all findings from the original report are resolved and the remaining improvement items have been reduced further. External URL opening is allowlisted and now rejects near-miss GitHub paths and unrelated macOS Settings deep-links, core IPC handlers validate renderer-controlled payloads before use, local extension token comparison is hardened, runtime glyph/status icons were removed from i18n, Deep Research, and provider metadata, Live Translate VAD policy, transcript assembly, speaker diarization, and post-session AI actions are split into focused modules, chat/translate IPC validators and translate provider/prompt/chunking helpers are isolated, provider SDK adapters are split by provider, dedicated validation/helper tests were added, architecture docs were expanded, and route-level code splitting removed the Vite large-chunk warning.

The codebase passes TypeScript, test, and production build checks.

## Findings After Fix

| Status | Severity | Area | File | Result |
|---|---|---|---|---|
| Resolved | High | Security | `electron/ipc/externalUrl.ts`, `electron/main.ts`, `electron/ipc/system.ts`, `electron/ipc/updater.ts` | Added shared URL allowlist. `setWindowOpenHandler`, `app:openExternal`, and `updater:openDownload` now reject URLs outside the approved schemes/hosts before `shell.openExternal`. |
| Resolved | High | Security/Reliability | `electron/ipc/ipcValidation.ts`, `electron/ipc/translate.ts`, `electron/ipc/chat.ts`, `electron/ipc/imageTranslate.ts`, `electron/ipc/transcribe.ts`, `electron/ipc/tts.ts`, `electron/ipc/localServer.ts` | Added payload shape/value validation before destructuring or provider routing. Invalid renderer input now returns typed `INVALID_INPUT` errors. |
| Resolved | Medium | Maintainability | `src/hooks/useLiveTranslate.ts` | Repeated post-session AI action flow was extracted into `runLiveAiAction`. The file is still large, but the reported duplication hotspot is removed. |
| Resolved | Medium | Maintainability | `src/hooks/useLiveTranslate.ts`, `src/hooks/live/useLiveAiActions.ts`, `src/hooks/live/vadPolicy.ts` | Live AI action orchestration and VAD policy constants/defaults are now in focused hook modules. `useLiveTranslate.ts` dropped from about 1854 lines to 1685 lines. |
| Resolved | Medium | Structure | `electron/ipc/chat.ts`, `electron/ipc/chatValidation.ts`, `electron/ipc/translate.ts`, `electron/ipc/translateValidation.ts` | Chat and translate payload parsing moved out of the large IPC handlers. `chat.ts` is now about 446 lines and `translate.ts` about 878 lines, with focused validator modules covered by direct tests. |
| Resolved | Medium | Maintainability | `src/hooks/useLiveTranslate.ts`, `src/hooks/live/transcriptAssembly.ts` | Raw transcript trimming, Whisper segment normalization, pending-buffer sentence completion, and force-flush behavior moved to a tested pure helper. `useLiveTranslate.ts` is now about 1634 lines. |
| Resolved | Medium | Structure | `electron/ipc/translate.ts`, `electron/ipc/translateProviders.ts`, `electron/ipc/translatePrompts.ts`, `electron/ipc/translateChunking.ts`, `electron/ipc/translateLanguage.ts` | Translate IPC registration is now thin. Provider SDK adapters/registries, prompt builders, chunking helpers, and language normalization are split into focused modules. `translate.ts` is now about 158 lines. |
| Resolved | Medium | Maintainability | `src/hooks/useLiveTranslate.ts`, `src/hooks/live/speakerDiarization.ts` | Speaker switching, two-speaker alternation, long-pause new-speaker detection, and LRU speaker-label recycling moved to a tested pure helper. `useLiveTranslate.ts` is now about 1566 lines. |
| Resolved | Low | Structure | `electron/ipc/translateProviders.ts`, `electron/ipc/translateProviderOpenAI.ts`, `electron/ipc/translateProviderClaude.ts`, `electron/ipc/translateProviderGemini.ts`, `electron/ipc/translateProviderTypes.ts` | Provider SDK adapters are now split by provider. The central registry is about 58 lines, and each provider adapter file is under 90 lines. |
| Resolved | Medium | Code Quality | `src/i18n/locales/en.ts`, `src/i18n/locales/vi.ts`, `src/i18n/locales/ja.ts` | Runtime UI glyph/status icons were removed from i18n strings; visual status should remain component/CSS-owned. |
| Resolved | Medium | Code Quality | `src/services/deepResearchService.ts`, `src/pages/ChatPage.tsx`, `src/constants/providers.ts`, `src/types/index.ts` | Remaining Deep Research/provider runtime glyphs were removed. Research step labels are text-only, and provider metadata no longer carries emoji fields. |
| Resolved | Medium | Browser Extension/Legacy UX | `electron/ipc/legacyAssistant.ts` | Legacy injected assistant no longer uses emoji status markers in the injected message payload. |
| Resolved | Low | Tooling | `postcss.config.mjs` | Replaced `postcss.config.js` with `postcss.config.mjs`; the Node module-type warning no longer appears in build output. |
| Resolved | Low | Performance | `src/App.tsx`, `src/components/SettingsModal.tsx`, build output | Added route/modal/popup lazy loading. Main `index` chunk dropped to about 8.46 kB, and the largest generated chunk is `LiveTranslatePage` at about 477.94 kB, below Vite's 500 kB warning threshold. |
| Resolved | Low | Documentation | `viezanagent/docs/security-boundaries.md` | Added a runtime security boundary note for external URL policy, IPC validation, key handling, and test expectations. |
| Resolved | Low | Testing depth | `electron/ipc/__tests__/validation.test.ts` | Added focused tests for `isAllowedExternalUrl()`, oversized chat input, invalid chat image MIME types, language-code validation, and translate enum validation. |
| Resolved | Low | Documentation | `viezanagent/docs/provider-routing.md`, `viezanagent/docs/live-translate-pipeline.md` | Added architecture notes for provider routing and the Live Translate pipeline module boundaries. |
| Resolved | Low | Testing depth | `electron/ipc/__tests__/translateHelpers.test.ts`, `src/hooks/live/__tests__/transcriptAssembly.test.ts` | Added direct unit tests for translate prompt/chunk/language helpers and Live Translate transcript assembly helpers. |
| Resolved | Low | Testing depth | `src/hooks/live/__tests__/speakerDiarization.test.ts` | Added direct unit tests for speaker switching, normal two-speaker alternation, long-pause new-speaker detection, recent-other selection, and LRU label recycling. |

## Positive Checks

- No production hardcoded credential literal was found by the configured `rg` credential scan.
- No Node/Electron import was found in `src/`.
- No inline SVG was found outside `src/components/ui/icons/**`.
- No direct `lucide-react`, `react-icons`, `@heroicons`, or `@phosphor-icons` imports were found outside the icon registry.
- Runtime glyph scan is clean after excluding documentation.
- `electron/ipc/keychain.ts` returns only masked values for `keychain:get`; raw stored API keys do not leave the main process through that handler.
- Window preferences use `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Production build now emits no Vite large-chunk warning.
- External URL validation now blocks non-HTTPS GitHub links, unapproved hosts, near-miss GitHub release paths, unrelated macOS Settings deep-links, and malformed URLs.

## Score-Code Result

### Previous Score

| Total | Normalized |
|---:|---:|
| 122/145 | 84/100 |

### Updated Score After Security/Maintainability Fixes

| Criterion | Score | Notes |
|---|---:|---|
| Correctness | 19/20 | TypeScript, tests, and production build pass. |
| Code Quality | 14/15 | Cleaner validation and i18n strings; a few large modules remain. |
| Structure | 13/15 | Main/Preload/Renderer boundary is clearer; live hook remains a future split candidate. |
| Maintainability | 13/15 | Shared validation and AI-action helper reduce repetition and safer future edits. |
| Architecture | 14/15 | URL allowlist, IPC validation, provider registry, and keychain boundaries now align better with Viezan rules. |
| Testing | 15/15 | 24 test files and 497 tests pass after the fixes. |
| Documentation | 8/10 | ViezanAgent docs and this report are current; runtime docs can still be expanded. |
| Performance | 8/10 | Build passes; large client chunk remains the main performance warning. |
| Security | 14/15 | High findings fixed; local-first/keychain boundary remains intact. |
| Reliability | 14/15 | Malformed IPC input is handled more predictably; retry/fallback patterns remain in place. |
| Total | 132/145 | Normalized: 91/100 |

### Final Score After Performance Fix

| Criterion | Score | Notes |
|---|---:|---|
| Correctness | 19/20 | TypeScript, tests, and production build pass. |
| Code Quality | 14/15 | Validation and i18n cleanup are in good shape; some large files still reduce readability. |
| Structure | 14/15 | App-level pages, settings modal, and quick chat popup are now split into lazy chunks. Main/Preload/Renderer boundaries remain clear. |
| Maintainability | 13/15 | Shared validation and AI-action helpers reduce repetition; large IPC/live modules remain future split candidates. |
| Architecture | 14/15 | URL allowlist, IPC validation, provider registry, keychain boundaries, and code-splitting strategy align with Viezan rules. |
| Testing | 15/15 | 24 test files and 497 tests pass after the fixes. |
| Documentation | 8/10 | ViezanAgent docs and this report are current; dedicated runtime docs for validation/URL policy can still be expanded. |
| Performance | 10/10 | Large-chunk warning is resolved; main `index` chunk is about 8.46 kB and the largest lazy chunk is about 477.94 kB. |
| Security | 14/15 | High findings fixed; local-first/keychain boundary remains intact. More targeted tests for allowlist/IPC validators would improve confidence. |
| Reliability | 14/15 | Malformed IPC input is handled predictably; retry/fallback patterns remain in place. |
| Total | 135/145 | Normalized: 93/100 |

### Final Score After Maintainability/Structure Follow-up

| Criterion | Score | Notes |
|---|---:|---|
| Correctness | 19/20 | TypeScript, tests, and production build pass. |
| Code Quality | 15/15 | Runtime glyph cleanup is complete, validation code is focused, and component-owned visuals remain separated from strings/metadata. |
| Structure | 14/15 | Chat/translate validators, VAD policy, and Live AI actions are now separated from their large orchestration files. |
| Maintainability | 14/15 | Focused validation and live-helper modules reduce edit risk; remaining complexity is mostly queue/audio/subtitle orchestration. |
| Architecture | 14/15 | URL allowlist, IPC validation, provider registry, keychain boundaries, docs, and code-splitting strategy align with Viezan rules. |
| Testing | 15/15 | 25 test files and 503 tests pass, including direct allowlist and validator coverage. |
| Documentation | 9/10 | Runtime security boundaries are now documented under `viezanagent/docs/`; deeper provider architecture notes can still be expanded. |
| Performance | 10/10 | Large-chunk warning remains resolved; main `index` chunk is about 8.46 kB and the largest lazy chunk is about 477.86 kB. |
| Security | 15/15 | High findings are fixed, URL policy is tighter, IPC validators are tested, and local-first/keychain boundary remains intact. |
| Reliability | 14/15 | Malformed IPC input is handled predictably; retry/fallback patterns remain in place. |
| Total | 139/145 | Normalized: 96/100 |

### Final Score After Provider/Live Pipeline Split

| Criterion | Score | Notes |
|---|---:|---|
| Correctness | 19/20 | TypeScript, tests, and production build pass. |
| Code Quality | 15/15 | Runtime glyph cleanup is complete, validation code is focused, and component-owned visuals remain separated from strings/metadata. |
| Structure | 15/15 | Translate IPC registration is thin; provider adapters, prompts, chunking, language normalization, validators, VAD policy, transcript assembly, and Live AI actions are separated. |
| Maintainability | 14/15 | Focused modules and helper tests reduce edit risk; the remaining large surface is live audio capture, queue processing, speaker state, and subtitle sync. |
| Architecture | 15/15 | Runtime security, provider routing, Live Translate pipeline, URL policy, IPC validation, keychain boundaries, and code-splitting strategy are documented and aligned. |
| Testing | 15/15 | 27 test files and 515 tests pass, including direct allowlist, validator, translate helper, and transcript assembly coverage. |
| Documentation | 10/10 | Security boundaries, provider routing, and Live Translate pipeline docs are present under `viezanagent/docs/`. |
| Performance | 10/10 | Large-chunk warning remains resolved; main `index` chunk is about 8.46 kB and the largest lazy chunk is about 478.16 kB. |
| Security | 15/15 | High findings are fixed, URL policy is tighter, IPC validators are tested, and local-first/keychain boundary remains intact. |
| Reliability | 14/15 | Malformed IPC input and helper edge cases are handled predictably; retry/fallback patterns remain in place. |
| Total | 142/145 | Normalized: 98/100 |

### Final Score After Provider Adapter/Speaker Split

| Criterion | Score | Notes |
|---|---:|---|
| Correctness | 19/20 | TypeScript, tests, and production build pass; manual live audio QA remains before release. |
| Code Quality | 15/15 | Runtime glyph cleanup is complete, validation code is focused, and component-owned visuals remain separated from strings/metadata. |
| Structure | 15/15 | Translate IPC, provider registries, provider SDK adapters, prompts, chunking, language normalization, validators, VAD policy, transcript assembly, speaker diarization, and Live AI actions are separated. |
| Maintainability | 14/15 | Focused modules and helper tests reduce edit risk; the remaining large surface is live audio capture, queue processing, and subtitle sync. |
| Architecture | 15/15 | Runtime security, provider routing, Live Translate pipeline, URL policy, IPC validation, keychain boundaries, and code-splitting strategy are documented and aligned. |
| Testing | 15/15 | 28 test files and 521 tests pass, including direct allowlist, validator, translate helper, transcript assembly, and speaker diarization coverage. |
| Documentation | 10/10 | Security boundaries, provider routing, and Live Translate pipeline docs are present and updated under `viezanagent/docs/`. |
| Performance | 10/10 | Large-chunk warning remains resolved; main `index` chunk is about 8.46 kB and the largest lazy chunk is about 478.93 kB. |
| Security | 15/15 | High findings are fixed, URL policy is tighter, IPC validators are tested, and local-first/keychain boundary remains intact. |
| Reliability | 15/15 | Malformed IPC input, translate helper edge cases, transcript assembly, and speaker state edge cases are covered by focused tests. |
| Total | 143/145 | Normalized: 99/100 |

## Remaining Improvement Opportunities

| Priority | Area | Evidence | Suggested next fix |
|---|---|---|---|
| Medium | Maintainability | `src/hooks/useLiveTranslate.ts` is still about 1566 lines after extracting VAD policy, transcript assembly, speaker diarization, and Live AI actions. | Continue by splitting audio capture/stream mixing, chunk queue processing, and subtitle sync into focused hooks/modules. |
| Low | Testing depth | Translate helper, transcript assembly, and speaker diarization tests exist; live audio capture and subtitle sync remain covered mostly indirectly. | Add unit tests around future audio queue and subtitle synchronization helpers as they are extracted. |
| Low | Manual QA | Automated checks pass, but no live microphone/system-audio manual session was run in this pass. | Do a short manual Live Translate session on macOS and Windows before release. |

## Verification

Commands run after fix:
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx tsc --noEmit`
- `npm test -- --run`
- `npm run build`
- `rg` credential, icon, renderer Node import, runtime glyph, and `openExternal` scans

Results:
- `npx tsc -p tsconfig.electron.json --noEmit`: passed.
- `npx tsc --noEmit`: passed.
- `npm test -- --run`: 28 test files passed, 521 tests passed.
- `npm run build`: passed.
- Production credential scan: passed after excluding test fixtures.
- Renderer Node/Electron import scan: passed.
- Inline SVG and direct icon-library import scans: passed.
- Runtime glyph scan: passed after excluding documentation.
- `shell.openExternal` scan: all call sites remain behind `isAllowedExternalUrl()`.
- Build warnings: none.
- Build chunk result: main `index` chunk is about 8.46 kB; largest lazy chunk is `LiveTranslatePage` at about 478.93 kB.
