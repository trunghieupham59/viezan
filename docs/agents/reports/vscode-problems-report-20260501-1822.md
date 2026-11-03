# VS Code / Build / Test Problems Report - 2026-05-01 18:22

Workflow: `fix-vscode-problems`
Scope: diagnostics from CLI equivalents: TypeScript, Electron TypeScript, Vitest, build, Biome, extension JS syntax.

## Problems Found And Fixed

| Severity | Source | File | Problem | Fix |
|---|---|---|---|---|
| Warning | Biome `lint/style/useTemplate` | `chrome-extension/model-display.js:86` | String concatenation should be a template literal. | Changed to `` `${cur}.${next}` ``. |
| Warning | Biome `lint/correctness/noUnusedFunctionParameters` | `src/utils/modelDisplay.ts:174` | `provider` parameter unused. | Renamed to `_provider` to mark intentional. |
| Warning | i18n/static scan | `src/components/AIChatPopup.tsx` | Several user-facing Quick Chat strings were hardcoded. | Added locale keys and switched JSX to `t.*`. |
| Warning | i18n/static scan | `src/pages/settings/PreferencesSection.tsx` | Hardcoded aria-label. | Reused `t.settings_auto_translate`. |
| Warning | i18n/static scan | `src/pages/ChatPage.tsx` | Hardcoded Deep Research badge. | Reused `t.chat_deep_research_badge`. |
| Warning | docs sync | `docs/migration/legacy-reference/agent-handbook/manual/07-renderer.md` | i18n API docs described stale `t(key)`/dotted key API. | Updated to `TRANSLATIONS` + `useT()` flat keys. |
| Warning | docs sync | `docs/migration/legacy-reference/agent-handbook/manual/09-providers.md` | Provider verify channel was documented as `translate:verify-key`. | Updated to `translate:verify`. |

## Diagnostics Summary

| Diagnostic | Result |
|---|---|
| TypeScript renderer | Pass |
| TypeScript Electron | Pass |
| Vitest | Pass |
| Production build | Pass |
| Biome | Pass after fix |
| `node --check` extension JS | Pass |

## External Actions

None. No GitHub Secrets, package installs, or manual OS settings were required for the diagnostics fixed in code.

