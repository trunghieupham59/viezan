import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LauncherApp, LauncherIcon, LauncherResult } from '../../shared/launcher'
import type { QuickAiSession } from '../../shared/quickAi'
import { AIChatPopup, type QuickChatLaunchRequest } from '../components/AIChatPopup'
import { Button, KeyCap } from '../components/ui/atoms'
import {
  BookIcon,
  ChatBubbleIcon,
  GearIcon,
  MicrophoneIcon,
  SearchIcon,
  SparklesIcon,
  TranslateIcon,
} from '../components/ui/icons'
import { FilterInput, LauncherIconTile, type LauncherIconTone, LauncherResultRow } from '../components/ui/molecules'
import { useAppStore, useT } from '../store/useAppStore'
import { tpl } from '../utils/tpl'

type Command = 'ai' | 'continue' | 'web' | 'chat' | 'settings' | 'translate' | 'dictionary' | 'live'
type Result = { id: string; label: string; kind: 'app' | Command; detail?: string }
type Section = { id: 'recent' | 'apps' | 'viezan' | 'use'; title: string; items: Result[] }

const MAX_APP_RESULTS = 8
const MAX_RECENT_RESULTS = 5
/** A Quick AI conversation this recent is offered first and receives follow-ups. */
const QUICK_AI_FRESH_MS = 30 * 60 * 1000
const LETTER_TONES: LauncherIconTone[] = ['blue', 'violet', 'green', 'orange']
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase()

/** Stable colour per app name so the letter fallback never flickers between renders. */
function letterTone(name: string): LauncherIconTone {
  let hash = 0
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003
  return LETTER_TONES[hash % LETTER_TONES.length]
}

function commandIcon(kind: Command): ReactNode {
  switch (kind) {
    case 'ai': case 'chat': return <SparklesIcon />
    case 'continue': return <ChatBubbleIcon />
    case 'translate': return <TranslateIcon />
    case 'dictionary': return <BookIcon />
    case 'live': return <MicrophoneIcon />
    case 'settings': return <GearIcon />
    case 'web': return <SearchIcon />
  }
}

