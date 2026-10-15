/**
 * Text-to-Speech IPC handlers — Electron main process.
 *
 * Provider priority depends on user-selected TTS mode:
 *  - free:    Edge TTS only (no paid API keys)
 *  - auto:    Edge TTS first, then paid providers if Edge fails
 *  - premium: paid providers first, then Edge fallback
 *
 * All providers return base64-encoded audio so the renderer can decode it with
 * Web Audio API regardless of format (MP3, WAV, PCM).
 */

import * as crypto from 'node:crypto'
import type { IpcMain } from 'electron'
import WebSocket from 'ws'
import {
  EDGE_TTS_CHROMIUM_FULL,
  EDGE_TTS_CHROMIUM_MAJOR,
  EDGE_TTS_DEFAULT_RATE,
  EDGE_TTS_DEFAULT_VOICE,
  EDGE_TTS_TIMEOUT_MS,
  EDGE_TTS_TRUSTED_TOKEN,
  EDGE_TTS_VOICE_BY_LANG,
  EDGE_TTS_WIN_EPOCH,
  EDGE_TTS_WS_URL,
  ELEVENLABS_API_BASE,
  ELEVENLABS_DEFAULT_VOICE_ID,
  ELEVENLABS_SIMILARITY_BOOST,
  ELEVENLABS_STABILITY,
  ELEVENLABS_STYLE,
  ELEVENLABS_TTS_MODEL,
  GEMINI_API_BASE,
  GEMINI_TTS_MODEL,
  GEMINI_TTS_VOICE_NAME,
  OPENAI_TTS_MODEL,
} from './ipcConstants'
import { invalidIpcInput, isRecord, isSafeLanguageCode } from './ipcValidation'
import { getStoredApiKey } from './storage'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TtsParams {
  text: string
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  mode?: TtsMode
  lang?: string
}

export interface TtsResult {
  success: boolean
  /** base64-encoded audio — safer than ArrayBuffer over Electron IPC */
  audioBase64?: string
  /** MIME type of the audio: 'audio/mpeg' (OpenAI/Edge/ElevenLabs) */
  mimeType?: string
  /** Which provider produced the audio */
  provider?: string
  error?: string
  errorCode?: 'NO_API_KEY' | 'INVALID_KEY' | 'RATE_LIMIT' | 'NETWORK' | string
}

interface TtsCandidate {
  provider: 'openai' | 'gemini' | 'edge' | 'elevenlabs'
  reason: string
}

export type TtsMode = 'free' | 'auto' | 'premium'

type ParsedTtsParams =
  | { ok: true; value: TtsParams }
  | { ok: false; response: TtsResult }

const TTS_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
const TTS_MODES = new Set(['free', 'auto', 'premium'])
const MAX_TTS_TEXT_CHARS = 5_000
/** Upper bound for OpenAI / ElevenLabs synthesis requests (including body read). */
const TTS_FETCH_TIMEOUT_MS = 30_000
/**
 * Gemini TTS returns the whole audio in one JSON response and is noticeably slower on
 * long text (up to MAX_TTS_TEXT_CHARS), so it gets a longer upper bound.
 */
const GEMINI_TTS_FETCH_TIMEOUT_MS = 60_000

export function parseTtsParams(rawParams: unknown): ParsedTtsParams {
  if (!isRecord(rawParams)) {
    return { ok: false, response: invalidIpcInput('TTS payload must be an object') }
  }
  if (typeof rawParams.text !== 'string' || !rawParams.text.trim()) {
    return { ok: false, response: invalidIpcInput('Text is required') }
  }
  if (rawParams.text.length > MAX_TTS_TEXT_CHARS) {
    return { ok: false, response: invalidIpcInput('Text is too long') }
  }
  if (rawParams.voice !== undefined && (typeof rawParams.voice !== 'string' || !TTS_VOICES.has(rawParams.voice))) {
    return { ok: false, response: invalidIpcInput('Invalid TTS voice') }
  }
  if (rawParams.mode !== undefined && (typeof rawParams.mode !== 'string' || !TTS_MODES.has(rawParams.mode))) {
    return { ok: false, response: invalidIpcInput('Invalid TTS mode') }
  }
  if (rawParams.lang !== undefined && !isSafeLanguageCode(rawParams.lang)) {
    return { ok: false, response: invalidIpcInput('Invalid language') }
  }

  return {
    ok: true,
    value: {
      text: rawParams.text,
      voice: rawParams.voice as TtsParams['voice'],
      mode: rawParams.mode as TtsParams['mode'],
      lang: rawParams.lang,
    },
  }
}

