// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOllamaProfileFetch } from '../ollamaProfileFetch'

const profile = { model: 'gemma3:4b', mode: 'hybrid' as const, numGpuLayers: 17, contextLength: 2048 }
afterEach(() => vi.unstubAllGlobals())
describe('configured Ollama transport', () => {
  it('leaves unconfigured clients on their original API', () => {
    expect(createOllamaProfileFetch('http://127.0.0.1:11434/v1')).toBeUndefined()
  })
  it('sends placement, text, inline images and output limits through the native API', async () => {
    const native = vi.fn().mockResolvedValue(Response.json({ model: profile.model, message: { content: 'answer' }, done: true, done_reason: 'length' }))
    vi.stubGlobal('fetch', native)
    const configured = createOllamaProfileFetch('http://127.0.0.1:11434/v1', profile)
    const response = await configured?.('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: profile.model, messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,YWJj' } }] }], max_tokens: 20 }),
    })
    expect(native.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat')
    expect(JSON.parse(native.mock.calls[0][1].body)).toMatchObject({ options: { num_gpu: 17, num_ctx: 2048, num_predict: 20 }, messages: [{ role: 'user', content: 'Describe', images: ['YWJj'] }] })
    expect(await response?.json()).toMatchObject({ choices: [{ message: { content: 'answer' }, finish_reason: 'length' }] })
  })
  it('converts split native chunks to SDK SSE without dropping the final chunk', async () => {
    const encoder = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) {
      c.enqueue(encoder.encode('{"message":{"content":"xin '))
      c.enqueue(encoder.encode('chào"}}\n{"done":true,"eval_count":2}'))
      c.close()
    } }))))
    const response = await createOllamaProfileFetch('http://127.0.0.1:11434/v1', profile)?.('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: profile.model, messages: [], stream: true }),
    })
    const text = await response?.text()
    expect(text).toContain('xin chào')
    expect(text).toContain('"finish_reason":"stop"')
    expect(text).toContain('data: [DONE]')
  })
  it('cancels the upstream reader when a streaming request is cancelled', async () => {
    const cancelled = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('{"message":{"content":"first"}}\n')) }, cancel: cancelled,
    }))))
    const response = await createOllamaProfileFetch('http://127.0.0.1:11434/v1', profile)?.('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: profile.model, messages: [], stream: true }),
    })
    await response?.body?.cancel()
    expect(cancelled).toHaveBeenCalled()
  })
  it('recovers HTTP and pre-output stream resets while preserving the requested profile', async () => {
    const error = 'Post "http://127.0.0.1:50101/tokenize": wsarecv: An existing connection was forcibly closed by the remote host.'
    const native = vi.fn()
      .mockResolvedValueOnce(Response.json({ error }, { status: 500 }))
      .mockResolvedValueOnce(new Response(`${JSON.stringify({ error })}\n`))
      .mockResolvedValueOnce(new Response('{"message":{"content":"only once"}}\n{"done":true}\n'))
    vi.stubGlobal('fetch', native)
    const response = await createOllamaProfileFetch('http://127.0.0.1:11434/v1', profile)?.('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: profile.model, messages: [], stream: true }),
    })
    const text = await response?.text()
    expect(text?.match(/only once/g)).toHaveLength(1)
    expect(native).toHaveBeenCalledTimes(3)
    expect(native.mock.calls.every(call => JSON.parse(call[1].body).options.num_gpu === 17)).toBe(true)
  })
  it('does not replay a stream after delivering any output', async () => {
    let readCount = 0
    const native = vi.fn().mockResolvedValue(new Response(new ReadableStream({ pull(c) {
      c.enqueue(new TextEncoder().encode(readCount++ === 0 ? '{"message":{"content":"already delivered"}}\n'
        : '{"error":"error reading llama-server response: read tcp 127.0.0.1:50101->127.0.0.1:50102: connection reset by peer"}\n'))
    } })))
    vi.stubGlobal('fetch', native)
    const response = await createOllamaProfileFetch('http://127.0.0.1:11434/v1', profile)?.('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: profile.model, messages: [], stream: true }),
    })
    const reader = response?.body?.getReader()
    expect(new TextDecoder().decode((await reader?.read())?.value)).toContain('already delivered')
    await expect(reader?.read()).rejects.toThrow('connection reset by peer')
    expect(native).toHaveBeenCalledTimes(1)
  })
})
