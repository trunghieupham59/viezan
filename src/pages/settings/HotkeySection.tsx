import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { ToggleSwitch } from '../../components/ui/atoms'
import { HotkeyRecordButton } from '../../components/ui/HotkeyRecordButton'
import { XIcon } from '../../components/ui/icons'
import { SelectField } from '../../components/ui/molecules'
import { TARGET_LANGUAGES } from '../../constants/providers'
import { STATUS_RESET_DELAY_MS, STATUS_RESET_LONG_MS } from '../../constants/ui'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'

const DEFAULT_HOTKEY = 'Alt+Shift+T'
/** Toast owner keys: progress → done/error replace each other for one shortcut run. */
const HOTKEY_ERROR_KEY = 'settings-hotkey-register'
const HOTKEY_RUN_KEY = 'settings-hotkey-run'
const CHAT_HOTKEY_ERROR_KEY = 'settings-chat-hotkey-register'
const getDefaultChatHotkey = () => window.api?.platform === 'darwin' ? 'Command+Space' : 'Alt+Space'
const isTargetLanguage = (value: unknown): value is string =>
  typeof value === 'string' && TARGET_LANGUAGES.some((language) => language.code === value)

const KEY_MAP: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Escape: 'Escape', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete',
  Tab: 'Tab', F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
}

export function HotkeySection() {
  const selectedProvider = useAppStore((state) => state.selectedProvider)
  const selectedModels = useAppStore((state) => state.selectedModels)
  const targetLang = useAppStore((state) => state.targetLang)
  const locale = useAppStore((state) => state.locale)
  const t = useT()

  const [hotkeyEnabled, setHotkeyEnabled] = useState(false)
  const [hotkeyValue, setHotkeyValue] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  /** Quick Translate's own language pair, persisted by the main process. */
  const [hotkeyTargetLang, setHotkeyTargetLang] = useState('')
  /** '' = pair off (always translate into the primary language); null = not loaded yet. */
  const [hotkeySecondaryLang, setHotkeySecondaryLang] = useState<string | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [accessibility, setAccessibility] = useState<{ required: boolean; granted: boolean } | null>(null)
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
        setHotkeyValue(typeof s.hotkey === 'string' && s.hotkey ? s.hotkey : DEFAULT_HOTKEY)
        if (isTargetLanguage(s.targetLang)) setHotkeyTargetLang(s.targetLang)
        setHotkeySecondaryLang(isTargetLanguage(s.secondaryLang) ? s.secondaryLang : '')
      } else {
        setHotkeyValue(DEFAULT_HOTKEY)
      }
      setSettingsLoaded(true)
    })
  }, [])

  // macOS Accessibility permission: checked on mount and whenever the window regains
  // focus, since the user grants it in System Settings and comes back.
  const refreshAccessibility = useCallback(async () => {
    const api = window.api?.hotkey?.accessibility
    if (!api) return
    try {
      const res = await api.get()
      if (res?.success) setAccessibility({ required: res.required, granted: res.granted })
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
    const api = window.api?.hotkey?.accessibility
    if (!api) return
    try {
      const res = await api.request()
      if (res?.success) setAccessibility({ required: res.required, granted: res.granted })
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
      if (data?.errorCode === 'ACCESSIBILITY_DENIED') setAccessibility({ required: true, granted: false })
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
  const chatHotkeyInputRef = useRef<HTMLButtonElement>(null)

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
                value={hotkeyValue}
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

        {/* macOS Accessibility permission */}
        {accessibility?.required && (
          <div className="flex items-center justify-between gap-4 px-4 py-3.5" role="status">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.settings_hotkey_accessibility_title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {accessibility.granted ? t.settings_hotkey_accessibility_granted : t.settings_hotkey_accessibility_missing}
              </p>
            </div>
            {!accessibility.granted && (
              <Button
                size="md"
                shape="rect"
                variant="primary"
                appearance="outline"
                type="button"
                className="flex-shrink-0"
                onClick={requestAccessibility}
              >
                {t.settings_hotkey_accessibility_open}
              </Button>
            )}
          </div>
        )}

      </div>

      {/* ── AI Chat Hotkey ── */}
      <div className="mt-6">
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
                value={chatHotkeyValue}
                onKeyDown={handleChatHotkeyKeyDown}
                onClick={() => setIsChatRecording(true)}
                onBlur={() => setIsChatRecording(false)}
                recordingText={t.settings_chat_hotkey_recording}
                noneText={t.settings_chat_hotkey_none}
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}
