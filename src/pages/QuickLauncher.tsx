import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LauncherApp, LauncherIcon, LauncherResult } from '../../shared/launcher'
import { AIChatPopup, type QuickChatLaunchRequest } from '../components/AIChatPopup'
import { Button } from '../components/ui/atoms'
import { GearIcon, MonitorIcon, SearchIcon, SparklesIcon, XIcon } from '../components/ui/icons'
import { FilterInput } from '../components/ui/molecules'
import { useAppStore, useT } from '../store/useAppStore'

type Command = 'ai' | 'web' | 'chat' | 'settings'
type Result = { id: string; label: string; kind: 'app' | Command }
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase()

export function QuickLauncher() {
  const t = useT()
  const [mode, setMode] = useState<'search' | 'chat'>('search')
  const [query, setQuery] = useState('')
  const [chatRequest, setChatRequest] = useState<QuickChatLaunchRequest>()
  const [apps, setApps] = useState<LauncherApp[]>([])
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
  const search = query.trim()
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
        setCatalogError(!result?.success)
      } catch {
        if (!cancelled) { setApps([]); setCatalogError(true) }
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

  const results = useMemo<Result[]>(() => {
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
    const commands: Result[] = [
      { id: 'ai', label: t.launcher_ai, kind: 'ai' },
      { id: 'chat', label: t.ai_chat_popup_open_in_chat, kind: 'chat' },
      { id: 'settings', label: t.chat_error_open_settings, kind: 'settings' },
    ]
    const rank = (name: string) => {
      const value = normalize(name).trim()
      if (value === needle) return 0
      if (compactNeedle.length >= 2 && aliases(name).includes(compactNeedle)) return 1
      if (value.startsWith(needle)) return 2
      if (compactNeedle.length >= 2 && aliases(name).some(alias => alias.startsWith(compactNeedle))) return 3
      if (value.split(/[\s._-]+/).some(word => word.startsWith(needle))) return 4
      return 5
    }
    const matchedApps = apps.filter(app => matches(app.name)
      || (compactNeedle.length >= 2 && aliases(app.name).some(alias => alias.startsWith(compactNeedle))))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
      .slice(0, 8).map(app => ({ id: app.id, label: app.name, kind: 'app' as const }))
    if (!search) return [...commands, ...matchedApps]
    return [
      ...matchedApps,
      ...commands.filter(command => command.kind !== 'ai' && matches(command.label)),
      { id: 'ai', label: t.launcher_ai, kind: 'ai' },
      { id: 'web', label: t.launcher_web, kind: 'web' },
    ]
  }, [apps, search, t])
  const activeIndex = Math.min(selected, results.length - 1)
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

  useEffect(() => {
    document.getElementById(`launcher-result-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  const execute = useCallback(async (result: Result) => {
    if (busyRef.current) return
    if (result.kind === 'ai') {
      setChatRequest(previous => ({ id: (previous?.id ?? 0) + 1, text: search }))
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
      }
      setError(!outcome?.success)
    } catch {
      setError(true)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [search])

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

  return (
    <>
      {mode === 'search' && (
        <main className="launcher-shell">
          <section className="launcher-panel" aria-label={t.launcher_title}>
            <header className="launcher-heading titlebar-drag">
              <span>{t.launcher_title}</span>
              <Button size="sm" shape="icon" appearance="ghost" className="titlebar-no-drag"
                aria-label={t.ai_chat_popup_close} onClick={() => window.api?.quickChat?.hide()}>
                <XIcon />
              </Button>
            </header>
            <div className="launcher-search">
              <FilterInput ref={inputRef} value={query} maxLength={500}
                onValueChange={value => { setQuery(value); setSelected(0); setError(false) }}
                placeholder={t.launcher_placeholder} aria-label={t.launcher_placeholder}
                clearLabel={t.chat_clear} role="combobox" aria-expanded="true"
                aria-controls="launcher-results" aria-autocomplete="list"
                aria-activedescendant={`launcher-result-${activeIndex}`}
                onKeyDown={event => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) return
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    const direction = event.key === 'ArrowDown' ? 1 : -1
                    setSelected((activeIndex + direction + results.length) % results.length)
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    // Changing mode can mount Quick Chat's window shortcuts
                    // during this event; do not let the same key open full Chat.
                    event.stopPropagation()
                    const result = event.metaKey || event.ctrlKey
                      ? results.find(item => item.kind === 'ai') : results[activeIndex]
                    if (result) void execute(result)
                  }
                }} />
            </div>
            <div className="launcher-results" id="launcher-results" role="listbox" aria-label={t.launcher_results} aria-busy={busy}>
              {results.map((result, index) => (
                <Button key={result.id} id={`launcher-result-${index}`} role="option"
                  aria-label={`${result.label} ${result.kind === 'app' ? t.launcher_app : t.launcher_command}`}
                  aria-selected={index === activeIndex} tabIndex={-1} disabled={busy}
                  size="lg" shape="rect" variant={index === activeIndex ? 'primary' : 'neutral'}
                  appearance={index === activeIndex ? 'soft' : 'ghost'} className="launcher-result"
                  onMouseEnter={() => setSelected(index)} onMouseDown={event => event.preventDefault()}
                  onClick={() => void execute(result)}>
                  {result.kind === 'app' && icons[result.id]
                    ? <img className="launcher-app-icon" src={icons[result.id]} alt="" draggable={false}
                        onError={() => {
                          const next = { ...iconsRef.current }
                          delete next[result.id]
                          iconsRef.current = next
                          setIcons(next)
                        }} />
                    : result.kind === 'ai' || result.kind === 'chat' ? <SparklesIcon /> :
                    result.kind === 'settings' ? <GearIcon /> : result.kind === 'web' ? <SearchIcon /> : <MonitorIcon />}
                  <span className="launcher-result-name">{result.label}</span>
                  <span className="launcher-result-kind">{result.kind === 'app' ? t.launcher_app : t.launcher_command}</span>
                </Button>
              ))}
            </div>
            {loading && <p className="launcher-notice" role="status">{t.launcher_loading}</p>}
            {catalogError && (
              <div className="launcher-notice" role="status">
                <span>{t.launcher_apps_unavailable}</span>
                <Button size="sm" appearance="ghost" onClick={() => setRevision(value => value + 1)}>{t.launcher_retry}</Button>
              </div>
            )}
            {error && <p className="launcher-notice ui-error-text" role="alert">{t.launcher_open_failed}</p>}
            <footer className="launcher-footer">
              <span>↑ ↓ {t.launcher_select}</span>
              <span>↵ {t.launcher_open}</span>
              <span>{window.api?.platform === 'darwin' ? '⌘' : 'Ctrl'} ↵ {t.launcher_ai}</span>
              <span>Esc {t.ai_chat_popup_close}</span>
            </footer>
          </section>
        </main>
      )}
      <AIChatPopup active={mode === 'chat'} launchRequest={chatRequest} onBack={back} />
    </>
  )
}
