/**
 * AIChatPopup — Raycast-style standalone quick chat window.
 *
 * UX shape:
 *  - Q&A card (question header + answer body) per turn.
 *  - When a new turn starts, the active card snaps to fill the viewport,
 *    pushing older Q&A above the fold. Older pairs are revealed by
 *    scrolling up; wheel scroll works from anywhere on the popup.
 *  - Each Q&A has its own Copy + Regenerate actions on the bottom-right.
 *  - Conversation persists across hide ↔ show within a 5-minute TTL window
 *    so the user can re-open the popup and keep the context.
 *  - Whole popup is a drag region; interactive controls opt out.
 *
 * Mounted by quick-chat.html, not by the main app shell.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { MAX_CHAT_INPUT_CHARS } from '../constants/providers'
import type { ChatMessage } from '../services/chatService'
import { smartThinkingService } from '../services/smartThinkingService'
import { useAppStore, useT } from '../store/useAppStore'
import { shouldUseCarefulReasoning } from '../utils/carefulReasoning'
import { localizeChatError, localizeChatException } from '../utils/chatErrors'
import { shouldSendChatMessage } from '../utils/keyboardShortcuts'
import { formatModelName } from '../utils/modelDisplay'
import { tpl } from '../utils/tpl'
import { AppLogoIcon } from './AppLogo'
import { MarkdownText } from './MarkdownText'
import { ProviderIcon } from './ProviderIcon'
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  PlusIcon,
  RefreshIcon,
  SendIcon,
  SparklesIcon,
  SpinnerIcon,
  XIcon,
} from './ui/icons'
import { ThinkingPill } from './ui/molecules'

const QUICK_TEXTAREA_MAX_HEIGHT_PX = 120

/** Conversation kept this long after dismissal; after that, full reset on next show. */
const HISTORY_TTL_MS = 5 * 60 * 1000

const isMacPlatform = () => window.api?.platform === 'darwin'
const getPrimaryModifierKeyLabel = () => (isMacPlatform() ? '⌘' : 'Ctrl')
const getPrimaryModifierShortcutLabel = () => (isMacPlatform() ? 'Cmd' : 'Ctrl')

function isPrimaryModifierShortcut(e: KeyboardEvent, key: string) {
  const isMac = isMacPlatform()
  const primaryModifier = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  return primaryModifier && !e.altKey && !e.shiftKey && e.key.toLowerCase() === key.toLowerCase()
}

/** Internal conversation memory — sent to the model on every follow-up. */
interface Turn {
  role: 'user' | 'assistant'
  text: string
}

interface SmartStep {
  label: string
  content: string
  status: 'running' | 'complete' | 'error'
}

/** Small visual key cap used for keyboard hints. */
function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="keyboard-key">
      {children}
    </kbd>
  )
}

