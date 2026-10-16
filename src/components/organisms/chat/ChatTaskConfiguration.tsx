import { useCallback, useId, useRef } from 'react'
import type { Translations } from '../../../i18n/types'
import type { ChatTaskStarterState } from '../../../types/chatTask'
import { getChatTaskDefinitions } from '../../../utils/chatTaskConfiguration'
import { Button } from '../../ui/atoms'
import { ChatBubbleIcon, ChevronDownIcon, ImageIcon, LightbulbIcon, PencilIcon, SearchIcon, TranslateIcon } from '../../ui/icons'
import { OptionPicker, OptionPickerPanel } from '../../ui/molecules'

interface ChatTaskConfigurationProps {
  t: Translations
  state?: ChatTaskStarterState | null
  disabled?: boolean
  contextKey: string
  imageSupported: boolean
  onSelect: (index: number | null, option?: string) => void
  onOpenChange: (open: boolean) => void
}

/** Task and task-specific options are direct controls, rather than a nested settings form. */
export function ChatTaskConfiguration({ t, state, disabled, contextKey, imageSupported, onSelect, onOpenChange }: ChatTaskConfigurationProps) {
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = state?.selected
  const tasks = getChatTaskDefinitions(t)
  const task = selected == null ? null : tasks[selected]
  const option = selected == null ? null : task?.options.find((item) => item.value === state?.options[selected])
  const label = task ? `${task.title}${option ? ` · ${option.label}` : ''}` : t.chat_task_none
  const icons = [TranslateIcon, SearchIcon, LightbulbIcon, PencilIcon, ImageIcon]
  const Icon = selected == null ? ChatBubbleIcon : icons[selected]
  const close = useCallback((restoreFocus: boolean) => {
    onOpenChange(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }, [onOpenChange])
  const open = Boolean(state?.open) && !disabled
  return (
    <div className="chat-task-configuration">
      <Button ref={triggerRef} size="md" shape="pill" variant={task ? 'primary' : 'neutral'}
        appearance={task ? 'soft' : 'ghost'} disabled={disabled}
        aria-label={`${t.chat_task_configuration}: ${label}`} title={label}
        aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? panelId : undefined}
        onClick={() => onOpenChange(!state?.open)}>
        <Icon className="h-4 w-4" /><span className="chat-task-trigger-label">{task?.title ?? t.chat_task_none}</span>
        <ChevronDownIcon className="h-3 w-3" />
      </Button>
      <OptionPickerPanel id={panelId} open={open} anchorRef={triggerRef} onClose={close}
        value={selected == null ? 'none' : String(selected)} label={t.chat_task_configuration}
        options={[{ value: 'none', label: t.chat_task_none, icon: <ChatBubbleIcon /> }, ...tasks.map((item, index) => {
          const TaskIcon = icons[index]
          return { value: String(index), label: item.title, icon: <TaskIcon />,
            disabled: index === 4 && !imageSupported, hint: index === 4 && !imageSupported ? t.chat_image_mode_unsupported_provider : undefined }
        })]}
        onChange={(value) => onSelect(value === 'none' ? null : Number(value))} />
      {task && task.options.length > 0 && selected != null && <OptionPicker key={`${contextKey}:${selected}`} label={task.label}
        value={state?.options[selected] ?? ''} options={task.options} disabled={disabled}
        className="chat-task-inline-option" onChange={(value) => onSelect(selected, value)}
        searchPlaceholder={selected === 0 ? t.language_picker_search_placeholder : undefined}
        noResultsLabel={t.language_picker_no_results} />}
      {selected === 4 && !imageSupported && <p className="chat-task-hint" role="status">{t.chat_image_mode_unsupported_provider}</p>}
    </div>
  )
}
