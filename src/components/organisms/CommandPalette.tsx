import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { MAX_CHAT_INPUT_CHARS } from '../../constants/providers'
import { type PaletteAnswerMode, usePaletteAiAnswer } from '../../hooks/usePaletteAiAnswer'
import { hasWebSearchApi } from '../../services/searchResultFormatting'
import { useAppStore, useT } from '../../store/useAppStore'
import type { AppPage } from '../../types'
import { createClientId } from '../../utils/id'
import { parsePaletteQuery } from '../../utils/paletteQuery'
import { evaluateQuickCalc } from '../../utils/quickCalc'
import { tpl } from '../../utils/tpl'
import { MarkdownText } from '../MarkdownText'
import { Button, Input } from '../ui/atoms'
import {
  BookIcon,
  CalculatorIcon,
  ChatBubbleIcon,
  CopyIcon,
  GearIcon,
  GlobeIcon,
  MicrophoneIcon,
  SearchIcon,
  SparklesIcon,
  SpinnerIcon,
  TranslateIcon,
  XIcon,
} from '../ui/icons'

interface PaletteItem {
  id: string
  kind: 'command' | 'calc' | 'ask'
  label: string
  description: string
  icon: ReactNode
  action: () => void
  keywords: string[]
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase()
    .trim()
}

const FOCUSABLE_SELECTOR = 'input, button'

