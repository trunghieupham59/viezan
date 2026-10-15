import { useCallback } from 'react'
import type { LiveSession, WindowApi } from '../../types'

export type LiveAiHistoryField = 'summary' | 'speakerAnalysis' | 'actionItems' | 'decisions'
export type LiveAiChatRequest = Parameters<WindowApi['chat']>[0]

export interface LiveAiActionConfig {
  setLoading: (loading: boolean) => void
  setOutput: (value: string | null) => void
  historyField: LiveAiHistoryField
  logLabel: string
  fallbackError: string
  request: LiveAiChatRequest
}

export function useLiveAiActions(
  updateLiveSession: (id: string, updates: Partial<LiveSession>) => void,
  getSessionId: () => string | null,
) {
  return useCallback(async ({
    setLoading,
    setOutput,
    historyField,
    logLabel,
    fallbackError,
    request,
  }: LiveAiActionConfig) => {
    // Capture the session the action was started for: the user may start a new
    // session while the request is in flight, and its result must not leak there.
    const originSessionId = getSessionId()
    const isOriginSessionActive = () => getSessionId() === originSessionId

    setLoading(true)
    setOutput(null)

    try {
      const result = await window.api.chat(request)

      if (result.success && result.reply) {
        // Always persist to the originating session; only show it while that session is active.
        if (originSessionId) {
          updateLiveSession(originSessionId, { [historyField]: result.reply } as Partial<LiveSession>)
        }
        if (isOriginSessionActive()) setOutput(result.reply)
      } else {
        // Failures are display-only (never written to session history).
        const errMsg = result.error ?? fallbackError
        console.error(`[${logLabel}] Backend error:`, errMsg)
        if (isOriginSessionActive()) setOutput(`Error: ${errMsg}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[${logLabel}] Exception:`, msg)
      if (isOriginSessionActive()) setOutput(`Error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [getSessionId, updateLiveSession])
}

