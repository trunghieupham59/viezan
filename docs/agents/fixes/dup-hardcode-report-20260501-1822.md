# Duplicate / Hardcode Report - 2026-05-01 18:22

Workflow: `check-dup-hardcode`
Scope: `src/`, `electron/`, `chrome-extension/`

## Summary

| Category | Result | Notes |
|---|---:|---|
| Hardcoded credential | 0 | No `apiKey/secret/password/token = "..."` literal found in app source. |
| Inline SVG outside registry | 0 | `rg '<svg' src -g '!src/components/ui/icons/**'` returned no violations. |
| External URL literals | Medium | Mostly centralized constants / provider endpoints. One legacy bookmarklet string remains. |
| Magic string checks | Medium | Mostly domain enums and keyboard constants; no security blocker. |
| Hardcoded colors | Medium | CSS/theme constants are expected; provider brand colors are duplicated in extension JS. |
| Duplicate code | Medium | Repeated provider-logo frame pattern in STT/TTS settings. |

## Findings

### [Medium] Legacy assistant bookmarklet keeps inline style/SVG string

File: `electron/ipc/legacyAssistant.ts:87`

Issue: the legacy bookmarklet injects a styled floating button and inline SVG through a JS string. This is isolated from React UI but still violates the strict icon/style hardcode rule.

Suggested fix: move the visual payload to a shared template/helper or retire the legacy assistant path if Chrome Extension is the supported browser integration.

### [Medium] Extension provider brand colors duplicated

Files:

- `chrome-extension/popup.js`
- `chrome-extension/content.js`
- `chrome-extension/options.js`
- `src/constants/providers.ts`

Issue: provider colors are repeated across popup/content/options rather than generated from one source.

Suggested fix: introduce a small extension-side `provider-theme.js` shared by popup/content/options, or generate it from `src/constants/providers.ts` during release.

### [Medium] Repeated provider card frame pattern

Files:

- `src/pages/settings/SttSection.tsx`
- `src/pages/settings/TtsSection.tsx`

Issue: `ProviderLogoFrame` is duplicated with nearly identical JSX/classes.

Suggested fix: extract a shared settings provider frame component if one more provider settings surface repeats this pattern.

## Fixed In This Run

- `chrome-extension/model-display.js`: replaced string concatenation with template literal for Biome.
- `src/utils/modelDisplay.ts`: marked intentionally unused provider argument as `_provider`.
- Renderer hardcoded labels found during i18n audit were moved to locale keys.

## Verification

| Command | Result |
|---|---|
| `rg` credential pre-filter | Pass |
| `rg` inline SVG outside icon registry | Pass |
| `npm exec --package @biomejs/biome@2.4.13 -- biome check .` | Pass after fix |

