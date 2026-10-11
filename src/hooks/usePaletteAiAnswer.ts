import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_CHAT_INPUT_CHARS } from '../constants/providers'
import { CHAT_STREAM_CANCELLED_ERROR_CODE, chatService } from '../services/chatService'
import { smartThinkingService } from '../services/smartThinkingService'
import { useT } from '../store/useAppStore'
import type { Provider } from '../types'
import { localizeChatError, localizeChatException } from '../utils/chatErrors'

export type PaletteAnswerStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

/** `quick` answers from model knowledge; `web` forces a web search and cites its sources. */
export type PaletteAnswerMode = 'quick' | 'web'

interface PaletteAnswerState {
  status: PaletteAnswerStatus
  answer: string
  error: string | null
  /** True while the web search step of a `web` answer is running. */
  searching: boolean
}

const IDLE: PaletteAnswerState = { status: 'idle', answer: '', error: null, searching: false }

/** Short, language-matching answers: the palette is a glance surface, not a chat. */
const QUICK_ANSWER_SYSTEM_PROMPT = [
  'You are the quick-answer assistant inside a desktop command palette.',
  "Reply in the same language as the user's question.",
  'Be direct: a few short sentences or a tiny list, no greeting, no preamble.',
  'If you are unsure, or the answer depends on recent events you cannot verify, say so instead of guessing.',
].join(' ')

const QUICK_ANSWER_MAX_OUTPUT_TOKENS = 700

/**
 * One-shot streamed AI answer for the command palette.
 *
 * Only the latest `ask` may write state: starting another question, `cancel`, or
 * unmounting aborts the in-flight request, so a slow earlier request can never
 * overwrite what the user is looking at now.
 */
export function usePaletteAiAnswer() {
  const t = useT()
  const [state, setState] = useState<PaletteAnswerState>(IDLE)
  const controllerRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setState(IDLE)
  }, [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const ask = useCallback(async (
    question: string,
    provider: Provider,
    model: string,
    mode: PaletteAnswerMode = 'quick',
  ) => {
    const text = question.trim()
    if (!text || text.length > MAX_CHAT_INPUT_CHARS) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const isCurrent = () => controllerRef.current === controller && !controller.signal.aborted
    const update = (patch: Partial<PaletteAnswerState>) => {
      if (isCurrent()) setState(previous => ({ ...previous, ...patch }))
    }
    const fail = (error: string, answer: string) => update({ status: 'error', answer, error, searching: false })

    const messages = [{ role: 'user' as const, content: [{ type: 'text' as const, text }] }]
    let streamed = ''
    setState({ ...IDLE, status: 'loading' })

    try {
      if (mode === 'web') {
        let settled = false
        await smartThinkingService.run({
          provider,
          model,
          question: text,
          messages,
          systemPrompt: QUICK_ANSWER_SYSTEM_PROMPT,
          forceWebSearch: true,
          signal: controller.signal,
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
            onStepStart: () => {
              update({ searching: true })
              return 'palette-search'
            },
            onStepComplete: () => update({ searching: false }),
            onStepError: () => update({ searching: false }),
            onAnswerStart: () => {
              streamed = ''
              update({ searching: false })
              return 'palette-answer'
            },
            onAnswerToken: (_id, content) => {
              streamed = content
              update({ status: 'streaming', answer: content, error: null })
            },
            onAnswerComplete: (_id, content) => {
              settled = true
              update({ status: 'done', answer: content, error: null, searching: false })
            },
            onAnswerError: (_id, message, errorCode) => {
              settled = true
              if (errorCode === CHAT_STREAM_CANCELLED_ERROR_CODE) return update(IDLE)
              fail(localizeChatError(t, { error: message, errorCode }, t.chat_error_failed_response), streamed)
            },
          },
        })
        // Aborted before an answer started: nothing to show.
        if (!settled) update(IDLE)
        return
      }

      const result = await chatService.stream(
        {
          provider,
          model,
          messages,
          systemPrompt: QUICK_ANSWER_SYSTEM_PROMPT,
          maxOutputTokens: QUICK_ANSWER_MAX_OUTPUT_TOKENS,
        },
        {
          signal: controller.signal,
          bufferIntervalMs: 60,
          onToken: (token) => {
            streamed += token
            update({ status: 'streaming', answer: streamed, error: null })
          },
        },
      )

      if (result.success && result.reply?.trim()) {
        update({ status: 'done', answer: result.reply, error: null })
      } else if (result.errorCode === CHAT_STREAM_CANCELLED_ERROR_CODE) {
        update(IDLE)
      } else {
        fail(localizeChatError(t, result, t.chat_error_failed_response), streamed)
      }
    } catch (error) {
      fail(localizeChatException(t, error, t.chat_error_unexpected), streamed)
    }
  }, [t])

  return { ...state, ask, cancel }
}
