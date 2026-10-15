import { ProviderResponseError } from './errorUtils'
import {
  getTranslateTimeoutMs,
  TRANSLATE_CHUNK_CHAR_LIMIT,
  TRANSLATE_CHUNK_CONCURRENCY,
  TRANSLATE_CONTEXT_TAIL_CHARS,
} from './ipcConstants'
import { withRetry } from './retry'

export const CHUNK_CHAR_LIMIT = TRANSLATE_CHUNK_CHAR_LIMIT

const CONTEXT_TAIL_CHARS = TRANSLATE_CONTEXT_TAIL_CHARS
const CHUNK_CONCURRENCY = TRANSLATE_CHUNK_CONCURRENCY

/** A split point must leave at least this fraction of the window in the chunk. */
const MIN_SPLIT_RATIO = 0.35
const SENTENCE_ENDERS = ['. ', '! ', '? ', '。', '！', '？', '…']

/** How many times one chunk may be halved after OUTPUT_TRUNCATED (up to 2^3 = 8 pieces). */
export const MAX_TRUNCATION_SPLIT_DEPTH = 3

/** Paragraph separators of LF and CRLF documents. */
const PARAGRAPH_BREAKS = ['\n\n', '\r\n\r\n']

/** End offset (exclusive) of the last paragraph break in `window` that starts past `minStart`, or -1. */
function lastParagraphBreakEnd(window: string, minStart: number): number {
  let best = -1
  for (const sep of PARAGRAPH_BREAKS) {
    const idx = window.lastIndexOf(sep)
    if (idx > minStart && idx + sep.length > best) best = idx + sep.length
  }
  return best
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff
}

/**
 * Split `text` into chunks of at most `maxChars` characters, preferring paragraph, line and
 * sentence boundaries.
 *
 * Lossless: `chunks.join('') === text`. No whitespace is trimmed or dropped, so callers can re-join
 * translated chunks with the exact original separators (see `translateChunked`). Hard cuts never
 * split a surrogate pair. Whitespace-only chunks are merged into their neighbour.
 */
export function splitIntoChunks(text: string, maxChars = CHUNK_CHAR_LIMIT): string[] {
  const limit = Math.max(1, Math.floor(maxChars))
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let pos = 0

  while (pos < text.length) {
    const remaining = text.length - pos
    if (remaining <= limit) {
      chunks.push(text.slice(pos))
      break
    }

    const window = text.slice(pos, pos + limit)
    const minSplit = limit * MIN_SPLIT_RATIO
    let splitAt = limit

    const paraEnd = lastParagraphBreakEnd(window, minSplit)
    if (paraEnd > 0) {
      splitAt = paraEnd
    } else {
      const line = window.lastIndexOf('\n')
      if (line > minSplit) {
        splitAt = line + 1
      } else {
        let best = -1
        let bestEnd = 0
        for (const ender of SENTENCE_ENDERS) {
          const idx = window.lastIndexOf(ender)
          if (idx > minSplit && idx + ender.length > bestEnd) {
            best = idx
            bestEnd = idx + ender.length
          }
        }
        if (best > 0) splitAt = bestEnd
      }
    }

    // Never cut between the halves of a surrogate pair (emoji, rare CJK).
    if (splitAt > 1 && isHighSurrogate(text.charCodeAt(pos + splitAt - 1))) splitAt -= 1

    chunks.push(text.slice(pos, pos + splitAt))
    pos += splitAt
  }

  return mergeWhitespaceOnlyChunks(chunks)
}

/**
 * Split `text` into two non-empty halves (lossless: `a + b === text`), cutting at the paragraph,
 * line or sentence boundary closest to the middle. Falls back to a hard cut at the middle that never
 * splits a surrogate pair. Returns null when the text is too short to split.
 */
export function splitTextInHalf(text: string): [string, string] | null {
  if (text.length < 2) return null
  const mid = Math.floor(text.length / 2)
  const lo = Math.floor(text.length * 0.25)
  const hi = Math.ceil(text.length * 0.75)

  const tiers: string[][] = [PARAGRAPH_BREAKS, ['\n'], SENTENCE_ENDERS]
  for (const tier of tiers) {
    let bestCut = -1
    for (const sep of tier) {
      // A candidate cut sits right after each separator occurrence.
      for (let idx = text.indexOf(sep, lo); idx !== -1 && idx + sep.length <= hi; idx = text.indexOf(sep, idx + 1)) {
        const cut = idx + sep.length
        if (cut > 0 && cut < text.length && (bestCut === -1 || Math.abs(cut - mid) < Math.abs(bestCut - mid))) bestCut = cut
      }
    }
    if (bestCut !== -1) return [text.slice(0, bestCut), text.slice(bestCut)]
  }

  let cut = mid
  if (cut > 1 && isHighSurrogate(text.charCodeAt(cut - 1))) cut -= 1
  if (cut <= 0 || cut >= text.length) return null
  return [text.slice(0, cut), text.slice(cut)]
}

