import type { ReactNode } from 'react'

export interface DictionaryWorkbenchTemplateProps {
  header: ReactNode
  notice?: ReactNode
  search: ReactNode
  result: ReactNode
  history: ReactNode
  resultLabel: string
  lookupLabel: string
}

/**
 * Layout-only dictionary shell: the page header, then a lookup column (search
 * above Recent / Favorites) beside the result, which reads like a page.
 * Narrow workbenches stack the lookup above the result.
 */
export function DictionaryWorkbenchTemplate({
  header,
  notice,
  search,
  result,
  history,
  resultLabel,
  lookupLabel,
}: DictionaryWorkbenchTemplateProps) {
  return (
    <div className="app-page">
      <div className="app-workspace">
        <div className="dictionary-workbench">
          {header}
          {notice && <div className="workbench-session-notice">{notice}</div>}
          <div className="dictionary-workbench-content">
            <aside className="dictionary-lookup-region" aria-label={lookupLabel}>
              <div className="dictionary-search-region">{search}</div>
              <div className="dictionary-history-region">{history}</div>
            </aside>
            <section className="dictionary-result-region" aria-label={resultLabel}>
              {result}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
