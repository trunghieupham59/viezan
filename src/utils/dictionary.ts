/** Shared dictionary utilities used by the store slice, the lookup hook and the UI. */

export function normalizeContextKey(context: string | undefined): string {
  return (context ?? '').trim().toLocaleLowerCase()
}

/**
 * Detect whether a pronunciation string is IPA-like (Latin + IPA extensions)
 * versus a native script reading (kana, hangul, han, devanagari, thai, …).
 * Only IPA-like values are wrapped in `/.../` slashes; native scripts are
 * shown as-is, which matches the convention dictionaries use.
 */
function isIpaLikePronunciation(value: string): boolean {
  if (!value) return false
  try {
    return !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Cyrillic}]/u.test(value)
  } catch {
    // Older engines without Unicode property escapes — fall back to slashes.
    return true
  }
}

/** Wrap IPA-like readings in `/.../`; return native-script readings untouched. */
export function formatDictionaryPronunciation(value: string | undefined): string {
  const stripped = (value ?? '').replace(/^\/|\/$/g, '').trim()
  if (!stripped) return ''
  return isIpaLikePronunciation(stripped) ? `/${stripped}/` : stripped
}
