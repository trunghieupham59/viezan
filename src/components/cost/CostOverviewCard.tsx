/**
 * CostOverviewCard — header dashboard for the Cost Tracking section.
 *
 * Layout (top → bottom):
 *   1. Header row     — title + currency picker + reset-all button
 *   2. Hero stat       — total estimated spend (large, headline number)
 *   3. KPI grid        — requests / tokens / avg-per-request
 *   4. By-feature bars — chat / translate / live / dictionary share
 *
 * When there's no data yet, the card collapses to a friendly empty state
 * so the section never feels broken on a fresh install.
 */

import { useT } from '../../store/useAppStore'
import type { Provider, UsageCurrency, UsageFeature, UsageTotal } from '../../types'
import { formatTokenCount, formatUsageAmount } from '../../utils/usageCost'
import { Button } from '../ui/atoms'
import { CurrencyPicker } from '../ui/CurrencyPicker'
import { CalculatorIcon, ChartBarIcon, CoinsIcon, PulseIcon } from '../ui/icons'
import '../../styles/cost.css'

interface CostOverviewCardProps {
  totals: Partial<Record<Provider, UsageTotal>>
  currency: UsageCurrency
  onCurrencyChange: (next: UsageCurrency) => void
  onResetAll: () => void
}

interface FeatureSummary {
  feature: UsageFeature
  amountUsd: number
  requestCount: number
  totalTokens: number
}

const FEATURE_ORDER: UsageFeature[] = ['chat', 'translate', 'live', 'dictionary']

const FEATURE_TONE_CLASS: Record<UsageFeature, string> = {
  chat: 'cost-feature--chat',
  translate: 'cost-feature--translate',
  live: 'cost-feature--live',
  dictionary: 'cost-feature--dictionary',
}

function aggregateTotals(totals: Partial<Record<Provider, UsageTotal>>) {
  let amountUsd = 0
  let requestCount = 0
  let totalTokens = 0
  const byFeature: Record<UsageFeature, FeatureSummary> = {
    chat: { feature: 'chat', amountUsd: 0, requestCount: 0, totalTokens: 0 },
    translate: { feature: 'translate', amountUsd: 0, requestCount: 0, totalTokens: 0 },
    live: { feature: 'live', amountUsd: 0, requestCount: 0, totalTokens: 0 },
    dictionary: { feature: 'dictionary', amountUsd: 0, requestCount: 0, totalTokens: 0 },
  }

  for (const total of Object.values(totals)) {
    if (!total) continue
    amountUsd += total.amountUsd
    requestCount += total.requestCount
    totalTokens += total.totalTokens
    if (total.byFeature) {
      for (const featureKey of FEATURE_ORDER) {
        const featureData = total.byFeature[featureKey]
        if (!featureData) continue
        byFeature[featureKey].amountUsd += featureData.amountUsd
        byFeature[featureKey].requestCount += featureData.requestCount
        byFeature[featureKey].totalTokens += featureData.totalTokens
      }
    }
  }

  return { amountUsd, requestCount, totalTokens, byFeature }
}

