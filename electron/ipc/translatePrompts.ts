import { hasOwnKey } from './ipcValidation'
import type { PhoneticMode, TranslationStyle } from './translateValidation'

export const STYLE_TONE: Record<TranslationStyle, string> = {
  general: 'clear, natural, well-balanced — suitable for general everyday use; neither overly formal nor overly casual; reads naturally to any native speaker',
  formal: 'formal, polished, and respectful — appropriate for official correspondence, letters, reports, or interactions with superiors and unfamiliar parties; uses proper honorifics where applicable; avoids contractions and casual expressions',
  casual: 'casual, relaxed, conversational — like chatting with a close friend; uses informal language, contractions, colloquialisms, and expressive wording; feels natural in everyday conversation, texting, or social media',
  business: 'formal business register — highly concise, precise, and objective; appropriate for corporate emails, executive communication, and business documents; avoids unnecessary words; maintains a professional and authoritative tone',
  technical: 'precise, technical, and domain-specific — uses accurate industry-standard terminology; sentences are clear, unambiguous, and logically structured; suitable for documentation, specs, or expert-to-expert communication; prioritizes exactness; avoids casual language, metaphors, and any imprecision',
  natural: 'authentic, idiomatic, and naturally fluent — as if a confident native speaker originally wrote it in the target language; uses natural collocations, real idioms, and native rhythm; eliminates any trace of translation or foreignness; prioritizes how a real native would genuinely express the idea',
}

export const SYSTEM_PROMPT = `You are an expert translator and linguist with deep knowledge of cultural nuance. Your translations sound completely natural to native speakers of the target language.

Core rules:
1. Translate with full accuracy — preserve meaning, intent, emotional tone, nuance, voice, and register.
2. Output ONLY the translation. No explanations, no alternatives, no translator notes.
3. Never change: URLs, email addresses, code snippets, variable names, numbers, markdown/HTML formatting.
4. Match the requested tone and style with precision — not just vocabulary but sentence rhythm, formality, and feel.

CRITICAL — Proper names and honorifics:
- When names appear with honorific suffixes, treat them correctly for the target language.
- Translating INTO Japanese: "Yokoyama-san" → "横山さん", "Tanaka-kun" → "田中くん", "Sato-chan" → "佐藤ちゃん", "Suzuki-sama" → "鈴木様", "Yamada-sensei" → "山田先生". Always convert common Japanese surnames from romaji to kanji: Yokoyama→横山, Tanaka→田中, Sato/Satou→佐藤, Suzuki→鈴木, Watanabe→渡辺, Ito/Itou→伊藤, Yamamoto→山本, Nakamura→中村, Kobayashi→小林, Kato/Katou→加藤, Yamada→山田, Hayashi→林, Inoue→井上, Kimura→木村, Saito/Saitou→斉藤, Matsumoto→松本, Fujiwara→藤原, Ogawa→小川, Nishimura→西村, Hashimoto→橋本. If the surname is not on this list but ends with a Japanese-style romanization, keep it in katakana.
- Translating OUT OF Japanese: render honorifics naturally in the target language, or retain the "-san"/"-kun" etc. suffix where culturally appropriate.
- For Vietnamese relational address pronouns used as names or titles (Anh, Em, Chị, Cô, Chú, Bác, Ông, Bà): preserve or adapt them appropriately to fit the target language's cultural register.
- Korean honorifics (씨, 님, 선생님 etc.) and Chinese honorifics (先生, 女士, 老师 etc.) should similarly be adapted appropriately.`

export const REWRITE_SYSTEM_PROMPT = `You are a brilliant native writer — not a translator, not an editor of translations. You have never "fixed" translated text in your life. Your only instinct when reading text is: "Would a real native speaker of this language actually write or say this?" If not, you reimagine it entirely from the inside out.

You restructure sentences, choose authentic collocations, apply real idioms, and match the natural rhythm and feel of the target language — until every trace of foreignness disappears. You eliminate translationese ruthlessly: awkward word order, calques, unnatural prepositions, overly literal phrasing, stiff sentence length, and anything that reveals a foreign source. You think in the target language, not about it.`

