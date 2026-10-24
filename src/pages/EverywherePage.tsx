import { PageHeader } from '../components/templates'
import { useT } from '../store/useAppStore'
import { BrowserIntegrationSection } from './settings/BrowserIntegrationSection'
import { HotkeySection } from './settings/HotkeySection'
import '../styles/system-pages.css'

/**
 * Translate everywhere: the ways Viezan translates outside its own window —
 * Quick Translate on a selection in any app, and the Chrome extension with its
 * local server tokens.
 */
export function EverywherePage() {
  const t = useT()
  return (
    <div className="app-page relative">
      <div className="app-workspace">
        <div className="glass-panel flex-1 min-h-0 flex flex-col overflow-hidden">
          <PageHeader title={t.nav_everywhere} description={t.everywhere_subtitle} />
          <div className="system-page-body">
            <div className="system-page-stack">
              <HotkeySection part="quickTranslate" />
              <BrowserIntegrationSection />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
