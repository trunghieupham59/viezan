/**
 * Chat image-edit module — orchestrates image generation/edit calls to the
 * two providers that support it: OpenAI (`gpt-image-1`) and Gemini
 * (image-output models).
 *
 * Responsibilities:
 *   - IPC payload validation for `chat:image-edit`
 *   - Provider-specific request building + retries (e.g. fallback Gemini model)
 *   - Result normalisation into `ChatImageEditResultPayload`
 *
 * The IPC channel registration lives in chat.ts; this module exports the
 * pure functions and the validated `parseChatImageEditParams` helper that the
 * handler calls.
 */
import {
  CHAT_IMAGE_EDIT_DEFAULT_MIME_TYPE,
  CHAT_IMAGE_EDIT_EXTENSION_BY_MIME,
  CHAT_IMAGE_EDIT_FILE_BASENAME,
  CHAT_IMAGE_EDIT_JSON_CONTENT_TYPE,
  CHAT_IMAGE_EDIT_RESPONSE_MODALITIES,
  CHAT_IMAGE_EDIT_SUPPORTED_MIME_TYPES,
  GEMINI_IMAGE_MODEL_RETRY_ERROR_MARKERS,
  MAX_CHAT_IMAGE_EDIT_MODEL_ID_CHARS,OPENAI_IMAGE_EDIT_OPTIONS 
} from './chatConfig'
import { CHAT_IMAGE_EDIT_VALIDATION_MESSAGES, CHAT_RUNTIME_MESSAGES } from './chatMessages'
import { buildChatImageEditPrompt } from './chatPrompts'
import { isValidBase64Payload, payloadTooLargeResponse } from './chatValidation'
import {
  CHAT_IMAGE_EDIT_TIMEOUT_MS,
  GEMINI_API_BASE,
  GEMINI_IMAGE_EDIT_MODELS,
  MAX_CHAT_PAYLOAD_BYTES,
  MAX_CHAT_REQUEST_CHARS,
  OPENAI_IMAGE_EDIT_MODEL,
} from './ipcConstants'
import { invalidIpcInput, isNonEmptyString, isRecord } from './ipcValidation'
import type {
  ChatImageEditFn,
  ChatImageEditResultPayload,
} from './providers/chatProviderTypes'
import { isValidProvider, unknownProviderError } from './providers/types'

// ── IPC payload typing ───────────────────────────────────────────────────────

export interface ChatImageEditParams {
  provider: string
  model: string
  prompt: string
  imageBase64: string
  imageMimeType: string
}

export type ParsedChatImageEditParams =
  | { ok: true; value: ChatImageEditParams }
  | { ok: false; response: { success: false; error: string; errorCode?: string } }

/**
 * Validate the renderer-supplied `chat:image-edit` payload.
 *
 * Performs structural + size checks; downstream provider code can therefore
 * trust the shape and concentrate on SDK semantics.
 */
export function parseChatImageEditParams(rawParams: unknown): ParsedChatImageEditParams {
  if (!isRecord(rawParams)) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.payloadMustBeObject) }
  }

  if (!isNonEmptyString(rawParams.provider)) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.providerRequired) }
  }
  const provider = rawParams.provider.trim()
  if (!isValidProvider(provider)) {
    return { ok: false, response: unknownProviderError(provider) }
  }

  if (!isNonEmptyString(rawParams.model)) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.modelRequired) }
  }
  const model = rawParams.model.trim()
  if (model.length > MAX_CHAT_IMAGE_EDIT_MODEL_ID_CHARS) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.modelTooLong) }
  }

  if (!isNonEmptyString(rawParams.prompt)) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.promptRequired) }
  }
  const prompt = rawParams.prompt.trim()
  if (prompt.length > MAX_CHAT_REQUEST_CHARS) {
    return {
      ok: false,
      response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.promptTooLong(MAX_CHAT_REQUEST_CHARS)),
    }
  }

  if (!isNonEmptyString(rawParams.imageBase64)) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.noImageData) }
  }
  // Same payload cap as `chat:send` (base64 + prompt dominate the request).
  const payloadBytes = rawParams.imageBase64.length + prompt.length
  if (payloadBytes > MAX_CHAT_PAYLOAD_BYTES) {
    return { ok: false, response: payloadTooLargeResponse(payloadBytes) }
  }
  if (
    !isNonEmptyString(rawParams.imageMimeType) ||
    !CHAT_IMAGE_EDIT_SUPPORTED_MIME_TYPES.has(rawParams.imageMimeType)
  ) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.unsupportedImageMimeType) }
  }
  if (!isValidBase64Payload(rawParams.imageBase64)) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.invalidImageData) }
  }

  return {
    ok: true,
    value: {
      provider,
      model,
      prompt,
      imageBase64: rawParams.imageBase64,
      imageMimeType: rawParams.imageMimeType,
    },
  }
}

