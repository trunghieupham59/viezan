# 01 — Product Overview

## What Viezan Is

**Viezan** is a cross-platform desktop translation workspace built on Electron + React + TypeScript. It supports macOS (Apple Silicon + Intel), Windows x64 and Linux x64, plus a companion Chrome Extension.

The core promise is **local-first**: there is no Viezan-hosted relay server. Every AI request goes from the user's machine **directly** to either:

- a **local OpenAI-compatible runtime** (Ollama, LM Studio, llama.cpp), or
- a **cloud provider** the user explicitly configured with their own key (Google Gemini, Anthropic Claude, OpenAI).

## Why It Exists

The author works as BrSE / PM in a Japanese product company. Technical information drifts when it travels through dev → BA → BrSE → IT Comtor → customer. Viezan lets each role translate, ask AI and verify context independently, in the spirit of **工夫** (continuous practical improvement of daily work).

Target users:

- BrSE, PM, developer, QA, BA, IT Comtor.
- Language learners and people working with multi-language documents.
- Teams who need to translate chat, meetings, tickets, technical docs or web content quickly.
- Users who want to keep data on their machine or who don't have a cloud API key.

## Key Features

| Area | Capability |
|---|---|
| **AI Translate** | 19 languages, source detection, Auto / Manual modes, 6 translation styles, rewrite, speak-aloud, voice input. |
| **Phonetic** | Furigana (Japanese), pinyin (Chinese), romanization (Korean), or generic phonetic. |
| **Image Translate** | Drag, drop, paste or pick images; AI extracts and translates visible text; can produce a translated image when supported (Gemini vision). |
| **Live Translate** | Realtime mic / system-audio / mixed transcription, streaming translation, floating subtitle overlay window, post-meeting summary, action items, decisions, speaker analysis, `.txt` / `.srt` export. |
| **Voice Input** | Web Speech API + Whisper, Gemini STT and Groq Whisper fallbacks. |
| **TTS** | Edge TTS (free) → OpenAI → Gemini → ElevenLabs fallback chain. |
| **AI Chat** | Multi-turn chat with image attachments, voice input, system prompt presets, streaming responses, history, optional web search. |
| **Deep Research / Web Search** | Tavily and Brave key support, Jina free fallback. |
| **Browser Translation** | Chrome Extension + floating button + context menu + `Alt+T` / `Option+T` shortcut, bridged through a local server. |
| **Quick Chat** | Raycast-style floating panel summoned by a global hotkey. |
| **History** | Separate searchable history for Translate, Chat and Live; bulk delete and reuse. |
| **Auto-Update** | electron-updater for in-app updates from GitHub Releases. |

## Supported Providers

| Provider | Key | Translate | Chat | TTS | STT | Image | Models endpoint |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Local AI** (Ollama / LM Studio / llama.cpp) | none | ✅ | ✅ | — | — | partial† | ✅ |
| **Google Gemini** | yes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Anthropic Claude** | yes | ✅ | ✅ | — | — | — | ✅ |
| **OpenAI** | yes | ✅ | ✅ | ✅ | ✅ (Whisper) | ✅ | ✅ |
| **Groq** | optional | — | — | — | ✅ (Whisper) | — | — |
| **Tavily / Brave / Jina** | optional | — | — | — | — | — | — |

† Local AI image-text-extract works for vision-capable local models exposed via OpenAI-compatible API.

## Privacy Model

- **No Viezan-hosted server.** All requests go directly from the user's machine to the selected runtime/provider.
- **API keys** are encrypted using Electron `safeStorage` (OS Keychain on macOS, Credential Store on Windows, libsecret on Linux). They live **only in the Main Process**; the renderer and Chrome Extension never receive raw provider keys.
- The **Chrome Extension** authenticates to the desktop app over `127.0.0.1:39875` with an internal Viezan connection key (`sk-vie-...`) — never a provider key.
- Translation, chat and live audio are sent only when the user explicitly triggers them.

## Tech Stack

| Tech | Role |
|---|---|
| Electron 41 | Desktop shell, native APIs, secure storage |
| React 18 | Renderer UI |
| TypeScript 5 | Type safety across renderer + Electron |
| Vite 8 | Renderer build pipeline |
| Tailwind CSS 3 | Styling |
| Zustand 5 | Client state (slice pattern + persist) |
| Electron Builder 26 | Packaging and publishing |
| Vitest 4 | Unit / integration tests |
| `@google/generative-ai`, `@anthropic-ai/sdk`, `openai` | Cloud SDKs |
| `@ricky0123/vad-web` | Voice activity detection (Silero VAD via ONNX) |
| `electron-updater` | Auto-update from GitHub Releases |
| `ws` | Local server for Chrome Extension bridge |

## Top-Level Repository Layout

```
viezan/
├── electron/                 Main process and preload
│   ├── main.ts               Lifecycle + windows
│   ├── preload.ts            Aggregates the window.api surface
│   ├── subtitle-preload.ts   Preload for the floating subtitle window
│   ├── ipc/                  Domain handlers (translate, chat, tts, …)
│   └── preload/              Per-domain preload modules
├── src/                      React renderer
│   ├── App.tsx, main.tsx, quick-chat-main.tsx
│   ├── pages/                Translate / Live / Chat / History / Settings
│   ├── components/           UI + per-feature components
│   ├── hooks/                useTranslate, useLiveTranslate, useTTS, …
│   ├── services/             Renderer-side service helpers
│   ├── store/                Zustand store + slices
│   ├── i18n/                 vi / en / ja locale files
│   ├── constants/            Providers, languages, audio, image, urls
│   └── types/                Shared TS types
├── chrome-extension/         Browser extension (MV3)
├── public/                   Static assets, VAD model, subtitle.html
├── docs/                     Public GitHub Pages site
├── scripts/                  Build helpers (notarize, icon gen)
├── build/                    electron-builder assets (icons, entitlements)
└── viezanagent/              Agent rules / skills / workflows / docs
    └── docs/                 ← you are here
```

For the full process model and how these pieces talk to each other, see [`02-architecture.md`](./02-architecture.md).
