import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { type SystemShortcutOwner, systemShortcutOwnerLabel } from '../../components/organisms'
import { ToggleSwitch } from '../../components/ui/atoms'
import { HotkeyRecordButton } from '../../components/ui/HotkeyRecordButton'
import { XIcon } from '../../components/ui/icons'
import { CapabilityNotice, type CapabilityNoticeAction, SelectField } from '../../components/ui/molecules'
import { TARGET_LANGUAGES } from '../../constants/providers'
import { SHORTCUTS_CHANGED_EVENT, STATUS_RESET_DELAY_MS, STATUS_RESET_LONG_MS } from '../../constants/ui'
import { MACOS_KEYBOARD_SHORTCUTS_PREFS } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { CapabilityStatus } from '../../types'
import { DEFAULT_QUICK_TRANSLATE_SHORTCUT, defaultLauncherShortcut } from '../../utils/keyboardShortcuts'
import { tpl } from '../../utils/tpl'

/** Mirrors DEFAULT_TRANSLATE_HOTKEY in electron/ipc/globalHotkey.ts (Option+T on macOS). */
/** Toast owner keys: progress → done/error replace each other for one shortcut run. */
const HOTKEY_ERROR_KEY = 'settings-hotkey-register'
const HOTKEY_RUN_KEY = 'settings-hotkey-run'
const CHAT_HOTKEY_ERROR_KEY = 'settings-chat-hotkey-register'
const getDefaultChatHotkey = () => defaultLauncherShortcut(window.api?.platform)
/** Display form of a stored accelerator: the Alt key is labelled Option on Mac keyboards. */
const displayAccelerator = (accelerator: string) =>
  window.api?.platform === 'darwin' ? accelerator.replace(/(^|\+)(Alt|Option)(?=\+|$)/g, '$1Option') : accelerator
/** Offered when macOS owns the chosen Launcher shortcut (Spotlight holds Command+Space). */
const ALTERNATIVE_CHAT_HOTKEY = 'Alt+Space'
const isTargetLanguage = (value: unknown): value is string =>
  typeof value === 'string' && TARGET_LANGUAGES.some((language) => language.code === value)

const KEY_MAP: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Escape: 'Escape', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete',
  Tab: 'Tab', F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
}

export interface HotkeySectionProps {
  /**
   * Which shortcut block to show: Quick Translate (on Translate everywhere) or the
   * Launcher (on Launcher & shortcuts). Both share the recording and conflict logic.
   */
  part: 'quickTranslate' | 'launcher'
}

