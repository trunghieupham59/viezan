import type { IpcMain } from 'electron'
import {
  blockedSafetyError,
  classifyProviderError,
  emptyResponseError,
  invalidResponseError,
  noApiKeyResponse,
  truncatedOutputError,
} from './errorUtils'
import {
  ANTHROPIC_API_BASE, ANTHROPIC_API_VERSION,ANTHROPIC_MODELS_LIMIT,
  CHAT_IMAGE_EDIT_TIMEOUT_MS,
  GEMINI_API_BASE, GEMINI_IMAGE_EDIT_MODEL,
  GEMINI_MODELS_PAGE_SIZE,
  MAX_CHAT_OUTPUT_TOKENS, MAX_IMAGE_BASE64_CHARS,
  VISION_DISCOVERY_TIMEOUT_MS,VISION_SCORE_BASIC,VISION_SCORE_CAPABLE,
  VISION_SCORE_CHEAP, VISION_SCORE_GEN_WEIGHT, VISION_SCORE_LITE_PENALTY,VISION_SCORE_MID,
  VISION_SCORE_SLOW,
} from './ipcConstants'
import { invalidIpcInput, isNonEmptyString, isRecord, isSafeLanguageCode, isSafeTargetLanguageCode, parseProviderModel } from './ipcValidation'
import { langName } from './languageNames'
import { getStoredApiKey } from './storage'
import { joinClaudeText } from './translateProviderOutput'

/** Allowed image MIME types for Gemini image-edit (whitelist prevents injection via IPC). */
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** Returns a fetch with a timeout via AbortController. Rejects with AbortError on timeout/cancel. */
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    })
}

/**
 * Run `task` with a hard deadline covering the whole operation (request AND body read).
 * A deadline hit rejects with a plain "timed out" Error, never an AbortError, so it cannot be
 * mistaken for a user cancellation; only `parentSignal` aborts surface as aborts.
 */
async function runWithDeadline<T>(
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onParentAbort = () => controller.abort()
  if (parentSignal?.aborted) controller.abort()
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true })
  try {
    return await task(controller.signal)
  } catch (error) {
    if (timedOut && !parentSignal?.aborted) throw new Error(`Request timed out after ${timeoutMs / 1000}s`)
    throw error
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', onParentAbort)
  }
}

// ── Vision model discovery (no hardcoded model IDs) ───────────────────────────

/**
 * Patterns that indicate a model is NOT capable of image/vision input.
 * Used to filter out TTS, embedding, reasoning-only, and generation-only models.
 */
const NON_VISION_PATTERN = /tts|embed|aqa|image-generation|learnlm|thinking|whisper|dall-?e|moderation|realtime|transcribe|instruct|codex/i

/**
 * Explicit "this model cannot take images" wordings. Deliberately narrow: bare words such as
 * "vision", "not enabled" or "does not support" also appear in unrelated errors (quota, org
 * settings, streaming) and must not trigger a fallback that re-sends the user's image.
 */
const VISION_UNSUPPORTED_PATTERNS = [
  // OpenAI: "Invalid content type. image_url is only supported by certain models."
  /image_url.*(?:only )?supported/,
  /only supported by certain models/,
  /image input/,
  /image modality/,
  /modality.{0,40}(?:not|unsupported)/,
  /does not support (?:image|vision|multimodal)/,
  /(?:vision|multimodal).{0,40}(?:not supported|unsupported|not enabled|not available)/,
  /(?:not supported|unsupported|not enabled|not available).{0,40}(?:vision|multimodal|image)/,
]

/** Returns true if the error indicates the model does not support image/vision input. */
function isVisionUnsupportedError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return VISION_UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(lower))
}

/**
 * Returns true if the error indicates the model does not exist / was deprecated.
 * These errors are retryable — try the next fallback model.
 */
function isModelNotFoundError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return lower.includes('not_found_error') || lower.includes('model not found') ||
    lower.includes('no such model') || lower.includes('does not exist') ||
    (lower.includes('404') && lower.includes('model'))
}

/**
 * Score a model for vision fallback selection: higher score = cheaper/faster (preferred).
 * Used to sort the dynamically-fetched model list so cheap models are tried first.
 */
