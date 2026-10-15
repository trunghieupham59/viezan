import { TRANSLATIONS } from '../i18n'

/** Replace only a known starter prefix, preserving all text entered after it. */
export function getChatTaskContent(draft: string): string {
  for (const t of Object.values(TRANSLATIONS)) {
    const templates = [
      [t.chat_task_translate_template, Object.values(t.lang_names)],
      [t.chat_task_research_template, [t.chat_menu_deep_research, t.chat_task_overview]],
      [t.chat_task_explain_template, [t.chat_task_simple, t.chat_task_steps, t.chat_task_technical]],
      [t.chat_task_write_template, [t.chat_task_email, t.chat_task_article, t.chat_task_rewrite]],
    ] as const
    const prefixes = [
      t.chat_suggest_translate_prompt, t.chat_suggest_research_prompt,
      t.chat_suggest_explain_prompt, t.chat_suggest_write_prompt,
      ...templates.flatMap(([template, options]) => options.map((option) => `${template.replace('{option}', option)}\n\n`)),
    ]
    const prefix = prefixes.find((value) => value && draft.startsWith(value))
    if (prefix) return draft.slice(prefix.length)
    if (prefixes.some((value) => value && draft.trim() === value.trim())) return ''
  }
  return draft
}

/** Only exact known templates count as empty tasks; custom instructions are valid. */
export function isEmptyChatTask(draft: string): boolean {
  return Boolean(draft.trim()) && !getChatTaskContent(draft).trim()
}

/** Ownership comes from Apply metadata, never from matching a catalog template. */
export function removeGeneratedTaskPrompt(draft: string, generatedPrompt?: string): string {
  return generatedPrompt && draft.startsWith(generatedPrompt) ? draft.slice(generatedPrompt.length) : draft
}
