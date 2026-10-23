/**
 * Quick Translate language pair — pick the translation direction from the selected text.
 *
 * With a primary and a secondary language configured, text written in the primary
 * language is translated into the secondary one and everything else into the primary.
 * The direction is decided locally from the text's script whenever that is unambiguous
 * (Vietnamese vs. English, Japanese vs. Vietnamese, ...). Pairs that share a script
 * (English vs. French) cannot be told apart without a model, so the decision is left
 * to the translation prompt in that case.
 */

/** Writing-system groups the heuristic can tell apart. */
type ScriptGroup = 'latin' | 'han' | 'kana' | 'hangul' | 'thai' | 'arabic' | 'cyrillic' | 'devanagari'

const SCRIPT_BY_LANGUAGE: Record<string, ScriptGroup> = {
  vi: 'latin', en: 'latin', fr: 'latin', de: 'latin', es: 'latin', pt: 'latin',
  it: 'latin', nl: 'latin', pl: 'latin', tr: 'latin', id: 'latin',
  zh: 'han', 'zh-TW': 'han',
  ja: 'kana',
  ko: 'hangul',
  th: 'thai',
  ar: 'arabic',
  ru: 'cyrillic',
  hi: 'devanagari',
}

/**
 * Letters that occur in Vietnamese orthography but in no other supported Latin-script
 * language: ă, đ, ơ, ư and every vowel carrying a hook-above, dot-below or a stacked
 * tone mark. Plain acute/grave/circumflex/tilde are shared with French, Portuguese,
 * Spanish and Italian and therefore do not count.
 */
const VIETNAMESE_ONLY_LETTERS =
  /[ăđơưĂĐƠƯảẻỉỏủỷẢẺỈỎỦỶạẹịọụỵẠẸỊỌỤỴấầẩẫậắằẳẵặẤẦẨẪẬẮẰẲẴẶếềểễệẾỀỂỄỆốồổỗộớờởỡợỐỒỔỖỘỚỜỞỠỢứừửữựỨỪỬỮỰỹỸ]/u

function scriptOfChar(char: string): ScriptGroup | null {
  const code = char.codePointAt(0) ?? 0
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) return 'kana'
  if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x20000 && code <= 0x2ebef)) return 'han'
  if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f)) return 'hangul'
  if (code >= 0x0e00 && code <= 0x0e7f) return 'thai'
  if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) return 'arabic'
  if (code >= 0x0400 && code <= 0x04ff) return 'cyrillic'
  if (code >= 0x0900 && code <= 0x097f) return 'devanagari'
  if (/\p{Script=Latin}/u.test(char)) return 'latin'
  return null
}

/**
 * The languages the text could be written in, or null when the script says nothing
 * (no letters, or an even mix of scripts).
 */
export function detectCandidateLanguages(text: string): Set<string> | null {
  const counts = new Map<ScriptGroup, number>()
  let letters = 0
  for (const char of text) {
    const group = scriptOfChar(char)
    if (!group) continue
    letters += 1
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  if (letters === 0) return null

  // Japanese mixes kanji with kana: any kana makes the han characters Japanese too.
  const kana = counts.get('kana') ?? 0
  const han = counts.get('han') ?? 0
  if (kana > 0) {
    counts.set('kana', kana + han)
    counts.delete('han')
  }

  let dominant: ScriptGroup | null = null
  let dominantCount = 0
  for (const [group, count] of counts) {
    if (count > dominantCount) {
      dominant = group
      dominantCount = count
    }
  }
  // Require a clear majority so a Vietnamese sentence quoting one English word still reads as Vietnamese.
  if (!dominant || dominantCount * 2 <= letters) return null

  if (dominant === 'latin') return detectLatinLanguages(text)
  return new Set(Object.keys(SCRIPT_BY_LANGUAGE).filter((lang) => SCRIPT_BY_LANGUAGE[lang] === dominant))
}

/** Share of words that must carry a diacritic before Latin text can be called Vietnamese. */
const VIETNAMESE_DIACRITIC_WORD_SHARE = 0.4

/**
 * Vietnamese is the one Latin-script language here with letters of its own, and almost
 * every Vietnamese word carries a diacritic. Unique letters in a dense text mean
 * Vietnamese; no unique letters in a sparse text means some other Latin language. The
 * cases in between (an English sentence quoting a Vietnamese name, a short Vietnamese
 * phrase without unique letters, accented French) are left to the model.
 */
function detectLatinLanguages(text: string): Set<string> | null {
  const words = text.split(/[^\p{L}\p{M}]+/u).filter(Boolean)
  if (words.length === 0) return null
  const accented = words.filter((word) => /\P{ASCII}/u.test(word)).length
  const dense = accented / words.length >= VIETNAMESE_DIACRITIC_WORD_SHARE
  const unique = VIETNAMESE_ONLY_LETTERS.test(text)
  if (unique && dense) return new Set(['vi'])
  if (unique || dense) return null
  return new Set(Object.keys(SCRIPT_BY_LANGUAGE).filter((lang) => SCRIPT_BY_LANGUAGE[lang] === 'latin' && lang !== 'vi'))
}

export interface PairDirection {
  /** The language to translate into, or null when only a model can decide. */
  targetLang: string | null
}

/**
 * Decide the Quick Translate direction for `text` given a primary/secondary pair.
 * Text in the primary language goes to the secondary one; text in the secondary (or
 * any third) language goes to the primary. Null means the script is ambiguous between
 * the two languages (or carries no letters) and the translation prompt must decide.
 */
export function resolvePairDirection(text: string, primaryLang: string, secondaryLang: string): PairDirection {
  const candidates = detectCandidateLanguages(text)
  if (!candidates) return { targetLang: null }
  const isPrimary = candidates.has(primaryLang)
  const isSecondary = candidates.has(secondaryLang)
  if (isPrimary && !isSecondary) return { targetLang: secondaryLang }
  if (isSecondary && !isPrimary) return { targetLang: primaryLang }
  // Both (shared script) → undecidable here; neither (a third language) → primary.
  return { targetLang: isPrimary ? null : primaryLang }
}

/** True when the pair is active: a secondary language that differs from the primary. */
export function isLanguagePairActive(primaryLang: string, secondaryLang: string | undefined): secondaryLang is string {
  return Boolean(secondaryLang) && secondaryLang !== primaryLang
}

/** The secondary language a fresh configuration starts with: Vietnamese, or English for a Vietnamese primary. */
export function defaultSecondaryLang(primaryLang: string): string {
  return primaryLang === 'vi' ? 'en' : 'vi'
}
