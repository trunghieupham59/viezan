/**
 * Shared constants for Electron IPC handlers.
 *
 * Centralizes magic numbers and strings (HC-01 through HC-08) that were
 * previously scattered across translate.ts, chat.ts, imageTranslate.ts,
 * models.ts, and tts.ts.
 */

// ── Gemini REST API ───────────────────────────────────────────────────────────
/**
 * Base URL for Gemini REST API.
 * HC-06: Was repeated verbatim in imageTranslate.ts, tts.ts, and models.ts.
 * Update here if Google changes the API version path.
 */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// ── Anthropic API ─────────────────────────────────────────────────────────────
/**
 * Anthropic API version header value.
 * HC-07: Was hardcoded in models.ts. Update when Anthropic releases a new stable version.
 */
export const ANTHROPIC_API_VERSION = '2023-06-01'

// ── Translation output token limits ───────────────────────────────────────────
/**
 * HC-01: Max output tokens for Claude translation/rewrite calls.
 * Claude supports extended output; this matches the long-context tier.
 */
export const MAX_OUTPUT_TOKENS_CLAUDE = 16_000

/**
 * HC-01: Max output tokens for OpenAI translation/rewrite calls.
 * GPT-4o supports up to 16 384 completion tokens.
 */
export const MAX_OUTPUT_TOKENS_OPENAI = 16_384

/**
 * Per-family output-token ceilings for models older than the fixed translation defaults above.
 * Sending a larger `max_tokens` to these models fails with HTTP 400, so requests are clamped.
 * Conservative on purpose: unknown or newer models keep the requested value.
 */
const MODEL_OUTPUT_TOKEN_LIMITS: Array<{ provider: string; pattern: RegExp; limit: number }> = [
  { provider: 'claude', pattern: /^claude-3-haiku/i, limit: 4_096 },
  { provider: 'claude', pattern: /^claude-3-(?:opus|sonnet)(?:-|$)/i, limit: 4_096 },
  { provider: 'claude', pattern: /^claude-3-5-(?:haiku|sonnet)/i, limit: 8_192 },
  // The Anthropic SDK refuses NON-streaming requests above 8 192 tokens for these exact Opus 4.0/4.1
  // ids ("Streaming is required"). Newer Opus (4.5+) and Sonnet 4.x are deliberately not matched.
  { provider: 'claude', pattern: /^claude-opus-4(?:-0|-1)?(?:-\d{8})?$/i, limit: 8_192 },
  { provider: 'openai', pattern: /^gpt-4(?:-|$)/i, limit: 4_096 },
  { provider: 'openai', pattern: /^gpt-3\.5(?:-|$)/i, limit: 4_096 },
]

/**
 * Clamp a requested output-token budget to what the model family accepts.
 * `gpt-4o`, `gpt-4.1`, `claude-sonnet-4`... are not matched by the legacy patterns and
 * therefore return `requested` unchanged.
 */
export function clampMaxOutputTokens(provider: string, model: string, requested: number): number {
  const id = model.trim().toLowerCase()
  for (const rule of MODEL_OUTPUT_TOKEN_LIMITS) {
    if (rule.provider === provider && rule.pattern.test(id)) return Math.min(requested, rule.limit)
  }
  return requested
}

// ── Chat / image-translate output token limits ────────────────────────────────
/**
 * HC-02: Max output tokens for chat and image-translate responses.
 * Shorter than full-document translation — chat responses are typically concise.
 */
export const MAX_CHAT_OUTPUT_TOKENS = 4_096

// ── Chat input character limit (main process) ─────────────────────────────────
/**
 * HC-08: Maximum characters allowed in a single chat message — main process enforcement.
 *
 * IMPORTANT: Must stay in sync with MAX_CHAT_INPUT_CHARS in src/constants/providers.ts
 * which enforces the same limit in the renderer.  Both values exist because Electron
 * IPC separates main-process and renderer bundles; the renderer constant prevents
 * the UI from sending oversized requests, while this constant validates them server-side
 * even if the renderer check is bypassed (e.g. via direct IPC calls).
 */
export const MAX_CHAT_REQUEST_CHARS = 3_000

