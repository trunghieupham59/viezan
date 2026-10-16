import { SparklesIcon } from '../icons'

/**
 * Strip any trailing ellipsis/dot punctuation a locale baked into its loading
 * copy ("Thinking…", "考え中…"). The pill animates its own dots, so keeping the
 * punctuation would double up next to them.
 */
export function stripTrailingEllipsis(label: string): string {
  return label.replace(/[…．.\s]+$/u, '')
}

export interface ThinkingDotsProps {
  /** `accent` is the pill's single colour cue; `muted` stays neutral on quiet surfaces. */
  tone?: 'accent' | 'muted'
}

/**
 * Three little bouncing dots — purely CSS-driven via `.thinking-dot`. Each dot
 * is staggered by 160 ms so they ripple, and the fixed-size inline-flex box
 * keeps the surrounding label from reflowing as they animate.
 */
export function ThinkingDots({ tone = 'accent' }: ThinkingDotsProps) {
  return (
    <span className="thinking-dots" aria-hidden="true">
      <span className={`thinking-dot thinking-dot-${tone}`} style={{ animationDelay: '0ms' }} />
      <span className={`thinking-dot thinking-dot-${tone}`} style={{ animationDelay: '160ms' }} />
      <span className={`thinking-dot thinking-dot-${tone}`} style={{ animationDelay: '320ms' }} />
    </span>
  )
}

export interface ThinkingPillProps {
  label: string
  /** Tooltip carrying detail the visible label omits. */
  title?: string
  /** Soft sweep used for web-grounded (Smart Thinking) work. */
  shimmer?: boolean
  /** Animated while true; a settled pill drops the dots, glow and sheen. */
  running?: boolean
  tone?: 'default' | 'error'
}

/**
 * Status pill for "Thinking…" and Smart Thinking: neutral sparkle, label, and
 * accent bouncing dots. The error tone keeps the pill silhouette in red.
 */
export function ThinkingPill({
  label,
  title,
  shimmer = false,
  running = true,
  tone = 'default',
}: ThinkingPillProps) {
  const isError = tone === 'error'
  const className = [
    'thinking-state-pill',
    'max-w-full',
    shimmer && !isError ? 'thinking-state-pill-shimmer' : '',
    isError ? 'thinking-state-pill-error' : '',
  ].filter(Boolean).join(' ')

  return (
    <span
      className={className}
      title={title ?? label}
      role="status"
      aria-live={isError ? undefined : 'polite'}
    >
      {shimmer && running && !isError && (
        <span className="thinking-shimmer thinking-shimmer-sheen pointer-events-none absolute inset-0" aria-hidden />
      )}
      <span className="relative inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
        {running && !isError && (
          <span className="thinking-glow thinking-glow-halo absolute inset-0 rounded-full" aria-hidden />
        )}
        <SparklesIcon className="relative h-3.5 w-3.5" />
      </span>
      <span className="relative min-w-0 truncate">{stripTrailingEllipsis(label)}</span>
      {running && !isError && (
        <span className="relative flex-shrink-0">
          <ThinkingDots />
        </span>
      )}
    </span>
  )
}
