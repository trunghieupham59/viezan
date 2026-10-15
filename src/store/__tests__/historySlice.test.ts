/**
 * Unit tests for src/store/slices/historySlice.ts
 *
 * Tests cover all history and live-session actions.
 */

import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { LiveSession } from '../../types'
import { useAppStore } from '../useAppStore'

// Reset history state before each test
beforeEach(() => {
  act(() => {
    useAppStore.setState({
      history: [],
      liveSessions: [],
      viewingLiveSessionId: null,
    })
  })
})

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeHistoryItem(id: string, overrides = {}) {
  return {
    id,
    timestamp: Date.now(),
    provider: 'gemini' as const,
    model: 'gemini-2.0-flash',
    sourceLang: 'en',
    targetLang: 'vi',
    sourceText: `Source ${id}`,
    translatedText: `Translated ${id}`,
    ...overrides,
  }
}

function makeLiveSession(id: string, overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    id,
    createdAt: Date.now(),
    sourceLang: 'en',
    targetLang: 'vi',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    rawTranscript: 'Hello world',
    translation: 'Xin chào thế giới',
    wordCount: 2,
    ...overrides,
  }
}

// ── Translation History ────────────────────────────────────────────────────────

describe('addHistory', () => {
  it('adds a single history item', () => {
    act(() => useAppStore.getState().addHistory(makeHistoryItem('h1')))
    expect(useAppStore.getState().history).toHaveLength(1)
  })

  it('prepends new items so newest item is at index 0', () => {
    act(() => {
      useAppStore.getState().addHistory(makeHistoryItem('old', { timestamp: 100 }))
      useAppStore.getState().addHistory(makeHistoryItem('new', { timestamp: 200 }))
    })
    const { history } = useAppStore.getState()
    expect(history[0].id).toBe('new')
    expect(history[1].id).toBe('old')
  })

  it('enforces MAX_HISTORY cap of 100 items', () => {
    act(() => {
      for (let i = 0; i < 105; i++) {
        useAppStore.getState().addHistory(makeHistoryItem(String(i)))
      }
    })
    expect(useAppStore.getState().history).toHaveLength(100)
  })

  it('trims the oldest items when cap is exceeded', () => {
    act(() => {
      for (let i = 0; i < 102; i++) {
        useAppStore.getState().addHistory(makeHistoryItem(String(i), { timestamp: i }))
      }
    })
    // Item '0' (oldest) should be gone; item '101' (newest) should be at front
    const ids = useAppStore.getState().history.map(h => h.id)
    expect(ids[0]).toBe('101')
    expect(ids).not.toContain('0')
    expect(ids).not.toContain('1')
  })
})

describe('upsertHistory', () => {
  it('adds an item when the id is new', () => {
    act(() => useAppStore.getState().upsertHistory(makeHistoryItem('draft')))
    expect(useAppStore.getState().history).toHaveLength(1)
    expect(useAppStore.getState().history[0].id).toBe('draft')
  })

  it('updates an existing item instead of creating a duplicate', () => {
    act(() => {
      useAppStore.getState().addHistory(makeHistoryItem('older'))
      useAppStore.getState().upsertHistory(makeHistoryItem('draft', {
        sourceText: 'Hel',
        translatedText: 'Xin',
        timestamp: 100,
      }))
      useAppStore.getState().upsertHistory(makeHistoryItem('draft', {
        sourceText: 'Hello',
        translatedText: 'Xin chào',
        timestamp: 200,
      }))
    })

    const { history } = useAppStore.getState()
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      id: 'draft',
      sourceText: 'Hello',
      translatedText: 'Xin chào',
      timestamp: 200,
    })
    expect(history.filter((item) => item.id === 'draft')).toHaveLength(1)
  })

  it('keeps the max history cap when upserting new ids', () => {
    act(() => {
      for (let i = 0; i < 105; i++) {
        useAppStore.getState().upsertHistory(makeHistoryItem(String(i), { timestamp: i }))
      }
    })

    expect(useAppStore.getState().history).toHaveLength(100)
    expect(useAppStore.getState().history[0].id).toBe('104')
  })
})

describe('deleteHistoryItem', () => {
  it('removes the item with the given id', () => {
    act(() => {
      useAppStore.getState().addHistory(makeHistoryItem('to-delete'))
      useAppStore.getState().addHistory(makeHistoryItem('keep'))
      useAppStore.getState().deleteHistoryItem('to-delete')
    })
    const ids = useAppStore.getState().history.map(h => h.id)
    expect(ids).not.toContain('to-delete')
    expect(ids).toContain('keep')
  })

  it('does nothing when id does not exist', () => {
    act(() => {
      useAppStore.getState().addHistory(makeHistoryItem('h1'))
      useAppStore.getState().deleteHistoryItem('non-existent')
    })
    expect(useAppStore.getState().history).toHaveLength(1)
  })
})

