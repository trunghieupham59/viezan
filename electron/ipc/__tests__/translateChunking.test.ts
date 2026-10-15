// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { truncatedOutputError } from '../errorUtils'
import {
  MAX_TRUNCATION_SPLIT_DEPTH,
  promisePool,
  runWithTimeout,
  splitIntoChunks,
  splitTextInHalf,
  translateChunked,
  withTimeout,
} from '../translateChunking'

afterEach(() => {
  vi.useRealTimers()
})

describe('splitIntoChunks — lossless', () => {
  it('join(split(text)) === text for paragraphs (blank lines preserved)', () => {
    const text = ['alpha '.repeat(10), 'beta '.repeat(10), 'gamma '.repeat(10), 'delta '.repeat(10)].join('\n\n')
    const chunks = splitIntoChunks(text, 130)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(text)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(130)
  })

  it('keeps multiple blank lines and trailing whitespace intact', () => {
    const text = `${'a'.repeat(40)}\n\n\n\n${'b'.repeat(40)}  \n${'c'.repeat(40)}\n\n`
    const chunks = splitIntoChunks(text, 60)
    expect(chunks.join('')).toBe(text)
  })

  it('join(split(text)) === text for CJK sentences', () => {
    const text = '今日は天気がいいです。散歩に行きましょう。明日は雨が降るでしょう。'.repeat(8)
    const chunks = splitIntoChunks(text, 40)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(text)
  })

  it('cuts after a CJK sentence ender without dropping or duplicating a character', () => {
    // 10 chars + 。 = 11 chars per sentence; limit 25 lets two sentences fit.
    const sentence = `${'あ'.repeat(10)}。`
    const text = sentence.repeat(4)
    const chunks = splitIntoChunks(text, 25)
    expect(chunks.join('')).toBe(text)
    // The first chunk ends exactly at a sentence end (length 22), not mid-sentence.
    expect(chunks[0]).toBe(sentence.repeat(2))
  })

  it('join(split(text)) === text for emoji and never splits a surrogate pair', () => {
    const text = '😀'.repeat(60) // 120 UTF-16 code units, no natural break
    const chunks = splitIntoChunks(text, 11) // odd limit forces a cut inside a pair without the guard
    expect(chunks.join('')).toBe(text)
    for (const chunk of chunks) {
      const first = chunk.charCodeAt(0)
      const last = chunk.charCodeAt(chunk.length - 1)
      expect(first >= 0xdc00 && first <= 0xdfff).toBe(false) // does not start with a low surrogate
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false) // does not end with a high surrogate
    }
  })

  it('merges whitespace-only chunks instead of emitting empty chunks', () => {
    const text = `${'a'.repeat(30)}${' '.repeat(100)}${'b'.repeat(30)}`
    const chunks = splitIntoChunks(text, 40)
    expect(chunks.join('')).toBe(text)
    expect(chunks.every((chunk) => chunk.trim().length > 0)).toBe(true)
  })

  it('returns the text unchanged when it fits', () => {
    expect(splitIntoChunks('  keep me  ', 100)).toEqual(['  keep me  '])
  })
})

