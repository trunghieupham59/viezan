// @vitest-environment node
/**
 * Provider adapters: empty / truncated output must be an error, token budgets are clamped per
 * model family, and the abort signal reaches the SDK. SDKs are mocked — no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openAiCreate = vi.fn()
const openAiCtor = vi.fn()
const claudeCreate = vi.fn()
const claudeStream = vi.fn()
const claudeModelsList = vi.fn()
const claudeCtor = vi.fn()
const geminiGenerate = vi.fn()
const geminiGenerateStream = vi.fn()
const geminiModelParams = vi.fn()

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openAiCreate } }
    constructor(options: unknown) {
      openAiCtor(options)
    }
  },
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: claudeCreate, stream: claudeStream }
    models = { list: claudeModelsList }
    constructor(options: unknown) {
      claudeCtor(options)
    }
  },
}))
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(params: unknown) {
      geminiModelParams(params)
      return { generateContent: geminiGenerate, generateContentStream: geminiGenerateStream }
    }
  },
}))
const discoverLocalAiRuntimes = vi.fn()
vi.mock('../localAi', () => ({
  LOCAL_AI_PLACEHOLDER_KEY: 'local-key',
  isLocalProvider: (p: string) => p === 'local',
  discoverLocalAiRuntimes: (...a: unknown[]) => discoverLocalAiRuntimes(...a),
  resolveLocalAiRequestModel: vi.fn(async (model: string) => ({ baseURL: 'http://127.0.0.1:1/v1', model })),
}))

import { classifyProviderError } from '../errorUtils'
import { detectWithClaude, rewriteWithClaude, streamWithClaude, translateWithClaude, verifyClaudeKey } from '../translateProviderClaude'
import { detectWithGemini, rewriteWithGemini, streamWithGemini, translateWithGemini } from '../translateProviderGemini'
import { streamWithLocal, translateWithLocal, verifyLocalRuntime } from '../translateProviderLocal'
import { detectWithOpenAI, rewriteWithOpenAI, streamWithOpenAI, translateWithOpenAI, verifyOpenAIKey } from '../translateProviderOpenAI'
import { streamTranslation } from '../translateProviders'

const args = ['Hello', 'en', 'vi', false, 'general', false, 'off', 'auto'] as const

function openAiReply(content: string | null, finishReason: string | null = 'stop') {
  return { choices: [{ finish_reason: finishReason, message: { content } }] }
}
function claudeReply(content: Array<{ type: string; text?: string }>, stopReason = 'end_turn') {
  return { content, stop_reason: stopReason }
}
function geminiReply(text: string, finishReason = 'STOP') {
  return { response: { text: () => text, candidates: [{ finishReason }] } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dedicated live translation profiles', () => {
  it('uses deterministic local live decoding and keeps ordinary translation defaults', async () => {
    openAiCreate.mockResolvedValue(openAiReply('Xin chào'))
    await translateWithLocal('', 'gemma3:4b', ...args, { live: { context: '' } })
    expect(openAiCreate.mock.calls[0][0]).toMatchObject({ temperature: 0, max_tokens: 96 })
    expect(openAiCreate.mock.calls[0][0].messages[0].content).toContain('Translate English into Vietnamese.')
    expect(openAiCreate.mock.calls[0][0].messages[1].content).toBe('Hello')
    expect(openAiCreate.mock.calls[0][0].messages[1].content).not.toContain('Reference only:')
    await translateWithLocal('', 'gemma3:4b', ...args)
    expect(openAiCreate.mock.calls[1][0].temperature).toBeUndefined()
  })

  it('uses a short prompt, bounded output and actual OpenAI usage', async () => {
    openAiCreate.mockResolvedValue({ ...openAiReply('Xin chào'), usage: { prompt_tokens: 40, completion_tokens: 9, total_tokens: 49 } })
    const onUsage = vi.fn()
    await translateWithOpenAI('k', 'gpt-4o-mini', ...args, { live: { context: 'Greeting' }, onUsage })
    const body = openAiCreate.mock.calls[0][0]
    expect(body.max_completion_tokens).toBe(96)
    expect(body.messages[0].content.length + body.messages[1].content.length).toBeLessThan(500)
    expect(body.messages[1].content).not.toContain('Greeting')
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 40, outputTokens: 9, totalTokens: 49, estimated: false })
  })

  it('disables optional Claude thinking and Gemini Flash thinking for live output', async () => {
    claudeCreate.mockResolvedValue(claudeReply([{ type: 'text', text: 'Xin chào' }]))
    await translateWithClaude('k', 'claude-sonnet-4-6', ...args, { live: { context: '' } })
    expect(claudeCreate.mock.calls[0][0].thinking).toBeUndefined()
    expect(claudeCreate.mock.calls[0][0].max_tokens).toBe(96)
    geminiGenerate.mockResolvedValue({ response: { ...geminiReply('Xin chào').response, usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, totalTokenCount: 60 } } })
    const onUsage = vi.fn()
    await translateWithGemini('k', 'gemini-2.5-flash', ...args, { live: { context: '' }, onUsage })
    expect(geminiModelParams.mock.calls[0][0].generationConfig).toMatchObject({ thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 96 })
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 30, outputTokens: 30, totalTokens: 60, estimated: false })
  })

  it.each([
    ['claude-sonnet-5-5', 'between_tools'],
    ['claude-sonnet-5', 'disabled'],
  ])('keeps %s live requests within a text-only budget', async (model, type) => {
    claudeCreate.mockResolvedValue(claudeReply([{ type: 'text', text: 'こんにちは。' }]))
    await expect(translateWithClaude('k', model, ...args, { live: { context: '' } })).resolves.toBe('こんにちは。')
    expect(claudeCreate.mock.calls[0][0]).toMatchObject({ thinking: { type }, output_config: { effort: 'low' }, max_tokens: 96 })
    await translateWithClaude('k', model, ...args)
    expect(claudeCreate.mock.calls[1][0].thinking?.type).not.toBe(type)
  })

  it('separates Japanese live directions from speech in every provider request', async () => {
    const source = 'Hôm nay chúng ta kiểm tra giao diện phiên dịch song song.'
    const jaArgs = [source, 'vi', 'ja', false, 'general', false, 'off', 'auto'] as const
    const options = { live: { context: '' } }
    claudeCreate.mockResolvedValue(claudeReply([{ type: 'text', text: '今日は確認します。' }]))
    openAiCreate.mockResolvedValue(openAiReply('今日は確認します。'))
    geminiGenerate.mockResolvedValue(geminiReply('今日は確認します。'))
    await translateWithClaude('k', 'claude-sonnet-5-5', ...jaArgs, options)
    expect(claudeCreate.mock.calls[0][0].messages[0].content).toBe(source)
    expect(claudeCreate.mock.calls[0][0].system).toContain('Omit unnecessary pronouns.')
    await translateWithOpenAI('k', 'gpt-4o-mini', ...jaArgs, options)
    await translateWithLocal('', 'gemma3:4b', ...jaArgs, options)
    for (const [body] of openAiCreate.mock.calls) {
      expect(body.messages[1].content).toBe(source)
      expect(body.messages[0].content).toContain('Omit unnecessary pronouns.')
    }
    await translateWithGemini('k', 'gemini-2.5-flash', ...jaArgs, options)
    expect(geminiModelParams.mock.calls[0][0].systemInstruction).toContain('Omit unnecessary pronouns.')
    expect(geminiGenerate.mock.calls[0][0]).toBe(source)
  })

  it('never exposes structured Gemini thought parts even with the older SDK', async () => {
    geminiGenerate.mockResolvedValue({ response: {
      text: () => '思考中。こんにちは。',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: '思考中。' }, { text: 'こんにちは。' }] } }],
    } })
    await expect(translateWithGemini('k', 'gemini-3.1-flash-lite', ...args, { live: { context: '' } })).resolves.toBe('こんにちは。')
  })
})

describe('OpenAI provider', () => {
  it('returns trimmed text on success', async () => {
    openAiCreate.mockResolvedValue(openAiReply('  Xin chào  '))
    await expect(translateWithOpenAI('k', 'gpt-4o', ...args)).resolves.toBe('Xin chào')
  })

  it('treats empty / whitespace-only content as EMPTY_RESPONSE', async () => {
    for (const content of ['', '   \n', null]) {
      openAiCreate.mockResolvedValue(openAiReply(content))
      const error = await translateWithOpenAI('k', 'gpt-4o', ...args).catch((e) => e)
      expect(classifyProviderError(error).errorCode).toBe('EMPTY_RESPONSE')
    }
  })

  it('treats finish_reason "length" as OUTPUT_TRUNCATED even when text exists', async () => {
    openAiCreate.mockResolvedValue(openAiReply('half a transl', 'length'))
    const error = await translateWithOpenAI('k', 'gpt-4o', ...args).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('OUTPUT_TRUNCATED')
  })

  it('maps content_filter to the safety classification', async () => {
    openAiCreate.mockResolvedValue(openAiReply('', 'content_filter'))
    const error = await translateWithOpenAI('k', 'gpt-4o', ...args).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('BLOCKED_SAFETY')
  })

  it('clamps max_completion_tokens for legacy models only', async () => {
    openAiCreate.mockResolvedValue(openAiReply('ok'))
    await translateWithOpenAI('k', 'gpt-4', ...args)
    expect(openAiCreate.mock.calls[0][0].max_completion_tokens).toBe(4_096)
    await translateWithOpenAI('k', 'gpt-4o', ...args)
    expect(openAiCreate.mock.calls[1][0].max_completion_tokens).toBe(16_384)
    await rewriteWithOpenAI('k', 'gpt-3.5-turbo', 'text', 'en')
    expect(openAiCreate.mock.calls[2][0].max_completion_tokens).toBe(4_096)
  })

  it('forwards the abort signal to the SDK (translate and rewrite)', async () => {
    openAiCreate.mockResolvedValue(openAiReply('ok'))
    const { signal } = new AbortController()
    await translateWithOpenAI('k', 'gpt-4o', ...args, { signal })
    expect(openAiCreate.mock.calls[0][1]).toEqual({ signal })
    await rewriteWithOpenAI('k', 'gpt-4o', 'text', 'en', undefined, { signal })
    expect(openAiCreate.mock.calls[1][1]).toEqual({ signal })
  })

  it('gives language detection enough completion tokens for reasoning models', async () => {
    openAiCreate.mockResolvedValue(openAiReply('vi'))
    await expect(detectWithOpenAI('k', 'gpt-5-mini', 'prompt')).resolves.toBe('vi')
    expect(openAiCreate.mock.calls[0][0].max_completion_tokens).toBeGreaterThanOrEqual(64)
  })

  it('detect: empty answer is EMPTY_RESPONSE, not an empty string', async () => {
    openAiCreate.mockResolvedValue(openAiReply('', 'length'))
    const error = await detectWithOpenAI('k', 'gpt-5-mini', 'prompt').catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('EMPTY_RESPONSE')
  })
})

describe('Claude provider', () => {
  it('joins text blocks and skips thinking blocks', async () => {
    claudeCreate.mockResolvedValue(claudeReply([
      { type: 'thinking' },
      { type: 'text', text: 'Xin ' },
      { type: 'text', text: 'chào' },
    ]))
    await expect(translateWithClaude('k', 'claude-sonnet-4-6', ...args)).resolves.toBe('Xin chào')
  })

  it('treats stop_reason max_tokens as OUTPUT_TRUNCATED', async () => {
    claudeCreate.mockResolvedValue(claudeReply([{ type: 'text', text: 'partial' }], 'max_tokens'))
    const error = await translateWithClaude('k', 'claude-sonnet-4-6', ...args).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('OUTPUT_TRUNCATED')
  })

  it('treats a response without text as EMPTY_RESPONSE', async () => {
    claudeCreate.mockResolvedValue(claudeReply([]))
    let error = await translateWithClaude('k', 'claude-sonnet-4-6', ...args).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('EMPTY_RESPONSE')
    claudeCreate.mockResolvedValue(claudeReply([{ type: 'text', text: '  ' }]))
    error = await rewriteWithClaude('k', 'claude-sonnet-4-6', 'text', 'en').catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('EMPTY_RESPONSE')
  })

  it('clamps max_tokens for older Claude families', async () => {
    claudeCreate.mockResolvedValue(claudeReply([{ type: 'text', text: 'ok' }]))
    await translateWithClaude('k', 'claude-3-5-haiku-20241022', ...args)
    expect(claudeCreate.mock.calls[0][0].max_tokens).toBe(8_192)
    await translateWithClaude('k', 'claude-3-haiku-20240307', ...args)
    expect(claudeCreate.mock.calls[1][0].max_tokens).toBe(4_096)
    await translateWithClaude('k', 'claude-sonnet-4-20250514', ...args)
    expect(claudeCreate.mock.calls[2][0].max_tokens).toBe(16_000)
  })

  it('forwards the abort signal on rewrite and detect', async () => {
    claudeCreate.mockResolvedValue(claudeReply([{ type: 'text', text: 'vi' }]))
    const { signal } = new AbortController()
    await rewriteWithClaude('k', 'claude-sonnet-4-6', 'text', 'en', undefined, { signal })
    expect(claudeCreate.mock.calls[0][1]).toEqual({ signal })
    await detectWithClaude('k', 'claude-sonnet-4-6', 'prompt', { signal })
    expect(claudeCreate.mock.calls[1][1]).toEqual({ signal })
  })
})

describe('Gemini provider', () => {
  it('returns trimmed text and forwards the abort signal', async () => {
    geminiGenerate.mockResolvedValue(geminiReply('  Xin chào '))
    const { signal } = new AbortController()
    await expect(translateWithGemini('k', 'gemini-2.5-flash', ...args, { signal })).resolves.toBe('Xin chào')
    expect(geminiGenerate.mock.calls[0][1]).toEqual({ signal })
  })

  it('treats finishReason MAX_TOKENS as OUTPUT_TRUNCATED', async () => {
    geminiGenerate.mockResolvedValue(geminiReply('partial', 'MAX_TOKENS'))
    const error = await translateWithGemini('k', 'gemini-2.5-flash', ...args).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('OUTPUT_TRUNCATED')
  })

  it('treats empty text as EMPTY_RESPONSE on translate, rewrite and detect', async () => {
    geminiGenerate.mockResolvedValue(geminiReply('   '))
    for (const call of [
      () => translateWithGemini('k', 'gemini-2.5-flash', ...args),
      () => rewriteWithGemini('k', 'gemini-2.5-flash', 'text', 'en'),
      () => detectWithGemini('k', 'gemini-2.5-flash', 'prompt'),
    ]) {
      const error = await call().catch((e) => e)
      expect(classifyProviderError(error).errorCode).toBe('EMPTY_RESPONSE')
    }
  })

  it('lets a blocked-candidate error from text() propagate for classification', async () => {
    geminiGenerate.mockResolvedValue({
      response: {
        text: () => { throw new Error('Text not available. Response was blocked due to SAFETY') },
        candidates: [{ finishReason: 'SAFETY' }],
      },
    })
    const error = await translateWithGemini('k', 'gemini-2.5-flash', ...args).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('BLOCKED_SAFETY')
  })
})

describe('Local provider', () => {
  it('rejects empty and truncated completions', async () => {
    openAiCreate.mockResolvedValue(openAiReply(''))
    let error = await translateWithLocal('', 'local-auto', ...args).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('EMPTY_RESPONSE')
    openAiCreate.mockResolvedValue(openAiReply('cut', 'length'))
    error = await translateWithLocal('', 'local-auto', ...args).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('OUTPUT_TRUNCATED')
  })

  it('does not clamp tokens for local runtimes', async () => {
    openAiCreate.mockResolvedValue(openAiReply('ok'))
    await translateWithLocal('', 'gpt-4', ...args)
    expect(openAiCreate.mock.calls[0][0].max_tokens).toBe(16_384)
  })
})

describe('single retry layer: SDK clients are built with maxRetries 0', () => {
  it('OpenAI translate / rewrite / detect / verify', async () => {
    openAiCreate.mockResolvedValue(openAiReply('ok'))
    await translateWithOpenAI('k', 'gpt-4o', ...args)
    await rewriteWithOpenAI('k', 'gpt-4o', 'text', 'en')
    await detectWithOpenAI('k', 'gpt-4o', 'prompt')
    await verifyOpenAIKey('k')
    expect(openAiCtor).toHaveBeenCalledTimes(4)
    for (const [options] of openAiCtor.mock.calls) expect(options).toMatchObject({ apiKey: 'k', maxRetries: 0 })
  })

  it('Claude translate / rewrite / detect / verify', async () => {
    claudeCreate.mockResolvedValue(claudeReply([{ type: 'text', text: 'ok' }]))
    claudeModelsList.mockResolvedValue({ data: [] })
    await translateWithClaude('k', 'claude-sonnet-4-6', ...args)
    await rewriteWithClaude('k', 'claude-sonnet-4-6', 'text', 'en')
    await detectWithClaude('k', 'claude-sonnet-4-6', 'prompt')
    await verifyClaudeKey('k')
    expect(claudeCtor).toHaveBeenCalledTimes(4)
    for (const [options] of claudeCtor.mock.calls) expect(options).toMatchObject({ apiKey: 'k', maxRetries: 0 })
  })

  it('local OpenAI-compatible client', async () => {
    openAiCreate.mockResolvedValue(openAiReply('ok'))
    await translateWithLocal('', 'local-auto', ...args)
    expect(openAiCtor.mock.calls[0][0]).toMatchObject({ baseURL: 'http://127.0.0.1:1/v1', maxRetries: 0 })
  })
})

describe('safety refusals map to BLOCKED_SAFETY', () => {
  const code = (error: unknown) => classifyProviderError(error).errorCode

  it('Claude stop_reason "refusal" (translate, rewrite, detect)', async () => {
    claudeCreate.mockResolvedValue(claudeReply([], 'refusal'))
    expect(code(await translateWithClaude('k', 'claude-sonnet-4-6', ...args).catch((e) => e))).toBe('BLOCKED_SAFETY')
    expect(code(await rewriteWithClaude('k', 'claude-sonnet-4-6', 'text', 'en').catch((e) => e))).toBe('BLOCKED_SAFETY')
    expect(code(await detectWithClaude('k', 'claude-sonnet-4-6', 'prompt').catch((e) => e))).toBe('BLOCKED_SAFETY')
  })

  it('OpenAI message.refusal, with or without content', async () => {
    openAiCreate.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: "I can't help with that." } }] })
    expect(code(await translateWithOpenAI('k', 'gpt-4o', ...args).catch((e) => e))).toBe('BLOCKED_SAFETY')
    expect(code(await rewriteWithOpenAI('k', 'gpt-4o', 'text', 'en').catch((e) => e))).toBe('BLOCKED_SAFETY')
    expect(code(await translateWithLocal('', 'local-auto', ...args).catch((e) => e))).toBe('BLOCKED_SAFETY')
  })

  it('ignores an empty refusal field', async () => {
    openAiCreate.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: 'ok', refusal: null } }] })
    await expect(translateWithOpenAI('k', 'gpt-4o', ...args)).resolves.toBe('ok')
    openAiCreate.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: 'ok', refusal: '' } }] })
    await expect(translateWithOpenAI('k', 'gpt-4o', ...args)).resolves.toBe('ok')
  })

  it.each(['BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'SAFETY'])('Gemini finishReason %s with empty text', async (finishReason) => {
    geminiGenerate.mockResolvedValue(geminiReply('', finishReason))
    for (const call of [
      () => translateWithGemini('k', 'gemini-2.5-flash', ...args),
      () => rewriteWithGemini('k', 'gemini-2.5-flash', 'text', 'en'),
      () => detectWithGemini('k', 'gemini-2.5-flash', 'prompt'),
    ]) {
      expect(code(await call().catch((e) => e))).toBe('BLOCKED_SAFETY')
    }
  })

  it('Gemini promptFeedback.blockReason', async () => {
    geminiGenerate.mockResolvedValue({
      response: { text: () => '', candidates: undefined, promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } },
    })
    expect(code(await translateWithGemini('k', 'gemini-2.5-flash', ...args).catch((e) => e))).toBe('BLOCKED_SAFETY')
  })
})

describe('Gemini generation config', () => {
  it('sets an explicit maxOutputTokens for translate (large for 2.5+, legacy otherwise) and keeps thinking config', async () => {
    geminiGenerate.mockResolvedValue(geminiReply('ok'))
    await translateWithGemini('k', 'gemini-2.5-flash', ...args)
    expect(geminiModelParams.mock.calls[0][0].generationConfig).toEqual({ maxOutputTokens: 65_536 })
    await translateWithGemini('k', 'gemini-2.0-flash', ...args)
    expect(geminiModelParams.mock.calls[1][0].generationConfig).toEqual({ maxOutputTokens: 8_192 })
    const withEffort = ['Hello', 'en', 'vi', false, 'general', false, 'off', 'high'] as const
    await translateWithGemini('k', 'gemini-2.5-pro', ...withEffort)
    expect(geminiModelParams.mock.calls[2][0].generationConfig).toEqual({ maxOutputTokens: 65_536, thinkingConfig: { thinkingBudget: 24_576 } })
  })

  it('sets maxOutputTokens for rewrite as well', async () => {
    geminiGenerate.mockResolvedValue(geminiReply('ok'))
    await rewriteWithGemini('k', 'gemini-2.0-flash', 'text', 'en')
    expect(geminiModelParams.mock.calls[0][0].generationConfig).toEqual({ maxOutputTokens: 8_192 })
  })
})

async function* iterate<T>(items: T[]) {
  for (const item of items) yield item
}

describe('streaming providers', () => {
  it('OpenAI: forwards the signal, emits tokens and rejects a truncated or empty stream', async () => {
    const { signal } = new AbortController()
    const tokens: string[] = []
    openAiCreate.mockResolvedValue(iterate([
      { choices: [{ delta: { content: 'Xin ' } }] },
      { choices: [{ delta: { content: 'chào' }, finish_reason: 'stop' }] },
    ]))
    await expect(streamWithOpenAI('k', 'gpt-4o', 'prompt', (t) => tokens.push(t), { signal })).resolves.toBe('Xin chào')
    expect(tokens).toEqual(['Xin ', 'chào'])
    expect(openAiCreate.mock.calls[0][1]).toEqual({ signal })

    openAiCreate.mockResolvedValue(iterate([{ choices: [{ delta: { content: 'cut' }, finish_reason: 'length' }] }]))
    expect(classifyProviderError(await streamWithOpenAI('k', 'gpt-4o', 'p', () => {}).catch((e) => e)).errorCode).toBe('OUTPUT_TRUNCATED')
    openAiCreate.mockResolvedValue(iterate([{ choices: [{ delta: {}, finish_reason: 'stop' }] }]))
    expect(classifyProviderError(await streamWithOpenAI('k', 'gpt-4o', 'p', () => {}).catch((e) => e)).errorCode).toBe('EMPTY_RESPONSE')
    openAiCreate.mockResolvedValue(iterate([{ choices: [{ delta: {}, finish_reason: 'content_filter' }] }]))
    expect(classifyProviderError(await streamWithOpenAI('k', 'gpt-4o', 'p', () => {}).catch((e) => e)).errorCode).toBe('BLOCKED_SAFETY')
  })

  it('local: forwards the signal and rejects truncation', async () => {
    const { signal } = new AbortController()
    openAiCreate.mockResolvedValue(iterate([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]))
    await expect(streamWithLocal('', 'local-auto', 'prompt', () => {}, { signal })).resolves.toBe('ok')
    expect(openAiCreate.mock.calls[0][1]).toEqual({ signal })
    openAiCreate.mockResolvedValue(iterate([{ choices: [{ delta: { content: 'cut' }, finish_reason: 'length' }] }]))
    expect(classifyProviderError(await streamWithLocal('', 'local-auto', 'p', () => {}).catch((e) => e)).errorCode).toBe('OUTPUT_TRUNCATED')
  })

  it('Claude: forwards the signal and maps max_tokens / refusal', async () => {
    const { signal } = new AbortController()
    const delta = (text: string) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text } })
    const stop = (stop_reason: string) => ({ type: 'message_delta', delta: { stop_reason } })
    claudeStream.mockReturnValue(iterate([delta('Xin '), delta('chào'), stop('end_turn')]))
    await expect(streamWithClaude('k', 'claude-sonnet-4-6', 'prompt', () => {}, { signal })).resolves.toBe('Xin chào')
    expect(claudeStream.mock.calls[0][1]).toEqual({ signal })
    claudeStream.mockReturnValue(iterate([delta('cut'), stop('max_tokens')]))
    expect(classifyProviderError(await streamWithClaude('k', 'claude-sonnet-4-6', 'p', () => {}).catch((e) => e)).errorCode).toBe('OUTPUT_TRUNCATED')
    claudeStream.mockReturnValue(iterate([stop('refusal')]))
    expect(classifyProviderError(await streamWithClaude('k', 'claude-sonnet-4-6', 'p', () => {}).catch((e) => e)).errorCode).toBe('BLOCKED_SAFETY')
    claudeStream.mockReturnValue(iterate([stop('end_turn')]))
    expect(classifyProviderError(await streamWithClaude('k', 'claude-sonnet-4-6', 'p', () => {}).catch((e) => e)).errorCode).toBe('EMPTY_RESPONSE')
  })

  it('Gemini: forwards the signal and checks the final finishReason', async () => {
    const { signal } = new AbortController()
    const chunk = (text: string) => ({ text: () => text })
    geminiGenerateStream.mockResolvedValue({
      stream: iterate([chunk('Xin '), chunk('chào')]),
      response: Promise.resolve({ candidates: [{ finishReason: 'STOP' }] }),
    })
    await expect(streamWithGemini('k', 'gemini-2.5-flash', 'prompt', () => {}, { signal })).resolves.toBe('Xin chào')
    expect(geminiGenerateStream.mock.calls[0][1]).toEqual({ signal })
    geminiGenerateStream.mockResolvedValue({
      stream: iterate([chunk('cut')]),
      response: Promise.resolve({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
    })
    expect(classifyProviderError(await streamWithGemini('k', 'gemini-2.5-flash', 'p', () => {}).catch((e) => e)).errorCode).toBe('OUTPUT_TRUNCATED')
    geminiGenerateStream.mockResolvedValue({
      stream: iterate([chunk('')]),
      response: Promise.resolve({ candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] }),
    })
    expect(classifyProviderError(await streamWithGemini('k', 'gemini-2.5-flash', 'p', () => {}).catch((e) => e)).errorCode).toBe('BLOCKED_SAFETY')
  })
})

describe('streamTranslation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the original call signature and streams tokens', async () => {
    openAiCreate.mockResolvedValue(iterate([{ choices: [{ delta: { content: 'Hi' }, finish_reason: 'stop' }] }]))
    const tokens: string[] = []
    await expect(streamTranslation('openai', 'k', 'gpt-4o', 'Hello', 'en', 'vi', 'general', (t) => tokens.push(t))).resolves.toBe('Hi')
    expect(tokens).toEqual(['Hi'])
    expect(openAiCreate.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('aborts the stream when the caller signal fires', async () => {
    const controller = new AbortController()
    let requestSignal: AbortSignal | undefined
    openAiCreate.mockImplementation((_body: unknown, options: { signal: AbortSignal }) => {
      requestSignal = options.signal
      // Like the SDK: the pending request rejects with an AbortError once its signal fires.
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' })))
      })
    })
    const pending = streamTranslation('openai', 'k', 'gpt-4o', 'Hello', 'en', 'vi', 'general', () => {}, { signal: controller.signal })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()
    await assertion
    expect(requestSignal?.aborted).toBe(true)
  })

  it('times out a stalled stream and aborts the request', async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    openAiCreate.mockImplementation((_body: unknown, options: { signal: AbortSignal }) => {
      requestSignal = options.signal
      return new Promise(() => {})
    })
    const pending = streamTranslation('openai', 'k', 'gpt-4o', 'Hello', 'en', 'vi', 'general', () => {}, { timeoutMs: 2_000 })
    const assertion = expect(pending).rejects.toThrow(/timed out after 2s/)
    await vi.advanceTimersByTimeAsync(2_001)
    await assertion
    expect(requestSignal?.aborted).toBe(true)
  })

  it('surfaces a truncated stream as OUTPUT_TRUNCATED', async () => {
    openAiCreate.mockResolvedValue(iterate([{ choices: [{ delta: { content: 'cut' }, finish_reason: 'length' }] }]))
    const error = await streamTranslation('openai', 'k', 'gpt-4o', 'Hello', 'en', 'vi', 'general', () => {}).catch((e) => e)
    expect(classifyProviderError(error).errorCode).toBe('OUTPUT_TRUNCATED')
  })
})

describe('verifyLocalRuntime', () => {
  it('only checks discovery and never starts a runtime', async () => {
    discoverLocalAiRuntimes.mockResolvedValue({ available: true })
    await expect(verifyLocalRuntime('local-key')).resolves.toBeUndefined()
    expect(discoverLocalAiRuntimes).toHaveBeenCalledTimes(1)
    discoverLocalAiRuntimes.mockResolvedValue({ available: false, error: 'No local AI runtime found.' })
    await expect(verifyLocalRuntime('local-key')).rejects.toThrow('No local AI runtime found.')
  })
})
