import { hasOwnKey } from './ipcValidation'

/** Human-readable names for main-process AI prompts; never pass ambiguous ISO
 * codes such as `vi` to a small model as the only language instruction.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  auto: 'the detected language',
  vi: 'Vietnamese', en: 'English', zh: 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese', ja: 'Japanese', ko: 'Korean',
  fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', th: 'Thai', id: 'Indonesian',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', hi: 'Hindi',
}

export function langName(code: string): string {
  return hasOwnKey(LANGUAGE_NAMES, code) ? LANGUAGE_NAMES[code] : code
}
