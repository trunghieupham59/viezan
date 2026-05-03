# 08 — State Management

Viezan uses **Zustand 5** with a custom slice pattern. The single store lives in `src/store/useAppStore.ts` and composes four feature slices.

## Why Zustand + slices?

- Tiny, fully typed, no provider tree.
- Slice pattern keeps each feature's state, actions and selectors in its own file (`src/store/slices/`).
- Easy to test slices in isolation (`src/store/__tests__/`).

## Store Composition

```ts
// src/store/useAppStore.ts (sketch)
type AppState = CoreSlice & SettingsSlice & HistorySlice & ChatSlice

export const useAppStore = create<AppState>()(
  persist(
    (set, get, store) => ({
      ...createCoreSlice(set, get, store),
      ...createSettingsSlice(set, get, store),
      ...createHistorySlice(set, get, store),
      ...createChatSlice(set, get, store),
    }),
    {
      name: 'viezan-app',
      version: PERSIST_VERSION,
      partialize: (state) => pickPersisted(state),
      migrate: migrateV1ToV2,           // example
    },
  ),
)
```

Persistence is debounced (~500 ms) and writes to `localStorage`. Schema migrations live next to the store.

## Slices

### CoreSlice (`src/store/slices/coreSlice.ts`)

Translation working state and global navigation.

| Field | Persisted? | Description |
|---|---|---|
| `activePage` | ✗ | `'translate' \| 'live' \| 'chat' \| 'history' \| 'settings'` |
| `sourceLang`, `targetLang` | ✓ | BCP-47-ish codes (`auto`, `en`, `vi`, `ja`, …) |
| `selectedProvider` | ✓ | `'local' \| 'gemini' \| 'claude' \| 'openai'` |
| `selectedModels` | ✓ | `Record<Provider, string>` — last model picked per provider |
| `sourceText`, `translatedText` | ✗ | Current panes |
| `phoneticText` | ✗ | Furigana / pinyin / romanization output |
| `isTranslating`, `translateError` | ✗ | UX state |
| `imageAttachment` | ✗ | `{ mime, base64 } \| null` |

Actions: `setSourceLang`, `setTargetLang`, `setProvider`, `setModelForProvider`, `setSourceText`, `setTranslatedText`, `setIsTranslating`, `setTranslateError`, `setImageAttachment`, `swapLanguages`, `clearTranslate`.

### SettingsSlice (`src/store/slices/settingsSlice.ts`)

User preferences. All fields persisted.

| Field | Description |
|---|---|
| `locale`, `localeAuto` | UI locale + auto-detect flag |
| `fontSize` | `'small' \| 'medium' \| 'large'` |
| `accent` | Accent color id (UI theme) |
| `autoTranslate` | Translate on type vs manual |
| `showFurigana` | Phonetic on/off |
| `translationStyle` | `'standard' \| 'formal' \| 'casual' \| 'technical' \| 'literal' \| 'localized' \| 'concise'` |
| `voiceInputProvider`, `voiceInputModel` | STT preference |
| `ttsProvider`, `ttsVoice`, `ttsSpeed` | TTS preference |
| `webSearchProvider` | `'tavily' \| 'brave' \| 'jina'` |
| `globalHotkey` | Accelerator string |
| `quickChatHotkey` | Accelerator string |
| `subtitleStyle` | `{ fontSize, opacity, position }` |

Actions: typed setters per field plus `resetSettings()`.

### HistorySlice (`src/store/slices/historySlice.ts`)

Searchable history.

| Field | Persisted? | Description |
|---|---|---|
| `history` | ✓ | Translate history `Array<TranslationRecord>` |
| `liveSessions` | ✓ | Live meeting session records (with transcript) |
| `historySearch` | ✗ | Current search box |

Actions: `addToHistory`, `removeFromHistory`, `clearHistory`, `addLiveSession`, `removeLiveSession`, `clearLiveSessions`, `setHistorySearch`.

`TranslationRecord` and `LiveSessionRecord` types are in `src/types/index.ts`.

### ChatSlice (`src/store/slices/chatSlice.ts`)

| Field | Persisted? | Description |
|---|---|---|
| `chatSessions` | ✓ | `Array<ChatSession>` |
| `activeChatId` | ✗ | Current session id |
| `chatSystemPrompt` | ✓ | Default system prompt |
| `systemPromptPresets` | ✓ | User-saved presets |
| `chatStreaming` | ✗ | UX state |
| `webSearchEnabled` | ✗ | Toggle on the chat page |

Actions: `createChat`, `deleteChat`, `setActiveChatId`, `appendMessage`, `updateLastMessage`, `setChatSystemPrompt`, `addPreset`, `removePreset`.

## Persistence Whitelist (`partialize`)

Only fields that should survive a reload are persisted. The whitelist is intentionally tight to keep the localStorage payload small and to avoid leaking ephemeral state across runs.

Persisted keys (subject to evolution):

```
sourceLang, targetLang, selectedProvider, selectedModels,
locale, localeAuto, fontSize, accent,
autoTranslate, showFurigana, translationStyle,
voiceInputProvider, voiceInputModel,
ttsProvider, ttsVoice, ttsSpeed,
webSearchProvider, globalHotkey, quickChatHotkey,
subtitleStyle,
history, liveSessions, chatSessions, chatSystemPrompt, systemPromptPresets
```

Anything else is reset on each launch.

## Selectors

Use shallow selectors at the call site to keep renders narrow:

```ts
const sourceLang = useAppStore((s) => s.sourceLang)
const setSourceLang = useAppStore((s) => s.setSourceLang)
```

Avoid `useAppStore()` (no selector) — it forces a re-render on every store change.

## Adding A Slice

1. Create `src/store/slices/<feature>Slice.ts`:

```ts
import { StateCreator } from 'zustand'
export interface FeatureSlice { /* fields + actions */ }
export const createFeatureSlice: StateCreator<FeatureSlice> = (set, get) => ({ /* … */ })
```

2. In `useAppStore.ts`, intersect the slice into `AppState` and spread its creator.
3. If anything in the slice needs to persist, add the field name to the `partialize` whitelist.
4. Bump `PERSIST_VERSION` and add a `migrate` step if the persisted shape changed.
5. Add a Vitest spec under `src/store/__tests__/`.

## Migrations

The `persist` middleware's `version` + `migrate` lets us evolve persisted schemas without breaking installed users. Keep migrations idempotent and pure (no `window.api` calls). Delete the localStorage entry only as a last resort.

## Common Pitfalls

- Putting transient UI state (form drafts, modal open flags) in the store. Prefer `useState` for component-local state.
- Selecting a derived array/object inline in a selector — it changes reference each render. Use `useShallow` or a memo.
- Persisting blobs / images / large transcripts — keep big binary data in IndexedDB or as a saved file, store only metadata in Zustand.
- Forgetting to add a new persisted field to `partialize` — it will appear to "work" until the user reloads.
