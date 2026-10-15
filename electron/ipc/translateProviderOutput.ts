import { emptyResponseError, truncatedOutputError } from './errorUtils'

/**
 * Turn a provider's raw text into a translation result.
 *
 * - `truncated` (finish_reason "length", stop_reason "max_tokens", finishReason MAX_TOKENS)
 *   is an error: a cut-off translation must never be shown as a successful, complete one.
 * - Empty / whitespace-only text is an error (EMPTY_RESPONSE), not a successful empty translation.
 */
export function finalizeProviderText(provider: string, text: string | null | undefined, truncated: boolean): string {
  if (truncated) throw truncatedOutputError(provider)
  const trimmed = (text ?? '').trim()
  if (!trimmed) throw emptyResponseError(provider)
  return trimmed
}

/** Variant for short answers (language detection) where a token cap is intentional. */
export function nonEmptyProviderText(provider: string, text: string | null | undefined): string {
  return finalizeProviderText(provider, text, false)
}

export interface ClaudeTextBlockLike {
  type: string
  text?: string
}

/** Concatenate every text block (thinking blocks and others are skipped). */
export function joinClaudeText(content: ReadonlyArray<ClaudeTextBlockLike>): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}
