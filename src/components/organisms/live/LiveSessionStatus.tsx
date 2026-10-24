import { useEffect, useState } from 'react'
import { LIVE_INPUT_LEVEL_POLL_MS } from '../../../constants/ui'
import { formatElapsed } from '../../../utils/live-translate'
import { Meter } from '../../ui/atoms'
import { SpinnerIcon } from '../../ui/icons'
import { StatusChip } from '../../ui/molecules'

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
 * Running-session status for the page header: a recording chip with the
 * pipeline state and elapsed time, then the input level.
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
      <StatusChip tone="danger" icon={busy ? <SpinnerIcon className="animate-spin" /> : undefined}>
        <span className="live-session-status-label">{label}</span>
        <span className="live-session-elapsed">
          <span className="sr-only">{elapsedLabel}: </span>
          <time>{formatElapsed(now - startedAt)}</time>
        </span>
      </StatusChip>
      {level !== null && (
        <Meter className="live-input-meter" label={inputLevelLabel} min={0} max={1} value={level} emphasis="action" />
      )}
    </span>
  )
}
