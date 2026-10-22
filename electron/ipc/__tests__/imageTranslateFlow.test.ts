// @vitest-environment node
/**
 * image:translate flow: Gemini edit deadline / cancel semantics, response-part parsing, region
 * parsing and validation, and the opt-in cross-provider fallback. SDKs and fetch are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ IpcMain: class {} }))
vi.mock('../storage', () => ({ getStoredApiKey: vi.fn() }))

const geminiGenerate = vi.fn()
const claudeCreate = vi.fn()
const openAiCreate = vi.fn()
const openAiList = vi.fn()
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: geminiGenerate }
    }
  },
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: claudeCreate }
  },
}))
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openAiCreate } }
    models = { list: openAiList }
  },
}))

import {
  isVisionUnsupportedError,
  parseRegionsFromText,
  registerImageTranslateHandlers,
  resolveOpenAIVisionModel,
  runWithDeadline,
  sanitizeRegions,
  translateImageWithGeminiEdit,
} from '../imageTranslate'
import { CHAT_IMAGE_EDIT_TIMEOUT_MS } from '../ipcConstants'
import { getStoredApiKey } from '../storage'

const fetchMock = vi.fn()

const region = {
  x: 0.1, y: 0.2, width: 0.5, height: 0.1,
  originalText: 'Hello', translatedText: 'Xin chào', fontSize: 0.05, bgColor: '#112233', textColor: '#ffffff',
}

function geminiRegionsReply(text: string, finishReason = 'STOP') {
  return { response: { text: () => text, candidates: [{ finishReason }] } }
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

function editImageResponse(part: Record<string, unknown>) {
  return okJson({ candidates: [{ content: { parts: [{ text: 'done' }, part] } }] })
}

/** fetch that never resolves until its signal aborts. */
function hangingFetch(_url: string, init: RequestInit) {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))
    })
  })
}

let handlers: Record<string, (...args: unknown[]) => unknown>
const sent: Array<{ channel: string; payload: unknown }> = []

function invoke(channel: string, payload: unknown) {
  const event = {
    sender: {
      send: (eventChannel: string, data: unknown) => { sent.push({ channel: eventChannel, payload: data }) },
      isDestroyed: () => false,
    },
  }
  return handlers[channel](event, payload) as Promise<Record<string, unknown>>
}

const baseParams = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  imageBase64: 'aW1hZ2U=',
  imageMimeType: 'image/png',
  sourceLang: 'en',
  targetLang: 'vi',
}

beforeEach(() => {
  vi.clearAllMocks()
  sent.length = 0
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.mocked(getStoredApiKey).mockReturnValue('fake-key')
  handlers = {}
  registerImageTranslateHandlers({
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => { handlers[channel] = handler },
    // biome-ignore lint/suspicious/noExplicitAny: minimal IpcMain stand-in
  } as any)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('translateImageWithGeminiEdit', () => {
  it('reads camelCase inlineData and returns the reported MIME type', async () => {
    fetchMock.mockResolvedValue(editImageResponse({ inlineData: { mimeType: 'image/jpeg', data: 'RURJVEVE' } }))
    const result = await translateImageWithGeminiEdit('k', 'aW1n', 'image/png', 'en', 'vi')
    expect(result).toEqual({ imageBase64: 'RURJVEVE', mimeType: 'image/jpeg' })
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('k')
  })

  it('still accepts snake_case inline_data and falls back to the input MIME type', async () => {
    fetchMock.mockResolvedValue(editImageResponse({ inline_data: { data: 'RURJVEVE' } }))
    expect(await translateImageWithGeminiEdit('k', 'aW1n', 'image/webp', 'en', 'vi')).toEqual({
      imageBase64: 'RURJVEVE',
      mimeType: 'image/webp',
    })
  })

  it('ignores a reported MIME type outside the image allowlist', async () => {
    fetchMock.mockResolvedValue(editImageResponse({ inlineData: { mimeType: 'text/html', data: 'RURJVEVE' } }))
    expect((await translateImageWithGeminiEdit('k', 'aW1n', 'image/png', 'en', 'vi'))?.mimeType).toBe('image/png')
  })

  it('returns null when the model answers with text only', async () => {
    fetchMock.mockResolvedValue(okJson({ candidates: [{ content: { parts: [{ text: 'cannot do that' }] } }] }))
    expect(await translateImageWithGeminiEdit('k', 'aW1n', 'image/png', 'en', 'vi')).toBeNull()
  })

  it('uses the 180 s image-edit deadline, not the 5 s discovery timeout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(hangingFetch)
    const pending = translateImageWithGeminiEdit('k', 'aW1n', 'image/png', 'en', 'vi')
    const outcome = pending.then(() => 'resolved', (error: Error) => error)
    await vi.advanceTimersByTimeAsync(10_000)
    let settled = false
    outcome.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false) // still running well past 5 s
    await vi.advanceTimersByTimeAsync(CHAT_IMAGE_EDIT_TIMEOUT_MS)
    const error = await outcome
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('timed out')
    expect((error as Error).name).not.toBe('AbortError')
  })
})

