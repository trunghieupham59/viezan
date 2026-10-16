import { useEffect, useState } from 'react'
import { LIVE_INPUT_LEVEL_POLL_MS } from '../../../constants/ui'
import { formatElapsed } from '../../../utils/live-translate'
import { SpinnerIcon } from '../../ui/icons'

export interface LiveSessionStatusProps {
  /** Epoch ms when the running session started. */
  startedAt: number
  /** What the pipeline is doing right now (listening / transcribing / translating). */
  label: string
  busy: boolean
  /** Reads the current input level in [0, 1]; null hides the meter. */
  getInputLevel: () => number | null
  inputLevelLabel: string
  elapsedLabel: string
}

/**
 * Running-session status: pipeline state, input level and elapsed time.
 *
 * It polls on its own so the frequent level updates re-render only this
 * component, never the whole interpreter page.
 */
export function LiveSessionStatus({
  startedAt,
  label,
  busy,
  getInputLevel,
  inputLevelLabel,
  elapsedLabel,
}: LiveSessionStatusProps) {
  const [level, setLevel] = useState<number | null>(() => getInputLevel())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setLevel(getInputLevel())
      setNow(Date.now())
    }, LIVE_INPUT_LEVEL_POLL_MS)
    return () => clearInterval(timer)
  }, [getInputLevel])

  return (
    <span className="live-session-status">
      {busy
        ? <SpinnerIcon className="live-session-status-icon animate-spin" />
        : <span className="live-session-status-dot" aria-hidden="true" />}
      <span className="live-session-status-label">{label}</span>
      {level !== null && (
        <meter className="live-input-meter" aria-label={inputLevelLabel} min={0} max={1} value={level} />
      )}
      <span className="live-session-elapsed">
        <span className="sr-only">{elapsedLabel}: </span>
        <time>{formatElapsed(now - startedAt)}</time>
      </span>
    </span>
  )
}
