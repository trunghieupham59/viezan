import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_CHAT_INPUT_CHARS } from '../constants/providers'
import { CHAT_STREAM_CANCELLED_ERROR_CODE, chatService } from '../services/chatService'
import { useT } from '../store/useAppStore'
import type { Provider } from '../types'
import { localizeChatError, localizeChatException } from '../utils/chatErrors'

export type PaletteAnswerStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

interface PaletteAnswerState {
  status: PaletteAnswerStatus
  answer: string
  error: string | null
}

const IDLE: PaletteAnswerState = { status: 'idle', answer: '', error: null }

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
 * unmounting aborts the in-flight stream, so a slow earlier request can never
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

  const ask = useCallback(async (question: string, provider: Provider, model: string) => {
    const text = question.trim()
    if (!text || text.length > MAX_CHAT_INPUT_CHARS) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const isCurrent = () => controllerRef.current === controller && !controller.signal.aborted

    let streamed = ''
    setState({ status: 'loading', answer: '', error: null })

    try {
      const result = await chatService.stream(
        {
          provider,
          model,
          messages: [{ role: 'user', content: [{ type: 'text', text }] }],
          systemPrompt: QUICK_ANSWER_SYSTEM_PROMPT,
          maxOutputTokens: QUICK_ANSWER_MAX_OUTPUT_TOKENS,
        },
        {
          signal: controller.signal,
          bufferIntervalMs: 60,
          onToken: (token) => {
            if (!isCurrent()) return
            streamed += token
            setState({ status: 'streaming', answer: streamed, error: null })
          },
        },
      )

      if (!isCurrent()) return
      if (result.success && result.reply?.trim()) {
        setState({ status: 'done', answer: result.reply, error: null })
      } else if (result.errorCode === CHAT_STREAM_CANCELLED_ERROR_CODE) {
        setState(IDLE)
      } else {
        setState({
          status: 'error',
          answer: streamed,
          error: localizeChatError(t, result, t.chat_error_failed_response),
        })
      }
    } catch (error) {
      if (!isCurrent()) return
      setState({
        status: 'error',
        answer: streamed,
        error: localizeChatException(t, error, t.chat_error_unexpected),
      })
    }
  }, [t])

  return { ...state, ask, cancel }
}
