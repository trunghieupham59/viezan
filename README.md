<p align="right">
  <a href="https://me.momo.vn/aMI2T6tWf3uRteU4tqUZtn">
    <img src="https://img.shields.io/badge/Support%20via%20MoMo-ae2070?style=for-the-badge" alt="Support via MoMo">
  </a>
</p>

# Viezan

<p align="center">
  <img src="public/icon.png" width="96" alt="Viezan logo">
</p>

<p align="center">
  <strong>Local-first AI translation for desktop and browser.</strong><br>
  Viezan runs on macOS, Windows and Linux, with Local AI support plus bring-your-own-key cloud providers.
</p>

<p align="center">
  <a href="https://github.com/trunghieupham59/Viezan/releases/latest">
    <img src="https://img.shields.io/github/v/release/trunghieupham59/Viezan?style=flat-square&color=f97316" alt="Latest Release">
  </a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
</p>

Viezan is a desktop workspace for AI chat, translation, live interpretation and dictionary lookup, with a quick launcher and system monitoring. It supports local AI and your own cloud provider keys. AI requests go directly from the desktop app to local runtimes or external providers; there is no Viezan-hosted relay. Cloud AI, speech and web search features require their respective external services.

<!-- BEGIN GENERATED:overview -->
This README describes the source in this checkout (package version **2.4.2**).
The latest published installer may differ; see [Releases](https://github.com/trunghieupham59/Viezan/releases/latest).

- AI providers: Local AI, OpenAI GPT, Anthropic Claude, Google Gemini.
- Interface languages: English, Tiếng Việt, 日本語.
<!-- END GENERATED:overview -->

## Screenshots

<p align="center">
  <a href="https://trunghieupham59.github.io/viezan/" title="Open interactive screenshot slider">
    <img src="docs/screenshots/demo.gif" width="800" alt="Viezan screenshots">
  </a>
</p>

<p align="center">
  <a href="https://trunghieupham59.github.io/viezan/">Open interactive screenshot gallery</a>
</p>

## Download

| Platform | Package |
| --- | --- |
| macOS Apple Silicon | DMG from the [latest release](https://github.com/trunghieupham59/Viezan/releases/latest) |
| macOS Intel x64 | DMG from the [latest release](https://github.com/trunghieupham59/Viezan/releases/latest) |
| Windows x64 | NSIS installer from the [latest release](https://github.com/trunghieupham59/Viezan/releases/latest) |
| Linux x64 | AppImage from the [latest release](https://github.com/trunghieupham59/Viezan/releases/latest) |
| Chrome Extension | Extension package from the matching [release](https://github.com/trunghieupham59/Viezan/releases/latest) |

View all versions on the [GitHub Releases page](https://github.com/trunghieupham59/Viezan/releases).

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for version-specific changes and limitations.
The feature guide below describes the current checkout, including changes that may not yet be in a published installer.

## Features

| Feature | Description |
| --- | --- |
| [Home](src/pages/HomePage.tsx) | Quick starts, recent activity and system status for enabled modules. |
| [AI Translate](src/pages/TranslatePage.tsx) | Translate text with source detection, tone and phonetic controls, or compare up to three models across providers in one run. Image translation is available inside this workspace. |
| [Dictionary](src/pages/DictionaryPage.tsx) | Look up words and phrases with optional context, definitions and examples; save favorites, revisit lookup history and reuse a term in translation. |
| Local AI | Run translation, rewrite and chat through Ollama, LM Studio or llama.cpp without a cloud API key. |
| Cloud Providers | Use Google Gemini, Anthropic Claude or OpenAI with your own API keys. |
| [AI Interpret](src/pages/LiveTranslatePage.tsx) | Live microphone/system-audio transcription, translation and floating subtitles. Audio capture availability depends on the OS and permissions. |
| Image Translation | Drag, drop or paste images; AI extracts and translates visible text. |
| Voice Input | Records audio locally, then sends the completed clip through Electron Main to Whisper, Gemini STT or Groq. |
| Text-to-Speech | Edge TTS, OpenAI, Gemini and ElevenLabs, with fallback order based on the selected quality mode and available keys. |
| [AI Chat](src/pages/ChatPage.tsx) | Chat with image attachments, voice input, saved system prompts, conversation history, optional web search and native chart blocks in AI responses. |
| Web Search | Tavily and Brave key support with a Jina fallback path. |
| [Translate everywhere](src/pages/EverywherePage.tsx) | Configure Quick Translate for text selected in other apps and the Chrome extension connection. The extension supports a context menu, selection button and `Alt+T`. |
| [Quick Launcher](src/pages/QuickLauncher.tsx) | Search apps and files, calculate, convert currencies and open AI or translation actions. Native search support varies by platform; currency rates need a network connection. |
| [Launcher & shortcuts](src/pages/UtilitiesPage.tsx) | Configure the launcher and global shortcuts. |
| [Applications](src/pages/AppsPage.tsx) | macOS app inventory, previewed removal or reset, per-item results and Undo. User-level operations only; shared, protected and administrator-owned items are kept. |
| [Thermal](src/pages/ThermalPage.tsx) | Monitor temperatures, fan readings and CPU load on macOS (SMC) and Linux (hwmon). Optional macOS fan control supports fixed speeds, sensor rules, profiles and calibration through a privileged helper. Packaged builds can install the background helper once and reconnect on later launches; development runs use a session helper. Windows thermal readings are not supported. |
| [Settings](src/pages/SettingsPage.tsx) | Manage AI models and keys, voice, appearance, chat presets, feature modules, preferences and updates. |
| History | Feature-specific translation, interpretation, conversation and dictionary history. History has storage limits; keep separate copies of work you need long term. |
| Session recovery | Reopen the active chat and text drafts, or recover translation and dictionary work after navigation or restart. Completed work can start fresh after an absence, with an option to reopen the previous result. |
| Security | API keys are encrypted with Electron safeStorage and are used only by the Electron main process. |

## Getting Started

### 1. Install Viezan

Download the package for your platform from [Releases](https://github.com/trunghieupham59/Viezan/releases/latest), install it, then launch Viezan.

For unsigned macOS builds, Gatekeeper may show `"Viezan" cannot be opened` on first launch. Open **System Settings -> Privacy & Security** and choose **Open Anyway** for Viezan. If you trust the downloaded app and macOS still blocks it after dragging it to Applications, run:

```bash
xattr -dr com.apple.quarantine /Applications/Viezan.app
```

### 2. Choose a Provider

Local AI works without cloud keys when a compatible local runtime is available.

For cloud providers, open **Settings -> AI models**, choose a provider, paste your key, and save it. Keys are encrypted by Electron safeStorage on the current OS and are not stored in the browser extension.

| Provider | Key required | Where to configure |
| --- | --- | --- |
| Local AI | No | **Settings -> AI models -> Local AI** |
| Google Gemini | Yes | **Settings -> AI models** |
| Anthropic Claude | Yes | **Settings -> AI models** |
| OpenAI | Yes | **Settings -> AI models** |
| Groq STT | Optional | **Settings -> Voice** |
| Tavily / Brave Search | Optional | **Settings -> AI models**, web search provider controls |

### 3. Start Translating

- **AI Translate**: translate text, compare up to three models or use image translation.
- **AI Interpret**: live subtitles from microphone, system audio or both where supported.
- **Dictionary**: look up a word or phrase and optionally supply its context.
- **AI Chat**: multimodal chat with voice input, saved prompts and optional web search.
- Open history within the relevant workspace to revisit saved results or conversations.

### Returning to your work

AI Chat keeps the selected conversation and text drafts. Translate and Dictionary
save their current work locally; translation recovery includes image drafts and
completed comparison results. Restoring work does not send another AI request.

With **Settings -> Preferences -> Start fresh after completed work** enabled,
returning after 2 hours away from Translate or 30 minutes away from Dictionary
opens a fresh workspace for successfully saved, completed work. **Open previous
work** restores that result. Unfinished drafts and active operations are kept;
reading a screen without leaving does not trigger a reset.

Recovery keeps the current workspace and one previous completed workspace. It is
separate from history, which retains the existing limits: 20 chats, 100
translations, 50 interpretation sessions, 100 recent dictionary entries and 500
favorites. A warning appears at these limits. Unsent chat image attachments are
not restored after a restart. If saving fails, keep the app open and use
**Retry saving**; a forced shutdown can still lose changes not yet saved.

### Removing or resetting an app (macOS)

Open **Applications**, select one app, inspect its related files and choose
**Uninstall app** or **Reset**. Reset keeps the application bundle. Only the bundle and exact bundle-ID matches for caches, logs and saved window
state are selected automatically. Persistent data and preferences require explicit
selection. Name/vendor/prefix matches, Containers, launch agents and shared data stay. A native confirmation lists the chosen paths before any changes. Apps are
asked to quit normally, never force-quit. Incomplete scans or uncertain installed-app
metadata block changes. The full selection is checked before the first operation;
a failure stops subsequent removals and restores.

Files go to Trash; preference domains are exported before removal. **Journal and
Undo** records individual outcomes, including skipped/failed items. Undo refuses
to overwrite a recreated file or preference domain, or restore changed Trash
content. Preference backups have checksums; an empty plist retained by macOS after
clearing a domain is recorded and checked before Undo. An interrupted restoration
is reconciled where its exact filesystem identity can be verified, otherwise it
stays pending and blocks new removals. Emptying Trash makes those files unavailable for Undo. A post-operation
scan reports what remains within the supported locations, not a guarantee that
all traces anywhere on the disk are gone.

This draft has not been approved for general use with real apps. It does not remove
administrator helpers, package receipts, user launch agents, ByHost preferences,
Containers or Group Containers. Managed Macs are conservatively blocked.
Updates and orphan-data scanning are planned separately. No app inventory is sent
to a server. Native actions require the unprivileged `viezan-fs` binary built by
`npm run build:native` with the Xcode Command Line Tools; without it, the page is
preview-only. There is no root helper or permanent-delete action in this module.

## Chrome Extension

The extension connects browser-selected text to the Viezan desktop app over `127.0.0.1:39875`.

1. Install the extension package from the matching release, or load `chrome-extension/` unpacked for local development.
2. Open **Viezan -> Translate everywhere** and find the browser extension controls.
3. Copy or create a connection token.
4. Open the extension **Options** page, paste the token, set your preferred language/provider, then save.

The desktop app must be running for browser translations to work. The connection token is sent through the local auth header, and the extension never stores cloud provider API keys.

See [chrome-extension/README.md](chrome-extension/README.md) for the detailed extension guide.

## Development

### Prerequisites

- Node.js 22 (the version used in CI)
- npm
- macOS, Windows or Linux

### Setup

```bash
git clone https://github.com/trunghieupham59/Viezan.git
cd Viezan
npm install
npm run dev
```

For browser-based UI development and AI-assisted visual testing, run the
deterministic Web Preview instead. It mocks the Electron bridge and never reads
real API keys or invokes native OS features:

```bash
npm run dev:web
```

Then open `http://localhost:5173`. Translation, chat, models, settings and
history remain interactive; native-only features return safe preview results.

### Dev vs installed app

`npm run dev` can run next to the installed Viezan (even while it is resident in the
system tray) because a development run is isolated from the official build:

| | Installed app | `npm run dev` |
| --- | --- | --- |
| Data folder on Windows (settings, API keys, tokens) | `%APPDATA%\viezan` | `%APPDATA%\viezan-dev` |
| Local server port | `39875` | `39876` |
| Window title / tray tooltip | `Viezan` | `Viezan (Dev)` |
| Closing the window | stays resident when a tray is available | quits (tray: `VIEZAN_DEV_TRAY=1`) |

- Override the dev port with `VIEZAN_LOCAL_PORT` (1024-65535). Environment overrides
  are ignored by the packaged app.
- The Chrome extension is built for `39875`, so it talks to the installed app. To test
  it against a dev run, quit the installed app and start dev with `VIEZAN_LOCAL_PORT=39875`.
- Global hotkeys are OS-wide: if both builds are running, the second one to start reports
  its hotkey as "in use". Quit the installed app to test hotkeys in dev.
- A dev run starts with empty settings; add your API keys in the dev window once.

### Test

```bash
npm test
npm test -- --watch
npm run test:coverage
npm run test:docs
```

Tests live in `src/**/__tests__/` and `electron/ipc/__tests__/`.

### Build

```bash
npm run build
npm run build:mac
npm run build:win
npm run build:linux
```

Build artifacts are written to `release/`.

### Keeping documentation current

Update the feature guide, setup instructions and limitations in the same change
as user-visible behavior. Before a version bump is released:

1. Review source and tests changed since the previous release using the repository's
   `sync-docs` workflow and [documentation rules](AGENTS.md#documentation-and-version-changes).
2. Update this README and add a `## [X.Y.Z]` entry to [CHANGELOG.md](CHANGELOG.md).
   Bump `package.json` and both root versions in `package-lock.json` together.
3. Run `npm run docs:sync` to refresh generated facts, then read the full README.
4. Record the completed review and run the checks:

```bash
npm run docs:review -- --summary "Reviewed features, setup and platform limitations against the changed source."
npm run check:docs
npm run test:docs
```

Commit the review record together with the reviewed source and docs. A later source,
README or changelog edit invalidates that record. Tests and generated binaries do
not invalidate it. If an internal-only fix needs no prose change, explain why in
the review summary. The record detects stale reviews; it cannot prove the prose is
correct. Never run `docs:review` in CI or use it to dismiss an unread diff.

PR documentation checks, auto-tag and direct tag releases use the same checker.
Release tags must match the already-reviewed package version; CI does not rewrite
the version to make a mismatched tag pass. See the
[release guide](.github/WORKFLOWS.md) for the full policy.

## Project Map

```text
Viezan/
├── electron/                 # Electron main process and IPC handlers
│   ├── main.ts               # App lifecycle and window management
│   ├── preload.ts            # Context bridge entry
│   ├── preload/              # Renderer-facing preload modules
│   └── ipc/                  # Providers, storage, local server, audio, updater
├── src/                      # React renderer
│   ├── pages/                # Home, Chat, Translate, Interpret, Dictionary, Applications, Thermal, Settings
│   ├── components/           # Shared UI and feature components
│   ├── store/                # Zustand app state
│   ├── services/             # Renderer service helpers
│   ├── i18n/                 # App UI translations
│   └── types/                # Shared TypeScript types
├── chrome-extension/         # Chrome/Chromium extension
├── docs/                     # GitHub Pages landing page and screenshots
├── scripts/                  # Build and asset scripts
└── viezanagent/              # Agent rules, skills, workflows, reports and docs
```

## Tech Stack

<!-- BEGIN GENERATED:stack -->
| Technology | Declared version | Role |
| --- | --- | --- |
| Electron | `^41.10.7` | Desktop shell, native capabilities and secure storage |
| React | `^18.3.1` | Renderer UI |
| TypeScript | `^7.0.2` | Type safety across renderer and Electron code |
| Vite | `^8.3.5` | Renderer build pipeline |
| Tailwind CSS | `^4.3.3` | Styling |
| Zustand | `^5.0.16` | Client state |
| electron-builder | `^26.15.3` | Packaging and publishing |
| Vitest | `^5.0.3` | Unit and integration tests |
<!-- END GENERATED:stack -->

## Contributing

Contributions, bug reports and feature requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

If Viezan is useful to you, you can support development via MoMo:

<p align="center">
  <a href="https://me.momo.vn/aMI2T6tWf3uRteU4tqUZtn">
    <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-MoMo-ae2070?style=for-the-badge" alt="Buy me a coffee via MoMo">
  </a>
</p>

## Author

**trunghieupham59** - [github.com/trunghieupham59](https://github.com/trunghieupham59)

## Disclaimer

Viezan is an independent desktop application and is not affiliated with Google, Anthropic, OpenAI, Groq, Tavily, Brave, Ollama, LM Studio or llama.cpp. You are responsible for your own provider usage and associated costs.

## License

[MIT](LICENSE)
