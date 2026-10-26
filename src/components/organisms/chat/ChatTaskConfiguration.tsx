import { type KeyboardEvent, useCallback, useId, useRef, useState } from 'react'
import type { Translations } from '../../../i18n/types'
import { useAppStore } from '../../../store/useAppStore'
import type { ChatTaskStarterState } from '../../../types/chatTask'
import { getChatTaskDefinitions, getChatTaskInstruction, selectChatTask } from '../../../utils/chatTaskConfiguration'
import { tpl } from '../../../utils/tpl'
import { Button } from '../../ui/atoms'
import { ChatBubbleIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ImageIcon, LightbulbIcon, PencilIcon, SearchIcon, TranslateIcon } from '../../ui/icons'
import { ConfigSection, OptionFlyout } from '../../ui/molecules'
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
const TRANSLATE_TASK = 0

/**
 * The Chat task popover: pick a task, pick its option in a list that opens
 * beside the task's row, see the instruction that will travel with the next
 * message, then Apply. Nothing changes until Apply;
 * Discard, Escape and an outside click leave the conversation's task as it was.
 * The choice is saved per conversation.
 */
export function ChatTaskConfiguration({ t, state, disabled, contextKey, imageSupported, onSelect, onOpenChange }: ChatTaskConfigurationProps) {
  const locale = useAppStore((store) => store.locale)
  const panelId = useId()
  const listLabelId = useId()
  const flyoutId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const flyoutAnchorRef = useRef<HTMLButtonElement | null>(null)
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
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  if (draftFor !== draftKey) {
    setDraftFor(draftKey)
    setFlyoutOpen(false)
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
  const draftOptions = draftTask?.options ?? []
  const draftOptionValue = draftOption ?? draftOptions[0]?.value
  const draftOptionLabel = draftOptions.find((item) => item.value === draftOptionValue)?.label
  const instruction = getChatTaskInstruction(t, draft)?.trim()
  const rows = [{ index: null as number | null, title: t.chat_task_none, Icon: ChatBubbleIcon, disabled: false, hint: undefined as string | undefined, hasOptions: false },
    ...tasks.map((item, index) => ({
      index: index as number | null,
      title: item.title,
      Icon: TASK_ICONS[index],
      disabled: index === 4 && !imageSupported,
      hint: index === 4 && !imageSupported ? t.chat_image_mode_unsupported_provider : undefined,
      hasOptions: item.options.length > 0,
    }))]

  const choose = (index: number | null) => setDraft(selectChatTask(t, locale, draft, index))
  // A task with options opens its list beside the row; picking the same row again toggles it.
  const chooseRow = (row: (typeof rows)[number]) => {
    choose(row.index)
    setFlyoutOpen(row.hasOptions && !(flyoutOpen && row.index === draftIndex))
  }
  const closeFlyout = useCallback((restoreFocus: boolean) => {
    setFlyoutOpen(false)
    if (restoreFocus) flyoutAnchorRef.current?.focus()
  }, [])
  const apply = () => {
    onSelect(draftIndex, draftIndex == null ? undefined : draftOption)
    close()
  }

  // One tab stop: the chosen task, or the first row when that one is unavailable.
  const tabStop = Math.max(0, rows.findIndex((row) => row.index === draftIndex && !row.disabled))

  // Arrow keys move between tasks and choose them, like a native radio group.
  // The choice is still only a draft until Apply.
  // ArrowRight opens the chosen task's option list, as in a menu with a submenu.
  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = optionRefs.current.indexOf(event.target as HTMLButtonElement)
    if (current < 0) return
    if (event.key === 'ArrowRight') {
      const row = rows[current]
      if (!row.hasOptions) return
      event.preventDefault()
      choose(row.index)
      setFlyoutOpen(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const enabled = rows.map((row, i) => (row.disabled ? -1 : i)).filter((i) => i >= 0)
    const position = Math.max(0, enabled.indexOf(current))
    const next = enabled[(position + (event.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length]
    choose(rows[next].index)
    setFlyoutOpen(false)
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
        <div role="radiogroup" aria-labelledby={listLabelId} className="chat-task-list" onKeyDown={handleListKeyDown}>
          <span id={listLabelId} className="sr-only">{t.chat_task_configuration}</span>
          {rows.map((row, i) => {
            const isSelected = draftIndex === row.index
            const hasOptions = row.hasOptions
            const RowIcon = row.Icon
            const valueId = `${flyoutId}-value`
            return (
              <Button
                key={row.title}
                ref={(node) => {
                  optionRefs.current[i] = node
                  if (isSelected) flyoutAnchorRef.current = node
                }}
                role="radio"
                aria-checked={isSelected}
                // The row's name stays the task; its chosen option is read as the description.
                aria-label={row.title}
                aria-describedby={isSelected && hasOptions ? valueId : undefined}
                aria-controls={isSelected && flyoutOpen ? flyoutId : undefined}
                tabIndex={i === tabStop ? 0 : -1}
                size="md"
                shape="rect"
                variant={isSelected ? 'primary' : 'neutral'}
                appearance={isSelected ? 'soft' : 'ghost'}
                disabled={row.disabled}
                title={row.hint}
                aria-description={row.hint}
                data-ai-config-autofocus={isSelected || undefined}
                className="chat-task-row"
                onClick={() => chooseRow(row)}
              >
                <RowIcon className="h-4 w-4" />
                <span className="chat-task-row__label">{row.title}</span>
                {isSelected && hasOptions && draftOptionLabel && (
                  <span id={valueId} className="chat-task-row__value">{draftOptionLabel}</span>
                )}
                {isSelected && <CheckIcon className="chat-task-row__check" aria-hidden="true" />}
                {hasOptions && <ChevronRightIcon className="chat-task-row__more" />}
              </Button>
            )
          })}
        </div>
        {draftTask && draftOptionValue && (
          <OptionFlyout
            id={flyoutId}
            open={flyoutOpen}
            anchorRef={flyoutAnchorRef}
            label={draftTask.label}
            value={draftOptionValue}
            options={draftOptions}
            onSelect={(value) => setDraft(selectChatTask(t, locale, draft, draftIndex, value))}
            onClose={closeFlyout}
            // Only Translate has a long list (every target language); the others hold two or three choices.
            {...(draftIndex === TRANSLATE_TASK ? {
              searchPlaceholder: t.language_picker_search_placeholder,
              noResultsLabel: t.language_picker_no_results,
              clearSearchLabel: t.history_search_clear,
            } : {})}
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