function scoreModelForVision(provider: string, modelId: string): number {
  const id = modelId.toLowerCase()
  let score = 0

  if (provider === 'gemini') {
    if (id.includes('flash'))      score += VISION_SCORE_CHEAP
    else if (id.includes('pro'))   score += VISION_SCORE_CAPABLE
    if (id.includes('lite') || id.includes('nano')) score -= VISION_SCORE_LITE_PENALTY
    // Bonus per generation number: gemini-2 > gemini-1.5 > gemini-1
    const gen = id.match(/gemini-(\d+)\.?(\d*)/)
    if (gen) score += parseFloat(`${gen[1]}.${gen[2] || 0}`) * VISION_SCORE_GEN_WEIGHT
  } else if (provider === 'claude') {
    if (id.includes('haiku'))       score += VISION_SCORE_CHEAP
    else if (id.includes('sonnet')) score += VISION_SCORE_MID
    else if (id.includes('opus'))   score += VISION_SCORE_SLOW
    // Newer versions preferred (claude-3-7 > claude-3-5 > claude-3)
    const ver = id.match(/claude-(\d+)-?(\d*)/)
    if (ver) score += parseFloat(`${ver[1]}.${ver[2] || 0}`) * VISION_SCORE_GEN_WEIGHT
  } else if (provider === 'openai') {
    if (id.includes('mini'))          score += VISION_SCORE_CHEAP
    else if (id.includes('4o'))       score += VISION_SCORE_MID
    else if (id.startsWith('gpt-4'))  score += VISION_SCORE_BASIC
    // gpt-3.5 / o1 / o3 don't support vision — give zero so they're excluded
    if (id.includes('3.5') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) score = 0
  }

  return score
}

/**
 * Fetch vision-capable models for a provider from its API, sorted cheapest/fastest first.
 * Returns an empty array on any error (fail silently — the caller handles graceful degradation).
 * No hardcoded model IDs — the list is always fresh from the provider's models API.
 */
async function fetchVisionModels(provider: string, apiKey: string): Promise<string[]> {
  try {
    let ids: string[] = []

    if (provider === 'gemini') {
      // Pass API key via header (x-goog-api-key) instead of query string so the
      // key never ends up in URLs that may be logged by fetch errors, proxies, or stack traces.
      const url = `${GEMINI_API_BASE}/models?pageSize=${GEMINI_MODELS_PAGE_SIZE}`
      const res = await fetchWithTimeout(url, { headers: { 'x-goog-api-key': apiKey } }, VISION_DISCOVERY_TIMEOUT_MS)
      if (!res.ok) return []
      const data = await res.json() as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>
      }
      ids = (data.models ?? [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .filter(id => id.startsWith('gemini-') && !NON_VISION_PATTERN.test(id))
    } else if (provider === 'claude') {
      const res = await fetchWithTimeout(
        `${ANTHROPIC_API_BASE}/v1/models?limit=${ANTHROPIC_MODELS_LIMIT}`,
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
            'content-type': 'application/json',
          },
        },
        VISION_DISCOVERY_TIMEOUT_MS,
      )
      if (!res.ok) return []
      const data = await res.json() as { data?: Array<{ id: string }> }
      ids = (data.data ?? [])
        .map(m => m.id)
        .filter(id => id.startsWith('claude') && !NON_VISION_PATTERN.test(id))
    } else if (provider === 'openai') {
      const OpenAI = (await import('openai')).default
      // Pass timeout to the client so models.list() respects VISION_DISCOVERY_TIMEOUT_MS
      const client = new OpenAI({ apiKey, timeout: VISION_DISCOVERY_TIMEOUT_MS })
      const response = await client.models.list()
      ids = response.data
        .map(m => m.id)
        .filter(id => {
          const lower = id.toLowerCase()
          // Only gpt-4+ family supports vision; gpt-3.5 and reasoning models do not
          return lower.startsWith('gpt-4') && !NON_VISION_PATTERN.test(id)
        })
    }

    // R-PRF-02: precompute scores once to avoid O(n log n × 2) calls in sort comparator
    const scored = ids.map(id => ({ id, score: scoreModelForVision(provider, id) }))
    return scored
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.id)
  } catch (err) {
    // Only log the message — full error objects may include URLs/headers that leak API keys.
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`fetchVisionModels(${provider}) failed: ${msg.slice(0, 200)}`)
    return []
  }
}

// DUP-02: Removed local `getApiKey` wrapper — call getStoredApiKey directly.
// HC-06: Gemini base URL now uses GEMINI_API_BASE constant.
// HC-02: Token limits now use MAX_CHAT_OUTPUT_TOKENS constant.

