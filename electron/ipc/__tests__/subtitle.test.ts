// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStoredApiKey: vi.fn(),
  streamTranslation: vi.fn(),
}))

vi.mock('electron', () => ({}))
vi.mock('../storage', () => ({ getStoredApiKey: mocks.getStoredApiKey }))
vi.mock('../translate', () => ({ streamTranslation: mocks.streamTranslation }))
vi.mock('../localAi', () => ({
  isLocalProvider: (provider: string) => provider === 'local',
  LOCAL_AI_PLACEHOLDER_KEY: 'local-placeholder',
}))

import { MAX_TRANSLATE_SOURCE_CHARS } from '../ipcConstants'
import { registerSubtitleHandlers } from '../subtitle'

type Handler = (event: unknown, ...args: unknown[]) => unknown

function makeWindow() {
  const send = vi.fn()
  const win = {
    destroyed: false,
    isDestroyed() { return this.destroyed },
    close: vi.fn(),
    show: vi.fn(),
    webContents: { send },
  }
  return { win, send }
}

let lastMain: ReturnType<typeof makeWindow>
/** Event as sent by the main window (the only trusted caller of control channels). */
const mainEvent = () => ({ sender: lastMain.win.webContents })

function setup(options: { subtitle?: ReturnType<typeof makeWindow>; main?: ReturnType<typeof makeWindow> } = {}) {
  const invokeHandlers: Record<string, Handler> = {}
  const onHandlers: Record<string, Handler> = {}
  const ipc = {
    handle: (channel: string, handler: Handler) => { invokeHandlers[channel] = handler },
    on: (channel: string, handler: Handler) => { onHandlers[channel] = handler },
  }
  const subtitle = options.subtitle ?? makeWindow()
  const main = options.main ?? makeWindow()
  lastMain = main
  registerSubtitleHandlers(ipc as never, () => subtitle.win as never, () => main.win as never, vi.fn())
  return { invokeHandlers, onHandlers, subtitle, main }
}

const validParams = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  sourceText: 'hello',
  sourceLang: 'en',
  targetLang: 'vi',
}

describe('translate:live-stream', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns structured errors for malformed payloads instead of throwing', async () => {
    const { invokeHandlers } = setup()
    const call = (params: unknown) => invokeHandlers['translate:live-stream'](mainEvent(), params) as Promise<{ success: boolean; error?: string }>

    for (const bad of [
      undefined,
      null,
      'string',
      [],
      { ...validParams, provider: 5 },
      { ...validParams, provider: 'not-a-provider' },
      { ...validParams, model: '' },
      { ...validParams, model: 'm'.repeat(201) },
      { ...validParams, sourceText: 42 },
      { ...validParams, sourceText: undefined },
      { ...validParams, sourceLang: '../etc' },
      { ...validParams, targetLang: undefined },
      { ...validParams, translationStyle: 'weird' },
      { ...validParams, segId: 12 },
    ]) {
      const result = await call(bad)
      expect(result.success, JSON.stringify(bad)).toBe(false)
      expect(typeof result.error).toBe('string')
    }
    expect(mocks.streamTranslation).not.toHaveBeenCalled()
  })

  it('rejects empty and oversized source text', async () => {
    const { invokeHandlers } = setup()
    const call = (sourceText: string) => invokeHandlers['translate:live-stream'](mainEvent(), { ...validParams, sourceText }) as Promise<{ success: boolean; errorCode?: string }>
    expect((await call('   ')).success).toBe(false)
    const tooLong = await call('a'.repeat(MAX_TRANSLATE_SOURCE_CHARS + 1))
    expect(tooLong).toMatchObject({ success: false, errorCode: 'PAYLOAD_TOO_LARGE' })
  })

  it('reports a missing API key', async () => {
    mocks.getStoredApiKey.mockReturnValue(null)
    const { invokeHandlers } = setup()
    expect(await invokeHandlers['translate:live-stream'](mainEvent(), validParams)).toMatchObject({
      success: false,
      errorCode: 'NO_API_KEY',
    })
  })

  it('streams tokens to the subtitle window and returns the full text', async () => {
    mocks.getStoredApiKey.mockReturnValue('sk-test')
    mocks.streamTranslation.mockImplementation(async (...args: unknown[]) => {
      const onToken = args[args.length - 1] as (token: string) => void
      onToken('xin ')
      onToken('chao')
      return 'xin chao'
    })
    const { invokeHandlers, subtitle } = setup()

    const result = await invokeHandlers['translate:live-stream'](mainEvent(), { ...validParams, segId: 's1' })
    expect(result).toEqual({ success: true, translatedText: 'xin chao' })
    expect(subtitle.send.mock.calls.map((call) => call[0])).toEqual([
      'subtitle:stream:start',
      'subtitle:stream:token',
      'subtitle:stream:token',
      'subtitle:stream:end',
    ])
    // Tokens carry the segId so overlapping segments cannot interleave
    expect(subtitle.send.mock.calls.filter((call) => call[0] === 'subtitle:stream:token').map((call) => call[1])).toEqual([
      { segId: 's1', token: 'xin ' },
      { segId: 's1', token: 'chao' },
    ])
  })

  it('sends an undefined segId in the token payload when none was supplied', async () => {
    mocks.getStoredApiKey.mockReturnValue('sk-test')
    mocks.streamTranslation.mockImplementation(async (...args: unknown[]) => {
      ;(args[args.length - 1] as (token: string) => void)('hi')
      return 'hi'
    })
    const { invokeHandlers, subtitle } = setup()
    await invokeHandlers['translate:live-stream'](mainEvent(), validParams)
    expect(subtitle.send).toHaveBeenCalledWith('subtitle:stream:token', { segId: undefined, token: 'hi' })
  })

  it('rejects live-stream calls from windows other than the main window', async () => {
    mocks.getStoredApiKey.mockReturnValue('sk-test')
    const { invokeHandlers, subtitle } = setup()
    for (const sender of [{ other: true }, subtitle.win.webContents]) {
      expect(await invokeHandlers['translate:live-stream']({ sender }, validParams)).toEqual({ success: false, error: 'Untrusted sender' })
    }
    expect(mocks.getStoredApiKey).not.toHaveBeenCalled()
    expect(mocks.streamTranslation).not.toHaveBeenCalled()
    expect(subtitle.send).not.toHaveBeenCalled()
  })

  it('does not send to a destroyed subtitle window', async () => {
    mocks.getStoredApiKey.mockReturnValue('sk-test')
    mocks.streamTranslation.mockResolvedValue('ok')
    const subtitle = makeWindow()
    subtitle.win.destroyed = true
    const { invokeHandlers } = setup({ subtitle })
    await invokeHandlers['translate:live-stream'](mainEvent(), validParams)
    expect(subtitle.send).not.toHaveBeenCalled()
  })

  it('returns success:false when the provider stream throws', async () => {
    mocks.getStoredApiKey.mockReturnValue('sk-test')
    mocks.streamTranslation.mockRejectedValue(new Error('upstream down'))
    const { invokeHandlers, subtitle } = setup()
    expect(await invokeHandlers['translate:live-stream'](mainEvent(), validParams)).toEqual({ success: false, error: 'upstream down' })
    expect(subtitle.send.mock.calls[subtitle.send.mock.calls.length - 1]?.[0]).toBe('subtitle:stream:end')
  })
})