describe('runWithDeadline', () => {
  it('a deadline is a plain timeout error, a parent abort stays an abort', async () => {
    vi.useFakeTimers()
    const timedOut = runWithDeadline(1_000, undefined, (signal) => new Promise((_r, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const timedOutAssertion = expect(timedOut).rejects.toThrow('timed out after 1s')
    await vi.advanceTimersByTimeAsync(1_001)
    await timedOutAssertion

    vi.useRealTimers()
    const parent = new AbortController()
    const cancelled = runWithDeadline(60_000, parent.signal, (signal) => new Promise((_r, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    parent.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('image:translate — Gemini edit semantics', () => {
  it('returns the edited image with its MIME type', async () => {
    fetchMock.mockResolvedValue(editImageResponse({ inlineData: { mimeType: 'image/webp', data: 'RURJVEVE' } }))
    const result = await invoke('image:translate', baseParams)
    expect(result).toEqual({ success: true, editedImageBase64: 'RURJVEVE', editedImageMimeType: 'image/webp', regions: [] })
  })

  it('an edit timeout falls through to the regions approach instead of reporting CANCELLED', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(hangingFetch)
    geminiGenerate.mockResolvedValue(geminiRegionsReply(JSON.stringify([region])))
    const pending = invoke('image:translate', { ...baseParams, requestId: 'img-timeout' })
    await vi.advanceTimersByTimeAsync(CHAT_IMAGE_EDIT_TIMEOUT_MS + 1)
    const result = await pending
    expect(result.errorCode).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.regions).toHaveLength(1)
    expect(geminiGenerate).toHaveBeenCalledTimes(1)
  })

  it('a caller cancel during the edit reports CANCELLED and does not start the fallback', async () => {
    fetchMock.mockImplementation(hangingFetch)
    const pending = invoke('image:translate', { ...baseParams, requestId: 'img-cancel' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(await invoke('image:translate:cancel', { requestId: 'img-cancel' })).toEqual({ success: true })
    expect(await pending).toMatchObject({ success: false, errorCode: 'CANCELLED' })
    expect(geminiGenerate).not.toHaveBeenCalled()
  })
})

describe('parseRegionsFromText', () => {
  it('parses a fenced JSON array and validates the fields', () => {
    const regions = parseRegionsFromText('gemini', `Here you go:\n\`\`\`json\n${JSON.stringify([region])}\n\`\`\``, false)
    expect(regions).toEqual([region])
  })

  it('skips non-JSON brackets in prose and takes the first valid array (not a greedy first-to-last match)', () => {
    const text = `[Note] reading order below ${JSON.stringify([region])} (see [1] and [2])`
    expect(parseRegionsFromText('claude', text, false)).toEqual([region])
  })

  it('handles brackets inside string values', () => {
    const tricky = { ...region, translatedText: 'giá [đặc biệt] ] ok' }
    expect(parseRegionsFromText('openai', JSON.stringify([tricky]), false)[0].translatedText).toBe('giá [đặc biệt] ] ok')
  })

  it('treats [] as "no text found" success', () => {
    expect(parseRegionsFromText('gemini', '[]', false)).toEqual([])
    expect(parseRegionsFromText('gemini', 'No text.\n[]', false)).toEqual([])
  })

  it('does not report truncation, garbage or empty output as "no text found"', () => {
    const truncatedJson = JSON.stringify([region, region]).slice(0, 120)
    expect(() => parseRegionsFromText('gemini', truncatedJson, false)).toThrowError(expect.objectContaining({ errorCode: 'OUTPUT_TRUNCATED' }))
    expect(() => parseRegionsFromText('gemini', JSON.stringify([region]), true)).toThrowError(expect.objectContaining({ errorCode: 'OUTPUT_TRUNCATED' }))
    expect(() => parseRegionsFromText('gemini', 'I could not read that image.', false)).toThrowError(expect.objectContaining({ errorCode: 'INVALID_RESPONSE' }))
    expect(() => parseRegionsFromText('gemini', '   ', false)).toThrowError(expect.objectContaining({ errorCode: 'EMPTY_RESPONSE' }))
    expect(() => parseRegionsFromText('gemini', '[{"foo": 1}]', false)).toThrowError(expect.objectContaining({ errorCode: 'INVALID_RESPONSE' }))
  })
})

describe('sanitizeRegions', () => {
  it('clamps numbers to 0..1 and keeps the box inside the image', () => {
    const [clamped] = sanitizeRegions([{ ...region, x: -0.5, y: 0.9, width: 1.0004, height: '0.5', fontSize: 9 }])
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(0.9)
    expect(clamped.width).toBe(1)
    expect(clamped.height).toBeCloseTo(0.1) // numeric strings accepted, then limited to the remaining 0.1
    expect(clamped.fontSize).toBe(1)
    const [wide] = sanitizeRegions([{ ...region, x: 0.5, width: 0.8 }])
    expect(wide.width).toBe(0.5) // a box may not extend past the image edge
  })

  it('drops boxes that collapse to zero size after clamping', () => {
    expect(sanitizeRegions([{ ...region, y: 1 }])).toEqual([]) // no room left below y = 1
    expect(sanitizeRegions([{ ...region, width: 0 }])).toEqual([])
  })

  it('reads a 0-100 answer as percentages instead of clamping it into a bogus box', () => {
    const regions = sanitizeRegions([
      { ...region, x: 10, y: 20, width: 50, height: 8 },
      { ...region, x: 0, y: 90, width: 100, height: 5 },
    ])
    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({ x: 0.1, y: 0.2, width: 0.5 })
    expect(regions[0].height).toBeCloseTo(0.08)
    // x = 0, width = 100 is a full-width strip, not an accidental "whole image" clamp artefact.
    expect(regions[1]).toMatchObject({ x: 0, width: 1 })
    expect(regions[1].y).toBeCloseTo(0.9)
  })

  it('treats pixel units (values above 100) as unusable instead of x = y = 1', () => {
    const pixels = [{ ...region, x: 120, y: 340, width: 800, height: 60 }]
    expect(sanitizeRegions(pixels)).toEqual([])
    expect(() => parseRegionsFromText('gemini', JSON.stringify(pixels), false))
      .toThrowError(expect.objectContaining({ errorCode: 'INVALID_RESPONSE' }))
  })

  it('keeps well-formed fractions when a single outlier box uses another unit', () => {
    const regions = sanitizeRegions([
      { ...region, x: 0.1, y: 0.1, width: 0.3, height: 0.1 },
      { ...region, x: 0.1, y: 0.3, width: 0.3, height: 0.1 },
      { ...region, x: 500, y: 0.5, width: 0.3, height: 0.1 }, // pixel garbage: dropped
      { ...region, x: 0.2, y: 0.5, width: 1.2, height: 0.1 }, // slight overshoot: clamped
    ])
    expect(regions).toHaveLength(3)
    expect(regions[0]).toMatchObject({ x: 0.1, width: 0.3 })
    expect(regions[2].x).toBe(0.2)
    expect(regions[2].width).toBeCloseTo(0.8)
  })

  it('drops entries with non-numeric geometry or without translated text', () => {
    expect(sanitizeRegions([
      { ...region, x: 'left' },
      { ...region, width: null },
      { ...region, translatedText: '' },
      { ...region, translatedText: 42 },
      'not an object',
      null,
    ])).toEqual([])
  })

  it('defaults invalid strings and colours', () => {
    const [cleaned] = sanitizeRegions([{ ...region, originalText: 7, bgColor: 'url(javascript:alert(1))', textColor: 'red', fontSize: 0 }])
    expect(cleaned.originalText).toBe('')
    expect(cleaned.bgColor).toBe('#ffffff')
    expect(cleaned.textColor).toBe('#000000')
    expect(cleaned.fontSize).toBe(0.04)
  })
})

describe('image:translate — provider output errors', () => {
  beforeEach(() => {
    // Gemini edit unavailable → regions approach.
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'not available', json: async () => ({}) })
  })

  it('returns OUTPUT_TRUNCATED rather than success with no regions', async () => {
    geminiGenerate.mockResolvedValue(geminiRegionsReply(JSON.stringify([region]), 'MAX_TOKENS'))
    expect(await invoke('image:translate', baseParams)).toMatchObject({ success: false, errorCode: 'OUTPUT_TRUNCATED' })
  })

  it('returns INVALID_RESPONSE for unparseable output', async () => {
    geminiGenerate.mockResolvedValue(geminiRegionsReply('sorry, no json'))
    expect(await invoke('image:translate', baseParams)).toMatchObject({ success: false, errorCode: 'INVALID_RESPONSE' })
  })

  it('keeps a genuine empty array as success with no regions', async () => {
    geminiGenerate.mockResolvedValue(geminiRegionsReply('[]'))
    expect(await invoke('image:translate', baseParams)).toEqual({ success: true, regions: [] })
  })

  it('applies the same checks to Claude and OpenAI', async () => {
    claudeCreate.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify([region]) }], stop_reason: 'max_tokens' })
    expect(await invoke('image:translate', { ...baseParams, provider: 'claude', model: 'claude-sonnet-4-5' }))
      .toMatchObject({ success: false, errorCode: 'OUTPUT_TRUNCATED' })
    openAiCreate.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: '' } }] })
    expect(await invoke('image:translate', { ...baseParams, provider: 'openai', model: 'gpt-4o' }))
      .toMatchObject({ success: false, errorCode: 'EMPTY_RESPONSE' })
  })
})