export interface ChatImageGenerateParams {
  provider: string
  model: string
  prompt: string
}

export type ParsedChatImageGenerateParams =
  | { ok: true; value: ChatImageGenerateParams }
  | { ok: false; response: { success: false; error: string; errorCode?: string } }

/** Validate the renderer-supplied `chat:image-generate` payload (shape + length caps). */
export function parseChatImageGenerateParams(rawParams: unknown): ParsedChatImageGenerateParams {
  if (!isRecord(rawParams)) {
    return { ok: false, response: invalidIpcInput('Invalid payload') }
  }
  const provider = typeof rawParams.provider === 'string' ? rawParams.provider.trim() : ''
  const model = typeof rawParams.model === 'string' ? rawParams.model.trim() : ''
  const prompt = typeof rawParams.prompt === 'string' ? rawParams.prompt.trim() : ''
  if (!provider || !model || !prompt) {
    return { ok: false, response: invalidIpcInput('provider, model and prompt are required') }
  }
  if (model.length > MAX_CHAT_IMAGE_EDIT_MODEL_ID_CHARS) {
    return { ok: false, response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.modelTooLong) }
  }
  if (prompt.length > MAX_CHAT_REQUEST_CHARS) {
    return {
      ok: false,
      response: invalidIpcInput(CHAT_IMAGE_EDIT_VALIDATION_MESSAGES.promptTooLong(MAX_CHAT_REQUEST_CHARS)),
    }
  }
  return { ok: true, value: { provider, model, prompt } }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Max size of an image downloaded from a provider-returned URL. */
export const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024
const REMOTE_IMAGE_TIMEOUT_MS = 30_000

function getImageFileNameForMime(mimeType: string): string {
  const ext = CHAT_IMAGE_EDIT_EXTENSION_BY_MIME[mimeType] ?? mimeType.replace('image/', '')
  return `${CHAT_IMAGE_EDIT_FILE_BASENAME}.${ext}`
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'])

/** Generic binary content types accepted when the magic-byte sniff identifies an image. */
const GENERIC_BINARY_CONTENT_TYPES = new Set(['application/octet-stream', 'binary/octet-stream'])

/** Max redirect hops followed while downloading a provider-returned image URL. */
const MAX_REMOTE_IMAGE_REDIRECTS = 3

/** Identify an image by magic bytes; returns null when it is not a supported raster image. */
export function sniffImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  // ISO-BMFF (`ftyp` box at offset 4): AVIF and HEIC/HEIF share the container.
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (HEIC_BRANDS.has(brand)) return 'image/heic'
  }
  return null
}

/** Read a response body into a Buffer, aborting as soon as `maxBytes` is exceeded. */
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const tooLarge = () => new Error(CHAT_RUNTIME_MESSAGES.remoteImageTooLarge(maxBytes))
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge()

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) throw tooLarge()
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw tooLarge()
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

function parseHttpsUrl(value: string | URL): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(CHAT_RUNTIME_MESSAGES.remoteImageInvalidUrl)
  }
  if (parsed.protocol !== 'https:') throw new Error(CHAT_RUNTIME_MESSAGES.remoteImageInvalidUrl)
  return parsed
}

