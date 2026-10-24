import { ShortcutOverview } from '../components/organisms'
import { PageHeader } from '../components/templates'
import { useT } from '../store/useAppStore'
import { HotkeySection } from './settings/HotkeySection'
import '../styles/system-pages.css'

/**
 * Launcher & shortcuts: the Launcher's own shortcut and options, then every
 * shortcut Viezan answers to in one list, with clashes flagged.
 */
export function UtilitiesPage() {
  const t = useT()
  return (
    <div className="app-page relative">
      <div className="app-workspace">
        <div className="glass-panel flex-1 min-h-0 flex flex-col overflow-hidden">
          <PageHeader title={t.nav_utilities} description={t.utilities_subtitle} />
          <div className="system-page-body">
            <div className="system-page-stack">
              <HotkeySection part="launcher" />
              <section className="space-y-3" aria-labelledby="all-shortcuts-title">
                <div>
                  <h2 id="all-shortcuts-title" className="settings-section-title">{t.shortcuts_all_title}</h2>
                  <p className="settings-section-desc mt-1">{t.shortcuts_all_description}</p>
                </div>
                <div className="card px-4 py-1">
                  <ShortcutOverview />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