/**
 * Maximum total chat payload size in bytes — protects the main process from
 * pathological requests (large image attachments + long history) that would
 * otherwise consume tens of megabytes of RAM during IPC marshalling.
 *
 * The cap is computed against the JSON-serialised request body; image base64
 * strings are the dominant contributor. 12 MB lets a typical 1.5 MB resized
 * photo round-trip with comfortable headroom for history + system prompt.
 *
 * When exceeded, `parseChatParams` returns a typed `PAYLOAD_TOO_LARGE` error
 * code so the renderer can prompt the user to remove an attachment.
 */
export const MAX_CHAT_PAYLOAD_BYTES = 12 * 1024 * 1024


// ── API key verification token limit ─────────────────────────────────────────
/**
 * HC-NEW-09: Max output tokens for API key verification calls.
 * We only need the model to say "ok" — 10 tokens is more than enough.
 * Named constant so it matches the verify model constants pattern.
 */
export const VERIFY_MAX_TOKENS = 10

// ── API key verification models ───────────────────────────────────────────────
// HC-05: Lightweight models used only to verify key validity — cheapest/fastest per provider.
// These are deliberately separate from the translation models in src/constants/providers.ts
// because verification needs minimal cost, not necessarily the best translation quality.

/** Cheapest Gemini model suitable for a minimal generateContent call. */
export const VERIFY_MODEL_GEMINI = 'gemini-2.5-flash-lite'

/** Current OpenAI chat model suitable for a minimal chat.completions.create call. */
export const VERIFY_MODEL_OPENAI = 'gpt-4.1-mini'

// ── Gemini specialised model IDs ──────────────────────────────────────────────
/** Gemini TTS model — optimised for low-latency, low-cost speech synthesis. */
export const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'

/** Primary Gemini image-editing model for AI Chat image outputs. */
export const GEMINI_IMAGE_EDIT_MODEL = 'gemini-3.1-flash-image-preview'

/** Fallback Gemini image-editing model when the newest preview model is unavailable for a key/region. */
export const GEMINI_IMAGE_EDIT_FALLBACK_MODEL = 'gemini-2.5-flash-image'

/** Ordered Gemini image-edit candidates. Keep the newest image model first. */
export const GEMINI_IMAGE_EDIT_MODELS = [GEMINI_IMAGE_EDIT_MODEL, GEMINI_IMAGE_EDIT_FALLBACK_MODEL] as const

/** OpenAI image-editing model — used when AI Chat must return an edited image. */
export const OPENAI_IMAGE_EDIT_MODEL = 'gpt-image-1'

// ── External API base URLs ────────────────────────────────────────────────────
/** Anthropic REST API base URL. HC: centralised so it can be updated in one place. */
export const ANTHROPIC_API_BASE = 'https://api.anthropic.com'

// ── Vision model discovery ────────────────────────────────────────────────────
/** Max models to request from Gemini models list API. */
export const GEMINI_MODELS_PAGE_SIZE = 50

/** Max models to request from Anthropic models list API. */
export const ANTHROPIC_MODELS_LIMIT = 20

/** Timeout (ms) for provider models-list API calls used during vision fallback discovery. */
export const VISION_DISCOVERY_TIMEOUT_MS = 5_000

/** Timeout (ms) for AI Chat image editing; image generation/editing can take much longer than model discovery. */
export const CHAT_IMAGE_EDIT_TIMEOUT_MS = 180_000

// ── Language detection input limit ───────────────────────────────────────────
/**
 * Maximum characters of source text sent to the AI for language detection.
 * Enough to reliably identify any language; truncating saves tokens on long inputs.
 *
 * NOTE: Must stay in sync with DETECT_LANG_MAX_CHARS in src/constants/providers.ts
 * which trims the text in the renderer before the IPC call (defence-in-depth).
 */
export const DETECT_LANG_MAX_CHARS = 500

// ── Vision model scoring weights ─────────────────────────────────────────────
// Used by scoreModelForVision() to rank candidates cheapest/fastest first.
// Higher score = more preferred. Adjust when provider pricing tiers change.
export const VISION_SCORE_CHEAP   = 100  // flash / mini / haiku — fastest & cheapest
export const VISION_SCORE_MID     = 70   // 4o / sonnet — balanced
export const VISION_SCORE_CAPABLE = 60   // pro — more capable
export const VISION_SCORE_BASIC   = 50   // gpt-4 base tier
export const VISION_SCORE_SLOW    = 20   // opus — most powerful but slowest/priciest
export const VISION_SCORE_GEN_WEIGHT = 10  // bonus per generation number unit
export const VISION_SCORE_LITE_PENALTY = 30 // penalty for lite/nano variants

