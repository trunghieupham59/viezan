import type { ReactNode } from 'react'

export interface DictionaryWorkbenchTemplateProps {
  header: ReactNode
  search: ReactNode
  result: ReactNode
  history: ReactNode
  resultLabel: string
}

/** Layout-only dictionary shell that keeps result and history reachable at every width. */
export function DictionaryWorkbenchTemplate({
  header,
  search,
  result,
  history,
  resultLabel,
}: DictionaryWorkbenchTemplateProps) {
  return (
    <div className="app-page">
      <div className="app-workspace">
        <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          {header}
          <div className="dictionary-search-region">{search}</div>
          <div className="dictionary-workbench-content">
            <section className="dictionary-result-region glass-panel" aria-label={resultLabel}>
              {result}
            </section>
            <aside className="dictionary-history-region">{history}</aside>
          </div>
        </div>
      </div>
    </div>
  )
}
