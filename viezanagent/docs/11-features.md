# 11 — Features Deep Dive

This page documents how each user-facing feature is wired end-to-end. For the IPC channels referenced here, see [`05-ipc-reference.md`](./05-ipc-reference.md).

---

## Translate (Text & Image)

**UI**: `src/pages/TranslatePage.tsx` (JSX-only) + `src/hooks/useTranslate.ts` (logic).

### Text path

```
User input
  └─► debounced if autoTranslate, else manual click
        └─► useTranslate() builds params from store
              ├─► single model → window.api.translate({ provider, model, ... })
              └─► comparison → up to 3 independent window.api.translate requests
                    └─► ipc 'translate' → withRetry → TRANSLATE_PROVIDERS[provider]
                          └─► result cards update independently as each request finishes
```

- **Auto vs Manual** — `settingsSlice.autoTranslate`. Auto uses the configured debounce. Selecting multiple models switches Translate to manual mode so provider cost stays explicit.
- **Multi-model comparison** — `coreSlice.translationModels` persists up to three provider/model pairs. Each request has its own request id, error, retry and timing state; one provider failure does not hide successful results from the others. The first selected model that succeeds becomes the main translation, and the user can promote another result for swap/phonetic actions.
- **Style** — `'standard' | 'formal' | 'casual' | 'technical' | 'literal' | 'localized' | 'concise'`. Maps to a tone preamble in `electron/ipc/translatePrompts.ts`.
- **Phonetic** — `showFurigana` adds furigana / pinyin / romanization to the result. Rendered by `FuriganaText`.
- **Chunking** — long inputs are split by `splitIntoChunks` (whitespace + punctuation aware) with a per-chunk timeout, then joined.

### Image path

```
File / drop / paste / clipboard
  └─► imageUtils.toBase64(file) + MIME check (constants/image.ts)
        └─► window.api.imageTranslate({ provider, model, image, mode })
              └─► ipc 'image:translate' → image:extract or image:edit
                    └─► extracted text or translated image base64
```

- Default mode is `extract`. Gemini vision models can also do `edit` (returns an image with translated overlay).
- The sentinel `IMAGE_TRANSLATED_SENTINEL = '✓'` marks edited-image responses; the page swaps the result pane to a `<img>` and shows `ImageSwitchToast`.
- File size and MIME are validated before invoking IPC.

### Voice input

`VoiceRecorder.tsx` captures audio with `MediaRecorder`; `useVoiceInput.ts` appends the final
transcript to the current draft. The completed recording crosses the typed preload boundary
and is transcribed in Electron Main. Provider preference is chosen in Settings → STT:

| Provider | How |
|---|---|
| Auto | Sequential fallback through configured STT providers for one-shot dictation. |
| Whisper (OpenAI) | Records locally, then sends `audio:transcribe` with `purpose: 'dictation'`. |
| Gemini STT | Same recorded-audio flow, routed to Gemini in Electron Main. |
| Groq Whisper | Same recorded-audio flow, routed to Groq in Electron Main. |

While recording, the UI shows an explicit recording state, elapsed time and cancel/stop actions.
The text field is updated only after Electron Main returns a final transcript.

### Rewrite

The `Rewrite` button calls `translate:rewrite` to refine the source text in the same language with the chosen tone.

### Speak (TTS)

Calls `useTTS().speak(text)` which:

1. Picks the preferred provider (`settingsSlice.ttsProvider`).
2. Calls `window.api.audio.tts(...)`.
3. Plays the returned base64/MP3 buffer through an `Audio` element.

The IPC handler internally walks the chain OpenAI → Gemini → Edge → ElevenLabs.

---

## Live Translate

**UI**: `src/pages/LiveTranslatePage.tsx`. **Logic**: `src/hooks/useLiveTranslate.ts` plus helpers under `src/hooks/live/`.

