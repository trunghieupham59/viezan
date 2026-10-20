// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveAssemblyRequest, LiveAssemblyUpdate, LiveTranslationRequest } from '../../../shared/liveInterpretation'
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
const assemblyRequest = (sequence: number, sourceText: string, patch: Partial<LiveAssemblyRequest> = {}): LiveAssemblyRequest => ({
  sessionId: 'session-1', action: 'append', sequence, sourceText, sourceLang: 'vi', targetLang: 'ja',
  durationMs: 6_000, pause: false, speaker: 'Speaker 1', timestamp: sequence * 6_000, ...patch,
})
const revisionRequest = (update: LiveAssemblyUpdate) => request(update.segmentId, {
  sourceText: update.sourceText, context: update.context, revision: update.revision, provider: 'local',
})
afterEach(() => vi.useRealTimers())

describe('LiveInterpretationService', () => {
  it('translates a Stop after nếu once, restores the condition, and caches only the original conditional meaning', async () => {
    const provider = vi.fn().mockResolvedValue('契約書に署名することに同意します。')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const sourceText = 'Tôi chỉ đồng ý ký hợp đồng nếu'
    service.assemble(assemblyRequest(1, sourceText, { durationMs: 2400 }))
    const stop = service.assemble(assemblyRequest(1, '', { action: 'stop', durationMs: 0 }))
    if (!stop.success) throw new Error(stop.errorCode)
    const update = stop.updates[0]
    expect(update).toMatchObject({ state: 'incomplete', sourceText })
    const result = await service.translate(revisionRequest(update))
    expect(result).toMatchObject({ success: true, translatedText: '…の場合に限り、契約書に署名することに同意します。', attempts: 1 })
    expect(provider).toHaveBeenCalledOnce()
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ sourceText: 'Tôi đồng ý ký hợp đồng', context: '' }), expect.objectContaining({ live: { context: '' } }))
    expect(await service.translate(request('repeat', { provider: 'local', sourceText, context: '' }))).toMatchObject({ success: true, cached: true, usage: { totalTokens: 0 } })
    expect(provider).toHaveBeenCalledOnce()
    // The unconditional sentence must never reuse a conditionally wrapped cache.
    const plain = await service.translate(request('plain', { provider: 'local', sourceText: 'Tôi đồng ý ký hợp đồng', context: '' }))
    expect(plain).toMatchObject({ success: true, translatedText: '契約書に署名することに同意します。', cached: false })
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('validates the translated consequence before adding a deterministic condition', async () => {
    const provider = vi.fn().mockResolvedValue('I need to translate this.')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    expect(await service.translate(request('bad', { sourceText: 'Tôi chỉ ký nếu' }))).toMatchObject({ success: false, errorCode: 'INVALID_OUTPUT' })
    expect(provider).toHaveBeenCalledOnce()
  })

  it('replaces the conditional preview with the completed sentence without retaining the missing-condition marker', async () => {
    const provider = vi.fn().mockResolvedValueOnce('契約書に署名することに同意します。')
      .mockResolvedValueOnce('保証がある場合にのみ、契約書に署名することに同意します。')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const preview = service.assemble(assemblyRequest(1, 'Tôi chỉ đồng ý ký hợp đồng nếu', { durationMs: 12_000 }))
    if (!preview.success) throw new Error(preview.errorCode)
    expect(await service.translate(revisionRequest(preview.updates[0]))).toMatchObject({ translatedText: '…の場合に限り、契約書に署名することに同意します。' })
    service.assemble(assemblyRequest(2, 'có bảo hành.'))
    const final = service.assemble(assemblyRequest(2, '', { action: 'stop' }))
    if (!final.success) throw new Error(final.errorCode)
    expect(await service.translate(revisionRequest(final.updates[0]))).toMatchObject({ translatedText: '保証がある場合にのみ、契約書に署名することに同意します。' })
    expect(provider).toHaveBeenCalledTimes(2)
    expect(provider.mock.calls[1][0].sourceText).toBe('Tôi chỉ đồng ý ký hợp đồng nếu có bảo hành.')
  })

  it('assembles a long thought into at most one preview and one final local call', async () => {
    const provider = vi.fn().mockResolvedValue('保証がある場合にのみ同意します。')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const parts = ['Tôi đồng ý ký hợp đồng', 'chỉ khi bên bán bổ sung', 'điều khoản bảo hành', 'cho toàn bộ thiết bị.']
    let latest!: LiveAssemblyUpdate
    for (let i = 0; i < parts.length; i++) {
      const result = service.assemble(assemblyRequest(i + 1, parts[i]))
      if (!result.success) throw new Error(result.errorCode)
      for (const update of result.updates) {
        latest = update
        if (update.translate) await service.translate(revisionRequest(update))
      }
    }
    expect(provider).toHaveBeenCalledOnce()
    const final = service.assemble(assemblyRequest(4, '', { action: 'stop', durationMs: 0 }))
    if (!final.success) throw new Error(final.errorCode)
    expect(final.updates[0]).toMatchObject({ segmentId: latest.segmentId, sourceText: parts.join(' '), state: 'final' })
    await service.translate(revisionRequest(final.updates[0]))
    expect(provider).toHaveBeenCalledTimes(2)
    expect(provider.mock.calls.every(([r]) => r.context.length <= 160)).toBe(true)
  })

  it('rejects a late preview after a source revision and skips obsolete queued inference', async () => {
    const blocked = deferred<string>()
    const provider = vi.fn().mockImplementationOnce(() => blocked.promise).mockResolvedValue('条件付きで同意します。')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const busy = service.translate(request('busy', { provider: 'local' }))
    const draft = service.assemble(assemblyRequest(1, 'Tôi đồng ý ký', { durationMs: 12_000 }))
    if (!draft.success) throw new Error(draft.errorCode)
    const obsolete = service.translate(revisionRequest(draft.updates[0]))
    service.assemble(assemblyRequest(2, 'chỉ khi có bảo hành.'))
    const final = service.assemble(assemblyRequest(2, '', { action: 'stop', durationMs: 0 }))
    if (!final.success) throw new Error(final.errorCode)
    const settled = service.translate(revisionRequest(final.updates[0]))
    blocked.resolve('はい、どうぞ。')
    await busy
    expect(await obsolete).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(await settled).toMatchObject({ success: true })
    expect(provider).toHaveBeenCalledTimes(2) // busy + final, no queued preview
  })

  it('retains usage but does not publish an in-flight obsolete preview', async () => {
    const pending = deferred<string>()
    const provider = vi.fn(async (_request, options) => {
      options.onUsage?.({ inputTokens: 40, outputTokens: 5, totalTokens: 45, estimated: false })
      return pending.promise
    })
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const draft = service.assemble(assemblyRequest(1, 'Tôi đồng ý', { durationMs: 12_000 }))
    if (!draft.success) throw new Error(draft.errorCode)
    const old = service.translate(revisionRequest(draft.updates[0]))
    service.assemble(assemblyRequest(2, 'chỉ khi có bảo hành.'))
    pending.resolve('同意します。')
    expect(await old).toMatchObject({ success: false, errorCode: 'CANCELLED', usage: { totalTokens: 45 } })
  })

  it('clears the open sentence and rejects old assembly after a new session', () => {
    const service = new LiveInterpretationService(vi.fn())
    service.begin('session-1')
    service.assemble(assemblyRequest(1, 'Nếu khách hàng'))
    service.begin('session-2')
    expect(service.assemble(assemblyRequest(2, 'xác nhận'))).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(service.assemble(assemblyRequest(0, '', { sessionId: 'session-2', action: 'stop' }))).toMatchObject({ success: true, updates: [] })
  })

  it('limits concurrent requests to two and preserves queued work', async () => {
    const pending = Array.from({ length: 4 }, () => deferred<string>())
    const provider = vi.fn((_request, _options) => pending[provider.mock.calls.length - 1].promise)
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const results = pending.map((_, i) => service.translate(request(`segment-${i}`, { sourceText: `Sentence ${String.fromCharCode(65 + i)}`, targetLang: 'en' })))
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
    const results = [1, 2, 3].map(i => service.translate(request(`segment-${i}`, { sourceText: `Sentence ${i}` })))
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
    expect(liveOutputBudget(source)).toBe(96)
    expect(buildLivePrompt(source, 'vi', 'ja', 'x'.repeat(10_000)).length).toBeLessThan(500)
  })

  it('shares pending identical translations and counts paid usage once', async () => {
    const pending = deferred<string>()
    const provider = vi.fn(async (_request, options) => {
      options.onUsage?.({ inputTokens: 30, outputTokens: 10, totalTokens: 40, estimated: false })
      return pending.promise
    })
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const first = service.translate(request('a', { sourceText: 'はい', targetLang: 'vi', context: 'Ignored background' }))
    const second = service.translate(request('b', { sourceText: 'はい', targetLang: 'vi', context: 'Different irrelevant history' }))
    expect(provider).toHaveBeenCalledOnce()
    pending.resolve('Vâng')
    expect(await first).toMatchObject({ success: true, usage: { totalTokens: 40 } })
    expect(await second).toMatchObject({ success: true, cached: true, usage: { totalTokens: 0 } })
  })

  it('serializes local inference but lets independent cloud work progress', async () => {
    const first = deferred<string>()
    const provider = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue('Vâng')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const a = service.translate(request('a', { provider: 'local', sourceText: 'はい', targetLang: 'vi' }))
    const b = service.translate(request('b', { provider: 'local', sourceText: 'そうです', targetLang: 'vi' }))
    const c = service.translate(request('c', { provider: 'openai', sourceText: 'Yes', targetLang: 'vi' }))
    expect(provider).toHaveBeenCalledTimes(2)
    expect(provider.mock.calls[1][0].provider).toBe('openai')
    await c
    first.resolve('Vâng')
    await Promise.all([a, b])
    expect(provider).toHaveBeenCalledTimes(3)
    expect(await b).toMatchObject({ timing: { queueMs: expect.any(Number), providerMs: expect.any(Number) } })
  })

  it('cancels all subscribers to an in-flight translation without sharing it with a new session', async () => {
    const old = deferred<string>()
    const provider = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValue('Vâng')
    const service = new LiveInterpretationService(provider)
    service.begin('session-1')
    const a = service.translate(request('a', { sourceText: 'はい', targetLang: 'vi' }))
    const b = service.translate(request('b', { sourceText: 'はい', targetLang: 'vi' }))
    service.begin('session-2')
    const c = service.translate(request('a', { sessionId: 'session-2', sourceText: 'はい', targetLang: 'vi' }))
    old.resolve('Old text')
    expect(await a).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(await b).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(await c).toMatchObject({ success: true, cached: false, translatedText: 'Vâng' })
    expect(provider).toHaveBeenCalledTimes(2)
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
