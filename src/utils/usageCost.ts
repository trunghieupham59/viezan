import type { Provider, UsageCost, UsageCurrency, UsageFeature } from '../types'
import { createClientId } from './id'

interface UsageCostEstimateInput {
  feature: UsageFeature
  provider: Provider
  model: string
  inputText: string
  outputText: string
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

interface ModelPrice {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

export interface UsageCurrencyOption {
  code: UsageCurrency
  symbol: string
  label: string
  usdRate: number
  decimals: number
}

const TOKEN_CHARS = 4
const FREE_PRICE: ModelPrice = { inputUsdPerMillion: 0, outputUsdPerMillion: 0 }

const DEFAULT_PROVIDER_PRICE: Record<Provider, ModelPrice> = {
  local: FREE_PRICE,
  openai: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 2 },
  gemini: { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 },
  claude: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
}

const MODEL_PRICE_OVERRIDES: Array<{ provider: Provider; match: RegExp; price: ModelPrice }> = [
  { provider: 'openai', match: /gpt-5\.2/i, price: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 } },
  { provider: 'openai', match: /gpt-4\.1-mini/i, price: { inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 } },
  { provider: 'openai', match: /gpt-5-mini/i, price: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 2 } },
  { provider: 'claude', match: /opus/i, price: { inputUsdPerMillion: 15, outputUsdPerMillion: 75 } },
  { provider: 'claude', match: /sonnet/i, price: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
  { provider: 'gemini', match: /flash-lite/i, price: { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 } },
  { provider: 'gemini', match: /flash/i, price: { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 } },
  { provider: 'gemini', match: /pro/i, price: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 } },
]

export const USAGE_CURRENCY_OPTIONS: UsageCurrencyOption[] = [
  { code: 'USD', symbol: '$', label: 'USD ($)', usdRate: 1, decimals: 4 },
  { code: 'VND', symbol: 'đ', label: 'VNĐ (đ)', usdRate: 25_000, decimals: 0 },
  { code: 'JPY', symbol: '￥', label: 'JPY (￥)', usdRate: 155, decimals: 2 },
  { code: 'EUR', symbol: '€', label: 'EUR (€)', usdRate: 0.92, decimals: 4 },
  { code: 'GBP', symbol: '£', label: 'GBP (£)', usdRate: 0.78, decimals: 4 },
]

export const DEFAULT_USAGE_CURRENCY: UsageCurrency = 'USD'

function estimateTokens(text: string): number {
  const chars = text.trim().length
  if (chars === 0) return 0
  return Math.max(1, Math.ceil(chars / TOKEN_CHARS))
}

function resolveModelPrice(provider: Provider, model: string): ModelPrice {
  if (provider === 'local') return FREE_PRICE
  const override = MODEL_PRICE_OVERRIDES.find((entry) =>
    entry.provider === provider && entry.match.test(model)
  )
  return override?.price ?? DEFAULT_PROVIDER_PRICE[provider]
}

export function estimateUsageCost({
  feature,
  provider,
  model,
  inputText,
  outputText,
  tokenUsage,
}: UsageCostEstimateInput): UsageCost {
  const inputTokens = tokenUsage?.inputTokens ?? estimateTokens(inputText)
  const outputTokens = tokenUsage?.outputTokens ?? estimateTokens(outputText)
  const price = resolveModelPrice(provider, model)
  const amountUsd = provider === 'local'
    ? 0
    : (inputTokens * price.inputUsdPerMillion + outputTokens * price.outputUsdPerMillion) / 1_000_000

  return {
    id: createClientId('cost'),
    feature,
    provider,
    model,
    amountUsd,
    inputTokens,
    outputTokens,
    totalTokens: tokenUsage?.totalTokens ?? inputTokens + outputTokens,
    estimated: true,
    createdAt: Date.now(),
  }
}

export function combineUsageCosts(costs: Array<UsageCost | undefined>, feature: UsageFeature): UsageCost | undefined {
  const validCosts = costs.filter((cost): cost is UsageCost => Boolean(cost))
  if (validCosts.length === 0) return undefined
  const first = validCosts[0]
  const amountUsd = validCosts.reduce((sum, cost) => sum + cost.amountUsd, 0)
  const inputTokens = validCosts.reduce((sum, cost) => sum + cost.inputTokens, 0)
  const outputTokens = validCosts.reduce((sum, cost) => sum + cost.outputTokens, 0)
  return {
    id: createClientId('cost'),
    feature,
    provider: first.provider,
    model: first.model,
    amountUsd,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimated: validCosts.some((cost) => cost.estimated),
    createdAt: Date.now(),
  }
}

export function getUsageCurrencyOption(currency: UsageCurrency): UsageCurrencyOption {
  return USAGE_CURRENCY_OPTIONS.find((option) => option.code === currency) ?? USAGE_CURRENCY_OPTIONS[0]
}

export function formatUsageAmount(amountUsd: number, currency: UsageCurrency): string {
  const option = getUsageCurrencyOption(currency)
  const converted = amountUsd * option.usdRate
  if (option.code === 'VND') return `${Math.round(converted).toLocaleString()}${option.symbol}`

  const decimals = converted > 0 && converted < 0.01 ? 6 : option.decimals
  return `${option.symbol}${converted.toLocaleString(undefined, {
    minimumFractionDigits: converted === 0 ? 2 : 0,
    maximumFractionDigits: decimals,
  })}`
}

/**
 * Format token counts compactly (e.g. 1.2k, 3.4M) for badges where
 * raw 1,234,567 would consume too much space.
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) return tokens.toLocaleString()
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(tokens < 10_000 ? 1 : 0)}k`
  return `${(tokens / 1_000_000).toFixed(tokens < 10_000_000 ? 1 : 0)}M`
}
