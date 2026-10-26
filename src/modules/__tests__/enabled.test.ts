import { describe, expect, it } from 'vitest'
import { ALL_MODULES_ENABLED } from '../../store/slices/modulesSlice'
import { enabledPageModules, isLastEnabledPageModule, resolveActivePage } from '../enabled'

describe('enabled module helpers', () => {
  it('keeps navigation order and drops modules that are off', () => {
    const ids = enabledPageModules({ ...ALL_MODULES_ENABLED, translate: false }).map((module) => module.id)
    expect(ids).toEqual(['chat', 'live', 'dictionary', 'apps', 'thermal'])
  })

  it('ignores non-page modules when deciding the active page', () => {
    const enabled = { ...ALL_MODULES_ENABLED, launcher: false, 'browser-bridge': false }
    expect(resolveActivePage('dictionary', enabled)).toBe('dictionary')
  })

  it('falls back to Home when the active page belongs to a module that is off', () => {
    expect(resolveActivePage('chat', { ...ALL_MODULES_ENABLED, chat: false })).toBe('home')
    const none = { ...ALL_MODULES_ENABLED, chat: false, translate: false, live: false, dictionary: false, thermal: false, apps: false }
    expect(resolveActivePage('live', none)).toBe('home')
  })

  it('always shows system pages and sends unknown ids to Home', () => {
    const none = { ...ALL_MODULES_ENABLED, chat: false, translate: false, live: false, dictionary: false, thermal: false, apps: false, launcher: false, 'browser-bridge': false }
    for (const page of ['home', 'everywhere', 'utilities', 'settings'] as const) expect(resolveActivePage(page, none)).toBe(page)
    expect(resolveActivePage('reliability', ALL_MODULES_ENABLED)).toBe('home')
  })

  it('knows when a page module is the last one on', () => {
    const onlyChat = { ...ALL_MODULES_ENABLED, translate: false, live: false, dictionary: false, thermal: false, apps: false }
    expect(isLastEnabledPageModule('chat', onlyChat)).toBe(true)
    expect(isLastEnabledPageModule('translate', onlyChat)).toBe(false)
    expect(isLastEnabledPageModule('chat', ALL_MODULES_ENABLED)).toBe(false)
  })
})
