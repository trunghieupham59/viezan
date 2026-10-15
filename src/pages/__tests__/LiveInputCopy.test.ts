import { describe, expect, it } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { getLiveInputCopy } from '../LiveTranslatePage'

describe('AI Interpret input guidance', () => {
  it.each([
    ['mic', 'live_empty_desc', 'live_status_listening_mic'],
    ['system', 'live_empty_system_desc', 'live_status_listening_system'],
    ['both', 'live_empty_both_desc', 'live_status_listening_both'],
  ] as const)('matches empty and active copy to the %s source', (mode, emptyKey, statusKey) => {
    const copy = getLiveInputCopy(mode, TRANSLATIONS.en)
    expect(copy.emptyDescription).toBe(TRANSLATIONS.en[emptyKey])
    expect(copy.listeningLabel).toBe(TRANSLATIONS.en[statusKey])
  })
})