function normalizeTtsMode(mode?: TtsMode): TtsMode {
  return mode === 'auto' || mode === 'premium' ? mode : 'free'
}

function getSafeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code)
    return /^[A-Z0-9_-]{1,40}$/i.test(code) ? code : 'UNKNOWN'
  }
  return 'UNKNOWN'
}

/**
 * Run `run` with an AbortSignal that fires after `timeoutMs`. A timeout surfaces
 * as an error with `code: 'TIMEOUT'` so the caller treats it as a soft failure.
 */
async function withAbortTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await run(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error('TTS request timed out'), { code: 'TIMEOUT' })
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Decide whether a provider failure is a hard failure that must be surfaced
 * (invalid key / rate limit) or a soft one that falls through to the next
 * candidate. Edge TTS needs no user key, so its failures are ALWAYS soft: a
 * WebSocket "Unexpected server response: 403/429" is a rejected Sec-MS-GEC
 * token or clock skew, not the user's API key or quota.
 */
export function classifyTtsProviderFailure(
  provider: TtsCandidate['provider'],
  error: unknown,
): 'INVALID_KEY' | 'RATE_LIMIT' | null {
  if (provider === 'edge') return null
  const record = error && typeof error === 'object'
    ? error as { code?: unknown; status?: unknown; statusCode?: unknown }
    : {}
  if (record.code === 'INVALID_KEY' || record.code === 'RATE_LIMIT') return record.code
  const status = typeof record.status === 'number'
    ? record.status
    : typeof record.statusCode === 'number' ? record.statusCode : undefined
  if (status === 401 || status === 403) return 'INVALID_KEY'
  if (status === 429) return 'RATE_LIMIT'
  if (status !== undefined) return null
  // Message fallback for SDK errors without a status field (word-boundary only).
  const msg = error instanceof Error ? error.message : ''
  if (/\b(?:401|403)\b|invalid_api_key|API_KEY_INVALID/.test(msg)) return 'INVALID_KEY'
  if (/\b429\b|RESOURCE_EXHAUSTED/.test(msg)) return 'RATE_LIMIT'
  return null
}

// ── Provider ranking ──────────────────────────────────────────────────────────

/**
 * Returns an ordered list of TTS candidates to try for the selected mode.
 */
export function rankTtsCandidates(
  openaiKey: string | null,
  geminiKey: string | null,
  elevenlabsKey: string | null,
  mode: TtsMode,
): TtsCandidate[] {
  const candidates: TtsCandidate[] = []

  const addOpenAI = () => {
    if (!openaiKey) return
    candidates.push({
      provider: 'openai',
      reason: 'tts-1 — high-quality natural voices',
    })
  }

  const addGemini = () => {
    if (!geminiKey) return
    candidates.push({
      provider: 'gemini',
      reason: `${GEMINI_TTS_MODEL} — Aoede voice, WAV output`,
    })
  }

  const addElevenLabs = () => {
    if (!elevenlabsKey) return
    candidates.push({
      provider: 'elevenlabs',
      reason: 'eleven_multilingual_v2 — premium quality',
    })
  }

  const addEdge = () => {
    candidates.push({
      provider: 'edge',
      reason: 'Microsoft Edge TTS — free, no API key required',
    })
  }

  if (mode === 'free') {
    addEdge()
    return candidates
  }

  if (mode === 'auto') {
    addEdge()
    addOpenAI()
    addGemini()
    addElevenLabs()
    return candidates
  }

  addOpenAI()
  addGemini()
  addElevenLabs()
  addEdge()
  return candidates
}

export function getEdgeVoiceForLang(lang?: string): string {
  if (!lang || lang === 'auto') return EDGE_TTS_DEFAULT_VOICE
  return EDGE_TTS_VOICE_BY_LANG[lang] ?? EDGE_TTS_DEFAULT_VOICE
}

function getEdgeXmlLang(lang?: string): string {
  const voice = getEdgeVoiceForLang(lang)
  const [language, region] = voice.split('-')
  return language && region ? `${language}-${region}` : 'en-US'
}

// ── OpenAI TTS ────────────────────────────────────────────────────────────────

