/**
 * Local HTTP Server — lets the Viezan Chrome Extension communicate with the
 * native Viezan app running on the same machine.
 *
 * Security model:
 *   • Server only listens on 127.0.0.1 (loopback — not reachable from outside)
 *   • Every request must carry the header  X-Viezan-Token: <api-key>
 *   • Browser CORS is restricted to extension/local origins; legacy assistant
 *     requests from arbitrary web origins must include a valid API key as a
 *     preflight-visible `corsToken` query parameter.
 *   • API keys use the sk-vie-<64 lowercase hex chars> format, named, with configurable TTL
 *   • API key values are returned ONLY at creation or regeneration — never again
 *   • Multiple API keys can coexist (one per device/browser)
 *
 * Endpoints:
 *   GET  /api/status                                 → { success, version }
 *   POST /api/translate  { text, targetLang, sourceLang?, provider?, model? }
 *                        → { success, translatedText } | { success:false, error }
 *   POST /api/tts        { text, lang?, mode? }
 *                        → { success, audioBase64?, mimeType?, provider? } | { success:false, error }
 */
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { app } from 'electron'
import { EXT_DEFAULT_GEMINI_MODEL } from './ipcConstants'
import { invalidIpcInput, isNonEmptyString, isRecord } from './ipcValidation'
import { type LightweightTranslateParams, lightweightTranslate } from './lightweightTranslate'
import { isValidProvider } from './providers/types'
import { hasStoredApiKey } from './storage'
import { parseTtsParams, synthesizeTts, type TtsMode, type TtsParams } from './tts'

// ── Config ────────────────────────────────────────────────────────────────────

export const LOCAL_SERVER_PORT = 39875
/** Multi-API-key file (replaces legacy single-secret file) */
const TOKENS_FILE = 'local-server-tokens.json'
/** Legacy single-secret file — migrated only when it already contains a valid sk-vie API key */
const LEGACY_TOKEN_FILE = 'local-server-token.json'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TokenEntry {
  id: string         // 8-byte random hex
  name: string       // user-given label
  token: string      // sk-vie-<64 lowercase hex chars> — stored but NEVER returned in list
  createdAt: number  // Unix ms
  expiresAt: number  // Unix ms
}

/** What the list endpoint returns — no API key value */
export type TokenInfo = Omit<TokenEntry, 'token'>

// ── State ─────────────────────────────────────────────────────────────────────

let activeTokens: TokenEntry[] = []
let server: http.Server | null = null
/** True only while the HTTP server is actually bound to LOCAL_SERVER_PORT. */
let serverListening = false

/**
 * Active provider/model synced from the renderer (Zustand store).
 * Updated via IPC `localServer:syncConfig` whenever the user changes provider/model.
 * Used by /api/config so the extension always mirrors the app's current selection.
 */
const cachedConfig: {
  provider: string
  model: string
  ttsMode: TtsMode
  ttsVoice: NonNullable<TtsParams['voice']>
} = {
  provider: 'gemini',
  model: EXT_DEFAULT_GEMINI_MODEL,
  ttsMode: 'free',
  ttsVoice: 'nova',
}

const API_KEY_PATTERN = /^sk-vie-[a-f0-9]{64}$/

// ── Persistence ───────────────────────────────────────────────────────────────

function getTokensPath (): string {
  return path.join(app.getPath('userData'), TOKENS_FILE)
}

function getLegacyTokenPath (): string {
  return path.join(app.getPath('userData'), LEGACY_TOKEN_FILE)
}

/**
 * Persist API keys atomically: write a private (0600) temp file next to the
 * target, then rename over it so a crash never leaves a truncated key file.
 * Failures are logged (never the key material) instead of swallowed silently.
 */
