/**
 * useAppStore — root Zustand store that assembles all feature slices.
 *
 * Architecture: this file is a thin aggregator.
 * All domain logic lives in the dedicated slice files under ./slices/:
 *   - coreSlice      — translation text, language pair, provider/model, navigation
 *   - settingsSlice  — locale, UI preferences, provider key status, dynamic models
 *   - historySlice   — translation history + live sessions
 *   - chatSlice      — chat sessions + system prompt presets
 *   - dictionarySlice — dictionary lookup history + favorites
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { TRANSLATIONS, type Translations } from '../i18n'
import type { ChatSession, LiveSession } from '../types'
import { normalizeChatTaskState } from '../types/chatTask'
import { type ChatSlice, createChatSlice } from './slices/chatSlice'
import { type CoreSlice, createCoreSlice } from './slices/coreSlice'
import { createDictionarySlice, type DictionarySlice } from './slices/dictionarySlice'
import { createHistorySlice, type HistorySlice } from './slices/historySlice'
import { createLanguagePairSlice, type LanguagePairSlice, migrateLanguagePairs } from './slices/languagePairSlice'
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice'
import { createUsageSlice, type UsageSlice } from './slices/usageSlice'

/** Full app state = core + all feature slices */
type AppState = CoreSlice & SettingsSlice & HistorySlice & ChatSlice & DictionarySlice & UsageSlice & LanguagePairSlice

/** Zustand persist storage key — change this value to force-reset all persisted state */
const STORE_PERSIST_KEY = 'translate-app-settings'

/**
 * Schema v4 separates live languages and adds pinned pairs. v3 separates owned
 * task instructions from drafts. It retains v2 task
 * configuration and the v1 Web Speech STT normalization.
 */
export const STORE_PERSIST_VERSION = 4

const PERSISTED_STT_PROVIDERS = new Set(['auto', 'whisper', 'google', 'groq'])

/**
 * Normalize persisted settings without discarding unrelated user data.
 *
 * Exported as a pure function so migrations remain independently testable from
 * Zustand hydration and its debounced browser storage adapter.
 */
export function migratePersistedStore<T>(persistedState: T): T {
  if (!persistedState || typeof persistedState !== 'object' || Array.isArray(persistedState)) {
    return persistedState
  }

  const state = persistedState as Record<string, unknown>
  const migrateDraft = (draft: unknown, value: unknown) => {
    const taskState = normalizeChatTaskState(value)
    const applied = taskState?.applied
    if (!applied || applied.placement === 'instruction') return { draft, taskState }
    // Move only the exact prefix recorded by Apply; edited/unowned text stays intact.
    if (typeof draft === 'string' && draft.startsWith(applied.prompt)) {
      return { draft: draft.slice(applied.prompt.length), taskState: { ...taskState, applied: { ...applied, placement: 'instruction' as const } } }
    }
    return { draft, taskState: { ...taskState, applied: null } }
  }
  const pending = migrateDraft(state.chatPendingDraft, state.chatPendingTaskState)
  return {
    ...state,
    ...migrateLanguagePairs(state),
    sttProvider: typeof state.sttProvider === 'string' && PERSISTED_STT_PROVIDERS.has(state.sttProvider) ? state.sttProvider : 'auto',
    ...(typeof pending.draft === 'string' ? { chatPendingDraft: pending.draft } : {}),
    chatPendingTaskState: pending.taskState,
    ...(Array.isArray(state.chatSessions) ? {
      chatSessions: state.chatSessions.map((session) => {
        if (!session || typeof session !== 'object') return session
        const migrated = migrateDraft(session.draftInput, session.taskState)
        return { ...session, ...(typeof migrated.draft === 'string' ? { draftInput: migrated.draft } : {}), taskState: migrated.taskState }
      }),
    } : {}),
  } as T
}

/**
 * Debounced localStorage storage — batches writes at most once per `delay` ms.
 * Prevents excessive serialization on rapid state updates (e.g. typing in source text).
 *
 * Exposes a module-level `flushPersistedStore()` that synchronously commits any
 * pending write — used to make sure cross-window listeners (e.g. the standalone
 * Quick Chat popup) see the latest provider/model selection without waiting for
 * the debounce timeout.
 */