/**
 * Download an image a provider returned by URL. Hardened: https only on every
 * redirect hop (followed manually, at most 3), timeout that stays active while
 * the body is read, size cap, image (or generic binary) content-type and
 * magic-byte sniffing (the sniffed type wins over the header).
 */
export async function convertRemoteImageUrlToBase64(
  url: string,
): Promise<{ imageBase64: string; imageMimeType: string }> {
  let currentUrl = parseHttpsUrl(url)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS)
  try {
    let response: Response | undefined
    for (let hop = 0; hop <= MAX_REMOTE_IMAGE_REDIRECTS; hop += 1) {
      response = await fetch(currentUrl, { signal: controller.signal, redirect: 'manual' })
      if (response.status < 300 || response.status >= 400) break

      const location = response.headers.get('location')
      await response.body?.cancel().catch(() => undefined)
      if (!location || hop === MAX_REMOTE_IMAGE_REDIRECTS) {
        throw new Error(CHAT_RUNTIME_MESSAGES.openAiImageUrlDownloadFailed(response.status))
      }
      // Every hop must itself be https; relative Locations resolve against the current URL.
      let next: URL
      try {
        next = new URL(location, currentUrl)
      } catch {
        throw new Error(CHAT_RUNTIME_MESSAGES.remoteImageInvalidUrl)
      }
      currentUrl = parseHttpsUrl(next)
    }

    if (!response?.ok) {
      throw new Error(CHAT_RUNTIME_MESSAGES.openAiImageUrlDownloadFailed(response?.status ?? 0))
    }

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!contentType.startsWith('image/') && !GENERIC_BINARY_CONTENT_TYPES.has(contentType)) {
      throw new Error(CHAT_RUNTIME_MESSAGES.remoteImageNotAnImage)
    }

    const buffer = await readBodyWithLimit(response, MAX_REMOTE_IMAGE_BYTES)
    const sniffed = sniffImageMimeType(buffer)
    if (!sniffed) throw new Error(CHAT_RUNTIME_MESSAGES.remoteImageNotAnImage)
    return { imageBase64: buffer.toString('base64'), imageMimeType: sniffed }
  } finally {
    clearTimeout(timer)
  }
}

// ── OpenAI image edit ────────────────────────────────────────────────────────

export async function editChatImageWithOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
): Promise<ChatImageEditResultPayload> {
  const openaiModule = await import('openai')
  const OpenAI = openaiModule.default
  const client = new OpenAI({ apiKey, timeout: CHAT_IMAGE_EDIT_TIMEOUT_MS })
  const image = await openaiModule.toFile(
    Buffer.from(imageBase64, 'base64'),
    getImageFileNameForMime(imageMimeType),
    { type: imageMimeType },
  )

  const imageModel = resolveOpenAIImageModel(model)
  const response = await client.images.edit({
    model: imageModel,
    image,
    prompt: buildChatImageEditPrompt(prompt),
    ...OPENAI_IMAGE_EDIT_OPTIONS,
  })
  const result = response.data?.[0]

  if (result?.b64_json) {
    return {
      imageBase64: result.b64_json,
      imageMimeType: CHAT_IMAGE_EDIT_DEFAULT_MIME_TYPE,
      usedModel: imageModel,
    }
  }

  if (result?.url) {
    const downloaded = await convertRemoteImageUrlToBase64(result.url)
    return { ...downloaded, usedModel: imageModel }
  }

  throw new Error(CHAT_RUNTIME_MESSAGES.openAiNoEditedImage)
}

// ── Gemini image edit (with model fallback ladder) ───────────────────────────

type GeminiInlineDataPart = {
  text?: string
  inline_data?: { mime_type?: string; data?: string }
  inlineData?: { mimeType?: string; data?: string }
}

/** HTTP failure from the Gemini REST endpoint, carrying the structured status. */
class GeminiImageHttpError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(CHAT_RUNTIME_MESSAGES.geminiImageEditFailed(status, body))
    this.name = 'GeminiImageHttpError'
    this.status = status
    this.body = body
  }
}