export function HotkeySection({ part }: HotkeySectionProps) {
  const selectedProvider = useAppStore((state) => state.selectedProvider)
  const selectedModels = useAppStore((state) => state.selectedModels)
  const targetLang = useAppStore((state) => state.targetLang)
  const locale = useAppStore((state) => state.locale)
  const enabledModules = useAppStore((state) => state.enabledModules)
  const setModuleEnabled = useAppStore((state) => state.setModuleEnabled)
  const t = useT()

  const [hotkeyEnabled, setHotkeyEnabled] = useState(false)
  const [hotkeyValue, setHotkeyValue] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  /** Quick Translate's own language pair, persisted by the main process. */
  const [hotkeyTargetLang, setHotkeyTargetLang] = useState('')
  /** '' = pair off (always translate into the primary language); null = not loaded yet. */
  const [hotkeySecondaryLang, setHotkeySecondaryLang] = useState<string | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  /** `input.accessibility` capability (macOS keystroke permission); null until the first answer. */
  const [accessibility, setAccessibility] = useState<CapabilityStatus | null>(null)
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  const hotkeyInputRef = useRef<HTMLButtonElement>(null)

  const hotkeyProvider = selectedProvider
  const hotkeyModel = selectedModels[selectedProvider]
  // The persisted value wins; a fresh install starts from the Translate page's target.
  const effectiveTargetLang = isTargetLanguage(hotkeyTargetLang) ? hotkeyTargetLang : targetLang
  const effectiveSecondaryLang = hotkeySecondaryLang !== null && hotkeySecondaryLang !== effectiveTargetLang ? hotkeySecondaryLang : ''

  // Load saved hotkey settings on mount
  useEffect(() => {
    if (!window.api?.hotkey) return
    window.api.hotkey.get().then((res: { success: boolean; settings?: Record<string, unknown> }) => {
      if (res?.success && res.settings) {
        const s = res.settings
        setHotkeyEnabled(s.enabled === true)
        setHotkeyValue(typeof s.hotkey === 'string' && s.hotkey ? s.hotkey : DEFAULT_QUICK_TRANSLATE_SHORTCUT)
        if (isTargetLanguage(s.targetLang)) setHotkeyTargetLang(s.targetLang)
        setHotkeySecondaryLang(isTargetLanguage(s.secondaryLang) ? s.secondaryLang : '')
      } else {
        setHotkeyValue(DEFAULT_QUICK_TRANSLATE_SHORTCUT)
      }
      setSettingsLoaded(true)
    })
  }, [])

  // macOS Accessibility permission: checked on mount and whenever the window regains
  // focus, since the user grants it in System Settings and comes back.
  const refreshAccessibility = useCallback(async () => {
    const api = window.api?.capabilities
    if (!api) return
    try {
      const res = await api.get(['input.accessibility'])
      const status = res?.success ? res.statuses?.find((s) => s.id === 'input.accessibility') : undefined
      if (status) setAccessibility(status)
    } catch {
      /* keep the last known status */
    }
  }, [])

  useEffect(() => {
    refreshAccessibility()
    window.addEventListener('focus', refreshAccessibility)
    return () => window.removeEventListener('focus', refreshAccessibility)
  }, [refreshAccessibility])

  const requestAccessibility = useCallback(async () => {
    const api = window.api?.capabilities
    if (!api) return
    try {
      const res = await api.request('input.accessibility')
      if (res?.success && res.status) setAccessibility(res.status)
    } catch {
      /* the focus listener re-checks when the user returns */
    }
  }, [])

  // Listen for hotkey feedback events from main process
  useEffect(() => {
    if (!window.api?.hotkey) return
    const unsub1 = window.api.hotkey.onTranslating(() => {
      notify({ key: HOTKEY_RUN_KEY, tone: 'info', message: t.settings_hotkey_status_translating, durationMs: null, dismissible: false })
    })
    const unsub2 = window.api.hotkey.onTranslated((data: { targetLang?: string | null }) => {
      // Name the direction the language pair picked so an unexpected result is explainable.
      const langName = data?.targetLang ? (t.lang_names[data.targetLang] ?? data.targetLang) : null
      const message = langName ? t.settings_hotkey_status_done_into.replace('{lang}', langName) : t.settings_hotkey_status_done
      notify({ key: HOTKEY_RUN_KEY, tone: 'success', message, durationMs: STATUS_RESET_DELAY_MS })
    })
    const unsub3 = window.api.hotkey.onError((data: { error: string; errorCode?: string }) => {
      // Known failure codes get a localized explanation; anything else shows the backend message.
      const message = data?.errorCode === 'ACCESSIBILITY_DENIED' ? t.settings_hotkey_error_accessibility
        : data?.errorCode === 'COPY_FAILED' ? t.settings_hotkey_error_copy_failed
        : data?.error ?? t.settings_hotkey_status_error
      if (data?.errorCode === 'ACCESSIBILITY_DENIED') setAccessibility({ id: 'input.accessibility', supported: true, permission: 'denied' })
      notify({ key: HOTKEY_RUN_KEY, tone: 'error', message, durationMs: STATUS_RESET_LONG_MS })
    })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [t, notify])

  const saveHotkeySettings = useCallback(async (overrides: Record<string, unknown> = {}) => {
    if (!window.api?.hotkey) return
    const settings = {
      hotkey: hotkeyValue,
      enabled: hotkeyEnabled,
      provider: hotkeyProvider,
      model: hotkeyModel,
      targetLang: effectiveTargetLang,
      secondaryLang: effectiveSecondaryLang,
      uiLanguage: locale,
      ...overrides,
    }
    const res = await window.api.hotkey.update(settings)
    if (!res?.success && res?.error) {
      notify({ key: HOTKEY_ERROR_KEY, tone: 'error', message: res.error })
      // The backend keeps the previously registered shortcut when an update is
      // rejected, so mirror what it actually has instead of forcing the toggle off.
      const kept = res.settings
      if (kept) {
        setHotkeyEnabled(kept.enabled === true)
        setHotkeyValue(typeof kept.hotkey === 'string' ? kept.hotkey : '')
      } else {
        setHotkeyEnabled(false)
      }
    } else {
      dismissNotification(HOTKEY_ERROR_KEY)
    }
    window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT))
  }, [hotkeyValue, hotkeyEnabled, hotkeyProvider, hotkeyModel, effectiveTargetLang, effectiveSecondaryLang, locale, notify, dismissNotification])

  // Convert a KeyboardEvent to an Electron accelerator string
  const keyEventToAccelerator = (e: React.KeyboardEvent): string => {
    const parts: string[] = []
    if (e.metaKey)  parts.push('Command')
    if (e.ctrlKey)  parts.push('Ctrl')
    if (e.altKey)   parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    const key = e.key
    if (!['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
      parts.push(KEY_MAP[key] ?? key.toUpperCase())
    }
    return parts.join('+')
  }

  // Provider, model and UI language follow the app; push them once the persisted
  // settings are loaded and again whenever they change. The target language is
  // Quick Translate's own and is saved from its selector below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: saveHotkeySettings is stable via useCallback; hotkeyEnabled/hotkeyValue accessed inside
  useEffect(() => {
    if (!window.api?.hotkey || !settingsLoaded || !hotkeyValue) return
    saveHotkeySettings()
  }, [settingsLoaded, hotkeyProvider, hotkeyModel, locale])

  const languageOptions = TARGET_LANGUAGES.map((language) => {
    const label = t.lang_names[language.code] ?? language.name
    return { value: language.code, label, description: language.nativeName !== label ? language.nativeName : undefined }
  })
  const secondaryLanguageOptions = [
    { value: '', label: t.settings_hotkey_secondary_off },
    ...languageOptions.filter((option) => option.value !== effectiveTargetLang),
  ]

  const selectPrimaryLang = (lang: string) => {
    // Picking the current secondary as primary swaps the pair instead of collapsing it.
    const secondary = lang === effectiveSecondaryLang ? effectiveTargetLang : effectiveSecondaryLang
    setHotkeyTargetLang(lang)
    setHotkeySecondaryLang(secondary)
    saveHotkeySettings({ targetLang: lang, secondaryLang: secondary })
  }

  const selectSecondaryLang = (lang: string) => {
    setHotkeySecondaryLang(lang)
    saveHotkeySettings({ secondaryLang: lang })
  }

  const handleHotkeyKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    if (e.key === 'Escape') {
      setIsRecording(false)
      return
    }
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
    const acc = keyEventToAccelerator(e)
    if (acc) {
      setHotkeyValue(acc)
      setIsRecording(false)
      saveHotkeySettings({ hotkey: acc })
    }
  }

  // ── AI Chat hotkey state ──────────────────────────────────────────────────
  const [chatHotkeyEnabled, setChatHotkeyEnabled] = useState(false)
  const [chatHotkeyValue, setChatHotkeyValue] = useState('')
  const [isChatRecording, setIsChatRecording] = useState(false)
  /** macOS system shortcut (Spotlight, Finder search) that owns the current Launcher shortcut. */
  const [chatSystemConflict, setChatSystemConflict] = useState<{ owner: SystemShortcutOwner; accelerator: string } | null>(null)
  /** Whether Viezan turned Spotlight's shortcut off (offers a way back). */
  const [spotlightDisabledByViezan, setSpotlightDisabledByViezan] = useState(false)
  const [spotlightBusy, setSpotlightBusy] = useState(false)
  const chatHotkeyInputRef = useRef<HTMLButtonElement>(null)
  const isMac = window.api?.platform === 'darwin'

  const refreshSpotlightState = useCallback(async () => {
    const api = window.api?.capabilities
    if (!api || !isMac) return
    try {
      const res = await api.get(['launcher.spotlight'])
      const status = res?.success ? res.statuses?.find((s) => s.id === 'launcher.spotlight') : undefined
      if (status) setSpotlightDisabledByViezan(status.detail?.disabledByViezan === true)
    } catch { /* keep the last known state */ }
  }, [isMac])

  useEffect(() => {
    refreshSpotlightState()
    window.addEventListener('focus', refreshSpotlightState)
    return () => window.removeEventListener('focus', refreshSpotlightState)
  }, [refreshSpotlightState])

  /** Hand Command+Space to the Launcher (turns Spotlight's shortcut off) or give it back. */
  const changeSpotlightShortcut = async (action: 'disable' | 'restore') => {
    const api = window.api?.hotkey?.chat?.spotlight
    if (!api || spotlightBusy) return
    setSpotlightBusy(true)
    try {
      const res = action === 'disable' ? await api.resolve('replace') : await api.restore()
      if (!res?.success) {
        notify({ key: CHAT_HOTKEY_ERROR_KEY, tone: 'error', message: action === 'disable' ? t.launcher_spotlight_replace_failed : t.settings_chat_hotkey_spotlight_restore_failed })
        return
      }
      if (action === 'disable') {
        setChatHotkeyEnabled(true)
        setChatHotkeyValue(getDefaultChatHotkey())
        setChatSystemConflict(null)
        setSpotlightDisabledByViezan(true)
      } else {
        setSpotlightDisabledByViezan(false)
      }
      notify({
        key: CHAT_HOTKEY_ERROR_KEY,
        tone: res.applied === false ? 'warning' : 'success',
        message: res.applied === false ? t.launcher_spotlight_relogin
          : action === 'disable' ? t.launcher_spotlight_replaced : t.settings_chat_hotkey_spotlight_restored,
        durationMs: res.applied === false ? null : undefined,
      })
      // Spotlight back on means the conflict is back when the Launcher still uses Command+Space.
      if (action === 'restore') window.dispatchEvent(new Event('focus'))
    } catch {
      notify({ key: CHAT_HOTKEY_ERROR_KEY, tone: 'error', message: t.launcher_spotlight_replace_failed })
    } finally {
      setSpotlightBusy(false)
    }
  }

  // Re-check whenever the shortcut changes and when the window regains focus (the user
  // turns Spotlight's shortcut off in System Settings and comes back).
  useEffect(() => {
    const api = window.api?.hotkey?.chat
    if (!api?.systemConflict || window.api?.platform !== 'darwin' || !chatHotkeyValue) {
      setChatSystemConflict(null)
      return
    }
    let active = true
    const check = () => {
      api.systemConflict(chatHotkeyValue).then((res) => {
        if (!active) return
        if (res?.success) setChatSystemConflict(res.conflict ?? null)
      }).catch(() => undefined)
    }
    check()
    window.addEventListener('focus', check)
    return () => { active = false; window.removeEventListener('focus', check) }
  }, [chatHotkeyValue])

  // Load saved AI Chat hotkey settings
  useEffect(() => {
    if (!window.api?.hotkey?.chat) return
    window.api.hotkey.chat.get().then((res: { success: boolean; settings?: Record<string, unknown> }) => {
      if (res?.success && res.settings) {
        const s = res.settings
        setChatHotkeyEnabled(s.enabled === true)
        setChatHotkeyValue(typeof s.hotkey === 'string' && s.hotkey ? s.hotkey : getDefaultChatHotkey())
      } else {
        setChatHotkeyValue(getDefaultChatHotkey())
      }
    })
  }, [])

  const saveChatHotkeySettings = useCallback(async (overrides: Record<string, unknown> = {}) => {
    if (!window.api?.hotkey?.chat) return
    const settings = {
      hotkey: chatHotkeyValue,
      enabled: chatHotkeyEnabled,
      ...overrides,
    }
    const res = await window.api.hotkey.chat.update(settings)
    if (!res?.success && res?.error) {
      notify({
        key: CHAT_HOTKEY_ERROR_KEY,
        tone: 'error',
        message: res.errorCode === 'IN_USE' || res.errorCode === 'CONFLICT'
          ? t.settings_chat_hotkey_status_conflict : t.launcher_hotkey_failed,
      })
      const kept = res.settings
      if (kept) {
        setChatHotkeyEnabled(kept.enabled === true)
        setChatHotkeyValue(typeof kept.hotkey === 'string' ? kept.hotkey : '')
      } else {
        setChatHotkeyEnabled(false)
      }
    } else {
      dismissNotification(CHAT_HOTKEY_ERROR_KEY)
    }
    window.dispatchEvent(new Event(SHORTCUTS_CHANGED_EVENT))
  }, [chatHotkeyValue, chatHotkeyEnabled, t, notify, dismissNotification])

  const handleChatHotkeyKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    if (e.key === 'Escape') {
      setIsChatRecording(false)
      return
    }
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
    const acc = keyEventToAccelerator(e)
    if (acc) {
      setChatHotkeyValue(acc)
      setIsChatRecording(false)
      saveChatHotkeySettings({ hotkey: acc })
    }
  }

  return (
    <section className="space-y-3">
      {part === 'quickTranslate' && (
        <>
      {/* ── Quick Translate Hotkey ── */}
      <div>
        <h2 className="settings-section-title">{t.settings_hotkey_section}</h2>
        <p className="settings-section-desc mt-1">{t.settings_hotkey_section_desc}</p>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_hotkey_enabled}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_hotkey_enabled_desc}</p>
          </div>
          <ToggleSwitch
            checked={hotkeyEnabled}
            onChange={(next) => {
              setHotkeyEnabled(next)
              saveHotkeySettings({ enabled: next })
            }}
          />
        </div>

        {/* Shortcut recorder */}
        <div className="px-4 py-3.5 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_hotkey_label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_hotkey_desc}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hotkeyValue && !isRecording && (
                <Button
                  size="md"
                  shape="icon"
                  variant="danger"
                  appearance="soft"
                  aria-label={t.settings_hotkey_clear}
                  type="button"
                  onClick={() => {
                    setHotkeyValue('')
                    setHotkeyEnabled(false)
                    saveHotkeySettings({ hotkey: '', enabled: false })
                  }}
                  title={t.settings_hotkey_clear}
                >
                  <XIcon />
                </Button>
              )}
              <HotkeyRecordButton
                inputRef={hotkeyInputRef}
                isRecording={isRecording}
                value={displayAccelerator(hotkeyValue)}
                onKeyDown={handleHotkeyKeyDown}
                onClick={() => setIsRecording(true)}
                onBlur={() => setIsRecording(false)}
                recordingText={t.settings_hotkey_recording}
                noneText={t.settings_hotkey_none}
              />
            </div>
          </div>
        </div>

        {/* Language pair — Quick Translate's own, independent of the Translate page */}
        <div className="px-4 py-3.5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t.settings_hotkey_primary_lang}
              value={effectiveTargetLang}
              options={languageOptions}
              onChange={selectPrimaryLang}
            />
            <SelectField
              label={t.settings_hotkey_secondary_lang}
              value={effectiveSecondaryLang}
              options={secondaryLanguageOptions}
              onChange={selectSecondaryLang}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {effectiveSecondaryLang ? t.settings_hotkey_pair_desc : t.settings_hotkey_pair_off_desc}
          </p>
        </div>

        {/* The Translate module is off: main keeps the shortcut unregistered */}
        {enabledModules.translate === false && (
          <CapabilityNotice
            tone="info"
            title={tpl(t.settings_modules_off_title, { module: t.nav_translate })}
            description={t.settings_modules_off_desc}
            actions={[{ label: t.settings_modules_turn_on, onClick: () => { void setModuleEnabled('translate', true) }, primary: true }]}
          />
        )}

        {/* macOS Accessibility permission */}
        {accessibility && accessibility.permission !== 'not-required' && (
          <CapabilityNotice
            title={t.settings_hotkey_accessibility_title}
            description={accessibility.permission === 'granted' ? t.settings_hotkey_accessibility_granted : t.settings_hotkey_accessibility_missing}
            tone={accessibility.permission === 'granted' ? 'ok' : 'warning'}
            actions={accessibility.permission === 'granted' ? [] : [
              { label: t.settings_hotkey_accessibility_open, onClick: () => { void requestAccessibility() }, primary: true },
            ]}
          />
        )}

      </div>
        </>
      )}
      {part === 'launcher' && (
        <>
      {/* ── AI Chat Hotkey ── */}
      <div>
        <h2 className="settings-section-title">{t.settings_chat_hotkey_section}</h2>
        <p className="settings-section-desc mt-1">{t.settings_chat_hotkey_section_desc}</p>
      </div>

      <div className="card divide-y divide-gray-100 dark:divide-gray-700">

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_hotkey_enabled}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_hotkey_enabled_desc}</p>
          </div>
          <ToggleSwitch
            checked={chatHotkeyEnabled}
            onChange={(next) => {
              setChatHotkeyEnabled(next)
              saveChatHotkeySettings({ enabled: next })
            }}
          />
        </div>

        {/* Shortcut recorder */}
        <div className="px-4 py-3.5 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_chat_hotkey_label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_hotkey_desc}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {chatHotkeyValue && !isChatRecording && (
                <Button
                  size="md"
                  shape="icon"
                  variant="danger"
                  appearance="soft"
                  aria-label={t.settings_chat_hotkey_clear}
                  type="button"
                  onClick={() => {
                    setChatHotkeyValue('')
                    setChatHotkeyEnabled(false)
                    saveChatHotkeySettings({ hotkey: '', enabled: false })
                  }}
                  title={t.settings_chat_hotkey_clear}
                >
                  <XIcon />
                </Button>
              )}
              <HotkeyRecordButton
                inputRef={chatHotkeyInputRef}
                isRecording={isChatRecording}
                value={displayAccelerator(chatHotkeyValue)}
                onKeyDown={handleChatHotkeyKeyDown}
                onClick={() => setIsChatRecording(true)}
                onBlur={() => setIsChatRecording(false)}
                recordingText={t.settings_chat_hotkey_recording}
                noneText={t.settings_chat_hotkey_none}
              />
            </div>
          </div>
        </div>

        {/* The Launcher module is off: main keeps the shortcut unregistered */}
        {enabledModules.launcher === false && (
          <CapabilityNotice
            tone="info"
            title={tpl(t.settings_modules_off_title, { module: t.settings_modules_launcher_label })}
            description={t.settings_modules_off_desc}
            actions={[{ label: t.settings_modules_turn_on, onClick: () => { void setModuleEnabled('launcher', true) }, primary: true }]}
          />
        )}

        {/* macOS: Spotlight (or another system shortcut) owns the chosen keys */}
        {chatSystemConflict && (
          <CapabilityNotice
            tone="warning"
            title={tpl(t.settings_chat_hotkey_system_conflict_title, {
              owner: systemShortcutOwnerLabel(chatSystemConflict.owner, t),
              hotkey: chatSystemConflict.accelerator,
            })}
            description={t.settings_chat_hotkey_system_conflict_desc}
            actions={[
              ...(chatSystemConflict.owner === 'spotlight' ? [{
                label: t.settings_chat_hotkey_spotlight_disable,
                onClick: () => { void changeSpotlightShortcut('disable') },
                primary: true,
                disabled: spotlightBusy,
              } satisfies CapabilityNoticeAction] : []),
              {
                label: t.settings_chat_hotkey_system_conflict_open,
                onClick: () => { void window.api?.openExternal?.(MACOS_KEYBOARD_SHORTCUTS_PREFS) },
                variant: 'primary',
              },
              ...(chatHotkeyValue !== ALTERNATIVE_CHAT_HOTKEY ? [{
                label: tpl(t.settings_chat_hotkey_system_conflict_use, { hotkey: ALTERNATIVE_CHAT_HOTKEY.replace('Alt', 'Option') }),
                onClick: () => {
                  setChatHotkeyValue(ALTERNATIVE_CHAT_HOTKEY)
                  saveChatHotkeySettings({ hotkey: ALTERNATIVE_CHAT_HOTKEY })
                },
              } satisfies CapabilityNoticeAction] : []),
            ]}
          />
        )}

        {/* macOS: Viezan turned Spotlight's shortcut off — offer the way back */}
        {spotlightDisabledByViezan && (
          <CapabilityNotice
            tone="info"
            title={t.settings_chat_hotkey_spotlight_disabled_title}
            description={t.settings_chat_hotkey_spotlight_disabled_desc}
            actions={[{
              label: t.settings_chat_hotkey_spotlight_restore,
              onClick: () => { void changeSpotlightShortcut('restore') },
              disabled: spotlightBusy,
            }]}
          />
        )}

      </div>
        </>
      )}
    </section>
  )
}