function mergeWhitespaceOnlyChunks(chunks: string[]): string[] {
  const merged: string[] = []
  let pendingLeading = ''
  for (const chunk of chunks) {
    if (chunk.trim().length > 0) {
      merged.push(pendingLeading + chunk)
      pendingLeading = ''
    } else if (merged.length > 0) {
      merged[merged.length - 1] += chunk
    } else {
      pendingLeading += chunk
    }
  }
  if (merged.length === 0) return [pendingLeading]
  return merged
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        // Reject first so the timeout (not the abort it triggers) is what the caller sees.
        reject(new Error(`Translation timed out after ${ms / 1000}s (${label})`))
        onTimeout?.()
      },
      ms,
    )
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

/**
 * Run `task` with a timeout that also aborts the underlying request.
 * The signal handed to `task` fires on timeout or when `parentSignal` aborts.
 */
export function runWithTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (parentSignal?.aborted) {
    return Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
  }
  const controller = new AbortController()
  const onParentAbort = () => controller.abort()
  parentSignal?.addEventListener('abort', onParentAbort, { once: true })

  let started: Promise<T>
  try {
    started = task(controller.signal)
  } catch (error) {
    started = Promise.reject(error)
  }
  return withTimeout(
    started,
    ms,
    label,
    () => controller.abort(),
  ).finally(() => parentSignal?.removeEventListener('abort', onParentAbort))
}

/**
 * Run tasks with bounded concurrency. After the first failure no worker pulls another task and
 * `onFailure` is called once (use it to abort in-flight requests); the first error is rethrown.
 */
