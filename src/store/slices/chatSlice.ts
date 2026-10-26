/**
 * chatSlice — Zustand store slice for Chat Sessions and System Prompt Presets.
 *
 * Manages all chat-related state in isolation so it can be reasoned about,
 * tested, and evolved independently of translation or settings state.
 */

import { MAX_CHAT_SESSIONS } from '../../constants/history'
import type {
  ChatMessage,
  ChatSession,
  DeepResearchResumeState,
  Provider,
  SystemPromptPreset,
  UsageCost,
} from '../../types'
import { type ChatTaskStarterState, getChatTaskExecution } from '../../types/chatTask'
import { createClientId } from '../../utils/id'
import type { SliceSet } from './sliceTypes'

/**
 * Stored title of a conversation that has not been named yet. Kept in English
 * in storage (existing sessions use it); the UI localizes it at render time.
 */
export const DEFAULT_CHAT_SESSION_TITLE = 'New Chat'

export interface ChatSlice {
  // State
  chatSessions: ChatSession[]
  activeChatSessionId: string | null
  chatSystemPrompt: string
  systemPromptPresets: SystemPromptPreset[]
  /**
   * Composer draft + mode used while no session is active yet (empty state).
   * On first `createChatSession`, these are absorbed into the new session
   * (so the user's pre-send work doesn't vanish) and cleared.
   */
  chatPendingDraft: string
  chatPendingTaskState: ChatTaskStarterState | null
  setChatTaskState: (sessionId: string | null, task: ChatTaskStarterState | null) => void
  chatPendingDeepResearchMode: boolean
  chatPendingWebSearchMode: boolean
  chatPendingImageMode: boolean
  /**
   * Sessions with a reply or research run in flight right now. Runtime only
   * (never persisted), so a snapshot left by a crash still reads as paused.
   */
  chatRunningSessionIds: string[]

  // Actions
  createChatSession: (provider: Provider, model: string) => string
  deleteChatSession: (id: string) => void
  /** Put a deleted session back at its former position (undo of `deleteChatSession`). */
  restoreChatSession: (session: ChatSession, index: number) => void
  /** Mark a session's request as in flight (`true`) or settled (`false`). */
  setChatSessionRunning: (sessionId: string, running: boolean) => void
  setActiveChatSession: (id: string | null) => void
  /** Keep the provider/model owned by a conversation in sync with its composer. */
  setChatSessionModel: (sessionId: string, provider: Provider, model: string) => void
  addChatMessage: (sessionId: string, message: ChatMessage) => void
  updateChatMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void
  restartChatResearch: (sessionId: string, userMessageId: string) => void
  addChatSessionCost: (sessionId: string, cost: UsageCost) => void
  clearChatSession: (sessionId: string) => void
  /** Persist the per-session composer draft text. */
  setChatSessionDraft: (sessionId: string, draft: string) => void
  /** Persist the per-session Deep Research toggle. */
  setChatSessionDeepResearchMode: (sessionId: string, mode: boolean) => void
  /** Persist the per-session Web Search toggle. */
  setChatSessionWebSearchMode: (sessionId: string, mode: boolean) => void
  /** Persist the per-session Image Mode toggle. */
  setChatSessionImageMode: (sessionId: string, mode: boolean) => void
  /** Persist the empty-state composer draft (no active session). */
  setChatPendingDraft: (draft: string) => void
  /** Persist the empty-state Deep Research toggle (no active session). */
  setChatPendingDeepResearchMode: (mode: boolean) => void
  /** Persist the empty-state Web Search toggle (no active session). */
  setChatPendingWebSearchMode: (mode: boolean) => void
  /** Persist the empty-state Image Mode toggle (no active session). */
  setChatPendingImageMode: (mode: boolean) => void
  /**
   * Persist (or clear with `null`) the in-progress Deep Research pipeline
   * state on a session. Called from the deep-research orchestration after
   * each phase completes so a Stop / page reload can later resume from the
   * last successfully-finished phase instead of restarting the whole run.
   */
  setDeepResearchResumeState: (
    sessionId: string,
    state: DeepResearchResumeState | null,
  ) => void

  setChatSystemPrompt: (prompt: string) => void
  addSystemPromptPreset: (preset: Omit<SystemPromptPreset, 'id'>) => string
  updateSystemPromptPreset: (id: string, updates: Partial<Omit<SystemPromptPreset, 'id'>>) => void
  deleteSystemPromptPreset: (id: string) => void
  setDefaultSystemPromptPreset: (id: string | null) => void
}

