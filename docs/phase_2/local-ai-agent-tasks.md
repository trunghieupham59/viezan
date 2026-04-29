# Phase 2: Local AI Provider Agent Tasks

## Scope

Phase 2 adds a free local AI path for Viezan core AI tasks: translate, rewrite,
language detection, streaming translation, chat, and chat image input when the
selected local model/runtime supports vision.

This phase starts with a detect-existing strategy and adds a narrow install path
for Ollama. Viezan detects local runtimes that the user already runs on their
machine, can run the fixed Ollama installer command from Electron Main Process,
and can pull curated models through Ollama. It does not bundle runtime binaries
or model files in the app installer.

Non-goals:

- Do not bundle local runtime binaries or model files in the app installer.
- Do not execute renderer-provided shell commands for local runtime install.
- Do not install or manage LM Studio or llama.cpp in this phase.
- Do not make STT, TTS, web search, or Deep Research fully offline in this phase.
- Do not send prompts, transcripts, images, or keys through a Viezan server.

## Architecture Sketch

- Renderer keeps using the existing provider/model UI and service calls.
- Preload exposes a narrow local discovery wrapper: `local-ai:discover`.
- Benchmark, Ollama install, and model install UX use `local-ai:benchmark`,
  `local-ai:installOllama`, and
  `local-ai:downloadModel`.
- Electron Main Process owns runtime probing, localhost fetches, model scoring,
  fixed Ollama install command execution, and local provider request resolution.
- Local provider uses OpenAI-compatible chat completions with a placeholder API
  key and a detected localhost `baseURL`.
- Cloud providers keep the existing BYOK keychain flow.

Supported local runtime candidates:

- Ollama: `http://127.0.0.1:11434/v1`
- LM Studio: `http://127.0.0.1:1234/v1`
- llama.cpp: `http://127.0.0.1:8080/v1`

## Agent Tasks

1. Provider contract
   - Add provider `local` to renderer and main-process provider types.
   - Keep cloud provider API key behavior unchanged.
   - Ensure local provider never requires keychain state.

2. Runtime discovery
   - Add `local-ai:discover` IPC handler.
   - Probe known local OpenAI-compatible endpoints with short timeouts.
   - Return runtime status, engine, endpoint, models, hardware profile, and
     recommended model.

3. Benchmark and direct download
   - Benchmark the system into a hardware tier from CPU count, RAM, a synthetic
     CPU loop, and a memory-bandwidth loop.
   - If a local runtime/model is available, run a short local completion to
     estimate latency and tokens/second.
   - Show a curated local model list sorted for the current machine. The catalog
     should distinguish runtime (`Ollama`) from model families such as Llama,
     DeepSeek, Qwen, Gemma, Mistral, and Phi.
   - Show a small estimated size note for each suggested model so users can
     judge storage/RAM impact before downloading.
   - Allow direct Ollama installation through fixed Main Process command:
     `curl -fsSL https://ollama.com/install.sh | sh`.
   - Surface installer progress in Settings and allow cancellation through a
     dedicated Main Process IPC command.
   - Allow direct model download through Ollama `/api/pull` when Ollama is
     running.
   - Stream model pull progress from Ollama and show a per-model progress bar
     with percent and downloaded/total GB in Settings.
   - Mark already installed suggested models from the detected model list.

4. Local adapter
   - Add local translate/rewrite/detect/stream adapters.
   - Add local chat and chat stream routes.
   - Use the detected runtime `baseURL` and `local-ai` placeholder key.
   - Resolve `local-auto` to the recommended local model at call time.

5. Model recommendation
   - Score models using hardware tier, model family, estimated size, and task fit.
   - Prefer fast multilingual models for translation on lower-tier machines.
   - Allow larger models only when hardware tier supports them.

6. Settings and model UI
   - Rename the provider section to AI Providers.
   - Show local runtime status, endpoint, model count, and recommendation.
   - Show benchmark tier, RAM, CPU, suggested models, and download buttons.
   - Do not show "No API key" for local provider.
   - Keep manual model override through the existing model selector.

7. Documentation and workflows
   - Update provider routing docs with the local OpenAI-compatible path.
   - Run security/local-first audit after implementation.

## Validation Commands

Run targeted checks first:

```bash
npm test -- --run electron/ipc/__tests__/providers.test.ts electron/ipc/__tests__/localAi.test.ts src/store/__tests__/settingsSlice.test.ts
npm run build:electron
```

Then run broader checks before merge:

```bash
npm test -- --run
npm run build
```

## Manual Smoke

- No local runtime running: Settings shows local AI as not running and cloud BYOK
  providers still behave normally. Suggested model buttons offer direct Ollama
  install instead of opening a browser.
- Benchmark without runtime: Viezan measures CPU/RAM synthetic scores and updates
  the suggested model order without downloading a model.
- Ollama/LM Studio/llama.cpp running with a model: Viezan detects runtime, lists
  models, selects a recommendation, and can translate/chat using provider
  `local`.
- Benchmark with runtime/model: Viezan also shows local model latency and
  approximate tokens/second.
- Ollama installed through Viezan: install completes through IPC, discovery
  refreshes, then curated models can be pulled through Ollama.
- Local streaming: Live translation emits partial tokens and completes cleanly.
- Cloud regression: Gemini, Claude, and OpenAI still require keys and use the
  existing keychain/verification flow.
