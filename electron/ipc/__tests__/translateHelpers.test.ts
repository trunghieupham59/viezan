// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { splitIntoChunks, translateChunked } from '../translateChunking'
import { normalizeDetectedLang } from '../translateLanguage'
import { buildDetectLanguagePrompt, buildPrompt, buildRewritePrompt, getStyleTone, STYLE_TONE, SYSTEM_PROMPT } from '../translatePrompts'

describe('translatePrompts', () => {
  it('builds normal translation prompts with the requested style and target language', () => {
    const prompt = buildPrompt('Hello world', 'en', 'vi', false, 'technical')
    expect(prompt).toContain('Translate into vi')
    expect(prompt).toContain('Tone: precise, technical')
    expect(prompt).toContain('Hello world')
  })

  it('adds a register hint for Vietnamese and Japanese targets only', () => {
    expect(buildPrompt('Hello', 'en', 'vi', false, 'formal')).toContain('ạ')
    expect(buildPrompt('Hello', 'en', 'ja', false, 'business')).toContain('business Japanese')
    expect(buildRewritePrompt('Xin chào', 'vi', 'casual')).toContain('nhé')
    expect(getStyleTone('formal', 'fr')).toBe(STYLE_TONE.formal)
    expect(getStyleTone('formal')).toBe(STYLE_TONE.formal)
  })

  it('adds the Japanese surname list only when the source has a romaji honorific', () => {
    const withHonorific = buildPrompt('Please tell Yokoyama-san that Tanaka-sensei is here.', 'en', 'ja', false, 'general')
    expect(withHonorific).toContain('Always convert common Japanese surnames')
    expect(buildPrompt('Are you free tonight?', 'en', 'ja', false, 'general')).not.toContain('Yokoyama')
    expect(buildPrompt('Please tell Yokoyama-san hello.', 'en', 'vi', false, 'general')).not.toContain('Always convert common Japanese surnames')
    expect(SYSTEM_PROMPT).not.toContain('横山')
  })

  it('keeps every clause and avoids slash-separated pronoun alternatives', () => {
    expect(buildPrompt('If X then Y.', 'en', 'ja', false, 'business')).toContain('omit nothing')
    expect(STYLE_TONE.business).not.toMatch(/concise/i)
    expect(getStyleTone('formal', 'vi')).toContain('never write alternatives separated by a slash')
    expect(getStyleTone('technical', 'vi')).toBe(STYLE_TONE.technical)
    expect(getStyleTone('formal', 'ja')).not.toContain('slash')
  })

  it('falls back to the general tone for unknown styles and ignores inherited keys', () => {
    expect(getStyleTone('shouting', 'vi')).toContain(STYLE_TONE.general)
    expect(getStyleTone('formal', 'constructor')).toBe(STYLE_TONE.formal)
    expect(getStyleTone('constructor', 'vi')).toContain(STYLE_TONE.general)
  })

  it('builds rewrite prompts that preserve target language constraints', () => {
    const prompt = buildRewritePrompt('Xin chào', 'vi', 'natural')
    expect(prompt).toContain('Target language: vi')
    expect(prompt).toContain('Style: natural')
    expect(prompt).toContain('Xin chào')
  })

  it('builds compact language detection prompts around a provided snippet', () => {
    const prompt = buildDetectLanguagePrompt('Bonjour')
    expect(prompt).toContain('BCP-47 language code')
    expect(prompt).toContain('Bonjour')
  })
})

describe('translateChunking', () => {
  it('splits long text on natural boundaries', () => {
    const chunks = splitIntoChunks(`${'a'.repeat(40)}. ${'b'.repeat(40)}`, 60)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.length <= 60)).toBe(true)
  })

  it('adds continuity notes and preserves chunk order', async () => {
    const seen: string[] = []
    const result = await translateChunked(async text => {
      seen.push(text)
      return `tx-${seen.length}`
    }, `${'a'.repeat(30)}. ${'b'.repeat(30)}. ${'c'.repeat(30)}.`, 40)

    expect(seen.length).toBeGreaterThan(1)
    expect(seen[0]).toContain('part 1 of')
    expect(seen[1]).toContain('immediately preceding source text')
    // Translations are re-joined with the exact whitespace that separated the source chunks.
    expect(result).toBe(seen.map((_, index) => `tx-${index + 1}`).join(' '))
  })
})

describe('translateLanguage', () => {
  it('normalizes exact, cased, and partial language codes', () => {
    expect(normalizeDetectedLang(' "ZH-TW" ')).toBe('zh-TW')
    expect(normalizeDetectedLang('Vietnamese')).toBe('vi')
    expect(normalizeDetectedLang('ja')).toBe('ja')
  })

  it('returns null for unsupported language responses', () => {
    expect(normalizeDetectedLang('unknown-language')).toBeNull()
  })
})
