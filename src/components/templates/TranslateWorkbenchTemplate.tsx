import type { ReactNode, Ref } from 'react'

export interface TranslateWorkbenchTemplateProps {
  titleId: string
  layout?: 'single' | 'comparison'
  header: ReactNode
  sourcePanel: ReactNode
  resultPanel: ReactNode
  /** Saved translations beside the workbench; omitted when the panel is hidden. */
  history?: ReactNode
  /** The page measures this root to decide between the side panel and an overlay. */
  containerRef?: Ref<HTMLDivElement>
}

/**
 * Layout-only shell for the AI Translation workspace.
 *
 * The page owns data and behavior; this template only establishes the shared
 * workbench geometry so source and result remain one coherent task surface.
 * Language selection lives in the header's command row, not in the workbench.
 */
export function TranslateWorkbenchTemplate({
  titleId,
  layout = 'single',
  header,
  sourcePanel,
  resultPanel,
  history,
  containerRef,
}: TranslateWorkbenchTemplateProps) {
  return (
    <div ref={containerRef} className="app-page translate-page">
      <div className="translate-workspace">
        {header}
        <div className="translate-stage" data-history={history ? 'open' : 'closed'}>
          <section
            className={`translate-workbench translate-workbench-${layout}`}
            aria-labelledby={titleId}
            data-layout={layout}
          >
            {sourcePanel}
            {resultPanel}
          </section>
          {history && <aside className="translate-history-region">{history}</aside>}
        </div>
      </div>
    </div>
  )
}
