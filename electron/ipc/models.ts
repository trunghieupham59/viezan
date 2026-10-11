import type { IpcMain } from 'electron'
import { ANTHROPIC_API_BASE, ANTHROPIC_API_VERSION, GEMINI_API_BASE, GEMINI_MODELS_PAGE_SIZE, MODELS_FETCH_TIMEOUT_MS } from './ipcConstants'
import { discoverLocalAiRuntimes, getLocalAiStaticModels, isLocalProvider, type LocalAiModel } from './localAi'
import { getStoredApiKey } from './storage'

// DUP-02: Removed local `getApiKey` wrapper — call getStoredApiKey directly.
// HC-06: Gemini base URL now uses GEMINI_API_BASE constant.
// HC-07: Anthropic API version now uses ANTHROPIC_API_VERSION constant.

interface FetchedModel {
  id: string
  name: string
  description: string
}

function toFetchedModel(model: LocalAiModel): FetchedModel {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
  }
}

/** fetch with an AbortController timeout so a stalled provider cannot hang the model picker. */
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = MODELS_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Request timed out after ${timeoutMs / 1000}s`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** Remove dated-snapshot / revision suffixes (-2025-04-14, -20250514, -0613, -001) from a model id. */
function stripSnapshotSuffixes(id: string): string {
  return id
    .toLowerCase()
    .replace(/-\d{4}-\d{2}-\d{2}(?=-|$)/g, '')
    .replace(/-\d{8}(?=-|$)/g, '')
    .replace(/-\d{4}(?=-|$)/g, '')
    .replace(/-\d{3}(?=-|$)/g, '')
}

/**
 * Parse the family version of a model id (claude-3-5-haiku -> 3.5, claude-haiku-4-5 -> 4.5,
 * gemini-2.5-flash -> 2.5, gpt-4o -> 4). Snapshot dates never contribute. Returns 0 when there is
 * no version (e.g. `gemini-flash-latest`).
 */
function parseModelVersion(id: string): number {
  const tokens = stripSnapshotSuffixes(id).split('-')
  if (tokens[0] === 'claude') {
    for (let i = 1; i < tokens.length; i++) {
      if (!/^\d{1,2}$/.test(tokens[i])) continue
      const minor = /^\d{1,2}$/.test(tokens[i + 1] ?? '') ? Number(tokens[i + 1]) : 0
      return Number(tokens[i]) + minor / 10
    }
    return 0
  }
  for (const token of tokens) {
    const match = /^(\d{1,2}(?:\.\d+)?)/.exec(token)
    if (match) return Number.parseFloat(match[1])
  }
  return 0
}

/** `-latest` aliases move to a new model without notice; they must not outrank numbered models. */
function isLatestAlias(id: string): boolean {
  return id.toLowerCase().endsWith('-latest')
}

/**
 * Pick at most `limit` ids: numbered models first (highest parsed version, then id, descending),
 * `-latest` aliases only if room remains.
 */
function selectTopModels<T extends { id: string }>(models: T[], limit: number): T[] {
  const byVersionThenId = (a: T, b: T) => parseModelVersion(b.id) - parseModelVersion(a.id) || b.id.localeCompare(a.id)
  const numbered = models.filter((m) => !isLatestAlias(m.id)).sort(byVersionThenId)
  const aliases = models.filter((m) => isLatestAlias(m.id)).sort(byVersionThenId)
  return [...numbered, ...aliases].slice(0, limit)
}

// ── HC-04: Named score constants for model ranking ────────────────────────────
// Gemini tier scores (higher = preferred for translation)
const GEMINI_SCORE_FLASH   = 200  // Flash: fast + excellent translation quality
const GEMINI_SCORE_PRO     = 80   // Pro: capable but slower
const GEMINI_SCORE_ULTRA   = 60   // Ultra: most capable but expensive/slow
const GEMINI_SCORE_LITE_PENALTY = 50  // Lite/nano: too limited for quality translation

// Claude tier scores
const CLAUDE_SCORE_HAIKU   = 200  // Haiku: fastest + great for translation
const CLAUDE_SCORE_SONNET  = 100  // Sonnet: balanced capability
const CLAUDE_SCORE_OPUS    = 40   // Opus: most powerful but too slow/expensive

// OpenAI tier scores
const OPENAI_SCORE_MINI        = 200  // Mini: fast + good translation quality
const OPENAI_SCORE_4O_BASE     = 120  // 4o base model tier
const OPENAI_SCORE_4_BASE      = 80   // GPT-4 base tier
const OPENAI_SCORE_35          = 50   // GPT-3.5 economy tier
const OPENAI_SCORE_4O_BONUS    = 30   // Extra bonus for 'o' optimised variant
const OPENAI_SCORE_4_BONUS     = 10   // Small bonus for GPT-4 family
const OPENAI_GENERATION_WEIGHT = 20   // Score per Gemini generation unit

/**
 * Scores a model for translation suitability.
 * Higher score = better balance of speed + quality for translation.
 * This runs after every model fetch so new models are automatically evaluated.
 */
function scoreModelForTranslation(provider: string, modelId: string): number {
  const id = modelId.toLowerCase()
  let score = 0

  if (provider === 'gemini') {
    // Flash = fast + good quality for translation
    if (id.includes('flash')) score += GEMINI_SCORE_FLASH
    else if (id.includes('pro')) score += GEMINI_SCORE_PRO
    else if (id.includes('ultra')) score += GEMINI_SCORE_ULTRA
    // Prefer newer generation numbers  (gemini-2 > gemini-1.5 > gemini-1)
    const gen = id.match(/gemini-(\d+)\.?(\d*)/)
    if (gen) score += parseFloat(`${gen[1]}.${gen[2] || 0}`) * OPENAI_GENERATION_WEIGHT
    // Avoid experimental / lite variants
    if (id.includes('lite') || id.includes('nano')) score -= GEMINI_SCORE_LITE_PENALTY
  } else if (provider === 'claude') {
    // Haiku = fastest + great for translation
    if (id.includes('haiku')) score += CLAUDE_SCORE_HAIKU
    else if (id.includes('sonnet')) score += CLAUDE_SCORE_SONNET
    else if (id.includes('opus')) score += CLAUDE_SCORE_OPUS   // too slow/expensive
    // Version bonus: claude-haiku-4-5 > claude-3-5-haiku > claude-3-haiku
    score += parseModelVersion(id) * 15
    // Date bonus: newer release date = higher score
    const date = id.match(/(\d{8})$/)
    if (date) score += parseInt(date[1], 10) / 2000000
  } else if (provider === 'openai') {
    // Family checks run on the id without snapshot dates, so "-2025-04-14" never counts as "4".
    const base = stripSnapshotSuffixes(id)
    const is4o = base.startsWith('gpt-4o')
    const is4 = base.startsWith('gpt-4')
    // Mini models: fast + good translation quality
    if (base.includes('mini')) score += OPENAI_SCORE_MINI
    else if (is4o) score += OPENAI_SCORE_4O_BASE
    else if (is4) score += OPENAI_SCORE_4_BASE
    else if (base.startsWith('gpt-3.5')) score += OPENAI_SCORE_35
    // Version bonus: 4o > 4 > 3.5
    if (is4o) score += OPENAI_SCORE_4O_BONUS
    if (is4) score += OPENAI_SCORE_4_BONUS
    // Avoid reasoning models
    if (id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) score = 0
  }

  return score
}

function describeModel(id: string): string {
  const lower = id.toLowerCase()
  if (lower.includes('flash')) return 'Fast'
  if (lower.includes('ultra')) return 'Most powerful'
  if (lower.includes('pro')) return 'Powerful'
  if (lower.includes('haiku')) return 'Fast'
  if (lower.includes('opus')) return 'Most powerful'
  if (lower.includes('sonnet')) return 'Balanced'
  if (lower.includes('mini')) return 'Fast & affordable'
  if (lower.includes('4o')) return 'Most capable'
  if (lower.includes('3.5')) return 'Economy'
  if (lower.startsWith('o1') || lower.startsWith('o3')) return 'Reasoning'
  return ''
}

// ─── Gemini: REST API ──────────────────────────────────────────────────────────
async function fetchGeminiModels(apiKey: string): Promise<FetchedModel[]> {
  // The key travels in the x-goog-api-key header, never in the URL (URLs end up in logs and error text).
  const url = `${GEMINI_API_BASE}/models?pageSize=${GEMINI_MODELS_PAGE_SIZE}`  // HC-06
  const res = await fetchWithTimeout(url, { headers: { 'x-goog-api-key': apiKey } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${body}`)
  }
  const data = await res.json() as { models: Array<{ name: string; displayName: string; supportedGenerationMethods: string[] }> }
  const candidates = (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && isGeminiTextTranslationModel(m.name.replace('models/', '')))
    .map((m) => {
      const id = m.name.replace('models/', '')
      return { id, name: m.displayName || id, description: describeModel(id) }
    })
  return selectTopModels(candidates, 10)
}