function saveTokens (tokens: TokenEntry[]): void {
  const target = getTokensPath()
  const tmp = `${target}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(tokens), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tmp, target)
  } catch (error) {
    console.error('[LocalServer] Failed to persist API keys:', error instanceof Error ? error.message : 'unknown error')
    try { fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
  }
}

function loadTokens (): TokenEntry[] {
  // 1. Try current multi-API-key file
  try {
    const p = getTokensPath()
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      if (Array.isArray(data)) {
        const now = Date.now()
        const validTokens = data.filter((t: TokenEntry) =>
          typeof t.id === 'string' &&
          typeof t.name === 'string' &&
          isValidApiKeyValue(t.token) &&
          typeof t.expiresAt === 'number' && t.expiresAt > now
        )
        if (validTokens.length !== data.length) saveTokens(validTokens)
        return validTokens
      }
    }
  } catch { /* fall through */ }

  // 2. Migrate from legacy single-secret file only when it already uses the new format
  try {
    const lp = getLegacyTokenPath()
    if (fs.existsSync(lp)) {
      const data = JSON.parse(fs.readFileSync(lp, 'utf-8'))
      if (isValidApiKeyValue(data.token)) {
        const now = Date.now()
        const expiresAt = typeof data.expiresAt === 'number' && data.expiresAt > now
          ? data.expiresAt
          : now + 30 * 24 * 60 * 60 * 1000
        if (expiresAt > now) {
          const migrated: TokenEntry = {
            id: crypto.randomBytes(8).toString('hex'),
            name: 'Default',
            token: data.token,
            createdAt: now,
            expiresAt,
          }
          saveTokens([migrated])
          return [migrated]
        }
      }
    }
  } catch { /* ignore */ }

  return []
}

function purgeExpired (): void {
  const now = Date.now()
  const before = activeTokens.length
  activeTokens = activeTokens.filter(t => t.expiresAt > now && isValidApiKeyValue(t.token))
  if (activeTokens.length !== before) saveTokens(activeTokens)
}

// ── API key helpers ───────────────────────────────────────────────────────────

function makeTokenId (): string {
  return crypto.randomBytes(8).toString('hex')
}
function makeTokenValue (): string {
  return `sk-vie-${crypto.randomBytes(32).toString('hex')}`
}
function ttlMs (days: number): number {
  return Math.max(1, Math.min(days, 365)) * 24 * 60 * 60 * 1000
}

function isTtsMode(value: unknown): value is TtsMode {
  return value === 'free' || value === 'auto' || value === 'premium'
}

function isTtsVoice(value: unknown): value is NonNullable<TtsParams['voice']> {
  return (
    value === 'alloy' ||
    value === 'echo' ||
    value === 'fable' ||
    value === 'onyx' ||
    value === 'nova' ||
    value === 'shimmer'
  )
}

function isTokenId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{16}$/i.test(value)
}

function normalizeTokenName(value: unknown): string {
  if (typeof value !== 'string') return 'Extension API Key'
  return value.trim().slice(0, 80) || 'Extension API Key'
}

function normalizeTtlDays(value: unknown, fallback = 30): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function tokenMatches(storedToken: string, incomingToken: unknown): boolean {
  if (typeof incomingToken !== 'string') return false
  if (!isValidApiKeyValue(storedToken) || !isValidApiKeyValue(incomingToken)) return false
  const stored = Buffer.from(storedToken)
  const incoming = Buffer.from(incomingToken)
  return stored.length === incoming.length && crypto.timingSafeEqual(stored, incoming)
}

function isValidApiKeyValue(value: unknown): value is string {
  return typeof value === 'string' && API_KEY_PATTERN.test(value)
}

// ── HTTP server helpers ───────────────────────────────────────────────────────

const MAX_LISTEN_RETRIES = 5
const LISTEN_RETRY_DELAY_MS = 500

// ── HTTP server ───────────────────────────────────────────────────────────────

const REQUEST_URL_BASE = `http://127.0.0.1:${LOCAL_SERVER_PORT}`

/** Body caps (bytes). /api/tts text is capped at 5 000 chars (<= ~20 KB UTF-8). */
export const MAX_TRANSLATE_BODY_BYTES = 256 * 1024
export const MAX_TTS_BODY_BYTES = 32 * 1024
const BODY_READ_TIMEOUT_MS = 15_000
/** After a 413/408 reply, how long a connection may keep draining before it is destroyed. */
const BODY_ERROR_SOCKET_GRACE_MS = 1_000

/**
 * Parse the request target relative to the loopback base. Returns null for
 * anything that is not a plain origin-form path (`//host`, `/\host`, absolute
 * URLs, control characters), which `new URL` would otherwise throw on or
 * reinterpret as a different authority.
 */
function parseRequestUrl(rawUrl: string | undefined): URL | null {
  const target = rawUrl ?? '/'
  if (!target.startsWith('/') || /^\/[/\\]/.test(target)) return null
  try {
    const url = new URL(target, REQUEST_URL_BASE)
    return url.origin === REQUEST_URL_BASE ? url : null
  } catch {
    return null
  }
}

function getRequestUrl(req: http.IncomingMessage): URL | null {
  return parseRequestUrl(req.url)
}

function isTrustedBrowserOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    if (url.protocol === 'chrome-extension:') {
      return /^[a-p]{32}$/.test(url.hostname)
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]' || url.hostname === '::1'
    }
  } catch {
    return false
  }
  return false
}

