import { describe, expect, it } from 'vitest'
import { ALL_MODULES_ENABLED } from '../../store/slices/modulesSlice'
import { enabledPageModules, isLastEnabledPageModule, resolveActivePage } from '../enabled'

describe('enabled module helpers', () => {
  it('keeps navigation order and drops modules that are off', () => {
    const ids = enabledPageModules({ ...ALL_MODULES_ENABLED, translate: false }).map((module) => module.id)
    expect(ids).toEqual(['chat', 'live', 'dictionary'])
  })

  it('ignores non-page modules when deciding the active page', () => {
    const enabled = { ...ALL_MODULES_ENABLED, launcher: false, 'browser-bridge': false }
    expect(resolveActivePage('dictionary', enabled)).toBe('dictionary')
  })

  it('falls back to the first enabled page when the active one is off', () => {
    expect(resolveActivePage('chat', { ...ALL_MODULES_ENABLED, chat: false })).toBe('translate')
    expect(resolveActivePage('live', { ...ALL_MODULES_ENABLED, chat: false, translate: false, live: false })).toBe('dictionary')
  })

  it('keeps the page when a stale file turned every page module off', () => {
    const none = { ...ALL_MODULES_ENABLED, chat: false, translate: false, live: false, dictionary: false }
    expect(resolveActivePage('live', none)).toBe('live')
  })

  it('knows when a page module is the last one on', () => {
    const onlyChat = { ...ALL_MODULES_ENABLED, translate: false, live: false, dictionary: false }
    expect(isLastEnabledPageModule('chat', onlyChat)).toBe(true)
    expect(isLastEnabledPageModule('translate', onlyChat)).toBe(false)
    expect(isLastEnabledPageModule('chat', ALL_MODULES_ENABLED)).toBe(false)
  })
})
