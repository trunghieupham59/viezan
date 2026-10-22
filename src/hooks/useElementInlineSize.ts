import { type RefObject, useEffect, useState } from 'react'

/**
 * Observe an element's inline size so a feature can size itself from its own
 * container rather than the window. Returns `null` until the first measurement
 * (and in environments without `ResizeObserver`), which callers treat as the
 * roomy layout.
 */
export function useElementInlineSize<T extends HTMLElement>(ref: RefObject<T | null>): number | null {
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = () => setSize(element.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
