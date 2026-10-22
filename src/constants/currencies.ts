/**
 * Currencies the Quick Launcher can parse and convert between.
 *
 * `aliases` are matched after diacritics are stripped and text is lower-cased,
 * so `đô la` is listed as `do la` and `yên` as `yen`. Symbols are kept as typed.
 * Display names come from `Intl.DisplayNames`, never from this table.
 */
export interface LauncherCurrency {
  /** ISO 4217 code, also the value stored as the preferred conversion target. */
  code: string
  aliases: readonly string[]
}

export const LAUNCHER_CURRENCIES: readonly LauncherCurrency[] = [
  { code: 'USD', aliases: ['$', 'us$', 'usd', 'dollar', 'dollars', 'bucks', 'do', 'do la', 'dola', 'do-la', 'ドル', '米ドル'] },
  { code: 'VND', aliases: ['₫', 'd', 'vnd', 'vnđ', 'dong', 'dong viet', 'ドン'] },
  { code: 'JPY', aliases: ['¥', '￥', 'jpy', 'yen', '円', 'えん'] },
  { code: 'EUR', aliases: ['€', 'eur', 'euro', 'euros', 'ユーロ'] },
  { code: 'GBP', aliases: ['£', 'gbp', 'pound', 'pounds', 'bang', 'bang anh', 'ポンド'] },
  { code: 'KRW', aliases: ['₩', 'krw', 'won', 'ウォン'] },
  { code: 'CNY', aliases: ['cny', 'rmb', 'yuan', 'te', 'nhan dan te', '元', '人民元'] },
  { code: 'TWD', aliases: ['nt$', 'twd', 'dai te', '台湾ドル'] },
  { code: 'HKD', aliases: ['hk$', 'hkd', '香港ドル'] },
  { code: 'SGD', aliases: ['s$', 'sgd', 'シンガポールドル'] },
  { code: 'THB', aliases: ['฿', 'thb', 'baht', 'bat', 'バーツ'] },
  { code: 'MYR', aliases: ['rm', 'myr', 'ringgit', 'リンギット'] },
  { code: 'IDR', aliases: ['rp', 'idr', 'rupiah', 'ルピア'] },
  { code: 'PHP', aliases: ['₱', 'php', 'peso', 'pesos', 'ペソ'] },
  { code: 'INR', aliases: ['₹', 'inr', 'rupee', 'rupees', 'ルピー'] },
  { code: 'AUD', aliases: ['a$', 'au$', 'aud', 'do uc', '豪ドル'] },
  { code: 'NZD', aliases: ['nz$', 'nzd'] },
  { code: 'CAD', aliases: ['c$', 'ca$', 'cad', 'do canada', 'カナダドル'] },
  { code: 'CHF', aliases: ['chf', 'franc', 'francs', 'フラン'] },
  { code: 'SEK', aliases: ['sek', 'krona', 'kronor'] },
  { code: 'NOK', aliases: ['nok', 'krone', 'kroner'] },
  { code: 'DKK', aliases: ['dkk'] },
  { code: 'PLN', aliases: ['pln', 'zloty', 'zł'] },
  { code: 'CZK', aliases: ['czk', 'koruna'] },
  { code: 'TRY', aliases: ['₺', 'try', 'lira'] },
  { code: 'RUB', aliases: ['₽', 'rub', 'ruble', 'rubles', 'rup', 'ルーブル'] },
  { code: 'BRL', aliases: ['r$', 'brl', 'real', 'reais'] },
  { code: 'MXN', aliases: ['mx$', 'mxn'] },
  { code: 'ZAR', aliases: ['zar', 'rand'] },
  { code: 'AED', aliases: ['aed', 'dirham'] },
]

export const LAUNCHER_CURRENCY_CODES: readonly string[] = LAUNCHER_CURRENCIES.map(currency => currency.code)

export function isLauncherCurrency(code: unknown): code is string {
  return typeof code === 'string' && LAUNCHER_CURRENCY_CODES.includes(code)
}
