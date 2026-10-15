// @vitest-environment node
import * as fs from 'node:fs'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ttsMock = vi.hoisted(() => ({
  synthesizeTts: vi.fn(),
}))

const appMock = vi.hoisted(() => ({
  userData: '/tmp/viezan-test',
  getVersion: vi.fn(() => '1.0.0'),
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => appMock.userData,
    getVersion: () => appMock.getVersion(),
    getName: () => 'Viezan',
  },
}))

vi.mock('../lightweightTranslate', () => ({
  lightweightTranslate: vi.fn(),
}))

vi.mock('../storage', () => ({
  hasStoredApiKey: vi.fn(() => false),
}))

vi.mock('../tts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tts')>()
  return {
    ...actual,
    synthesizeTts: ttsMock.synthesizeTts,
  }
})

import { lightweightTranslate } from '../lightweightTranslate'
import {
  createLocalServerApiKeyForTest,
  handleLocalServerRequest,
  MAX_TRANSLATE_BODY_BYTES,
  MAX_TTS_BODY_BYTES,
  setLocalServerTokensForTest,
} from '../localServer'

const VALID_EXTENSION_API_KEY = `sk-vie-${'a'.repeat(64)}`

function makeReq({
  method,
  url,
  token,
  origin,
  body,
}: {
  method: string
  url: string
  token?: string
  origin?: string
  body?: unknown
}) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const req = new Readable({
      autoDestroy: false,
    read() {
      this.push(payload)
      this.push(null)
    },
  })
  Object.assign(req, {
    method,
    url,
    headers: {
      ...(token ? { 'x-viezan-token': token } : {}),
      ...(origin ? { origin } : {}),
    },
  })
  return req
}

function makeRes(): Promise<{ statusCode: number; headers: Record<string, string>; data: unknown }> & {
  res: {
    writeHead: (statusCode: number, headers?: Record<string, string>) => void
    end: (chunk: string) => void
  }
} {
  let statusCode = 0
  let responseHeaders: Record<string, string> = {}
  let resolveResult!: (value: { statusCode: number; headers: Record<string, string>; data: unknown }) => void
  const promise = new Promise<{ statusCode: number; headers: Record<string, string>; data: unknown }>((resolve) => {
    resolveResult = resolve
  }) as Promise<{ statusCode: number; headers: Record<string, string>; data: unknown }> & {
    res: {
      writeHead: (statusCode: number, headers?: Record<string, string>) => void
      end: (chunk: string) => void
    }
  }
  promise.res = {
    writeHead: (code: number, headers?: Record<string, string>) => {
      statusCode = code
      responseHeaders = headers ?? {}
    },
    end: (chunk: string) => {
      resolveResult({ statusCode, headers: responseHeaders, data: JSON.parse(chunk) })
    },
  }
  return promise
}

async function request(params: {
  method: string
  url: string
  token?: string
  origin?: string
  body?: unknown
}) {
  const response = makeRes()
  await handleLocalServerRequest(
    // biome-ignore lint/suspicious/noExplicitAny: focused HTTP handler unit test
    makeReq(params) as any,
    // biome-ignore lint/suspicious/noExplicitAny: focused HTTP handler unit test
    response.res as any,
  )
  return response
}

