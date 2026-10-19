import { DEFAULT_SETTINGS, LANGUAGES, TARGET_LANGUAGES } from '../../constants/providers'
import type { SliceGet, SliceSet } from './sliceTypes'

export type LanguageScope = 'translate' | 'live'
export interface LanguagePair { source: string; target: string }
export const languagePairKey = ({ source, target }: LanguagePair) => source === 'auto'
  ? `auto:${target}` : [source, target].sort().join(':')
export const isValidLanguagePair = (pair: LanguagePair) => LANGUAGES.some(l => l.code === pair.source)
  && TARGET_LANGUAGES.some(l => l.code === pair.target)
/** How many recently used pairs the store keeps for the picker chips. */
export const RECENT_LANGUAGE_PAIR_LIMIT = 6

export interface LanguagePairSlice {
  liveSourceLang: string
  liveTargetLang: string
  liveLanguagesLocked: boolean
  pinnedLanguagePairs: LanguagePair[]
  /** Most recent first, one entry per pair key, in the direction last used. */
  recentLanguagePairs: LanguagePair[]
  languagePairDirections: Record<LanguageScope, Record<string, LanguagePair>>
  setLanguagePair: (scope: LanguageScope, pair: LanguagePair) => void
  selectLanguagePair: (scope: LanguageScope, pair: LanguagePair) => void
  pinLanguagePair: (pair: LanguagePair) => void
  unpinLanguagePair: (key: string) => void
  setLiveLanguagesLocked: (locked: boolean) => void
}

export const createLanguagePairSlice = (set: SliceSet, get: SliceGet): LanguagePairSlice => ({
  liveSourceLang: 'auto',
  liveTargetLang: DEFAULT_SETTINGS.defaultTargetLang,
  liveLanguagesLocked: false,
  pinnedLanguagePairs: [],
  recentLanguagePairs: [],
  languagePairDirections: { translate: {}, live: {} },
  setLiveLanguagesLocked: (locked) => set({ liveLanguagesLocked: locked }),
  setLanguagePair: (scope, pair) => {
    if (!isValidLanguagePair(pair) || (scope === 'live' && get().liveLanguagesLocked)) return
    const key = languagePairKey(pair)
    set((state: LanguagePairSlice) => ({
      ...(scope === 'translate'
        ? { sourceLang: pair.source, targetLang: pair.target }
        : { liveSourceLang: pair.source, liveTargetLang: pair.target }),
      languagePairDirections: {
        ...state.languagePairDirections,
        [scope]: { ...state.languagePairDirections[scope], [key]: pair },
      },
      // Same-language pairs are a transient editing state, not something to offer again.
      recentLanguagePairs: pair.source === pair.target ? state.recentLanguagePairs
        : [pair, ...state.recentLanguagePairs.filter(p => languagePairKey(p) !== key)].slice(0, RECENT_LANGUAGE_PAIR_LIMIT),
    }))
  },
  selectLanguagePair: (scope, pair) => {
    const state = get()
    state.setLanguagePair(scope, state.languagePairDirections[scope][languagePairKey(pair)] ?? pair)
  },
  pinLanguagePair: (pair) => {
    if (!isValidLanguagePair(pair) || pair.source === pair.target) return
    set((state: LanguagePairSlice) => state.pinnedLanguagePairs.some(p => languagePairKey(p) === languagePairKey(pair))
      ? {} : { pinnedLanguagePairs: [...state.pinnedLanguagePairs, pair] })
  },
  unpinLanguagePair: (key) => set((state: LanguagePairSlice) => ({
    pinnedLanguagePairs: state.pinnedLanguagePairs.filter(p => languagePairKey(p) !== key),
  })),
})

/** Upgrade the old shared pair without inferring favorites from individual usage. */
export function migrateLanguagePairs(state: Record<string, unknown>) {
  const oldTarget = typeof state.targetLang === 'string' && TARGET_LANGUAGES.some(l => l.code === state.targetLang)
    ? state.targetLang : DEFAULT_SETTINGS.defaultTargetLang
  return {
    liveSourceLang: state.liveSourceLang ?? 'auto',
    liveTargetLang: state.liveTargetLang ?? oldTarget,
    pinnedLanguagePairs: state.pinnedLanguagePairs ?? [],
    recentLanguagePairs: state.recentLanguagePairs ?? [],
    languagePairDirections: state.languagePairDirections ?? { translate: {}, live: {} },
  }
}
