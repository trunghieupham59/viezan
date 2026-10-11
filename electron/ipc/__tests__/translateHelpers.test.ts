// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { splitIntoChunks, translateChunked } from '../translateChunking'
import { normalizeDetectedLang } from '../translateLanguage'
import { buildDetectLanguagePrompt, buildPrompt, buildRewritePrompt } from '../translatePrompts'

describe('translatePrompts', () => {
  it('builds normal translation prompts with the requested style and target language', () => {
    const prompt = buildPrompt('Hello world', 'en', 'vi', false, 'technical')
    expect(prompt).toContain('Translate into vi')
    expect(prompt).toContain('Tone: precise, technical')
    expect(prompt).toContain('Hello world')
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
