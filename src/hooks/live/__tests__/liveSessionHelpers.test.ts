import { describe, expect, it, vi } from 'vitest'

import {
  checkDuplicateChunk,
  DUPLICATE_CHUNK_WINDOW_MS,
  isDuplicateChunk,
  isFlushGenerationValid,
  joinTranslationsInOrder,
  releaseCaptureResources,
  resolveLiveSessionSave,
} from '../liveSessionHelpers'

function fakeStream(trackCount = 2) {
  const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn() }))
  return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks }
}

describe('releaseCaptureResources', () => {
  it('stops every track of every stream (display + mic + destination)', () => {
    const display = fakeStream(2)
    const mic = fakeStream(1)
    const dest = fakeStream(1)
    releaseCaptureResources({ streams: [display.stream, mic.stream, null, dest.stream] })
    for (const track of [...display.tracks, ...mic.tracks, ...dest.tracks]) {
      expect(track.stop).toHaveBeenCalledTimes(1)
    }
  })

  it('disconnects the analyser and closes an open AudioContext', () => {
    const analyser = { disconnect: vi.fn() } as unknown as AnalyserNode
    const close = vi.fn().mockResolvedValue(undefined)
    const audioCtx = { state: 'running', close } as unknown as AudioContext
    releaseCaptureResources({ streams: [], analyser, audioCtx })
    expect(analyser.disconnect).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not close an already-closed AudioContext', () => {
    const close = vi.fn().mockResolvedValue(undefined)
    releaseCaptureResources({ streams: [], audioCtx: { state: 'closed', close } as unknown as AudioContext })
    expect(close).not.toHaveBeenCalled()
  })

  it('never throws when tracks, analyser or context fail, and still releases the rest', () => {
    const bad = fakeStream(1)
    bad.tracks[0].stop.mockImplementation(() => { throw new Error('boom') })
    const good = fakeStream(1)
    const analyser = { disconnect: vi.fn(() => { throw new Error('boom') }) } as unknown as AnalyserNode
    const audioCtx = {
      state: 'running',
      close: vi.fn(() => { throw new Error('boom') }),
    } as unknown as AudioContext
    expect(() => releaseCaptureResources({ streams: [bad.stream, good.stream], analyser, audioCtx })).not.toThrow()
    expect(good.tracks[0].stop).toHaveBeenCalledTimes(1)
  })

  it('swallows a rejected AudioContext.close()', async () => {
    const audioCtx = { state: 'running', close: vi.fn().mockRejectedValue(new Error('closed')) } as unknown as AudioContext
    expect(() => releaseCaptureResources({ streams: [], audioCtx })).not.toThrow()
    await Promise.resolve()
  })

  it('is idempotent when called twice with the same resources', () => {
    const { stream, tracks } = fakeStream(1)
    expect(() => {
      releaseCaptureResources({ streams: [stream] })
      releaseCaptureResources({ streams: [stream] })
    }).not.toThrow()
    expect(tracks[0].stop).toHaveBeenCalledTimes(2)
  })
})

describe('isDuplicateChunk', () => {
  it('drops an exact (normalised) repeat of the previous chunk inside the window', () => {
    expect(isDuplicateChunk('Thank you very much', 'thank   you very much', 1_000)).toBe(true)
  })

  it('keeps an exact repeat once the window has passed', () => {
    expect(isDuplicateChunk('yes', 'yes', DUPLICATE_CHUNK_WINDOW_MS + 1)).toBe(false)
  })

  it('keeps a short reply contained in the previous chunk ("yes" after "yes, I think so")', () => {
    expect(isDuplicateChunk('yes', 'yes, I think so', 500)).toBe(false)
  })

  it('drops a long chunk fully contained in the previous one', () => {
    const last = 'we should ship the release on friday afternoon after review'
    expect(isDuplicateChunk('ship the release on friday', last, 500)).toBe(true)
  })

  it('keeps a continuation that extends the previous chunk', () => {
    expect(isDuplicateChunk('Hello, how are you today?', 'Hello', 500)).toBe(false)
  })

  it('drops a long near-identical word bag but keeps a short one', () => {
    expect(isDuplicateChunk('the quick brown fox jumps over the lazy dog today', 'today the quick brown fox jumps over the lazy dog', 500)).toBe(true)
    expect(isDuplicateChunk('ok yes', 'yes ok', 500)).toBe(false)
  })

  it('never reports a duplicate without a previous chunk', () => {
    expect(isDuplicateChunk('hello', '', 0)).toBe(false)
  })
})

