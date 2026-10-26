/**
 * historySlice — Zustand store slice for Translation History and Live Sessions.
 *
 * Manages persisted history of text translations and live-translate sessions
 * independently of chat state and user settings.
 */
import { MAX_TRANSLATION_HISTORY as MAX_HISTORY, MAX_LIVE_SESSIONS } from '../../constants/history'
import type { HistoryItem, LiveSession } from '../../types'
import type { SliceGet, SliceSet } from './sliceTypes'

export interface HistorySlice {
  // State
  history: HistoryItem[]
  liveSessions: LiveSession[]
  /** ID of the live session currently being viewed (null = not viewing any) */
  viewingLiveSessionId: string | null
  /**
   * History entry the AI Translate screen should reopen on its next mount.
   * Set by "Use this" in history before navigating; the translate hook
   * restores the entry's comparison results and clears it.
   */
  pendingTranslateRestoreId: string | null

  // History actions
  addHistory: (item: HistoryItem) => void
  upsertHistory: (item: HistoryItem) => void
  deleteHistoryItem: (id: string) => void
  clearHistory: () => void
  setPendingTranslateRestore: (id: string | null) => void
  /**
   * Put a saved translation back on the AI Translate screen: text, languages,
   * style and models go to the store here; the translate hook then restores
   * the per-model results and the pick from `pendingTranslateRestoreId`.
   */
  reuseTranslationHistory: (item: HistoryItem) => void

  // Live session actions
  addLiveSession: (session: LiveSession) => void
  updateLiveSession: (id: string, updates: Partial<LiveSession>) => void
  deleteLiveSession: (id: string) => void
  clearLiveSessions: () => void
  setViewingLiveSession: (id: string | null) => void
}

export const createHistorySlice = (set: SliceSet, get: SliceGet): HistorySlice => ({
  history: [],
  liveSessions: [],
  viewingLiveSessionId: null,
  pendingTranslateRestoreId: null,

  addHistory: (item) =>
    set((state: HistorySlice) => ({
      history: [item, ...state.history].slice(0, MAX_HISTORY),
    })),

  upsertHistory: (item) =>
    set((state: HistorySlice) => ({
      history: [item, ...state.history.filter((h) => h.id !== item.id)].slice(0, MAX_HISTORY),
    })),

  deleteHistoryItem: (id) =>
    set((state: HistorySlice) => ({
      history: state.history.filter((h) => h.id !== id),
    })),

  clearHistory: () => set({ history: [] }),

  setPendingTranslateRestore: (id) => set({ pendingTranslateRestoreId: id }),

  reuseTranslationHistory: (item) => {
    const savedResults = item.results ?? []
    const isComparison = savedResults.length > 1
    // Through the core setter so the legacy provider/model mirror stays in sync.
    get().setTranslationModels(isComparison
      ? savedResults.map(({ provider, model }) => ({ provider, model }))
      : [{ provider: item.provider, model: item.model }])
    set({
      sourceText: item.sourceText,
      translatedText: isComparison ? '' : item.translatedText,
      phoneticText: '',
      sourceLang: item.sourceLang,
      targetLang: item.targetLang,
      ...(item.translationStyle ? { translationStyle: item.translationStyle } : {}),
      translateError: null,
      translateErrorCode: null,
      pendingTranslateRestoreId: item.id,
    })
  },

  addLiveSession: (session) =>
    set((state: HistorySlice) => ({
      liveSessions: [session, ...state.liveSessions].slice(0, MAX_LIVE_SESSIONS),
    })),

  updateLiveSession: (id, updates) =>
    set((state: HistorySlice) => ({
      liveSessions: state.liveSessions.map((s) => s.id === id ? { ...s, ...updates } : s),
    })),

  deleteLiveSession: (id) =>
    set((state: HistorySlice) => ({
      liveSessions: state.liveSessions.filter((s) => s.id !== id),
    })),

  clearLiveSessions: () => set({ liveSessions: [] }),

  setViewingLiveSession: (id) => set({ viewingLiveSessionId: id }),
})
