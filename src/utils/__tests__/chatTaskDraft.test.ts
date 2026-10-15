import { describe, expect, it } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { getChatTaskContent, isEmptyChatTask, removeGeneratedTaskPrompt } from '../chatTaskDraft'

describe('getChatTaskContent', () => {
  it('never removes a matching catalog prefix without recorded ownership', () => {
    const prompt = `${TRANSLATIONS.vi.chat_task_explain_template.replace('{option}', TRANSLATIONS.vi.chat_task_simple)}\n\n`
    const authored = `${prompt}My content`
    expect(removeGeneratedTaskPrompt(authored)).toBe(authored)
    expect(removeGeneratedTaskPrompt(authored, prompt)).toBe('My content')
    const edited = `My edit: ${authored}`
    expect(removeGeneratedTaskPrompt(edited, prompt)).toBe(edited)
    expect(removeGeneratedTaskPrompt(prompt.trimEnd(), prompt)).toBe(prompt.trimEnd())
  })
  it.each(['en', 'vi', 'ja'] as const)('keeps a restored %s draft when replacing its starter', (locale) => {
    const t = TRANSLATIONS[locale]
    const prefix = `${t.chat_task_translate_template.replace('{option}', t.lang_names.ja)}\n\n`
    expect(getChatTaskContent(`${prefix}User text\nwith formatting`)).toBe('User text\nwith formatting')
    expect(getChatTaskContent(`${t.chat_suggest_research_prompt}My topic`)).toBe('My topic')
  })

  it('preserves manually edited instructions and plain drafts', () => {
    expect(getChatTaskContent('Please translate this for my colleague:\nhello')).toBe('Please translate this for my colleague:\nhello')
    expect(getChatTaskContent('')).toBe('')
  })

  it.each(['en', 'vi', 'ja'] as const)('recognizes a bare %s template after whitespace is trimmed', (locale) => {
    const t = TRANSLATIONS[locale]
    const template = t.chat_task_explain_template.replace('{option}', t.chat_task_simple)
    expect(isEmptyChatTask(template)).toBe(true)
    expect(isEmptyChatTask(`${template}\n\n  `)).toBe(true)
    expect(isEmptyChatTask(`${template}\n\nMy topic`)).toBe(false)
    expect(isEmptyChatTask(`My edited instruction: ${template}`)).toBe(false)
  })
})