describe('isVisionUnsupportedError — narrowed', () => {
  it('still matches explicit vision-unsupported wordings', () => {
    expect(isVisionUnsupportedError('Image input modality is not enabled for this model')).toBe(true)
    expect(isVisionUnsupportedError('This model does not support image inputs')).toBe(true)
    expect(isVisionUnsupportedError('Vision not enabled for this endpoint')).toBe(true)
    expect(isVisionUnsupportedError('multimodal input is not available')).toBe(true)
  })

  it('no longer matches unrelated "not enabled" / "does not support" / "vision" errors', () => {
    expect(isVisionUnsupportedError('This feature is not enabled for your organization')).toBe(false)
    expect(isVisionUnsupportedError('The API does not support streaming for this model')).toBe(false)
    expect(isVisionUnsupportedError('Computer vision features are described in the docs')).toBe(false)
    expect(isVisionUnsupportedError('Developer instruction is not enabled for this model')).toBe(false)
  })
})

describe('image:translate — cross-provider fallback is opt-in', () => {
  const claudeParams = { ...baseParams, provider: 'claude', model: 'claude-3-haiku-20240307' }

  beforeEach(() => {
    claudeCreate.mockRejectedValue(new Error('400 Image input modality is not enabled for this model'))
    // Same-provider model discovery returns nothing, so only a cross-provider candidate remains.
    fetchMock.mockResolvedValue(okJson({ data: [] }))
    openAiList.mockResolvedValue({ data: [{ id: 'gpt-4o-mini' }] })
    openAiCreate.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify([region]) } }] })
  })

  it('by default never sends the image to another provider and says so', async () => {
    const result = await invoke('image:translate', claudeParams)
    expect(result).toMatchObject({ success: false, errorCode: 'NO_VISION' })
    expect(result.fallbackProviders).toEqual(expect.arrayContaining(['openai', 'gemini']))
    expect(String(result.error)).toContain('would receive your image')
    expect(openAiCreate).not.toHaveBeenCalled()
    expect(geminiGenerate).not.toHaveBeenCalled()
    expect(sent.filter((e) => e.channel === 'image:model-switched')).toEqual([])
  })

  it('falls back across providers only with allowProviderFallback: true', async () => {
    geminiGenerate.mockRejectedValue(new Error('no model'))
    const result = await invoke('image:translate', { ...claudeParams, allowProviderFallback: true })
    expect(result.success).toBe(true)
    expect(result.usedProvider).toBeDefined()
    expect(sent.some((e) => e.channel === 'image:model-switched')).toBe(true)
  })

  it('rejects a non-boolean allowProviderFallback flag', async () => {
    const result = await invoke('image:translate', { ...claudeParams, allowProviderFallback: 'yes' })
    expect(result).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
  })

  it('does not treat unrelated "not enabled" errors as a reason to fall back at all', async () => {
    claudeCreate.mockRejectedValue(new Error('This feature is not enabled for your organization'))
    const result = await invoke('image:translate', { ...claudeParams, allowProviderFallback: true })
    expect(result.success).toBe(false)
    expect(result.errorCode).not.toBe('NO_VISION')
    expect(openAiCreate).not.toHaveBeenCalled()
  })

  it('rejects "auto" as a target language', async () => {
    const result = await invoke('image:translate', { ...claudeParams, targetLang: 'auto' })
    expect(result).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' })
  })
})