export function CostOverviewCard({ totals, currency, onCurrencyChange, onResetAll }: CostOverviewCardProps) {
  const t = useT()
  const summary = aggregateTotals(totals)
  const hasData = summary.requestCount > 0
  const avgUsd = summary.requestCount > 0 ? summary.amountUsd / summary.requestCount : 0

  const featureLabels: Record<UsageFeature, string> = {
    chat: t.settings_cost_feature_chat,
    translate: t.settings_cost_feature_translate,
    live: t.settings_cost_feature_live,
    dictionary: t.settings_cost_feature_dictionary,
  }

  const handleResetAll = () => {
    if (window.confirm(t.settings_cost_reset_all_confirm)) onResetAll()
  }

  return (
    <div className="cost-card overflow-hidden rounded-2xl">
      {/* Header row */}
      <div className="cost-card__header flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 basis-1/2 grow items-center gap-2.5">
          <span className="cost-card__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
            <CoinsIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <h3 className="cost-card__title text-sm font-semibold">
              {t.settings_cost_section_title}
            </h3>
            <p className="ui-meta">
              {t.settings_cost_overview_estimated} · {t.settings_cost_section_desc.split('.')[0]}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <CurrencyPicker
            value={currency}
            onChange={onCurrencyChange}
            ariaLabel={t.settings_cost_currency}
          />
          {hasData ? (
            <Button
              size="md"
              variant="danger"
              appearance="outline"
              className="whitespace-nowrap"
              onClick={handleResetAll}
            >
              {t.settings_cost_reset_all}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {hasData ? (
          <div className="space-y-4">
            {/* Hero stat */}
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="ui-kicker cost-card__kicker">
                  {t.settings_cost_overview_total}
                </p>
                <p className="cost-card__total mt-0.5 flex items-baseline gap-1.5 font-bold tabular-nums">
                  <span className="text-3xl">~{formatUsageAmount(summary.amountUsd, currency)}</span>
                </p>
                <p className="ui-meta mt-0.5">
                  {t.settings_cost_overview_total_desc}
                </p>
              </div>
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-3 gap-2">
              <KpiTile
                icon={<PulseIcon className="h-3.5 w-3.5" />}
                label={t.settings_cost_overview_requests}
                value={summary.requestCount.toLocaleString()}
              />
              <KpiTile
                icon={<ChartBarIcon className="h-3.5 w-3.5" />}
                label={t.settings_cost_overview_tokens}
                value={formatTokenCount(summary.totalTokens)}
              />
              <KpiTile
                icon={<CalculatorIcon className="h-3.5 w-3.5" />}
                label={t.settings_cost_overview_avg}
                value={`~${formatUsageAmount(avgUsd, currency)}`}
              />
            </div>

            {/* Feature breakdown */}
            <FeatureBreakdown
              summary={summary}
              currency={currency}
              labels={featureLabels}
              heading={t.settings_cost_breakdown_by_feature}
            />
          </div>
        ) : (
          <EmptyState
            heading={t.settings_cost_overview_no_data}
            body={t.settings_cost_overview_no_data_desc}
          />
        )}
      </div>
    </div>
  )
}

function KpiTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="cost-kpi rounded-xl px-3 py-2">
      <div className="ui-kicker flex items-center gap-1.5">
        <span className="cost-kpi__icon">{icon}</span>
        <span>{label}</span>
      </div>
      <p className="cost-kpi__value mt-0.5 text-base font-bold tabular-nums">
        {value}
      </p>
    </div>
  )
}

function FeatureBreakdown({
  summary,
  currency,
  labels,
  heading,
}: {
  summary: ReturnType<typeof aggregateTotals>
  currency: UsageCurrency
  labels: Record<UsageFeature, string>
  heading: string
}) {
  const features = FEATURE_ORDER
    .map((feature) => summary.byFeature[feature])
    .filter((entry) => entry.requestCount > 0)
  if (features.length === 0) return null

  const max = Math.max(...features.map((entry) => entry.amountUsd), 0.0000001)

  return (
    <section className="space-y-1.5">
      <h4 className="ui-kicker">
        {heading}
      </h4>
      <ul className="space-y-1.5">
        {features.map((entry) => {
          const percent = Math.max(2, Math.round((entry.amountUsd / max) * 100))
          return (
            <li key={entry.feature} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="cost-feature__label flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${FEATURE_TONE_CLASS[entry.feature]}`}
                    aria-hidden="true" />
                  <span className="font-medium">{labels[entry.feature]}</span>
                </div>
                <div className="cost-feature__value flex items-center gap-2 tabular-nums">
                  <span>~{formatUsageAmount(entry.amountUsd, currency)}</span>
                  <span className="ui-micro">·</span>
                  <span className="ui-micro">{entry.requestCount}</span>
                </div>
              </div>
              <div className="cost-feature__track h-1.5 overflow-hidden rounded-full">
                <div
                  className={`cost-feature__bar h-full rounded-full ${FEATURE_TONE_CLASS[entry.feature]}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="cost-empty flex items-start gap-3 rounded-xl px-4 py-4">
      <span className="cost-empty__icon mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
        <CoinsIcon className="h-4 w-4" />
      </span>
      <div className="space-y-0.5">
        <p className="cost-empty__heading text-sm font-medium">{heading}</p>
        <p className="cost-empty__body text-xs">{body}</p>
      </div>
    </div>
  )
}
