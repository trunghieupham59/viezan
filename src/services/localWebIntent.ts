/**
 * Zero-cost web-search intent detection for local models.
 *
 * Smart Thinking normally asks the chat model itself whether a question needs web
 * evidence. On local hardware that routing call is a full extra model run, so local
 * providers use these rules instead. They are deliberately conservative: only phrases
 * that almost always need fresh external data match. Pure date/time questions
 * ("hôm nay là thứ mấy?") do NOT match — the answer prompt already carries the current time.
 * Anything missed still gets answered; the user can force a search with Web Search mode.
 */

const LATEST_PATTERNS: RegExp[] = [
  // English
  /\b(latest|newest|breaking|up[- ]to[- ]date|right now|as of now)\b/i,
  /\bcurrent(ly)?\s+(price|rate|version|ceo|president|prime minister|champion|leader|status|weather|score)\b/i,
  /\bwho\s+(is|are)\s+(the\s+)?(current|now)\b/i,
  /\b(news|headlines?|weather|forecast|stock price|share price|exchange rate|bitcoin price|crypto price|live score|score of|fixtures?|release date|when (does|is|will) .* (release|come out|launch))\b/i,
  /\b(price|cost) of (gold|oil|bitcoin|btc|eth|ethereum|gas|petrol|the (dollar|euro|yen))\b/i,
  // Vietnamese
  /(mới nhất|vừa (mới )?(ra mắt|công bố|xảy ra|phát hành)|(hiện nay|hiện tại).*(ai|giá|bao nhiêu)|bây giờ.*(giá|bao nhiêu|tỷ giá))/i,
  /(tin tức|thời sự|thời tiết|dự báo thời tiết|nhiệt độ ngoài trời)/i,
  /(giá|tỷ giá|tỉ giá)\s+(vàng|xăng|dầu|bitcoin|btc|eth|cổ phiếu|chứng khoán|usd|đô la|đô|euro|nhà đất|điện|gạo)/i,
  /(kết quả|tỷ số|tỉ số|lịch thi đấu|bảng xếp hạng)\s*(trận|bóng đá|world cup|champions league|ngoại hạng|v-league|xổ số|hôm nay|đêm qua)/i,
  /\bxổ số\b/i,
  /(ai là|ai đang là)\s+(tổng thống|thủ tướng|chủ tịch|tổng bí thư|ceo|giám đốc)\b.*(hiện|bây giờ|nay)/i,
  /(ngày|khi nào)\s+(ra mắt|phát hành|công chiếu)/i,
  // Japanese
  /(最新|ニュース|速報|天気|気温|株価|為替|相場|発売日|公開日|試合結果)/,
]

/** A year at or after the current one signals a question about the present/future. */
function mentionsCurrentOrFutureYear(text: string, now: Date): boolean {
  const currentYear = now.getFullYear()
  for (const match of text.matchAll(/\b(20\d{2})\b/g)) {
    if (Number.parseInt(match[1], 10) >= currentYear) return true
  }
  return false
}

export function needsWebSearchHeuristic(question: string, now: Date = new Date()): boolean {
  const text = question.normalize('NFC').trim()
  if (!text) return false
  if (LATEST_PATTERNS.some((pattern) => pattern.test(text))) return true
  return mentionsCurrentOrFutureYear(text, now)
}