```
Microphone / System / Mixed audio
  └─ AudioContext + analyserNode
        └─ VAD policy (vadPolicy.ts) — RMS amplitude + sustained ms gates
              └─ MediaRecorder chunks (up to 2 s, VAD early-stop)
                    └─ window.api.audio.transcribe({ provider, audio, language })
                          └─ Whisper / Gemini / Groq → segments + confidence
                                └─ Confidence gates:
                                    • noSpeechProb > 0.90       → drop
                                    • avgLogprob   < -2.0       → drop
                                    • compressionRatio > 3.5    → drop
                                    • > 60 words/chunk          → drop
                                    • > 15 words/sec            → drop
                                └─ Hallucination filter + Jaccard near-dup (>0.92) drop
                                      └─ transcriptAssembly.ts buffers until ./!/?/。
                                            └─ speakerDiarization.ts assigns Speaker N
                                                  ├─ Subtitle ON  → translate:live-stream → subtitle window
                                                  └─ Subtitle OFF → translate (batch)    → page UI
                                                        └─ post-meeting actions (useLiveAiActions.ts)
```

Highlights:

- **`mountedRef` guard** — every async callback checks `mountedRef.current` before `setState` to avoid post-unmount writes.
- **Source-aware VAD** — different thresholds for mic vs system audio (system audio is generally cleaner).
- **Subtitle overlay** — `subtitle:enable` creates the floating window; `subtitle:update { source, translated }` is pushed each time a sentence finalizes. The overlay uses click-through (`setIgnoreMouseEvents(true, { forward: true })`).
- **Speaker labels** — silence-gap heuristic with two-speaker alternation and an LRU cap. Users can rename Speaker N → real name in the post-meeting UI.
- **Post-meeting actions** — `useLiveAiActions.ts` reuses `chat:send` to summarize, extract action items, decisions and run a speaker analysis pass.
- **Export** — `.txt` (with timestamps + speaker) and `.srt` (subtitle file) generated client-side.

Design notes: [`live_trans.md`](./live_trans.md). Architecture: [`live-translate-pipeline.md`](./live-translate-pipeline.md).

---

## AI Chat

**UI**: `src/pages/ChatPage.tsx`, `src/components/chat/*`, `src/components/markdown/*`. **Logic**: `src/services/chatService.ts`, `smartThinkingService.ts`, `deepResearchService.ts` + `chatSlice.ts`.

- Sessions are persisted through `chatSlice`; assistant replies stream via `chatService.stream()` and render through `MessageBubble` + `MarkdownText`.
- **System Prompt** — single active prompt plus saved presets (`systemPromptPresets`).
- **Multimodal input** — drag/drop / paste images; size and MIME are validated before IPC.
- **Native chart output** — assistant replies may include fenced `chart` JSON blocks. `MarkdownText` validates the JSON shape and renders bar, line or pie charts through `ChartBlock`; invalid chart blocks fall back to code rendering instead of executing arbitrary markup.
- **Artifact direction** — future rich outputs should follow the same controlled schema pattern: AI proposes structured data, the renderer validates it, and Viezan-owned components render charts, tables, diagrams or generated-image artifacts. Do not render model-produced HTML/SVG directly.
- **Image generation direction** — generated images should use a dedicated Main Process IPC channel so provider keys remain outside the renderer. Store large image payloads outside persisted chat session JSON and keep only artifact metadata / ids in chat messages.
- **Deep Research** — `services/deepResearchService.ts` runs an iterative "search → read → reflect" loop using `webSearch:search` + `webSearch:fetchPage` + `chat:send`.
- **Smart Thinking** — `services/smartThinkingService.ts` classifies when web context is useful and streams a final answer back into the chat bubble.

---

## Quick Chat

**Window entry**: `src/quick-chat-main.tsx`. **Component**: `src/components/AIChatPopup.tsx`. **Main control**: `electron/ipc/quickChat.ts`.

- Floating, frameless, on-top window summoned by a global hotkey (default `Alt+Space` / `Option+Space`, configurable in Settings).
- Reuses the same Zustand store as the main app, so chat history, system prompt presets and provider/model selection are shared.
- macOS focus: in v2.0 the panel was reworked so showing it does not steal focus from the previous app and reopening the dock works correctly.
- Closes on `Esc` or blur; toggling the hotkey restores the previous text.

---

## Image Translate (standalone)