describe('translateChunked', () => {
  const longText = `${'a'.repeat(30)}\n\n${'b'.repeat(30)}\n\n${'c'.repeat(30)}`

  it('re-joins translations with the original separators (blank lines preserved)', async () => {
    const result = await translateChunked(async (text) => text.split('\n\n').pop()?.toUpperCase() ?? '', longText, 40)
    expect(result).toBe(`${'A'.repeat(30)}\n\n${'B'.repeat(30)}\n\n${'C'.repeat(30)}`)
  })

  it('fails (instead of silently dropping the chunk) when a chunk comes back empty', async () => {
    let calls = 0
    await expect(
      translateChunked(async () => (++calls === 2 ? '   ' : 'ok'), longText, 40),
    ).rejects.toMatchObject({ errorCode: 'EMPTY_RESPONSE' })
  })

  it('uses rewrite-specific notes in rewrite mode (no "Translate ONLY" wrapper)', async () => {
    const seen: string[] = []
    await translateChunked(async (text) => { seen.push(text); return 'x' }, longText, 40, { mode: 'rewrite' })
    expect(seen.length).toBeGreaterThan(1)
    for (const text of seen) {
      expect(text).not.toContain('Translate ONLY')
      expect(text).not.toContain('Translate only')
      expect(text).toContain('rewritten')
    }
    expect(seen[1]).toContain('Rewrite ONLY the text below this note')
  })

  it('keeps translate-mode notes by default', async () => {
    const seen: string[] = []
    await translateChunked(async (text) => { seen.push(text); return 'x' }, longText, 40)
    expect(seen[1]).toContain('Translate ONLY the text below this note')
  })

  it('stops pulling work and aborts in-flight chunks after the first failure', async () => {
    const signals: AbortSignal[] = []
    let started = 0
    const many = Array.from({ length: 12 }, () => 'x'.repeat(30)).join('\n\n')
    await expect(
      translateChunked((text, signal) => {
        started++
        if (text.includes('part 1 of')) return Promise.reject(new Error('400 bad request'))
        if (signal) signals.push(signal)
        return new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted by pool')), { once: true })
        })
      }, many, 40),
    ).rejects.toThrow('400 bad request')
    // Concurrency is 5, so at most 5 chunks ever started; the rest were never pulled.
    expect(started).toBeLessThanOrEqual(5)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('passes an abortable signal that fires when the caller cancels', async () => {
    const controller = new AbortController()
    const pending = translateChunked(
      (_text, signal) => new Promise<string>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), { once: true })
      }),
      longText,
      40,
      { signal: controller.signal },
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('promisePool failure handling', () => {
  it('does not start new tasks after a failure and calls onFailure once', async () => {
    const started: number[] = []
    const onFailure = vi.fn()
    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      started.push(i)
      if (i === 0) throw new Error('boom')
      await new Promise((resolve) => setTimeout(resolve, 5))
      return i
    })
    await expect(promisePool(tasks, 2, onFailure)).rejects.toThrow('boom')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(started.length).toBeLessThan(6)
  })
})