/** Successful response that carried neither an image nor any explanatory text. */
class GeminiNoImageError extends Error {
  constructor() {
    super(CHAT_RUNTIME_MESSAGES.geminiNoEditedImage)
    this.name = 'GeminiNoImageError'
  }
}

/** Rate-limit fall-throughs allowed per ladder run (429 must not burn every model). */
const GEMINI_IMAGE_MAX_RATE_LIMIT_FALLBACKS = 1

/**
 * Decide whether to try the next Gemini image model. Only structured failures
 * count; text the model returned inside a successful response must never
 * trigger a retry just because it mentions "not found".
 *   - 404/501: model does not exist / is not implemented
 *   - 403: model not enabled for this key (a different model may be)
 *   - 5xx: transient or model-specific server failure
 *   - 429: per-model quota; the caller bounds how often this falls through
 *   - 400: only when the error body says the model is unsupported
 *   - success without image and without text (empty candidate)
 * Auth failures (401) never fall through.
 */
export function shouldTryNextGeminiImageModel(error: unknown): boolean {
  if (error instanceof GeminiNoImageError) return true
  if (!(error instanceof GeminiImageHttpError)) return false
  const { status } = error
  if (status === 404 || status === 403 || status === 429 || status >= 500) return true
  if (status !== 400) return false
  const body = error.body.toLowerCase()
  return GEMINI_IMAGE_MODEL_RETRY_ERROR_MARKERS.some((marker) => marker !== '404' && body.includes(marker))
}

/**
 * Gemini image models to try, best first. A model the user picked explicitly
 * (any `gemini-*image*` id) leads the ladder; the built-in models stay behind
 * it as fallbacks. Chat-only ids are ignored because they cannot return pixels.
 */
export function resolveGeminiImageModels(requestedModel: string): string[] {
  const requested = requestedModel.trim()
  const preferred = /^gemini-.*image/i.test(requested) ? [requested] : []
  return [...new Set([...preferred, ...GEMINI_IMAGE_EDIT_MODELS])]
}

/** OpenAI image model: an explicit `gpt-image-*` pick wins, otherwise the built-in default. */
export function resolveOpenAIImageModel(requestedModel: string): string {
  const requested = requestedModel.trim()
  return /^gpt-image-/i.test(requested) ? requested : OPENAI_IMAGE_EDIT_MODEL
}