function hasValidLegacyCorsToken(req: http.IncomingMessage): boolean {
  const corsToken = getRequestUrl(req)?.searchParams.get('corsToken')
  if (!corsToken) return false
  purgeExpired()
  const now = Date.now()
  return activeTokens.some(t => tokenMatches(t.token, corsToken) && t.expiresAt > now)
}

function resolveCorsOrigin(req: http.IncomingMessage): string | null {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || !origin) return null
  if (isTrustedBrowserOrigin(origin)) return origin
  return hasValidLegacyCorsToken(req) ? origin : null
}

function sendJSON (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const corsOrigin = resolveCorsOrigin(req)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Viezan-Token',
    // Required for Chrome Private Network Access (PNA) — allows extension pages
    // and trusted local pages to fetch from 127.0.0.1.
    'Access-Control-Allow-Private-Network': 'true',
    ...extraHeaders,
  }
  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin
    headers.Vary = 'Origin'
  }
  res.writeHead(statusCode, headers)
  res.end(JSON.stringify(data))
}

function getPublicRequestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SyntaxError) return 'Invalid JSON payload'
  return fallback
}

class BodyReadError extends Error {
  constructor (readonly statusCode: 408 | 413, message: string) {
    super(message)
    this.name = 'BodyReadError'
  }
}

/**
 * Read the request body with a byte cap and an overall timeout.
 * Rejects with BodyReadError (413 over the cap, 408 on timeout); the caller
 * is responsible for responding and tearing the socket down.
 */
function readBody (
  req: http.IncomingMessage,
  maxBytes: number,
  timeoutMs = BODY_READ_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers?.['content-length'])
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(new BodyReadError(413, 'Payload too large'))
      return
    }

    const chunks: Buffer[] = []
    let received = 0
    let settled = false

    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('close', onClose)
      action()
    }
    const onData = (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      received += buf.length
      if (received > maxBytes) {
        finish(() => reject(new BodyReadError(413, 'Payload too large')))
        return
      }
      chunks.push(buf)
    }
    const onEnd = () => finish(() => resolve(Buffer.concat(chunks).toString('utf-8')))
    const onError = (error: Error) => finish(() => reject(error))
    const onClose = () => finish(() => reject(new Error('Request closed before body was received')))
    const timer = setTimeout(
      () => finish(() => reject(new BodyReadError(408, 'Request timeout'))),
      timeoutMs,
    )

    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
    req.on('close', onClose)
  })
}

/**
 * Respond to a body-read failure; for 413/408 the connection is closed afterwards.
 *
 * Node destroys the socket right after a `Connection: close` response is flushed. If the
 * client is still uploading, the kernel then answers its remaining data with a RST, which
 * can discard the reply before the client reads it. So: announce `Connection: close`,
 * half-close (FIN after the reply) instead of destroying, keep discarding the rest of the
 * upload, and only force-destroy after a short grace period as a hard bound against a
 * slow or endless sender.
 */
function sendBodyReadError (req: http.IncomingMessage, res: http.ServerResponse, error: BodyReadError): void {
  const socket = req.socket
  if (socket && typeof socket.end === 'function') {
    socket.destroySoon = () => { socket.end() }
  }
  res.once?.('finish', () => {
    req.resume()
    const timer = setTimeout(() => {
      req.destroy()
      socket?.destroy()
    }, BODY_ERROR_SOCKET_GRACE_MS)
    timer.unref?.()
    const clear = () => clearTimeout(timer)
    req.once?.('close', clear)
    socket?.once?.('close', clear)
  })
  sendJSON(req, res, error.statusCode, { success: false, error: error.message }, { Connection: 'close' })
}

