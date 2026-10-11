const KNOWN_LANG_CODES = ['vi', 'en', 'zh', 'zh-TW', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar', 'th', 'id', 'it', 'nl', 'pl', 'tr', 'hi']

const CODE_BY_LOWERCASE = new Map(KNOWN_LANG_CODES.map((code) => [code.toLowerCase(), code]))

/** English and native language names a model may answer with instead of a code. */
const CODE_BY_NAME = new Map<string, string>([
  ['vietnamese', 'vi'], ['tiếng việt', 'vi'], ['tieng viet', 'vi'],
  ['english', 'en'],
  ['chinese', 'zh'], ['simplified chinese', 'zh'], ['mandarin', 'zh'], ['中文', 'zh'], ['简体中文', 'zh'],
  ['traditional chinese', 'zh-TW'], ['繁體中文', 'zh-TW'], ['繁体中文', 'zh-TW'],
  ['japanese', 'ja'], ['日本語', 'ja'],
  ['korean', 'ko'], ['한국어', 'ko'],
  ['french', 'fr'], ['français', 'fr'], ['francais', 'fr'],
  ['german', 'de'], ['deutsch', 'de'],
  ['spanish', 'es'], ['español', 'es'], ['espanol', 'es'],
  ['portuguese', 'pt'], ['português', 'pt'], ['portugues', 'pt'],
  ['russian', 'ru'], ['русский', 'ru'],
  ['arabic', 'ar'], ['العربية', 'ar'],
  ['thai', 'th'], ['ไทย', 'th'],
  ['indonesian', 'id'], ['bahasa indonesia', 'id'],
  ['italian', 'it'], ['italiano', 'it'],
  ['dutch', 'nl'], ['nederlands', 'nl'],
  ['polish', 'pl'], ['polski', 'pl'],
  ['turkish', 'tr'], ['türkçe', 'tr'], ['turkce', 'tr'],
  ['hindi', 'hi'], ['हिन्दी', 'hi'],
])

/** Traditional-script regions / script subtags that map to `zh-TW`. */
const TRADITIONAL_CHINESE_SUFFIXES = new Set(['tw', 'hk', 'mo', 'hant'])

/** ISO 639-2 (B and T) three-letter codes for the supported languages; small local models answer with these. */
const CODE_BY_ISO3 = new Map<string, string>([
  ['vie', 'vi'], ['eng', 'en'], ['zho', 'zh'], ['chi', 'zh'], ['jpn', 'ja'], ['kor', 'ko'],
  ['fra', 'fr'], ['fre', 'fr'], ['deu', 'de'], ['ger', 'de'], ['spa', 'es'], ['por', 'pt'],
  ['rus', 'ru'], ['ara', 'ar'], ['tha', 'th'], ['ind', 'id'], ['ita', 'it'], ['nld', 'nl'],
  ['dut', 'nl'], ['pol', 'pl'], ['tur', 'tr'], ['hin', 'hi'],
])

/** Words that mark a Chinese answer as Traditional ("Chinese (Traditional)", "zh Hant"). */
const TRADITIONAL_MARKERS = new Set(['traditional', 'hant', 'tw', 'hk'])

/** Resolve one cleaned (lowercase, trimmed) answer or token: exact code, name, ISO 639-2, or code + region/script. */
function resolveDirect(cleaned: string): string | null {
  if (!cleaned) return null
  const hyphenated = cleaned.replace(/[\s_]/g, '-')
  const exact = CODE_BY_LOWERCASE.get(hyphenated)
  if (exact) return exact

  const byName = CODE_BY_NAME.get(cleaned)
  if (byName) return byName

  const byIso3 = CODE_BY_ISO3.get(hyphenated)
  if (byIso3) return byIso3

  // Region/script suffixes are only read from a single word ("en-US", "zh_Hant"); spaces mean prose
  // ("It is English" must not become "it").
  if (/\s/.test(cleaned)) return null
  const [base, ...rest] = hyphenated.split('-')
  if (!base || rest.length === 0 || !rest.every((part) => /^[a-z0-9]{2,8}$/.test(part))) return null
  const baseCode = CODE_BY_LOWERCASE.get(base) ?? CODE_BY_ISO3.get(base)
  if (!baseCode || baseCode === 'zh-TW') return null
  if (baseCode === 'zh' && rest.some((part) => TRADITIONAL_CHINESE_SUFFIXES.has(part))) return 'zh-TW'
  return baseCode
}

/**
 * Words of a longer answer ("vi - Vietnamese", "Vietnamese (vi)", "en (English)"), split on whitespace
 * and punctuation. Hyphens inside a word are kept so "zh-tw" stays one token.
 */
function answerTokens(cleaned: string): string[] {
  return cleaned
    .split(/[^\p{L}\p{N}-]+/u)
    .map((token) => token.replace(/^-+|-+$/g, ''))
    .filter(Boolean)
}

/**
 * Normalize a model's language-detection answer to one of the app's language codes.
 *
 * Accepts, in order: an exact code (any case), a known English/native language name, an ISO 639-2
 * three-letter code ("eng", "vie"), or a known base code with a region/script suffix ("en-US" -> "en",
 * "zh-Hant" -> "zh-TW"). For a longer answer ("vi - Vietnamese", "Vietnamese (vi)") every
 * whitespace/punctuation-delimited token is resolved the same way and the answer is accepted only when
 * its first or parenthesised token resolves and all resolvable tokens agree on one language
 * ("It is English" is rejected rather than read as Italian).
 * There is deliberately NO prefix matching: an empty or short answer ("a") must not become "vi" or "ar".
 */
export function normalizeDetectedLang(raw: string): string | null {
  const cleaned = raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/^["'`\s.]+|["'`\s.]+$/g, '')
    .replace(/\s+/g, ' ')
  if (!cleaned) return null

  const direct = resolveDirect(cleaned)
  if (direct) return direct

  const tokens = answerTokens(cleaned)
  if (tokens.length < 2) return null
  const resolved = tokens.map(resolveDirect)
  const languages = new Set(resolved.filter((code): code is string => code !== null))
  if (languages.size !== 1) return null

  const parenthesised = new Set((cleaned.match(/\(([^)]*)\)/g) ?? []).flatMap((group) => answerTokens(group)))
  const anchored = resolved[0] !== null || tokens.some((token, index) => resolved[index] !== null && parenthesised.has(token))
  if (!anchored) return null

  const [language] = languages
  if (language === 'zh' && tokens.some((token) => TRADITIONAL_MARKERS.has(token))) return 'zh-TW'
  return language
}