/** Run `attempt` over the Gemini image model ladder, falling through only when allowed. */
async function runGeminiImageLadder(
  requestedModel: string,
  attempt: (imageModel: string) => Promise<ChatImageEditResultPayload>,
): Promise<ChatImageEditResultPayload> {
  let lastError: unknown
  let rateLimitFallbacks = 0

  for (const imageModel of resolveGeminiImageModels(requestedModel)) {
    try {
      return await attempt(imageModel)
    } catch (error) {
      lastError = error
      if (!shouldTryNextGeminiImageModel(error)) break
      if (error instanceof GeminiImageHttpError && error.status === 429) {
        if (rateLimitFallbacks >= GEMINI_IMAGE_MAX_RATE_LIMIT_FALLBACKS) break
        rateLimitFallbacks += 1
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** Read the Gemini response body, keeping the request timeout armed until it is fully consumed. */
async function postGeminiImageRequest(
  apiKey: string,
  imageModel: string,
  body: unknown,
): Promise<Array<GeminiInlineDataPart>> {
  const url = `${GEMINI_API_BASE}/models/${imageModel}:generateContent`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_IMAGE_EDIT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': CHAT_IMAGE_EDIT_JSON_CONTENT_TYPE,
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new GeminiImageHttpError(response.status, errorText)
    }

    const json = await response.json() as {
      candidates?: Array<{ content?: { parts?: GeminiInlineDataPart[] } }>
    }
    return json.candidates?.[0]?.content?.parts ?? []
  } finally {
    clearTimeout(timer)
  }
}

function extractGeminiImage(parts: GeminiInlineDataPart[], imageModel: string): ChatImageEditResultPayload {
  for (const part of parts) {
    const inlineData = part.inline_data ?? part.inlineData
    if (inlineData?.data) {
      const outputInlineData = inlineData as { mime_type?: string; mimeType?: string; data: string }
      const outputMimeType = outputInlineData.mime_type ?? outputInlineData.mimeType
      return {
        imageBase64: outputInlineData.data,
        imageMimeType: outputMimeType ?? CHAT_IMAGE_EDIT_DEFAULT_MIME_TYPE,
        usedModel: imageModel,
      }
    }
  }

  const text = parts.map((part) => part.text).filter(Boolean).join('\n').trim()
  if (!text) throw new GeminiNoImageError()
  throw new Error(CHAT_RUNTIME_MESSAGES.geminiTextWithoutImage(text))
}

async function requestGeminiImageEdit(
  apiKey: string,
  imageModel: string,
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
): Promise<ChatImageEditResultPayload> {
  const body = {
    contents: [
      {
        parts: [
          { text: buildChatImageEditPrompt(prompt) },
          {
            inline_data: {
              mime_type: imageMimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: CHAT_IMAGE_EDIT_RESPONSE_MODALITIES,
    },
  }

  return extractGeminiImage(await postGeminiImageRequest(apiKey, imageModel, body), imageModel)
}

export async function editChatImageWithGemini(
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
): Promise<ChatImageEditResultPayload> {
  return runGeminiImageLadder(model, (imageModel) =>
    requestGeminiImageEdit(apiKey, imageModel, prompt, imageBase64, imageMimeType),
  )
}

// ── Provider registry for image edit ─────────────────────────────────────────

/**
 * Provider → image-edit-fn registry. Only providers whose key is present
 * advertise image edit support; others return `NO_IMAGE_EDIT` from the IPC
 * handler.
 */
export const CHAT_IMAGE_EDIT_PROVIDERS: Record<string, ChatImageEditFn> = {
  gemini: editChatImageWithGemini,
  openai: editChatImageWithOpenAI,
}

// ── Image generation (text-to-image, no input image) ─────────────────────────

export type ChatImageGenerateFn = (
  apiKey: string,
  model: string,
  prompt: string,
) => Promise<ChatImageEditResultPayload>

export async function generateChatImageWithOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<ChatImageEditResultPayload> {
  const openaiModule = await import('openai')
  const OpenAI = openaiModule.default
  const client = new OpenAI({ apiKey, timeout: CHAT_IMAGE_EDIT_TIMEOUT_MS })

  const imageModel = resolveOpenAIImageModel(model)
  const response = await client.images.generate({
    model: imageModel,
    prompt,
    ...OPENAI_IMAGE_EDIT_OPTIONS,
  })
  const result = response.data?.[0]

  if (result?.b64_json) {
    return {
      imageBase64: result.b64_json,
      imageMimeType: CHAT_IMAGE_EDIT_DEFAULT_MIME_TYPE,
      usedModel: imageModel,
    }
  }

  if (result?.url) {
    const downloaded = await convertRemoteImageUrlToBase64(result.url)
    return { ...downloaded, usedModel: imageModel }
  }

  throw new Error(CHAT_RUNTIME_MESSAGES.openAiNoEditedImage)
}

async function requestGeminiImageGenerate(
  apiKey: string,
  imageModel: string,
  prompt: string,
): Promise<ChatImageEditResultPayload> {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: CHAT_IMAGE_EDIT_RESPONSE_MODALITIES },
  }

  return extractGeminiImage(await postGeminiImageRequest(apiKey, imageModel, body), imageModel)
}

export async function generateChatImageWithGemini(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<ChatImageEditResultPayload> {
  return runGeminiImageLadder(model, (imageModel) => requestGeminiImageGenerate(apiKey, imageModel, prompt))
}

/** Provider → image-generate-fn registry (text-to-image). */
export const CHAT_IMAGE_GENERATE_PROVIDERS: Record<string, ChatImageGenerateFn> = {
  gemini: generateChatImageWithGemini,
  openai: generateChatImageWithOpenAI,
}