let flushDebouncedWrite: () => void = () => {}

export function flushPersistedStore(): void {
  flushDebouncedWrite()
}

/**
 * Read-only persistence for secondary windows.
 *
 * Every window owns its own Zustand instance over the SAME localStorage key and
 * zustand's `persist` writes the whole partialized snapshot on every `set` — even
 * for ephemeral state such as `keyStatus` or a rehydrate. A window that only reads
 * the shared settings (the standalone Quick Chat popup) would therefore overwrite
 * newer history / chat sessions / live sessions / dictionary entries written by the
 * main window with its stale snapshot. Such windows call this once at startup: they
 * keep hydrating from storage but never write or remove it.
 */
let persistWritesEnabled = true

export function disablePersistedStoreWrites(): void {
  persistWritesEnabled = false
}

type PersistedBlob = { state?: Record<string, unknown>; version?: number }

/**
 * Progressively shrink a serialized persist blob so it can still be stored after the
 * browser rejects the full payload. Settings (provider, model, theme, language …) are
 * always kept; bulky, re-creatable data goes first:
 *   1. per-segment live transcripts, 2. all but the most recent sessions/history,
 *   3. every bulky collection.
 * Returns null when the payload cannot be parsed or no further shrinking is possible.
 */
export function compactPersistedValue(value: string, level: 1 | 2 | 3): string | null {
  let blob: PersistedBlob
  try {
    blob = JSON.parse(value) as PersistedBlob
  } catch {
    return null
  }
  const state = blob?.state
  if (!state || typeof state !== 'object') return null

  const keepRecent = (key: string, count: number) => {
    const list = state[key]
    if (Array.isArray(list)) state[key] = list.slice(0, count)
  }

  if (level === 1) {
    if (Array.isArray(state.liveSessions)) {
      state.liveSessions = (state.liveSessions as LiveSession[]).map(({ segments: _segments, ...rest }) => rest)
    }
  } else if (level === 2) {
    keepRecent('liveSessions', 5)
    keepRecent('chatSessions', 5)
    keepRecent('history', 30)
    keepRecent('dictionaryEntries', 100)
    if (Array.isArray(state.liveSessions)) {
      state.liveSessions = (state.liveSessions as LiveSession[]).map(({ segments: _segments, ...rest }) => rest)
    }
  } else {
    for (const key of ['liveSessions', 'chatSessions', 'history', 'dictionaryEntries']) {
      if (Array.isArray(state[key])) state[key] = []
    }
  }
  return JSON.stringify(blob)
}

/** Write to storage; on quota errors retry with progressively smaller payloads. */
export function writeWithQuotaFallback(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  value: string,
): boolean {
  try {
    storage.setItem(key, value)
    return true
  } catch (error) {
    console.warn('[store] Persisting full state failed; retrying with a compacted payload.', error)
  }
  for (const level of [1, 2, 3] as const) {
    const compacted = compactPersistedValue(value, level)
    if (compacted === null) return false
    try {
      storage.setItem(key, compacted)
      return true
    } catch {
      // try the next, smaller level
    }
  }
  console.warn('[store] Could not persist state even after compaction; skipping this write.')
  return false
}

function createDebouncedStorage(delay = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingKey: string | null = null
  let pendingValue: string | null = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!persistWritesEnabled) {
      pendingKey = null
      pendingValue = null
      return
    }
    if (pendingKey !== null && pendingValue !== null) {
      const key = pendingKey
      const value = pendingValue
      // Clear first so a failing write can never wedge every later flush.
      pendingKey = null
      pendingValue = null
      writeWithQuotaFallback(localStorage, key, value)
    }
  }
  flushDebouncedWrite = flush

  return {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => {
      if (!persistWritesEnabled) return
      pendingKey = key
      pendingValue = value
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    removeItem: (key: string) => {
      if (!persistWritesEnabled) return
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pendingKey = null
      pendingValue = null
      localStorage.removeItem(key)
    },
  }
}


