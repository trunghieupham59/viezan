# 07 — React Renderer

The renderer is a Vite + React 18 + TypeScript SPA living under `src/`. It renders entirely from `window.api` and Zustand state — there is no fetch or filesystem access happening directly in this layer.

## Entry Points

| File | Window | Mounts |
|---|---|---|
| `src/main.tsx` | Main app | `<App />` inside `React.StrictMode` |
| `src/quick-chat-main.tsx` | Quick Chat panel | `<AIChatPopup />` (only) |

`public/subtitle.html` is rendered by the floating subtitle window using `electron/subtitle-preload.ts`; it is plain HTML/JS (no React), kept tiny on purpose.

## App Shell

`src/App.tsx` is the layout root for the main window. Responsibilities:

- macOS traffic-light drag region (top 40 px, `MACOS_TITLEBAR_HEIGHT_PX`).
- `<Sidebar />` for primary navigation between pages.
- Lazy routes for the heavy pages (code-split via `React.lazy` + `<Suspense>`):
  - `TranslatePage`
  - `LiveTranslatePage`
  - `ChatPage`
  - `HistoryPage`
- Always-mounted `<SettingsModal />` (visibility controlled by store).
- Boot effects:
  - On mount, if `localeAuto`, detect system locale and apply.
  - Probe `window.api.keychain.has(...)` for every provider to know which features are available.
  - Apply persisted `fontSize` and `accent` to `document.documentElement`.
  - Subscribe to `window.api.hotkey.onTriggered` and route the active selection to translate.
  - Subscribe to `window.api.updater.*` and surface a banner / toast.
- `FONT_SIZE_MAP`: small=13, medium=15, large=17 px.

## Pages

### `pages/TranslatePage.tsx`

Two-panel text/image translator. The UI is intentionally JSX-only — all logic lives in the `useTranslate` hook.

Structure:
- Top bar: source selector → swap → target selector → settings popover (`ModelSelector` + `TranslateToolbar`).
- Source panel: textarea with drag/drop / paste / file-picker for images, `VoiceOverlay`, `ImageAttachmentPreview`, action row (mic, image, clear, rewrite, speak), char counter, manual translate button.
- Result panel: spinner / `TranslateError` / edited image / `MarkdownText` or `FuriganaText` depending on phonetic mode.
- Bidirectional scroll-sync between the two panels via refs.
- `IMAGE_TRANSLATED_SENTINEL = '✓'` marks Gemini image-edit responses; `ImageSwitchToast` notifies the user when the backend swapped models.

### `pages/LiveTranslatePage.tsx`

Realtime meeting translation page. ~1k lines of UI, split into row-shaped components under `src/components/live/`. Handles:

- Audio source selector: microphone / system / both (segmented control).
- Target language and model.
- Start / Stop button (with mic and screen permission prompts on macOS).
- Live transcript and live translation panes.
- Speaker badges from `speakerColors.ts` and `speakerDiarization.ts`.
- Floating subtitle toggle → `subtitle:enable/disable` + `subtitle:update` stream.
- Post-meeting actions: summarize, action items, decisions, speaker analysis (driven by `useLiveAiActions.ts`).
- Export to `.txt` / `.srt`.

The audio + transcription + translation pipeline is fully owned by `src/hooks/useLiveTranslate.ts` (see [`live-translate-pipeline.md`](./live-translate-pipeline.md)).

### `pages/ChatPage.tsx`

Multi-turn AI chat:
- Sidebar of saved sessions (CRUD via `chatSlice`).
- System prompt picker (`SystemPromptDropdown`) with user presets.
- Streaming reply rendering (`MessageBubble` + `MarkdownText`).
- Native chart artifact rendering from fenced `chart` JSON blocks (`MarkdownText` + `components/markdown/ChartBlock.tsx`).
- Image attachments (drag/drop/paste).
- Voice input (`VoiceRecorder`).
- Optional Web Search toggle (Tavily / Brave / Jina).
- Optional Deep Research panel (uses `services/deepResearchService.ts`).
- Smart Thinking flag (uses `services/smartThinkingService.ts`).
- Token usage and current model indicator.

### `pages/HistoryPage.tsx`

Tabbed history:
- `TranslationHistoryTab` for text translations.
- `ChatHistoryTab` for chat sessions.
- `LiveHistoryTab` for live meeting sessions (with link back to the saved transcript).
- Bulk-select / delete / export. Helpers in `pages/history/historyUtils.tsx`.

### `pages/SettingsPage.tsx`

Composed of section components in `pages/settings/`:
- `AboutSection` — version, license, links (each click goes through `window.api.system.openExternal`).
- `ApiKeysSection` — encrypts and stores keys; **also hosts the Local AI runtime UI** (discover, benchmark, install Ollama, pull models).
- `BrowserIntegrationSection` — connection key display/rotate, TTL picker, extension link.
- `ChatPresetsSection` — system prompt presets.
- `HotkeySection` — record + persist global hotkey.
- `PreferencesSection` — locale, font size, theme, auto-translate, show furigana.
- `SttSection` / `TtsSection` — STT and TTS providers, voices.
- `UpdaterSection` — `Check for updates`, download/install.

