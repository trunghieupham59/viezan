// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveTranslationRequest } from '../../../shared/liveInterpretation'
import { buildLivePrompt, LIVE_SYSTEM_PROMPT, liveOutputBudget } from '../../ipc/liveTranslationPolicy'
import { buildPrompt, SYSTEM_PROMPT } from '../../ipc/translatePrompts'
import { LiveInterpretationService } from '../LiveInterpretationService'

const request = (segmentId: string, patch: Partial<LiveTranslationRequest> = {}): LiveTranslationRequest => ({
  sessionId: 'session-1', segmentId, provider: 'openai', model: 'test-model',
  sourceLang: 'vi', targetLang: 'ja', sourceText: 'Của chị đây!', context: 'Quyển sách này.', subtitles: false, ...patch,
})
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return { promise, resolve }
}
afterEach(() => vi.useRealTimers())

describe('LiveInterpretationService', () => {
  it('limits concurrent requests to two and preserves queued work', async () => {
    const pending = Array.from({ length: 4 }, () => deferred<string>())
    const provider = vi.fn((_request, _options) => pending[provider.mock.calls.length - 1].promise)
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const results = pending.map((_, i) => service.translate(request(`segment-${i}`, { sourceText: `Sentence ${i}` })))
    expect(provider).toHaveBeenCalledTimes(2)
    pending[1].resolve('Second')
    await results[1]
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(3))
    pending[0].resolve('First')
    await results[0]
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(4))
    pending[2].resolve('Third'); pending[3].resolve('Fourth')
    expect((await Promise.all(results)).every(result => result.success)).toBe(true)
  })

  it('cancels running and queued work and never accepts an old session again', async () => {
    const provider = vi.fn((_request, options) => new Promise<string>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
    }))
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const results = [1, 2, 3].map(i => service.translate(request(`segment-${i}`)))
    service.begin('session-2')
    for (const result of await Promise.all(results)) expect(result).toEqual({ success: false, errorCode: 'CANCELLED' })
    expect(provider).toHaveBeenCalledTimes(2)
    await expect(service.translate(request('late'))).resolves.toMatchObject({ errorCode: 'CANCELLED' })
    service.cancel('session-1')
    expect(service.isActive('session-2')).toBe(true)
  })

  it('deduplicates segment submissions and caches only identical contextual translations', async () => {
    const provider = vi.fn().mockResolvedValue('こちらです。')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const first = service.translate(request('a'))
    expect(service.translate(request('a'))).toBe(first)
    await first
    await expect(service.translate(request('b'))).resolves.toMatchObject({ cached: true, usage: { totalTokens: 0 } })
    await service.translate(request('c', { context: 'Một người tên Quyền.' }))
    expect(provider).toHaveBeenCalledTimes(2)
    await expect(service.translate(request('a', { sourceText: 'Changed source' }))).resolves.toMatchObject({ errorCode: 'INVALID_INPUT' })
  })

  it('uses provider usage including hidden reasoning instead of a character estimate', async () => {
    const provider = vi.fn(async (_request, options) => {
      options.onUsage?.({ inputTokens: 55, outputTokens: 140, totalTokens: 195, estimated: false })
      return 'こちらです。'
    })
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    await expect(service.translate(request('a'))).resolves.toMatchObject({ usage: { totalTokens: 195, estimated: false }, attempts: 1 })
  })

  it('retries transient failures once, but rejects commentary without a second paid request', async () => {
    vi.useFakeTimers()
    const provider = vi.fn().mockRejectedValueOnce(new Error('connection error')).mockResolvedValue('こちらです。')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const result = service.translate(request('a'))
    await vi.advanceTimersByTimeAsync(251)
    await expect(result).resolves.toMatchObject({ success: true, attempts: 2 })
    provider.mockResolvedValue('こちらです! Wait — I need to output only the translation. Let me settle on the natural rendering.')
    await expect(service.translate(request('b', { context: '' }))).resolves.toMatchObject({ success: false, errorCode: 'INVALID_OUTPUT' })
    expect(provider).toHaveBeenCalledTimes(3)
  })

  it('keeps normal names and quoted English instead of deleting all Latin text', async () => {
    const service = new LiveInterpretationService(async () => 'Quyềnさんが「Wait」と言いました。')
    service.begin('session-1')
    await expect(service.translate(request('a'))).resolves.toMatchObject({ success: true })
  })

  it('preserves provider usage when a paid response fails output validation', async () => {
    const service = new LiveInterpretationService(async (_request, options) => {
      options.onUsage?.({ inputTokens: 50, outputTokens: 20, totalTokens: 70, estimated: false })
      return 'Let me think about the translation.'
    })
    service.begin('session-1')
    await expect(service.translate(request('a'))).resolves.toMatchObject({ success: false, errorCode: 'INVALID_OUTPUT', usage: { totalTokens: 70, estimated: false } })
  })

  it('uses a substantially shorter bounded prompt without losing source data', () => {
    const source = 'Của chị đây!'
    const live = LIVE_SYSTEM_PROMPT + buildLivePrompt(source, 'vi', 'ja', '')
    const old = SYSTEM_PROMPT + buildPrompt(source, 'vi', 'ja', false, 'general', false, 'off')
    expect(live.length).toBeLessThan(old.length / 3)
    expect(live).toContain(source)
    expect(liveOutputBudget(source)).toBe(192)
    expect(buildLivePrompt(source, 'vi', 'ja', 'x'.repeat(10_000)).length).toBeLessThan(500)
  })

  it('invalidates the subtitle publication revision even when Clear reuses a session ID', () => {
    const service = new LiveInterpretationService(vi.fn())
    service.begin('session-1')
    const revision = service.getRevision()
    service.begin('session-1')
    expect(service.isActive('session-1', revision)).toBe(false)
    expect(service.isActive('session-1')).toBe(true)
  })
})
