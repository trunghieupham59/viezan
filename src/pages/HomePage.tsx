import { type ReactNode, useMemo } from 'react'
import { HomeSystemCard, ShortcutOverview } from '../components/organisms'
import { PageHeader } from '../components/templates'
import { Button } from '../components/ui/atoms'
import { BookIcon, ChatBubbleIcon, MicrophoneIcon, PlusIcon, TelescopeIcon, TranslateIcon } from '../components/ui/icons'
import { ActivityRow, PromptCard, type PromptCardTone, SectionCard, StatusChip } from '../components/ui/molecules'
import { PROVIDERS } from '../constants/providers'
import type { Translations } from '../i18n'
import { getModule } from '../modules/catalog'
import { useAppStore, useT } from '../store/useAppStore'
import type { PageModuleId } from '../types'
import { type HomeActivity, recentActivity } from '../utils/homeActivity'
import { formatTimeAgo } from '../utils/relativeTime'
import '../styles/home.css'

const QUICK_START: readonly { id: PageModuleId; tone: PromptCardTone }[] = [
  { id: 'chat', tone: 'blue' },
  { id: 'translate', tone: 'violet' },
  { id: 'live', tone: 'green' },
  { id: 'dictionary', tone: 'orange' },
]

const PREVIEW_CHARS = 80

function text(t: Translations, key: keyof Translations): string {
  const value = t[key]
  return typeof value === 'string' ? value : String(key)
}

function preview(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat
}

function pair(source: string, target: string): string {
  return `${source.toUpperCase()} → ${target.toUpperCase()}`
}

/**
 * The default page: start a feature, pick up recent work, and glance at the
 * machine, the AI model and the shortcuts. Reads only what the store and the
 * existing read-only hooks already hold; nothing here starts a model or a scan.
 */