/** Read and JSON-parse a bounded request body. Returns undefined after replying on failure. */
async function readJsonBody (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  maxBytes: number,
): Promise<unknown | undefined> {
  let raw: string
  try {
    raw = await readBody(req, maxBytes)
  } catch (error) {
    if (error instanceof BodyReadError) {
      sendBodyReadError(req, res, error)
    } else {
      sendJSON(req, res, 400, { success: false, error: 'Could not read request body' })
    }
    return undefined
  }
  try {
    return JSON.parse(raw)
  } catch {
    sendJSON(req, res, 400, { success: false, error: 'Invalid JSON payload' })
    return undefined
  }
}

function isOptionalStringField (value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

/** Whitelist + type-check the /api/translate body; semantic validation lives in lightweightTranslate. */
function parseTranslateBody (body: unknown): LightweightTranslateParams | null {
  if (!isRecord(body)) return null
  const { text, targetLang, provider, model, translationStyle } = body
  if (typeof text !== 'string' || typeof targetLang !== 'string') return null
  if (!isOptionalStringField(provider) || !isOptionalStringField(model) || !isOptionalStringField(translationStyle)) {
    return null
  }
  return {
    text,
    targetLang,
    ...(provider !== undefined ? { provider } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(translationStyle !== undefined
      ? { translationStyle: translationStyle as LightweightTranslateParams['translationStyle'] }
      : {}),
  }
}

/**
 * Top-level request handler. Never rejects: any unexpected failure becomes a
 * generic 500 (when headers are not already sent) so no unhandled rejection can
 * escape from http.createServer.
 */
export async function handleLocalServerRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    await routeLocalServerRequest(req, res)
  } catch (error) {
    console.error('[LocalServer] Unhandled request error:', error instanceof Error ? error.message : 'unknown error')
    try {
      if (!res.headersSent) {
        sendJSON(req, res, 500, { success: false, error: 'Internal server error' })
      } else if (!res.writableEnded) {
        res.end()
      }
    } catch {
      // Socket already gone — nothing more to do.
    }
  }
}

async function routeLocalServerRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.headers.origin && !resolveCorsOrigin(req)) {
    sendJSON(req, res, 403, { success: false, error: 'Origin not allowed' })
    return
  }

  if (req.method === 'OPTIONS') { sendJSON(req, res, 200, {}); return }

  // Validate API key against all active, non-expired API keys
  const incomingToken = req.headers['x-viezan-token']
  const now = Date.now()
  purgeExpired()
  const valid = activeTokens.some(t => tokenMatches(t.token, incomingToken) && t.expiresAt > now)
  if (!valid) {
    sendJSON(req, res, 401, { success: false, error: 'Unauthorized — API key expired or invalid' })
    return
  }

  const parsedUrl = getRequestUrl(req)
  if (!parsedUrl) {
    sendJSON(req, res, 400, { success: false, error: 'Malformed request URL' })
    return
  }
  const { pathname: url } = parsedUrl

  if (req.method === 'GET' && url === '/api/status') {
    sendJSON(req, res, 200, { success: true, version: app.getVersion(), appName: app.getName() })
    return
  }

  // Returns the app's currently active provider/model so the extension
  // mirrors the user's selection without needing its own provider settings.
  if (req.method === 'GET' && url === '/api/config') {
    sendJSON(req, res, 200, {
      success: true,
      provider: cachedConfig.provider,
      model: cachedConfig.model,
      availableProviders: {
        gemini: hasStoredApiKey('gemini'),
        openai: hasStoredApiKey('openai'),
        claude: hasStoredApiKey('claude'),
      },
    })
    return
  }

  if (req.method === 'POST' && url === '/api/translate') {
    const body = await readJsonBody(req, res, MAX_TRANSLATE_BODY_BYTES)
    if (body === undefined) return
    const params = parseTranslateBody(body)
    if (!params) {
      sendJSON(req, res, 400, { success: false, error: 'Invalid translation request' })
      return
    }
    try {
      const result = await lightweightTranslate(params)
      sendJSON(req, res, 200, result)
    } catch (e) {
      sendJSON(req, res, 400, { success: false, error: getPublicRequestErrorMessage(e, 'Translation request failed') })
    }
    return
  }

  if (req.method === 'POST' && url === '/api/tts') {
    const body = await readJsonBody(req, res, MAX_TTS_BODY_BYTES)
    if (body === undefined) return
    // Reuse the IPC validator so the text-length cap and language rules match.
    // Voice/mode always come from the app's synced config, never from the caller.
    const parsed = parseTtsParams(isRecord(body)
      ? { text: typeof body.text === 'string' ? body.text.trim() : body.text, lang: body.lang }
      : body)
    if (!parsed.ok) {
      sendJSON(req, res, 400, { success: false, error: parsed.response.error ?? 'Invalid TTS request' })
      return
    }
    try {
      const result = await synthesizeTts({
        text: parsed.value.text,
        lang: parsed.value.lang,
        mode: cachedConfig.ttsMode,
        voice: cachedConfig.ttsVoice,
      })
      sendJSON(req, res, result.success ? 200 : 400, result)
    } catch (e) {
      sendJSON(req, res, 400, { success: false, error: getPublicRequestErrorMessage(e, 'TTS request failed') })
    }
    return
  }

  sendJSON(req, res, 404, { success: false, error: 'Not found' })
}

