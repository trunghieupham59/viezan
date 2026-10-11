export interface SearchResultForFormatting {
  title: string
  url: string
  content: string
  score: number
}

interface FormatWebSearchOptions {
  maxChars?: number
  retrievedAt?: string
  query?: string
  provider?: string
  resultCount?: number
  /** Max characters of each result's content. Defaults to 700. */
  maxCharsPerResult?: number
  /**
   * Citation numbers to print for each result (parallel to `results`). Lets a
   * multi-search run keep one global numbering instead of restarting at [1].
   */
  numbers?: number[]
}

const DEFAULT_MAX_CHARS_PER_RESULT = 700

export function getCurrentLocaleDateTime() {
  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined
  return new Date().toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' })
}

export function hasWebSearchApi() {
  return typeof window !== 'undefined' && typeof window.api?.webSearch === 'function'
}

/** Set by the main process when a configured web-search provider failed and a lower-priority one answered. */
export interface WebSearchFallbackInfo {
  from: 'tavily' | 'brave'
  reason: 'auth' | 'quota' | 'error'
}

export type ActionableSearchFallback = WebSearchFallbackInfo & { reason: 'auth' | 'quota' }

/**
 * The fallback worth telling the user about: a rejected key or exhausted quota is
 * something they can act on, while a transient error is not.
 */
export function getActionableSearchFallback(
  result: { fallback?: WebSearchFallbackInfo } | null | undefined,
): ActionableSearchFallback | null {
  const fallback = result?.fallback
  if (!fallback || fallback.reason === 'error') return null
  return fallback as ActionableSearchFallback
}

export function formatWebSearchResults(
  results: SearchResultForFormatting[],
  answer: string | undefined,
  summaryLabel: string,
  options?: number | FormatWebSearchOptions,
): string {
  const formatOptions = typeof options === 'number' ? { maxChars: options } : options
  const lines: string[] = []
  const metadata = [
    formatOptions?.retrievedAt ? `Retrieved at: ${formatOptions.retrievedAt}` : '',
    formatOptions?.query ? `Search query: ${formatOptions.query}` : '',
    formatOptions?.provider ? `Search provider: ${formatOptions.provider}` : '',
    typeof formatOptions?.resultCount === 'number' ? `Result count: ${formatOptions.resultCount}` : '',
  ].filter(Boolean)

  if (metadata.length) {
    lines.push('**Search metadata:**', ...metadata, '')
  }

  if (answer) lines.push(`**${summaryLabel}:** ${answer}`, '')
  results.forEach((result, index) => {
    lines.push(
      `**[${formatOptions?.numbers?.[index] ?? index + 1}] ${result.title}**`,
      `URL: ${result.url}`,
      `Relevance score: ${Number.isFinite(result.score) ? result.score.toFixed(2) : 'unknown'}`,
      result.content.slice(0, formatOptions?.maxCharsPerResult ?? DEFAULT_MAX_CHARS_PER_RESULT),
      '',
    )
  })

  const formatted = lines.join('\n')
  return formatOptions?.maxChars === undefined ? formatted : formatted.slice(0, formatOptions.maxChars)
}