export function HomePage() {
  const t = useT()
  const enabledModules = useAppStore((state) => state.enabledModules)
  const chatSessions = useAppStore((state) => state.chatSessions)
  const history = useAppStore((state) => state.history)
  const liveSessions = useAppStore((state) => state.liveSessions)
  const dictionaryEntries = useAppStore((state) => state.dictionaryEntries)
  const selectedProvider = useAppStore((state) => state.selectedProvider)
  const selectedModels = useAppStore((state) => state.selectedModels)
  const keyStatus = useAppStore((state) => state.keyStatus)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const setActiveChatSession = useAppStore((state) => state.setActiveChatSession)
  const reuseTranslationHistory = useAppStore((state) => state.reuseTranslationHistory)
  const setViewingLiveSession = useAppStore((state) => state.setViewingLiveSession)
  const clearTranslation = useAppStore((state) => state.clearTranslation)
  const openSettingsAt = useAppStore((state) => state.openSettingsAt)

  const chatOn = enabledModules.chat !== false
  const activity = useMemo(
    () => recentActivity({ chatSessions, history, liveSessions, dictionaryEntries, enabled: enabledModules }),
    [chatSessions, history, liveSessions, dictionaryEntries, enabledModules],
  )

  const startFeature = (id: PageModuleId) => {
    if (id === 'chat') setActiveChatSession(null)
    if (getModule(id).navigateEffect === 'clearTranslation') clearTranslation()
    setActivePage(id)
  }

  const open = (item: HomeActivity) => {
    switch (item.kind) {
      case 'research':
      case 'chat':
        setActiveChatSession(item.session.id)
        setActivePage('chat')
        return
      case 'translate':
        reuseTranslationHistory(item.item)
        setActivePage('translate')
        return
      case 'live':
        setViewingLiveSession(item.session.id)
        setActivePage('live')
        return
      case 'dictionary':
        // The dictionary opens on its newest entry, which is this one.
        setActivePage('dictionary')
    }
  }

  const row = (item: HomeActivity): { icon: ReactNode; kind: string; title: string; meta?: string } => {
    switch (item.kind) {
      case 'research':
        return { icon: <TelescopeIcon />, kind: t.home_kind_research, title: item.session.title }
      case 'chat':
        return { icon: <ChatBubbleIcon />, kind: t.home_kind_chat, title: item.session.title }
      case 'translate':
        return { icon: <TranslateIcon />, kind: t.home_kind_translate, title: preview(item.item.sourceText), meta: pair(item.item.sourceLang, item.item.targetLang) }
      case 'live':
        return {
          icon: <MicrophoneIcon />,
          kind: t.home_kind_live,
          title: preview(item.session.translation || item.session.rawTranscript) || t.home_live_untitled,
          meta: item.session.summary ? t.home_live_with_summary : pair(item.session.sourceLang, item.session.targetLang),
        }
      case 'dictionary':
        return { icon: <BookIcon />, kind: t.home_kind_dictionary, title: item.entry.term, meta: pair(item.entry.sourceLang, item.entry.targetLang) }
    }
  }

  const quickStart = QUICK_START.filter(({ id }) => enabledModules[id] !== false)
  const provider = PROVIDERS.find((entry) => entry.id === selectedProvider)
  const modelId = selectedModels[selectedProvider] ?? ''
  const modelName = provider?.models.find((model) => model.id === modelId)?.name ?? modelId
  const isLocal = selectedProvider === 'local'
  const hasKey = isLocal || Boolean(keyStatus[selectedProvider])

  return (
    <div className="app-page relative">
      <div className="app-workspace">
        <div className="glass-panel flex-1 min-h-0 flex flex-col overflow-hidden">
          <PageHeader
            title={t.nav_home}
            description={t.home_subtitle}
            actions={chatOn && (
              <Button size="sm" shape="pill" variant="primary" appearance="solid" onClick={() => startFeature('chat')}>
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                {t.home_new_chat}
              </Button>
            )}
          />
          <div className="home-body">
            <div className="home-grid">
              <div className="home-main">
                {quickStart.length > 0 && (
                  <section className="home-quick-start" aria-labelledby="home-quick-start-title">
                    <h2 id="home-quick-start-title" className="home-section-title">{t.home_quick_start}</h2>
                    <div className="home-quick-start__cards">
                      {quickStart.map(({ id, tone }) => {
                        const module = getModule(id)
                        const Icon = module.icon
                        return (
                          <PromptCard
                            key={id}
                            tone={tone}
                            icon={<Icon />}
                            title={text(t, module.labelKey)}
                            description={text(t, module.descriptionKey)}
                            onClick={() => startFeature(id)}
                          />
                        )
                      })}
                    </div>
                  </section>
                )}
                <SectionCard title={t.home_resume_title} description={t.home_resume_description}>
                  {activity.length === 0 ? (
                    <p className="home-card-note">{t.home_resume_empty}</p>
                  ) : (
                    <ul className="home-activity">
                      {activity.map((item) => {
                        const content = row(item)
                        return (
                          <li key={`${item.kind}:${item.at}`}>
                            <ActivityRow
                              {...content}
                              timeLabel={formatTimeAgo(item.at, t)}
                              actionLabel={item.kind === 'research' ? t.home_resume_action : undefined}
                              onOpen={() => open(item)}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </SectionCard>
              </div>
              <div className="home-side">
                {enabledModules.thermal !== false && <HomeSystemCard onOpen={() => setActivePage('thermal')} />}
                <SectionCard title={t.home_ai_title} actionLabel={t.home_ai_manage} onAction={() => openSettingsAt('api')}>
                  <div className="home-ai">
                    <span className="home-ai__model">
                      <span className="home-ai__provider">{provider?.name ?? selectedProvider}</span>
                      <span className="home-ai__id">{modelName}</span>
                    </span>
                    <StatusChip tone={hasKey ? 'ok' : 'warning'}>{hasKey ? t.home_ai_ready : t.home_ai_missing_key}</StatusChip>
                  </div>
                  {isLocal && <p className="home-card-note">{t.home_ai_local}</p>}
                </SectionCard>
                <SectionCard title={t.home_shortcuts_title} actionLabel={t.home_edit} onAction={() => setActivePage('utilities')}>
                  <ShortcutOverview only={['launcher', 'quickTranslate', 'commandPalette']} />
                </SectionCard>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
