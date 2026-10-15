// @vitest-environment node
/**
 * Provider-level tests (SDKs mocked) for Claude and Gemini chat behaviour.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ IpcMain: class {} }))

import { CHAT_STREAM_CANCELLED_MESSAGE } from '../providers/chatProviderTypes'

const messages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }]

afterEach(() => {
  vi.doUnmock('@anthropic-ai/sdk')
  vi.doUnmock('@google/generative-ai')
  vi.resetModules()
})

async function loadClaude(client: Record<string, unknown>) {
  vi.resetModules()
  vi.doMock('@anthropic-ai/sdk', () => ({
    default: class {
      messages = client
    },
  }))
  return await import('../providers/chatProviderClaude.js')
}

/** Claude client whose `stream().finalMessage()` resolves to `message`. */
function claudeClientReturning(message: unknown) {
  const create = vi.fn()
  const finalMessage = vi.fn(async () => message)
  const stream = vi.fn(() => ({ finalMessage }))
  return { create, stream, finalMessage }
}

describe('Claude provider', () => {
  it('picks the first text block even when a thinking block comes first', async () => {
    const client = claudeClientReturning({
      stop_reason: 'end_turn',
      content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: '  answer  ' }],
    })
    const { chatWithClaude } = await loadClaude(client)
    await expect(chatWithClaude('k', 'claude-sonnet-4-5', messages, undefined, 1_000)).resolves.toBe('answer')
    expect(client.stream).toHaveBeenCalledTimes(1)
  })

  it('throws a typed empty-response error (not a TypeError) when content is empty', async () => {
    const { chatWithClaude } = await loadClaude(claudeClientReturning({ stop_reason: 'max_tokens', content: [] }))
    await expect(chatWithClaude('k', 'claude-sonnet-4-5', messages, undefined, 1_000))
      .rejects.toThrow(/empty response \(stop_reason=max_tokens\)/)
  })

  it('reports an unexpected type when there is content but no text block', async () => {
    const { chatWithClaude } = await loadClaude(
      claudeClientReturning({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'x' }] }),
    )
    await expect(chatWithClaude('k', 'm', messages, undefined, 1_000)).rejects.toThrow(/Unexpected response type/)
  })

  it.each([1_000, 8_192, 16_000, 64_000])(
    'always streams (finalMessage) and never calls create(), even for max_tokens=%i',
    async (maxTokens) => {
      const client = claudeClientReturning({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'long' }] })
      const { chatWithClaude } = await loadClaude(client)
      await expect(chatWithClaude('k', 'claude-opus-4-1', messages, undefined, maxTokens)).resolves.toBe('long')
      expect(client.create).not.toHaveBeenCalled()
      expect(client.stream).toHaveBeenCalledTimes(1)
      const request = (client.stream.mock.calls[0] as unknown[])[0] as { max_tokens: number }
      expect(request.max_tokens).toBe(maxTokens)
    },
  )

  it('aborts the SDK stream when onToken throws', async () => {
    const abort = vi.fn()
    const stream = vi.fn(() => ({
      controller: { abort },
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'b' } }
      },
    }))
    const { streamChatWithClaude } = await loadClaude({ stream })

    await expect(streamChatWithClaude('k', 'm', messages, undefined, 100, () => {
      throw new Error('renderer gone')
    })).rejects.toThrow('renderer gone')
    expect(abort).toHaveBeenCalledTimes(1)
  })
})

describe('Gemini provider cancellation', () => {
  function mockGemini(sendMessageStream: ReturnType<typeof vi.fn>) {
    vi.resetModules()
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return { startChat: () => ({ sendMessageStream }) }
        }
      },
    }))
    return import('../providers/chatProviderGemini.js')
  }

  it('forwards the abort signal to sendMessageStream', async () => {
    const sendMessageStream = vi.fn(async () => ({
      stream: (async function* () {
        yield { candidates: [], text: () => 'hello' }
      })(),
      response: Promise.resolve({ candidates: [], text: () => 'hello' }),
    }))
    const { streamChatWithGemini } = await mockGemini(sendMessageStream)
    const controller = new AbortController()

    await expect(streamChatWithGemini('k', 'gemini-2.5-flash', messages, undefined, 100, () => {}, controller.signal))
      .resolves.toBe('hello')
    expect(sendMessageStream).toHaveBeenCalledWith(expect.anything(), { signal: controller.signal })
  })

  it('stops reading and raises the cancel sentinel when aborted mid-stream', async () => {
    const controller = new AbortController()
    const tokens: string[] = []
    const sendMessageStream = vi.fn(async () => ({
      stream: (async function* () {
        yield { candidates: [], text: () => 'a' }
        controller.abort()
        yield { candidates: [], text: () => 'b' }
      })(),
      response: Promise.resolve({ candidates: [], text: () => 'ab' }),
    }))
    const { streamChatWithGemini } = await mockGemini(sendMessageStream)

    await expect(streamChatWithGemini('k', 'gemini-2.5-flash', messages, undefined, 100, (t) => tokens.push(t), controller.signal))
      .rejects.toThrow(CHAT_STREAM_CANCELLED_MESSAGE)
    expect(tokens).toEqual(['a'])
  })

  it('does not call the SDK when already aborted', async () => {
    const sendMessageStream = vi.fn()
    const { streamChatWithGemini } = await mockGemini(sendMessageStream)
    const controller = new AbortController()
    controller.abort()
    await expect(streamChatWithGemini('k', 'm', messages, undefined, 100, () => {}, controller.signal))
      .rejects.toThrow(CHAT_STREAM_CANCELLED_MESSAGE)
    expect(sendMessageStream).not.toHaveBeenCalled()
  })
})
