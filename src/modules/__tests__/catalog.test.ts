import { describe, expect, it } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { APP_MODULES, getModule, isModuleId } from '../catalog'
import { MODULE_PAGES } from '../pages'

describe('module catalog', () => {
  it('lists each module once with the four shipped pages in navigation order', () => {
    const ids = APP_MODULES.map((module) => module.id)
    expect(ids).toEqual(['chat', 'translate', 'live', 'dictionary'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a page chunk and an icon for every module', () => {
    for (const module of APP_MODULES) {
      expect(MODULE_PAGES[module.id]).toBeDefined()
      expect(typeof module.icon).toBe('function')
    }
  })

  it('points every label key at a string in every locale', () => {
    for (const [locale, table] of Object.entries(TRANSLATIONS)) {
      for (const module of APP_MODULES) {
        expect(typeof table[module.labelKey], `${locale}.${module.labelKey}`).toBe('string')
        expect(typeof table[module.descriptionKey], `${locale}.${module.descriptionKey}`).toBe('string')
        if (module.loadingLabelKey) expect(typeof table[module.loadingLabelKey], `${locale}.${module.loadingLabelKey}`).toBe('string')
      }
    }
  })

  it('resolves ids and rejects unknown ones', () => {
    expect(getModule('translate').navigateEffect).toBe('clearTranslation')
    expect(getModule('dictionary').loadingLayout).toBe('split')
    expect(isModuleId('live')).toBe(true)
    expect(isModuleId('thermal')).toBe(false)
    expect(() => getModule('thermal' as never)).toThrow(/Unknown module/)
  })
})