// ── Lightweight translation token limits & defaults ──────────────────────────
/** HC-01: Max output tokens cho lightweight translation calls (global hotkey, bookmarklet extension).
 *  Nhỏ hơn MAX_CHAT_OUTPUT_TOKENS (4096) vì các call này cần nhanh, output ngắn. */
export const MAX_LIGHTWEIGHT_TRANSLATE_TOKENS = 2_048

/** HC-09: Default Gemini model cho local server extension endpoint. */
export const EXT_DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

// ── Shared lightweight translation system prompt ──────────────────────────────
/** Shared system prompt cho các lightweight translation calls (bookmarklet, global hotkey).
 *  Khác với SYSTEM_PROMPT trong translate.ts — bản đó có cultural nuance rules phức tạp hơn. */
export const LIGHTWEIGHT_TRANSLATOR_PROMPT =
  'You are an expert translator. Translate accurately and naturally. ' +
  'Output ONLY the translation — no notes, no alternatives, no explanations.'

/** Tên preset voice dùng cho Gemini TTS. Xem: https://ai.google.dev/gemini-api/docs/speech */
export const GEMINI_TTS_VOICE_NAME = 'Aoede'

// ── Edge TTS (Microsoft Neural TTS — free, no API key needed) ────────────────
/** WebSocket endpoint for Microsoft Edge TTS (via browser speech service). */
export const EDGE_TTS_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
/** Trusted client token required by Edge TTS DRM — public, used by open-source clients. */
export const EDGE_TTS_TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
/** Chromium version string used in Edge TTS DRM and User-Agent header. */
export const EDGE_TTS_CHROMIUM_FULL = '143.0.3650.75'
/** Chromium major version used in User-Agent header. */
export const EDGE_TTS_CHROMIUM_MAJOR = '143'
/** Windows epoch offset (seconds between Unix epoch and Windows file time epoch). */
export const EDGE_TTS_WIN_EPOCH = 11644473600
/** Default Edge TTS voice — Vietnamese female, natural quality. */
export const EDGE_TTS_DEFAULT_VOICE = 'vi-VN-HoaiMyNeural'
/** Edge Neural voice map for app language codes. */
export const EDGE_TTS_VOICE_BY_LANG: Record<string, string> = {
  vi: 'vi-VN-HoaiMyNeural',
  en: 'en-US-JennyNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  'zh-TW': 'zh-TW-HsiaoChenNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  es: 'es-ES-ElviraNeural',
  pt: 'pt-PT-RaquelNeural',
  ru: 'ru-RU-SvetlanaNeural',
  ar: 'ar-SA-ZariyahNeural',
  th: 'th-TH-PremwadeeNeural',
  id: 'id-ID-GadisNeural',
  it: 'it-IT-ElsaNeural',
  nl: 'nl-NL-ColetteNeural',
  pl: 'pl-PL-ZofiaNeural',
  tr: 'tr-TR-EmelNeural',
  hi: 'hi-IN-SwaraNeural',
}
/** Default speaking rate for Edge TTS — +20% faster than neutral. */
export const EDGE_TTS_DEFAULT_RATE = '+20%'

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────
/** ElevenLabs REST API base URL. */
export const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io'
/** ElevenLabs model — multilingual v2 for best cross-language quality. */
export const ELEVENLABS_TTS_MODEL = 'eleven_multilingual_v2'
/** Default ElevenLabs voice ID — Adam (neutral, works well for all languages). */
export const ELEVENLABS_DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'

// ── ElevenLabs voice quality settings ────────────────────────────────────────
/** Stability: balance between consistent delivery (1.0) and expressive variability (0.0). */
export const ELEVENLABS_STABILITY = 0.5
/** Similarity boost: how closely the output matches the original voice. Higher = more similar. */
export const ELEVENLABS_SIMILARITY_BOOST = 0.75
/** Style exaggeration: 0.0 = off (recommended for most use cases to avoid distortion). */
export const ELEVENLABS_STYLE = 0.0

