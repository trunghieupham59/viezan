import { tpl } from './tpl'

type TimeAgoLabels = { time_just_now: string; time_m_ago: string; time_h_ago: string; time_d_ago: string }

/** Localized "x minutes ago" style label; falls back to the date after a week. */
export function formatTimeAgo(ts: number, t: TimeAgoLabels, now = Date.now()): string {
  const diffMs = now - ts
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return t.time_just_now
  if (diffMin < 60) return tpl(t.time_m_ago, { n: diffMin })
  if (diffHour < 24) return tpl(t.time_h_ago, { n: diffHour })
  if (diffDay < 7) return tpl(t.time_d_ago, { n: diffDay })
  return new Date(ts).toLocaleDateString()
}

/**
 * Format a timestamp as a compact relative time ("5m", "2h", "3d"). Stays
 * locale-neutral by using single-character suffixes, so dense history rows
 * read the same in every UI language.
 */
export function formatRelativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 30) return '·'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  const wk = Math.floor(day / 7)
  if (wk < 4) return `${wk}w`
  const mo = Math.floor(day / 30)
  return `${mo}mo`
}