/**
 * Drop renderer-only blob fields from a chat session before persisting it.
 * `imageBase64` (and the `data:`-URL `imagePreviewUrl` derived from it) can be
 * multiple megabytes each — keeping them in localStorage risks blowing the
 * quota the first time the user attaches a high-res photo. We retain the
 * filename and MIME type so the UI can still render a meaningful past message.
 */
function stripChatSessionImageData(session: ChatSession): ChatSession {
  return {
    ...session,
    messages: session.messages.map((message) => ({
      ...message,
      content: message.content.map((part) =>
        part.type === 'image'
          ? {
            type: 'image',
            text: part.text,
            imageFileName: part.imageFileName,
            imageMimeType: part.imageMimeType,
            // The pixels themselves live in IndexedDB; only the key is persisted.
            imageStoreKey: part.imageStoreKey,
          }
          : part,
      ),
    })),
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...createCoreSlice(set, get),
      ...createLanguagePairSlice(set, get),
      ...createSettingsSlice(set),
      ...createHistorySlice(set),
      ...createChatSlice(set),
      ...createDictionarySlice(set),
      ...createUsageSlice(set),
    }),
    {
      name: STORE_PERSIST_KEY,
      version: STORE_PERSIST_VERSION,
      storage: createJSONStorage(() => createDebouncedStorage(500)),
      migrate: (persistedState) => migratePersistedStore(persistedState as AppState),
      partialize: (state) => ({
        liveSourceLang: state.liveSourceLang,
        liveTargetLang: state.liveTargetLang,
        pinnedLanguagePairs: state.pinnedLanguagePairs,
        recentLanguagePairs: state.recentLanguagePairs,
        languagePairDirections: state.languagePairDirections,
        sourceLang: state.sourceLang,
        targetLang: state.targetLang,
        selectedProvider: state.selectedProvider,
        selectedModels: state.selectedModels,
        translationModels: state.translationModels,
        autoTranslate: state.autoTranslate,
        autoTranslateDelay: state.autoTranslateDelay,
        phoneticMode: state.phoneticMode,
        translationStyle: state.translationStyle,
        translationReasoningEffort: state.translationReasoningEffort,
        imageProviderFallback: state.imageProviderFallback,
        ttsMode: state.ttsMode,
        ttsVoice: state.ttsVoice,
        fontSize: state.fontSize,
        theme: state.theme,
        sttProvider: state.sttProvider,
        chatSendShortcut: state.chatSendShortcut,
        chatNewSessionShortcut: state.chatNewSessionShortcut,
        sidebarCollapsed: state.sidebarCollapsed,
        aiChatSidebarCollapsed: state.aiChatSidebarCollapsed,
        translateComparisonView: state.translateComparisonView,
        locale: state.locale,
        localeAuto: state.localeAuto,
        history: state.history,
        liveSessions: state.liveSessions,
        // Strip ephemeral image data (base64 + preview URL) from each chat
        // message before writing to localStorage. Without this, attached
        // images can easily push a single session over the 5–10 MB browser
        // quota, causing silent persist failures and lost history. The
        // metadata we keep (fileName + mimeType) lets the UI still display
        // a "[image]" placeholder for past turns.
        chatSessions: state.chatSessions.map(stripChatSessionImageData),
        chatSystemPrompt: state.chatSystemPrompt,
        systemPromptPresets: state.systemPromptPresets,
        chatPendingDraft: state.chatPendingDraft,
        chatPendingTaskState: state.chatPendingTaskState,
        chatPendingDeepResearchMode: state.chatPendingDeepResearchMode,
        chatPendingWebSearchMode: state.chatPendingWebSearchMode,
        chatPendingImageMode: state.chatPendingImageMode,

        langUsage: state.langUsage,
        recentModels: state.recentModels,
        dictionaryEntries: state.dictionaryEntries,
        costCurrency: state.costCurrency,
        apiKeyUsageTotals: state.apiKeyUsageTotals,
      }),
    }
  )
)

/** Standalone hook for translations — re-renders on locale change. */
export function useT(): Translations {
  return useAppStore((s) => TRANSLATIONS[s.locale])
}
