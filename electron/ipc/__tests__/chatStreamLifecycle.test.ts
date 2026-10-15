// @vitest-environment node
/**
 * Stream lifecycle tests for chat:stream / chat:stream:cancel:
 * cancel races, duplicate ids, sender ownership, destroyed senders and the
 * `usedModel` fallback signal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ IpcMain: class {} }))
vi.mock('../storage', () => ({ getStoredApiKey: vi.fn() }))

import { registerChatHandlers } from '../chat'
import { resetChatTokenResolverCache } from '../chatTokenResolver'
import { getStoredApiKey } from '../storage'

// biome-ignore lint/suspicious/noExplicitAny: test helper
type Handler = (event: unknown, ...args: unknown[]) => Promise<any>

interface FakeSender {
  id: number
  destroyed: boolean
  events: Array<Record<string, unknown>>
  listeners: Map<string, () => void>
  send: (channel: string, payload: Record<string, unknown>) => void
  isDestroyed: () => boolean
  once: (name: string, listener: () => void) => void
  removeListener: (name: string, listener: () => void) => void
}

function makeSender(id: number): FakeSender {
  const sender: FakeSender = {
    id,
    destroyed: false,
    events: [],
    listeners: new Map(),
    send: (_channel, payload) => {
      if (sender.destroyed) throw new Error('Object has been destroyed')
      sender.events.push(payload)
    },
    isDestroyed: () => sender.destroyed,
    once: (name, listener) => { sender.listeners.set(name, listener) },
    removeListener: (name) => { sender.listeners.delete(name) },
  }
  return sender
}

const textMsg = (text: string) => ({ role: 'user' as const, content: [{ type: 'text' as const, text }] })

function setup() {
  const handlers: Record<string, Handler> = {}
  registerChatHandlers({
    handle: (channel: string, handler: Handler) => { handlers[channel] = handler },
  } as never)
  return {
    stream: (sender: FakeSender, params: Record<string, unknown>) =>
      handlers['chat:stream']({ sender }, params),
    cancel: (sender: FakeSender, requestId: string) =>
      handlers['chat:stream:cancel']({ sender }, { requestId }),
  }
}

/** OpenAI SDK double whose stream yields tokens slowly and honours the abort signal. */
function mockOpenAI(options: {
  tokens?: string[]
  /** Delay before each token; keep it well above `vi.waitFor`'s 50ms poll when a test must act mid-stream. */
  tokenDelayMs?: number
  onCreate?: (params: { model: string }) => void
  failModels?: string[]
  models?: string[]
}) {
  const calls: string[] = []
  vi.doMock('openai', () => ({
    default: class {
      chat = {
        completions: {
          create: async (params: { model: string }, requestOptions?: { signal?: AbortSignal }) => {
            calls.push(params.model)
            options.onCreate?.(params)
            if (options.failModels?.includes(params.model)) {
              throw new Error('This is not a chat model and thus not supported in the v1/chat/completions endpoint.')
            }
            const tokens = options.tokens ?? ['a', 'b', 'c']
            return (async function* stream() {
              for (const token of tokens) {
                await new Promise((resolve) => setTimeout(resolve, options.tokenDelayMs ?? 5))
                if (requestOptions?.signal?.aborted) return
                yield { choices: [{ delta: { content: token } }] }
              }
            })()
          },
        },
      }
      models = { list: async () => ({ data: (options.models ?? []).map((id) => ({ id })) }) }
    },
  }))
  return calls
}

const baseParams = (requestId: string, extra: Record<string, unknown> = {}) => ({
  requestId,
  provider: 'openai',
  model: 'gpt-4o',
  messages: [textMsg('Hello')],
  ...extra,
})

