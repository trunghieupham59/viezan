/**
 * Prefix routing for the command palette.
 *
 *   ?  question     → ask the AI
 *   ?? question     → ask the AI with web search (sources cited)
 *   t  text         → open AI Translate with the text
 *   d  word         → look the word up in the Dictionary
 *
 * Anything else is a plain query (commands, calculator, generic "Ask AI").
 */
export type PaletteQueryMode = 'default' | 'ask' | 'verify' | 'translate' | 'dictionary'

export interface ParsedPaletteQuery {
  mode: PaletteQueryMode
  /** The query with its prefix removed and trimmed. */
  text: string
}

const PREFIX_RULES: Array<{ pattern: RegExp; mode: Exclude<PaletteQueryMode, 'default'> }> = [
  { pattern: /^\?\?\s*(\S[\s\S]*)$/, mode: 'verify' },
  // The payload may not start with "?" so a bare "??" is not read as asking the question "?".
  { pattern: /^\?\s*([^\s?][\s\S]*)$/, mode: 'ask' },
  // A bare "t" or "d" must stay a normal search, so these prefixes need a space and some text.
  { pattern: /^t\s+(\S[\s\S]*)$/i, mode: 'translate' },
  { pattern: /^d\s+(\S[\s\S]*)$/i, mode: 'dictionary' },
]

export function parsePaletteQuery(query: string): ParsedPaletteQuery {
  const trimmed = query.trim()
  for (const { pattern, mode } of PREFIX_RULES) {
    const match = pattern.exec(trimmed)
    if (match) return { mode, text: match[1].trim() }
  }
  return { mode: 'default', text: trimmed }
}
