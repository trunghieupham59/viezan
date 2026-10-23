export interface SparklineProps {
  /** Oldest first. Fewer than two points renders an empty, same-sized box. */
  values: readonly number[]
  /** Accessible description of what the line shows. */
  label: string
  className?: string
}

const WIDTH = 100
const HEIGHT = 28

/** Tiny line of recent values; colour comes from `currentColor`, size from CSS. */
export function Sparkline({ values, label, className = '' }: SparklineProps) {
  let points = ''
  if (values.length >= 2) {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    points = values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * WIDTH
        const y = HEIGHT - 2 - ((value - min) / span) * (HEIGHT - 4)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }
  return (
    <svg
      className={`sparkline${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {points && <polyline points={points} fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}