interface ImageTranslateParams {
  provider: string
  model: string
  requestId?: string
  imageBase64: string
  imageMimeType: string
  sourceLang: string
  targetLang: string
  /**
   * Explicit opt-in to retry on ANOTHER provider (which uploads the image to that provider)
   * when no model of the selected provider can read images. Default: false.
   */
  allowProviderFallback: boolean
}

type ParsedImageTranslateParams =
  | { ok: true; value: ImageTranslateParams }
  | { ok: false; response: { success: false; error: string; errorCode?: string } }

const MAX_IMAGE_MODEL_ID_CHARS = 200

function parseImageTranslateParams(rawParams: unknown): ParsedImageTranslateParams {
  const providerModel = parseProviderModel(rawParams, {
    payloadName: 'Image translate',
    maxModelChars: MAX_IMAGE_MODEL_ID_CHARS,
  })
  if (!providerModel.ok) return providerModel
  const { provider, model } = providerModel.value
  const params = providerModel.params

  if (!isNonEmptyString(params.imageBase64)) {
    return { ok: false, response: invalidIpcInput('No image data provided') }
  }
  if (params.imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return {
      ok: false,
      response: {
        success: false,
        error: `Image payload exceeds maximum size (${Math.round(MAX_IMAGE_BASE64_CHARS / 1024 / 1024)} MB)`,
        errorCode: 'PAYLOAD_TOO_LARGE',
      },
    }
  }
  if (params.requestId !== undefined && !isNonEmptyString(params.requestId)) {
    return { ok: false, response: invalidIpcInput('Invalid request id') }
  }
  if (!isNonEmptyString(params.imageMimeType) || !ALLOWED_IMAGE_MIME_TYPES.has(params.imageMimeType)) {
    return { ok: false, response: invalidIpcInput('Unsupported image MIME type') }
  }
  if (!isSafeLanguageCode(params.sourceLang)) {
    return { ok: false, response: invalidIpcInput('Invalid source language') }
  }
  if (!isSafeTargetLanguageCode(params.targetLang)) {
    return { ok: false, response: invalidIpcInput('Invalid target language') }
  }
  if (params.allowProviderFallback !== undefined && typeof params.allowProviderFallback !== 'boolean') {
    return { ok: false, response: invalidIpcInput('Invalid allowProviderFallback flag') }
  }

  return {
    ok: true,
    value: {
      provider,
      model,
      requestId: typeof params.requestId === 'string' ? params.requestId : undefined,
      imageBase64: params.imageBase64,
      imageMimeType: params.imageMimeType,
      sourceLang: params.sourceLang,
      targetLang: params.targetLang,
      allowProviderFallback: params.allowProviderFallback === true,
    },
  }
}

export interface TextRegion {
  x: number        // 0.0–1.0 fraction of image width
  y: number        // 0.0–1.0 fraction of image height
  width: number    // 0.0–1.0 fraction of image width
  height: number   // 0.0–1.0 fraction of image height
  originalText: string
  translatedText: string
  fontSize: number  // 0.0–1.0 fraction of image height
  bgColor: string   // estimated background color hex
  textColor: string // estimated text color hex
}

