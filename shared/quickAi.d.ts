/** One message of a Quick AI conversation, newest last. */
export interface QuickAiTurn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * The single Quick AI conversation kept across popup hides and app restarts.
 * `turns` always holds complete user/assistant pairs; `updatedAt` decides
 * whether the launcher offers to continue it or starts fresh.
 */
export interface QuickAiSession {
  id: string
  turns: QuickAiTurn[]
  updatedAt: number
}