export async function promisePool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  onFailure?: (error: unknown) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  let failed = false

  async function worker(): Promise<void> {
    while (!failed && next < tasks.length) {
      const i = next++
      try {
        results[i] = await tasks[i]()
      } catch (error) {
        if (!failed) {
          failed = true
          onFailure?.(error)
        }
        throw error
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export type ChunkedMode = 'translate' | 'rewrite'

export interface TranslateChunkedOptions {
  /** Caller cancellation (e.g. translate:cancel). */
  signal?: AbortSignal
  /** Selects the continuity-note wording. Default: 'translate'. */
  mode?: ChunkedMode
  /**
   * Deadline (ms) for one request, given the exact text sent to the provider.
   * Default: the cloud-provider deadline for that size (see `getTranslateTimeoutMs`).
   */
  getTimeoutMs?: (text: string) => number
}

interface ChunkSegment {
  lead: string
  core: string
  trail: string
}

function toSegment(chunk: string): ChunkSegment {
  const core = chunk.trim()
  if (!core) return { lead: '', core: '', trail: chunk }
  const start = chunk.indexOf(core)
  return { lead: chunk.slice(0, start), core, trail: chunk.slice(start + core.length) }
}

function buildChunkNote(mode: ChunkedMode, part: number, total: number, prevTail: string | null): string {
  if (mode === 'rewrite') {
    if (prevTail === null) {
      return (
        `[NOTE: This is part ${part} of ${total} of a larger text being rewritten. ` +
        `Rewrite only this part; more will follow. Keep the voice, terminology and style consistent. ` +
        `Output only the rewritten text — no notes or prefix.]\n\n`
      )
    }
    return (
      `[NOTE: This is part ${part} of ${total} of a larger text being rewritten. ` +
      `The immediately preceding text (already rewritten separately) was:\n` +
      `"${prevTail}"\n` +
      `Rewrite ONLY the text below this note. Keep the voice, terminology and style consistent ` +
      `with the rest of the text. Output only the rewritten text — no notes or prefix.]\n\n`
    )
  }
  if (prevTail === null) {
    return (
      `[NOTE: This is part ${part} of ${total} of a larger document. ` +
      `Translate only this part; more will follow. Maintain consistent terminology and style.]\n\n`
    )
  }
  return (
    `[NOTE: This is part ${part} of ${total} of a larger document. ` +
    `The immediately preceding source text (already translated separately) was:\n` +
    `"${prevTail}"\n` +
    `Translate ONLY the text below this note. Use consistent terminology and style ` +
    `with the rest of the document. Output only the translation — no notes or prefix.]\n\n`
  )
}

function requireText(result: string, label: string): string {
  if (!result?.trim()) {
    throw new ProviderResponseError(`Empty response for ${label}`, 'EMPTY_RESPONSE')
  }
  return result
}

function isTruncationError(error: unknown): boolean {
  return (error as { errorCode?: string } | null)?.errorCode === 'OUTPUT_TRUNCATED'
}

/**
 * Translate (or rewrite) long text in ordered chunks and re-join the results with the exact
 * whitespace that separated the source chunks. An empty chunk result is an error, never dropped.
 *
 * A chunk whose output hits the provider's output ceiling (OUTPUT_TRUNCATED) is split in half on a
 * boundary and each half is translated separately (up to MAX_TRUNCATION_SPLIT_DEPTH times).
 */
export async function translateChunked(
  translateFn: (text: string, signal?: AbortSignal) => Promise<string>,
  sourceText: string,
  chunkLimit = CHUNK_CHAR_LIMIT,
  options: TranslateChunkedOptions = {},
): Promise<string> {
  const mode = options.mode ?? 'translate'
  const getTimeoutMs = options.getTimeoutMs ?? ((text: string) => getTranslateTimeoutMs(undefined, text.length))
  const segments = splitIntoChunks(sourceText, chunkLimit).map(toSegment)
  const work = segments.filter((segment) => segment.core.length > 0)
  if (work.length === 0) return sourceText

  const poolController = new AbortController()
  const abortPool = () => poolController.abort()
  if (options.signal?.aborted) abortPool()
  else options.signal?.addEventListener('abort', abortPool, { once: true })

  /** One provider request with retry + deadline. `input` is exactly what is sent. */
  const callOnce = (input: string, label: string) =>
    withRetry(
      () => runWithTimeout((signal) => translateFn(input, signal), getTimeoutMs(input), label, poolController.signal),
      { signal: poolController.signal },
    ).then((result) => requireText(result, label))

  /** Translate one source piece; on OUTPUT_TRUNCATED halve it and translate each half. */
  const translatePiece = async (
    core: string,
    makeInput: (core: string, prevTail: string | null) => string,
    prevTail: string | null,
    label: string,
    depth: number,
  ): Promise<string> => {
    try {
      return await callOnce(makeInput(core, prevTail), label)
    } catch (error) {
      if (!isTruncationError(error) || depth >= MAX_TRUNCATION_SPLIT_DEPTH || poolController.signal.aborted) throw error
      const halves = splitTextInHalf(core)
      if (!halves) throw error
      const parts: string[] = []
      let tail = prevTail
      for (const half of halves.map(toSegment)) {
        if (!half.core) {
          parts.push(half.trail)
          continue
        }
        const translated = await translatePiece(half.core, makeInput, tail, `${label} (part ${parts.length + 1})`, depth + 1)
        parts.push(half.lead + translated + half.trail)
        tail = half.core.slice(-CONTEXT_TAIL_CHARS).trim()
      }
      return parts.join('')
    }
  }

  try {
    if (work.length === 1) {
      const only = work[0]
      const result = await translatePiece(only.core, (core) => core, null, 'single chunk', 0)
      return only.lead + result + only.trail
    }

    const tasks: Array<() => Promise<string>> = work.map((segment, idx) => () => {
      const prevTail = idx === 0 ? null : work[idx - 1].core.slice(-CONTEXT_TAIL_CHARS).trim()
      const label = `chunk ${idx + 1}/${work.length}`
      const makeInput = (core: string, tail: string | null) => buildChunkNote(mode, idx + 1, work.length, tail) + core
      // Per-chunk retry: a transient network blip on one chunk no longer kills the whole document.
      return translatePiece(segment.core, makeInput, prevTail, label, 0)
    })

    const results = await promisePool(tasks, CHUNK_CONCURRENCY, abortPool)

    let workIndex = 0
    return segments
      .map((segment) => (segment.core ? segment.lead + results[workIndex++] + segment.trail : segment.trail))
      .join('')
  } finally {
    options.signal?.removeEventListener('abort', abortPool)
  }
}
