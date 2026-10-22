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