describe('clearHistory', () => {
  it('removes all history items', () => {
    act(() => {
      useAppStore.getState().addHistory(makeHistoryItem('a'))
      useAppStore.getState().addHistory(makeHistoryItem('b'))
      useAppStore.getState().clearHistory()
    })
    expect(useAppStore.getState().history).toHaveLength(0)
  })

  it('is idempotent on empty history', () => {
    act(() => useAppStore.getState().clearHistory())
    expect(useAppStore.getState().history).toHaveLength(0)
  })
})

// ── Live Sessions ─────────────────────────────────────────────────────────────

describe('addLiveSession', () => {
  it('adds a live session', () => {
    act(() => useAppStore.getState().addLiveSession(makeLiveSession('ls1')))
    expect(useAppStore.getState().liveSessions).toHaveLength(1)
  })

  it('prepends new sessions so newest is at index 0', () => {
    act(() => {
      useAppStore.getState().addLiveSession(makeLiveSession('old'))
      useAppStore.getState().addLiveSession(makeLiveSession('new'))
    })
    expect(useAppStore.getState().liveSessions[0].id).toBe('new')
  })

  it('enforces MAX_LIVE_SESSIONS cap of 50', () => {
    act(() => {
      for (let i = 0; i < 55; i++) {
        useAppStore.getState().addLiveSession(makeLiveSession(String(i)))
      }
    })
    expect(useAppStore.getState().liveSessions).toHaveLength(50)
  })
})

describe('updateLiveSession', () => {
  it('updates fields of an existing session', () => {
    act(() => {
      useAppStore.getState().addLiveSession(makeLiveSession('ls1', { rawTranscript: 'original' }))
      useAppStore.getState().updateLiveSession('ls1', { rawTranscript: 'updated' })
    })
    const session = useAppStore.getState().liveSessions.find(s => s.id === 'ls1')
    expect(session?.rawTranscript).toBe('updated')
  })

  it('does not affect other sessions when updating one', () => {
    act(() => {
      useAppStore.getState().addLiveSession(makeLiveSession('ls1'))
      useAppStore.getState().addLiveSession(makeLiveSession('ls2'))
      useAppStore.getState().updateLiveSession('ls1', { rawTranscript: 'modified' })
    })
    const ls2 = useAppStore.getState().liveSessions.find(s => s.id === 'ls2')
    expect(ls2?.rawTranscript).toBe('Hello world') // unchanged
  })

  it('does nothing if id does not exist', () => {
    act(() => {
      useAppStore.getState().addLiveSession(makeLiveSession('ls1'))
      useAppStore.getState().updateLiveSession('non-existent', { rawTranscript: 'x' })
    })
    expect(useAppStore.getState().liveSessions).toHaveLength(1)
  })
})

describe('deleteLiveSession', () => {
  it('removes the session with the given id', () => {
    act(() => {
      useAppStore.getState().addLiveSession(makeLiveSession('ls1'))
      useAppStore.getState().addLiveSession(makeLiveSession('ls2'))
      useAppStore.getState().deleteLiveSession('ls1')
    })
    const ids = useAppStore.getState().liveSessions.map(s => s.id)
    expect(ids).not.toContain('ls1')
    expect(ids).toContain('ls2')
  })
})

describe('clearLiveSessions', () => {
  it('removes all live sessions', () => {
    act(() => {
      useAppStore.getState().addLiveSession(makeLiveSession('ls1'))
      useAppStore.getState().addLiveSession(makeLiveSession('ls2'))
      useAppStore.getState().clearLiveSessions()
    })
    expect(useAppStore.getState().liveSessions).toHaveLength(0)
  })
})

describe('setViewingLiveSession', () => {
  it('sets the currently viewed live session id', () => {
    act(() => useAppStore.getState().setViewingLiveSession('ls1'))
    expect(useAppStore.getState().viewingLiveSessionId).toBe('ls1')
  })

  it('clears the viewing session id when set to null', () => {
    act(() => {
      useAppStore.getState().setViewingLiveSession('ls1')
      useAppStore.getState().setViewingLiveSession(null)
    })
    expect(useAppStore.getState().viewingLiveSessionId).toBeNull()
  })
})