const MAX_REGION_TEXT_CHARS = 5_000
const DEFAULT_REGION_FONT_SIZE = 0.04
const DEFAULT_REGION_BG_COLOR = '#ffffff'
const DEFAULT_REGION_TEXT_COLOR = '#000000'
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** Slice out the bracket-balanced array starting at `start` (string-aware). null if it never closes. */
function extractBalancedArray(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** An empty array ("no text found") or one containing at least one region-like object. */
function looksLikeRegionArray(value: unknown[]): boolean {
  return value.length === 0 || value.some((item) => isRecord(item) && 'translatedText' in item)
}

/**
 * Find the first valid JSON array in a model answer (markdown fences and prose are tolerated).
 * Returns the parsed array, 'truncated' when an array starts but never closes, or null.
 */
function findJsonArray(text: string): unknown[] | 'truncated' | null {
  let sawUnclosed = false
  for (let start = text.indexOf('['); start !== -1; start = text.indexOf('[', start + 1)) {
    const candidate = extractBalancedArray(text, start)
    if (candidate === null) {
      sawUnclosed = true
      continue
    }
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (Array.isArray(parsed) && looksLikeRegionArray(parsed)) return parsed
    } catch {
      // Not JSON (e.g. a "[Note]" in prose) — keep scanning.
    }
    // JSON but not a region list (prose such as "[1]" or "[true]") — keep scanning.
  }
  return sawUnclosed ? 'truncated' : null
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function clamp01(value: unknown): number | null {
  const n = toFiniteNumber(value)
  return n === null ? null : Math.min(1, Math.max(0, n))
}

/** Tolerance for models that overshoot 1.0 by rounding (1.0004 is still a fraction). */
const FRACTION_TOLERANCE = 1.001
/** A single overshooting box in an otherwise fractional answer is clamped up to this, dropped beyond it. */
const FRACTION_OUTLIER_CLAMP_MAX = 1.5
/** Largest value read as a percentage (0-100). Anything above is pixel units and cannot be placed. */
const PERCENT_MAX = 100

type GeometryUnit = 'fraction' | 'percent' | 'invalid'

function classifyGeometry(values: number[]): GeometryUnit {
  const peak = Math.max(...values)
  if (peak <= FRACTION_TOLERANCE) return 'fraction'
  return peak <= PERCENT_MAX ? 'percent' : 'invalid'
}

/**
 * Validate and clamp raw model output into usable regions; unusable entries are dropped.
 *
 * Geometry is expected as 0-1 fractions. Models sometimes answer in percentages (0-100) or pixels:
 * when most boxes carry a value above 1.0 and every value is at most 100 the whole answer is read as
 * percentages (divided by 100); boxes with values above 100 (pixel units) are dropped rather than
 * clamped into a bogus full-image box, which makes an all-pixel answer an INVALID_RESPONSE.
 */
function sanitizeRegions(raw: unknown[]): TextRegion[] {
  const candidates: Array<{ item: Record<string, unknown>; values: number[]; unit: GeometryUnit }> = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const values = [item.x, item.y, item.width, item.height].map(toFiniteNumber)
    if (values.some((v) => v === null)) continue
    const numbers = values as number[]
    candidates.push({ item, values: numbers, unit: classifyGeometry(numbers) })
  }
  const percentMode = candidates.filter((c) => c.unit === 'percent').length > candidates.filter((c) => c.unit === 'fraction').length

  const regions: TextRegion[] = []
  for (const { item, values, unit } of candidates) {
    let scale = 1
    if (percentMode) {
      if (unit === 'invalid') continue
      scale = 1 / PERCENT_MAX
    } else if (unit === 'invalid' || (unit === 'percent' && Math.max(...values) > FRACTION_OUTLIER_CLAMP_MAX)) {
      continue
    }
    const [x, y, width, height] = values.map((v) => clamp01(v * scale)) as number[]
    if (typeof item.translatedText !== 'string' || !item.translatedText.trim()) continue
    const fontSize = clamp01(item.fontSize)
    regions.push({
      x,
      y,
      // A box may not extend past the image edge.
      width: Math.min(width, 1 - x),
      height: Math.min(height, 1 - y),
      originalText: typeof item.originalText === 'string' ? item.originalText.slice(0, MAX_REGION_TEXT_CHARS) : '',
      translatedText: item.translatedText.slice(0, MAX_REGION_TEXT_CHARS),
      fontSize: fontSize !== null && fontSize > 0 ? fontSize : DEFAULT_REGION_FONT_SIZE,
      bgColor: typeof item.bgColor === 'string' && HEX_COLOR_PATTERN.test(item.bgColor.trim()) ? item.bgColor.trim() : DEFAULT_REGION_BG_COLOR,
      textColor: typeof item.textColor === 'string' && HEX_COLOR_PATTERN.test(item.textColor.trim()) ? item.textColor.trim() : DEFAULT_REGION_TEXT_COLOR,
    })
  }
  return regions.filter((region) => region.width > 0 && region.height > 0)
}

/**
 * Turn a provider's text answer into regions.
 *  - `[]` from the model means "no text found" and is a legitimate empty success.
 *  - Empty answer, truncated output, unparseable output, or an array with no usable region throw
 *    a structured error instead of masquerading as "no text found".
 */
