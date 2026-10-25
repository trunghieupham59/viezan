import { Button } from '@/components/ui/atoms'
/**
 * ProviderCostStats — compact stats strip rendered under the provider title
 * inside ApiKeyInput's CredentialCard `meta` slot.
 *
 * Shows the most useful at-a-glance numbers without dominating the row:
 *   - estimated cost  (headline pill)
 *   - request count   (subtle pill)
 *   - total tokens    (subtle pill)
 *   - last activity   (subtle pill)
 *
 * Each pill is intentionally small so the credential card preserves its
 * familiar single-line shape on wide screens.
 */
import type { Translations } from '../../i18n/types'
import type { UsageCurrency, UsageTotal } from '../../types'
import { tpl } from '../../utils/tpl'
import { formatTokenCount, formatUsageAmount } from '../../utils/usageCost'
import { ChartBarIcon, PulseIcon } from '../ui/icons'
import { ClockIcon } from '../ui/icons/navigation'
import '../../styles/cost.css'

interface ProviderCostStatsProps {
  total?: UsageTotal
  currency: UsageCurrency
  costLabel: string
  t: Translations
  onReset: () => void
  resetTitle: string
  emptyHint?: string
}

function formatRelative(timestamp: number, t: Translations): string {
  if (!timestamp) return ''
  const diffMs = Date.now() - timestamp
  if (diffMs < 60_000) return t.settings_cost_last_used_just_now
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return tpl(t.settings_cost_last_used_minutes, { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tpl(t.settings_cost_last_used_hours, { n: hours })
  const days = Math.floor(hours / 24)
  return tpl(t.settings_cost_last_used_days, { n: days })
}

export function ProviderCostStats({
  total,
  currency,
  costLabel,
  t,
  onReset,
  resetTitle,
  emptyHint,
}: ProviderCostStatsProps) {
  if (!total || total.requestCount === 0) {
    return emptyHint ? (
      <span className="ui-meta cost-empty-hint italic">{emptyHint}</span>
    ) : null
  }

  const lastUsedLabel = formatRelative(total.updatedAt, t)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="ui-badge cost-stat gap-1.5 text-xs"
        title={`${costLabel} ~${formatUsageAmount(total.amountUsd, currency)}`}
      >
        <span className="opacity-80">{costLabel}</span>
        <span className="tabular-nums">~{formatUsageAmount(total.amountUsd, currency)}</span>
      </span>

      <Pill
        icon={<PulseIcon className="h-3 w-3" />}
        title={t.settings_cost_overview_requests}
        value={total.requestCount.toLocaleString()}
      />

      <Pill
        icon={<ChartBarIcon className="h-3 w-3" />}
        title={`${total.inputTokens.toLocaleString()} in · ${total.outputTokens.toLocaleString()} out`}
        value={formatTokenCount(total.totalTokens)}
      />

      {lastUsedLabel ? (
        <Pill
          icon={<ClockIcon className="h-3 w-3" />}
          title={t.settings_cost_last_used}
          value={lastUsedLabel}
        />
      ) : null}

      <Button
        size="sm"
        shape="rect"
        variant="danger"
        appearance="soft"
        type="button"
        onClick={onReset}
        title={resetTitle}
        className="ml-auto"
      >
        {t.settings_cost_reset_provider}
      </Button>
    </div>
  )
}

function Pill({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode
  title: string
  value: string
}) {
  return (
    <span
      className="ui-badge cost-pill gap-1 text-xs font-medium"
      title={title}
    >
      <span className="cost-pill__icon">{icon}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  )
}
