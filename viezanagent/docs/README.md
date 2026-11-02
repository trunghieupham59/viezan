# Viezan — Project Documentation

> Comprehensive technical documentation for the Viezan local-first AI translation desktop app.
>
> Audience: developers/agents joining the project, doing audits, or extending features.

Viezan is a desktop translation workspace (Electron + React) for **text, image, live audio, AI chat and browser-selected text**. It does not use a Viezan-hosted relay server — requests are handled on the user's machine and sent only to a local runtime (Ollama / LM Studio / llama.cpp) or to the cloud provider the user configures (Gemini / Claude / OpenAI).

---

## How to Read These Docs

| If you want to… | Start here |
|---|---|
| Understand the product and what it ships | [`01-overview.md`](./01-overview.md) |
| Understand the high-level architecture (process model, IPC, state) | [`02-architecture.md`](./02-architecture.md) |
| Run the project locally | [`03-getting-started.md`](./03-getting-started.md) |
| Work on the Electron main process and windowing | [`04-electron-main.md`](./04-electron-main.md) |
| Look up an IPC channel or `window.api.*` call | [`05-ipc-reference.md`](./05-ipc-reference.md) and [`06-preload-api.md`](./06-preload-api.md) |
| Work on the React renderer (UI structure, pages, hooks) | [`07-renderer.md`](./07-renderer.md) |
| Understand or extend the Zustand state | [`08-state-management.md`](./08-state-management.md) |
| Add or audit an AI provider | [`09-providers.md`](./09-providers.md) and [`provider-routing.md`](./provider-routing.md) |
| Maintain Local AI (Ollama / LM Studio / llama.cpp) | [`10-local-ai.md`](./10-local-ai.md) and [`phase_2/local-ai-agent-tasks.md`](./phase_2/local-ai-agent-tasks.md) |
| Work on the Live Translate pipeline | [`11-features.md`](./11-features.md) and [`live-translate-pipeline.md`](./live-translate-pipeline.md) |
| Work on TTS / STT / Voice / Image / Quick Chat | [`11-features.md`](./11-features.md) |
| Understand the Chrome Extension and local bridge | [`12-chrome-extension.md`](./12-chrome-extension.md) |
| Audit security / privacy boundaries | [`13-security.md`](./13-security.md) and [`security-boundaries.md`](./security-boundaries.md) |
| Understand i18n and locales | [`14-i18n.md`](./14-i18n.md) |
| Run tests and understand coverage | [`15-testing.md`](./15-testing.md) |
| Build and ship a release | [`16-build-release.md`](./16-build-release.md) |

---

## Document Index

| File | Topic |
|---|---|
| [`01-overview.md`](./01-overview.md) | Product overview, value proposition, supported features and providers |
| [`02-architecture.md`](./02-architecture.md) | Process model, IPC, preload, state, security boundary |
| [`03-getting-started.md`](./03-getting-started.md) | Prerequisites, install, dev / build / test commands |
| [`04-electron-main.md`](./04-electron-main.md) | Electron main process: lifecycle, BrowserWindow, navigation policy, single-instance lock |
| [`05-ipc-reference.md`](./05-ipc-reference.md) | All `ipcMain.handle` channels, payloads, responses |
| [`06-preload-api.md`](./06-preload-api.md) | The `window.api` surface exposed by `contextBridge` |
| [`07-renderer.md`](./07-renderer.md) | React app shell, pages, components, hooks, services, utils |
| [`08-state-management.md`](./08-state-management.md) | Zustand `useAppStore`, slices and persistence |
| [`09-providers.md`](./09-providers.md) | Provider system: registry pattern, adapter contract, how to add a provider |
| [`10-local-ai.md`](./10-local-ai.md) | Local runtime detection, hardware benchmark, model recommendation, Ollama install/pull |
| [`11-features.md`](./11-features.md) | Per-feature deep dives: Translate, Live, Image, Chat, TTS, STT, Quick Chat |
| [`12-chrome-extension.md`](./12-chrome-extension.md) | Chrome Extension architecture, options page, local bridge protocol |
| [`13-security.md`](./13-security.md) | Threat model, contextIsolation, sandbox, key safety, URL allowlist, IPC validation |
| [`14-i18n.md`](./14-i18n.md) | i18n structure (vi/en/ja), locale auto-detection, coverage rules |
| [`15-testing.md`](./15-testing.md) | Vitest, test layout, what is covered |
| [`16-build-release.md`](./16-build-release.md) | electron-builder, signing, notarization, release flow |
| [`provider-routing.md`](./provider-routing.md) | (existing) Translation provider routing internals |
| [`security-boundaries.md`](./security-boundaries.md) | (existing) External URL policy and IPC validation |
| [`live-translate-pipeline.md`](./live-translate-pipeline.md) | (existing) Live Translate pipeline split |
| [`live_trans.md`](./live_trans.md) | (existing) Live meeting translation design notes |
| [`tts.md`](./tts.md) | (existing) OpenAI realtime meeting TTS design notes |
| [`TTS_ARCHITECTURE.md`](./TTS_ARCHITECTURE.md) | (existing reference) TTS architecture (from a sibling project, used as inspiration) |
| [`phase_2/local-ai-agent-tasks.md`](./phase_2/local-ai-agent-tasks.md) | (existing) Local AI phase-2 agent task list |

---

## Conventions Used in These Docs

- Paths are relative to the repository root unless prefixed with `viezanagent/`.
- IPC channel names follow `domain:action` (e.g. `translate:detect`, `local-ai:downloadModel`).
- Responses generally follow `{ success: true, ... } | { success: false, error: string, errorCode?: string }`.
- "Renderer" = code under `src/`. "Main" = code under `electron/`. "Preload" = code under `electron/preload/` aggregated by `electron/preload.ts`.
- "Local AI" / `local` provider is keyless and routes to localhost OpenAI-compatible runtimes.

For prompt recipes, start with purpose agents in [`../PROMPTS.md`](../PROMPTS.md) instead of invoking rule/skill/workflow artifacts directly.
