import { beforeEach, describe, expect, it } from 'vitest'
import { migratePersistedStore, useAppStore } from '../useAppStore'

beforeEach(() => useAppStore.setState({
  sourceLang: 'vi', targetLang: 'ja', liveSourceLang: 'auto', liveTargetLang: 'vi',
  liveLanguagesLocked: false, pinnedLanguagePairs: [], languagePairDirections: { translate: {}, live: {} },
}))

describe('language pair ownership', () => {
  it('shares pins, deduplicates reverse directions and remembers directions separately', () => {
    const state = useAppStore.getState()
    const pair = { source: 'vi', target: 'ja' }
    state.pinLanguagePair(pair)
    state.pinLanguagePair({ source: 'ja', target: 'vi' })
    state.setLanguagePair('translate', pair)
    state.setLanguagePair('live', { source: 'ja', target: 'vi' })
    state.setLanguagePair('translate', { source: 'en', target: 'vi' })
    state.selectLanguagePair('translate', pair)
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'vi', targetLang: 'ja', liveSourceLang: 'ja', liveTargetLang: 'vi', pinnedLanguagePairs: [pair] })
  })
  it('locks live selection without locking AI Translate, including subtitle-driven changes', () => {
    const state = useAppStore.getState()
    state.setLiveLanguagesLocked(true)
    state.setLanguagePair('live', { source: 'en', target: 'ja' })
    state.selectLanguagePair('live', { source: 'vi', target: 'en' })
    state.setTargetLang('en')
    expect(useAppStore.getState()).toMatchObject({ liveSourceLang: 'auto', liveTargetLang: 'vi', targetLang: 'en' })
    state.setLiveLanguagesLocked(false)
    state.setLanguagePair('live', { source: 'en', target: 'ja' })
    expect(useAppStore.getState().liveTargetLang).toBe('ja')
  })
  it('stores Auto presets directionally and rejects Auto as target', () => {
    const state = useAppStore.getState()
    state.pinLanguagePair({ source: 'auto', target: 'vi' })
    state.pinLanguagePair({ source: 'auto', target: 'ja' })
    state.pinLanguagePair({ source: 'vi', target: 'auto' })
    expect(useAppStore.getState().pinnedLanguagePairs).toHaveLength(2)
    state.unpinLanguagePair('auto:vi')
    expect(useAppStore.getState().pinnedLanguagePairs).toEqual([{ source: 'auto', target: 'ja' }])
  })
  it('migrates the legacy shared pair without losing history or inferring favorites', () => {
    const legacy = { sourceLang: 'en', targetLang: 'ja', history: [{ id: 'keep' }], langUsage: { vi: { count: 8 } } }
    const migrated = migratePersistedStore(legacy)
    expect(migrated).toMatchObject({ ...legacy, liveSourceLang: 'auto', liveTargetLang: 'ja', pinnedLanguagePairs: [], languagePairDirections: { translate: {}, live: {} } })
    expect(migratePersistedStore(migrated)).toEqual(migrated)
  })
  it('persists preferences but never a transient recording lock', () => {
    const state = useAppStore.getState()
    state.pinLanguagePair({ source: 'vi', target: 'en' })
    state.setLanguagePair('live', { source: 'ja', target: 'vi' })
    state.setLiveLanguagesLocked(true)
    const saved = useAppStore.persist.getOptions().partialize?.(useAppStore.getState())
    expect(saved).toMatchObject({ liveSourceLang: 'ja', liveTargetLang: 'vi', pinnedLanguagePairs: [{ source: 'vi', target: 'en' }] })
    expect(saved).not.toHaveProperty('liveLanguagesLocked')
  })
})