export const createChatSlice = (set: SliceSet): ChatSlice => ({
  chatSessions: [],
  activeChatSessionId: null,
  chatSystemPrompt: '',
  systemPromptPresets: [],
  chatPendingDraft: '',
  chatPendingTaskState: null,
  chatPendingDeepResearchMode: false,
  chatPendingWebSearchMode: false,
  chatPendingImageMode: false,
  chatRunningSessionIds: [],

  createChatSession: (provider, model) => {
    const id = createClientId('chat')
    set((state: ChatSlice) => {
      // Absorb any pending empty-state draft/toggle so user work survives the
      // transition from "no session" to "new session".
      const session: ChatSession = {
        id,
        title: DEFAULT_CHAT_SESSION_TITLE,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider,
        model,
        taskState: state.chatPendingTaskState,
        ...(state.chatPendingDraft ? { draftInput: state.chatPendingDraft } : {}),
        ...(state.chatPendingDeepResearchMode ? { deepResearchMode: true } : {}),
      ...(state.chatPendingWebSearchMode ? { webSearchMode: true } : {}),
      ...(state.chatPendingImageMode ? { imageMode: true } : {}),
      }
      return {
        // Prepend new session and enforce MAX_CHAT_SESSIONS cap — oldest sessions are trimmed
        chatSessions: [session, ...state.chatSessions].slice(0, MAX_CHAT_SESSIONS),
        activeChatSessionId: id,
        chatPendingDraft: '',
        chatPendingTaskState: null,
        chatPendingDeepResearchMode: false,
        chatPendingWebSearchMode: false,
        chatPendingImageMode: false,
      }
    })
    return id
  },

  deleteChatSession: (id) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.filter((s) => s.id !== id),
      activeChatSessionId: state.activeChatSessionId === id ? null : state.activeChatSessionId,
    })),

  restoreChatSession: (session, index) =>
    set((state: ChatSlice) => {
      if (state.chatSessions.some((s) => s.id === session.id)) return {}
      const sessions = [...state.chatSessions]
      sessions.splice(Math.max(0, Math.min(index, sessions.length)), 0, session)
      return { chatSessions: sessions.slice(0, MAX_CHAT_SESSIONS) }
    }),

  setChatSessionRunning: (sessionId, running) =>
    set((state: ChatSlice) => {
      const has = state.chatRunningSessionIds.includes(sessionId)
      if (has === running) return {}
      return {
        chatRunningSessionIds: running
          ? [...state.chatRunningSessionIds, sessionId]
          : state.chatRunningSessionIds.filter((id) => id !== sessionId),
      }
    }),

  setActiveChatSession: (id) =>
    set((state: ChatSlice & {
      selectedProvider: Provider
      selectedModels: Record<Provider, string>
    }) => {
      if (!id) return { activeChatSessionId: null }

      const session = state.chatSessions.find((item) => item.id === id)
      if (!session) return { activeChatSessionId: id }

      return {
        activeChatSessionId: id,
        selectedProvider: session.provider,
        selectedModels: {
          ...state.selectedModels,
          [session.provider]: session.model,
        },
      }
    }),

  setChatSessionModel: (sessionId, provider, model) =>
    set((state: ChatSlice) => ({
      // Model choice is conversation metadata, not activity, so it must not
      // reorder the recent-conversation list by changing `updatedAt`.
      chatSessions: state.chatSessions.map((session) =>
        session.id === sessionId && (session.provider !== provider || session.model !== model)
          ? { ...session, provider, model }
          : session
      ),
    })),

  addChatMessage: (sessionId, message) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) => {
        if (s.id !== sessionId) return s
        const messages = [...s.messages, message]

        // Auto-generate title from the first user message when session still has default title
        let title = s.title
        if (title === DEFAULT_CHAT_SESSION_TITLE && message.role === 'user' && s.messages.length === 0) {
          const textContent = message.content.find((c) => c.type === 'text')?.text ?? ''
          if (textContent) {
            title = textContent
              .replace(/\*\*(.+?)\*\*/g, '$1')  // remove **bold**
              .replace(/\*(.+?)\*/g, '$1')        // remove *italic*
              .replace(/#+\s/g, '')               // remove # headings
              .replace(/\n[\s\S]*/g, '')          // first line only
              .trim()
              .slice(0, 60)
              || DEFAULT_CHAT_SESSION_TITLE
          }
        }

        return { ...s, title, messages, updatedAt: Date.now() }
      }),
    })),

  updateChatMessage: (sessionId, messageId, updates) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: s.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
              updatedAt: Date.now(),
            }
          : s
      ),
    })),

  addChatSessionCost: (sessionId, cost) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) => {
        if (s.id !== sessionId) return s
        const current = s.cost
        const nextCost: UsageCost = current
          ? {
              ...cost,
              id: current.id,
              amountUsd: current.amountUsd + cost.amountUsd,
              inputTokens: current.inputTokens + cost.inputTokens,
              outputTokens: current.outputTokens + cost.outputTokens,
              totalTokens: current.totalTokens + cost.totalTokens,
              estimated: current.estimated || cost.estimated,
              createdAt: cost.createdAt,
            }
          : cost
        return { ...s, cost: nextCost, updatedAt: Date.now() }
      }),
    })),

  clearChatSession: (sessionId) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: [],
              cost: undefined,
              // Clearing a session also drops any half-finished Deep Research
              // pipeline — the user is starting over so the resume snapshot
              // is no longer relevant.
              deepResearchResumeState: undefined,
              draftInput: undefined,
              taskState: null,
              updatedAt: Date.now(),
            }
          : s
      ),
    })),

  setDeepResearchResumeState: (sessionId, resumeState) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              deepResearchResumeState: resumeState ?? undefined,
              updatedAt: Date.now(),
            }
          : s
      ),
    })),

  setChatSessionDraft: (sessionId, draft) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) =>
        // Intentionally do NOT bump `updatedAt` — drafts are pre-send work and
        // shouldn't reorder sessions in the sidebar or look "active" in history.
        s.id === sessionId ? { ...s, draftInput: draft || undefined } : s
      ),
    })),

  setChatSessionDeepResearchMode: (sessionId, mode) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, deepResearchMode: mode || undefined } : s
      ),
    })),

  setChatSessionWebSearchMode: (sessionId, mode) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, webSearchMode: mode || undefined } : s
      ),
    })),

  setChatSessionImageMode: (sessionId, mode) =>
    set((state: ChatSlice) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, imageMode: mode || undefined } : s
      ),
    })),

  setChatTaskState: (sessionId, taskState) => set((state: ChatSlice) => sessionId
    ? { chatSessions: state.chatSessions.map((session) => session.id === sessionId ? { ...session, taskState,
      ...(taskState?.unified ? getChatTaskExecution(taskState) : {}) } : session) }
    : { chatPendingTaskState: taskState, ...(taskState?.unified ? {
      chatPendingImageMode: getChatTaskExecution(taskState).imageMode,
      chatPendingDeepResearchMode: getChatTaskExecution(taskState).deepResearchMode,
      chatPendingWebSearchMode: getChatTaskExecution(taskState).webSearchMode,
    } : {}) }),

  restartChatResearch: (sessionId, userMessageId) => set((state: ChatSlice) => ({
    chatSessions: state.chatSessions.map((session) => {
      if (session.id !== sessionId) return session
      const lastUser = [...session.messages].reverse().find((message) => message.role === 'user')
      if (lastUser?.id !== userMessageId) return session
      const index = session.messages.findIndex((message) => message.id === userMessageId)
      return { ...session, messages: session.messages.slice(0, index + 1), deepResearchResumeState: undefined }
    }),
  })),

  setChatPendingDraft: (draft) => set({ chatPendingDraft: draft }),

  setChatPendingDeepResearchMode: (mode) => set({ chatPendingDeepResearchMode: mode }),

  setChatPendingWebSearchMode: (mode) => set({ chatPendingWebSearchMode: mode }),

  setChatPendingImageMode: (mode) => set({ chatPendingImageMode: mode }),

  setChatSystemPrompt: (prompt) => set({ chatSystemPrompt: prompt }),

  addSystemPromptPreset: (preset) => {
    const id = createClientId('preset')
    const newPreset: SystemPromptPreset = { ...preset, id }
    set((state: ChatSlice) => {
      const presets = preset.isDefault
        ? state.systemPromptPresets.map((p) => ({ ...p, isDefault: false }))
        : [...state.systemPromptPresets]
      presets.push(newPreset)
      const updates: Partial<ChatSlice> = { systemPromptPresets: presets }
      if (preset.isDefault) updates.chatSystemPrompt = preset.content
      return updates
    })
    return id
  },

  updateSystemPromptPreset: (id, updates) =>
    set((state: ChatSlice) => {
      const presets = state.systemPromptPresets.map((p) => {
        if (p.id !== id) {
          return updates.isDefault ? { ...p, isDefault: false } : p
        }
        return { ...p, ...updates }
      })
      const updated = presets.find((p) => p.id === id)
      const extra: Partial<ChatSlice> = { systemPromptPresets: presets }
      if (updated?.isDefault) extra.chatSystemPrompt = updated.content
      return extra
    }),

  deleteSystemPromptPreset: (id) =>
    set((state: ChatSlice) => ({
      systemPromptPresets: state.systemPromptPresets.filter((p) => p.id !== id),
      chatSystemPrompt: state.systemPromptPresets.find((p) => p.id === id)?.isDefault
        ? ''
        : state.chatSystemPrompt,
    })),

  setDefaultSystemPromptPreset: (id) =>
    set((state: ChatSlice) => ({
      systemPromptPresets: state.systemPromptPresets.map((p) => ({ ...p, isDefault: p.id === id })),
      chatSystemPrompt: id
        ? (state.systemPromptPresets.find((p) => p.id === id)?.content ?? state.chatSystemPrompt)
        : state.chatSystemPrompt,
    })),

})
