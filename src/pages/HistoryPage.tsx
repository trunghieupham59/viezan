import { useState } from 'react'
import { HistoryNavigation } from '../components/organisms'
import { ChatBubbleIcon, type ClockIcon, MicrophoneIcon, TranslateIcon } from '../components/ui/icons'
import { useAppStore, useT } from '../store/useAppStore'
import { tpl } from '../utils/tpl'
import { ChatHistoryTab } from './history/ChatHistoryTab'
import { LiveHistoryTab } from './history/LiveHistoryTab'
import { TranslationHistoryTab } from './history/TranslationHistoryTab'

type HistoryTabId = 'translate' | 'chat' | 'live'

// ─── Main HistoryPage ──────────────────────────────────────────────────────────
export function HistoryPage() {
  const { history, chatSessions, liveSessions } = useAppStore()
  const t = useT()
  const [activeTab, setActiveTab] = useState<HistoryTabId>('chat')
  const [query, setQuery] = useState('')
  const totalCount = history.length + chatSessions.length + liveSessions.length

  const tabs = ([
    { id: 'chat', label: t.history_tab_chat, count: chatSessions.length, icon: ChatBubbleIcon },
    { id: 'translate', label: t.history_tab_translate, count: history.length, icon: TranslateIcon },
    { id: 'live', label: t.history_tab_live, count: liveSessions.length, icon: MicrophoneIcon },
  ] satisfies Array<{ id: HistoryTabId; label: string; count: number; icon: typeof ClockIcon }>)

  return (
    <div className="app-page">
      <div className="app-workspace">
        <section className="glass-panel flex-1 min-h-0 flex flex-col">

          <HistoryNavigation
            tabs={tabs.map(({ icon, ...tab }) => ({ ...tab, Icon: icon }))}
            activeId={activeTab}
            query={query}
            label={t.history_title}
            title={t.history_title}
            subtitle={tpl(t.history_total_count, { n: totalCount })}
            searchPlaceholder={t.history_search_placeholder}
            clearSearchLabel={t.history_search_clear}
            onTabChange={setActiveTab}
            onQueryChange={setQuery}
          />

          {/* Content */}
          <div className="flex flex-1 min-h-0 flex-col">
            {activeTab === 'translate' && <TranslationHistoryTab query={query} />}
            {activeTab === 'chat' && <ChatHistoryTab query={query} />}
            {activeTab === 'live' && <LiveHistoryTab query={query} />}
          </div>

        </section>
      </div>
    </div>
  )
}
