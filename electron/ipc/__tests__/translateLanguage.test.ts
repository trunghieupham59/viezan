// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { normalizeDetectedLang } from '../translateLanguage'

describe('normalizeDetectedLang', () => {
  it('returns null for empty / whitespace / quote-only input (no loose prefix match)', () => {
    expect(normalizeDetectedLang('')).toBeNull()
    expect(normalizeDetectedLang('   ')).toBeNull()
    expect(normalizeDetectedLang('""')).toBeNull()
    expect(normalizeDetectedLang('.')).toBeNull()
  })

  it('does not expand short input into a longer code ("a" -> "ar")', () => {
    expect(normalizeDetectedLang('a')).toBeNull()
    expect(normalizeDetectedLang('z')).toBeNull()
    expect(normalizeDetectedLang('p')).toBeNull()
  })

  it('does not match when the answer merely starts with a known code', () => {
    expect(normalizeDetectedLang('english-ish gibberish')).toBeNull()
    expect(normalizeDetectedLang('enigma')).toBeNull()
    expect(normalizeDetectedLang('idk')).toBeNull()
    expect(normalizeDetectedLang('unknown')).toBeNull()
  })

  it('accepts exact codes in any case and strips quotes / trailing dot', () => {
    expect(normalizeDetectedLang('VI')).toBe('vi')
    expect(normalizeDetectedLang(' "ja" ')).toBe('ja')
    expect(normalizeDetectedLang('en.')).toBe('en')
    expect(normalizeDetectedLang('ZH-tw')).toBe('zh-TW')
  })

  it('accepts english and native language names', () => {
    expect(normalizeDetectedLang('Vietnamese')).toBe('vi')
    expect(normalizeDetectedLang('Tiếng Việt')).toBe('vi')
    expect(normalizeDetectedLang('English')).toBe('en')
    expect(normalizeDetectedLang('Japanese')).toBe('ja')
    expect(normalizeDetectedLang('日本語')).toBe('ja')
    expect(normalizeDetectedLang('Korean')).toBe('ko')
    expect(normalizeDetectedLang('Indonesian')).toBe('id')
    expect(normalizeDetectedLang('Traditional Chinese')).toBe('zh-TW')
    expect(normalizeDetectedLang('Chinese')).toBe('zh')
  })

  it('maps region / script suffixes to the supported base code', () => {
    expect(normalizeDetectedLang('en-US')).toBe('en')
    expect(normalizeDetectedLang('en_GB')).toBe('en')
    expect(normalizeDetectedLang('pt-BR')).toBe('pt')
    expect(normalizeDetectedLang('zh-CN')).toBe('zh')
    expect(normalizeDetectedLang('zh-Hans')).toBe('zh')
    expect(normalizeDetectedLang('zh-Hant')).toBe('zh-TW')
    expect(normalizeDetectedLang('zh-HK')).toBe('zh-TW')
  })

  it('returns null for unsupported languages and region-only garbage', () => {
    expect(normalizeDetectedLang('xx')).toBeNull()
    expect(normalizeDetectedLang('xx-US')).toBeNull()
    expect(normalizeDetectedLang('en-')).toBeNull()
    expect(normalizeDetectedLang('🤔???')).toBeNull()
  })
})

describe('normalizeDetectedLang — verbose and ISO 639-2 answers', () => {
  it('accepts a code followed by a name, and a name followed by a code', () => {
    expect(normalizeDetectedLang('vi - Vietnamese')).toBe('vi')
    expect(normalizeDetectedLang('Vietnamese (vi)')).toBe('vi')
    expect(normalizeDetectedLang('en (English)')).toBe('en')
    expect(normalizeDetectedLang('Japanese (ja).')).toBe('ja')
    expect(normalizeDetectedLang('ko: Korean')).toBe('ko')
    expect(normalizeDetectedLang('Tiếng Việt (vi)')).toBe('vi')
  })

  it('accepts ISO 639-2 three-letter codes', () => {
    expect(normalizeDetectedLang('eng')).toBe('en')
    expect(normalizeDetectedLang('VIE')).toBe('vi')
    expect(normalizeDetectedLang('jpn')).toBe('ja')
    expect(normalizeDetectedLang('fra')).toBe('fr')
    expect(normalizeDetectedLang('fre')).toBe('fr')
    expect(normalizeDetectedLang('deu')).toBe('de')
    expect(normalizeDetectedLang('zho')).toBe('zh')
    expect(normalizeDetectedLang('hin')).toBe('hi')
    expect(normalizeDetectedLang('eng-US')).toBe('en')
  })

  it('keeps Traditional Chinese detection in verbose answers', () => {
    expect(normalizeDetectedLang('Chinese (Traditional)')).toBe('zh-TW')
    expect(normalizeDetectedLang('zh (Traditional Chinese)')).toBe('zh-TW')
  })

  it('rejects ambiguous or conflicting answers and does not loosely prefix-match', () => {
    expect(normalizeDetectedLang('It is English')).toBeNull()
    expect(normalizeDetectedLang('en or fr')).toBeNull()
    expect(normalizeDetectedLang('The language is unclear')).toBeNull()
    expect(normalizeDetectedLang('engl')).toBeNull()
    expect(normalizeDetectedLang('viet')).toBeNull()
    expect(normalizeDetectedLang('xyz')).toBeNull()
    expect(normalizeDetectedLang('')).toBeNull()
  })
})
