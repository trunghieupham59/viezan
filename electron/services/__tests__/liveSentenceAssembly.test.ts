// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { LiveAssemblyRequest } from '../../../shared/liveInterpretation'
import { LIVE_SOURCE_CHARS } from '../../ipc/liveTranslationPolicy'
import { LiveSentenceAssembly } from '../liveSentenceAssembly'

const chunk = (sequence: number, sourceText: string, patch: Partial<LiveAssemblyRequest> = {}): LiveAssemblyRequest => ({
  sessionId: 'session', action: 'append', sequence, sourceText, sourceLang: 'vi', targetLang: 'ja',
  durationMs: 2_000, pause: false, speaker: 'Speaker 1', timestamp: sequence * 2_000, ...patch,
})
const stop = (patch: Partial<LiveAssemblyRequest> = {}) => chunk(0, '', { action: 'stop', durationMs: 0, ...patch })

describe('live sentence assembly (offline source-boundary regressions)', () => {
  it('keeps a conditional suffix with an apparent full sentence after a breath', () => {
    const assembly = new LiveSentenceAssembly()
    expect(assembly.accept(chunk(1, 'Tôi đồng ý ký hợp đồng.', { pause: true }))[0]).toMatchObject({ state: 'pending', translate: false })
    assembly.accept(chunk(2, 'chỉ khi bên bán bổ sung điều khoản bảo hành.'))
    expect(assembly.accept(stop())[0]).toMatchObject({
      sourceText: 'Tôi đồng ý ký hợp đồng chỉ khi bên bán bổ sung điều khoản bảo hành.',
      state: 'final', translate: true, segmentId: 'unit-session-1',
    })
  })

  it('keeps a Japanese final negative suffix in the same editable unit', () => {
    const assembly = new LiveSentenceAssembly()
    const pair = { sourceLang: 'ja', targetLang: 'vi' }
    assembly.accept(chunk(1, 'この条件に賛成する。', { ...pair, pause: true }))
    assembly.accept(chunk(2, 'わけではありません。', pair))
    expect(assembly.accept(stop(pair))[0]).toMatchObject({ sourceText: 'この条件に賛成するわけではありません。', segmentId: 'unit-session-1' })
  })

  it('does not finalize a dependent clause on sustained silence', () => {
    const assembly = new LiveSentenceAssembly()
    assembly.accept(chunk(1, 'Nếu khách hàng xác nhận số lượng.', { pause: true }))
    expect(assembly.accept(stop({ action: 'silence' }))).toEqual([])
    expect(assembly.hasOpen).toBe(true)
    assembly.accept(chunk(2, 'thì chúng ta mới đặt hàng.'))
    expect(assembly.accept(stop({ action: 'silence' }))[0]).toMatchObject({
      sourceText: 'Nếu khách hàng xác nhận số lượng thì chúng ta mới đặt hàng.', state: 'final',
    })
  })

  it('does not treat STT punctuation at a hard window cut as finalization', () => {
    const assembly = new LiveSentenceAssembly()
    const updates = [
      ...assembly.accept(chunk(1, 'Khách hàng yêu cầu một bản báo cáo.', { durationMs: 6_000 })),
      ...assembly.accept(chunk(2, 'bao gồm cả chi phí vận hành.', { durationMs: 6_000 })),
      ...assembly.accept(chunk(3, 'và các điều kiện bảo hành.', { durationMs: 6_000 })),
      ...assembly.accept(chunk(4, 'trong suốt thời gian sử dụng.', { durationMs: 6_000 })),
    ]
    expect(new Set(updates.map(u => u.segmentId)).size).toBe(1)
    expect(updates.filter(u => u.translate)).toHaveLength(1)
    expect(updates.every(u => u.state !== 'final')).toBe(true)
    const final = assembly.accept(stop())[0]
    expect(final.sourceText).toContain('bao gồm cả chi phí')
    expect(final.sourceText).toContain('trong suốt thời gian sử dụng.')
    expect(final.translate).toBe(true)
    expect(assembly.accept(stop())).toEqual([])
  })

  it('settles a natural complete thought and gives the next one bounded context', () => {
    const assembly = new LiveSentenceAssembly()
    assembly.accept(chunk(1, 'Đây là quyển sách tôi vừa mua.', { pause: true }))
    const updates = assembly.accept(chunk(2, 'Quyển này à?'))
    expect(updates[0]).toMatchObject({ state: 'final', translate: true })
    expect(updates[1]).toMatchObject({ state: 'pending', context: 'Đây là quyển sách tôi vừa mua.' })
  })

  it('preserves the literal unfinished tail at Stop without adding an ending', () => {
    const assembly = new LiveSentenceAssembly()
    assembly.accept(chunk(1, 'Tôi chỉ ký nếu'))
    expect(assembly.accept(stop())[0]).toMatchObject({ sourceText: 'Tôi chỉ ký nếu', state: 'incomplete', translate: true })
    expect(assembly.hasOpen).toBe(false)
    expect(() => assembly.accept(chunk(2, 'late text'))).toThrow('SESSION_STOPPED')
  })

  it('does not translate an unchanged preview again on Stop', () => {
    const assembly = new LiveSentenceAssembly()
    const preview = assembly.accept(chunk(1, 'Chúng ta đang cân nhắc các điều kiện', { durationMs: 12_000 }))[0]
    expect(preview).toMatchObject({ state: 'provisional', translate: true })
    expect(assembly.accept(stop())[0]).toMatchObject({ revision: preview.revision, state: 'incomplete', translate: false })
  })

  it.each(['はい', 'どうぞ', 'Vâng.', 'Dạ'])('does not delay a standalone reply: %s', text => {
    const assembly = new LiveSentenceAssembly()
    expect(assembly.accept(chunk(1, text))[0]).toMatchObject({ state: 'final', translate: true })
    expect(assembly.accept(stop())).toEqual([])
  })

  it('bounds very long editable units without losing text or forcing a false complete status', () => {
    const assembly = new LiveSentenceAssembly()
    const first = 'điều kiện '.repeat(390).trim()
    const second = 'bảo hành '.repeat(390).trim()
    const all = [
      ...assembly.accept(chunk(1, first)),
      ...assembly.accept(chunk(2, second)),
      ...assembly.accept(stop()),
    ]
    const settled = all.filter(u => u.state === 'incomplete' || u.state === 'final')
    expect(settled.every(u => u.sourceText.length <= LIVE_SOURCE_CHARS)).toBe(true)
    expect(settled.map(u => u.sourceText).join(' ')).toBe(`${first} ${second}`)
    expect(settled[0].state).toBe('incomplete')
  })

  it('rejects repeated/out-of-order chunks and language changes without duplicating source', () => {
    const assembly = new LiveSentenceAssembly()
    assembly.accept(chunk(1, 'Nếu'))
    expect(() => assembly.accept(chunk(1, 'Nếu'))).toThrow('INVALID_INPUT')
    expect(() => assembly.accept(chunk(2, 'Nếu', { targetLang: 'en' }))).toThrow('INVALID_INPUT')
    expect(assembly.accept(stop())[0].sourceText).toBe('Nếu')
  })
})
