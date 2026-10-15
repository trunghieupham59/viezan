/**
 * Decide whether a chat request should carry the heavy "REASONING DISCIPLINE"
 * directive (restate assumptions, show step-by-step math, self-check).
 *
 * The directive is written for quantitative questions — numbers, money,
 * percentages, dates, units — and makes every other answer stiff and longer
 * than needed. A digit in the user's message is the language-independent
 * signal for those cases, so the directive is attached only then.
 */
export function shouldUseCarefulReasoning(text: string | undefined): boolean {
  return typeof text === 'string' && /\d/.test(text)
}