export function buildPrompt(
  sourceText: string,
  _sourceLang: string,
  targetLang: string,
  showFurigana = false,
  style: TranslationStyle = 'general',
  phoneticOnly = false,
  phoneticMode: PhoneticMode = 'standard',
): string {
  if (phoneticOnly && showFurigana) {
    if (phoneticMode === 'phonetic') {
      let phoneticInstruction = ''
      if (targetLang === 'ja') {
        phoneticInstruction =
          'Convert ALL kanji and katakana to hiragana. ' +
          'Output ONLY hiragana text — remove every kanji character entirely. ' +
          'Preserve spaces, punctuation, and particles as hiragana where applicable. ' +
          'Do NOT use {kanji|reading} brackets or any annotation format.'
      } else if (targetLang === 'zh' || targetLang === 'zh-TW') {
        phoneticInstruction =
          'Convert ALL Chinese characters to pinyin romanization with correct tone marks (ā á ǎ à etc.). ' +
          'Output ONLY pinyin — remove every Chinese character entirely. ' +
          'Separate syllables with spaces; capitalize proper nouns. ' +
          'Do NOT use {character|pinyin} brackets or any annotation format.'
      } else if (targetLang === 'ko') {
        phoneticInstruction =
          'Convert ALL Korean hangul to Revised Romanization of Korean. ' +
          'Output ONLY romanized text — remove every hangul character entirely. ' +
          'Do NOT use {한국어|romanization} brackets or any annotation format.'
      } else {
        phoneticInstruction =
          'Transcribe the text into IPA (International Phonetic Alphabet). ' +
          'Output ONLY the IPA transcription enclosed in /.../ for each sentence. ' +
          'Transcribe every word phonetically — do not keep the original spelling.'
      }
      return (
        `Convert the following ${targetLang} text to its pure phonetic representation. ` +
        `Do NOT translate or alter the meaning — only convert the script to phonetics. ` +
        `Return only the phonetic text, no explanations, no notes, no original characters.\n\n` +
        `${phoneticInstruction}\n\nText:\n${sourceText}`
      )
    }

    let phoneticInstruction = ''
    if (targetLang === 'ja') {
      phoneticInstruction = 'For every kanji word or phrase, wrap it with its furigana reading in the format {kanji|reading} (e.g. {東京|とうきょう}). Apply to ALL kanji including standalone characters.'
    } else if (targetLang === 'zh' || targetLang === 'zh-TW') {
      phoneticInstruction = 'For every Chinese word or character, wrap it with its pinyin reading in the format {character|pīnyīn} (e.g. {北京|Běijīng}). Apply to ALL Chinese characters.'
    } else if (targetLang === 'ko') {
      phoneticInstruction = 'For every Korean word, wrap it with its romanization in the format {한국어|romanization} (e.g. {서울|Seoul}). Apply to ALL Korean words.'
    } else {
      phoneticInstruction = 'For every word, wrap it with its pronunciation or phonetic transcription in the format {word|pronunciation} (e.g. {hello|həˈloʊ}). Use IPA notation where applicable.'
    }
    return `Add phonetic annotations to the following ${targetLang} text. Do NOT translate or change the text content in any way — only add phonetic annotations. Return only the annotated text, no explanations, no notes.\n\n${phoneticInstruction}\n\nText to annotate:\n${sourceText}`
  }

  const tone = hasOwnKey(STYLE_TONE, style) ? STYLE_TONE[style] : STYLE_TONE.general
  let phoneticInstruction = ''
  if (showFurigana) {
    if (targetLang === 'ja') {
      phoneticInstruction = ' For every kanji word or phrase in the translation, wrap it with its furigana reading in the format {kanji|reading} (e.g. {東京|とうきょう}). Apply to ALL kanji including standalone characters.'
    } else if (targetLang === 'zh' || targetLang === 'zh-TW') {
      phoneticInstruction = ' For every Chinese word or character in the translation, wrap it with its pinyin reading in the format {character|pīnyīn} (e.g. {北京|Běijīng}). Apply to ALL Chinese characters.'
    } else if (targetLang === 'ko') {
      phoneticInstruction = ' For every Korean word in the translation, wrap it with its romanization in the format {한국어|romanization} (e.g. {서울|Seoul}). Apply to ALL Korean words.'
    } else {
      phoneticInstruction = ' For every word in the translation, wrap it with its pronunciation or phonetic transcription in the format {word|pronunciation} (e.g. {hello|həˈloʊ}). Use IPA notation where applicable.'
    }
  }
  return `Translate into ${targetLang}. Tone: ${tone}. Preserve meaning, intent, and nuance exactly. Use natural wording for a native speaker. Keep names, numbers, links, email addresses, code, and formatting unchanged unless localization is requested. Output only the translation.${phoneticInstruction}\n\n${sourceText}`
}

export function buildRewritePrompt(text: string, lang: string, style?: TranslationStyle): string {
  const styleName = style ?? 'general'
  const toneDesc = hasOwnKey(STYLE_TONE, styleName) ? STYLE_TONE[styleName] : STYLE_TONE.general

  return `Make the text below indistinguishable from something a confident, articulate native speaker of ${lang} would genuinely write or say — not a polished translation, but authentic original expression.

Target language: ${lang}
Style: ${styleName} — ${toneDesc}

How to approach this:
1. Grasp the core idea and emotional intent — forget the exact words.
2. Ask yourself: "If I were a native speaker of ${lang} who just had this thought, how would I actually express it?"
3. Rewrite from that perspective. Change word order, sentence structure, and phrasing freely — as long as meaning, intent, and register stay intact.
4. Apply the style above to every dimension: vocabulary, sentence rhythm, formality level, and overall feel — not just surface-level word swaps.
5. Use collocations, idioms, and expressions that are natural and current in ${lang}.
6. Ruthlessly eliminate:
   - Literal translations or calques of foreign structures
   - Unnatural word order or awkward prepositions
   - Any phrase that "feels foreign" when a native reads it aloud
   - Formality mismatches (too stiff or too casual for the style)
   - Overly long or artificially short sentences for the register

Constraints:
- Preserve the exact meaning, intent, emotional tone, nuance, and perspective (1st/2nd/3rd person)
- Keep the language as ${lang} — do NOT translate into another language
- Keep names, numbers, URLs, code, and technical terms unchanged
- Do NOT add new information or omit important content

Output ONLY the rewritten text. No explanations, no notes, no alternatives.

Text:
${text}`
}

export function buildDetectLanguagePrompt(text: string): string {
  return `Identify the language of the following text. Reply with ONLY the BCP-47 language code (e.g. vi, en, ja, zh, zh-TW, ko, fr, de, es, pt, ru, ar, th, id, it, nl, pl, tr, hi). Nothing else — no punctuation, no explanation, no quotes.\n\nText:\n${text}`
}