/**
 * App-level command search with keyboard-first navigation.
 *
 * Besides commands it answers inline: arithmetic is evaluated locally (Enter copies the
 * result) and any other text can be sent to the selected AI model, whose answer streams
 * into the palette and can be continued in AI Chat. Prefixes route a query directly:
 * `?` asks the AI, `??` asks it with web search, `t <text>` opens AI Translate and
 * `d <word>` looks the word up in the Dictionary.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const {
    setActivePage,
    clearTranslation,
    setSourceText,
    setPendingDictionaryTerm,
    openSettings,
    locale,
    selectedProvider,
    selectedModels,
    keyStatus,
    createChatSession,
    setActiveChatSession,
    addChatMessage,
  } = useAppStore()
  const t = useT()
  const ai = usePaletteAiAnswer()
  const { cancel: cancelAi, ask: askAi } = ai
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  /** Non-null while the AI answer panel replaces the command list. */
  const [answerQuestion, setAnswerQuestion] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const copiedTimerRef = useRef<number | undefined>(undefined)
  const listboxId = useId()

  const platform = window.api?.platform
  const modifierLabel = platform === 'darwin' ? '⌘' : 'Ctrl'
  const model = selectedModels[selectedProvider] ?? ''
  const hasKey = selectedProvider === 'local' || Boolean(keyStatus[selectedProvider])
  const inAnswerMode = answerQuestion !== null

  const navigate = useCallback((page: AppPage, extra?: () => void) => {
    extra?.()
    setActivePage(page)
    onClose()
  }, [onClose, setActivePage])

  const commands = useMemo<PaletteItem[]>(() => [
    {
      id: 'chat',
      kind: 'command',
      label: t.nav_chat,
      description: t.command_palette_chat_description,
      icon: <ChatBubbleIcon className="h-4 w-4" />,
      action: () => navigate('chat'),
      keywords: ['chat', 'ai', 'message', 'conversation'],
    },
    {
      id: 'translate',
      kind: 'command',
      label: t.nav_translate,
      description: t.command_palette_translate_description,
      icon: <TranslateIcon className="h-4 w-4" />,
      action: () => navigate('translate', clearTranslation),
      keywords: ['translate', 'translation', 'language', 'text', 'image', 'voice'],
    },
    {
      id: 'live',
      kind: 'command',
      label: t.nav_live_translate,
      description: t.command_palette_live_description,
      icon: <MicrophoneIcon className="h-4 w-4" />,
      action: () => navigate('live'),
      keywords: ['live', 'speech', 'microphone', 'real-time', 'subtitle'],
    },
    {
      id: 'dictionary',
      kind: 'command',
      label: t.nav_dictionary,
      description: t.command_palette_dictionary_description,
      icon: <BookIcon className="h-4 w-4" />,
      action: () => navigate('dictionary'),
      keywords: ['dictionary', 'lookup', 'word', 'definition', 'meaning'],
    },
    {
      id: 'settings',
      kind: 'command',
      label: t.nav_settings,
      description: t.command_palette_settings_description,
      icon: <GearIcon className="h-4 w-4" />,
      action: () => {
        onClose()
        openSettings()
      },
      keywords: ['settings', 'preferences', 'api', 'key', 'config', 'hotkey', 'shortcut'],
    },
  ], [clearTranslation, navigate, onClose, openSettings, t])

  const parsed = useMemo(() => parsePaletteQuery(query), [query])
  const isDefaultMode = parsed.mode === 'default'
  /** The text sent to the AI / translator: the query without its routing prefix. */
  const payload = parsed.text
  const normalizedQuery = normalizeSearchValue(query)
  const matchingCommands = useMemo(() => {
    if (!isDefaultMode) return []
    return normalizedQuery
      ? commands.filter((item) => [item.label, item.description, ...item.keywords]
        .some(value => normalizeSearchValue(value).includes(normalizedQuery)))
      : commands
  }, [commands, isDefaultMode, normalizedQuery])

  const calc = useMemo(() => (isDefaultMode ? evaluateQuickCalc(query, locale) : null), [isDefaultMode, locale, query])
  const webSearchAvailable = hasWebSearchApi()

  const copyCalcResult = useCallback(() => {
    if (!calc) return
    void navigator.clipboard?.writeText(calc.formatted)?.catch(() => {})
    onClose()
  }, [calc, onClose])

  const startAsk = useCallback((mode: PaletteAnswerMode) => {
    if (!payload) return
    setAnswerQuestion(payload)
    if (hasKey && payload.length <= MAX_CHAT_INPUT_CHARS) {
      void askAi(payload, selectedProvider, model, mode)
    }
  }, [askAi, hasKey, model, payload, selectedProvider])

  const openDictionary = useCallback(() => {
    if (!payload) return
    navigate('dictionary', () => setPendingDictionaryTerm(payload))
  }, [navigate, payload, setPendingDictionaryTerm])

  const openTranslate = useCallback(() => {
    if (!payload) return
    navigate('translate', () => {
      clearTranslation()
      setSourceText(payload)
    })
  }, [clearTranslation, navigate, payload, setSourceText])

  const rows = useMemo<PaletteItem[]>(() => {
    const askRow: PaletteItem = {
      id: 'ask',
      kind: 'ask',
      label: t.command_palette_ask_ai_label,
      description: tpl(t.command_palette_ask_ai_description, { query: payload }),
      icon: <SparklesIcon className="h-4 w-4" />,
      action: () => startAsk('quick'),
      keywords: [],
    }
    const verifyRow: PaletteItem = {
      id: 'verify',
      kind: 'ask',
      label: t.command_palette_verify_label,
      description: tpl(t.command_palette_verify_description, { query: payload }),
      icon: <GlobeIcon className="h-4 w-4" />,
      action: () => startAsk('web'),
      keywords: [],
    }
    const aiRows = webSearchAvailable ? [askRow, verifyRow] : [askRow]

    if (!payload) return [...matchingCommands]
    if (parsed.mode === 'translate') {
      return [{
        id: 'translate-text',
        kind: 'command',
        label: t.nav_translate,
        description: tpl(t.command_palette_translate_text_description, { text: payload }),
        icon: <TranslateIcon className="h-4 w-4" />,
        action: openTranslate,
        keywords: [],
      }]
    }
    if (parsed.mode === 'dictionary') {
      return [{
        id: 'dictionary-text',
        kind: 'command',
        label: t.nav_dictionary,
        description: tpl(t.command_palette_dictionary_text_description, { text: payload }),
        icon: <BookIcon className="h-4 w-4" />,
        action: openDictionary,
        keywords: [],
      }]
    }
    if (parsed.mode === 'verify' && webSearchAvailable) return [verifyRow, askRow]
    if (parsed.mode !== 'default') return aiRows

    const result: PaletteItem[] = []
    if (calc) {
      result.push({
        id: 'calc',
        kind: 'calc',
        label: `= ${calc.formatted}`,
        description: tpl(t.command_palette_calc_description, { expression: calc.expression }),
        icon: <CalculatorIcon className="h-4 w-4" />,
        action: copyCalcResult,
        keywords: [],
      })
    }
    result.push(...matchingCommands, ...aiRows)
    return result
  }, [calc, copyCalcResult, matchingCommands, openDictionary, openTranslate, parsed.mode, payload, startAsk, t, webSearchAvailable])

  const activeItem = inAnswerMode ? undefined : rows[highlighted]
  const activeOptionId = activeItem ? `${listboxId}-${activeItem.id}` : undefined
  const canOpenInChat = inAnswerMode && ai.status === 'done' && Boolean(ai.answer.trim())
  const answerTooLong = inAnswerMode && (answerQuestion?.length ?? 0) > MAX_CHAT_INPUT_CHARS

  const leaveAnswerMode = useCallback(() => {
    cancelAi()
    setAnswerQuestion(null)
    setCopied(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [cancelAi])

  const openInChat = useCallback(() => {
    if (!answerQuestion || !canOpenInChat) return
    const sessionId = createChatSession(selectedProvider, model)
    setActiveChatSession(sessionId)
    addChatMessage(sessionId, {
      id: createClientId('palette-user'),
      role: 'user',
      content: [{ type: 'text', text: answerQuestion }],
      timestamp: Date.now(),
    })
    addChatMessage(sessionId, {
      id: createClientId('palette-assistant'),
      role: 'assistant',
      content: [{ type: 'text', text: ai.answer }],
      timestamp: Date.now(),
    })
    setActivePage('chat')
    onClose()
  }, [
    addChatMessage, ai.answer, answerQuestion, canOpenInChat, createChatSession, model,
    onClose, selectedProvider, setActiveChatSession, setActivePage,
  ])

  const copyAnswer = useCallback(async () => {
    if (!ai.answer.trim() || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(ai.answer.trim())
    } catch {
      return
    }
    setCopied(true)
    window.clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1200)
  }, [ai.answer])

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), [])

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setQuery('')
    setHighlighted(0)
    setAnswerQuestion(null)
    setCopied(false)
    const frame = requestAnimationFrame(() => inputRef.current?.focus())

    return () => {
      cancelAnimationFrame(frame)
      cancelAi()
      const previousFocus = previousFocusRef.current
      previousFocusRef.current = null
      previousFocus?.focus()
    }
  }, [cancelAi, open])

  useEffect(() => {
    setHighlighted(current => Math.min(current, Math.max(0, rows.length - 1)))
  }, [rows.length])

  useEffect(() => {
    if (!open || inAnswerMode || rows.length === 0) return
    itemRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, inAnswerMode, open, rows.length])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return

      if (event.key === 'Escape') {
        event.preventDefault()
        if (inAnswerMode) leaveAnswerMode()
        else onClose()
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        const focusable = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
        ).filter(element => !element.hasAttribute('disabled') && element.tabIndex >= 0)
        if (focusable.length === 0) return

        const current = focusable.indexOf(document.activeElement as HTMLElement)
        const step = event.shiftKey ? -1 : 1
        const next = current === -1
          ? (event.shiftKey ? focusable.length - 1 : 0)
          : (current + step + focusable.length) % focusable.length
        focusable[next].focus()
        return
      }

      if (inAnswerMode) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          openInChat()
        }
        return
      }

      if (rows.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlighted(current => (current + 1) % rows.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlighted(current => (current - 1 + rows.length) % rows.length)
      } else if (event.key === 'Home') {
        event.preventDefault()
        setHighlighted(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        setHighlighted(rows.length - 1)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        rows[highlighted]?.action()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [highlighted, inAnswerMode, leaveAnswerMode, onClose, open, openInChat, rows])

  if (!open) return null

  const showNoCommandHint = isDefaultMode && Boolean(payload) && !inAnswerMode && !calc && matchingCommands.length === 0

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is pointer-only; the dialog owns Escape handling.
    <div
      className="modal-backdrop cmd-palette-backdrop titlebar-no-drag"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="modal-surface cmd-palette-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.nav_command_palette}
      >
        <div className="cmd-palette-input-row">
          <SearchIcon className="cmd-palette-search-icon" />
          <Input
            ref={inputRef}
            size="lg"
            className="cmd-palette-input"
            type="search"
            role="combobox"
            aria-label={t.command_palette_search_placeholder}
            aria-autocomplete="list"
            aria-controls={inAnswerMode ? undefined : listboxId}
            aria-expanded={!inAnswerMode}
            aria-activedescendant={activeOptionId}
            placeholder={t.command_palette_search_placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlighted(0)
              if (inAnswerMode) leaveAnswerMode()
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            size="lg"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            className="cmd-palette-close"
            aria-label={t.command_palette_hint_close}
            onClick={onClose}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {showNoCommandHint && (
          <div className="cmd-palette-inline-hint" role="status" aria-live="polite">
            {t.command_palette_no_results}
          </div>
        )}

        {inAnswerMode ? (
          <section className="cmd-palette-answer" aria-label={t.command_palette_ask_ai_label}>
            <p className="cmd-palette-answer-question">{answerQuestion}</p>

            <div
              className="cmd-palette-answer-body"
              aria-live="polite"
              aria-busy={ai.status === 'loading' || ai.status === 'streaming'}
            >
              {!hasKey ? (
                <div className="ui-error-box" role="alert">
                  <p>{t.chat_error_no_key}</p>
                  <Button
                    size="sm"
                    variant="neutral"
                    appearance="outline"
                    className="cmd-palette-answer-settings"
                    onClick={() => {
                      onClose()
                      openSettings()
                    }}
                  >
                    {t.chat_error_open_settings}
                  </Button>
                </div>
              ) : answerTooLong ? (
                <div className="ui-error-box" role="alert">{t.ai_chat_popup_input_too_long}</div>
              ) : ai.status === 'error' && !ai.answer ? (
                <div className="ui-error-box" role="alert">{ai.error}</div>
              ) : ai.answer ? (
                <>
                  <MarkdownText text={ai.answer} className="cmd-palette-answer-text" />
                  {ai.status === 'error' && <div className="ui-error-box" role="alert">{ai.error}</div>}
                </>
              ) : (
                <span className="cmd-palette-answer-pending" role="status">
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  {ai.searching ? t.chat_smart_thinking_searching : t.chat_thinking}
                </span>
              )}
            </div>

            {(ai.answer.trim() || ai.status === 'error') && (
              <div className="cmd-palette-answer-footer">
                <span className="cmd-palette-answer-disclaimer">{t.command_palette_answer_disclaimer}</span>
                <div className="cmd-palette-answer-actions">
                  <Button
                    size="sm"
                    variant="neutral"
                    appearance="ghost"
                    disabled={!ai.answer.trim()}
                    onClick={() => { void copyAnswer() }}
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                    {copied ? t.chat_copied : t.chat_copy}
                  </Button>
                  <Button
                    size="sm"
                    variant="neutral"
                    appearance="ghost"
                    disabled={!canOpenInChat}
                    onClick={openInChat}
                  >
                    {t.ai_chat_popup_open_in_chat}
                    <kbd className="keyboard-key">{modifierLabel}</kbd>
                    <kbd className="keyboard-key">↵</kbd>
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <div
            id={listboxId}
            className="cmd-palette-list"
            role="listbox"
            aria-label={t.nav_command_palette}
          >
            {rows.map((item, index) => {
              const isHighlighted = index === highlighted
              return (
                <Button
                  ref={(node) => { itemRefs.current[index] = node }}
                  key={item.id}
                  id={`${listboxId}-${item.id}`}
                  size="lg"
                  shape="rect"
                  variant={isHighlighted ? 'primary' : 'neutral'}
                  appearance={isHighlighted ? 'soft' : 'ghost'}
                  className={`cmd-palette-item${isHighlighted ? ' highlighted' : ''}`}
                  role="option"
                  aria-label={`${item.label}. ${item.description}`}
                  aria-selected={isHighlighted}
                  tabIndex={-1}
                  data-command-id={item.id}
                  data-command-kind={item.kind}
                  onMouseEnter={() => setHighlighted(index)}
                  onFocus={() => setHighlighted(index)}
                  onClick={item.action}
                >
                  <span className="cmd-palette-item-icon">{item.icon}</span>
                  <span className="cmd-palette-item-copy">
                    <span className="cmd-palette-item-name">{item.label}</span>
                    <span className="cmd-palette-item-description">{item.description}</span>
                  </span>
                  <kbd className="keyboard-key cmd-palette-enter-hint">↵</kbd>
                </Button>
              )
            })}
          </div>
        )}

        <div className="cmd-palette-footer" aria-hidden="true">
          {inAnswerMode ? (
            <span className="cmd-palette-hint">
              <kbd className="keyboard-key">esc</kbd>
              {t.command_palette_hint_back}
            </span>
          ) : (
            <>
              <span className="cmd-palette-hint">
                <kbd className="keyboard-key">↑↓</kbd>
                {t.command_palette_hint_navigate}
              </span>
              <span className="cmd-palette-hint">
                <kbd className="keyboard-key">↵</kbd>
                {t.command_palette_hint_open}
              </span>
              <span className="cmd-palette-hint">
                <kbd className="keyboard-key">esc</kbd>
                {t.command_palette_hint_close}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