function parseRegionsFromText(provider: string, text: string, truncated: boolean): TextRegion[] {
  if (truncated) throw truncatedOutputError(provider)
  const trimmed = text.trim()
  if (!trimmed) throw emptyResponseError(provider)

  const found = findJsonArray(trimmed)
  if (found === 'truncated') throw truncatedOutputError(provider)
  if (found === null) throw invalidResponseError(provider, 'no JSON array found')
  if (found.length === 0) return []

  const regions = sanitizeRegions(found)
  if (regions.length === 0) throw invalidResponseError(provider, 'no usable text region')
  return regions
}

function buildPrompt(sourceLang: string, targetLang: string): string {
  const sourceName = langName(sourceLang)
  const targetName = langName(targetLang)
  return `You are an expert OCR and translation assistant. Analyze this image and extract ALL visible text, then translate it to ${targetName}.

Step 1 — OCR: Read every piece of visible text in the image in reading order (top-to-bottom, left-to-right). Group lines that belong to the same logical block (e.g. one chat message = one block).

Step 2 — Translate: Translate each text block from ${sourceName} to ${targetName}. Produce natural, fluent ${targetName} — not word-for-word. Preserve the meaning and tone.

Return ONLY a JSON array (no markdown fences, no explanation) using this exact schema:
[
  {
    "x": 0.05,
    "y": 0.10,
    "width": 0.90,
    "height": 0.08,
    "originalText": "original text here",
    "translatedText": "translated text here",
    "fontSize": 0.05,
    "bgColor": "#1a1a1a",
    "textColor": "#ffffff"
  }
]

Rules:
- x, y, width, height are decimal fractions (0.0–1.0) of image dimensions (x=left, y=top)
- Group consecutive lines of the same message/paragraph into ONE region — do NOT split into tiny pieces
- The bounding box must fully cover the original text area (add small padding)
- fontSize = fraction of image height (e.g. 0.04 = 4% of image height)
- bgColor = dominant background color behind the text (hex)
- textColor = color of the text itself (hex)
- translatedText MUST be a complete, high-quality ${targetName} translation — this is the most important field
- If no text is found, return: []
- Return ONLY valid JSON. No extra text.`
}

/** Edited image returned by the Gemini image-edit model. */
export interface GeminiEditedImage {
  imageBase64: string
  /** MIME type reported by Gemini for the edited image (falls back to the input MIME type). */
  mimeType: string
}

interface GeminiInlineData {
  data?: string
  mimeType?: string
  mime_type?: string
}

/**
 * Use Gemini image-generation/editing model to translate text inside the image directly.
 * Returns the edited image (base64 + MIME type) with translated text rendered by Gemini.
 * Returns null if the model does not return an image part.
 */
async function translateImageWithGeminiEdit(
  apiKey: string,
  imageBase64: string,
  imageMimeType: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<GeminiEditedImage | null> {
  // R-SEC-02: Whitelist validate MIME type before embedding in JSON request body
  if (!ALLOWED_IMAGE_MIME_TYPES.has(imageMimeType)) {
    throw new Error(`Unsupported image MIME type: ${imageMimeType}`)
  }

  // HC-06: Use GEMINI_API_BASE instead of hardcoded URL prefix.
  // API key passed via x-goog-api-key header (not query string) so it cannot leak via URL logging.
  const url = `${GEMINI_API_BASE}/models/${GEMINI_IMAGE_EDIT_MODEL}:generateContent`
  const sourceName = langName(sourceLang)
  const targetName = langName(targetLang)

  // We call the REST endpoint directly because the JS SDK may not yet expose
  // responseModalities in a typed way for all versions.
  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: imageMimeType,
              data: imageBase64,
            },
          },
          {
            text: `Edit this image: find every piece of ${sourceName} text visible in the image and replace it with a fluent, natural ${targetName} translation. Preserve the original font style, size, color, and background as closely as possible. Only change the text — do not alter any other visual elements. Return the edited image.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  }

  // Image editing can take minutes, so it gets the long image-edit deadline (not the 5 s
  // model-discovery one). The deadline covers the response body read as well.
  const json = await runWithDeadline(CHAT_IMAGE_EDIT_TIMEOUT_MS, signal, async (deadlineSignal) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: deadlineSignal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Gemini image edit failed: ${res.status} ${errText}`)
    }

    return await res.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string
            inlineData?: GeminiInlineData
            inline_data?: GeminiInlineData
          }>
        }
      }>
    }
  })

  // REST responses use camelCase (`inlineData` / `mimeType`); tolerate snake_case as well.
  const parts = json.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    const inlineData = part.inlineData ?? part.inline_data
    if (inlineData?.data) {
      const mimeType = inlineData.mimeType ?? inlineData.mime_type
      return {
        imageBase64: inlineData.data, // base64 of the edited image
        mimeType: mimeType && ALLOWED_IMAGE_MIME_TYPES.has(mimeType) ? mimeType : imageMimeType,
      }
    }
  }
  return null
}

