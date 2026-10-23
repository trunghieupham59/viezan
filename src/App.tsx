import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'
import type { LauncherFeatureRequest } from '../shared/launcher'
import { AIChatSidebar, CommandPalette, LauncherShortcutNotice, LauncherSpotlightPrompt, NotificationViewport, PrimaryNavigationSidebar, UpdateNotification } from './components/organisms'
import { SettingsModal } from './components/SettingsModal'
import { AppShell } from './components/templates'
import { FeatureLoadingState } from './components/ui/molecules'
import { PROVIDERS } from './constants/providers'
import { resolveThemeMode, THEME_PRESET_TRAITS } from './constants/themePresets'
import { flushPersistedStore, useAppStore, useT } from './store/useAppStore'
import type { AppPage, Provider, QuickChatSeedPayload, UsageCost } from './types'
import { detectSystemLocale } from './utils/locale'

const TranslatePage = lazy(() => import('./pages/TranslatePage').then(m => ({ default: m.TranslatePage })))
const LiveTranslatePage = lazy(() => import('./pages/LiveTranslatePage').then(m => ({ default: m.LiveTranslatePage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })))
const DictionaryPage = lazy(() => import('./pages/DictionaryPage').then(m => ({ default: m.DictionaryPage })))

const FONT_SIZE_MAP = { small: '13px', medium: '15px', large: '17px' } as const
const CLOSE_PRIMARY_NAVIGATION_EVENT = 'viezan:close-primary-navigation'
const CLOSE_CONTEXT_SIDEBARS_EVENT = 'viezan:close-context-sidebars'

function closeResponsiveNavigation() {
  window.dispatchEvent(new CustomEvent(CLOSE_PRIMARY_NAVIGATION_EVENT))
  window.dispatchEvent(new CustomEvent(CLOSE_CONTEXT_SIDEBARS_EVENT))
}

export function PageFallback({ page, label }: { page: AppPage; label: string }) {
  if (page === 'live') return <FeatureLoadingState label={label} layout="split" />
  if (page === 'dictionary') return <FeatureLoadingState label={label} layout="split" />
  return <div className="app-page" aria-hidden="true" />
}

