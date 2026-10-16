import type { AppLocale, Translations } from '../i18n/types'
import type { ChatTaskStarterState } from '../types/chatTask'

/** Labels and prompts share one catalog so the composer describes what is sent. */
export function getChatTaskDefinitions(t: Translations) {
  return [
    { title: t.chat_suggest_translate, desc: t.chat_suggest_translate_desc,
      label: t.chat_task_language, template: t.chat_task_translate_template,
      options: Object.entries(t.lang_names).filter(([value]) => value !== 'auto').map(([value, label]) => ({ value, label })) },
    { title: t.chat_suggest_research, desc: t.chat_suggest_research_desc,
      label: t.chat_task_depth, template: t.chat_task_research_template,
      options: [{ value: 'overview', label: t.chat_task_overview }, { value: 'research', label: t.chat_task_deep }] },
    { title: t.chat_suggest_explain, desc: t.chat_suggest_explain_desc,
      label: t.chat_task_level, template: t.chat_task_explain_template,
      options: [{ value: 'simple', label: t.chat_task_simple }, { value: 'steps', label: t.chat_task_steps }, { value: 'technical', label: t.chat_task_technical }] },
    { title: t.chat_suggest_write, desc: t.chat_suggest_write_desc,
      label: t.chat_task_format, template: t.chat_task_write_template,
      options: [{ value: 'email', label: t.chat_task_email }, { value: 'article', label: t.chat_task_article }, { value: 'rewrite', label: t.chat_task_rewrite }] },
    { title: t.chat_mode_chip_image, desc: t.chat_image_mode_hint, label: '', template: '', options: [] },
  ]
}

/** Resolve current choices at send time; old Apply metadata is migration-only. */
export function getChatTaskInstruction(t: Translations, state?: ChatTaskStarterState | null): string | undefined {
  const selected = state?.selected
  if (!state || selected == null) return undefined
  if (selected === 4) return undefined
  const task = getChatTaskDefinitions(t)[selected]
  const option = task?.options.find((item) => item.value === state.options[selected])
  return option ? `${task.template.replace('{option}', option.label)}\n\n` : undefined
}

export function selectChatTask(t: Translations, locale: AppLocale, state: ChatTaskStarterState | null | undefined, index: number | null, option?: string): ChatTaskStarterState {
  const options = { ...state?.options }
  if (index !== null) {
    const task = getChatTaskDefinitions(t)[index]
    options[index] = index === 4 ? 'image' : option ?? options[index] ?? (index === 0 ? task.options.find((item) => item.value === locale)?.value : undefined) ?? task.options[0].value
  }
  return { selected: index, options, applied: null, open: false, unified: true, webSearch: Boolean(state?.webSearch) }
}
