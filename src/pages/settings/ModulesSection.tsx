import { useId, useState } from 'react'
import { ToggleSwitch } from '../../components/ui/atoms'
import { APP_MODULES } from '../../modules/catalog'
import { isLastEnabledPageModule } from '../../modules/enabled'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { ModuleId } from '../../types'

/** Toast owner key so repeated failures replace each other instead of stacking. */
const MODULES_ERROR_KEY = 'settings-modules'

interface ModuleToggleRowProps {
  id: ModuleId
  label: string
  description: string
  checked: boolean
  disabled: boolean
  /** Shown under the description when the toggle is locked (the last workspace module). */
  hint?: string
  onChange: (enabled: boolean) => void
}

function ModuleToggleRow({ id, label, description, checked, disabled, hint, onChange }: ModuleToggleRowProps) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5" data-module-id={id}>
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
        <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        {hint && <p className="ui-meta mt-1">{hint}</p>}
      </div>
      <ToggleSwitch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
      />
    </div>
  )
}

/**
 * Settings › Modules: one switch per feature module. Main applies the change
 * (stops shortcuts, servers, windows) and persists it; this section only mirrors
 * the result. The last workspace module cannot be turned off.
 */
export function ModulesSection() {
  const t = useT()
  const enabledModules = useAppStore((state) => state.enabledModules)
  const setModuleEnabled = useAppStore((state) => state.setModuleEnabled)
  const notify = useNotificationStore((state) => state.notify)
  const dismiss = useNotificationStore((state) => state.dismiss)
  const [busy, setBusy] = useState<ModuleId | null>(null)

  const toggle = async (id: ModuleId, enabled: boolean) => {
    setBusy(id)
    dismiss(MODULES_ERROR_KEY)
    const res = await setModuleEnabled(id, enabled)
    if (!res.success) notify({ key: MODULES_ERROR_KEY, tone: 'error', message: t.settings_modules_error })
    setBusy(null)
  }

  const systemModules: { id: ModuleId; label: string; description: string }[] = [
    { id: 'launcher', label: t.settings_modules_launcher_label, description: t.settings_modules_launcher_desc },
    { id: 'browser-bridge', label: t.settings_modules_browser_bridge_label, description: t.settings_modules_browser_bridge_desc },
  ]

  return (
    <section className="space-y-3">
      <div>
        <h2 className="settings-section-title">{t.settings_modules_section}</h2>
        <p className="settings-section-desc mt-1">{t.settings_modules_section_desc}</p>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        <div className="px-4 pt-3 pb-1">
          <p className="ui-kicker">{t.settings_modules_pages_group}</p>
        </div>
        {APP_MODULES.map((module) => {
          const checked = enabledModules[module.id] !== false
          const last = checked && isLastEnabledPageModule(module.id, enabledModules)
          return (
            <ModuleToggleRow
              key={module.id}
              id={module.id}
              label={t[module.labelKey]}
              description={t[module.descriptionKey]}
              checked={checked}
              disabled={busy !== null || last}
              hint={last ? t.settings_modules_last_page_hint : undefined}
              onChange={(enabled) => void toggle(module.id, enabled)}
            />
          )
        })}
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">
        <div className="px-4 pt-3 pb-1">
          <p className="ui-kicker">{t.settings_modules_system_group}</p>
        </div>
        {systemModules.map((module) => (
          <ModuleToggleRow
            key={module.id}
            id={module.id}
            label={module.label}
            description={module.description}
            checked={enabledModules[module.id] !== false}
            disabled={busy !== null}
            onChange={(enabled) => void toggle(module.id, enabled)}
          />
        ))}
      </div>
    </section>
  )
}