/** Gemini ids that can serve text-to-text translation with a system instruction. */
function isGeminiTextTranslationModel(id: string): boolean {
  return (
    id.startsWith('gemini-') &&
    !id.includes('embedding') &&
    !id.includes('aqa') &&
    !id.includes('exp') &&
    // Allow preview models — they include newer vision-capable variants (e.g. Gemini 2.5 Flash)
    !id.includes('thinking') &&
    !id.includes('learnlm') &&
    // Exclude TTS models — they support generateContent but NOT systemInstruction,
    // causing "[400 Bad Request] Developer instruction is not enabled for this model"
    !id.includes('tts') &&
    // Exclude image-generation models (gemini-2.5-flash-image, gemini-3-pro-image-preview):
    // they are for image output, not text translation.
    !id.includes('-image')
  )
}

// ─── Claude: REST API ──────────────────────────────────────────────────────────
async function fetchClaudeModels(apiKey: string): Promise<FetchedModel[]> {
  const res = await fetchWithTimeout(`${ANTHROPIC_API_BASE}/v1/models?limit=20`, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,  // HC-07
      'content-type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API error ${res.status}: ${body}`)
  }
  const data = await res.json() as { data: Array<{ id: string; display_name: string }> }
  return (data.data || [])
    .filter((m) => m.id.startsWith('claude'))
    .map((m) => ({
      id: m.id,
      name: m.display_name || m.id,
      description: describeModel(m.id),
    }))
    .slice(0, 8)
}

