# Docs Sync Report - 2026-05-01 18:22

Workflow: `sync-docs`
Scope: IPC/provider/locale/skill/workflow/report docs.

## Drift Summary

| Type | Count | Status |
|---|---:|---|
| Missing in docs | 0 blocking | No new provider/locale/workflow missing from `PROMPTS.md`/README surfaces. |
| Stale in docs | 2 | Fixed in this run. |
| Broken paths | 0 blocking | Skill/workflow paths referenced by prompt guide exist. |
| Report path drift | 1 low | Workflow JSON stores `save_path` inside step definitions, while top-level parser sees none. README/PROMPTS still document intended paths. |

## Fixed Drift

| Severity | File | Drift | Fix |
|---|---|---|---|
| Medium | `viezanagent/docs/07-renderer.md` | i18n docs described stale `t(key, params?)`, `setLocale(locale)`, and dotted key format. | Updated to `TRANSLATIONS`, `useT()`, flat locale keys, and `Translations` typing. |
| Medium | `viezanagent/docs/09-providers.md` | Verify button was documented as calling `translate:verify-key`. | Updated to actual `translate:verify` channel. |

## Code Truth Anchors Checked

| Anchor | Current source |
|---|---|
| Locales | `AppLocale = 'en' | 'vi' | 'ja'`; locale keys symmetric after this run. |
| Providers | `SUPPORTED_PROVIDERS = ['gemini', 'claude', 'openai', 'local']`; renderer `PROVIDERS` includes same four product providers. |
| STT providers | `auto`, `whisper`, `google`, `groq`, `webSpeech`. |
| Local bridge | Loopback `127.0.0.1:39875`, `X-Viezan-Token`, token management IPC. |
| Workflows | All requested workflow folders exist under `viezanagent/workflow/`. |
| Skills | Matching audit skills exist under `viezanagent/skill/`. |

## Required Updates

1. No blocking docs update remains from this pass.
2. Optional: normalize workflow JSON so each file has top-level `save_path` / `filename_pattern`, matching `PROMPTS.md` and README tables.
3. Optional: update extension docs if extension localization is added later.

## Verification

| Command | Result |
|---|---|
| `rg` workflow/skill path references | Pass |
| `rg` IPC/provider anchors | Pass |
| `npm run build` | Pass |

Markdownlint was not run because no repo script/config is present.

