import type { TranslationReasoningEffort } from './translateValidation'

/** Reasoning families that accept `reasoning_effort`; chat-tuned gpt-5 and o1-mini/preview reject it. */
const OPENAI_REASONING_MODEL = /^(?!gpt-5-chat|o1-(?:mini|preview))(?:gpt-5(?:[.-]|$)|o[134](?:[.-]|$))/i

export function getOpenAIReasoningEffort(model: string, effort: TranslationReasoningEffort) {
  if (effort === 'auto' || !OPENAI_REASONING_MODEL.test(model)) return undefined
  return effort
}

export function getClaudeReasoningConfig(model: string, effort: TranslationReasoningEffort) {
  if (
    effort === 'auto'
    || !/^claude-(?:sonnet|opus)-(?:4-6|4-7|4-8|5)(?:-|$)/i.test(model)
  ) return {}

  return {
    thinking: { type: 'adaptive' as const },
    output_config: { effort },
  }
}

export function getGeminiThinkingConfig(model: string, effort: TranslationReasoningEffort) {
  if (effort === 'auto') return undefined

  if (/^gemini-3(?:\.\d+)?-/i.test(model)) return { thinkingLevel: effort }
  if (!/^gemini-2\.5-(?:pro|flash(?:-lite)?)(?:-|$)/i.test(model)) return undefined

  return {
    thinkingBudget: {
      low: 1_024,
      medium: 8_192,
      high: 24_576,
    }[effort],
  }
}

/** Output ceiling of current Gemini families (2.5 and newer). */
const GEMINI_LARGE_OUTPUT_TOKENS = 65_536
/** Output ceiling shared by older Gemini families (1.x / 2.0). */
const GEMINI_LEGACY_OUTPUT_TOKENS = 8_192

/**
 * Explicit `maxOutputTokens` for Gemini translate / rewrite requests, so the ceiling is known
 * (and a MAX_TOKENS stop is reported) instead of depending on an implicit server default.
 * Thinking tokens count against this budget, hence the large value for the 2.5+ families.
 */
export function getGeminiMaxOutputTokens(model: string): number {
  return /^gemini-(?:2\.5|[3-9](?:\.\d+)?)(?:-|$)/i.test(model.trim()) ? GEMINI_LARGE_OUTPUT_TOKENS : GEMINI_LEGACY_OUTPUT_TOKENS
}

/** Live translation has a small text-only budget. Sonnet 5+ thinks by default;
 * 5.5 uses between_tools (without tools, text only), while 5 uses disabled.
 * https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
 */
export function getClaudeLiveThinkingConfig(model: string) {
  if (/^claude-sonnet-5-5(?:-|$)/i.test(model)) {
    return { thinking: { type: 'between_tools' as const }, output_config: { effort: 'low' as const } }
  }
  if (/^claude-sonnet-5(?:-\d{8})?$/i.test(model)) {
    return { thinking: { type: 'disabled' as const }, output_config: { effort: 'low' as const } }
  }
  return {}
}