describe('joinTranslationsInOrder', () => {
  it('joins by segment order regardless of completion order', () => {
    const translations = new Map<string, string>()
    // Completion order: seg-3, seg-1, seg-2
    translations.set('seg-3', 'third')
    translations.set('seg-1', 'first')
    translations.set('seg-2', 'second')
    expect(joinTranslationsInOrder(['seg-1', 'seg-2', 'seg-3'], translations)).toBe('first second third')
  })

  it('skips segments that have not finished (or failed) translating', () => {
    const translations = new Map([['seg-1', 'first'], ['seg-3', 'third']])
    expect(joinTranslationsInOrder(['seg-1', 'seg-2', 'seg-3'], translations)).toBe('first third')
  })

  it('returns an empty string for no segments', () => {
    expect(joinTranslationsInOrder([], new Map())).toBe('')
  })
})

describe('checkDuplicateChunk', () => {
  it('slides the window forward on an exact duplicate so a 2 s hallucination loop never leaks', () => {
    let lastAt = 1_000
    // Same text every 2 s: every repeat must be dropped, not accepted at ~8 s.
    for (let now = 3_000; now <= 21_000; now += 2_000) {
      const verdict = checkDuplicateChunk('Thanks for watching', 'thanks for watching', lastAt, now)
      expect(verdict.duplicate).toBe(true)
      lastAt = verdict.lastAt
    }
    expect(lastAt).toBe(21_000)
  })

  it('still accepts a legitimate repeat after real silence longer than the window', () => {
    const verdict = checkDuplicateChunk('yes', 'yes', 1_000, 1_000 + DUPLICATE_CHUNK_WINDOW_MS + 1)
    expect(verdict).toEqual({ duplicate: false, lastAt: 1_000 })
  })

  it('does not refresh the timestamp for a containment (non-exact) duplicate', () => {
    const last = 'we should ship the release on friday afternoon after review'
    const verdict = checkDuplicateChunk('ship the release on friday', last, 1_000, 2_000)
    expect(verdict).toEqual({ duplicate: true, lastAt: 1_000 })
  })

  it('reports no duplicate and keeps the timestamp when there is no previous chunk', () => {
    expect(checkDuplicateChunk('hello', '', 0, 5_000)).toEqual({ duplicate: false, lastAt: 0 })
  })
})

describe('isFlushGenerationValid', () => {
  it('is valid only while the generation still equals the one captured after Stop', () => {
    expect(isFlushGenerationValid(7, 7)).toBe(true)
  })

  it('is invalid once Clear / Start bumped the generation after Stop', () => {
    expect(isFlushGenerationValid(7, 8)).toBe(false)
  })

  it('is invalid when no orderly Stop recorded a flush generation', () => {
    expect(isFlushGenerationValid(null, 0)).toBe(false)
  })
})

describe('resolveLiveSessionSave', () => {
  it('adds a session that is not in history yet', () => {
    expect(resolveLiveSessionSave(['live-a'], 'live-b')).toBe('add')
  })

  it('updates (never duplicates) a session id that was already saved', () => {
    expect(resolveLiveSessionSave(['live-a', 'live-b'], 'live-b')).toBe('update')
  })

  it('adds into an empty history', () => {
    expect(resolveLiveSessionSave([], 'live-a')).toBe('add')
  })
})
