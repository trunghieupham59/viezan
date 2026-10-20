// @vitest-environment node
import { EventEmitter } from 'node:events'
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerLiveInterpretationHandlers } from '../liveInterpretation'

const provider = vi.hoisted(() => vi.fn())
vi.mock('../storage', () => ({ getStoredApiKey: () => 'test-only-key' }))
vi.mock('../translateProviders', () => ({ TRANSLATE_PROVIDERS: { openai: provider } }))

describe('live interpretation IPC boundary', () => {
  const request = { sessionId: 'session-1', segmentId: 'segment-1', provider: 'openai', model: 'gpt-4o-mini', sourceLang: 'vi', targetLang: 'ja', sourceText: 'Của chị đây!', context: 'Quyển sách này.', subtitles: true }
  let invoke: (channel: string, payload: unknown, trusted?: boolean) => Promise<unknown>
  let sender: EventEmitter
  let send: ReturnType<typeof vi.fn>

  beforeEach(() => {
    provider.mockReset().mockResolvedValue('はい、どうぞ。')
    sender = new EventEmitter()
    send = vi.fn()
    const main = { isDestroyed: () => false, webContents: sender } as unknown as BrowserWindow
    const subtitle = { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow
    const handlers: Record<string, (event: IpcMainInvokeEvent, payload: unknown) => unknown> = {}
    const ipc = { handle: (channel: string, handler: typeof handlers[string]) => { handlers[channel] = handler } } as unknown as IpcMain
    registerLiveInterpretationHandlers(ipc, () => main, () => subtitle)
    invoke = async (channel, payload, trusted = true) => handlers[channel]({ sender: trusted ? sender : {} } as IpcMainInvokeEvent, payload)
  })

  it('rejects untrusted callers and oversized context before any provider call', async () => {
    await invoke('live:begin', 'session-1', false)
    await expect(invoke('live:translate', request)).resolves.toMatchObject({ errorCode: 'CANCELLED' })
    await invoke('live:begin', 'session-1')
    await expect(invoke('live:translate', request, false)).resolves.toMatchObject({ errorCode: 'PERMISSION_DENIED' })
    await expect(invoke('live:translate', { ...request, context: 'x'.repeat(321) })).resolves.toMatchObject({ errorCode: 'INVALID_INPUT' })
    expect(provider).not.toHaveBeenCalled()
  })

  it('validates assembly input and never calls a provider merely to decide a boundary', async () => {
    await invoke('live:begin', 'session-1')
    const append = { sessionId: 'session-1', action: 'append', sequence: 1, sourceText: 'Tôi chỉ ký nếu',
      sourceLang: 'vi', targetLang: 'ja', speaker: 'Speaker 1', timestamp: 1, durationMs: 2_000, pause: true }
    await expect(invoke('live:assemble', append, false)).resolves.toMatchObject({ errorCode: 'PERMISSION_DENIED' })
    for (const patch of [{ sourceText: 'x'.repeat(4001) }, { sequence: NaN }, { durationMs: Infinity }, { pause: 'yes' }, { action: 'reset' }]) {
      await expect(invoke('live:assemble', { ...append, ...patch })).resolves.toMatchObject({ errorCode: 'INVALID_INPUT' })
    }
    await expect(invoke('live:assemble', append)).resolves.toMatchObject({ success: true, hasOpen: true, updates: [{ state: 'pending', translate: false }] })
    await expect(invoke('live:assemble', { ...append, sourceText: '', action: 'stop' })).resolves.toMatchObject({
      success: true, hasOpen: false, updates: [{ sourceText: 'Tôi chỉ ký nếu', state: 'incomplete', translate: true }],
    })
    expect(provider).not.toHaveBeenCalled()
  })

  it('publishes only the validated answer and supplies the dedicated live profile', async () => {
    await invoke('live:begin', 'session-1')
    await expect(invoke('live:translate', request)).resolves.toMatchObject({ success: true })
    expect(provider.mock.calls[0][9]).toBe('low')
    expect(provider.mock.calls[0][10]).toMatchObject({ live: { context: request.context } })
    expect(send).toHaveBeenCalledWith('subtitle:stream:token', { segId: 'segment-1', token: 'はい、どうぞ。' })
    provider.mockResolvedValue('Wait — I need to output only the translation.')
    send.mockClear()
    await expect(invoke('live:translate', { ...request, segmentId: 'segment-2', context: '' })).resolves.toMatchObject({ errorCode: 'INVALID_OUTPUT' })
    expect(send).not.toHaveBeenCalled()
  })

  it('cancels pending output on renderer destruction and observes destruction only once', async () => {
    await invoke('live:begin', 'session-1')
    await invoke('live:begin', 'session-1')
    expect(sender.listenerCount('destroyed')).toBe(1)
    let finish!: (text: string) => void
    provider.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const result = invoke('live:translate', request)
    sender.emit('destroyed')
    finish('Old answer')
    await expect(result).resolves.toMatchObject({ errorCode: 'CANCELLED' })
    expect(send).not.toHaveBeenCalled()
  })

  it('does not publish or retry output in a clearly wrong script or copied background', async () => {
    await invoke('live:begin', 'session-1')
    provider.mockResolvedValue('Which book would you like to see?')
    await expect(invoke('live:translate', request)).resolves.toMatchObject({ errorCode: 'INVALID_OUTPUT' })
    expect(send).not.toHaveBeenCalled()
    expect(provider).toHaveBeenCalledOnce()
    provider.mockResolvedValue('chị chờ một chút đi. bên này hả? 正しいですか。')
    await expect(invoke('live:translate', { ...request, segmentId: 'segment-2', sourceText: 'Đúng rồi.', context: 'Chị chờ một chút đi. Bên này hả?' })).resolves.toMatchObject({ errorCode: 'INVALID_OUTPUT' })
    expect(send).not.toHaveBeenCalled()
    expect(provider).toHaveBeenCalledTimes(2)
  })
})