function App() {
  const t = useT()
  const {
    activePage, localeAuto, setKeyStatus, setLocaleFromSystem, fontSize, theme, themePreset, themeAccent,
    selectedProvider, selectedModels, ttsMode, ttsVoice,
    createChatSession, setActiveChatSession, addChatMessage, setChatSessionDraft,
    setActivePage, settingsOpen, openSettings, closeSettings,
    setSourceText, setPendingDictionaryTerm, recordUsageCost,
  } = useAppStore()

  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [navigationToggleHost, setNavigationToggleHost] = useState<HTMLDivElement | null>(null)

  // Apply dark class based on user preference or OS preference; a dark-only
  // preset (Midnight) pins it on.
  useEffect(() => {
    const mode = resolveThemeMode(theme, themePreset)
    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
      return
    }
    if (mode === 'light') {
      document.documentElement.classList.remove('dark')
      return
    }
    // 'system' — follow OS preference
    if (typeof window.matchMedia !== 'function') {
      document.documentElement.classList.remove('dark')
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (dark: boolean) => document.documentElement.classList.toggle('dark', dark)
    apply(mq.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme, themePreset])

  // The style preset is a second axis next to light/dark: tokens.css keys
  // every `[data-theme]` block off this attribute.
  useEffect(() => {
    document.documentElement.dataset.theme = themePreset
  }, [themePreset])

  // Accent is a third axis: a `[data-accent]` block in tokens.css replaces the
  // accent family of whichever preset is active; 'auto' leaves it alone.
  useEffect(() => {
    if (themeAccent === 'auto') delete document.documentElement.dataset.accent
    else document.documentElement.dataset.accent = themeAccent
  }, [themeAccent])

  // Keep the native window chrome (Windows caption buttons, startup colour)
  // in step with the in-app theme choice, not just the OS preference.
  useEffect(() => {
    void window.api?.setWindowTheme?.(resolveThemeMode(theme, themePreset), themePreset)
  }, [theme, themePreset])

  // Auto-detect system locale on startup
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run only once on mount
  useEffect(() => {
    if (localeAuto) setLocaleFromSystem(detectSystemLocale())
  }, [])

  // Apply font size
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_MAP[fontSize ?? 'medium']
  }, [fontSize])

  // Sync provider/model to main process
  useEffect(() => {
    if (!window.api?.localServer) return
    const model = selectedModels[selectedProvider] ?? ''
    window.api.localServer.syncConfig({ provider: selectedProvider, model, ttsMode, ttsVoice })
    flushPersistedStore()
  }, [selectedProvider, selectedModels, ttsMode, ttsVoice])

  // Flush on visibility/blur
  useEffect(() => {
    const flush = () => flushPersistedStore()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('blur', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  // Cmd+K / Ctrl+K — global command palette
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        closeSettings()
        closeResponsiveNavigation()
        setCmdPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [closeSettings])

  // Custom event from Sidebar search button
  useEffect(() => {
    const handle = () => {
      closeSettings()
      closeResponsiveNavigation()
      setCmdPaletteOpen(true)
    }
    window.addEventListener('viezan:open-command-palette', handle)
    return () => window.removeEventListener('viezan:open-command-palette', handle)
  }, [closeSettings])

  // Blocking overlays stay mutually exclusive.
  useEffect(() => {
    if (settingsOpen) setCmdPaletteOpen(false)
  }, [settingsOpen])

  // Quick chat forwarding
  useEffect(() => {
    if (!window.api?.quickChat) return
    const unsubSettings = window.api.quickChat.onOpenSettings(() => openSettings())
    const unsubChat = window.api.quickChat.onOpenInChat((payload: QuickChatSeedPayload | null) => {
      if (!payload) { setActivePage('chat'); return }
      const provider = payload.provider as Provider
      const sessionId = createChatSession(provider, payload.model)
      setActiveChatSession(sessionId)
      const seededAt = Date.now()
      payload.history?.forEach((turn, index) => {
        addChatMessage(sessionId, {
          id: `msg-${seededAt}-quick-h${index}`,
          role: turn.role,
          content: [{ type: 'text', text: turn.text }],
          timestamp: seededAt,
        })
      })
      if (payload.response) {
        addChatMessage(sessionId, {
          id: `msg-${Date.now()}-quick-u`,
          role: 'user',
          content: [{ type: 'text', text: payload.question }],
          timestamp: Date.now(),
        })
        addChatMessage(sessionId, {
          id: `msg-${Date.now()}-quick-a`,
          role: 'assistant',
          content: [{ type: 'text', text: payload.response }],
          timestamp: Date.now(),
        })
      } else {
        setChatSessionDraft(sessionId, payload.question)
      }
      setActivePage('chat')
    })
    const unsubFeature = window.api.quickChat.onOpenFeature?.((payload: LauncherFeatureRequest) => {
      if (payload.feature === 'translate' && payload.text) setSourceText(payload.text)
      if (payload.feature === 'dictionary' && payload.text) setPendingDictionaryTerm(payload.text)
      setActivePage(payload.feature)
    })
    const unsubUsage = window.api.quickChat.onUsage?.((cost: UsageCost) => recordUsageCost(cost))
    return () => { unsubSettings(); unsubChat(); unsubFeature?.(); unsubUsage?.() }
  }, [openSettings, setActivePage, createChatSession, setActiveChatSession, addChatMessage, setChatSessionDraft, setSourceText, setPendingDictionaryTerm, recordUsageCost])

  // Check API keys in keychain on startup
  useEffect(() => {
    const checkKeys = async () => {
      if (!window.api) return
      for (const provider of PROVIDERS) {
        try {
          const result = await window.api.keychain.hasKey(provider.id)
          setKeyStatus(provider.id as Provider, result.exists)
        } catch {
          // ignore
        }
      }
    }
    checkKeys()
  }, [setKeyStatus])

  const isMac = window.api?.platform === 'darwin'
  const isWin = window.api?.platform === 'win32'
  const hasAppTitlebar = isMac || isWin
  const fallbackFeatureLabel = activePage === 'live'
    ? t.nav_live_translate
    : activePage === 'dictionary'
      ? t.dictionary_title
      : activePage === 'chat'
        ? t.nav_chat
        : t.nav_translate

  const renderShell = (contextSidebar?: ReactNode, featureHeader?: ReactNode) => (
    <AppShell
      showTitlebar={hasAppTitlebar}
      macWindowControls={isMac}
      headerControls={<div className="app-header-navigation titlebar-no-drag" ref={setNavigationToggleHost} />}
      useNativeMaterial={
        (isMac && (theme === 'system' || THEME_PRESET_TRAITS[themePreset].nativeMaterial))
        || (isWin && THEME_PRESET_TRAITS[themePreset].nativeMaterial)
      }
      primaryNavigation={<PrimaryNavigationSidebar toggleHost={navigationToggleHost} />}
      contextSidebar={contextSidebar}
      featureHeader={featureHeader}
      overlays={
        <>
          <SettingsModal />
          <UpdateNotification blocked={settingsOpen || cmdPaletteOpen} />
          <LauncherShortcutNotice />
          <LauncherSpotlightPrompt blocked={settingsOpen || cmdPaletteOpen} />
          <CommandPalette
            open={cmdPaletteOpen && !settingsOpen}
            onClose={() => setCmdPaletteOpen(false)}
          />
          <NotificationViewport />
        </>
      }
    >
      <Suspense
        fallback={(
          <PageFallback
            page={activePage}
            label={t.route_loading(fallbackFeatureLabel)}
          />
        )}
      >
        {activePage === 'translate' ? (
          <TranslatePage />
        ) : activePage === 'live' ? (
          <LiveTranslatePage />
        ) : activePage === 'chat' ? (
          <ChatPage />
        ) : (
          <DictionaryPage />
        )}
      </Suspense>
    </AppShell>
  )

  return activePage === 'chat'
    ? <AIChatSidebar>{({ sidebar, header }) => renderShell(sidebar, header)}</AIChatSidebar>
    : renderShell()
}

export default App
