import type { HTMLAttributes } from 'react'

export type SkeletonBlockShape = 'title' | 'control' | 'line' | 'panel'

export interface SkeletonBlockProps extends HTMLAttributes<HTMLSpanElement> {
  shape?: SkeletonBlockShape
}

/** Decorative loading primitive. Accessible status copy belongs to its parent molecule. */
export function SkeletonBlock({
  shape = 'line',
  className = '',
  ...props
}: SkeletonBlockProps) {
  return (
    <span
      aria-hidden="true"
      className={`ui-skeleton ui-skeleton-${shape}${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}