describe('runWithTimeout', () => {
  it('aborts the underlying request when the timeout fires', async () => {
    vi.useFakeTimers()
    let receivedSignal: AbortSignal | undefined
    const pending = runWithTimeout(
      (signal) => {
        receivedSignal = signal
        return new Promise<string>(() => {})
      },
      1_000,
      'slow',
    )
    const assertion = expect(pending).rejects.toThrow(/timed out after 1s \(slow\)/)
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('propagates the parent signal to the task signal', async () => {
    const parent = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const pending = runWithTimeout(
      (signal) => {
        receivedSignal = signal
        return new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('stopped'))))
      },
      60_000,
      'parent',
      parent.signal,
    )
    parent.abort()
    await expect(pending).rejects.toThrow('stopped')
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('does not abort when the task settles in time', async () => {
    let receivedSignal: AbortSignal | undefined
    const result = await runWithTimeout(async (signal) => { receivedSignal = signal; return 'done' }, 1_000, 'fast')
    expect(result).toBe('done')
    expect(receivedSignal?.aborted).toBe(false)
  })
})

describe('withTimeout onTimeout hook', () => {
  it('calls onTimeout after rejecting with the timeout error', async () => {
    const onTimeout = vi.fn()
    await expect(withTimeout(new Promise<string>(() => {}), 10, 'hook', onTimeout)).rejects.toThrow('timed out')
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
})

describe('splitIntoChunks — CRLF documents', () => {
  it('splits at CRLF paragraph breaks and stays lossless', () => {
    const paragraphs = ['alpha '.repeat(10), 'beta '.repeat(10), 'gamma '.repeat(10), 'delta '.repeat(10)]
    const text = paragraphs.join('\r\n\r\n')
    const chunks = splitIntoChunks(text, 130)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(text)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(130)
    // Every chunk but the last ends on a full CRLF paragraph break, never mid-paragraph.
    for (const chunk of chunks.slice(0, -1)) expect(chunk.endsWith('\r\n\r\n')).toBe(true)
  })

  it('prefers the later of an LF and a CRLF paragraph break inside the window', () => {
    const text = `${'a'.repeat(50)}\n\n${'b'.repeat(30)}\r\n\r\n${'c'.repeat(80)}`
    const chunks = splitIntoChunks(text, 100)
    expect(chunks.join('')).toBe(text)
    expect(chunks[0]).toBe(`${'a'.repeat(50)}\n\n${'b'.repeat(30)}\r\n\r\n`)
  })
})

describe('splitTextInHalf', () => {
  it('is lossless and cuts at the paragraph boundary closest to the middle', () => {
    const text = `${'a'.repeat(30)}\n\n${'b'.repeat(30)}\n\n${'c'.repeat(30)}`
    const halves = splitTextInHalf(text)
    expect(halves).not.toBeNull()
    expect(halves?.join('')).toBe(text)
    expect(halves?.[0]).toBe(`${'a'.repeat(30)}\n\n`)
  })

  it('handles CRLF paragraphs and sentence boundaries', () => {
    const crlf = `${'a'.repeat(40)}\r\n\r\n${'b'.repeat(40)}`
    expect(splitTextInHalf(crlf)).toEqual([`${'a'.repeat(40)}\r\n\r\n`, 'b'.repeat(40)])
    const sentences = 'One two three. Four five six. Seven eight nine. Ten eleven twelve.'
    const halves = splitTextInHalf(sentences)
    expect(halves?.join('')).toBe(sentences)
    expect(halves?.[0].endsWith('. ')).toBe(true)
  })

  it('hard-cuts the middle without splitting a surrogate pair', () => {
    const text = '\u{1F600}'.repeat(10)
    const halves = splitTextInHalf(text)
    expect(halves?.join('')).toBe(text)
    for (const half of halves ?? []) expect(half).toMatch(/^(?:\u{1F600})+$/u)
  })

  it('returns null when the text cannot be split', () => {
    expect(splitTextInHalf('a')).toBeNull()
    expect(splitTextInHalf('')).toBeNull()
  })
})

describe('translateChunked — OUTPUT_TRUNCATED recovery', () => {
  const noteBody = (input: string) => (input.includes(']\n\n') ? input.slice(input.lastIndexOf(']\n\n') + 3) : input)

  it('halves a single chunk that hits the output ceiling and re-joins the halves losslessly', async () => {
    const text = 'Alpha one. Beta two. Gamma three. Delta four. Epsilon five. Zeta six.'
    const seen: string[] = []
    const fn = vi.fn(async (input: string) => {
      seen.push(input)
      if (input.length > 40) throw truncatedOutputError('openai')
      return `<${input}>`
    })
    const result = await translateChunked(fn, text, 1_000)
    expect(seen[0]).toBe(text)
    expect(seen.length).toBeGreaterThan(1)
    // Pieces are verbatim (trimmed) source slices; the separators between them are re-inserted unchanged.
    const pieces = seen.filter((piece) => piece.length <= 40)
    expect(pieces.join(' ')).toBe(text)
    expect(result.replace(/[<>]/g, '')).toBe(text)
  })

  it('halves only the chunk that truncated in a multi-chunk document', async () => {
    const paragraph = (c: string) => `${`${c}word `.repeat(30)}`.trim()
    const text = [paragraph('a'), paragraph('b'), paragraph('c')].join('\n\n')
    const fn = vi.fn(async (input: string) => {
      const body = noteBody(input)
      if (body.startsWith('bword') && body.length > 100) throw truncatedOutputError('claude')
      return body.toUpperCase()
    })
    const result = await translateChunked(fn, text, 200)
    expect(result.replace(/\s+/g, ' ')).toBe(text.toUpperCase().replace(/\s+/g, ' '))
    expect(fn.mock.calls.length).toBeGreaterThan(3)
  })

  it('gives up with OUTPUT_TRUNCATED after a bounded number of splits', async () => {
    const text = 'word '.repeat(200)
    const fn = vi.fn(async () => {
      throw truncatedOutputError('openai')
    })
    await expect(translateChunked(fn, text, 10_000)).rejects.toMatchObject({ errorCode: 'OUTPUT_TRUNCATED' })
    // One failing call per level (the first half fails, so the second is never reached).
    expect(fn).toHaveBeenCalledTimes(MAX_TRUNCATION_SPLIT_DEPTH + 1)
  })

  it('does not split on other errors', async () => {
    const fn = vi.fn(async () => {
      throw new Error('invalid_api_key')
    })
    await expect(translateChunked(fn, 'word '.repeat(50), 10_000)).rejects.toThrow('invalid_api_key')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('translateChunked — request deadline', () => {
  it('uses the caller-supplied deadline for each request and reports a timeout', async () => {
    vi.useFakeTimers()
    const getTimeoutMs = vi.fn(() => 5_000)
    const pending = translateChunked(() => new Promise<string>(() => {}), 'hello world', 1_000, { getTimeoutMs })
    const assertion = expect(pending).rejects.toThrow(/timed out after 5s/)
    await vi.advanceTimersByTimeAsync(5_001)
    await assertion
    expect(getTimeoutMs).toHaveBeenCalledWith('hello world')
  })

  it('defaults to a deadline that grows with the input size instead of a fixed 90 s', async () => {
    vi.useFakeTimers()
    const text = 'x'.repeat(5_000)
    let settled = false
    const pending = translateChunked(() => new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 100_000)), text, 12_000)
    pending.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(100_001)
    expect(await pending).toBe('ok')
    expect(settled).toBe(true)
  })
})
