import { SkeletonBlock } from '../atoms'

export type FeatureLoadingLayout = 'split' | 'list'

export interface FeatureLoadingStateProps {
  label: string
  layout?: FeatureLoadingLayout
}

/** Stable page-shaped fallback for lazy feature routes. */
export function FeatureLoadingState({
  label,
  layout = 'split',
}: FeatureLoadingStateProps) {
  return (
    <div className="app-page feature-loading-state" role="status" aria-label={label}>
      <header className="feature-loading-header">
        <div className="feature-loading-heading">
          <SkeletonBlock shape="title" />
          <SkeletonBlock shape="line" />
        </div>
        <SkeletonBlock shape="control" />
      </header>

      <div className={layout === 'split' ? 'app-panel-grid' : 'feature-loading-list'}>
        <section className="glass-panel feature-loading-panel" aria-hidden="true">
          <SkeletonBlock shape="control" />
          <SkeletonBlock shape="line" />
          <SkeletonBlock shape="line" />
          <SkeletonBlock shape="panel" />
        </section>
        {layout === 'split' && (
          <section className="glass-panel feature-loading-panel" aria-hidden="true">
            <SkeletonBlock shape="control" />
            <SkeletonBlock shape="line" />
            <SkeletonBlock shape="line" />
            <SkeletonBlock shape="panel" />
          </section>
        )}
      </div>
    </div>
  )
}