export function createHttpServer (): http.Server {
  return http.createServer(handleLocalServerRequest)
}

/**
 * Attempt to bind the server to LOCAL_SERVER_PORT.
 * On EADDRINUSE (port held by a previous instance that hasn't fully released
 * yet), close the failed socket and retry up to MAX_LISTEN_RETRIES times with
 * a short exponential back-off.  This covers the common crash / hot-reload
 * scenario where the OS reclaims the port within a second or two.
 */
function listenWithRetry (attempt = 0): void {
  // Tear down whatever failed server we had
  if (server) {
    server.removeAllListeners()
    server.close()
  }
  serverListening = false

  const instance = createHttpServer()
  server = instance

  instance.on('listening', () => {
    if (server !== instance) return
    serverListening = true
    console.log(`[LocalServer] Listening on http://127.0.0.1:${LOCAL_SERVER_PORT}`)
  })

  instance.on('error', (err: NodeJS.ErrnoException) => {
    if (server !== instance) return
    serverListening = false
    if (err.code === 'EADDRINUSE' && attempt < MAX_LISTEN_RETRIES) {
      const delay = LISTEN_RETRY_DELAY_MS * (attempt + 1)
      console.warn(
        `[LocalServer] Port ${LOCAL_SERVER_PORT} in use — retry ${attempt + 1}/${MAX_LISTEN_RETRIES} in ${delay} ms`
      )
      setTimeout(() => {
        // stopLocalServer() may have run while we were waiting.
        if (server === instance) listenWithRetry(attempt + 1)
      }, delay)
    } else {
      // Gave up: make sure nothing reports this port as live.
      console.error('[LocalServer] Error — server is NOT listening:', err)
      server = null
      try { instance.close() } catch { /* not running */ }
    }
  })

  instance.listen(LOCAL_SERVER_PORT, '127.0.0.1')
}

/** True while the extension bridge is actually bound to LOCAL_SERVER_PORT. */
export function isLocalServerListening (): boolean {
  return serverListening
}

