import { describe, expect, it } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { ALL_MODULES_ENABLED } from '../../store/slices/modulesSlice'
import { APP_MODULES, getModule, getPage, isAppPage, isPageModuleId, isSystemPage, navigationPages, SYSTEM_PAGES } from '../catalog'
import { APP_PAGES } from '../pages'

describe('module catalog', () => {
  it('lists each module once with the shipped pages in navigation order', () => {
    const ids = APP_MODULES.map((module) => module.id)
    expect(ids).toEqual(['chat', 'translate', 'live', 'dictionary', 'apps', 'thermal'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a page chunk and an icon for every module', () => {
    for (const module of APP_MODULES) {
      expect(APP_PAGES[module.id]).toBeDefined()
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
    expect(getModule('thermal').loadingLayout).toBe('list')
    expect(isPageModuleId('live')).toBe(true)
    expect(isPageModuleId('thermal')).toBe(true)
    expect(isPageModuleId('fan-control')).toBe(false)
    expect(() => getModule('fan-control' as never)).toThrow(/Unknown module/)
  })

  it('has a page chunk and localized text for every system page', () => {
    for (const page of SYSTEM_PAGES) {
      expect(APP_PAGES[page.id]).toBeDefined()
      expect(isSystemPage(page.id) && isAppPage(page.id)).toBe(true)
      expect(getPage(page.id)).toBe(page)
      for (const table of Object.values(TRANSLATIONS)) {
        expect(typeof table[page.labelKey]).toBe('string')
        expect(typeof table[page.descriptionKey]).toBe('string')
      }
    }
    expect(isSystemPage('chat')).toBe(false)
    expect(isAppPage('history')).toBe(false)
  })

  it('builds the navigation: Home, spaces with their system pages, Settings', () => {
    const nav = navigationPages(ALL_MODULES_ENABLED)
    expect(nav.home.id).toBe('home')
    expect(nav.settings.id).toBe('settings')
    expect(nav.groups.map((group) => [group.space, group.modules.map((page) => page.id)])).toEqual([
      ['ai', ['chat']],
      ['language', ['translate', 'live', 'dictionary', 'everywhere']],
      ['system', ['apps', 'thermal']],
      ['tools', ['utilities']],
    ])
    const off = navigationPages({ ...ALL_MODULES_ENABLED, chat: false, thermal: false, apps: false })
    expect(off.groups.map((group) => group.space)).toEqual(['language', 'tools'])
  })
})
