// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ IpcMain: class {} }))
vi.mock('../storage', () => ({ getStoredApiKey: vi.fn(() => 'test-key') }))

import { registerChatHandlers } from '../chat'
import { CHAT_IMAGE_EDIT_PROVIDERS, CHAT_IMAGE_GENERATE_PROVIDERS, generateChatImageWithGemini } from '../chatImageEdit'

type Handler = (event: unknown, params: unknown) => Promise<unknown>
const params = { provider: 'openai', model: 'gpt-image-1', prompt: 'A red apple', imageBase64: 'aGVsbG8=', imageMimeType: 'image/png' }
function setup() {
  const handlers: Record<string, Handler> = {}
  registerChatHandlers({ handle: (channel: string, handler: Handler) => { handlers[channel] = handler } } as never)
  const sender = Object.assign(new EventEmitter(), { id: 7 })
  return { handlers, sender, cancel: (id: string, owner = sender) => handlers['chat:stream:cancel']({ sender: owner }, { requestId: id }) }
}

describe('image request cancellation', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it.each(['generate', 'edit'] as const)('aborts %s at the provider, rejects duplicate IDs and preserves sender ownership', async (kind) => {
    const { handlers, sender, cancel } = setup()
    let signal: AbortSignal | undefined
    const pending = (value?: AbortSignal) => {
      signal = value
      return new Promise<never>((_resolve, reject) => value?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
    }
    const spy = kind === 'generate'
      ? vi.spyOn(CHAT_IMAGE_GENERATE_PROVIDERS, 'openai').mockImplementation((_key, _model, _prompt, value) => pending(value))
      : vi.spyOn(CHAT_IMAGE_EDIT_PROVIDERS, 'openai').mockImplementation((_key, _model, _prompt, _image, _mime, value) => pending(value))
    const requestId = `image-${kind}`
    const run = handlers[`chat:image-${kind}`]({ sender }, { ...params, requestId })
    await vi.waitFor(() => expect(signal).toBeDefined())
    await expect(handlers[`chat:image-${kind}`]({ sender }, { ...params, requestId })).resolves.toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
    await expect(cancel(requestId, Object.assign(new EventEmitter(), { id: 8 }))).resolves.toMatchObject({ success: false })
    expect(signal?.aborted).toBe(false)
    await expect(cancel(requestId)).resolves.toEqual({ success: true })
    await expect(run).resolves.toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(signal?.aborted).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(sender.listenerCount('destroyed')).toBe(0)
  })

  it('honors cancel-before-start without invoking the image provider', async () => {
    const { handlers, sender, cancel } = setup()
    const spy = vi.spyOn(CHAT_IMAGE_GENERATE_PROVIDERS, 'openai')
    await cancel('early-image')
    await expect(handlers['chat:image-generate']({ sender }, { ...params, requestId: 'early-image' })).resolves.toMatchObject({ errorCode: 'CANCELLED' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('aborts when the requesting renderer is destroyed and removes its listener', async () => {
    const { handlers, sender } = setup()
    let signal: AbortSignal | undefined
    vi.spyOn(CHAT_IMAGE_GENERATE_PROVIDERS, 'openai').mockImplementation((_key, _model, _prompt, value) => {
      signal = value
      return new Promise<never>((_resolve, reject) => value?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError'))))
    })
    const run = handlers['chat:image-generate']({ sender }, { ...params, requestId: 'destroyed-image' })
    await vi.waitFor(() => expect(signal).toBeDefined())
    sender.emit('destroyed')
    await expect(run).resolves.toMatchObject({ errorCode: 'CANCELLED' })
    expect(sender.listenerCount('destroyed')).toBe(0)
  })

  it('passes cancellation through to the Gemini HTTP request without falling back', async () => {
    let signal: AbortSignal | undefined
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      signal = options?.signal ?? undefined
      return new Promise<never>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError'))))
    })
    const controller = new AbortController()
    const run = generateChatImageWithGemini('test-key', 'gemini-2.5-flash-image', 'Apple', controller.signal)
    const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(signal).toBeDefined())
    controller.abort()
    await rejected
    expect(signal?.aborted).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
