import { useCallback, useEffect, useRef, useState } from 'react'
import { LIVE_FOLLOW_LATEST_THRESHOLD_PX } from '../../constants/ui'

/**
 * Keeps a live transcript scrolled to its newest content while the reader is
 * at the bottom, and stops following once they scroll up to reread.
 *
 * `scrollRef` goes on the scrolling element and `contentRef` on its single
 * content child; growth of the content (new segments, typewriter reveal) is
 * observed directly, so callers do not have to list what changed.
 * Change `attachKey` when the observed elements are remounted (e.g. a layout
 * switch); following then resets to the newest content.
 */
export function useFollowLatest<S extends HTMLElement = HTMLDivElement, C extends HTMLElement = HTMLDivElement>(
  attachKey?: unknown,
) {
  const scrollRef = useRef<S>(null)
  const contentRef = useRef<C>(null)
  const followingRef = useRef(true)
  const [following, setFollowing] = useState(true)

  const setFollow = useCallback((next: boolean) => {
    if (followingRef.current === next) return
    followingRef.current = next
    setFollowing(next)
  }, [])

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight <= LIVE_FOLLOW_LATEST_THRESHOLD_PX)
  }, [setFollow])

  const jumpToLatest = useCallback(() => {
    setFollow(true)
    scrollToEnd()
  }, [setFollow, scrollToEnd])

  // biome-ignore lint/correctness/useExhaustiveDependencies: attachKey is the intentional re-attach trigger
  useEffect(() => {
    setFollow(true)
    scrollToEnd()
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { if (followingRef.current) scrollToEnd() })
    observer.observe(content)
    return () => observer.disconnect()
  }, [attachKey, setFollow, scrollToEnd])

  return { scrollRef, contentRef, following, onScroll, jumpToLatest }
}