export function AIChatPopup() {
  const {
    selectedProvider,
    selectedModels,
    keyStatus,
    setKeyStatus,
    chatSystemPrompt,
    chatSendShortcut,
    theme,
  } = useAppStore()

  const t = useT()

  // ── Visible state — current/active Q&A pair ─────────────────────────────
  const [activeQuestion, setActiveQuestion] = useState('')
  const [response, setResponse] = useState('')
  const [smartStep, setSmartStep] = useState<SmartStep | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Conversation memory ───────────────────────────────────────────────
  // `history` holds finalized [user, assistant, user, assistant, ...] turns.
  // The active pair lives in `activeQuestion`/`response` and only gets folded
  // into history when the user sends a follow-up.
  const [history, setHistory] = useState<Turn[]>([])

  /**
   * Per-Q&A "Copied!" feedback key:
   *  - `'active'` — copied the active answer
   *  - `'footer'` — copied via the bottom-bar Copy button
   *  - number    — index of the Q&A pair in `history`
   */
  const [copiedKey, setCopiedKey] = useState<number | 'active' | 'footer' | null>(null)

  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /** Outer scroll container for the whole Q&A list. */
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  /** Wrapper around the active Q&A card — sized to fill the viewport. */
  const activeWrapperRef = useRef<HTMLDivElement>(null)
  const [viewportHeight, setViewportHeight] = useState<number>(0)
  /** Wall-clock of last dismissal — drives the HISTORY_TTL_MS check. */
  const lastHideAtRef = useRef<number>(0)

  const model = selectedModels[selectedProvider] ?? ''
  const hasKey = selectedProvider === 'local' || keyStatus[selectedProvider]
  const platform = window.api?.platform
  const trimmedLength = input.trim().length
  const inputTooLong = trimmedLength > MAX_CHAT_INPUT_CHARS
  const canSend = Boolean(input.trim()) && !inputTooLong && !isSending && hasKey
  const turnCount = history.length / 2 + (activeQuestion ? 1 : 0)
  const hasContext = turnCount > 0
  const showThinking = isSending && !response.trim()
  const primaryModifierKey = getPrimaryModifierKeyLabel()
  const primaryModifierShortcut = getPrimaryModifierShortcutLabel()
  const placeholder = hasContext
    ? t.ai_chat_popup_followup_placeholder
    : chatSendShortcut === 'modEnter'
      ? tpl(t.ai_chat_popup_placeholder_mod_enter, { mod: primaryModifierShortcut })
      : t.ai_chat_popup_placeholder

  // Pretty short label for the active model (e.g. "GPT 5.4 Mini").
  // Falls back to `default` when no model has been picked yet.
  const modelLabel = model ? formatModelName(selectedProvider, model) : 'default'

  const focusInput = useCallback(() => {
    window.setTimeout(() => textareaRef.current?.focus(), 30)
  }, [])

  const hardReset = useCallback(() => {
    setActiveQuestion('')
    setResponse('')
    setSmartStep(null)
    setHistory([])
    setInput('')
    setError(null)
    setIsSending(false)
    setCopiedKey(null)
  }, [])

  const handleShow = useCallback(() => {
    // The popup runs in its own BrowserWindow / renderer process and therefore
    // has its own Zustand store. The main window persists provider / model /
    // system-prompt selections to localStorage; force a re-hydrate every time
    // the popup becomes visible so the user actually sees the latest config
    // (otherwise the popup keeps the snapshot it had on first mount).
    useAppStore.persist?.rehydrate?.()
    const elapsed = Date.now() - lastHideAtRef.current
    if (elapsed >= HISTORY_TTL_MS) {
      hardReset()
    }
    setInput('')
    setError(null)
    setCopiedKey(null)
    focusInput()
  }, [hardReset, focusInput])


  const hidePopup = useCallback(() => {
    lastHideAtRef.current = Date.now()
    window.api?.quickChat?.hide()
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      return
    }
    if (theme === 'light') {
      root.classList.remove('dark')
      return
    }
    if (typeof window.matchMedia !== 'function') {
      root.classList.remove('dark')
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = (dark: boolean) => root.classList.toggle('dark', dark)
    applyTheme(media.matches)
    const handleChange = (event: MediaQueryListEvent) => applyTheme(event.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme])

  // Mount lifecycle: tag <html> for popup-only CSS, run show-time logic.
  useEffect(() => {
    document.documentElement.classList.add('quick-chat-window')
    handleShow()
    return () => document.documentElement.classList.remove('quick-chat-window')
  }, [handleShow])

  // Subsequent shows from main process.
  useEffect(() => {
    if (!window.api?.quickChat?.onShow) return
    return window.api.quickChat.onShow(handleShow)
  }, [handleShow])

  // Detect API key for the selected provider.
  useEffect(() => {
    if (selectedProvider === 'local') {
      setKeyStatus('local', true)
      return
    }
    if (!window.api?.keychain?.hasKey) return
    window.api.keychain
      .hasKey(selectedProvider)
      .then((result) => setKeyStatus(selectedProvider, Boolean(result.exists)))
      .catch(() => setKeyStatus(selectedProvider, false))
  }, [selectedProvider, setKeyStatus])

  // Auto-grow textarea height to fit content (capped).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, QUICK_TEXTAREA_MAX_HEIGHT_PX)}px`
  })

  // Measure scroll-container height so the active Q&A card can fill the viewport.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const update = () => setViewportHeight(el.clientHeight)
    update()
    const RO = typeof ResizeObserver !== 'undefined' ? ResizeObserver : null
    const ro = RO ? new RO(update) : null
    ro?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  // When a brand-new turn starts, snap the active card to the top.
  useEffect(() => {
    if (!activeQuestion) return
    const target = activeWrapperRef.current
    const container = scrollContainerRef.current
    if (!target || !container) return
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: target.offsetTop, behavior: 'smooth' })
    } else {
      container.scrollTop = target.offsetTop
    }
  }, [activeQuestion])

  /** Build IPC payload from full history + the next user turn. */
  const buildMessages = useCallback(
    (turns: Turn[], nextUserText: string): ChatMessage[] => {
      const all: ChatMessage[] = []
      for (const turn of turns) {
        if (!turn.text.trim()) continue
        all.push({ role: turn.role, content: [{ type: 'text', text: turn.text }] })
      }
      all.push({ role: 'user', content: [{ type: 'text', text: nextUserText }] })
      return all
    },
    [],
  )

  /**
   * Stream a single user turn using the given history snapshot. Used by both
   * "send a new question" and "regenerate the active answer".
   */
  const streamTurn = useCallback(
    async (historySnapshot: Turn[], userText: string) => {
      setActiveQuestion(userText)
      setResponse('')
      setSmartStep(null)
      setError(null)
      setIsSending(true)

      const payload = buildMessages(historySnapshot, userText)

      try {
        await smartThinkingService.run({
          provider: selectedProvider,
          model,
          question: userText,
          messages: payload,
          systemPrompt: chatSystemPrompt || undefined,
          // Careful Reasoning protects quantitative questions from silent
          // miscalculation, but stiffens every other answer — attach it only
          // when the question contains numbers.
          carefulReasoning: shouldUseCarefulReasoning(userText),
          uiText: {

            webSearchStepLabelPrefix: t.chat_smart_thinking_step_label_prefix,
            webSearchSummaryTitle: t.chat_smart_thinking_summary_title,
            webSearchDefaultReason: t.chat_smart_thinking_default_reason,
            webSearchSourcesTitle: t.chat_smart_thinking_sources_title,
            webSearchNoSources: t.chat_smart_thinking_no_sources,
            webSearchNoResults: t.chat_smart_thinking_no_results,
            webSearchErrorFallback: t.chat_smart_thinking_search_error,
            noResponseError: t.chat_smart_thinking_no_response,
            unknownError: t.chat_smart_thinking_unknown_error,
          },
          callbacks: {
            // Smart Thinking lifecycle:
            //   • running   → swap "Thinking…" for the Smart Thinking pill
            //   • complete  → clear the pill so we fall back to plain "Thinking…"
            //                  while we wait for the answer to start streaming
            //   • error     → same as complete (the model will answer from
            //                  internal knowledge); no detail surfaced in UI
            onStepStart: (label) => {
              setSmartStep({ label, content: '', status: 'running' })
              return 'quick-chat-smart-step'
            },
            onStepComplete: () => {
              setSmartStep(null)
            },
            onStepError: () => {
              setSmartStep(null)
            },
            onAnswerStart: () => {
              setSmartStep(null)
              setResponse('')
              return 'quick-chat-smart-answer'
            },
            onAnswerToken: (_msgId, content) => {
              setResponse(content)
            },
            onAnswerComplete: (_msgId, content) => {
              setResponse(content)
            },
            onAnswerError: (_msgId, message, errorCode) => {
              setError(localizeChatError(t, { error: message, errorCode }, t.chat_error_failed_response))
            },
          },
        })
      } catch (err) {
        setError(localizeChatException(t, err, t.chat_error_unexpected))
      } finally {
        setIsSending(false)
        focusInput()
      }
    },
    [buildMessages, selectedProvider, model, chatSystemPrompt, t, focusInput],
  )


  /** Send a new question (or follow-up). Folds previous answer into history. */
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || inputTooLong || isSending || !hasKey) return

    let nextHistory = history
    if (activeQuestion && response.trim()) {
      nextHistory = [
        ...history,
        { role: 'user', text: activeQuestion },
        { role: 'assistant', text: response },
      ]
      setHistory(nextHistory)
    }

    setInput('')
    await streamTurn(nextHistory, text)
  }, [input, inputTooLong, isSending, hasKey, history, activeQuestion, response, streamTurn])

  /**
   * Re-run the LLM for the given question.
   *  - For the active turn (`pairIdx === undefined`): re-run the same active
   *    question against the existing finalized history.
   *  - For an older pair (`pairIdx >= 0`): truncate history back to before
   *    that pair, restore its question to the active slot, and re-stream.
   *    Any later turns are dropped — same model as ChatGPT's "regenerate".
   */
  const handleRegenerate = useCallback(
    async (pairIdx?: number) => {
      if (isSending || !hasKey) return

      if (typeof pairIdx === 'number') {
        const userTurn = history[pairIdx * 2]
        if (!userTurn || userTurn.role !== 'user') return
        const truncated = history.slice(0, pairIdx * 2)
        setHistory(truncated)
        await streamTurn(truncated, userTurn.text)
        return
      }

      if (!activeQuestion.trim()) return
      await streamTurn(history, activeQuestion)
    },
    [isSending, hasKey, history, activeQuestion, streamTurn],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSendChatMessage(e.nativeEvent, chatSendShortcut, platform)) {
      e.preventDefault()
      e.stopPropagation()
      handleSend()
    }
  }

  const handleClearInput = useCallback(() => {
    setInput('')
    focusInput()
  }, [focusInput])

  const handleNewConversation = useCallback(() => {
    setHistory([])
    setActiveQuestion('')
    setResponse('')
    setSmartStep(null)
    setInput('')
    setError(null)
    focusInput()
  }, [focusInput])

  const handleOpenSettings = useCallback(() => {
    window.api?.quickChat?.openSettings()
  }, [])

  /** Copy text to clipboard and flash "Copied!" feedback on the matching button. */
  const handleCopy = useCallback(
    async (text: string, key: number | 'active' | 'footer') => {
      const value = text.trim()
      if (!value || !navigator.clipboard?.writeText) return
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 1200)
    },
    [],
  )

  const handleOpenInChat = useCallback(() => {
    const draft = input.trim()
    const question = draft || activeQuestion
    if (!question) {
      window.api?.quickChat?.openInChat()
      return
    }
    window.api?.quickChat?.openInChat({
      question,
      response: response.trim() || undefined,
      provider: selectedProvider,
      model,
    })
  }, [input, activeQuestion, response, selectedProvider, model])

  // Keyboard shortcuts: Esc closes; Cmd/Ctrl+N starts over; Cmd/Ctrl+Enter opens full Chat.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hidePopup()
        return
      }
      if (isPrimaryModifierShortcut(e, 'n') && !e.repeat) {
        if (hasContext || input.trim() || error) {
          e.preventDefault()
          handleNewConversation()
        }
        return
      }
      if (isPrimaryModifierShortcut(e, 'enter')) {
        e.preventDefault()
        handleOpenInChat()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [error, handleNewConversation, handleOpenInChat, hasContext, hidePopup, input])

  // Mark dismissal time whenever the popup loses visibility (any path).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') lastHideAtRef.current = Date.now()
    }
    const onBlur = () => {
      lastHideAtRef.current = Date.now()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  /**
   * Forward wheel events from anywhere on the popup into the inner scroll
   * container, so users can scroll the conversation by spinning the wheel
   * over the header / footer / empty space — not only on the Q&A list.
   */
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current
    if (!container) return
    const target = e.target as Node | null
    if (target && container.contains(target)) return // native scroll handles it
    container.scrollTop += e.deltaY
  }, [])

  return (
    <div
      className="quick-chat-shell titlebar-drag h-screen w-screen bg-transparent p-3"
      onWheel={handleWheel}
    >
      <section
        className="quick-chat-panel titlebar-drag relative flex h-full flex-col overflow-hidden"
        aria-label={t.ai_chat_popup_title}
      >
        <div className="quick-chat-top-edge pointer-events-none absolute inset-x-0 top-0 h-px" />

        {/* === Header / prompt bar ============================================ */}
        <div className="quick-chat-header titlebar-drag flex flex-shrink-0 items-center gap-2 border-b px-3 py-2.5">
          <Button
            size="md"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            aria-label={hasContext ? `New conversation (${primaryModifierShortcut}+N)` : 'Quick AI'}
            type="button"
            onClick={hasContext ? handleNewConversation : undefined}
            disabled={!hasContext}
            title={hasContext ? `New conversation (${primaryModifierShortcut}+N)` : 'Quick AI'}
            className={`titlebar-no-drag flex-shrink-0 ${hasContext ? "" : "cursor-default"}`}
          >
            {hasContext ? (
              <PlusIcon className="h-4 w-4 text-gray-700" />
            ) : (
              <AppLogoIcon size={24} />
            )}
          </Button>

          <div className="titlebar-no-drag relative flex min-w-0 flex-1 items-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isSending}
              className="quick-chat-input-field"
              style={{ maxHeight: QUICK_TEXTAREA_MAX_HEIGHT_PX, overflowY: 'auto' }}
              aria-label={t.ai_chat_popup_title}
            />
            {input && !isSending && (
              <Button
                size="xs"
                shape="icon"
                variant="neutral"
                appearance="ghost"
                type="button"
                onClick={handleClearInput}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                aria-label={t.chat_clear}
                title={t.chat_clear}
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <Button
            size="md"
            shape="icon"
            variant="primary"
            appearance="solid"
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            title={t.chat_send}
            className="titlebar-no-drag flex-shrink-0"
            aria-label={t.chat_send}
          >
            {isSending ? (
              <SpinnerIcon className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* === Body — Q&A list ============================================== */}
        <div
          ref={scrollContainerRef}
          className="quick-chat-body titlebar-drag min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          {!hasKey ? (
            <EmptyContainer>
              <div className="chat-logo-ring flex h-12 w-12 items-center justify-center">
                <AppLogoIcon size={28} />
              </div>
              <p className="max-w-sm text-sm leading-6" style={{ color: 'var(--vzn-text-muted)' }}>{t.chat_error_no_key}</p>
              <Button
                size="sm"
                shape="rect"
                variant="neutral"
                appearance="outline"
                type="button"
                onClick={handleOpenSettings}
                className="titlebar-no-drag"
              >
                {t.chat_error_open_settings}
              </Button>
            </EmptyContainer>
          ) : inputTooLong ? (
            <EmptyContainer>
              <p className="text-sm font-medium text-gray-700">
                {trimmedLength.toLocaleString()} / {MAX_CHAT_INPUT_CHARS.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">{t.ai_chat_popup_input_too_long}</p>
            </EmptyContainer>
          ) : !activeQuestion && !isSending ? (
            <EmptyContainer>
              <div className="chat-logo-ring flex h-14 w-14 items-center justify-center">
                <AppLogoIcon size={36} />
              </div>
              <div className="text-center">
                <p className="ui-kicker">{t.ai_chat_popup_short_label}</p>
                <h2 className="mt-1 text-xl font-bold" style={{ color: 'var(--vzn-text-strong)' }}>
                  {t.ai_chat_popup_title}
                </h2>
              </div>
              <p className="ui-caption max-w-[28rem] text-center leading-6">
                {t.ai_chat_popup_empty_desc}
              </p>

              <div className="ui-meta mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <span className="inline-flex items-center gap-1.5">
                  <KeyCap>↵</KeyCap>
                  <span>{t.chat_send}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <KeyCap>⇧</KeyCap>
                  <KeyCap>↵</KeyCap>
                  <span>{t.ai_chat_popup_new_line}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <KeyCap>{primaryModifierKey}</KeyCap>
                  <KeyCap>↵</KeyCap>
                  <span>{t.ai_chat_popup_open_in_chat}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <KeyCap>Esc</KeyCap>
                  <span>{t.ai_chat_popup_close}</span>
                </span>
              </div>
            </EmptyContainer>
          ) : (
            <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-3">
              {/* Past Q&A — only revealed by scrolling up. */}
              {Array.from({ length: history.length / 2 }).map((_, pairIdx) => {
                const userTurn = history[pairIdx * 2]
                const assistantTurn = history[pairIdx * 2 + 1]
                if (!userTurn || !assistantTurn) return null
                return (
                  <QAEntry
                    // biome-ignore lint/suspicious/noArrayIndexKey: append-only history
                    key={pairIdx}
                    question={userTurn.text}
                    answer={assistantTurn.text}
                    muted
                    isCopied={copiedKey === pairIdx}
                    onCopy={() => handleCopy(assistantTurn.text, pairIdx)}
                    onRegenerate={isSending ? undefined : () => handleRegenerate(pairIdx)}
                    copyLabel={t.chat_copy}
                    copiedLabel={t.chat_copied}
                    regenerateLabel={t.chat_regenerate}
                  />
                )
              })}

              {/* Active Q&A — fills the viewport. */}
              {activeQuestion && (
                <div
                  ref={activeWrapperRef}
                  style={
                    viewportHeight > 0
                      ? { minHeight: Math.max(viewportHeight - 32, 200) }
                      : undefined
                  }
                  className="flex flex-col"
                >
                  <ActiveQACard
                    question={activeQuestion}
                    response={response}
                    smartStep={smartStep}
                    isThinking={showThinking}
                    error={error}
                    isSending={isSending}
                    isCopied={copiedKey === 'active'}
                    smartThinkingLabel={t.chat_smart_thinking_badge}
                    thinkingLabel={t.chat_thinking}
                    copyLabel={t.chat_copy}
                    copiedLabel={t.chat_copied}
                    regenerateLabel={t.chat_regenerate}
                    onCopy={() => handleCopy(response, 'active')}
                    onRegenerate={isSending ? undefined : () => handleRegenerate()}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* === Footer ========================================================= */}
        <div className="quick-chat-footer titlebar-drag flex flex-shrink-0 items-center justify-between gap-3 border-t px-3 py-2 text-sm">
          <Button
            size="xs"
            shape="rect"
            variant="neutral"
            appearance="ghost"
            type="button"
            onClick={handleOpenSettings}
            className="titlebar-no-drag group min-w-0"
            title={hasKey ? 'Change model in Settings' : t.chat_error_open_settings}
          >
            <span
              className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                hasKey
                  ? 'bg-gray-500 shadow-[0_0_0_3px_rgba(75,85,99,0.14)]'
                  : 'bg-gray-400'
              }`}
              aria-hidden
            />
            <ProviderIcon provider={selectedProvider} size={14} />
            <span className="truncate text-xs font-medium tracking-tight text-gray-700">
              / {modelLabel}
            </span>
            <span
              className="hidden items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600 sm:inline-flex"
              title={t.chat_smart_thinking_hint}
            >
              <SparklesIcon className="h-3 w-3" />
              <span>{t.chat_smart_thinking_badge}</span>
            </span>
            {turnCount > 1 && (
              <span className="ui-meta ml-1 hidden sm:inline">
                · {tpl(t.ai_chat_popup_turns, { count: turnCount })}
              </span>
            )}
          </Button>

          <div className="titlebar-no-drag flex flex-shrink-0 items-center gap-1">
            <Button
              size="xs"
              shape="rect"
              variant="neutral"
              appearance="ghost"
              type="button"
              onClick={() => handleCopy(response, 'footer')}
              disabled={!response.trim()}
            >
              {copiedKey === 'footer' ? (
                <CheckIcon className="h-3.5 w-3.5 text-gray-700" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
              <span>{copiedKey === 'footer' ? t.chat_copied : t.chat_copy}</span>
            </Button>

            <span className="quick-chat-divider mx-0.5 h-4 w-px" aria-hidden />

            <Button
              size="xs"
              shape="rect"
              variant="neutral"
              appearance="ghost"
              type="button"
              onClick={handleOpenInChat}
            >
              <span>{t.ai_chat_popup_open_in_chat}</span>
              <ArrowRightIcon className="h-3 w-3" />
              <span className="ml-1 hidden items-center gap-1 sm:inline-flex">
                <KeyCap>{primaryModifierKey}</KeyCap>
                <KeyCap>↵</KeyCap>
              </span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

/** Vertically-centered empty/info container used in multiple states. */
function EmptyContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
      {children}
    </div>
  )
}

/** Per-card action bar (Copy + Regenerate) — used by both QAEntry and ActiveQACard. */
function CardActions({
  isCopied,
  onCopy,
  onRegenerate,
  copyLabel,
  copiedLabel,
  regenerateLabel,
  copyDisabled,
}: {
  isCopied: boolean
  onCopy: () => void
  onRegenerate?: () => void
  copyLabel: string
  copiedLabel: string
  regenerateLabel: string
  copyDisabled?: boolean
}) {
  return (
    <div className="quick-chat-card-actions titlebar-no-drag flex items-center justify-end gap-1 border-t px-3 py-1.5">
      <Button
        size="xs"
        shape="rect"
        variant="neutral"
        appearance="ghost"
        type="button"
        onClick={onCopy}
        disabled={copyDisabled}
        title={copyLabel}
      >
        {isCopied ? (
          <CheckIcon className="h-3 w-3 text-gray-700" />
        ) : (
          <CopyIcon className="h-3 w-3" />
        )}
        <span>{isCopied ? copiedLabel : copyLabel}</span>
      </Button>
      <Button
        size="xs"
        shape="rect"
        variant="neutral"
        appearance="ghost"
        type="button"
        onClick={onRegenerate}
        disabled={!onRegenerate}
        title={regenerateLabel}
      >
        <RefreshIcon className="h-3 w-3" />
        <span>{regenerateLabel}</span>
      </Button>
    </div>
  )
}

/** One finalized Q&A pair from history — Q + A inside a single bordered card. */
function QAEntry({
  question,
  answer,
  muted,
  isCopied,
  onCopy,
  onRegenerate,
  copyLabel,
  copiedLabel,
  regenerateLabel,
}: {
  question: string
  answer: string
  muted?: boolean
  isCopied: boolean
  onCopy: () => void
  onRegenerate?: () => void
  copyLabel: string
  copiedLabel: string
  regenerateLabel: string
}) {
  return (
    <div className={`quick-chat-answer-card titlebar-no-drag overflow-hidden ${muted ? 'opacity-70' : ''}`}>
      <div className="quick-chat-question-row ui-caption flex items-start gap-2 border-b px-5 py-2.5 leading-5">
        <span className="ui-token-badge mt-0.5 h-4">Q</span>
        <p className="min-w-0 flex-1 select-text break-words">{question}</p>
      </div>
      <div className="px-5 py-4">
        <MarkdownText text={answer} className="ui-reader-text leading-7" />
      </div>
      <CardActions
        isCopied={isCopied}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
        regenerateLabel={regenerateLabel}
        copyDisabled={!answer.trim()}
      />
    </div>
  )
}

/** Active Q&A — same one-card layout as QAEntry but with Thinking / streaming state. */
function ActiveQACard({
  question,
  response,
  smartStep,
  isThinking,
  error,
  isSending,
  isCopied,
  smartThinkingLabel,
  thinkingLabel,
  copyLabel,
  copiedLabel,
  regenerateLabel,
  onCopy,
  onRegenerate,
}: {
  question: string
  response: string
  smartStep: SmartStep | null
  isThinking: boolean
  error: string | null
  isSending: boolean
  isCopied: boolean
  smartThinkingLabel: string
  thinkingLabel: string
  copyLabel: string
  copiedLabel: string
  regenerateLabel: string
  onCopy: () => void
  onRegenerate?: () => void
}) {
  // Actions are only useful once we have something to copy or once streaming
  // has finished (so users don't accidentally cancel a live answer).
  const showActions = Boolean(response.trim() || error) && !isSending

  return (
    <div className="quick-chat-answer-card titlebar-no-drag flex h-full flex-col overflow-hidden">
      <div className="quick-chat-question-row ui-caption flex items-start gap-2 border-b px-5 py-2.5 leading-5">
        <span className="ui-token-badge mt-0.5 h-4">
          Q
        </span>
        <p className="min-w-0 flex-1 select-text break-words">{question}</p>
      </div>

      <div className="min-h-0 flex-1 px-5 py-4">
        {error ? (
          <div className="ui-error-box">
            <p className="leading-6">{error}</p>
          </div>
        ) : isThinking ? (
          <div className="space-y-3">
            {/* Phase indicator:
             *   • smart step running → "Smart Thinking…" pill (replaces normal Thinking label)
             *   • otherwise          → plain "Thinking…" label (initial decide phase or
             *                          the gap between step completion and answer streaming)
             */}
            {smartStep?.status === 'running' ? (
              <SmartThinkingStep step={smartStep} badgeLabel={smartThinkingLabel} />
            ) : (
              <ThinkingPill label={thinkingLabel} />
            )}
            <div className="space-y-2.5 pt-1">
              <div className="h-2 w-3/4 animate-pulse rounded-full bg-gray-200/80" />
              <div className="h-2 w-11/12 animate-pulse rounded-full bg-gray-200/80" />
              <div className="h-2 w-2/5 animate-pulse rounded-full bg-gray-200/80" />
            </div>
          </div>
        ) : response ? (
          <MarkdownText text={response} className="ui-reader-text leading-7 text-gray-800" />
        ) : null}
      </div>

      {showActions && (
        <CardActions
          isCopied={isCopied}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
          regenerateLabel={regenerateLabel}
          copyDisabled={!response.trim()}
        />
      )}
    </div>
  )
}

/**
 * Smart Thinking pill — the elevated cousin of ThinkingLabel. Same pill shape
 * so the transition between "Thinking…" and "Smart Thinking…" stays calm.
 * Error states use a red treatment without losing the pill silhouette.
 */
function SmartThinkingStep({
  step,
  badgeLabel,
}: {
  step: SmartStep
  badgeLabel: string
}) {
  const isRunning = step.status === 'running'
  const isError = step.status === 'error'

  // Tooltip carries the underlying detail for users who want it, but the
  // visible UI never shows search queries / sources / reasoning inline.
  const tooltip = isError ? (step.content || step.label || badgeLabel) : badgeLabel

  return (
    <ThinkingPill
      label={badgeLabel}
      title={tooltip}
      shimmer
      running={isRunning}
      tone={isError ? 'error' : 'default'}
    />
  )
}
