import { useId } from 'react'
import type { AppLocale, Translations } from '../../../i18n/types'
import type { ChatResponseMode, ChatTaskStarterState } from '../../../types/chatTask'
import { Button } from '../atoms'
import { LightbulbIcon, PencilIcon, TelescopeIcon, TranslateIcon } from '../icons'
import { PromptCard } from './PromptCard'
import { SelectField } from './SelectField'

export type { ChatTaskStarterState } from '../../../types/chatTask'

interface ChatTaskStartersProps {
  t: Translations
  locale: AppLocale
  state?: ChatTaskStarterState | null
  actualMode: ChatResponseMode
  onStateChange: (state: ChatTaskStarterState) => void
  onBack: (hasApplied: boolean) => void
  onApply: (prompt: string, mode: 'standard' | 'research') => void
}

/** The page owns drafts and per-conversation snapshots; picking never applies. */
export function ChatTaskStarters({ t, locale, state: storedState, actualMode, onStateChange, onBack, onApply }: ChatTaskStartersProps) {
  const panelId = useId()
  const state: ChatTaskStarterState = storedState ?? {
    selected: null, options: {}, applied: null, open: false,
  }
  const update = (next: ChatTaskStarterState) => {
    onStateChange(next)
  }
  const { selected } = state
  const tasks = [
    {
      tone: 'blue', Icon: TranslateIcon, title: t.chat_suggest_translate,
      desc: t.chat_suggest_translate_desc,
      label: t.chat_task_language, template: t.chat_task_translate_template,
      options: Object.entries(t.lang_names).filter(([value]) => value !== 'auto')
        .map(([value, label]) => ({ value, label })),
    },
    {
      tone: 'violet', Icon: TelescopeIcon, title: t.chat_suggest_research,
      desc: t.chat_suggest_research_desc,
      label: t.chat_task_depth, template: t.chat_task_research_template,
      options: [
        { value: 'research', label: t.chat_menu_deep_research },
        { value: 'overview', label: t.chat_task_overview },
      ],
    },
    {
      tone: 'green', Icon: LightbulbIcon, title: t.chat_suggest_explain,
      desc: t.chat_suggest_explain_desc,
      label: t.chat_task_level, template: t.chat_task_explain_template,
      options: [
        { value: 'simple', label: t.chat_task_simple },
        { value: 'steps', label: t.chat_task_steps },
        { value: 'technical', label: t.chat_task_technical },
      ],
    },
    {
      tone: 'orange', Icon: PencilIcon, title: t.chat_suggest_write,
      desc: t.chat_suggest_write_desc,
      label: t.chat_task_format, template: t.chat_task_write_template,
      options: [
        { value: 'email', label: t.chat_task_email },
        { value: 'article', label: t.chat_task_article },
        { value: 'rewrite', label: t.chat_task_rewrite },
      ],
    },
  ] as const
  const task = selected === null ? null : tasks[selected]
  const option = selected === null ? '' : state.options[selected]
  const plannedMode = selected === 1 && option === 'research' ? 'research' : 'standard'
  const modeLabels = { standard: t.chat_mode_standard, web: t.chat_menu_web_search, research: t.chat_menu_deep_research, image: t.chat_mode_chip_image }
  const modeMismatch = state.applied && state.applied.mode !== actualMode
  const dirty = task && (state.applied?.index !== selected || state.applied.option !== option)
  const back = () => {
    onBack(state.applied !== null)
    update({ selected: null, options: {}, applied: null, open: false })
  }

  return (
    <div className="chat-task-starters">
      <div className={selected === null ? 'chat-suggestion-grid' : 'chat-task-tabs'}>
        {tasks.map(({ tone, Icon, title, desc, options }, index) => {
          const choose = () => {
            const initial = index === 0 ? options.find((item) => item.value === locale) ?? options[0] : options[0]
            update({ ...state, selected: index, open: true,
              options: { ...state.options, [index]: state.options[index] ?? initial.value } })
          }
          return selected === null ? (
            <PromptCard key={tone} tone={tone} icon={<Icon className="h-4 w-4" />}
              title={title} description={desc} onClick={choose} />
          ) : (
            <Button key={tone} size="md" shape="rect"
              variant={selected === index ? 'primary' : 'neutral'}
              appearance={selected === index ? 'soft' : 'ghost'}
              aria-label={`${title}${desc}`} aria-pressed={selected === index}
              aria-expanded={selected === index ? true : undefined}
              aria-controls={selected === index ? panelId : undefined}
              onClick={choose}>
              <Icon className="h-4 w-4" />{title}
            </Button>
          )
        })}
      </div>
      {task && (
        <section id={panelId} className="chat-task-options" aria-label={task.title}>
          <div className="chat-task-config-row">
          <SelectField className="chat-task-option-field" label={task.label} value={option} options={task.options} onChange={(value) => {
            if (selected === null) return
            update({ ...state, options: { ...state.options, [selected]: value } })
          }} />
            <Button size="md" variant="primary" appearance="soft" disabled={!dirty && !modeMismatch} onClick={() => {
              if (selected === null) return
              const label = task.options.find((item) => item.value === option)?.label ?? ''
              const prompt = `${task.template.replace('{option}', label)}\n\n`
              onApply(prompt, plannedMode)
              update({ ...state, applied: { index: selected, option, prompt, mode: plannedMode, placement: 'instruction' }, open: true })
            }}>
              {t.chat_task_apply}
            </Button>
            <Button size="md" variant="neutral" appearance="ghost" onClick={back}>
              {t.chat_task_back}
            </Button>
          </div>
          <p className="chat-task-hint" role="status">{dirty
            ? `${t.chat_task_unapplied} · ${t.chat_task_planned_mode.replace('{mode}', modeLabels[plannedMode])}`
            : modeMismatch ? t.chat_task_mode_changed : t.chat_task_applied}</p>
          {state.applied && <details className="chat-task-instructions">
            <summary>{t.chat_task_instructions}</summary>
            <p className="chat-task-hint">{state.applied.prompt.trim()}</p>
          </details>}
        </section>
      )}
    </div>
  )
}
