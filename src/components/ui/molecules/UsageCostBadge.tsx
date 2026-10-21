/**
 * UsageCostBadge — compact metadata that surfaces the estimated provider cost
 * of a single message/translation/lookup.
 *
 * Variants:
 *   - size: 'sm' (history rows, inline) | 'md' (chat bubble, dictionary)
 *   - tone: 'neutral' (subdued)
 *
 * Hovering reveals a native title with the input/output token breakdown,
 * so power users can audit how the number was estimated.
 */
import type { UsageCost, UsageCurrency } from '../../../types'
import { formatTokenCount, formatUsageAmount } from '../../../utils/usageCost'

type BadgeSize = 'sm' | 'md'
type BadgeTone = 'neutral'

export interface UsageCostBadgeProps {
  cost?: Pick<UsageCost, 'amountUsd' | 'estimated' | 'inputTokens' | 'outputTokens' | 'totalTokens'>
  currency: UsageCurrency
  label?: string
  size?: BadgeSize
  tone?: BadgeTone
  className?: string
}

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'usage-cost-badge--sm',
  md: 'usage-cost-badge--md',
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'usage-cost-badge--neutral',
}

export function UsageCostBadge({
  cost,
  currency,
  label,
  size = 'sm',
  tone = 'neutral',
  className,
}: UsageCostBadgeProps) {
  if (!cost) return null

  const tooltipParts: string[] = []
  if (label) tooltipParts.push(label)
  tooltipParts.push(`${cost.estimated ? '~' : ''}${formatUsageAmount(cost.amountUsd, currency)}`)
  if (cost.inputTokens != null || cost.outputTokens != null) {
    const inT = cost.inputTokens ?? 0
    const outT = cost.outputTokens ?? 0
    tooltipParts.push(`${inT.toLocaleString()} in · ${outT.toLocaleString()} out`)
  }

  return (
    <span
      className={[
        'usage-cost-badge',
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className ?? '',
      ].join(' ')}
      title={tooltipParts.join('; ')}
    >
      {label ? <span className="usage-cost-badge-label">{label}</span> : null}
      <span className="usage-cost-badge-amount">
        {cost.estimated ? '~' : ''}{formatUsageAmount(cost.amountUsd, currency)}
      </span>
      {cost.totalTokens ? (
        <>
          <span className="usage-cost-badge-divider" aria-hidden="true" />
          <span className="usage-cost-badge-tokens">{formatTokenCount(cost.totalTokens)}</span>
        </>
      ) : null}
    </span>
  )
}