async function ttsWithOpenAI(
  text: string,
  voice: TtsParams['voice'] = 'nova',
  apiKey: string,
): Promise<TtsResult> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey })

  return withAbortTimeout(TTS_FETCH_TIMEOUT_MS, async (signal) => {
    const response = await client.audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice,
      input: text,
      response_format: 'mp3',
    }, { signal })

    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    return { success: true, audioBase64: base64, mimeType: 'audio/mpeg', provider: 'openai' }
  })
}

// ── Edge TTS (Microsoft Neural TTS — free) ────────────────────────────────────
//
// Ports the DRM + WebSocket protocol from my-translator's edge_tts.rs to Node.js.
// Microsoft's browser speech service requires a time-based DRM token (Sec-MS-GEC)
// plus specific headers (Origin, User-Agent, Cookie) to accept the connection.

/**
 * Generate the Sec-MS-GEC DRM token value.
 * Algorithm (ported from Python/Rust open-source implementations):
 *   1. Get current Unix timestamp (seconds).
 *   2. Add Windows epoch offset (11,644,473,600) to get Windows file time.
 *   3. Round down to the nearest 5 minutes (ticks % 300 == 0).
 *   4. Multiply by 1e7 to convert seconds → 100-nanosecond intervals.
 *   5. SHA-256 hash of "{ticks_100ns}{TRUSTED_CLIENT_TOKEN}".
 *   6. Return uppercase hex.
 * BigInt arithmetic avoids floating-point precision loss on large values.
 */
function generateSecMsGec(): string {
  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const winEpoch = BigInt(EDGE_TTS_WIN_EPOCH)
  let ticks = nowSec + winEpoch
  ticks = ticks - (ticks % 300n)            // round down to 5-minute boundary
  const ticks100ns = ticks * 10_000_000n    // seconds → 100-nanosecond intervals
  const payload = `${ticks100ns}${EDGE_TTS_TRUSTED_TOKEN}`
  return crypto.createHash('sha256').update(payload).digest('hex').toUpperCase()
}

/**
 * Synthesize text using Microsoft Edge TTS.
 * Connects via WebSocket, sends a SSML request, collects binary audio chunks,
 * and returns base64-encoded MP3.
 */
