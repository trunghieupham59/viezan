import { describe, expect, it } from 'vitest'
import { parsePaletteQuery } from '../paletteQuery'

describe('parsePaletteQuery', () => {
  it('treats ordinary text as a default query', () => {
    expect(parsePaletteQuery('  chat  ')).toEqual({ mode: 'default', text: 'chat' })
    expect(parsePaletteQuery('25 + 25 =?')).toEqual({ mode: 'default', text: '25 + 25 =?' })
    expect(parsePaletteQuery('Thủ đô của Việt Nam?')).toEqual({ mode: 'default', text: 'Thủ đô của Việt Nam?' })
    expect(parsePaletteQuery('')).toEqual({ mode: 'default', text: '' })
  })

  it('routes "?" to the AI and "??" to the web-verified AI', () => {
    expect(parsePaletteQuery('? thông tư 25 là gì')).toEqual({ mode: 'ask', text: 'thông tư 25 là gì' })
    expect(parsePaletteQuery('?thông tư 25')).toEqual({ mode: 'ask', text: 'thông tư 25' })
    expect(parsePaletteQuery('?? giá vàng hôm nay')).toEqual({ mode: 'verify', text: 'giá vàng hôm nay' })
    expect(parsePaletteQuery('??giá vàng')).toEqual({ mode: 'verify', text: 'giá vàng' })
  })

  it('keeps multi-line text and ignores prefixes without a payload', () => {
    expect(parsePaletteQuery('? line one\nline two')).toEqual({ mode: 'ask', text: 'line one\nline two' })
    expect(parsePaletteQuery('?')).toEqual({ mode: 'default', text: '?' })
    expect(parsePaletteQuery('??  ')).toEqual({ mode: 'default', text: '??' })
  })

  it('routes "t <text>" to translate but never a bare "t" or a word starting with t', () => {
    expect(parsePaletteQuery('t hello world')).toEqual({ mode: 'translate', text: 'hello world' })
    expect(parsePaletteQuery('T xin chào')).toEqual({ mode: 'translate', text: 'xin chào' })
    expect(parsePaletteQuery('t')).toEqual({ mode: 'default', text: 't' })
    expect(parsePaletteQuery('translate this')).toEqual({ mode: 'default', text: 'translate this' })
  })
})
