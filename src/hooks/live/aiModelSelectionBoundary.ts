import type { AIModelSelection } from '../../types'

/**
 * Keeps one live session bound to the AI model captured when it starts.
 * Global/default selection changes remain available to the next session but
 * cannot silently change translation, analysis, or persisted metadata for the
 * session already in progress.
 */
export interface LiveAIModelSelectionBoundary {
  begin: (selection: AIModelSelection) => AIModelSelection
  restore: (selection: AIModelSelection) => AIModelSelection
  resolve: (fallback: AIModelSelection) => AIModelSelection
  clear: () => void
}

export function createLiveAIModelSelectionBoundary(): LiveAIModelSelectionBoundary {
  let sessionSelection: AIModelSelection | null = null

  const capture = (selection: AIModelSelection) => {
    sessionSelection = { ...selection }
    return sessionSelection
  }

  return {
    begin: capture,
    restore: capture,
    resolve: (fallback) => sessionSelection ?? fallback,
    clear: () => {
      sessionSelection = null
    },
  }
}