describe('localServer /api/tts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ttsMock.synthesizeTts.mockResolvedValue({
      success: true,
      audioBase64: 'ZmFrZS1hdWRpbw==',
      mimeType: 'audio/mpeg',
      provider: 'edge',
    })
    setLocalServerTokensForTest([{
      id: 'token-id',
      name: 'Test API key',
      token: VALID_EXTENSION_API_KEY,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }])
  })

  afterEach(() => {
    setLocalServerTokensForTest([])
  })

  it('generates extension API keys with the sk-vie prefix', () => {
    expect(createLocalServerApiKeyForTest()).toMatch(/^sk-vie-[a-f0-9]{64}$/)
  })

  it('rejects unauthorized TTS requests', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/tts',
      body: { text: 'Hello', lang: 'en' },
    })

    expect(response.statusCode).toBe(401)
    expect(ttsMock.synthesizeTts).not.toHaveBeenCalled()
  })

  it('rejects legacy API key values without the sk-vie prefix', async () => {
    setLocalServerTokensForTest([{
      id: 'legacy-id',
      name: 'Legacy API key',
      token: 'valid-token',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }])

    const response = await request({
      method: 'POST',
      url: '/api/tts',
      token: 'valid-token',
      body: { text: 'Hello', lang: 'en' },
    })

    expect(response.statusCode).toBe(401)
    expect(ttsMock.synthesizeTts).not.toHaveBeenCalled()
  })

  it('rejects browser requests from untrusted origins before auth handling', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/tts',
      token: VALID_EXTENSION_API_KEY,
      origin: 'https://evil.example',
      body: { text: 'Hello', lang: 'en' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(ttsMock.synthesizeTts).not.toHaveBeenCalled()
  })

  it('allows Chrome Extension origins explicitly', async () => {
    const origin = `chrome-extension://${'a'.repeat(32)}`
    const response = await request({
      method: 'OPTIONS',
      url: '/api/tts',
      origin,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['Access-Control-Allow-Origin']).toBe(origin)
  })

  it('allows legacy assistant preflights only with a valid CORS token', async () => {
    const origin = 'https://docs.example.com'
    const response = await request({
      method: 'OPTIONS',
      url: `/api/translate?corsToken=${VALID_EXTENSION_API_KEY}`,
      origin,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['Access-Control-Allow-Origin']).toBe(origin)
  })

  it('calls shared TTS synthesis using the cached settings mode', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/tts',
      token: VALID_EXTENSION_API_KEY,
      body: { text: 'Hello', lang: 'en', mode: 'premium' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.data).toMatchObject({
      success: true,
      audioBase64: 'ZmFrZS1hdWRpbw==',
      mimeType: 'audio/mpeg',
      provider: 'edge',
    })
    expect(ttsMock.synthesizeTts).toHaveBeenCalledWith({
      text: 'Hello',
      lang: 'en',
      mode: 'free',
      voice: 'nova',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('localServer request hardening', () => {
  const validToken = (): Parameters<typeof setLocalServerTokensForTest>[0][number] => ({
    id: 'token-id',
    name: 'Test API key',
    token: VALID_EXTENSION_API_KEY,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  })

  /** Request whose body is delivered as the given raw chunks (optionally never ending). */
  async function rawRequest(params: {
    method?: string
    url: string
    token?: string
    chunks?: Array<string | Buffer>
    neverEnd?: boolean
    headers?: Record<string, string>
  }) {
    const chunks = [...(params.chunks ?? [])]
    const req = new Readable({
      autoDestroy: false,
      read() {
        const next = chunks.shift()
        if (next !== undefined) this.push(next)
        else if (!params.neverEnd) this.push(null)
      },
    })
    const destroySpy = vi.spyOn(req, 'destroy')
    Object.assign(req, {
      method: params.method ?? 'POST',
      url: params.url,
      headers: {
        ...(params.token ? { 'x-viezan-token': params.token } : {}),
        ...params.headers,
      },
    })
    const response = makeRes()
    const finishListeners: Array<() => void> = []
    Object.assign(response.res, {
      once: (_event: string, cb: () => void) => { finishListeners.push(cb) },
    })
    // biome-ignore lint/suspicious/noExplicitAny: focused HTTP handler unit test
    const done = handleLocalServerRequest(req as any, response.res as any)
    return { response, done, destroySpy, finish: () => { for (const cb of finishListeners) cb() } }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    appMock.getVersion.mockReturnValue('1.0.0')
    appMock.userData = '/tmp/viezan-test'
    ttsMock.synthesizeTts.mockResolvedValue({ success: true, audioBase64: 'QQ==', mimeType: 'audio/mpeg', provider: 'edge' })
    vi.mocked(lightweightTranslate).mockResolvedValue({ success: true, translatedText: 'xin chao' })
    setLocalServerTokensForTest([validToken()])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    setLocalServerTokensForTest([])
  })

  it.each([
    '//',
    '//evil.example/api/status',
    '/\\evil.example/api/status',
    'http://evil.example/api/status',
    'api/status',
  ])('answers 400 (not a rejection) for malformed request target %s', async (url) => {
    const response = await request({ method: 'GET', url, token: VALID_EXTENSION_API_KEY })

    expect(response.statusCode).toBe(400)
    expect(response.data).toMatchObject({ success: false })
  })

  it('does not throw while evaluating CORS for a malformed target from an untrusted origin', async () => {
    const response = await request({
      method: 'GET',
      url: '//',
      token: VALID_EXTENSION_API_KEY,
      origin: 'https://evil.example',
    })

    expect(response.statusCode).toBe(403)
  })

  it('still routes well-formed requests with query strings', async () => {
    const response = await request({ method: 'GET', url: '/api/status?x=1', token: VALID_EXTENSION_API_KEY })

    expect(response.statusCode).toBe(200)
  })

  it('turns an unexpected handler failure into a generic 500 instead of rejecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    appMock.getVersion.mockImplementation(() => { throw new Error('secret internal detail') })

    const response = await request({ method: 'GET', url: '/api/status', token: VALID_EXTENSION_API_KEY })

    expect(response.statusCode).toBe(500)
    expect(JSON.stringify(response.data)).not.toContain('secret internal detail')
  })

  it('answers 413 with Connection: close and tears down the request after a grace period', async () => {
    vi.useFakeTimers()
    const big = 'x'.repeat(MAX_TRANSLATE_BODY_BYTES + 1)
    const { response, done, destroySpy, finish } = await rawRequest({
      url: '/api/translate',
      token: VALID_EXTENSION_API_KEY,
      chunks: [big],
    })

    const result = await response
    await done
    finish() // response flushed

    expect(result.statusCode).toBe(413)
    expect(result.headers).toMatchObject({ Connection: 'close' })
    expect(lightweightTranslate).not.toHaveBeenCalled()
    // Not destroyed the instant the response flushes: the client must be able to read it.
    expect(destroySpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_500)
    expect(destroySpy).toHaveBeenCalled()
  })

  it('rejects an oversized declared Content-Length without reading the body', async () => {
    const { response, done } = await rawRequest({
      url: '/api/tts',
      token: VALID_EXTENSION_API_KEY,
      chunks: ['{}'],
      headers: { 'content-length': String(MAX_TTS_BODY_BYTES + 1) },
    })

    expect((await response).statusCode).toBe(413)
    await done
    expect(ttsMock.synthesizeTts).not.toHaveBeenCalled()
  })

  it('answers 408 when the body never completes', async () => {
    vi.useFakeTimers()
    const { response, done, destroySpy, finish } = await rawRequest({
      url: '/api/translate',
      token: VALID_EXTENSION_API_KEY,
      chunks: ['{"text":'],
      neverEnd: true,
    })

    await vi.advanceTimersByTimeAsync(16_000)
    const result = await response
    await done
    finish()

    expect(result.statusCode).toBe(408)
    expect(result.headers).toMatchObject({ Connection: 'close' })
    expect(destroySpy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_500)
    expect(destroySpy).toHaveBeenCalled()
  })

  it('delivers the 413 JSON error to a real client that is still uploading', async () => {
    const server = http.createServer((req, res) => { void handleLocalServerRequest(req, res) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const outcome = await new Promise<{ status: number; connection: string | undefined; body: string }>((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port,
          path: '/api/translate',
          method: 'POST',
          headers: { 'x-viezan-token': VALID_EXTENSION_API_KEY, 'content-type': 'application/json' },
        }, (res) => {
          let body = ''
          res.setEncoding('utf-8')
          res.on('data', (chunk) => { body += chunk })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, connection: res.headers.connection, body }))
          res.on('error', reject)
        })
        // Write errors after the server replied and hung up are expected, not failures.
        req.on('error', (error) => { if (!(error as NodeJS.ErrnoException).code) reject(error) })
        // Chunked upload beyond the cap, so the server must reply while data is still arriving.
        const chunk = Buffer.alloc(64 * 1024, 120)
        let sent = 0
        const pump = () => {
          while (sent <= MAX_TRANSLATE_BODY_BYTES + 256 * 1024 && !req.destroyed) {
            sent += chunk.length
            if (!req.write(chunk)) { req.once('drain', pump); return }
          }
          req.end()
        }
        pump()
      })

      expect(outcome.status).toBe(413)
      expect(outcome.connection).toBe('close')
      expect(JSON.parse(outcome.body)).toMatchObject({ success: false, error: 'Payload too large' })
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('validates /api/tts text length and language through the shared TTS parser', async () => {
    const tooLong = await request({
      method: 'POST',
      url: '/api/tts',
      token: VALID_EXTENSION_API_KEY,
      body: { text: 'a'.repeat(5_001), lang: 'en' },
    })
    expect(tooLong.statusCode).toBe(400)

    const badLang = await request({
      method: 'POST',
      url: '/api/tts',
      token: VALID_EXTENSION_API_KEY,
      body: { text: 'hello', lang: '../../etc' },
    })
    expect(badLang.statusCode).toBe(400)

    const notObject = await request({
      method: 'POST',
      url: '/api/tts',
      token: VALID_EXTENSION_API_KEY,
      body: ['hello'],
    })
    expect(notObject.statusCode).toBe(400)
    expect(ttsMock.synthesizeTts).not.toHaveBeenCalled()
  })

  it('rejects non-object and mistyped /api/translate bodies', async () => {
    const badBodies: unknown[] = [
      ['x'],
      'text',
      null,
      { text: 5, targetLang: 'vi' },
      { text: 'hi' },
      { text: 'hi', targetLang: 'vi', model: 7 },
    ]
    for (const body of badBodies) {
      const response = await request({ method: 'POST', url: '/api/translate', token: VALID_EXTENSION_API_KEY, body })
      expect(response.statusCode).toBe(400)
    }
    expect(lightweightTranslate).not.toHaveBeenCalled()
  })

  it('forwards only whitelisted /api/translate fields', async () => {
    const response = await request({
      method: 'POST',
      url: '/api/translate',
      token: VALID_EXTENSION_API_KEY,
      body: { text: 'hello', targetLang: 'vi', provider: 'gemini', model: 'm', translationStyle: 'formal', extra: { a: 1 } },
    })

    expect(response.statusCode).toBe(200)
    expect(lightweightTranslate).toHaveBeenCalledWith({
      text: 'hello',
      targetLang: 'vi',
      provider: 'gemini',
      model: 'm',
      translationStyle: 'formal',
    })
  })

  it('answers 400 for invalid JSON', async () => {
    const { response, done } = await rawRequest({
      url: '/api/translate',
      token: VALID_EXTENSION_API_KEY,
      chunks: ['{not json'],
    })
    expect((await response).statusCode).toBe(400)
    await done
  })

  describe('API key persistence', () => {
    let dir: string

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-tokens-'))
      appMock.userData = dir
    })

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('writes purged keys atomically with private permissions and no temp leftovers', async () => {
      setLocalServerTokensForTest([
        validToken(),
        { ...validToken(), id: 'expired-id', expiresAt: Date.now() - 1_000 },
      ])

      const response = await request({ method: 'GET', url: '/api/status', token: VALID_EXTENSION_API_KEY })
      expect(response.statusCode).toBe(200)

      const file = path.join(dir, 'local-server-tokens.json')
      const saved = JSON.parse(fs.readFileSync(file, 'utf-8'))
      expect(saved).toHaveLength(1)
      expect(saved[0].id).toBe('token-id')
      expect(fs.readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([])
      if (process.platform !== 'win32') {
        expect(fs.statSync(file).mode & 0o777).toBe(0o600)
      }
    })

    it('logs persistence failures without leaking key material', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      appMock.userData = path.join(dir, 'does-not-exist')
      setLocalServerTokensForTest([
        validToken(),
        { ...validToken(), id: 'expired-id', expiresAt: Date.now() - 1_000 },
      ])

      const response = await request({ method: 'GET', url: '/api/status', token: VALID_EXTENSION_API_KEY })

      expect(response.statusCode).toBe(200)
      expect(errorSpy).toHaveBeenCalled()
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(VALID_EXTENSION_API_KEY)
    })
  })
})
