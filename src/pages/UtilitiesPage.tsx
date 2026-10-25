import { ShortcutOverview } from '../components/organisms'
import { PageHeader } from '../components/templates'
import { SettingsCard } from '../components/ui/molecules'
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
          <PageHeader title={t.utilities_title} description={t.utilities_subtitle} />
          <div className="system-page-body">
            <div className="system-page-stack" data-layout="columns">
              <HotkeySection part="launcher" />
              <SettingsCard headingLevel={2} title={t.shortcuts_all_title} description={t.shortcuts_all_description}>
                <div className="utilities-shortcuts">
                  <ShortcutOverview />
                </div>
              </SettingsCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
