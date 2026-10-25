import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { type SystemShortcutOwner, systemShortcutOwnerLabel } from '../../components/organisms'
import { KeyCap, ToggleSwitch } from '../../components/ui/atoms'
import { HotkeyRecordButton } from '../../components/ui/HotkeyRecordButton'
import { XIcon } from '../../components/ui/icons'
import { CapabilityNotice, type CapabilityNoticeAction, SelectField, SettingsCard, SettingsRow, StatusLabel, StepList } from '../../components/ui/molecules'
import { PROVIDERS, TARGET_LANGUAGES } from '../../constants/providers'
import { SHORTCUTS_CHANGED_EVENT, STATUS_RESET_DELAY_MS, STATUS_RESET_LONG_MS } from '../../constants/ui'
import { MACOS_KEYBOARD_SHORTCUTS_PREFS } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { CapabilityStatus } from '../../types'
import { recordHotkey } from '../../utils/hotkeyRecording'
import { DEFAULT_QUICK_TRANSLATE_SHORTCUT, defaultLauncherShortcut, shortcutKeyCaps } from '../../utils/keyboardShortcuts'
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
  /** The last key pressed while recording had no Command/Control/Option. */
  const [needsModifier, setNeedsModifier] = useState(false)
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
        : data?.errorCode === 'PASTE_FAILED' ? t.settings_hotkey_error_paste_failed
        : data?.errorCode === 'TRANSLATE_FAILED' ? t.settings_hotkey_error_translate_failed
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
      // Main's message is English and technical; say it in the user's language by code.
      const message = res.errorCode === 'IN_USE' ? t.settings_chat_hotkey_status_conflict
        : res.errorCode === 'CONFLICT' ? t.settings_hotkey_register_conflict_launcher
        : res.errorCode === 'INVALID' ? t.settings_hotkey_register_invalid
        : t.launcher_hotkey_failed
      notify({ key: HOTKEY_ERROR_KEY, tone: 'error', message })
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
  }, [hotkeyValue, hotkeyEnabled, hotkeyProvider, hotkeyModel, effectiveTargetLang, effectiveSecondaryLang, locale, t, notify, dismissNotification])

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
    const recorded = recordHotkey(e)
    // Plain Tab keeps moving focus; the blur ends recording.
    if (e.key === 'Tab' && recorded.kind === 'ignore') return
    e.preventDefault()
    if (recorded.kind === 'cancel') {
      setIsRecording(false)
      setNeedsModifier(false)
    } else if (recorded.kind === 'needs-modifier') {
      setNeedsModifier(true)
    } else if (recorded.kind === 'accelerator') {
      setNeedsModifier(false)
      setHotkeyValue(recorded.accelerator)
      setIsRecording(false)
      saveHotkeySettings({ hotkey: recorded.accelerator })
    }
  }

  // ── AI Chat hotkey state ──────────────────────────────────────────────────
  const [chatHotkeyEnabled, setChatHotkeyEnabled] = useState(false)
  const [chatHotkeyValue, setChatHotkeyValue] = useState('')
  const [isChatRecording, setIsChatRecording] = useState(false)
  const [chatNeedsModifier, setChatNeedsModifier] = useState(false)
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
    const recorded = recordHotkey(e)
    // Plain Tab keeps moving focus; the blur ends recording.
    if (e.key === 'Tab' && recorded.kind === 'ignore') return
    e.preventDefault()
    if (recorded.kind === 'cancel') {
      setIsChatRecording(false)
      setChatNeedsModifier(false)
    } else if (recorded.kind === 'needs-modifier') {
      setChatNeedsModifier(true)
    } else if (recorded.kind === 'accelerator') {
      setChatNeedsModifier(false)
      setChatHotkeyValue(recorded.accelerator)
      setIsChatRecording(false)
      saveChatHotkeySettings({ hotkey: recorded.accelerator })
    }
  }

  // The key sits where each language puts it: "Press ⌥ T" / "⌥ Tを押す".
  const [pressBefore, pressAfter = ''] = t.everywhere_step_press.split('{key}')
  const pressStepTitle = (
    <>
      {pressBefore}
      {hotkeyValue && <KeyCap>{shortcutKeyCaps(hotkeyValue, window.api?.platform).join(' ')}</KeyCap>}
      {pressAfter}
    </>
  )

  return (
    <>
      {part === 'quickTranslate' && (
        <SettingsCard
          headingLevel={2}
          title={t.shortcut_quick_translate}
          description={t.settings_hotkey_section_desc}
          aside={(
            <ToggleSwitch
              checked={hotkeyEnabled}
              aria-label={t.settings_hotkey_enabled}
              onChange={(next) => {
                setHotkeyEnabled(next)
                saveHotkeySettings({ enabled: next })
              }}
            />
          )}
        >
          {/* The Translate module is off: main keeps the shortcut unregistered */}
          {enabledModules.translate === false && (
            <CapabilityNotice
              tone="info"
              title={tpl(t.settings_modules_off_title, { module: t.nav_translate })}
              description={t.settings_modules_off_desc}
              actions={[{ label: t.settings_modules_turn_on, onClick: () => { void setModuleEnabled('translate', true) }, primary: true }]}
            />
          )}

          <StepList
            label={t.everywhere_steps_label}
            steps={[
              { key: 'select', title: t.everywhere_step_select, detail: t.everywhere_step_select_desc },
              {
                key: 'press',
                title: pressStepTitle,
                detail: t.everywhere_step_press_desc,
              },
              {
                key: 'replace',
                title: t.everywhere_step_replace,
                detail: tpl(t.everywhere_step_replace_desc, { undo: shortcutKeyCaps('CommandOrControl+Z', window.api?.platform).join('') }),
              },
            ]}
          />

          <SettingsRow
            label={t.settings_hotkey_label}
            description={needsModifier ? <span role="alert">{t.settings_hotkey_needs_modifier}</span> : t.settings_hotkey_desc}
          >
            {hotkeyValue && !isRecording && (
              <Button
                size="md"
                shape="icon"
                variant="danger"
                appearance="ghost"
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
              onBlur={() => { setIsRecording(false); setNeedsModifier(false) }}
              recordingText={t.settings_hotkey_recording}
              noneText={t.settings_hotkey_none}
            />
          </SettingsRow>

          {/* Language pair — Quick Translate's own, independent of the Translate page */}
          <SettingsRow
            label={t.everywhere_language_pair}
            description={effectiveSecondaryLang ? t.settings_hotkey_pair_desc : t.settings_hotkey_pair_off_desc}
            align="top"
          >
            <SelectField
              label={t.settings_hotkey_primary_lang}
              value={effectiveTargetLang}
              options={languageOptions}
              onChange={selectPrimaryLang}
              className="everywhere-language-field"
            />
            <SelectField
              label={t.settings_hotkey_secondary_lang}
              value={effectiveSecondaryLang}
              options={secondaryLanguageOptions}
              onChange={selectSecondaryLang}
              className="everywhere-language-field"
            />
          </SettingsRow>

          <SettingsRow label={t.everywhere_model} description={t.everywhere_model_desc}>
            <span className="everywhere-model">
              {PROVIDERS.find((provider) => provider.id === hotkeyProvider)?.name ?? hotkeyProvider} · <code>{hotkeyModel}</code>
            </span>
          </SettingsRow>

          {/* macOS Accessibility permission */}
          {accessibility && accessibility.permission !== 'not-required' && (
            <SettingsRow
              label={t.settings_hotkey_accessibility_title}
              description={accessibility.permission === 'granted' ? t.settings_hotkey_accessibility_granted : t.settings_hotkey_accessibility_missing}
            >
              <StatusLabel tone={accessibility.permission === 'granted' ? 'ok' : 'warning'}>
                {accessibility.permission === 'granted' ? t.everywhere_permission_granted : t.everywhere_permission_missing}
              </StatusLabel>
              {accessibility.permission !== 'granted' && (
                <Button size="sm" shape="rect" variant="primary" appearance="solid" onClick={() => { void requestAccessibility() }}>
                  {t.settings_hotkey_accessibility_open}
                </Button>
              )}
            </SettingsRow>
          )}
        </SettingsCard>
      )}
      {part === 'launcher' && (
        <SettingsCard
          headingLevel={2}
          title={t.shortcut_launcher}
          description={t.settings_chat_hotkey_section_desc}
          aside={(
            <ToggleSwitch
              checked={chatHotkeyEnabled}
              aria-label={t.settings_chat_hotkey_enabled}
              onChange={(next) => {
                setChatHotkeyEnabled(next)
                saveChatHotkeySettings({ enabled: next })
              }}
            />
          )}
        >
          {/* The Launcher module is off: main keeps the shortcut unregistered */}
          {enabledModules.launcher === false && (
            <CapabilityNotice
              tone="info"
              title={tpl(t.settings_modules_off_title, { module: t.settings_modules_launcher_label })}
              description={t.settings_modules_off_desc}
              actions={[{ label: t.settings_modules_turn_on, onClick: () => { void setModuleEnabled('launcher', true) }, primary: true }]}
            />
          )}

          <SettingsRow
            label={t.settings_chat_hotkey_label}
            description={chatNeedsModifier ? <span role="alert">{t.settings_hotkey_needs_modifier}</span> : t.settings_chat_hotkey_desc}
          >
            {chatHotkeyValue && !isChatRecording && (
              <Button
                size="md"
                shape="icon"
                variant="danger"
                appearance="ghost"
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
              onBlur={() => { setIsChatRecording(false); setChatNeedsModifier(false) }}
              recordingText={t.settings_chat_hotkey_recording}
              noneText={t.settings_chat_hotkey_none}
            />
          </SettingsRow>

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

        </SettingsCard>
      )}
    </>
  )
}