describe('chat:stream lifecycle', () => {
  beforeEach(() => {
    vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
    resetChatTokenResolverCache()
  })

  afterEach(() => {
    vi.doUnmock('openai')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('honours a cancel that arrives before the stream starts', async () => {
    const calls = mockOpenAI({})
    const api = setup()
    const sender = makeSender(1)

    expect(await api.cancel(sender, 'early-1')).toEqual({ success: false, error: 'NOT_FOUND' })
    const result = await api.stream(sender, baseParams('early-1'))

    expect(result).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(calls).toEqual([])
    expect(sender.events[sender.events.length - 1]).toMatchObject({ type: 'error', errorCode: 'CANCELLED' })
  })

  it('cancels while the Gemini output-token metadata lookup is still pending', async () => {
    const providerCalls = mockOpenAI({})
    let fetchSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      fetchSignal = init?.signal
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })))
    const api = setup()
    const sender = makeSender(1)

    const pending = api.stream(sender, baseParams('slow-meta', {
      provider: 'gemini',
      model: 'gemini-slow-meta',
      maxOutputTokens: 'model-max',
    }))
    await vi.waitFor(() => expect(fetchSignal).toBeDefined())

    expect(await api.cancel(sender, 'slow-meta')).toEqual({ success: true })
    const result = await pending
    expect(result).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(providerCalls).toEqual([])
  })

  it('rejects a duplicate in-flight requestId without disturbing the first stream', async () => {
    mockOpenAI({ tokens: ['a', 'b', 'c', 'd'] })
    const api = setup()
    const sender = makeSender(1)

    const first = api.stream(sender, baseParams('dup-1'))
    const second = await api.stream(sender, baseParams('dup-1'))
    expect(second).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })

    const firstResult = await first
    expect(firstResult).toMatchObject({ success: true, reply: 'abcd' })
    // The rejected duplicate emitted nothing: exactly one start / end pair.
    expect(sender.events.filter((event) => event.type === 'start')).toHaveLength(1)
  })

  it('only lets the owning sender cancel a stream', async () => {
    mockOpenAI({ tokens: ['a', 'b', 'c', 'd'] })
    const api = setup()
    const owner = makeSender(1)
    const stranger = makeSender(2)

    const pending = api.stream(owner, baseParams('own-1'))
    await vi.waitFor(() => expect(owner.events.length).toBeGreaterThan(0))

    expect(await api.cancel(stranger, 'own-1')).toEqual({ success: false, error: 'NOT_FOUND' })
    expect(await api.cancel(owner, 'own-1')).toEqual({ success: true })
    expect(await pending).toMatchObject({ errorCode: 'CANCELLED' })
  })

  it('normalises (trims) the requestId in cancel, for both active and pending cancels', async () => {
    const calls = mockOpenAI({ tokens: ['a', 'b', 'c', 'd'] })
    const api = setup()
    const sender = makeSender(1)

    // Pending cancel: padded id arrives before the stream registered.
    expect(await api.cancel(sender, '  pad-early  ')).toEqual({ success: false, error: 'NOT_FOUND' })
    const early = await api.stream(sender, baseParams('pad-early'))
    expect(early).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(calls).toEqual([])

    // Active cancel: padded id finds the stream registered under the trimmed id.
    const pending = api.stream(sender, baseParams('  pad-live  '))
    await vi.waitFor(() => expect(sender.events.some((event) => event.requestId === 'pad-live')).toBe(true))
    expect(await api.cancel(sender, ' pad-live  ')).toEqual({ success: true })
    expect(await pending).toMatchObject({ errorCode: 'CANCELLED' })

    // Whitespace-only ids are rejected.
    expect(await api.cancel(sender, '   ')).toEqual({ success: false, error: 'INVALID_INPUT' })
  })

  it('stops the provider and never throws when the sender is destroyed mid-stream', async () => {
    // Slow tokens so the stream is still running when `waitFor` (50ms poll) sees the first one.
    mockOpenAI({ tokens: ['a', 'b', 'c', 'd', 'e', 'f'], tokenDelayMs: 60 })
    const api = setup()
    const sender = makeSender(1)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const pending = api.stream(sender, baseParams('destroyed-1'))
    await vi.waitFor(() => expect(sender.events.some((event) => event.type === 'token')).toBe(true))
    sender.destroyed = true

    const result = await pending
    expect(result).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(sender.events.some((event) => event.type === 'end')).toBe(false)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(sender.listeners.has('destroyed')).toBe(false)
  })

  it('aborts the stream when the sender emits "destroyed"', async () => {
    mockOpenAI({ tokens: ['a', 'b', 'c', 'd', 'e', 'f'] })
    const api = setup()
    const sender = makeSender(1)

    const pending = api.stream(sender, baseParams('destroyed-2'))
    await vi.waitFor(() => expect(sender.listeners.has('destroyed')).toBe(true))
    sender.listeners.get('destroyed')?.()

    expect(await pending).toMatchObject({ errorCode: 'CANCELLED' })
  })

  it('reports usedModel on the end event when OpenAI falls back to another model', async () => {
    mockOpenAI({ tokens: ['ok'], failModels: ['gpt-4o'], models: ['gpt-5'] })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const api = setup()
    const sender = makeSender(1)

    const result = await api.stream(sender, baseParams('fallback-1'))
    expect(result).toEqual({ success: true, reply: 'ok', usedModel: 'gpt-5' })
    expect(sender.events[sender.events.length - 1]).toEqual({ requestId: 'fallback-1', type: 'end', reply: 'ok', usedModel: 'gpt-5' })
  })

  it('does not include usedModel when no fallback happened', async () => {
    mockOpenAI({ tokens: ['ok'] })
    const api = setup()
    const sender = makeSender(1)

    const result = await api.stream(sender, baseParams('plain-1'))
    expect(result).toEqual({ success: true, reply: 'ok' })
  })
})
