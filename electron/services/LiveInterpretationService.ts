import type { LiveTokenUsage, LiveTranslationRequest, LiveTranslationResult } from '../../shared/liveInterpretation'
import { classifyProviderError } from '../ipc/errorUtils'
import { buildLivePrompt, estimateLiveUsage, LIVE_SYSTEM_PROMPT, validateLiveOutput } from '../ipc/liveTranslationPolicy'
import { withRetry } from '../ipc/retry'
import { runWithTimeout } from '../ipc/translateChunking'
import type { TranslateRequestOptions } from '../ipc/translateProviderTypes'

type Translate = (request: LiveTranslationRequest, options: TranslateRequestOptions) => Promise<string>
interface Job { run: () => Promise<void>; cancel: () => void }

/** Owns live translation scheduling and cancellation independently of React rendering.
 * Stop drains accepted work; only Clear/new session/navigation call cancel.
 * Provider clients and credentials stay in the main process.
 */
export class LiveInterpretationService {
  private sessionId: string | null = null
  private controller = new AbortController()
  private revision = 0
  private queue: Job[] = []
  private running = 0
  private cache = new Map<string, string>()
  private segments = new Map<string, { key: string; result: Promise<LiveTranslationResult> }>()

  constructor(private readonly translateProvider: Translate) {}

  getRevision(): number { return this.revision }

  isActive(sessionId: string, revision = this.revision): boolean {
    return revision === this.revision && this.sessionId === sessionId && !this.controller.signal.aborted
  }

  begin(sessionId: string): void {
    this.cancel()
    this.sessionId = sessionId
    this.controller = new AbortController()
  }

  cancel(sessionId?: string): void {
    if (sessionId !== undefined && sessionId !== this.sessionId) return
    this.revision += 1
    this.controller.abort()
    this.sessionId = null
    for (const job of this.queue.splice(0)) job.cancel()
    this.cache.clear()
    this.segments.clear()
  }

  translate(request: LiveTranslationRequest): Promise<LiveTranslationResult> {
    if (request.sessionId !== this.sessionId || this.controller.signal.aborted) {
      return Promise.resolve({ success: false, errorCode: 'CANCELLED' })
    }
    const key = JSON.stringify([request.provider, request.model, request.sourceLang, request.targetLang, request.context, request.sourceText])
    const existing = this.segments.get(request.segmentId)
    if (existing) return existing.key === key ? existing.result : Promise.resolve({ success: false, errorCode: 'INVALID_INPUT' })
    const cached = this.cache.get(key)
    if (cached !== undefined) {
      const result = Promise.resolve<LiveTranslationResult>({ success: true, translatedText: cached, cached: true, attempts: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: false } })
      this.segments.set(request.segmentId, { key, result })
      if (this.segments.size > 256) this.segments.delete(request.segmentId)
      return result
    }
    if (this.queue.length >= 64) return Promise.resolve({ success: false, errorCode: 'BACKLOG' })

    const signal = this.controller.signal
    const result = new Promise<LiveTranslationResult>(resolve => {
      this.queue.push({
        cancel: () => resolve({ success: false, errorCode: 'CANCELLED' }),
        run: async () => {
          let attempts = 0
          let usage: LiveTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: false }
          try {
            const text = await withRetry(async () => {
              attempts += 1
              let reported = false
              const output = await runWithTimeout(
                abortSignal => this.translateProvider(request, {
                  signal: abortSignal,
                  live: { context: request.context },
                  onUsage: measured => {
                    reported = true
                    usage = { inputTokens: usage.inputTokens + measured.inputTokens, outputTokens: usage.outputTokens + measured.outputTokens, totalTokens: usage.totalTokens + measured.totalTokens, estimated: usage.estimated || measured.estimated }
                  },
                }),
                20_000,
                'live translation',
                signal,
              )
              if (!reported) {
                const estimate = estimateLiveUsage(LIVE_SYSTEM_PROMPT + buildLivePrompt(request.sourceText, request.sourceLang, request.targetLang, request.context), output)
                usage = { inputTokens: usage.inputTokens + estimate.inputTokens, outputTokens: usage.outputTokens + estimate.outputTokens, totalTokens: usage.totalTokens + estimate.totalTokens, estimated: true }
              }
              return validateLiveOutput(output, request.sourceText)
            }, { maxAttempts: 2, initialDelayMs: 250, maxRetryAfterMs: 1_000, signal })
            if (signal.aborted) { resolve({ success: false, errorCode: 'CANCELLED' }); return }
            this.cache.set(key, text)
            if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value as string)
            resolve({ success: true, translatedText: text, usage, attempts, cached: false })
          } catch (error) {
            resolve({ success: false, errorCode: signal.aborted ? 'CANCELLED' : ((error as { errorCode?: string })?.errorCode ?? classifyProviderError(error).errorCode ?? 'UNKNOWN'),
              ...(usage.totalTokens > 0 ? { usage } : {}) })
          }
        },
      })
      this.pump()
    })
    this.segments.set(request.segmentId, { key, result })
    // Bound dedup metadata for long meetings, retaining in-flight requests.
    void result.then(() => {
      if (!signal.aborted && this.segments.size > 256) this.segments.delete(request.segmentId)
    })
    return result
  }

  private pump(): void {
    while (this.running < 2 && this.queue.length > 0) {
      const job = this.queue.shift()
      if (!job) break
      this.running += 1
      void job.run().finally(() => { this.running -= 1; this.pump() })
    }
  }
}