async function translateImageWithGemini(
  apiKey: string,
  model: string,
  imageBase64: string,
  imageMimeType: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<TextRegion[]> {
  if (signal?.aborted) throw new Error('image-translate-cancelled')
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({ model })

  const result = await genModel.generateContent([
    {
      inlineData: {
        data: imageBase64,
        mimeType: imageMimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
      },
    },
    buildPrompt(sourceLang, targetLang),
  ], signal ? { signal } : undefined)
  if (signal?.aborted) throw new Error('image-translate-cancelled')

  const finishReason = result.response.candidates?.[0]?.finishReason
  if (finishReason && ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(finishReason)) {
    throw blockedSafetyError('gemini', `finishReason=${finishReason}`)
  }
  return parseRegionsFromText('gemini', result.response.text(), finishReason === 'MAX_TOKENS')
}

async function translateImageWithClaude(
  apiKey: string,
  model: string,
  imageBase64: string,
  imageMimeType: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<TextRegion[]> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create(
    {
      model,
      max_tokens: MAX_CHAT_OUTPUT_TOKENS,  // HC-02
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageMimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: buildPrompt(sourceLang, targetLang),
            },
          ],
        },
      ],
    },
    signal ? { signal } : undefined,
  )

  if (message.stop_reason === 'refusal') throw blockedSafetyError('claude', 'stop_reason=refusal')
  return parseRegionsFromText('claude', joinClaudeText(message.content), message.stop_reason === 'max_tokens')
}

/** Vision-capable model used when the selected OpenAI model cannot read images. */
const OPENAI_VISION_FALLBACK_MODEL = 'gpt-4o'

/**
 * gpt-4-class and older OpenAI ids that reject `image_url` content: the base gpt-4 (and its dated /
 * 32k snapshots), the *-preview turbo snapshots and every gpt-3.5 model. `gpt-4-turbo` and newer
 * (gpt-4o, gpt-4.1, ...) do accept images and are deliberately not matched.
 */
const OPENAI_NON_VISION_MODEL = /^(?:gpt-3\.5(?:-|$)|gpt-4(?:-(?:\d{4}|32k(?:-\d{4})?|turbo-preview|\d{4}-preview))?$)/i

/** Map a non-vision OpenAI model to a vision model on the same provider; other ids pass through. */
function resolveOpenAIVisionModel(model: string): string {
  return model.includes('o1') || OPENAI_NON_VISION_MODEL.test(model.trim()) ? OPENAI_VISION_FALLBACK_MODEL : model
}

async function translateImageWithOpenAI(
  apiKey: string,
  model: string,
  imageBase64: string,
  imageMimeType: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<TextRegion[]> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey })

  // Ensure we use a vision-capable model
  const visionModel = resolveOpenAIVisionModel(model)

  const completion = await client.chat.completions.create(
    {
      model: visionModel,
      max_completion_tokens: MAX_CHAT_OUTPUT_TOKENS,  // HC-02
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${imageMimeType};base64,${imageBase64}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: buildPrompt(sourceLang, targetLang),
            },
          ],
        },
      ],
    },
    signal ? { signal } : undefined,
  )

  const choice = completion.choices[0]
  if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal?.trim()) {
    throw blockedSafetyError('openai', choice.finish_reason === 'content_filter' ? 'finish_reason=content_filter' : 'refusal')
  }
  return parseRegionsFromText('openai', choice?.message?.content ?? '', choice?.finish_reason === 'length')
}

// ── Exported for unit testing ─────────────────────────────────────────────────
/** @internal — exported for unit tests only */
export {
  buildPrompt as buildImageTranslatePrompt,
  isModelNotFoundError,
  isVisionUnsupportedError,
  langName,
  parseRegionsFromText,
  resolveOpenAIVisionModel,
  runWithDeadline,
  sanitizeRegions,
  scoreModelForVision,
  translateImageWithGeminiEdit,
}

// ── Provider registry — DUP-04 / DUP-06 ──────────────────────────────────────
// Registry eliminates the switch/case dispatch block and makes the provider
// contract explicit. Per-provider functions remain separate (each SDK is different).

