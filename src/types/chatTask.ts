export type ChatResponseMode = 'standard' | 'web' | 'research' | 'image'

export interface ChatTaskStarterState {
  selected: number | null
  options: Record<number, string>
  applied: { index: number; option: string; prompt: string; mode: 'standard' | 'research'; placement?: 'instruction' } | null
  open: boolean
}

/** Old drafts never acquire inferred prompt ownership. Invalid metadata is discarded. */
export function normalizeChatTaskState(value: unknown): ChatTaskStarterState | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<ChatTaskStarterState>
  const validIndex = (index: unknown): index is number => Number.isInteger(index) && Number(index) >= 0 && Number(index) <= 3
  const validOption = (index: number, option: unknown): option is string => typeof option === 'string' && (
    index === 0 ? /^[a-z]{2}(?:-[A-Z]{2})?$/.test(option)
      : (index === 1 ? ['research', 'overview'] : index === 2 ? ['simple', 'steps', 'technical'] : ['email', 'article', 'rewrite']).includes(option)
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
    applied: applied && validIndex(applied.index) && validOption(applied.index, applied.option)
      && typeof applied.prompt === 'string' && applied.prompt.length > 0
      && (applied.mode === 'standard' || applied.mode === 'research')
      ? { index: applied.index, option: applied.option, prompt: applied.prompt, mode: applied.mode,
        ...(applied.placement === 'instruction' ? { placement: 'instruction' as const } : {}) } : null,
  }
}
