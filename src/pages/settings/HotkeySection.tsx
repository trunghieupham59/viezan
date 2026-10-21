import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { ToggleSwitch } from '../../components/ui/atoms'
import { HotkeyRecordButton } from '../../components/ui/HotkeyRecordButton'
import { XIcon } from '../../components/ui/icons'
import { STATUS_RESET_DELAY_MS, STATUS_RESET_LONG_MS } from '../../constants/ui'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'

const DEFAULT_HOTKEY = 'Alt+Shift+T'
/** Toast owner keys: progress → done/error replace each other for one shortcut run. */
const HOTKEY_ERROR_KEY = 'settings-hotkey-register'
const HOTKEY_RUN_KEY = 'settings-hotkey-run'
const CHAT_HOTKEY_ERROR_KEY = 'settings-chat-hotkey-register'
const getDefaultChatHotkey = () => window.api?.platform === 'darwin' ? 'Command+Space' : 'Alt+Space'

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
  const notify = useNotificationStore((state) => state.notify)
  const dismissNotification = useNotificationStore((state) => state.dismiss)
  const hotkeyInputRef = useRef<HTMLButtonElement>(null)

  const hotkeyProvider = selectedProvider
  const hotkeyModel = selectedModels[selectedProvider]
  const hotkeyTargetLang = targetLang

  // Load saved hotkey settings on mount
  useEffect(() => {
    if (!window.api?.hotkey) return
    window.api.hotkey.get().then((res: { success: boolean; settings?: Record<string, unknown> }) => {
      if (res?.success && res.settings) {
        const s = res.settings
        setHotkeyEnabled(s.enabled === true)
        setHotkeyValue(typeof s.hotkey === 'string' && s.hotkey ? s.hotkey : DEFAULT_HOTKEY)
      } else {
        setHotkeyValue(DEFAULT_HOTKEY)
      }
    })
  }, [])

  // Listen for hotkey feedback events from main process
  useEffect(() => {
    if (!window.api?.hotkey) return
    const unsub1 = window.api.hotkey.onTranslating(() => {
      notify({ key: HOTKEY_RUN_KEY, tone: 'info', message: t.settings_hotkey_status_translating, durationMs: null, dismissible: false })
    })
    const unsub2 = window.api.hotkey.onTranslated(() => {
      notify({ key: HOTKEY_RUN_KEY, tone: 'success', message: t.settings_hotkey_status_done, durationMs: STATUS_RESET_DELAY_MS })
    })
    const unsub3 = window.api.hotkey.onError((data: { error: string }) => {
      notify({ key: HOTKEY_RUN_KEY, tone: 'error', message: data?.error ?? t.settings_hotkey_status_error, durationMs: STATUS_RESET_LONG_MS })
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
      targetLang: hotkeyTargetLang,
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
  }, [hotkeyValue, hotkeyEnabled, hotkeyProvider, hotkeyModel, hotkeyTargetLang, locale, notify, dismissNotification])

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

  // Auto-sync hotkey settings to backend whenever store values change
  // biome-ignore lint/correctness/useExhaustiveDependencies: saveHotkeySettings is stable via useCallback; hotkeyEnabled/hotkeyValue accessed inside
  useEffect(() => {
    if (!window.api?.hotkey || !hotkeyValue) return
    saveHotkeySettings()
  }, [hotkeyProvider, hotkeyModel, hotkeyTargetLang, locale])

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
        <h2 className="section-label">{t.settings_hotkey_section}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_hotkey_section_desc}</p>
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

      </div>

      {/* ── AI Chat Hotkey ── */}
      <div className="mt-6">
        <h2 className="section-label">{t.settings_chat_hotkey_section}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings_chat_hotkey_section_desc}</p>
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