type ImageTranslateFn = (
  apiKey: string, model: string, imageBase64: string, imageMimeType: string,
  sourceLang: string, targetLang: string, signal?: AbortSignal
) => Promise<TextRegion[]>

const IMAGE_TRANSLATE_PROVIDERS: Record<string, ImageTranslateFn> = {
  gemini: translateImageWithGemini,
  claude: translateImageWithClaude,
  openai: translateImageWithOpenAI,
}

// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_TRANSLATE_CANCELLED_MESSAGE = 'image-translate-cancelled'
const activeImageTranslateControllers = new Map<string, AbortController>()

export function registerImageTranslateHandlers(ipcMain: IpcMain) {
  ipcMain.handle('image:translate:cancel', async (_event, rawParams: unknown) => {
    if (!isRecord(rawParams) || !isNonEmptyString(rawParams.requestId)) {
      return { success: false, error: 'INVALID_INPUT' }
    }
    const controller = activeImageTranslateControllers.get(rawParams.requestId)
    if (!controller) return { success: false, error: 'NOT_FOUND' }
    controller.abort()
    activeImageTranslateControllers.delete(rawParams.requestId)
    return { success: true }
  })

  ipcMain.handle('image:translate', async (event, rawParams: unknown) => {
    const parsed = parseImageTranslateParams(rawParams)
    if (!parsed.ok) return parsed.response
    const params = parsed.value
    const { provider, model, requestId, imageBase64, imageMimeType, sourceLang, targetLang, allowProviderFallback } = params

    if (!imageBase64) {
      return { success: false, error: 'No image data provided' }
    }

    if (provider === 'local') {
      return {
        success: false,
        error: 'Local image translation is not supported in this phase. Use local chat with image input when the selected model supports vision.',
        errorCode: 'NO_VISION',
      }
    }

    // DUP-02 + DUP-03
    const apiKey = getStoredApiKey(provider)
    if (!apiKey) return noApiKeyResponse(provider)

    if (!IMAGE_TRANSLATE_PROVIDERS[provider]) {
      return { success: false, error: `Unknown provider: ${provider}` }
    }

    const controller = requestId ? new AbortController() : null
    if (requestId && controller) activeImageTranslateControllers.set(requestId, controller)

    try {
      // ── Gemini: try image-edit model first for best quality ───────────────
      if (provider === 'gemini') {
        try {
          const edited = await translateImageWithGeminiEdit(
            apiKey, imageBase64, imageMimeType, sourceLang, targetLang, controller?.signal
          )
          if (edited) {
            return {
              success: true,
              editedImageBase64: edited.imageBase64,
              editedImageMimeType: edited.mimeType,
              regions: [],
            }
          }
        } catch (editErr) {
          // Only a caller cancellation stops here. A timeout or any other edit failure falls
          // through to the OCR + regions approach below.
          if (controller?.signal.aborted) throw editErr
          const msg = editErr instanceof Error ? editErr.message : String(editErr)
          console.warn(`Gemini image-edit failed, falling back to regions: ${msg.slice(0, 200)}`)
          // Fall through to OCR+regions approach below
        }
      }

      // ── Smart vision fallback ─────────────────────────────────────────────
      // Strategy:
      //   1. Try user's selected model first (always, regardless of type)
      //   2. On vision/not-found error → fetch available models from the same provider API,
      //      filter vision-capable, sort cheapest/fastest first, try each
      //   3. Only if the request opted in (allowProviderFallback === true): try other providers
      //      (if key available), using their dynamically-fetched vision models. Without the
      //      opt-in the user's image is never uploaded to a provider they did not select.
      // No hardcoded model IDs — always uses live data from the provider's models API.

      // Start with just the user's model; fallback candidates are fetched lazily on first failure
      const triedModels = new Set<string>()
      let fallbacksFetched = false
      const candidates: Array<{ p: string; m: string }> = [{ p: provider, m: model }]

      let regions: TextRegion[] = []
      let usedModel = model
      let usedProvider = provider
      let succeeded = false

      for (let i = 0; i < candidates.length; i++) {
        const { p, m } = candidates[i]
        const candidateKey = `${p}/${m}`
        if (triedModels.has(candidateKey)) continue
        triedModels.add(candidateKey)

        const fn = IMAGE_TRANSLATE_PROVIDERS[p]
        if (!fn) continue
        const key = p === provider ? apiKey : getStoredApiKey(p)
        if (!key) continue

        // Notify renderer immediately when switching to a fallback model/provider.
        // Guard against destroyed sender (window closed mid-fallback).
        if (m !== model || p !== provider) {
          if (!event.sender.isDestroyed()) {
            event.sender.send('image:model-switched', { model: m, provider: p })
          }
          console.info(`Image translate: switching to ${p}/${m} (requested: ${provider}/${model})`)
        }

        try {
          if (controller?.signal.aborted) throw new Error(IMAGE_TRANSLATE_CANCELLED_MESSAGE)
          regions = await fn(key, m, imageBase64, imageMimeType, sourceLang, targetLang, controller?.signal)
          usedModel = m
          usedProvider = p
          succeeded = true
          break
        } catch (err) {
          if (controller?.signal.aborted) throw err
          const msg = err instanceof Error ? err.message : String(err)
          const retryable = isVisionUnsupportedError(msg) || isModelNotFoundError(msg)

          if (!retryable) {
            // Non-retryable error (auth, rate-limit, network) → stop immediately
            throw err
          }

          console.warn(`Image translate: ${p}/${m} failed (${retryable ? 'retryable' : 'fatal'}): ${msg.slice(0, 120)}`)

          // Lazily fetch fallback candidates on first retryable failure
          if (!fallbacksFetched) {
            fallbacksFetched = true

            // Same-provider fallbacks: fetch vision models from provider API
            const sameProviderModels = await fetchVisionModels(provider, apiKey)
            for (const fb of sameProviderModels) {
              if (fb !== model) candidates.push({ p: provider, m: fb })
            }

            // Cross-provider fallbacks (explicit opt-in only): fetch other providers in parallel (R-PRF-02)
            if (allowProviderFallback) {
              const otherProviders = Object.keys(IMAGE_TRANSLATE_PROVIDERS)
                .filter(op => op !== provider)
                .map(op => ({ op, key: getStoredApiKey(op) }))
                .filter((x): x is { op: string; key: string } => !!x.key)

              const crossResults = await Promise.all(
                otherProviders.map(({ op, key }) =>
                  fetchVisionModels(op, key).then(models => ({ op, models }))
                )
              )
              for (const { op, models } of crossResults) {
                if (models.length > 0) candidates.push({ p: op, m: models[0] })
              }
            }
          }
          // Continue loop — next iteration picks the next candidate
        }
      }

      if (!succeeded) {
        // Providers that hold a stored key but were NOT tried because they would receive the image.
        const untriedProviders = allowProviderFallback
          ? []
          : Object.keys(IMAGE_TRANSLATE_PROVIDERS).filter(op => op !== provider && !!getStoredApiKey(op))
        return {
          success: false,
          error: 'No vision-capable model available. Please select a vision-capable model (e.g. gemini-2.0-flash, gpt-4o, claude-3-5-haiku).' +
            (untriedProviders.length > 0
              ? ' Other configured providers were not tried because they would receive your image; allow provider fallback to try them.'
              : ''),
          errorCode: 'NO_VISION',
          ...(untriedProviders.length > 0 ? { fallbackProviders: untriedProviders } : {}),
        }
      }

      const switched = usedModel !== model || usedProvider !== provider
      return {
        success: true,
        regions,
        ...(switched ? { usedModel, usedProvider } : {}),
      }
    } catch (error: unknown) {
      // Cancelled only when the caller's signal fired (or our own cancel marker was thrown);
      // timeouts and dropped connections are reported as such, not as a user cancel.
      if (controller?.signal.aborted || (error instanceof Error && error.message === IMAGE_TRANSLATE_CANCELLED_MESSAGE)) {
        return { success: false, error: IMAGE_TRANSLATE_CANCELLED_MESSAGE, errorCode: 'CANCELLED' }
      }
      const msg = error instanceof Error ? error.message : String(error)
      // Log only message — full error objects may include request URLs/headers containing API keys.
      console.error(`Image translation error with ${provider}: ${msg.slice(0, 200)}`)
      // DUP-01: use classifyProviderError for standard error categorization
      return classifyProviderError(error)
    } finally {
      if (requestId && activeImageTranslateControllers.get(requestId) === controller) {
        activeImageTranslateControllers.delete(requestId)
      }
    }
  })
}
