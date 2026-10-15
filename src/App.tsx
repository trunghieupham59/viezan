import { lazy, Suspense, useEffect, useState } from 'react'
import { AIChatSidebar, CommandPalette, PrimaryNavigationSidebar, UpdateNotification } from './components/organisms'
import { SettingsModal } from './components/SettingsModal'
import { AppShell } from './components/templates'
import { FeatureLoadingState } from './components/ui/molecules'
import { PROVIDERS } from './constants/providers'
import { flushPersistedStore, useAppStore, useT } from './store/useAppStore'
import type { AppPage, Provider, QuickChatSeedPayload } from './types'
import { detectSystemLocale } from './utils/locale'

const TranslatePage = lazy(() => import('./pages/TranslatePage').then(m => ({ default: m.TranslatePage })))
const LiveTranslatePage = lazy(() => import('./pages/LiveTranslatePage').then(m => ({ default: m.LiveTranslatePage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })))
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
  if (page === 'history') return <FeatureLoadingState label={label} layout="list" />
  return <div className="app-page" aria-hidden="true" />
}

function App() {
  const t = useT()
  const {
    activePage, localeAuto, setKeyStatus, setLocaleFromSystem, fontSize, theme,
    selectedProvider, selectedModels, ttsMode, ttsVoice,
    createChatSession, setActiveChatSession, addChatMessage,
    setActivePage, settingsOpen, openSettings, closeSettings,
  } = useAppStore()

  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)

  // Apply dark class based on user preference or OS preference
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
      return
    }
    if (theme === 'light') {
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
  }, [theme])

  // Keep the native window chrome (Windows caption buttons, startup colour)
  // in step with the in-app theme choice, not just the OS preference.
  useEffect(() => {
    void window.api?.setWindowTheme?.(theme)
  }, [theme])

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
      addChatMessage(sessionId, {
        id: `msg-${Date.now()}-quick-u`,
        role: 'user',
        content: [{ type: 'text', text: payload.question }],
        timestamp: Date.now(),
      })
      if (payload.response) {
        addChatMessage(sessionId, {
          id: `msg-${Date.now()}-quick-a`,
          role: 'assistant',
          content: [{ type: 'text', text: payload.response }],
          timestamp: Date.now(),
        })
      }
      setActivePage('chat')
    })
    return () => { unsubSettings(); unsubChat() }
  }, [openSettings, setActivePage, createChatSession, setActiveChatSession, addChatMessage])

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
  const hasAppTitlebar = isMac || window.api?.platform === 'win32'
  const fallbackFeatureLabel = activePage === 'live'
    ? t.nav_live_translate
    : activePage === 'dictionary'
      ? t.dictionary_title
      : activePage === 'history'
        ? t.history_title
        : activePage === 'chat'
          ? t.nav_chat
          : t.nav_translate

  return (
    <AppShell
      showTitlebar={hasAppTitlebar}
      useNativeMaterial={isMac && theme === 'system'}
      primaryNavigation={<PrimaryNavigationSidebar />}
      contextSidebar={activePage === 'chat' ? <AIChatSidebar /> : undefined}
      overlays={
        <>
          <SettingsModal />
          <UpdateNotification blocked={settingsOpen || cmdPaletteOpen} />
          <CommandPalette
            open={cmdPaletteOpen && !settingsOpen}
            onClose={() => setCmdPaletteOpen(false)}
          />
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
        ) : activePage === 'dictionary' ? (
          <DictionaryPage />
        ) : (
          <HistoryPage />
        )}
      </Suspense>
    </AppShell>
  )
}

export default App