// ── OpenAI TTS & STT models ───────────────────────────────────────────────────
/** OpenAI TTS model — standard quality, low latency. Upgrade to 'tts-1-hd' for higher quality. */
export const OPENAI_TTS_MODEL = 'tts-1'

/** OpenAI Whisper STT model — supports 99 languages, used for voice input and live transcription. */
export const WHISPER_MODEL = 'whisper-1'

// ── Gemini STT (audio transcription via Gemini multimodal API) ────────────────
/**
 * Gemini model used for audio transcription (STT fallback when Whisper is unavailable).
 * Uses the Gemini generateContent API with audio inline_data — same API key as translation,
 * no additional Google Cloud APIs or GCP Console setup required.
 * Stable Flash-Lite supports audio input; avoid the retired Gemini 2.0 endpoint.
 */
export const GEMINI_STT_MODEL = 'gemini-3.1-flash-lite'

// ── Groq STT (Whisper-compatible free fallback) ───────────────────────────────
/**
 * Groq API base URL — OpenAI-compatible endpoint.
 * Groq uses the same OpenAI SDK format (just override baseURL), so transcribeWithGroq()
 * is nearly identical to transcribeWithWhisper() with no new SDK needed.
 * Used as the 3rd fallback in 'auto' mode: Whisper → Gemini → Groq.
 */
export const GROQ_API_BASE = 'https://api.groq.com/openai/v1'

/**
 * Groq Whisper model — whisper-large-v3-turbo runs ~10× faster than OpenAI's whisper-1
 * with comparable accuracy. Free tier: ~28,800 audio seconds / day, no credit card required.
 * Register at console.groq.com to get an API key.
 */
export const GROQ_STT_MODEL = 'whisper-large-v3-turbo'

// ── STT rate-limit ban duration ───────────────────────────────────────────────
/**
 * How long (ms) Whisper is marked unavailable after hitting a rate limit.
 * OpenAI rate limits typically clear within 60 s; adding a 30 s buffer gives
 * the session enough time to stabilise on Gemini/Groq before retrying Whisper.
 */
export const WHISPER_RATE_LIMIT_BAN_MS = 90_000

/**
 * Timeout (ms) per Whisper API call in 'auto' mode.
 * If the OpenAI transcription endpoint does not respond within this window,
 * the call is aborted and falls back immediately to the next STT provider.
 *
 * Set to 3 s — slightly above CHUNK_DURATION_MS (2 s audio) to tolerate small
 * network fluctuations without false timeouts.  Because the hedge fires Gemini
 * at STT_HEDGE_DELAY_MS (1 s), Gemini serves as a parallel backup so the actual
 * result latency stays near 1–2 s even when Whisper uses the full 3 s.
 */
export const WHISPER_TIMEOUT_MS = 3_000

/**
 * Hedge delay (ms) in 'auto' mode — how long to wait for Whisper before
 * firing Gemini in parallel ("hedged request" pattern).
 *
 * At t=0  : Whisper call starts.
 * At t=1s : if Whisper hasn't responded yet, Gemini starts simultaneously.
 * Whichever responds first wins; the other is ignored.
 *
 * This guarantees that a slow Whisper endpoint never blocks the pipeline
 * for more than ~1–2 s, while still preferring Whisper when it is fast.
 */
export const STT_HEDGE_DELAY_MS = 1_000

/**
 * How long (ms) Whisper is temporarily banned after repeated consecutive failures
 * with unknown errors (no recognised errorCode).
 * After WHISPER_CONSECUTIVE_FAIL_LIMIT failures the session switches to
 * Gemini/Groq for this many milliseconds, then retries Whisper once.
 */
export const WHISPER_CONSECUTIVE_FAIL_BAN_MS = 60_000

/**
 * How long (ms) a provider is banned after a CONNECTION_ERROR in 'auto' mode.
 *
 * CONNECTION_ERROR is typically a transient network issue but in a live meeting
 * context there is no value in retrying the same endpoint on every chunk — the
 * same failure will occur again within ~2 s and wastes the chunk's budget.
 *
 * 30 s gives the network/server time to recover while keeping the downtime short
 * enough that Whisper/Gemini can be automatically restored mid-session.
 * A background probe (scheduleRecoveryProbe) may reset the ban earlier if the
 * provider comes back sooner.
 */