describe('subtitle action forwarding', () => {
  it('forwards actions only when the sender is the subtitle window', () => {
    const { onHandlers, subtitle, main } = setup()

    onHandlers['subtitle:action:setModel']({ sender: { other: true } }, 'gpt-x')
    expect(main.send).not.toHaveBeenCalled()

    onHandlers['subtitle:action:setModel']({ sender: subtitle.win.webContents }, 'gpt-x')
    expect(main.send).toHaveBeenCalledWith('subtitle:action:setModel', 'gpt-x')
  })

  it('does not throw when the main window is destroyed', () => {
    const main = makeWindow()
    main.win.destroyed = true
    const { onHandlers, subtitle } = setup({ main })
    expect(() => onHandlers['subtitle:action:start']({ sender: subtitle.win.webContents })).not.toThrow()
    expect(main.send).not.toHaveBeenCalled()
  })

  it('subtitle:close only closes the window and does not emit subtitle:closed itself', () => {
    const { onHandlers, subtitle, main } = setup()

    onHandlers['subtitle:close']({ sender: { other: true } })
    expect(subtitle.win.close).not.toHaveBeenCalled()

    onHandlers['subtitle:close']({ sender: subtitle.win.webContents })
    expect(subtitle.win.close).toHaveBeenCalledTimes(1)
    expect(main.send).not.toHaveBeenCalled()
  })
})

describe('subtitle control channels', () => {
  const stylePayload = { textColor: '#fff', fontSize: 20, bgOpacity: 50 }
  const channels: Array<[string, unknown, string]> = [
    ['subtitle:update', { text: 'hi', isTranslating: false }, 'subtitle:text'],
    ['subtitle:setStyle', stylePayload, 'subtitle:style'],
    ['subtitle:setSourceText', { text: 'src', segId: 's1' }, 'subtitle:sourceText'],
    ['subtitle:setState', { isActive: true }, 'subtitle:state'],
  ]

  it.each(channels)('%s is forwarded for the main window only', async (channel, payload, outChannel) => {
    const { invokeHandlers, subtitle, main } = setup()

    await invokeHandlers[channel]({ sender: { other: true } }, payload)
    await invokeHandlers[channel]({ sender: subtitle.win.webContents }, payload)
    expect(subtitle.send).not.toHaveBeenCalled()

    await invokeHandlers[channel]({ sender: main.win.webContents }, payload)
    expect(subtitle.send).toHaveBeenCalledWith(outChannel, payload)
  })

  it('subtitle:show and subtitle:hide ignore untrusted senders', async () => {
    const createSubtitleWindow = vi.fn()
    const invokeHandlers: Record<string, Handler> = {}
    const ipc = { handle: (c: string, h: Handler) => { invokeHandlers[c] = h }, on: vi.fn() }
    const subtitle = makeWindow()
    const main = makeWindow()
    registerSubtitleHandlers(ipc as never, () => subtitle.win as never, () => main.win as never, createSubtitleWindow)

    await invokeHandlers['subtitle:show']({ sender: { other: true } })
    await invokeHandlers['subtitle:hide']({ sender: { other: true } })
    expect(subtitle.win.show).not.toHaveBeenCalled()
    expect(subtitle.win.close).not.toHaveBeenCalled()

    await invokeHandlers['subtitle:show']({ sender: main.win.webContents })
    expect(subtitle.win.show).toHaveBeenCalledTimes(1)
    await invokeHandlers['subtitle:hide']({ sender: main.win.webContents })
    expect(subtitle.win.close).toHaveBeenCalledTimes(1)
  })
})