export function startLocalServer (ipcMain: Electron.IpcMain): void {
  activeTokens = loadTokens()

  listenWithRetry()

  // ── IPC handlers ─────────────────────────────────────────────────────────

  /**
   * Called by the renderer whenever selectedProvider or selectedModels changes.
   * Keeps cachedConfig in sync so /api/config reflects the app's current state.
   */
  ipcMain.handle('localServer:syncConfig', (_event, rawParams: unknown) => {
    if (!isRecord(rawParams)) {
      return invalidIpcInput('Local server config payload must be an object')
    }

    const { provider, model, ttsMode, ttsVoice } = rawParams
    if (!isNonEmptyString(provider) || !isValidProvider(provider.trim())) {
      return invalidIpcInput('Invalid provider')
    }
    if (!isNonEmptyString(model)) {
      return invalidIpcInput('Invalid model')
    }
    if (ttsMode !== undefined && !isTtsMode(ttsMode)) {
      return invalidIpcInput('Invalid TTS mode')
    }
    if (ttsVoice !== undefined && !isTtsVoice(ttsVoice)) {
      return invalidIpcInput('Invalid TTS voice')
    }

    cachedConfig.provider = provider.trim()
    cachedConfig.model = model.trim()
    if (ttsMode) cachedConfig.ttsMode = ttsMode
    if (ttsVoice) cachedConfig.ttsVoice = ttsVoice
    return { success: true }
  })

  /** Create a new named API key — returns API key value ONCE */
  ipcMain.handle('localServer:createToken', (_event, rawParams: unknown) => {
    if (!isRecord(rawParams)) {
      return invalidIpcInput('Create API key payload must be an object')
    }
    purgeExpired()
    const now = Date.now()
    const ttlDays = normalizeTtlDays(rawParams.ttlDays)
    const entry: TokenEntry = {
      id:        makeTokenId(),
      name:      normalizeTokenName(rawParams.name),
      token:     makeTokenValue(),
      createdAt: now,
      expiresAt: now + ttlMs(ttlDays),
    }
    activeTokens.push(entry)
    saveTokens(activeTokens)
    // Return API key value ONCE — never returned again via listTokens
    return { success: true, token: entry.token, id: entry.id, name: entry.name, createdAt: entry.createdAt, expiresAt: entry.expiresAt }
  })

  /** List all active API keys — API key values are NEVER included */
  ipcMain.handle('localServer:listTokens', () => {
    purgeExpired()
    return {
      success: true,
      port: LOCAL_SERVER_PORT,
      // Additive: false when the bind failed so the UI can avoid advertising a dead port.
      listening: serverListening,
      tokens: activeTokens.map(({ id, name, createdAt, expiresAt }) => ({ id, name, createdAt, expiresAt })),
    }
  })

  /** Delete an API key immediately — it stops working at once */
  ipcMain.handle('localServer:deleteToken', (_event, rawParams: unknown) => {
    if (!isRecord(rawParams) || !isTokenId(rawParams.id)) {
      return invalidIpcInput('Invalid API key id')
    }
    const { id } = rawParams
    activeTokens = activeTokens.filter(t => t.id !== id)
    saveTokens(activeTokens)
    return { success: true }
  })

  /** Regenerate the API key value for an existing entry — returns new value ONCE, resets TTL */
  ipcMain.handle('localServer:regenerateToken', (_event, rawParams: unknown) => {
    if (!isRecord(rawParams) || !isTokenId(rawParams.id)) {
      return invalidIpcInput('Invalid API key id')
    }
    purgeExpired()
    const { id } = rawParams
    const idx = activeTokens.findIndex(t => t.id === id)
    if (idx === -1) return { success: false, error: 'API key not found' }
    const old = activeTokens[idx]
    const days = normalizeTtlDays(rawParams.ttlDays, Math.round((old.expiresAt - old.createdAt) / (24 * 60 * 60 * 1000)))
    const now = Date.now()
    activeTokens[idx] = {
      ...old,
      token:     makeTokenValue(),
      createdAt: now,
      expiresAt: now + ttlMs(days),
    }
    saveTokens(activeTokens)
    const updated = activeTokens[idx]
    // Return new API key value ONCE
    return { success: true, token: updated.token, id: updated.id, name: updated.name, createdAt: updated.createdAt, expiresAt: updated.expiresAt }
  })
}

export function stopLocalServer (): void {
  serverListening = false
  server?.close()
  server = null
}

/** Returns first active API key value for Legacy Assistant bookmarklet */
export function getServerToken (): string {
  purgeExpired()
  return activeTokens[0]?.token ?? ''
}

export function setLocalServerTokensForTest(tokens: TokenEntry[]): void {
  activeTokens = tokens
}

export function createLocalServerApiKeyForTest (): string {
  return makeTokenValue()
}
