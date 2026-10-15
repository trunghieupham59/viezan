import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatStreamEvent } from '../../types'
import { chatService } from '../chatService'

type StreamListener = (event: ChatStreamEvent) => void

const params = {
  provider: 'openai',
  model: 'gpt-4o',
  messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }],
}

function installApi(events: Array<Omit<ChatStreamEvent, 'requestId'>>, result: Record<string, unknown>) {
  let listener: StreamListener | undefined
  const api = {
    chat: vi.fn(async () => result),
    chatStream: vi.fn(async (request: { requestId: string }) => {
      for (const event of events) listener?.({ requestId: request.requestId, ...event })
      return result
    }),
    onChatStreamEvent: vi.fn((_requestId: string, cb: StreamListener) => {
      listener = cb
      return () => { listener = undefined }
    }),
    chatStreamCancel: vi.fn(),
  }
  ;(window as unknown as { api: unknown }).api = api
  return api
}

describe('chatService usedModel plumbing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('send() keeps usedModel from the IPC result', async () => {
    installApi([], { success: true, reply: 'ok', usedModel: 'gpt-4o-mini' })
    await expect(chatService.send(params)).resolves.toEqual({ success: true, reply: 'ok', usedModel: 'gpt-4o-mini' })
  })

  it('stream() passes usedModel to onEnd as a second argument', async () => {
    installApi(
      [
        { type: 'start' },
        { type: 'token', token: 'o' },
        { type: 'end', reply: 'ok', usedModel: 'gpt-4o-mini' },
      ],
      { success: true, reply: 'ok', usedModel: 'gpt-4o-mini' },
    )
    const onEnd = vi.fn()
    const result = await chatService.stream(params, { onEnd })
    expect(onEnd).toHaveBeenCalledWith('ok', { usedModel: 'gpt-4o-mini' })
    expect(result.usedModel).toBe('gpt-4o-mini')
  })

  it('stream() omits the meta argument when no fallback happened, keeping one-arg callers working', async () => {
    installApi([{ type: 'end', reply: 'plain' }], { success: true, reply: 'plain' })
    const onEnd = vi.fn()
    await chatService.stream(params, { onEnd })
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith('plain', undefined)
    const legacy = (reply: string) => reply
    await expect(chatService.stream(params, { onEnd: legacy })).resolves.toMatchObject({ reply: 'plain' })
  })

  it('stream() falls back to chat() (result keeps usedModel) when the streaming IPC is missing', async () => {
    const api = installApi([], { success: true, reply: 'ok', usedModel: 'm2' })
    delete (api as { chatStream?: unknown }).chatStream
    const result = await chatService.stream(params)
    expect(result.usedModel).toBe('m2')
    expect(api.chat).toHaveBeenCalledTimes(1)
  })
})
