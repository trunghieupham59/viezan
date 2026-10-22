export interface LauncherApp {
  id: string
  /** Display name in the OS language, e.g. "Ghi chú" for Notes on a Vietnamese macOS. */
  name: string
  /** Other searchable names for the same app, such as the English bundle name beside a localized display name. */
  aliases?: string[]
  iconDataUrl?: string
}

export interface LauncherResult {
  success: boolean
  errorCode?: 'UNAVAILABLE' | 'INVALID' | 'NOT_FOUND' | 'OPEN_FAILED'
}

export interface LauncherIcon {
  id: string
  dataUrl: string
}

/** Main-window features the launcher can open with an optional seed text. */
export type LauncherFeature = 'translate' | 'dictionary' | 'live'

export interface LauncherFeatureRequest {
  feature: LauncherFeature
  text?: string
}

/** ISO 4217 codes; the main process only converts between currencies it has rates for. */
export interface CurrencyConversionRequest {
  amount: number
  from: string
  to: string
}

export interface CurrencyConversion extends CurrencyConversionRequest {
  converted: number
  /** How many `to` units one `from` unit buys. */
  rate: number
  /** When the rate provider last published these rates (ms since epoch). */
  rateUpdatedAt: number
}

export interface LauncherApi {
  /** `recent` lists catalog IDs most recently opened from the launcher, newest first. */
  listApps: () => Promise<LauncherResult & { apps: LauncherApp[]; recent?: string[] }>
  getIcons: (ids: string[]) => Promise<LauncherResult & { icons: LauncherIcon[] }>
  onIcons: (callback: (icons: LauncherIcon[]) => void) => () => void
  openApp: (id: string) => Promise<LauncherResult>
  searchWeb: (query: string) => Promise<LauncherResult>
  /** `UNAVAILABLE` when no rates are cached and none can be fetched (offline). */
  convertCurrency: (request: CurrencyConversionRequest) => Promise<LauncherResult & { conversion?: CurrencyConversion }>
  /** The target currency the user picked in the launcher; `null` follows the UI language. */
  getCurrencyTarget: () => Promise<LauncherResult & { code: string | null }>
  setCurrencyTarget: (code: string | null) => Promise<LauncherResult>
}
