import type { LiveAssemblyRequest, LiveAssemblyResult, LiveAssemblyUpdate, LiveTokenUsage, LiveTranslationRequest, LiveTranslationResult } from '../../shared/liveInterpretation'
import { classifyProviderError } from '../ipc/errorUtils'
import { buildLivePrompt, buildLiveSystemPrompt, estimateLiveUsage, planOpenConditionalTranslation, selectLiveContext, validateLiveOutput } from '../ipc/liveTranslationPolicy'
import { withRetry } from '../ipc/retry'
import { runWithTimeout } from '../ipc/translateChunking'
import type { TranslateRequestOptions } from '../ipc/translateProviderTypes'
import { LiveSentenceAssembly } from './liveSentenceAssembly'

type Translate = (request: LiveTranslationRequest, options: TranslateRequestOptions) => Promise<string>
interface Job { local: boolean; run: () => Promise<void>; cancel: () => void }

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
  private runningLocal = 0
  private cache = new Map<string, string>()
  private inFlight = new Map<string, Promise<LiveTranslationResult>>()
  private segments = new Map<string, { key: string; result: Promise<LiveTranslationResult> }>()
  private assembly = new LiveSentenceAssembly()
  private assembled = new Map<string, LiveAssemblyUpdate>()

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
    this.inFlight.clear()
    this.segments.clear()
    this.assembly = new LiveSentenceAssembly()
    this.assembled.clear()
  }

  assemble(request: LiveAssemblyRequest): LiveAssemblyResult {
    if (!this.isActive(request.sessionId)) return { success: false, errorCode: 'CANCELLED' }
    try {
      const updates = this.assembly.accept(request)
      for (const update of updates) this.assembled.set(update.segmentId, update)
      // The editable tail and recent decisions only; older UI history is immutable.
      while (this.assembled.size > 256) this.assembled.delete(this.assembled.keys().next().value as string)
      return { success: true, updates, hasOpen: this.assembly.hasOpen }
    } catch (error) {
      return { success: false, errorCode: error instanceof Error ? error.message : 'INVALID_INPUT' }
    }
  }

  isCurrentTranslation(request: LiveTranslationRequest): boolean {
    if (request.revision === undefined) return true
    const current = this.assembled.get(request.segmentId)
    return current?.revision === request.revision && current.sourceText === request.sourceText
      && current.context === request.context && current.state !== 'pending'
  }

  translate(request: LiveTranslationRequest): Promise<LiveTranslationResult> {
    if (request.sessionId !== this.sessionId || this.controller.signal.aborted) {
      return Promise.resolve({ success: false, errorCode: 'CANCELLED' })
    }
    if (!this.isCurrentTranslation(request)) return Promise.resolve({ success: false, errorCode: 'CANCELLED' })
    const signal = this.controller.signal
    const segmentKey = request.revision === undefined ? request.segmentId : `${request.segmentId}:${request.revision}`
    const key = JSON.stringify([request.provider, request.model, request.sourceLang, request.targetLang, request.context, request.sourceText])
    const existing = this.segments.get(segmentKey)
    if (existing) return existing.key === key ? existing.result : Promise.resolve({ success: false, errorCode: 'INVALID_INPUT' })
    const conditional = planOpenConditionalTranslation(request.sourceText, request.sourceLang, request.targetLang)
    const context = conditional ? '' : selectLiveContext(request.sourceText, request.context, request.targetLang)
    const providerRequest = conditional ? { ...request, sourceText: conditional.sourceText, context } : request
    const cacheKey = JSON.stringify([request.provider, request.model, request.sourceLang, request.targetLang, context, request.sourceText])
    const zeroCost = (text: string): LiveTranslationResult => ({ success: true, translatedText: text, cached: true, attempts: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: false } })
    const shared = this.inFlight.get(cacheKey)
    if (shared) {
      // Only the original job owns billed usage. Duplicates receive the same
      // validated text, including when it was still queued when submitted.
      const result = shared.then(value => !this.isCurrentTranslation(request) || signal.aborted
        ? { success: false as const, errorCode: 'CANCELLED' }
        : value.success ? zeroCost(value.translatedText) : { success: false as const, errorCode: value.errorCode })
      this.segments.set(segmentKey, { key, result })
      void result.then(() => { if (!signal.aborted && this.segments.size > 256) this.segments.delete(segmentKey) })
      return result
    }
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined) {
      const result = Promise.resolve(zeroCost(cached))
      this.segments.set(segmentKey, { key, result })
      if (this.segments.size > 256) this.segments.delete(segmentKey)
      return result
    }
    if (this.queue.length >= 64) return Promise.resolve({ success: false, errorCode: 'BACKLOG' })

    const queuedAt = performance.now()
    const result = new Promise<LiveTranslationResult>(resolve => {
      this.queue.push({
        local: request.provider === 'local',
        cancel: () => resolve({ success: false, errorCode: 'CANCELLED' }),
        run: async () => {
          if (signal.aborted || !this.isCurrentTranslation(request)) {
            resolve({ success: false, errorCode: 'CANCELLED' })
            return
          }
          const startedAt = performance.now()
          let attempts = 0
          let usage: LiveTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: false }
          try {
            const text = await withRetry(async () => {
              attempts += 1
              let reported = false
              const output = await runWithTimeout(
                abortSignal => this.translateProvider(providerRequest, {
                  signal: abortSignal,
                  live: { context },
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
                const estimate = estimateLiveUsage(buildLiveSystemPrompt(request.sourceLang, request.targetLang) + buildLivePrompt(providerRequest.sourceText, request.sourceLang, request.targetLang, context), output)
                usage = { inputTokens: usage.inputTokens + estimate.inputTokens, outputTokens: usage.outputTokens + estimate.outputTokens, totalTokens: usage.totalTokens + estimate.totalTokens, estimated: true }
              }
              const translated = conditional
                ? conditional.prefix + validateLiveOutput(output, providerRequest.sourceText, request.targetLang)
                : output
              return validateLiveOutput(translated, request.sourceText, request.targetLang, context)
            }, { maxAttempts: request.revision === undefined ? 2 : 1, initialDelayMs: 250, maxRetryAfterMs: 1_000, signal })
            if (signal.aborted || !this.isCurrentTranslation(request)) {
              resolve({ success: false, errorCode: 'CANCELLED', ...(usage.totalTokens ? { usage } : {}) }); return
            }
            this.cache.set(cacheKey, text)
            if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value as string)
            resolve({ success: true, translatedText: text, usage, attempts, cached: false,
              timing: { queueMs: Math.round(startedAt - queuedAt), providerMs: Math.round(performance.now() - startedAt) } })
          } catch (error) {
            resolve({ success: false, errorCode: signal.aborted ? 'CANCELLED' : ((error as { errorCode?: string })?.errorCode ?? classifyProviderError(error).errorCode ?? 'UNKNOWN'),
              ...(usage.totalTokens > 0 ? { usage } : {}) })
          }
        },
      })
      this.pump()
    })
    this.inFlight.set(cacheKey, result)
    this.segments.set(segmentKey, { key, result })
    // Bound dedup metadata for long meetings, retaining in-flight requests.
    void result.then(() => {
      if (this.inFlight.get(cacheKey) === result) this.inFlight.delete(cacheKey)
      if (!signal.aborted && this.segments.size > 256) this.segments.delete(segmentKey)
    })
    return result
  }

  private pump(): void {
    while (this.running < 2 && this.queue.length > 0) {
      // A single local inference lane avoids competing contexts/KV allocations
      // on one desktop model. Cloud work retains the two-request limit.
      const index = this.queue.findIndex(job => !job.local || this.runningLocal === 0)
      if (index < 0) break
      const [job] = this.queue.splice(index, 1)
      if (!job) break
      this.running += 1
      if (job.local) this.runningLocal += 1
      void job.run().finally(() => { this.running -= 1; if (job.local) this.runningLocal -= 1; this.pump() })
    }
  }
}