export const STT_CONNECTION_ERROR_BAN_MS = 30_000

/**
 * Delay (ms) between a provider ban and the first background recovery probe.
 * 60 s is a reasonable interval for recovery checks in a live meeting — probing
 * more frequently wastes API quota without meaningfully improving recovery speed.
 */
export const STT_RECOVERY_PROBE_DELAY_MS = 60_000

// ── Lightweight translate default models (used when no model is specified) ────
/**
 * Default OpenAI model for lightweight translation (global hotkey, bookmarklet).
 * NOTE: EXT_DEFAULT_GEMINI_MODEL is already defined above.
 */
export const EXT_DEFAULT_OPENAI_MODEL = 'gpt-5-mini'

/** Default Claude model for lightweight translation. */
export const EXT_DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6'

// ── Edge TTS timeout ──────────────────────────────────────────────────────────
/**
 * Safety timeout (ms) for Edge TTS WebSocket connection.
 * 8 s allows the fallback chain (OpenAI → Gemini → Edge → ElevenLabs) to
 * kick in quickly without blocking the TTS pipeline for too long.
 */
export const EDGE_TTS_TIMEOUT_MS = 8_000

// ── Translate IPC payload limits (main-process enforcement) ───────────────────
/**
 * Hard upper bound for `sourceText` accepted by the translate IPC handler.
 *
 * The renderer shows an advisory cost/latency warning above 5 000 characters but
 * does not block submission. The translation pipeline independently starts
 * chunking above TRANSLATE_CHUNK_CHAR_LIMIT. We still need a defensive cap at the
 * IPC boundary so a malicious or buggy caller cannot push a multi-megabyte string
 * through `JSON.parse` on the main process. 1 MB of text (~250 000 characters)
 * comfortably covers any realistic book-length input while keeping memory bounded.
 */
export const MAX_TRANSLATE_SOURCE_CHARS = 1_000_000

/**
 * Hard upper bound for `imageBase64` accepted by the image-translate IPC handler.
 * Renderer already resizes and caps at MAX_IMAGE_INPUT_BYTES (25 MB raw),
 * which expands to ~33 MB when base64-encoded. We add a 35 MB ceiling here so
 * a direct IPC call bypassing the renderer cannot DoS the main process.
 */
export const MAX_IMAGE_BASE64_CHARS = 35 * 1024 * 1024

// ── Chunked translation parameters ────────────────────────────────────────────
/**
 * HC-09: Maximum characters per chunk sent to the AI.
 *
 * ~12 000 chars ≈ 3 000 tokens — safely fits in context window even for smaller
 * models (8K ctx) after accounting for system prompt (~500 tok) + output (~3 000 tok).
 * For modern large-context models this just means fewer, larger chunks.
 *
 * Referenced by translate.ts chunking logic. Change here to affect all chunked operations.
 */
export const TRANSLATE_CHUNK_CHAR_LIMIT = 12_000

/**
 * HC-10: Base timeout (ms) per translate / rewrite request to a cloud provider.
 * The effective deadline grows with input size and reasoning effort, see `getTranslateTimeoutMs`.
 */
export const TRANSLATE_CHUNK_TIMEOUT_MS = 90_000

/** Deadline (ms) for a translate / rewrite request to the local provider (CPU inference is slow). */
export const TRANSLATE_LOCAL_TIMEOUT_MS = 900_000

/** Extra time (ms) granted per 1 000 input characters for cloud providers. */
const TRANSLATE_TIMEOUT_PER_1K_CHARS_MS = 10_000

/** Hard ceiling (ms) of the size/effort-scaled cloud deadline. */
export const TRANSLATE_TIMEOUT_MAX_MS = 600_000

/**
 * Deadline (ms) for one translate / rewrite request.
 *  - `local`: a fixed long deadline (CPU Ollama can legitimately take minutes).
 *  - cloud: base + a per-1k-chars allowance, multiplied for medium (x2) / high (x3) reasoning
 *    effort, capped at TRANSLATE_TIMEOUT_MAX_MS.
 */