export function QuickLauncher() {
  const t = useT()
  const [mode, setMode] = useState<'search' | 'chat'>('search')
  const [query, setQuery] = useState('')
  const [chatRequest, setChatRequest] = useState<QuickChatLaunchRequest>()
  const [apps, setApps] = useState<LauncherApp[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [session, setSession] = useState<QuickAiSession | null>(null)
  const [icons, setIcons] = useState<Record<string, string>>({})
  const iconsRef = useRef<Record<string, string>>({})
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const panelRef = useRef<HTMLElement>(null)
  const search = query.trim()
  const sessionFresh = Boolean(session && Date.now() - session.updatedAt < QUICK_AI_FRESH_MS)
  const primaryModifierKey = window.api?.platform === 'darwin' ? '⌘' : 'Ctrl'

  // The window is sized by the main process; report the natural content height
  // so the popup grows with the rows instead of leaving an empty canvas. Every
  // show re-reports it: the content is often identical to the previous open,
  // and a height that is only sent on change would leave the window compact.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on each show (revision).
  useLayoutEffect(() => {
    if (mode === 'chat') {
      void window.api?.quickChat?.setLayout('expanded')
      return
    }
    const panel = panelRef.current
    const list = panel?.querySelector<HTMLElement>('.launcher-results')
    const rows = panel?.querySelector<HTMLElement>('.launcher-result-list')
    if (!panel || !list || !rows) return
    let previousHeight: number | undefined
    const resize = () => {
      let height = panel.offsetHeight - panel.clientHeight
      for (const child of Array.from(panel.children)) {
        if (child === list) {
          const style = getComputedStyle(list)
          // Measure the natural rows, not the scroller's current allocated height.
          height += rows.getBoundingClientRect().height + list.offsetHeight - list.clientHeight
            + (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
        } else height += child.getBoundingClientRect().height
      }
      height = Math.ceil(height)
      if (height === previousHeight) return
      previousHeight = height
      void window.api?.quickChat?.setLayout('expanded', height)
    }
    resize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(resize)
    observer.observe(panel)
    observer.observe(rows)
    for (const child of Array.from(panel.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [mode, revision])
  const mergeIcons = useCallback((updates: LauncherIcon[]) => {
    if (!updates.length) return
    iconsRef.current = { ...iconsRef.current, ...Object.fromEntries(updates.map(icon => [icon.id, icon.dataUrl])) }
    setIcons(iconsRef.current)
  }, [])

  useEffect(() => window.api?.quickChat?.launcher?.onIcons(mergeIcons), [mergeIcons])

  const back = useCallback(() => {
    setMode('search')
    setError(false)
  }, [])
  const show = useCallback(() => {
    useAppStore.persist?.rehydrate?.()
    setMode('search')
    setQuery('')
    setSelected(0)
    setError(false)
    setRevision(value => value + 1)
  }, [])

  useEffect(() => {
    document.documentElement.classList.add('quick-chat-window')
    show()
    const unsubscribe = window.api?.quickChat?.onShow(show)
    return () => {
      unsubscribe?.()
      document.documentElement.classList.remove('quick-chat-window')
    }
  }, [show])

  // biome-ignore lint/correctness/useExhaustiveDependencies: each show/retry refreshes the OS catalog.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCatalogError(false)
    const load = async () => {
      try {
        const result = await window.api?.quickChat?.launcher?.listApps()
        if (cancelled) return
        if (result?.success) {
          mergeIcons(result.apps.flatMap(app => app.iconDataUrl ? [{ id: app.id, dataUrl: app.iconDataUrl }] : []))
        }
        setApps(result?.success ? result.apps : [])
        setRecent(result?.success ? result.recent ?? [] : [])
        setCatalogError(!result?.success)
      } catch {
        if (!cancelled) { setApps([]); setRecent([]); setCatalogError(true) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [revision, mergeIcons])

  // biome-ignore lint/correctness/useExhaustiveDependencies: repeated shows must restore keyboard focus.
  useEffect(() => {
    if (mode === 'search') inputRef.current?.focus()
  }, [mode, revision])

  // biome-ignore lint/correctness/useExhaustiveDependencies: each show re-reads the persisted Quick AI session.
  useEffect(() => {
    let cancelled = false
    void window.api?.quickChat?.session?.get().then(result => {
      if (!cancelled && result?.success) setSession(result.session)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [revision])

  const sections = useMemo<Section[]>(() => {
    const toResult = (app: LauncherApp): Result => ({ id: app.id, label: app.name, kind: 'app' })
    const viezanCommands: Result[] = [
      { id: 'translate', label: t.launcher_translate, kind: 'translate' },
      { id: 'dictionary', label: t.launcher_dictionary, kind: 'dictionary' },
      { id: 'live', label: t.launcher_live, kind: 'live' },
      { id: 'chat', label: t.ai_chat_popup_open_in_chat, kind: 'chat' },
      { id: 'settings', label: t.chat_error_open_settings, kind: 'settings' },
    ]
    const userTurns = session?.turns.filter(turn => turn.role === 'user') ?? []
    const lastQuestion = userTurns[userTurns.length - 1]?.text
    const continueItem: Result | null = lastQuestion
      ? { id: 'continue', label: t.launcher_continue, kind: 'continue', detail: lastQuestion }
      : null
    if (!search) {
      const byId = new Map(apps.map(app => [app.id, app]))
      const recentApps = recent.flatMap(id => { const app = byId.get(id); return app ? [toResult(app)] : [] })
        .slice(0, MAX_RECENT_RESULTS)
      // A fresh conversation leads the Viezan group; an older one waits under Recent.
      const recentItems = [...recentApps, ...(continueItem && !sessionFresh ? [continueItem] : [])]
      return [
        ...(recentItems.length ? [{ id: 'recent' as const, title: t.launcher_section_recent, items: recentItems }] : []),
        { id: 'viezan', title: t.launcher_section_viezan, items: [...(continueItem && sessionFresh ? [continueItem] : []), ...viezanCommands] },
      ]
    }
    const needle = normalize(search)
    const compactNeedle = needle.replace(/\s+/g, '')
    const tokens = needle.split(/\s+/)
    const matches = (label: string) => tokens.every(token => normalize(label).includes(token))
    // Initials of leading words also match common short names: Visual Studio
    // Code -> "vs code", "vscode", "vsc"; keep the actual app label unchanged.
    const aliases = (name: string) => {
      const words = normalize(name).split(/[\s._-]+/).filter(Boolean)
      return words.slice(1).map((_, index) => {
        const count = index + 2
        return words.slice(0, count).map(word => word[0]).join('') + words.slice(count).join('')
      })
    }
    const rank = (name: string) => {
      const value = normalize(name).trim()
      if (value === needle) return 0
      if (compactNeedle.length >= 2 && aliases(name).includes(compactNeedle)) return 1
      if (value.startsWith(needle)) return 2
      if (compactNeedle.length >= 2 && aliases(name).some(alias => alias.startsWith(compactNeedle))) return 3
      if (value.split(/[\s._-]+/).some(word => word.startsWith(needle))) return 4
      return 5
    }
    // A localized display name ("Ghi chú") and its bundle name ("Notes") both find the app.
    const labels = (app: LauncherApp) => [app.name, ...(app.aliases ?? [])]
    const matchesApp = (label: string) => matches(label)
      || (compactNeedle.length >= 2 && aliases(label).some(alias => alias.startsWith(compactNeedle)))
    const rankApp = (app: LauncherApp) => Math.min(...labels(app).map(rank))
    const matchedApps = apps.filter(app => labels(app).some(matchesApp))
      .sort((a, b) => rankApp(a) - rankApp(b) || a.name.localeCompare(b.name))
      .slice(0, MAX_APP_RESULTS).map(toResult)
    // Text commands always appear under "Use with…"; only navigation commands are searched by name.
    const matchedCommands = viezanCommands.filter(command =>
      !['translate', 'dictionary'].includes(command.kind) && matches(command.label))
    const useWith: Result[] = [
      { id: 'ai', label: sessionFresh ? t.launcher_ai_followup : t.launcher_ai, kind: 'ai', detail: search },
      { id: 'translate', label: t.launcher_translate, kind: 'translate', detail: search },
      { id: 'dictionary', label: t.launcher_dictionary, kind: 'dictionary', detail: search },
      { id: 'web', label: t.launcher_web, kind: 'web', detail: search },
    ]
    return [
      ...(matchedApps.length ? [{ id: 'apps' as const, title: t.launcher_section_apps, items: matchedApps }] : []),
      ...(matchedCommands.length ? [{ id: 'viezan' as const, title: t.launcher_section_viezan, items: matchedCommands }] : []),
      { id: 'use', title: tpl(t.launcher_section_use_with, { query: search }), items: useWith },
    ]
  }, [apps, recent, search, session, sessionFresh, t])
  const results = useMemo(() => sections.flatMap(section => section.items), [sections])
  const activeIndex = Math.min(selected, results.length - 1)
  const activeResult = results[activeIndex]
  const visibleAppIds = results.filter(result => result.kind === 'app').map(result => result.id).join(',')

  // Startup prefetch and disk-cache hits already populate icons before typing.
  // Only prioritize still-missing visible icons; never delay the search itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reopening retries missing icons.
  useEffect(() => {
    if (mode !== 'search' || !visibleAppIds) return
    const missing = visibleAppIds.split(',').filter(id => !iconsRef.current[id])
    if (!missing.length) return
    let cancelled = false
    void window.api?.quickChat?.launcher?.getIcons(missing).then(result => {
      if (!cancelled && result.success) mergeIcons(result.icons)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [visibleAppIds, mode, revision, mergeIcons])

  useLayoutEffect(() => {
    const list = document.getElementById('launcher-results')
    const item = document.getElementById(`launcher-result-${activeIndex}`)
    // The native resize is asynchronous. Never scroll a zero-height list or
    // let scrollIntoView move the document while it still has compact bounds.
    if (!list || !item || list.clientHeight < item.offsetHeight) return
    const row = item.getBoundingClientRect()
    const viewport = list.getBoundingClientRect()
    if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top
    else if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom
  }, [activeIndex])

  const execute = useCallback(async (result: Result) => {
    if (busyRef.current) return
    if (result.kind === 'ai' || result.kind === 'continue') {
      // Follow-ups join a fresh conversation; "Continue" resumes it at any age.
      const resumed = result.kind === 'continue' || sessionFresh ? session : null
      setChatRequest(previous => ({ id: (previous?.id ?? 0) + 1, text: result.kind === 'continue' ? '' : search, session: resumed }))
      setMode('chat')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(false)
    try {
      let outcome: LauncherResult | undefined
      switch (result.kind) {
        case 'app': outcome = await window.api?.quickChat?.launcher?.openApp(result.id); break
        case 'web': outcome = await window.api?.quickChat?.launcher?.searchWeb(search); break
        case 'chat': outcome = await window.api?.quickChat?.openInChat(); break
        case 'settings': outcome = await window.api?.quickChat?.openSettings(); break
        case 'translate':
        case 'dictionary':
          outcome = await window.api?.quickChat?.openFeature({ feature: result.kind, ...(search ? { text: search } : {}) })
          break
        case 'live': outcome = await window.api?.quickChat?.openFeature({ feature: 'live' }); break
      }
      setError(!outcome?.success)
    } catch {
      setError(true)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [search, session, sessionFresh])
  const askAI = useCallback(() => execute({ id: 'ai', label: t.launcher_ai, kind: 'ai' }), [execute, t.launcher_ai])

  useEffect(() => {
    if (mode !== 'search') return
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (query) { setQuery(''); setSelected(0) }
        else void window.api?.quickChat?.hide()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [mode, query])

  const renderIcon = (result: Result) => {
    if (result.kind !== 'app') return <LauncherIconTile>{commandIcon(result.kind)}</LauncherIconTile>
    const icon = icons[result.id]
    if (icon) {
      return (
        <LauncherIconTile tone="app">
          <img className="launcher-app-icon" src={icon} alt="" draggable={false}
            onError={() => {
              const next = { ...iconsRef.current }
              delete next[result.id]
              iconsRef.current = next
              setIcons(next)
            }} />
        </LauncherIconTile>
      )
    }
    return <LauncherIconTile tone={letterTone(result.label)}>{result.label.trim().charAt(0).toLocaleUpperCase()}</LauncherIconTile>
  }
  const kindLabel = (result: Result) => result.kind === 'app' ? t.launcher_app : t.launcher_command

  let flatIndex = 0
  return (
    <>
      {mode === 'search' && (
        <main className="launcher-shell">
          <section ref={panelRef} className="launcher-panel" aria-label={t.launcher_title}>
            <div className="launcher-search titlebar-drag">
              <FilterInput ref={inputRef} value={query} maxLength={500} bare size="lg" wrapperClassName="titlebar-no-drag"
                onValueChange={value => { setQuery(value); setSelected(0); setError(false) }}
                placeholder={t.launcher_placeholder} aria-label={t.launcher_placeholder}
                clearLabel={t.chat_clear} role="combobox" aria-expanded="true"
                aria-controls="launcher-results" aria-autocomplete="list"
                aria-activedescendant={activeResult ? `launcher-result-${activeIndex}` : undefined}
                trailing={<><span>{t.launcher_ai_hint}</span><KeyCap>Tab</KeyCap></>}
                onKeyDown={event => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) return
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    if (!results.length) return
                    const direction = event.key === 'ArrowDown' ? 1 : -1
                    setSelected((activeIndex + direction + results.length) % results.length)
                  } else if (event.key === 'Tab' && !event.shiftKey) {
                    // Raycast-style: Tab hands the current text to Quick AI.
                    event.preventDefault()
                    event.stopPropagation()
                    void askAI()
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    // Changing mode can mount Quick Chat's window shortcuts
                    // during this event; do not let the same key open full Chat.
                    event.stopPropagation()
                    if (event.metaKey || event.ctrlKey) void askAI()
                    else if (activeResult) void execute(activeResult)
                  }
                }} />
            </div>
            <div className="launcher-results" id="launcher-results" role="listbox" aria-label={t.launcher_results} aria-busy={busy}>
              <div className="launcher-result-list">
                {sections.map(section => (
                  // biome-ignore lint/a11y/useSemanticElements: ARIA listbox option groups are not form fieldsets.
                  <div key={section.id} role="group" aria-label={section.title}>
                    <p className="launcher-section-title" aria-hidden="true">{section.title}</p>
                    {section.items.map(result => {
                      const index = flatIndex++
                      return (
                        <LauncherResultRow key={`${section.id}:${result.id}`} id={`launcher-result-${index}`}
                          icon={renderIcon(result)} label={result.label} detail={result.detail}
                          kindLabel={kindLabel(result)} selected={index === activeIndex} disabled={busy}
                          onSelect={() => setSelected(index)} onActivate={() => void execute(result)} />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
            {loading && !apps.length && <p className="launcher-notice" role="status">{t.launcher_loading}</p>}
            {catalogError && (
              <div className="launcher-notice" role="status">
                <span>{t.launcher_apps_unavailable}</span>
                <Button size="sm" appearance="ghost" onClick={() => setRevision(value => value + 1)}>{t.launcher_retry}</Button>
              </div>
            )}
            {error && <p className="launcher-notice ui-error-text" role="alert">{t.launcher_open_failed}</p>}
            <footer className="launcher-footer">
              <div className="launcher-footer-context">
                {activeResult && (
                  <>
                    {renderIcon(activeResult)}
                    <span className="launcher-footer-label">{activeResult.label}</span>
                  </>
                )}
              </div>
              <div className="launcher-footer-actions">
                <span className="launcher-footer-action">
                  <span>{activeResult?.kind === 'ai' ? activeResult.label : t.launcher_open}</span>
                  <KeyCap>↵</KeyCap>
                </span>
                <span className="launcher-footer-divider" aria-hidden="true" />
                <span className="launcher-footer-action">
                  <span>{t.launcher_ai}</span>
                  <KeyCap>{primaryModifierKey}</KeyCap>
                  <KeyCap>↵</KeyCap>
                </span>
              </div>
            </footer>
          </section>
        </main>
      )}
      <AIChatPopup active={mode === 'chat'} launchRequest={chatRequest} onBack={back} onSessionChange={setSession} />
    </>
  )
}