## Components

```
components/
├── AIChatPopup.tsx        Quick Chat panel composition
├── ApiKeyInput.tsx        Generic key input + Verify button
├── AppLogo.tsx
├── LanguageSelector.tsx
├── MarkdownEditor.tsx
├── MarkdownText.tsx       Renders model output (sanitized Markdown + chart fences)
├── ModelSelector.tsx
├── ProviderIcon.tsx
├── SettingsModal.tsx
├── Sidebar.tsx
├── VoiceRecorder.tsx
├── chat/                  Chat-specific bubbles, prompt dropdown, deep research panel
├── markdown/              Structured Markdown artifacts such as chart blocks
├── live/                  Speaker rows, language bars, segment row, transcription/translation rows
├── translate/             Source/target language bars, image preview, voice overlay, toolbar
└── ui/                    Reusable primitives (buttons, toggles, pickers, icons)
    └── icons/             Icon registry split by category (auth, files, media, navigation, providers, status)
```

UI primitives keep most styling in Tailwind utility classes. Icons are imported from the registry to avoid hardcoded inline SVGs (this is enforced by the `split-ui-component` workflow).

## Hooks

```
src/hooks/
├── useTranslate.ts        Owns translate page state machine
├── useLiveTranslate.ts    Owns the audio→STT→translate pipeline
├── useTTS.ts              Wraps audio:tts + Audio playback
├── useVoiceInput.ts       Appends completed recorded-audio transcripts to the current draft
├── useTypewriter.ts       Streaming text typewriter effect
└── live/
    ├── vadPolicy.ts            Source-aware VAD thresholds, gain constants
    ├── transcriptAssembly.ts   Sentence boundary buffer, force-flush, dedup
    ├── speakerDiarization.ts   Speaker-by-silence heuristic
    └── useLiveAiActions.ts     Summarize / action items / decisions / speaker analysis
```

## Services (Renderer-side helpers)

```
src/services/
├── translationService.ts   Composes window.api.translate with style + chunking front-end
├── chatService.ts          Composes window.api.chat with streaming + presets
├── deepResearchService.ts  Iterative web-search-then-synthesize loop
└── smartThinkingService.ts Multi-turn reflection wrapper around chat
```

These services are stateless and importable from any page or hook.

## Constants

```
src/constants/
├── providers.ts    PROVIDERS list + LANGUAGES + DEFAULT_SETTINGS + STYLES
├── audio.ts        VAD thresholds, sample rates, Whisper params
├── image.ts        MIME allowlist, max size, IMAGE_TRANSLATED_SENTINEL
├── langNames.ts    BCP-47 → display name (vi/en/ja)
├── ui.ts           FONT_SIZE_MAP, MACOS_TITLEBAR_HEIGHT_PX, etc.
└── urls.ts         External URLs (provider docs, MoMo, GitHub)
```

`providers.ts` is the **single source of truth** for renderer-visible provider metadata (icon color, default models, models with `tag`, doc URL). The matching server-side allowlist is `electron/ipc/providers/types.ts → SUPPORTED_PROVIDERS`.

## i18n

`src/i18n/index.ts` exposes `TRANSLATIONS` and `LOCALE_NAMES`; components read the active locale through `useT()` from `src/store/useAppStore.ts`. Locale files in `src/i18n/locales/{en,ja,vi}.ts` use flat keys (for example `settings_api_keys_title`) typed by `src/i18n/types.ts`. The structure between locales must stay **identical** — the `audit-i18n-coverage` workflow asserts this.

## Utils

```
src/utils/
├── canvas.ts             Image manipulation helpers
├── imageUtils.ts         File → base64, MIME inference, downsizing
├── keyboardShortcuts.ts  Cross-OS accelerator parser
├── live-translate.ts     Pure helpers used by useLiveTranslate
├── locale.ts             Locale detection + persistence
├── markdownInline.tsx    Sanitized inline markdown
├── modelDisplay.ts       Pretty-print model ids per provider
├── tpl.ts                Tiny template helper
└── wav-encoder.ts        PCM → WAV blob (used by audio export)
```

Each util has a focused unit test under `src/utils/__tests__/`.

## State (summary)

The renderer reads/writes through one Zustand store. See [`08-state-management.md`](./08-state-management.md) for slice details and what is/isn't persisted.

## Conventions for Renderer Code

- Pages are JSX-first. Push logic into a hook the moment the page exceeds ~250 lines or contains imperative effects.
- Cross-cutting helpers (especially anything that calls `window.api` more than once) should live in `services/` or `hooks/`.
- All user-facing renderer strings come from the `useT()` translation object. No hardcoded UI text. The `audit-i18n-coverage` workflow flags violations.
- Icons must come from `components/ui/icons/`. No inline SVG paths in feature components.
- A new feature with global state goes in a slice under `src/store/slices/`, not in component state.
- Tests use Vitest + Testing Library (`src/**/__tests__/`).
