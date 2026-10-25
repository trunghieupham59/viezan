import { type KeyboardEvent, useCallback, useId, useRef, useState } from 'react'
import type { Translations } from '../../../i18n/types'
import { useAppStore } from '../../../store/useAppStore'
import type { ChatTaskStarterState } from '../../../types/chatTask'
import { getChatTaskDefinitions, getChatTaskInstruction, selectChatTask } from '../../../utils/chatTaskConfiguration'
import { tpl } from '../../../utils/tpl'
import { Button } from '../../ui/atoms'
import { ChatBubbleIcon, CheckIcon, ChevronDownIcon, ImageIcon, LightbulbIcon, PencilIcon, SearchIcon, TranslateIcon } from '../../ui/icons'
import { ConfigSection, SelectField } from '../../ui/molecules'
import { AIConfigurationPopover } from '../AIConfigurationPopover'

interface ChatTaskConfigurationProps {
  t: Translations
  state?: ChatTaskStarterState | null
  disabled?: boolean
  contextKey: string
  imageSupported: boolean
  /** Commits a task (null = plain chat) and its option; called only from Apply. */
  onSelect: (index: number | null, option?: string) => void
  onOpenChange: (open: boolean) => void
}

const TASK_ICONS = [TranslateIcon, SearchIcon, LightbulbIcon, PencilIcon, ImageIcon]

/**
 * The Chat task popover: pick a task and its option, see the instruction that
 * will travel with the next message, then Apply. Nothing changes until Apply;
 * Discard, Escape and an outside click leave the conversation's task as it was.
 * The choice is saved per conversation.
 */
export function ChatTaskConfiguration({ t, state, disabled, contextKey, imageSupported, onSelect, onOpenChange }: ChatTaskConfigurationProps) {
  const locale = useAppStore((store) => store.locale)
  const panelId = useId()
  const listLabelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const tasks = getChatTaskDefinitions(t)
  const selected = state?.selected
  const task = selected == null ? null : tasks[selected]
  const option = selected == null ? null : task?.options.find((item) => item.value === state?.options[selected])
  const label = task ? `${task.title}${option ? ` · ${option.label}` : ''}` : t.chat_task_none
  const Icon = selected == null ? ChatBubbleIcon : TASK_ICONS[selected]
  const open = Boolean(state?.open) && !disabled

  // The draft starts from the saved choice each time the popover opens, and
  // again when the conversation (or its turn) changes underneath it. Reset
  // during render when that key changes, so the first open frame is right.
  const draftKey = open ? contextKey : null
  const [draft, setDraft] = useState<ChatTaskStarterState>(() => selectChatTask(t, locale, state, state?.selected ?? null))
  const [draftFor, setDraftFor] = useState<string | null>(null)
  if (draftFor !== draftKey) {
    setDraftFor(draftKey)
    if (draftKey !== null) setDraft(selectChatTask(t, locale, state, state?.selected ?? null))
  }

  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  const closeAndFocusTrigger = useCallback(() => {
    onOpenChange(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [onOpenChange])

  const draftIndex = draft.selected
  const draftTask = draftIndex == null ? null : tasks[draftIndex]
  const draftOption = draftIndex == null ? undefined : draft.options[draftIndex]
  const instruction = getChatTaskInstruction(t, draft)?.trim()
  const rows = [{ index: null as number | null, title: t.chat_task_none, Icon: ChatBubbleIcon, disabled: false, hint: undefined as string | undefined },
    ...tasks.map((item, index) => ({
      index: index as number | null,
      title: item.title,
      Icon: TASK_ICONS[index],
      disabled: index === 4 && !imageSupported,
      hint: index === 4 && !imageSupported ? t.chat_image_mode_unsupported_provider : undefined,
    }))]

  const choose = (index: number | null) => setDraft(selectChatTask(t, locale, draft, index))
  const apply = () => {
    onSelect(draftIndex, draftIndex == null ? undefined : draftOption)
    close()
  }

  // Arrow keys move between tasks, like a native radio group.
  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const enabled = rows.map((row, i) => (row.disabled ? -1 : i)).filter((i) => i >= 0)
    const current = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement)
    const position = Math.max(0, enabled.indexOf(current))
    const next = enabled[(position + (event.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length]
    optionRefs.current[next]?.focus()
  }

  const triggerLabel = tpl(t.chat_task_trigger_label, { label })

  return (
    <div className="chat-task-configuration ai-configuration-anchor">
      <Button ref={triggerRef} size="md" shape="rect" variant="neutral"
        appearance={open ? 'soft' : 'outline'} disabled={disabled}
        aria-label={triggerLabel} title={triggerLabel}
        aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? panelId : undefined}
        onClick={() => onOpenChange(!state?.open)}>
        <Icon className="h-4 w-4" /><span className="chat-task-trigger-label">{triggerLabel}</span>
        <ChevronDownIcon className="h-3 w-3" />
      </Button>
      <AIConfigurationPopover
        id={panelId}
        open={open}
        title={t.chat_task_configuration}
        scopeDescription={t.chat_task_scope}
        closeLabel={t.settings_close}
        triggerRef={triggerRef}
        // The empty-chat composer sits mid-window and the active one at the bottom: open toward the room.
        placement="auto"
        align="start"
        onClose={close}
        footer={(
          <>
            <Button size="md" shape="rect" variant="neutral" appearance="ghost" onClick={closeAndFocusTrigger}>{t.chat_task_discard}</Button>
            <Button size="md" shape="rect" variant="primary" appearance="solid" onClick={apply}>{t.chat_task_apply}</Button>
          </>
        )}
      >
        <div role="listbox" aria-labelledby={listLabelId} className="chat-task-list" tabIndex={-1} onKeyDown={handleListKeyDown}>
          <span id={listLabelId} className="sr-only">{t.chat_task_configuration}</span>
          {rows.map((row, i) => {
            const isSelected = draftIndex === row.index
            const RowIcon = row.Icon
            return (
              <Button
                key={row.title}
                ref={(node) => { optionRefs.current[i] = node }}
                role="option"
                aria-selected={isSelected}
                size="md"
                shape="rect"
                variant={isSelected ? 'primary' : 'neutral'}
                appearance={isSelected ? 'soft' : 'ghost'}
                disabled={row.disabled}
                title={row.hint}
                aria-description={row.hint}
                data-ai-config-autofocus={isSelected || undefined}
                className="chat-task-row"
                onClick={() => choose(row.index)}
              >
                <RowIcon className="h-4 w-4" />
                <span className="chat-task-row__label">{row.title}</span>
                {isSelected && <CheckIcon className="chat-task-row__check" aria-hidden="true" />}
              </Button>
            )
          })}
        </div>
        {draftTask && draftTask.options.length > 0 && draftIndex != null && (
          <SelectField
            key={`${contextKey}:${draftIndex}`}
            label={draftTask.label}
            value={draftOption ?? draftTask.options[0].value}
            options={draftTask.options}
            onChange={(value) => setDraft(selectChatTask(t, locale, draft, draftIndex, value))}
            className="chat-task-option"
          />
        )}
        {instruction && (
          <ConfigSection title={t.chat_task_instruction}>
            <p className="chat-task-instruction">{instruction}</p>
          </ConfigSection>
        )}
      </AIConfigurationPopover>
      {selected === 4 && !imageSupported && <p className="chat-task-hint" role="status">{t.chat_image_mode_unsupported_provider}</p>}
    </div>
  )
}
