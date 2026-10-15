import { type RefObject, useLayoutEffect } from 'react'

/** Size visible content before paint; blank lines remain a compact draft. */
export function useChatTextareaSize(
  ref: RefObject<HTMLTextAreaElement>,
  text: string,
  sessionId: string | null,
  emptyConversation: boolean,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: session/layout changes may mount a new textarea with the same draft.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const resize = () => {
      const upper = el.closest('.chat-page, .chat-empty-state')?.querySelector('.chat-empty-scroll, .chat-messages-scroll')
      const scrollTop = upper?.scrollTop
      el.style.height = '0px'
      if (text.trim()) {
        const maximum = Number.parseFloat(getComputedStyle(el).maxHeight)
        el.style.height = `${Math.min(el.scrollHeight, Number.isFinite(maximum) ? maximum : el.scrollHeight)}px`
      }
      if (upper && scrollTop !== undefined && upper.scrollTop !== scrollTop) upper.scrollTop = scrollTop
    }
    resize()
    const parent = el.parentElement
    if (!parent || typeof ResizeObserver === 'undefined') return
    let width = parent.getBoundingClientRect().width
    let frame: number | undefined
    const observer = new ResizeObserver(() => {
      const nextWidth = parent.getBoundingClientRect().width
      if (nextWidth === width) return
      width = nextWidth
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(resize)
    })
    observer.observe(parent)
    return () => {
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [ref, text, sessionId, emptyConversation])
}
