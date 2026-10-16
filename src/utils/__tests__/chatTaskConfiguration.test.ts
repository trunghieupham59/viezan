import { describe, expect, it } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { getChatTaskExecution, normalizeChatTaskState, resolveChatTaskState } from '../../types/chatTask'
import { getChatTaskInstruction, selectChatTask } from '../chatTaskConfiguration'

describe('chat task selection and request snapshots', () => {
  it.each(['en', 'vi', 'ja'] as const)('resolves the latest selected language in %s', (locale) => {
    const t = TRANSLATIONS[locale]
    const state = selectChatTask(t, locale, null, 0, 'zh')
    expect(getChatTaskInstruction(t, state)).toBe(`${t.chat_task_translate_template.replace('{option}', t.lang_names.zh)}\n\n`)
    const changed = selectChatTask(t, locale, state, 0, 'ja')
    expect(state.options[0]).toBe('zh')
    expect(getChatTaskInstruction(t, changed)).toContain(t.lang_names.ja)
    expect(getChatTaskInstruction(t, selectChatTask(t, locale, changed, null))).toBeUndefined()
  })

  it('uses restored selections instead of obsolete Apply metadata', () => {
    const state = selectChatTask(TRANSLATIONS.en, 'en', null, 3, 'article')
    state.applied = { index: 3, option: 'email', prompt: 'Old email instruction', mode: 'standard', placement: 'instruction' }
    expect(getChatTaskInstruction(TRANSLATIONS.en, state)).toContain(TRANSLATIONS.en.chat_task_article)
    expect(getChatTaskInstruction(TRANSLATIONS.en, state)).not.toContain('Old email instruction')
  })

  it('round-trips image selection and preserves hidden source preferences without applying them', () => {
    const chat = { ...selectChatTask(TRANSLATIONS.en, 'en', null, null), webSearch: true }
    const translate = selectChatTask(TRANSLATIONS.en, 'en', chat, 0)
    expect(getChatTaskExecution(translate)).toEqual({ imageMode: false, deepResearchMode: false, webSearchMode: false })
    const image = selectChatTask(TRANSLATIONS.en, 'en', translate, 4)
    expect(normalizeChatTaskState(JSON.parse(JSON.stringify(image)))).toEqual(image)
    expect(getChatTaskExecution(image)).toEqual({ imageMode: true, deepResearchMode: false, webSearchMode: false })
    expect(getChatTaskInstruction(TRANSLATIONS.en, image)).toBeUndefined()
    const research = selectChatTask(TRANSLATIONS.en, 'en', image, 1, 'research')
    expect(getChatTaskExecution(research)).toEqual({ imageMode: false, deepResearchMode: true, webSearchMode: false })
    const overview = selectChatTask(TRANSLATIONS.en, 'en', research, 1, 'overview')
    expect(getChatTaskExecution(overview).webSearchMode).toBe(true)
  })

  it('maps legacy mode flags to one visible task and leaves unified selections authoritative', () => {
    const old = { selected: 0, options: { 0: 'ja' }, applied: null, open: false }
    expect(resolveChatTaskState(old, { imageMode: true })?.selected).toBe(4)
    expect(resolveChatTaskState(old, { deepResearchMode: true })?.options[1]).toBe('research')
    const current = selectChatTask(TRANSLATIONS.en, 'en', old, null)
    expect(resolveChatTaskState(current, { imageMode: true })).toBe(current)
  })
})
