export type ChatResponseMode = 'standard' | 'web' | 'research' | 'image'

export interface ChatTaskStarterState {
  selected: number | null
  options: Record<number, string>
  /** Legacy Apply metadata, retained only to migrate previously generated draft prefixes. */
  applied: { index: number; option: string; prompt: string; mode: 'standard' | 'research'; placement?: 'instruction' } | null
  open: boolean
  /** Unified task selection replaces the legacy independent response-mode flags. */
  unified?: true
  webSearch?: boolean
}

export function canUseChatWebSearch(task?: ChatTaskStarterState | null): boolean {
  return task?.selected !== 0 && task?.selected !== 4
    && !(task?.selected === 1 && task.options[1] === 'research')
}

export function getChatTaskExecution(task?: ChatTaskStarterState | null) {
  return {
    deepResearchMode: task?.selected === 1 && task.options[1] === 'research',
    imageMode: task?.selected === 4,
    webSearchMode: canUseChatWebSearch(task) && Boolean(task?.webSearch),
  }
}

/** Preserve old mode choices when opening a conversation created before unified tasks. */
export function resolveChatTaskState(task: ChatTaskStarterState | null | undefined, legacy: { imageMode?: boolean; deepResearchMode?: boolean; webSearchMode?: boolean }): ChatTaskStarterState | null {
  if (task?.unified) return task
  if (!task && !legacy.imageMode && !legacy.deepResearchMode && !legacy.webSearchMode) return null
  const selected = legacy.imageMode ? 4 : legacy.deepResearchMode ? 1 : task?.selected ?? null
  const options = { ...task?.options }
  if (selected === 4) options[4] = 'image'
  if (selected === 1) options[1] = legacy.deepResearchMode ? 'research' : 'overview'
  return { selected, options, applied: task?.applied ?? null, open: task?.open ?? false, unified: true, webSearch: Boolean(legacy.webSearchMode) }
}

/** Old drafts never acquire inferred prompt ownership. Invalid metadata is discarded. */
export function normalizeChatTaskState(value: unknown): ChatTaskStarterState | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<ChatTaskStarterState>
  const validIndex = (index: unknown): index is number => Number.isInteger(index) && Number(index) >= 0 && Number(index) <= 4
  const validOption = (index: number, option: unknown): option is string => typeof option === 'string' && (
    index === 0 ? /^[a-z]{2}(?:-[A-Z]{2})?$/.test(option)
      : (index === 1 ? ['research', 'overview'] : index === 2 ? ['simple', 'steps', 'technical'] : index === 4 ? ['image'] : ['email', 'article', 'rewrite']).includes(option)
  )
  if (data.selected !== null && !validIndex(data.selected)) return null
  const options: Record<number, string> = {}
  if (data.options && typeof data.options === 'object') {
    for (const [key, option] of Object.entries(data.options)) {
      if (validIndex(Number(key)) && validOption(Number(key), option)) options[Number(key)] = option
    }
  }
  if (data.selected !== null && !options[data.selected]) return null
  const applied = data.applied
  return {
    selected: data.selected ?? null, options, open: Boolean(data.open),
    ...(data.unified === true ? { unified: true as const, webSearch: Boolean(data.webSearch) } : {}),
    applied: applied && validIndex(applied.index) && validOption(applied.index, applied.option)
      && typeof applied.prompt === 'string' && applied.prompt.length > 0
      && (applied.mode === 'standard' || applied.mode === 'research')
      ? { index: applied.index, option: applied.option, prompt: applied.prompt, mode: applied.mode,
        ...(applied.placement === 'instruction' ? { placement: 'instruction' as const } : {}) } : null,
  }
}
