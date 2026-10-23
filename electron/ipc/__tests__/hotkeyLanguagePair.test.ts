// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  defaultSecondaryLang,
  detectCandidateLanguages,
  isLanguagePairActive,
  resolvePairDirection,
} from '../hotkeyLanguagePair'

describe('detectCandidateLanguages', () => {
  it('recognises Vietnamese by its unique letters', () => {
    expect(detectCandidateLanguages('Chúng ta nên bắt đầu từ đâu?')).toEqual(new Set(['vi']))
    expect(detectCandidateLanguages('Tôi đang làm việc')).toEqual(new Set(['vi']))
  })

  it('treats plain Latin text as any non-Vietnamese Latin language', () => {
    const latin = detectCandidateLanguages('Where should we start?')
    expect(latin?.has('en')).toBe(true)
    expect(latin?.has('fr')).toBe(true)
    expect(latin?.has('vi')).toBe(false)
    expect(detectCandidateLanguages('Meeting at the café tomorrow')?.has('vi')).toBe(false)
  })

  it('leaves accented Latin text without Vietnamese letters to the model', () => {
    // Shared accents could be French, Portuguese or a Vietnamese phrase without unique letters.
    expect(detectCandidateLanguages('Où êtes-vous allé? À bientôt')).toBeNull()
    expect(detectCandidateLanguages('Xin chào')).toBeNull()
  })

  it('leaves an English sentence quoting a Vietnamese name to the model', () => {
    expect(detectCandidateLanguages('Meeting with Nguyễn Văn A tomorrow morning')).toBeNull()
  })

  it('recognises non-Latin scripts', () => {
    expect(detectCandidateLanguages('今日はいい天気ですね')).toEqual(new Set(['ja']))
    expect(detectCandidateLanguages('今天天气很好')).toEqual(new Set(['zh', 'zh-TW']))
    expect(detectCandidateLanguages('안녕하세요')).toEqual(new Set(['ko']))
    expect(detectCandidateLanguages('สวัสดีครับ')).toEqual(new Set(['th']))
    expect(detectCandidateLanguages('مرحبا بكم')).toEqual(new Set(['ar']))
    expect(detectCandidateLanguages('Привет, как дела?')).toEqual(new Set(['ru']))
    expect(detectCandidateLanguages('नमस्ते दुनिया')).toEqual(new Set(['hi']))
  })

  it('tolerates a few foreign words inside a sentence', () => {
    expect(detectCandidateLanguages('Tôi dùng Visual Studio Code mỗi ngày')).toEqual(new Set(['vi']))
    expect(detectCandidateLanguages('Mở file README trong thư mục docs')).toEqual(new Set(['vi']))
  })

  it('gives up on text without letters or with an even script mix', () => {
    expect(detectCandidateLanguages('1234 !!! 🙂')).toBeNull()
    expect(detectCandidateLanguages('')).toBeNull()
    expect(detectCandidateLanguages('hello こんにちは')).toBeNull()
  })
})

describe('resolvePairDirection', () => {
  it('sends primary-language text to the secondary language and everything else to the primary', () => {
    expect(resolvePairDirection('Xin chào các bạn', 'vi', 'en')).toEqual({ targetLang: 'en' })
    expect(resolvePairDirection('Hello everyone', 'vi', 'en')).toEqual({ targetLang: 'vi' })
    expect(resolvePairDirection('Hello everyone', 'en', 'vi')).toEqual({ targetLang: 'vi' })
    expect(resolvePairDirection('Xin chào các bạn', 'en', 'vi')).toEqual({ targetLang: 'en' })
  })

  it('sends a third language to the primary', () => {
    expect(resolvePairDirection('今日はいい天気ですね', 'vi', 'en')).toEqual({ targetLang: 'vi' })
    expect(resolvePairDirection('Bonjour tout le monde', 'vi', 'ja')).toEqual({ targetLang: 'vi' })
  })

  it('leaves the decision to the model when the pair shares a script', () => {
    expect(resolvePairDirection('Bonjour tout le monde', 'en', 'fr')).toEqual({ targetLang: null })
    expect(resolvePairDirection('今天天气很好', 'zh', 'zh-TW')).toEqual({ targetLang: null })
    // Vietnamese is still unambiguous against another Latin language.
    expect(resolvePairDirection('Xin chào các bạn', 'fr', 'vi')).toEqual({ targetLang: 'fr' })
    expect(resolvePairDirection('Bonjour', 'fr', 'vi')).toEqual({ targetLang: 'vi' })
  })

  it('leaves text without letters to the model', () => {
    expect(resolvePairDirection('42 + 1', 'vi', 'en')).toEqual({ targetLang: null })
  })
})

describe('pair helpers', () => {
  it('is active only with a distinct secondary language', () => {
    expect(isLanguagePairActive('vi', 'en')).toBe(true)
    expect(isLanguagePairActive('vi', 'vi')).toBe(false)
    expect(isLanguagePairActive('vi', '')).toBe(false)
    expect(isLanguagePairActive('vi', undefined)).toBe(false)
  })

  it('suggests Vietnamese, or English for a Vietnamese primary', () => {
    expect(defaultSecondaryLang('vi')).toBe('en')
    expect(defaultSecondaryLang('en')).toBe('vi')
    expect(defaultSecondaryLang('ja')).toBe('vi')
  })
})
