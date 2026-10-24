import type { ModuleEnabledState } from '../../shared/modules'
import type { ChatSession, DictionaryEntry, HistoryItem, LiveSession } from '../types'

export type HomeActivity =
  | { kind: 'research'; at: number; session: ChatSession }
  | { kind: 'chat'; at: number; session: ChatSession }
  | { kind: 'translate'; at: number; item: HistoryItem }
  | { kind: 'live'; at: number; session: LiveSession }
  | { kind: 'dictionary'; at: number; entry: DictionaryEntry }

function latest<T>(items: readonly T[], at: (item: T) => number): T | undefined {
  let best: T | undefined
  for (const item of items) if (!best || at(item) > at(best)) best = item
  return best
}

/**
 * What Home offers to pick up again: the newest item of each enabled feature,
 * newest first, plus a paused Deep Research run on top since it waits on the
 * user. Reads only data already in the store.
 */
export function recentActivity(source: {
  chatSessions: readonly ChatSession[]
  history: readonly HistoryItem[]
  liveSessions: readonly LiveSession[]
  dictionaryEntries: readonly DictionaryEntry[]
  enabled: ModuleEnabledState
}): HomeActivity[] {
  const { enabled } = source
  const items: HomeActivity[] = []
  let paused: HomeActivity | null = null

  if (enabled.chat !== false) {
    const research = latest(source.chatSessions.filter((session) => session.deepResearchResumeState), (session) => session.updatedAt)
    if (research) paused = { kind: 'research', at: research.updatedAt, session: research }
    const chat = latest(
      source.chatSessions.filter((session) => session.messages.length > 0 && session.id !== research?.id),
      (session) => session.updatedAt,
    )
    if (chat) items.push({ kind: 'chat', at: chat.updatedAt, session: chat })
  }
  if (enabled.translate !== false) {
    const item = latest(source.history, (entry) => entry.timestamp)
    if (item) items.push({ kind: 'translate', at: item.timestamp, item })
  }
  if (enabled.live !== false) {
    const session = latest(source.liveSessions, (entry) => entry.createdAt)
    if (session) items.push({ kind: 'live', at: session.createdAt, session })
  }
  if (enabled.dictionary !== false) {
    const entry = latest(source.dictionaryEntries, (item) => item.createdAt)
    if (entry) items.push({ kind: 'dictionary', at: entry.createdAt, entry })
  }

  items.sort((a, b) => b.at - a.at)
  return paused ? [paused, ...items] : items
}