export function getTranslateTimeoutMs(provider: string | undefined, textLength: number, reasoningEffort?: string): number {
  if (provider === 'local') return TRANSLATE_LOCAL_TIMEOUT_MS
  const sizeMs = TRANSLATE_CHUNK_TIMEOUT_MS + Math.floor(Math.max(0, textLength) / 1_000) * TRANSLATE_TIMEOUT_PER_1K_CHARS_MS
  const factor = reasoningEffort === 'high' ? 3 : reasoningEffort === 'medium' ? 2 : 1
  return Math.min(sizeMs * factor, TRANSLATE_TIMEOUT_MAX_MS)
}

/**
 * HC-11: Max concurrent chunk requests.
 * Limits parallel API calls per translateChunked call to avoid rate-limit errors.
 * 5 concurrent chunks = good throughput without hammering provider rate limits.
 */
export const TRANSLATE_CHUNK_CONCURRENCY = 5

/**
 * HC-12: Characters of previous source chunk to include as overlap context.
 * Gives the model enough prior text to maintain consistent terminology and style
 * across chunk boundaries without sending the full prior chunk (saves tokens).
 */
export const TRANSLATE_CONTEXT_TAIL_CHARS = 400

// ── Timeouts for non-chunked IPC calls ────────────────────────────────────────
/** Timeout (ms) for auxiliary provider calls: language detection and API key verification. */
export const TRANSLATE_AUX_TIMEOUT_MS = 30_000

/** Base timeout (ms) for a lightweight (hotkey / extension) translation request to a cloud provider. */
export const LIGHTWEIGHT_TRANSLATE_TIMEOUT_MS = 60_000

/** Lightweight translation timeout (ms) for the local provider: CPU inference can be very slow. */
export const LIGHTWEIGHT_TRANSLATE_LOCAL_TIMEOUT_MS = 600_000

/** Extra lightweight-translation time (ms) granted per 1 000 input characters (cloud providers). */
const LIGHTWEIGHT_TIMEOUT_PER_1K_CHARS_MS = 5_000

/** Upper bound (ms) of the size-scaled lightweight timeout for cloud providers. */
const LIGHTWEIGHT_TIMEOUT_MAX_MS = 180_000

/** Timeout (ms) for a lightweight translation, scaled by provider and input size. */
export function getLightweightTranslateTimeoutMs(provider: string, textLength: number): number {
  if (provider === 'local') return LIGHTWEIGHT_TRANSLATE_LOCAL_TIMEOUT_MS
  const extra = Math.floor(Math.max(0, textLength) / 1_000) * LIGHTWEIGHT_TIMEOUT_PER_1K_CHARS_MS
  return Math.min(LIGHTWEIGHT_TRANSLATE_TIMEOUT_MS + extra, LIGHTWEIGHT_TIMEOUT_MAX_MS)
}

/**
 * Max characters accepted by lightweight translation.
 *
 * Aligned with the output cap: MAX_LIGHTWEIGHT_TRANSLATE_TOKENS (2 048) is the default budget, and the
 * output budget is raised with the input (see `getLightweightMaxOutputTokens`) up to
 * LIGHTWEIGHT_MAX_OUTPUT_TOKENS_CEILING, which comfortably holds a translation of this many characters
 * even into token-hungry scripts.
 */
export const MAX_LIGHTWEIGHT_TRANSLATE_CHARS = 20_000

/** Highest output budget lightweight translation will request. */
export const LIGHTWEIGHT_MAX_OUTPUT_TOKENS_CEILING = 16_000

/**
 * Output-token budget for a lightweight translation of `textLength` characters.
 * Pessimistic estimate: 1 char ~ 1 token (CJK / Thai / Hindi output), times a 1.5 safety factor,
 * clamped to [MAX_LIGHTWEIGHT_TRANSLATE_TOKENS, LIGHTWEIGHT_MAX_OUTPUT_TOKENS_CEILING].
 */
export function getLightweightMaxOutputTokens(textLength: number): number {
  const estimate = Math.ceil(Math.max(0, textLength) * 1.5)
  return Math.min(LIGHTWEIGHT_MAX_OUTPUT_TOKENS_CEILING, Math.max(MAX_LIGHTWEIGHT_TRANSLATE_TOKENS, estimate))
}

/** Timeout (ms) for provider model-list fetches used to populate the model picker. */
export const MODELS_FETCH_TIMEOUT_MS = 10_000
