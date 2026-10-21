// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseQuickAiSession, parseQuickAiTurns, QuickAiSessionStore } from '../quickAiSession'

const fs = vi.hoisted(() => ({
  readFile: vi.fn(), writeFile: vi.fn(), rename: vi.fn(), mkdir: vi.fn(), rm: vi.fn(),
}))
vi.mock('node:fs/promises', () => fs)

const turns = [{ role: 'user' as const, text: 'Hi' }, { role: 'assistant' as const, text: 'Hello' }]

beforeEach(() => {
  vi.clearAllMocks()
  fs.writeFile.mockResolvedValue(undefined)
  fs.rename.mockResolvedValue(undefined)
  fs.mkdir.mockResolvedValue(undefined)
  fs.rm.mockResolvedValue(undefined)
})

describe('parseQuickAiTurns', () => {
  it('accepts alternating complete pairs and trims text', () => {
    expect(parseQuickAiTurns([{ role: 'user', text: ' a ' }, { role: 'assistant', text: 'b ' }]))
      .toEqual([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }])
    expect(parseQuickAiTurns([])).toEqual([])
  })

  it('rejects odd, misordered, blank, oversized or non-object turns', () => {
    expect(parseQuickAiTurns([{ role: 'user', text: 'a' }])).toBeNull()
    expect(parseQuickAiTurns([{ role: 'assistant', text: 'a' }, { role: 'user', text: 'b' }])).toBeNull()
    expect(parseQuickAiTurns([{ role: 'user', text: '  ' }, { role: 'assistant', text: 'b' }])).toBeNull()
    expect(parseQuickAiTurns([{ role: 'user', text: 'x'.repeat(3_001) }, { role: 'assistant', text: 'b' }])).toBeNull()
    expect(parseQuickAiTurns([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'x'.repeat(80_001) }])).toBeNull()
    expect(parseQuickAiTurns(['user', 'assistant'])).toBeNull()
    expect(parseQuickAiTurns(Array.from({ length: 22 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: 'x' })))).toBeNull()
    expect(parseQuickAiTurns('nope')).toBeNull()
  })
})

describe('parseQuickAiSession', () => {
  it('normalizes a valid session and rejects malformed ids, timestamps or empty turns', () => {
    expect(parseQuickAiSession({ id: 'quick-ai-1', turns, updatedAt: 1_700_000_000_000.7 }))
      .toEqual({ id: 'quick-ai-1', turns, updatedAt: 1_700_000_000_000 })
    for (const invalid of [
      null, 'x', { id: '', turns, updatedAt: 1 }, { id: 'bad id', turns, updatedAt: 1 },
      { id: 'ok', turns, updatedAt: 0 }, { id: 'ok', turns, updatedAt: 'now' }, { id: 'ok', turns: [], updatedAt: 1 },
      { id: 'ok', turns: [{ role: 'user', text: 'a' }], updatedAt: 1 },
    ]) {
      expect(parseQuickAiSession(invalid)).toBeNull()
    }
  })
})

describe('QuickAiSessionStore', () => {
  const session = { id: 'quick-ai-1', turns, updatedAt: 1_700_000_000_000 }

  it('reads the file once, writes atomically and clears from memory and disk', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify(session))
    const store = new QuickAiSessionStore('/data/quick-ai-session-v1.json')
    expect(await store.get()).toEqual(session)
    expect(await store.get()).toEqual(session)
    expect(fs.readFile).toHaveBeenCalledOnce()

    const next = { ...session, updatedAt: session.updatedAt + 1 }
    await store.save(next)
    expect(fs.mkdir).toHaveBeenCalledWith('/data', { recursive: true })
    expect(fs.writeFile).toHaveBeenCalledWith('/data/quick-ai-session-v1.json.tmp', JSON.stringify(next), 'utf-8')
    expect(fs.rename).toHaveBeenCalledWith('/data/quick-ai-session-v1.json.tmp', '/data/quick-ai-session-v1.json')
    expect(await store.get()).toEqual(next)

    await store.clear()
    expect(fs.rm).toHaveBeenCalledWith('/data/quick-ai-session-v1.json', { force: true })
    expect(await store.get()).toBeNull()
    expect(fs.readFile).toHaveBeenCalledOnce()
  })

  it('treats a missing or corrupt file as no session', async () => {
    fs.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    expect(await new QuickAiSessionStore('/data/a.json').get()).toBeNull()
    fs.readFile.mockResolvedValueOnce('{not json')
    expect(await new QuickAiSessionStore('/data/b.json').get()).toBeNull()
    fs.readFile.mockResolvedValueOnce(JSON.stringify({ id: 'x', turns: [{ role: 'user', text: 'a' }], updatedAt: 1 }))
    expect(await new QuickAiSessionStore('/data/c.json').get()).toBeNull()
  })
})