The Image Translator component (`src/components/translate/ImageTranslator.tsx`) lives inside `TranslatePage`. It supports:

- **Extract mode** — returns text for the textarea.
- **Edit mode** — returns a translated PNG (Gemini vision); shown as a downloadable image.
- Drag-drop on the panel, paste from clipboard, or file picker.
- Max size and MIME come from `src/constants/image.ts`.

---

## TTS

**Renderer hook**: `src/hooks/useTTS.ts`. **Main handler**: `electron/ipc/tts.ts`.

Fallback chain (first success wins):

```
preferred (or user-default 'edge')
  └─ openai (tts-1 / tts-1-hd)
        └─ gemini (audio model)
              └─ edge (Microsoft Edge online TTS, free, no key)
                    └─ elevenlabs (paid)
```

- Renderer plays returned audio via an `Audio` element with `autoplay-policy=no-user-gesture-required` (set in `main.ts`).
- Voices and speed are configurable in Settings → TTS.
- Edge TTS is the default for users without keys — no signup, decent quality (Microsoft Neural).
- For background design notes inspired by a sibling project, see [`TTS_ARCHITECTURE.md`](./TTS_ARCHITECTURE.md). Viezan does not implement that exact architecture but reuses ideas (queue-based seamless playback, unified provider interface).

---

## STT

`electron/ipc/transcribe.ts` accepts a validated request containing `requestId`, `purpose`,
`audioData`, the actual recorder MIME type, language and STT preference. It dispatches to:

- **OpenAI Whisper** (`whisper-1` or `whisper-large-v3`).
- **Gemini** audio understanding.
- **Groq Whisper** for low-latency batch.

Whisper-style segment metadata (`avgLogprob`, `noSpeechProb`, `compressionRatio`) is preserved and used by Live Translate's confidence gates.

One-shot `dictation` requests use sequential fallback so one recording is not uploaded to
multiple providers concurrently. Live Translate uses `purpose: 'live'` and keeps its own
low-latency routing policy. `audio:cancelTranscription` can abort an in-flight request.

---

## Web Search

**Main**: `electron/ipc/webSearch.ts`. **Renderer**: invoked from `chatService` and `deepResearchService`.

- Default provider order: `Tavily → Brave → Jina`. Tavily and Brave use API keys; Jina works without one but is slower and noisier.
- `webSearch:fetchPage` retrieves a URL's HTML for the Deep Research read step. The HTML is sanitized server-side (no scripts forwarded).

---

## Auto-Update

**Main**: `electron/ipc/updater.ts`. **UI**: `src/pages/settings/UpdaterSection.tsx`.

- Uses `electron-updater` against the GitHub Releases feed (configured in `package.json`).
- Checks at startup (production) and on demand from Settings.
- Events are forwarded to the renderer; the UI shows status, progress, and an `Install and Restart` button when ready.

---

## Global Hotkey

**Main**: `electron/ipc/globalHotkey.ts`. **UI**: `HotkeySection`.

- A single OS-level shortcut. Default `Alt+T` / `Option+T` to translate the current selection.
- `HotkeyRecordButton` captures a key combination from the user.
- On press, the active selection is fetched (via clipboard fallback when the OS doesn't expose selection APIs) and routed to translate.

---

## History

**Slice**: `historySlice.ts`. **Page**: `pages/HistoryPage.tsx`.

- **Translate history** — every successful translation creates a `TranslationRecord { id, ts, sourceLang, targetLang, sourceText, translatedText, provider, model, style }`.
- **Chat history** — entire `ChatSession` objects (messages + system prompt) are persisted by `chatSlice`.
- **Live history** — finished sessions are saved with the full transcript, speaker labels, and any post-meeting AI outputs.
- Bulk select + delete; search across content.

---

## Browser Integration

See [`12-chrome-extension.md`](./12-chrome-extension.md). Key points:

- The Chrome Extension talks to the desktop app over `127.0.0.1:39875` using a `sk-vie-…` connection key.
- Provider keys are never sent to the extension.
- The extension supports floating button, context menu, popup, options page and an `Alt+T` shortcut.