// ─── OpenAI: SDK (has proper .models.list()) ──────────────────────────────────
async function fetchOpenAIModels(apiKey: string): Promise<FetchedModel[]> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey, timeout: MODELS_FETCH_TIMEOUT_MS })
  const response = await client.models.list()
  const excluded = [
    'embedding', 'tts', 'whisper', 'dall-e', 'davinci-002',
    'babbage', 'moderation', 'text-search', 'text-similarity', 'code-search',
    'instruct', 'realtime', 'audio', 'transcribe',
    // Image generation models — do NOT support chat/completions endpoint
    'image',
    // Codex — completions-only, not chat
    'codex',
  ]
  const candidates = response.data
    .filter((m) => {
      const id = m.id.toLowerCase()
      // Only GPT chat models
      const isGpt = id.startsWith('gpt-')
      const notExcluded = !excluded.some((e) => id.includes(e))
      return isGpt && notExcluded
    })
    .map((m) => ({ id: m.id, name: m.id, description: describeModel(m.id) }))
  return selectTopModels(candidates, 12)
}

/** @internal — exported for unit tests only */
export {
  isGeminiTextTranslationModel,
  isLatestAlias,
  parseModelVersion,
  scoreModelForTranslation,
  selectTopModels,
}

export function registerModelsHandlers(ipcMain: IpcMain) {
  ipcMain.handle('models:fetch', async (_event, provider: string) => {
    if (isLocalProvider(provider)) {
      const discovery = await discoverLocalAiRuntimes(true)
      if (!discovery.available) {
        const models = getLocalAiStaticModels().map(toFetchedModel)
        return {
          success: false,
          errorCode: 'LOCAL_RUNTIME_UNAVAILABLE',
          error: discovery.error,
          models,
          recommendedModel: models[0]?.id,
        }
      }
      return {
        success: true,
        models: discovery.models.map(toFetchedModel),
        recommendedModel: discovery.recommendedModel,
      }
    }

    const apiKey = getStoredApiKey(provider)  // DUP-02
    if (!apiKey) {
      return { success: false, errorCode: 'NO_API_KEY', models: [] }
    }
    try {
      let models: FetchedModel[] = []
      switch (provider) {
        case 'gemini': models = await fetchGeminiModels(apiKey); break
        case 'claude': models = await fetchClaudeModels(apiKey); break
        case 'openai': models = await fetchOpenAIModels(apiKey); break
        default: return { success: false, error: `Unknown provider: ${provider}`, models: [] }
      }
      // Score each model and pick the best one for translation
      const recommendedModel = models.length > 0
        ? models.reduce((best, m) =>
            scoreModelForTranslation(provider, m.id) > scoreModelForTranslation(provider, best.id) ? m : best
          , models[0]).id
        : undefined
      return { success: true, models, recommendedModel }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg, models: [] }
    }
  })
}