async function ttsWithEdge(text: string, lang?: string): Promise<TtsResult> {
  return new Promise((resolve, reject) => {
    const voice = getEdgeVoiceForLang(lang)
    const xmlLang = getEdgeXmlLang(lang)
    const secMsGec = generateSecMsGec()
    const connId = crypto.randomUUID().replace(/-/g, '')
    const muid = crypto.randomBytes(16).toString('hex').toUpperCase()

    const url = [
      `${EDGE_TTS_WS_URL}`,
      `?TrustedClientToken=${EDGE_TTS_TRUSTED_TOKEN}`,
      `&ConnectionId=${connId}`,
      `&Sec-MS-GEC=${secMsGec}`,
      `&Sec-MS-GEC-Version=1-${EDGE_TTS_CHROMIUM_FULL}`,
    ].join('')

    const ws = new WebSocket(url, {
      headers: {
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${EDGE_TTS_CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${EDGE_TTS_CHROMIUM_MAJOR}.0.0.0`,
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: `muid=${muid};`,
      },
    })

    const audioChunks: Buffer[] = []
    let gotTurnEnd = false

    // Safety timeout — close connection if no response within 8 s.
    // Reduced from 30 s so a stale Edge TTS connection fails quickly and
    // the provider fallback chain (Gemini → Edge → ElevenLabs) can kick in
    // without blocking the TTS pipeline for half a minute.
    const timeout = setTimeout(() => {
      ws.terminate()
      reject(new Error('Edge TTS: connection timeout'))
    }, EDGE_TTS_TIMEOUT_MS)

    ws.on('open', () => {
      // 1. Send speech.config
      const ts = new Date().toUTCString()
      const configMsg = [
        `X-Timestamp:${ts}`,
        'Content-Type:application/json; charset=utf-8',
        'Path:speech.config',
        '',
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: 'false',
                  wordBoundaryEnabled: 'false',
                },
                // Lower bitrate: 32 kbps vs 48 kbps — ~33% smaller file, measurably
                // faster to transfer over IPC without noticeable quality loss for TTS.
                outputFormat: 'audio-16khz-32kbitrate-mono-mp3',
              },
            },
          },
        }),
      ].join('\r\n')
      ws.send(configMsg)

      // 2. Send SSML
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
      const ssml = [
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'>`,
        `<voice name='${voice}'>`,
        `<prosody pitch='+0Hz' rate='${EDGE_TTS_DEFAULT_RATE}' volume='+0%'>${escaped}</prosody>`,
        `</voice></speak>`,
      ].join('')

      const reqId = crypto.randomUUID().replace(/-/g, '')
      const ssmlMsg = [
        `X-RequestId:${reqId}`,
        'Content-Type:application/ssml+xml',
        `X-Timestamp:${new Date().toUTCString()}Z`,
        'Path:ssml',
        '',
        ssml,
      ].join('\r\n')
      ws.send(ssmlMsg)
    })

    ws.on('message', (data: Buffer | string, isBinary: boolean) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as unknown as ArrayBuffer)
        // Binary message format: 2-byte big-endian header length + header + audio data
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0)
          const audioStart = 2 + headerLen
          if (buf.length > audioStart) {
            audioChunks.push(buf.slice(audioStart))
          }
        }
      } else {
        const msg = data.toString()
        if (msg.includes('Path:turn.end')) {
          gotTurnEnd = true
          ws.close()
        }
      }
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      // A close without turn.end means the stream was cut off: never return
      // truncated audio as a success.
      if (gotTurnEnd && audioChunks.length > 0) {
        const combined = Buffer.concat(audioChunks)
        resolve({
          success: true,
          audioBase64: combined.toString('base64'),
          mimeType: 'audio/mpeg',
          provider: 'edge',
        })
      } else if (audioChunks.length > 0) {
        reject(new Error('Edge TTS: connection closed before turn.end (truncated audio)'))
      } else {
        reject(new Error('Edge TTS: no audio received'))
      }
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

// ── Gemini TTS ────────────────────────────────────────────────────────────────

/**
 * Synthesize text using Google Gemini TTS REST API.
 * Uses gemini-2.5-flash-preview-tts with the Aoede prebuilt voice.
 * Returns base64-encoded WAV audio.
 *
 * Request shape:
 *   POST /v1beta/models/{model}:generateContent  (x-goog-api-key header)
 *   { contents: [{parts:[{text}]}], generationConfig: { responseModalities:['AUDIO'],
 *     speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } }
 *
 * Response shape:
 *   { candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }
 */
async function ttsWithGemini(text: string, apiKey: string): Promise<TtsResult> {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_TTS_MODEL}:generateContent`

  return withAbortTimeout(GEMINI_TTS_FETCH_TIMEOUT_MS, async (signal) => {
    const response = await fetch(url, {
      method: 'POST',
      // Key travels in a header, never in the URL (URLs end up in logs/errors).
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE_NAME },
            },
          },
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      const status = response.status
      if (status === 401 || status === 403 || (status === 400 && errText.includes('API_KEY_INVALID'))) {
        throw Object.assign(new Error('Gemini TTS: invalid API key'), { code: 'INVALID_KEY', status })
      }
      if (status === 429) {
        throw Object.assign(new Error('Gemini TTS: rate limit exceeded'), { code: 'RATE_LIMIT', status })
      }
      throw Object.assign(new Error(`Gemini TTS HTTP ${status}`), { status })
    }

    // biome-ignore lint/suspicious/noExplicitAny: Gemini REST response shape
    const data: any = await response.json()
    const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData
    if (!inlineData?.data) {
      throw new Error('Gemini TTS: no audio data in response')
    }

    return {
      success: true,
      audioBase64: inlineData.data as string,
      mimeType: (inlineData.mimeType as string) ?? 'audio/wav',
      provider: 'gemini',
    }
  })
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

/**
 * Synthesize text using ElevenLabs REST API.
 * Uses eleven_multilingual_v2 model for best cross-language quality.
 */
async function ttsWithElevenLabs(
  text: string,
  apiKey: string,
  voiceId = ELEVENLABS_DEFAULT_VOICE_ID,
): Promise<TtsResult> {
  const url = `${ELEVENLABS_API_BASE}/v1/text-to-speech/${voiceId}`

  return withAbortTimeout(TTS_FETCH_TIMEOUT_MS, async (signal) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      signal,
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_TTS_MODEL,
        voice_settings: {
          stability: ELEVENLABS_STABILITY,
          similarity_boost: ELEVENLABS_SIMILARITY_BOOST,
          style: ELEVENLABS_STYLE,
          use_speaker_boost: true,
        },
      }),
    })

    if (!response.ok) {
      const status = response.status
      if (status === 401) throw Object.assign(new Error('ElevenLabs: invalid API key'), { code: 'INVALID_KEY', status })
      if (status === 429) throw Object.assign(new Error('ElevenLabs: rate limit exceeded'), { code: 'RATE_LIMIT', status })
      throw Object.assign(new Error(`ElevenLabs TTS HTTP ${status}`), { status })
    }

    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    return { success: true, audioBase64: base64, mimeType: 'audio/mpeg', provider: 'elevenlabs' }
  })
}

export async function synthesizeTts(params: TtsParams): Promise<TtsResult> {
  const { text, voice = 'nova', lang } = params
  const mode = normalizeTtsMode(params.mode)
  console.log('[tts] Request:', {
    textLength: text.length,
    mode,
    hasVoice: Boolean(voice),
    hasLang: Boolean(lang),
  })

  const openaiKey     = getStoredApiKey('openai')
  const geminiKey     = getStoredApiKey('gemini')
  const elevenlabsKey = getStoredApiKey('elevenlabs')

  const candidates = rankTtsCandidates(openaiKey, geminiKey, elevenlabsKey, mode)

  console.log(
    '[tts] Candidate order:',
    candidates.map((c, i) => `${i + 1}. ${c.provider} — ${c.reason}`).join(' | '),
  )

  for (const candidate of candidates) {
    console.log(`[tts] Trying ${candidate.provider}`)
    try {
      if (candidate.provider === 'openai' && openaiKey) {
        const result = await ttsWithOpenAI(text, voice, openaiKey)
        console.log('[tts] ✓ OpenAI TTS succeeded')
        return result
      }

      if (candidate.provider === 'gemini' && geminiKey) {
        const result = await ttsWithGemini(text, geminiKey)
        console.log('[tts] ✓ Gemini TTS succeeded')
        return result
      }

      if (candidate.provider === 'edge') {
        const result = await ttsWithEdge(text, lang)
        console.log('[tts] ✓ Edge TTS succeeded')
        return result
      }

      if (candidate.provider === 'elevenlabs' && elevenlabsKey) {
        const result = await ttsWithElevenLabs(text, elevenlabsKey)
        console.log('[tts] ✓ ElevenLabs TTS succeeded')
        return result
      }
    } catch (err) {
      console.warn(`[tts] ${candidate.provider} TTS failed:`, { code: getSafeErrorCode(err) })

      // Hard failures — surface immediately without trying next provider.
      // Edge failures are never hard (see classifyTtsProviderFailure).
      const hard = classifyTtsProviderFailure(candidate.provider, err)
      if (hard === 'INVALID_KEY') {
        return {
          success: false,
          error: `Invalid ${candidate.provider} API key.`,
          errorCode: 'INVALID_KEY',
        }
      }
      if (hard === 'RATE_LIMIT') {
        return {
          success: false,
          error: `${candidate.provider} rate limit exceeded.`,
          errorCode: 'RATE_LIMIT',
        }
      }

      // Soft failure — try next candidate
      console.warn(`[tts] Soft failure on ${candidate.provider}, falling through to next candidate`)
    }
  }

  // All candidates failed
  return {
    success: false,
    error: 'All TTS providers failed. Check your connection and try again.',
    errorCode: 'NETWORK',
  }
}

// ── IPC handler ───────────────────────────────────────────────────────────────

/**
 * Register all Text-to-Speech IPC handlers with the Electron main process.
 *
 * Handler: `audio:tts`
 *   - Params: `{ text: string, voice?: OpenAI voice name, mode?: 'free'|'auto'|'premium', lang?: string }`
 *   - Returns: `{ success, audioBase64?, mimeType?, provider?, error?, errorCode? }`
 *
 * Provider selection:
 *  - free: Edge only, never touches paid API keys.
 *  - auto: Edge first, then paid providers only if Edge fails.
 *  - premium: paid providers first, then Edge fallback.
 *
 * Hard failures (invalid key, rate limit) are surfaced immediately.
 * Soft failures (network, temporary) fall through to the next provider.
 */
export function registerTtsHandlers(ipcMain: IpcMain) {
  ipcMain.handle('audio:tts', async (_event, rawParams: unknown): Promise<TtsResult> => {
    const parsed = parseTtsParams(rawParams)
    if (!parsed.ok) return parsed.response
    return synthesizeTts(parsed.value)
  })
}
