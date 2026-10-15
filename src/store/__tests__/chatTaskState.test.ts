import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatTaskStarterState } from '../../types/chatTask'
import { migratePersistedStore, useAppStore } from '../useAppStore'

const task: ChatTaskStarterState = {
  selected: 1, options: { 1: 'overview' }, open: true,
  applied: { index: 1, option: 'research', prompt: 'Exact generated prefix\n\n', mode: 'research', placement: 'instruction' },
}

beforeEach(() => useAppStore.setState({ chatSessions: [], activeChatSessionId: null, chatPendingDraft: 'My topic', chatPendingTaskState: null }))

describe('persisted chat tasks', () => {
  it('moves only a recorded intact legacy prefix out of the draft', () => {
    const legacyTask: ChatTaskStarterState = { ...task, applied: { index: 1, option: 'research', prompt: 'Exact generated prefix\n\n', mode: 'research' } }
    const restored = migratePersistedStore({ chatPendingDraft: 'Exact generated prefix\n\nMy topic', chatPendingTaskState: legacyTask,
      chatSessions: [{ id: 'edited', draftInput: 'Edited prefix\n\nMy topic', taskState: legacyTask }] })
    expect(restored.chatPendingDraft).toBe('My topic')
    expect(restored.chatPendingTaskState?.applied?.placement).toBe('instruction')
    expect(restored.chatSessions[0].draftInput).toBe('Edited prefix\n\nMy topic')
    expect(restored.chatSessions[0].taskState?.applied).toBeNull()
  })
  it('absorbs pending task metadata into the new conversation and clears only that scope', () => {
    useAppStore.getState().setChatTaskState(null, task)
    const id = useAppStore.getState().createChatSession('gemini', 'test-model')
    expect(useAppStore.getState().chatSessions[0].taskState).toEqual(task)
    expect(useAppStore.getState().chatPendingTaskState).toBeNull()
    useAppStore.getState().setChatTaskState(null, task)
    useAppStore.getState().setChatTaskState(id, null)
    expect(useAppStore.getState().chatSessions[0].taskState).toBeNull()
    expect(useAppStore.getState().chatPendingTaskState).toEqual(task)
  })

  it('round-trips task state through the real persistence serializer and migration', () => {
    useAppStore.getState().setChatTaskState(null, task)
    const partialize = useAppStore.persist.getOptions().partialize
    if (!partialize) throw new Error('Persistence serializer missing')
    const snapshot = JSON.parse(JSON.stringify(partialize(useAppStore.getState())))
    const restored = migratePersistedStore(snapshot)
    expect(restored.chatPendingTaskState).toEqual(task)
    expect(restored.chatPendingDraft).toBe('My topic')
    const id = useAppStore.getState().createChatSession('gemini', 'test-model')
    const sessionSnapshot = JSON.parse(JSON.stringify(partialize(useAppStore.getState())))
    expect(migratePersistedStore(sessionSnapshot).chatSessions.find((s: { id: string }) => s.id === id).taskState).toEqual(task)
  })

  it('migrates old drafts without guessing ownership or changing text/modes', () => {
    const legacy = { sttProvider: 'auto', chatPendingDraft: 'Text like a template', chatPendingDeepResearchMode: true,
      chatSessions: [{ id: 'old', draftInput: 'Keep this', webSearchMode: true }] }
    const migrated = migratePersistedStore(legacy) as typeof legacy & { chatPendingTaskState: null }
    expect(migrated.chatPendingDraft).toBe(legacy.chatPendingDraft)
    expect(migrated.chatPendingDeepResearchMode).toBe(true)
    expect(migrated.chatPendingTaskState).toBeNull()
    expect(migrated.chatSessions[0]).toMatchObject({ draftInput: 'Keep this', webSearchMode: true, taskState: null })
  })

  it('drops invalid metadata without discarding the draft', () => {
    const migrated = migratePersistedStore({ sttProvider: 'auto', chatPendingDraft: 'User text', chatPendingTaskState: { selected: 99 } })
    expect(migrated.chatPendingTaskState).toBeNull()
    expect(migrated.chatPendingDraft).toBe('User text')
  })

  it.each([{}, { 1: 'invalid-choice' }])('rejects missing or invalid selected options: %j', (options) => {
    const migrated = migratePersistedStore({ sttProvider: 'auto', chatPendingDraft: 'Keep me', chatPendingTaskState: { selected: 1, options, open: true } })
    expect(migrated.chatPendingTaskState).toBeNull()
    expect(migrated.chatPendingDraft).toBe('Keep me')
  })
})