describe('vision-unsupported detection and non-vision model remap', () => {
  it('recognises OpenAI image_url wording', () => {
    expect(isVisionUnsupportedError('400 Invalid content type. image_url is only supported by certain models.')).toBe(true)
    expect(isVisionUnsupportedError('image_url is not supported')).toBe(true)
    expect(isVisionUnsupportedError('This content type is only supported by certain models')).toBe(true)
    expect(isVisionUnsupportedError('429 You exceeded your current quota')).toBe(false)
  })

  it('remaps gpt-4-class and legacy ids that cannot read images, leaving vision models alone', () => {
    for (const id of ['gpt-4', 'gpt-4-0613', 'gpt-4-32k', 'gpt-4-turbo-preview', 'gpt-4-0125-preview', 'gpt-4-1106-preview', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0125', 'o1-mini', 'o1']) {
      expect(resolveOpenAIVisionModel(id)).toBe('gpt-4o')
    }
    for (const id of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4-turbo', 'gpt-4-turbo-2024-04-09', 'gpt-5-mini', 'gpt-4.1-mini']) {
      expect(resolveOpenAIVisionModel(id)).toBe(id)
    }
  })
})

describe('image:translate — OpenAI and Gemini request wiring', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'not available', json: async () => ({}) })
  })

  it('sends a vision model when a non-vision gpt-4-class model is selected', async () => {
    openAiCreate.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify([region]) } }] })
    const result = await invoke('image:translate', { ...baseParams, provider: 'openai', model: 'gpt-4-turbo-preview' })
    expect(result).toMatchObject({ success: true })
    expect(openAiCreate.mock.calls[0][0].model).toBe('gpt-4o')
  })

  it('falls back to another vision model on OpenAI image_url wording', async () => {
    openAiCreate
      .mockRejectedValueOnce(new Error('400 Invalid content type. image_url is only supported by certain models.'))
      .mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify([region]) } }] })
    openAiList.mockResolvedValue({ data: [{ id: 'gpt-4o-mini' }] })
    const result = await invoke('image:translate', { ...baseParams, provider: 'openai', model: 'gpt-4o-2024-05-13-unknown' })
    expect(result).toMatchObject({ success: true, usedModel: 'gpt-4o-mini', usedProvider: 'openai' })
  })

  it('passes the abort signal into Gemini generateContent', async () => {
    geminiGenerate.mockResolvedValue(geminiRegionsReply(JSON.stringify([region])))
    await invoke('image:translate', { ...baseParams, requestId: 'req-signal' })
    expect(geminiGenerate.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('maps provider safety blocks to BLOCKED_SAFETY and a Claude refusal to MODEL_REFUSAL', async () => {
    geminiGenerate.mockResolvedValue({ response: { text: () => '', candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] } })
    expect(await invoke('image:translate', baseParams)).toMatchObject({ success: false, errorCode: 'BLOCKED_SAFETY' })
    claudeCreate.mockResolvedValue({ content: [], stop_reason: 'refusal' })
    expect(await invoke('image:translate', { ...baseParams, provider: 'claude', model: 'claude-sonnet-4-5' }))
      .toMatchObject({ success: false, errorCode: 'MODEL_REFUSAL' })
    openAiCreate.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }] })
    expect(await invoke('image:translate', { ...baseParams, provider: 'openai', model: 'gpt-4o' }))
      .toMatchObject({ success: false, errorCode: 'BLOCKED_SAFETY' })
  })
})

describe('parseRegionsFromText — prose arrays', () => {
  it('skips prose such as "[1]" and finds the real region array', () => {
    const answer = `See note [1] below.\n${JSON.stringify([region])}`
    const regions = parseRegionsFromText('gemini', answer, false)
    expect(regions).toHaveLength(1)
    expect(regions[0].translatedText).toBe(region.translatedText)
  })

  it('skips numeric and string arrays and reports INVALID_RESPONSE when nothing region-like exists', () => {
    expect(() => parseRegionsFromText('gemini', 'Footnotes: [1] and [2, 3] and ["a"]', false))
      .toThrowError(expect.objectContaining({ errorCode: 'INVALID_RESPONSE' }))
  })

  it('still returns an explicit empty array after prose', () => {
    expect(parseRegionsFromText('gemini', 'No text found [see 1]: []', false)).toEqual([])
  })

  it('is not fooled by a prose array before a fenced answer', () => {
    const fenced = ['[1]', '```json', JSON.stringify([region]), '```'].join('\n')
    expect(parseRegionsFromText('claude', fenced, false)).toHaveLength(1)
  })
})
