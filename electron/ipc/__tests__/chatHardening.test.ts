// @vitest-environment node
/**
 * Hardening tests for chat payload validation, abort detection, token limits
 * and the image-edit / image-generate helpers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ IpcMain: class {} }))

import {
  convertRemoteImageUrlToBase64,
  editChatImageWithGemini,
  MAX_REMOTE_IMAGE_BYTES,
  parseChatImageEditParams,
  parseChatImageGenerateParams,
  shouldTryNextGeminiImageModel,
  sniffImageMimeType,
} from '../chatImageEdit'
import { getCurrentFamilyModelMaxOutputTokens, resetChatTokenResolverCache, resolveModelMaxOutputTokens } from '../chatTokenResolver'
import { isValidBase64Payload, parseChatParams } from '../chatValidation'
import { GEMINI_IMAGE_EDIT_MODELS, MAX_CHAT_PAYLOAD_BYTES } from '../ipcConstants'
import { CHAT_STREAM_CANCELLED_MESSAGE, isAbortError } from '../providers/chatProviderTypes'

const text = (role: 'user' | 'assistant', value?: string) => ({
  role,
  content: value === undefined ? [] : [{ type: 'text', text: value }],
})

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isAbortError', () => {
  it('trusts the signal, the sentinel messages and AbortError names only', () => {
    const controller = new AbortController()
    controller.abort()
    expect(isAbortError(new Error('anything'), controller.signal)).toBe(true)
    expect(isAbortError(new Error(CHAT_STREAM_CANCELLED_MESSAGE))).toBe(true)
    expect(isAbortError(new Error('translate-cancelled'))).toBe(true)
    expect(isAbortError(new Error('image-translate-cancelled'))).toBe(true)
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isAbortError(Object.assign(new Error('x'), { code: 'ABORT_ERR' }))).toBe(true)
  })

  it('recognises the SDK APIUserAbortError by constructor name and exact message (name stays "Error")', () => {
    class APIUserAbortError extends Error {
      constructor() {
        super('Request was aborted.')
      }
    }
    const sdkError = new APIUserAbortError()
    expect(sdkError.name).toBe('Error')
    expect(isAbortError(sdkError)).toBe(true)
    expect(isAbortError(new Error('Request was aborted.'))).toBe(true)
    expect(isAbortError(Object.assign(new Error('x'), { name: 'APIUserAbortError' }))).toBe(true)
    // Near-misses stay real failures.
    expect(isAbortError(new Error('Request was aborted. Retrying later'))).toBe(false)
    expect(isAbortError(new Error('request was aborted'))).toBe(false)
    expect(isAbortError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(false)
  })

  it('does not treat free-text or connection resets as cancellation', () => {
    expect(isAbortError(new Error('Request aborted by upstream'))).toBe(false)
    expect(isAbortError(new Error('Subscription cancelled: billing issue'))).toBe(false)
    expect(isAbortError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError('aborted')).toBe(false)
    expect(isAbortError(new Error('boom'), new AbortController().signal)).toBe(false)
  })
})

describe('parseChatParams normalization', () => {
  const base = { provider: 'gemini', model: 'gemini-2.5-flash' }

  it('drops empty messages so a cancelled assistant bubble cannot poison the next request', () => {
    const parsed = parseChatParams({
      ...base,
      messages: [text('user', 'first'), text('assistant', ''), text('user', 'second')],
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // The empty assistant turn is dropped and the adjacent user turns are merged in order.
    expect(parsed.value.messages).toHaveLength(1)
    expect(parsed.value.messages[0].role).toBe('user')
    expect(parsed.value.messages[0].content.map((c) => c.text)).toEqual(['first', 'second'])
  })

  it('applies the 3000-char cap to the merged turn, not to each pre-merge piece', () => {
    const half = 'x'.repeat(2_000)
    const tooLong = parseChatParams({
      ...base,
      messages: [text('user', half), text('assistant', ''), text('user', half)],
    })
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(tooLong.response.error).toContain('Message too long (4000 chars)')

    const fits = parseChatParams({
      ...base,
      messages: [text('user', 'x'.repeat(1_500)), text('assistant', ''), text('user', 'x'.repeat(1_500))],
    })
    expect(fits.ok).toBe(true)

    const bypass = parseChatParams({
      ...base,
      bypassLengthCheck: true,
      messages: [text('user', half), text('assistant', ''), text('user', half)],
    })
    expect(bypass.ok).toBe(true)
  })

  it('rejects requests with no usable user message', () => {
    for (const messages of [
      [text('user', '   ')],
      [text('user'), text('assistant', 'hi')],
      [text('assistant', 'only assistant')],
    ]) {
      const parsed = parseChatParams({ ...base, messages })
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.response.errorCode).toBe('INVALID_INPUT')
    }
  })

  it('starts and ends the history with a user turn without reordering real content', () => {
    const parsed = parseChatParams({
      ...base,
      messages: [
        text('assistant', 'stale greeting'),
        text('user', 'q1'),
        text('assistant', 'a1'),
        text('user', 'q2'),
        text('assistant', 'trailing'),
      ],
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.messages.map((m) => [m.role, m.content[0].text])).toEqual([
      ['user', 'q1'],
      ['assistant', 'a1'],
      ['user', 'q2'],
    ])
  })

  it('validates image base64 for chat messages', () => {
    const bad = parseChatParams({
      ...base,
      messages: [{ role: 'user', content: [{ type: 'image', imageBase64: 'not base64!!', imageMimeType: 'image/png' }] }],
    })
    expect(bad.ok).toBe(false)
    const good = parseChatParams({
      ...base,
      messages: [{ role: 'user', content: [{ type: 'image', imageBase64: 'aGVsbG8=', imageMimeType: 'image/png' }] }],
    })
    expect(good.ok).toBe(true)
  })

  it('isValidBase64Payload rejects data URIs and whitespace', () => {
    expect(isValidBase64Payload('aGVsbG8=')).toBe(true)
    expect(isValidBase64Payload('data:image/png;base64,aGVsbG8=')).toBe(false)
    expect(isValidBase64Payload('aGVs bG8=')).toBe(false)
    expect(isValidBase64Payload('')).toBe(false)
  })
})

describe('parseChatImageEditParams', () => {
  const valid = { provider: 'gemini', model: 'm', prompt: 'make it blue', imageBase64: 'aGVsbG8=', imageMimeType: 'image/png' }

  it('accepts a valid payload', () => {
    expect(parseChatImageEditParams(valid).ok).toBe(true)
  })

  it('rejects oversized payloads with PAYLOAD_TOO_LARGE', () => {
    const parsed = parseChatImageEditParams({ ...valid, imageBase64: 'A'.repeat(MAX_CHAT_PAYLOAD_BYTES + 4) })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.response.errorCode).toBe('PAYLOAD_TOO_LARGE')
  })

  it('rejects invalid base64, unsupported MIME types and overlong prompts/models', () => {
    for (const patch of [
      { imageBase64: 'not*base64' },
      { imageMimeType: 'image/svg+xml' },
      { prompt: 'x'.repeat(5_000) },
      { model: 'm'.repeat(500) },
    ]) {
      const parsed = parseChatImageEditParams({ ...valid, ...patch })
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.response.errorCode).toBe('INVALID_INPUT')
    }
  })
})

describe('parseChatImageGenerateParams', () => {
  it('requires provider/model/prompt and caps lengths', () => {
    expect(parseChatImageGenerateParams({ provider: 'openai', model: 'm', prompt: 'a cat' }).ok).toBe(true)
    expect(parseChatImageGenerateParams(null).ok).toBe(false)
    expect(parseChatImageGenerateParams({ provider: 'openai', model: 'm' }).ok).toBe(false)
    expect(parseChatImageGenerateParams({ provider: 'openai', model: 'm'.repeat(500), prompt: 'a' }).ok).toBe(false)
    expect(parseChatImageGenerateParams({ provider: 'openai', model: 'm', prompt: 'p'.repeat(5_000) }).ok).toBe(false)
  })
})

describe('remote image download', () => {
  const stubFetch = (response: Response) => {
    const fetchMock = vi.fn(async () => response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('downloads an https image, sniffs the real type and passes a timeout signal', async () => {
    const fetchMock = stubFetch(new Response(PNG_BYTES, { headers: { 'content-type': 'image/jpeg' } }))
    const result = await convertRemoteImageUrlToBase64('https://cdn.example.com/a.png')
    expect(result.imageMimeType).toBe('image/png')
    expect(Buffer.from(result.imageBase64, 'base64')).toEqual(Buffer.from(PNG_BYTES))
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { signal?: AbortSignal }
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects non-https URLs before fetching', async () => {
    const fetchMock = stubFetch(new Response(PNG_BYTES))
    await expect(convertRemoteImageUrlToBase64('http://cdn.example.com/a.png')).rejects.toThrow(/https/)
    await expect(convertRemoteImageUrlToBase64('file:///etc/passwd')).rejects.toThrow(/https/)
    await expect(convertRemoteImageUrlToBase64('not a url')).rejects.toThrow(/https/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects non-image content types and bodies that fail magic-byte sniffing', async () => {
    stubFetch(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }))
    await expect(convertRemoteImageUrlToBase64('https://x.example/a')).rejects.toThrow(/supported image/)

    stubFetch(new Response('<html></html>', { headers: { 'content-type': 'image/png' } }))
    await expect(convertRemoteImageUrlToBase64('https://x.example/a')).rejects.toThrow(/supported image/)
  })

  it('rejects images over the size cap (declared and streamed)', async () => {
    stubFetch(new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png', 'content-length': String(MAX_REMOTE_IMAGE_BYTES + 1) },
    }))
    await expect(convertRemoteImageUrlToBase64('https://x.example/a')).rejects.toThrow(/larger than/)

    const big = new Uint8Array(MAX_REMOTE_IMAGE_BYTES + 10)
    big.set(PNG_BYTES)
    stubFetch(new Response(big, { headers: { 'content-type': 'image/png' } }))
    await expect(convertRemoteImageUrlToBase64('https://x.example/a')).rejects.toThrow(/larger than/)
  })

  it('accepts generic octet-stream content types when the bytes are an image', async () => {
    stubFetch(new Response(PNG_BYTES, { headers: { 'content-type': 'application/octet-stream' } }))
    await expect(convertRemoteImageUrlToBase64('https://x.example/a')).resolves.toMatchObject({ imageMimeType: 'image/png' })

    stubFetch(new Response(PNG_BYTES, { headers: { 'content-type': 'binary/octet-stream; charset=x' } }))
    await expect(convertRemoteImageUrlToBase64('https://x.example/a')).resolves.toMatchObject({ imageMimeType: 'image/png' })

    // Octet-stream with non-image bytes is still rejected; so are unrelated types.
    stubFetch(new Response('<html></html>', { headers: { 'content-type': 'application/octet-stream' } }))
    await expect(convertRemoteImageUrlToBase64('https://x.example/a')).rejects.toThrow(/supported image/)
    stubFetch(new Response(PNG_BYTES, { headers: { 'content-type': 'application/json' } }))
    await expect(convertRemoteImageUrlToBase64('https://x.example/a')).rejects.toThrow(/supported image/)
  })

  it('follows at most 3 redirects manually and requires https on every hop', async () => {
    const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })
    const png = () => new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' } })

    const ok = vi.fn()
      .mockResolvedValueOnce(redirect('/b.png'))
      .mockResolvedValueOnce(redirect('https://cdn2.example/c.png'))
      .mockResolvedValueOnce(png())
    vi.stubGlobal('fetch', ok)
    await expect(convertRemoteImageUrlToBase64('https://cdn.example/a.png')).resolves.toMatchObject({ imageMimeType: 'image/png' })
    expect(ok).toHaveBeenCalledTimes(3)
    expect(String(ok.mock.calls[1][0])).toBe('https://cdn.example/b.png')
    for (const call of ok.mock.calls) expect((call[1] as { redirect?: string }).redirect).toBe('manual')

    const downgrade = vi.fn().mockResolvedValueOnce(redirect('http://evil.example/a.png'))
    vi.stubGlobal('fetch', downgrade)
    await expect(convertRemoteImageUrlToBase64('https://cdn.example/a.png')).rejects.toThrow(/https/)
    expect(downgrade).toHaveBeenCalledTimes(1)

    const otherScheme = vi.fn().mockResolvedValueOnce(redirect('file:///etc/passwd'))
    vi.stubGlobal('fetch', otherScheme)
    await expect(convertRemoteImageUrlToBase64('https://cdn.example/a.png')).rejects.toThrow(/https/)

    const loop = vi.fn(async () => redirect('https://cdn.example/loop'))
    vi.stubGlobal('fetch', loop)
    await expect(convertRemoteImageUrlToBase64('https://cdn.example/a.png')).rejects.toThrow(/302/)
    expect(loop).toHaveBeenCalledTimes(4)

    const noLocation = vi.fn(async () => new Response(null, { status: 301 }))
    vi.stubGlobal('fetch', noLocation)
    await expect(convertRemoteImageUrlToBase64('https://cdn.example/a.png')).rejects.toThrow(/301/)
  })

  it('sniffs AVIF and HEIC containers', () => {
    const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`), Buffer.alloc(8)])
    expect(sniffImageMimeType(ftyp('avif'))).toBe('image/avif')
    expect(sniffImageMimeType(ftyp('avis'))).toBe('image/avif')
    expect(sniffImageMimeType(ftyp('heic'))).toBe('image/heic')
    expect(sniffImageMimeType(ftyp('mif1'))).toBe('image/heic')
    expect(sniffImageMimeType(ftyp('mp42'))).toBeNull()
    expect(sniffImageMimeType(ftyp('isom'))).toBeNull()
  })

  it('sniffImageMimeType recognises supported formats only', () => {
    expect(sniffImageMimeType(PNG_BYTES)).toBe('image/png')
    expect(sniffImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageMimeType(Buffer.from('GIF89a'))).toBe('image/gif')
    expect(sniffImageMimeType(Buffer.from('RIFF\0\0\0\0WEBP'))).toBe('image/webp')
    expect(sniffImageMimeType(Buffer.from('<svg></svg>'))).toBeNull()
  })
})

describe('Gemini image model fallback', () => {
  const okImage = {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] }),
  }

  it('does not retry the next model when returned content text merely mentions "not found"', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'The object was not found in the image 404' }] } }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')).rejects.toThrow(/no edited image|returned text/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on structured 404 and unsupported-model 400 responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'gone' })
      .mockResolvedValueOnce(okImage)
    vi.stubGlobal('fetch', fetchMock)
    const result = await editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')
    expect(result.imageBase64).toBe('AAAA')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const unsupported400 = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Model is not supported for this request' })
      .mockResolvedValueOnce(okImage)
    vi.stubGlobal('fetch', unsupported400)
    await editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')
    expect(unsupported400).toHaveBeenCalledTimes(2)

    const plain400 = vi.fn(async () => ({ ok: false, status: 400, text: async () => 'Invalid image payload' }))
    vi.stubGlobal('fetch', plain400)
    await expect(editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')).rejects.toThrow(/400/)
    expect(plain400).toHaveBeenCalledTimes(1)
  })

  it.each([403, 500, 503])('falls through to the next model on HTTP %i', async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status, text: async () => 'model not enabled / unavailable' })
      .mockResolvedValueOnce(okImage)
    vi.stubGlobal('fetch', fetchMock)
    const result = await editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')
    expect(result.imageBase64).toBe('AAAA')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never falls through on auth failures (401) and stops after the last model', async () => {
    const unauthorized = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'bad key' }))
    vi.stubGlobal('fetch', unauthorized)
    await expect(editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')).rejects.toThrow(/401/)
    expect(unauthorized).toHaveBeenCalledTimes(1)

    const alwaysDown = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'down' }))
    vi.stubGlobal('fetch', alwaysDown)
    await expect(editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')).rejects.toThrow(/503/)
    expect(alwaysDown).toHaveBeenCalledTimes(GEMINI_IMAGE_EDIT_MODELS.length)
  })

  it('tries the next model after a 429 at most once (does not burn the whole ladder)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'quota' })
      .mockResolvedValueOnce(okImage)
    vi.stubGlobal('fetch', fetchMock)
    await expect(editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')).resolves.toMatchObject({ imageBase64: 'AAAA' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const limited = vi.fn(async () => ({ ok: false, status: 429, text: async () => 'quota' }))
    vi.stubGlobal('fetch', limited)
    await expect(editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')).rejects.toThrow(/429/)
    expect(limited.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('falls through when a model returns neither an image nor any text', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ content: { parts: [] } }] }) })
      .mockResolvedValueOnce(okImage)
    vi.stubGlobal('fetch', fetchMock)
    await expect(editChatImageWithGemini('k', 'm', 'edit', 'aGVsbG8=', 'image/png')).resolves.toMatchObject({ imageBase64: 'AAAA' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('plain Errors never trigger a model switch', () => {
    expect(shouldTryNextGeminiImageModel(new Error('Gemini image edit failed: 404 not found'))).toBe(false)
  })
})

describe('model output token rules', () => {
  it('applies conservative caps to older families and keeps defaults for unknown ones', () => {
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-3-5-haiku-20241022')).toBe(8_192)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-3-haiku-20240307')).toBe(4_096)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-3-5-sonnet-20241022')).toBe(8_192)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-3-5-sonnet-latest')).toBe(8_192)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-3-opus-20240229')).toBe(4_096)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-3-sonnet-20240229')).toBe(4_096)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4')).toBe(4_096)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4-turbo')).toBe(4_096)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-3.5-turbo')).toBe(4_096)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4o')).toBe(16_384)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4.1')).toBe(32_768)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4.5-preview')).toBe(16_384)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-future-9')).toBe(16_384)
  })

  it('does not clamp Claude 3.7/4.x or newer OpenAI families with the Claude 3 rules', () => {
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-3-7-sonnet-20250219')).toBe(16_384)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-sonnet-4-5')).toBe(64_000)
    expect(getCurrentFamilyModelMaxOutputTokens('claude', 'claude-opus-4-1')).toBe(32_000)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-5')).toBe(128_000)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4.1-mini')).toBe(32_768)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'gpt-4o-mini')).toBe(16_384)
    expect(getCurrentFamilyModelMaxOutputTokens('openai', 'o3')).toBe(16_384)
  })

  it('sends the Gemini key in a header, times out, and caches lookups', async () => {
    resetChatTokenResolverCache()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ outputTokenLimit: 777 }) }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveModelMaxOutputTokens('gemini', 'gemini-cache-test', 'secret-key')).resolves.toBe(777)
    await expect(resolveModelMaxOutputTokens('gemini', 'gemini-cache-test', 'secret-key')).resolves.toBe(777)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; signal: AbortSignal }]
    expect(url).not.toContain('secret-key')
    expect(init.headers['x-goog-api-key']).toBe('secret-key')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('remembers a failed Gemini lookup briefly instead of refetching every request', async () => {
    resetChatTokenResolverCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => { throw new Error('network down') })
    vi.stubGlobal('fetch', fetchMock)

    await resolveModelMaxOutputTokens('gemini', 'gemini-2.5-negative-cache', 'k')
    await resolveModelMaxOutputTokens('gemini', 'gemini-2.5-negative-cache', 'k')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
