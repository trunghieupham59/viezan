import { describe, expect, it } from 'vitest'
import { ALL_MODULES_ENABLED } from '../../store/slices/modulesSlice'
import type { ChatSession, DictionaryEntry, HistoryItem, LiveSession } from '../../types'
import { recentActivity } from '../homeActivity'

const chat = (id: string, updatedAt: number, extra: Partial<ChatSession> = {}) => ({
  id, title: id, provider: 'local', model: 'm', createdAt: 0, updatedAt,
  messages: [{ id: `${id}-m`, role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: updatedAt }],
  ...extra,
}) as unknown as ChatSession
const translation = (id: string, timestamp: number) => ({ id, timestamp, provider: 'local', model: 'm', sourceLang: 'en', targetLang: 'ja', sourceText: id, translatedText: id }) as HistoryItem
const live = (id: string, createdAt: number) => ({ id, createdAt, sourceLang: 'en', targetLang: 'vi', rawTranscript: id, translation: id, wordCount: 1 }) as unknown as LiveSession
const word = (id: string, createdAt: number) => ({ id, term: id, createdAt, sourceLang: 'en', targetLang: 'vi' }) as unknown as DictionaryEntry

describe('recentActivity', () => {
  const source = {
    chatSessions: [chat('old-chat', 10), chat('new-chat', 50), chat('empty', 99, { messages: [] })],
    history: [translation('t1', 40), translation('t2', 20)],
    liveSessions: [live('l1', 30)],
    dictionaryEntries: [word('w1', 60)],
    enabled: ALL_MODULES_ENABLED,
  }

  it('keeps the newest item per feature, newest first, and skips empty chats', () => {
    expect(recentActivity(source).map((item) => `${item.kind}:${item.at}`)).toEqual([
      'dictionary:60', 'chat:50', 'translate:40', 'live:30',
    ])
  })

  it('puts a paused Deep Research run first and does not repeat it as a chat', () => {
    const paused = chat('research', 5, { deepResearchResumeState: {} as ChatSession['deepResearchResumeState'] })
    const items = recentActivity({ ...source, chatSessions: [paused, chat('new-chat', 50)] })
    expect(items[0]).toMatchObject({ kind: 'research', at: 5 })
    expect(items.filter((item) => item.kind === 'chat')).toHaveLength(1)
  })

  it('leaves out features that are turned off', () => {
    const kinds = recentActivity({ ...source, enabled: { ...ALL_MODULES_ENABLED, chat: false, dictionary: false } }).map((item) => item.kind)
    expect(kinds).toEqual(['translate', 'live'])
  })
})
