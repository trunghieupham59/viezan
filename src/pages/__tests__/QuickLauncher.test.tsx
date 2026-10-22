import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LauncherIcon } from '../../../shared/launcher'
import { clearQuickAiAnswerCache } from '../../components/AIChatPopup'
import { useAppStore } from '../../store/useAppStore'
import { QuickLauncher } from '../QuickLauncher'

let show: (() => void) | undefined
let receiveIcons: ((icons: LauncherIcon[]) => void) | undefined
const unsubscribeIcons = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  useAppStore.persist.clearStorage()
  useAppStore.setState({
    locale: 'en', selectedProvider: 'local', chatSendShortcut: 'enter',
    selectedModels: { local: 'local-auto', gemini: '', openai: '', claude: '' },
    keyStatus: { local: true, gemini: false, openai: false, claude: false },
  })
  vi.mocked(window.api.quickChat.onShow).mockImplementation(callback => { show = callback; return () => {} })
  vi.mocked(window.api.quickChat.launcher.onIcons).mockImplementation(callback => { receiveIcons = callback; return unsubscribeIcons })
  vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({
    success: true, apps: [{ id: 'editor', name: 'Editor' }, { id: 'calc', name: 'Calculator' }, { id: 'vi', name: 'Từ điển' }],
  })
  vi.mocked(window.api.quickChat.launcher.openApp).mockResolvedValue({ success: true })
  vi.mocked(window.api.quickChat.launcher.searchWeb).mockResolvedValue({ success: true })
  vi.mocked(window.api.quickChat.launcher.getIcons).mockResolvedValue({ success: true, icons: [] })
  vi.mocked(window.api.quickChat.launcher.convertCurrency).mockImplementation(async ({ amount, from, to }) => {
    const rates: Record<string, number> = { USD: 1, VND: 25_000, JPY: 150, EUR: 0.9 }
    if (!rates[from] || !rates[to]) return { success: false, errorCode: 'NOT_FOUND' }
    const rate = rates[to] / rates[from]
    return { success: true, conversion: { amount, from, to, rate, converted: amount * rate, rateUpdatedAt: Date.UTC(2026, 9, 22, 12) } }
  })
  vi.mocked(window.api.quickChat.launcher.getCurrencyTarget).mockResolvedValue({ success: true, code: null })
  vi.mocked(window.api.quickChat.launcher.setCurrencyTarget).mockResolvedValue({ success: true })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
  vi.mocked(window.api.quickChat.session.get).mockResolvedValue({ success: true, session: null })
  vi.mocked(window.api.quickChat.session.save).mockClear()
  vi.mocked(window.api.quickChat.session.clear).mockClear()
  vi.mocked(window.api.chatStream).mockResolvedValue({ success: true, reply: 'A saved answer' })
  clearQuickAiAnswerCache()
})

describe('QuickLauncher', () => {
  it('offers Viezan commands before typing, grouped app results while typing, and resets on reopen', async () => {
    render(<QuickLauncher />)
    const input = screen.getByRole('combobox')
    await act(async () => {})
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Viezan' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Recent' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('option').map(element => element.getAttribute('aria-label')))
      .toEqual(['Translate Command', 'Look up in Dictionary Command', 'AI Interpret Command', 'Open in Chat Command', 'Open Settings Command'])
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute('aria-label', 'Translate Command')
    expect(window.api.quickChat.setLayout).toHaveBeenLastCalledWith('expanded', expect.any(Number))
    expect(window.api.quickChat.setLayout).not.toHaveBeenCalledWith('compact')
    fireEvent.change(input, { target: { value: 'Editor' } })
    expect(screen.getByRole('group', { name: 'Applications' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Use "Editor" with…' })).toBeInTheDocument()
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Editor')
    expect(screen.getByRole('option', { name: 'Ask AI Command' })).toHaveTextContent('Editor')
    expect(screen.getByRole('option', { name: 'Search Google Command' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute('aria-label', 'Translate Command')
    fireEvent.change(input, { target: { value: 'Calculator' } })
    act(() => show?.())
    expect(input).toHaveValue('')
    expect(screen.getByRole('group', { name: 'Viezan' })).toBeInTheDocument()
    expect(window.api.chatStream).not.toHaveBeenCalled()
    expect(window.api.quickChat.launcher.openApp).not.toHaveBeenCalled()
  })

  it('re-reports the content height on every reopen, even when nothing changed', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    expect(window.api.quickChat.setLayout).toHaveBeenLastCalledWith('expanded', expect.any(Number))
    const calls = vi.mocked(window.api.quickChat.setLayout).mock.calls
    const firstHeight = calls[calls.length - 1]?.[1]
    vi.mocked(window.api.quickChat.setLayout).mockClear()
    // The main process shows the window at its previous size and asks the
    // renderer to reset; identical rows must still produce a height report.
    act(() => show?.())
    expect(window.api.quickChat.setLayout).toHaveBeenCalledWith('expanded', firstHeight)
    expect(window.api.quickChat.setLayout).not.toHaveBeenCalledWith('compact')
  })

  it('lists recently opened apps first and opens the selected one with Enter', async () => {
    vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({
      success: true, recent: ['calc', 'missing'], apps: [{ id: 'editor', name: 'Editor' }, { id: 'calc', name: 'Calculator' }],
    })
    render(<QuickLauncher />)
    await act(async () => {})
    expect(screen.getByRole('group', { name: 'Recent' })).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-label', 'Calculator Application')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveTextContent('C')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Calculator')
    expect(screen.queryByRole('option', { name: 'Editor Application' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.launcher.openApp).toHaveBeenCalledWith('calc'))
  })

  it('offers to continue a fresh Quick AI session first and files an old one under Recent', async () => {
    const turns = [{ role: 'user' as const, text: 'What is Vite?' }, { role: 'assistant' as const, text: 'A build tool.' }]
    vi.mocked(window.api.quickChat.session.get).mockResolvedValue({ success: true, session: { id: 'quick-ai-1', turns, updatedAt: Date.now() - 60_000 } })
    const { unmount } = render(<QuickLauncher />)
    await act(async () => {})
    const fresh = screen.getAllByRole('option')[0]
    expect(fresh).toHaveAttribute('aria-label', 'Continue Quick AI Command')
    expect(fresh).toHaveTextContent('What is Vite?')
    expect(screen.getByRole('group', { name: 'Viezan' })).toContainElement(fresh)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'more' } })
    expect(screen.getByRole('option', { name: 'Ask AI (follow-up) Command' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Continue Quick AI Command' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('option', { name: 'Continue Quick AI Command' }))
    expect(await screen.findByText('A build tool.')).toBeInTheDocument()
    expect(window.api.chatStream).not.toHaveBeenCalled()
    unmount()

    vi.mocked(window.api.quickChat.session.get).mockResolvedValue({ success: true, session: { id: 'quick-ai-1', turns, updatedAt: Date.now() - 45 * 60_000 } })
    render(<QuickLauncher />)
    await act(async () => {})
    const stale = screen.getByRole('option', { name: 'Continue Quick AI Command' })
    expect(screen.getByRole('group', { name: 'Recent' })).toContainElement(stale)
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-label', 'Continue Quick AI Command')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'more' } })
    expect(screen.getByRole('option', { name: 'Ask AI Command' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Tab' })
    expect(await screen.findByText('A saved answer')).toBeInTheDocument()
    expect(screen.queryByText('A build tool.')).not.toBeInTheDocument()
    expect(vi.mocked(window.api.chatStream).mock.calls[0][0].messages).toHaveLength(1)
  })

  it('sends a Tab follow-up inside a fresh session and drops the Continue entry after Cmd+N', async () => {
    const turns = [{ role: 'user' as const, text: 'What is Vite?' }, { role: 'assistant' as const, text: 'A build tool.' }]
    vi.mocked(window.api.quickChat.session.get).mockResolvedValue({ success: true, session: { id: 'quick-ai-1', turns, updatedAt: Date.now() } })
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'And Rollup?' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Tab' })
    expect(await screen.findByText('A saved answer')).toBeInTheDocument()
    expect(screen.getByText('A build tool.')).toBeInTheDocument()
    expect(vi.mocked(window.api.chatStream).mock.calls[0][0].messages.map(message => message.content[0].text))
      .toEqual(['What is Vite?', 'A build tool.', 'And Rollup?'])
    await waitFor(() => expect(window.api.quickChat.session.save).toHaveBeenCalledOnce())
    expect(vi.mocked(window.api.quickChat.session.save).mock.calls[0][0]).toMatchObject({ id: 'quick-ai-1' })

    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.queryByRole('option', { name: 'Continue Quick AI Command' })).not.toBeInTheDocument()
    expect(window.api.quickChat.session.clear).toHaveBeenCalledOnce()
  })

  it('hands the typed text to Quick AI with Tab', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    const search = screen.getByRole('combobox')
    fireEvent.change(search, { target: { value: 'Explain caching' } })
    fireEvent.keyDown(search, { key: 'Tab' })
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    expect(await screen.findByText('A saved answer')).toBeInTheDocument()
    expect(vi.mocked(window.api.chatStream).mock.calls[0][0].messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Explain caching' }] },
    ])
  })

  it('opens Translate and Dictionary with the query, and AI Interpret without one', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('option', { name: 'AI Interpret Command' }))
    await waitFor(() => expect(window.api.quickChat.openFeature).toHaveBeenCalledWith({ feature: 'live' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: ' hello world ' } })
    fireEvent.click(screen.getByRole('option', { name: 'Translate Command' }))
    await waitFor(() => expect(window.api.quickChat.openFeature).toHaveBeenCalledWith({ feature: 'translate', text: 'hello world' }))
    fireEvent.click(screen.getByRole('option', { name: 'Look up in Dictionary Command' }))
    await waitFor(() => expect(window.api.quickChat.openFeature).toHaveBeenCalledWith({ feature: 'dictionary', text: 'hello world' }))
    expect(window.api.chatStream).not.toHaveBeenCalled()
  })

  it.each(['Claude', 'Google Chrome', 'Visual Studio Code'])('renders cached %s icons with the first search result without another icon request', async name => {
    vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({
      success: true, apps: [{ id: 'cached', name, iconDataUrl: 'data:image/png;base64,cached' }],
    })
    render(<QuickLauncher />)
    await waitFor(() => expect(window.api.quickChat.launcher.listApps).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: name } })
    expect(screen.getByRole('option', { selected: true }).querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,cached')
    expect(window.api.quickChat.launcher.getIcons).not.toHaveBeenCalled()
    act(() => show?.())
    await waitFor(() => expect(screen.queryByText('Loading applications…')).not.toBeInTheDocument())
    expect(screen.queryByRole('option', { name: `${name} Application` })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: name } })
    expect(screen.getByRole('option', { name: `${name} Application` }).querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,cached')
    expect(window.api.quickChat.launcher.getIcons).not.toHaveBeenCalled()
  })

  it('receives preloaded icons for offscreen apps before searching and unsubscribes on unmount', async () => {
    vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({
      success: true, apps: [
        ...Array.from({ length: 10 }, (_, index) => ({ id: `app-${index}`, name: `App ${index}` })),
        { id: 'code', name: 'Visual Studio Code' },
      ],
    })
    const { unmount } = render(<QuickLauncher />)
    await act(async () => {})
    act(() => receiveIcons?.([{ id: 'code', dataUrl: 'data:image/png;base64,prefetched' }]))
    vi.mocked(window.api.quickChat.launcher.getIcons).mockClear()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vs code' } })
    expect(screen.getByRole('option', { selected: true }).querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,prefetched')
    expect(window.api.quickChat.launcher.getIcons).not.toHaveBeenCalled()
    unmount()
    expect(unsubscribeIcons).toHaveBeenCalledOnce()
  })

  it.each(['vs code', 'vscode', 'vsc'])('finds Visual Studio Code using %s and keeps the base app ahead of Insiders', async query => {
    vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({ success: true, apps: [
      { id: 'insiders', name: 'Visual Studio Code Insiders' }, { id: 'code', name: 'Visual Studio Code' },
    ] })
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: query } })
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Visual Studio CodeApplication')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.launcher.openApp).toHaveBeenCalledWith('code'))
  })

  it.each(['Ghi chú', 'ghi chu', 'notes', 'Notes'])('finds a localized app by its display name or bundle alias using %s', async query => {
    vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({ success: true, apps: [
      { id: 'linked', name: 'LinkedNotesUIService' }, { id: 'notes', name: 'Ghi chú', aliases: ['Notes'] },
    ] })
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: query } })
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Ghi chúApplication')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.launcher.openApp).toHaveBeenCalledWith('notes'))
  })

  it('ranks exact names before prefixes, word matches and substrings, independently of catalog order', async () => {
    vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({ success: true, apps: [
      { id: 'dev', name: 'Claude Dev' }, { id: 'exact', name: 'Claude' }, { id: 'word', name: 'My Claude' },
      { id: 'inside', name: 'SuperClaude' }, { id: 'code', name: 'Claude Code' },
    ] })
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'CLAUDE' } })
    expect(screen.getAllByRole('option').slice(0, 5).map(element => element.getAttribute('aria-label')))
      .toEqual(['Claude Application', 'Claude Code Application', 'Claude Dev Application', 'My Claude Application', 'SuperClaude Application'])
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.launcher.openApp).toHaveBeenCalledWith('exact'))
  })

  it('loads real icons separately and retains a usable fallback when an image cannot render', async () => {
    vi.mocked(window.api.quickChat.launcher.getIcons).mockResolvedValue({
      success: true, icons: [{ id: 'editor', dataUrl: 'data:image/png;base64,test' }],
    })
    const { container } = render(<QuickLauncher />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Editor' } })
    await act(async () => {})
    await waitFor(() => expect(container.querySelector('.launcher-app-icon')).toHaveAttribute('src', 'data:image/png;base64,test'))
    fireEvent.error(container.querySelector('.launcher-app-icon') as HTMLImageElement)
    expect(container.querySelector('.launcher-app-icon')).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: 'Editor Application' }))
    await waitFor(() => expect(window.api.quickChat.launcher.openApp).toHaveBeenCalledWith('editor'))
  })

  it('filters apps without accents, selects with arrows and opens the catalog ID', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    const input = screen.getByRole('combobox')
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'tu dien' } })
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Từ điển')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Ask AI')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.launcher.openApp).toHaveBeenCalledWith('vi'))
    expect(window.api.chatStream).not.toHaveBeenCalled()
  })

  it('carries a query into existing quick chat and preserves the answer across returning to search', async () => {
    vi.mocked(window.api.chatStream).mockResolvedValue({ success: true, reply: 'A saved answer' })
    render(<QuickLauncher />)
    const search = screen.getByRole('combobox')
    fireEvent.change(search, { target: { value: 'Explain this' } })
    fireEvent.keyDown(search, { key: 'Enter', metaKey: true })
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).toHaveFocus())
    expect(input).toHaveValue('')
    expect(await screen.findByText('A saved answer')).toBeInTheDocument()
    expect(window.api.chatStream).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByRole('combobox')).toHaveFocus()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', metaKey: true })
    expect(screen.getByText('A saved answer')).toBeInTheDocument()
    expect(window.api.chatStream).toHaveBeenCalledOnce()
  })

  it.each(['click', 'enter'])('sends Ask AI immediately once via %s, including in Strict Mode', async action => {
    render(<StrictMode><QuickLauncher /></StrictMode>)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '  Explain caching  ' } })
    if (action === 'click') fireEvent.click(screen.getByRole('option', { name: 'Ask AI Command' }))
    else fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(await screen.findByText('A saved answer')).toBeInTheDocument()
    expect(window.api.chatStream).toHaveBeenCalledOnce()
    expect(vi.mocked(window.api.chatStream).mock.calls[0][0].messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Explain caching' }] },
    ])
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(window.api.chatStream).toHaveBeenCalledOnce()
  })

  it('keeps the explicit AI shortcut available without a query', async () => {
    render(<QuickLauncher />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(window.api.chatStream).not.toHaveBeenCalled()
  })

  it.each([{ ctrlKey: true }, { metaKey: true }])('consumes the launcher AI shortcut before it reaches window chat shortcuts: %j', async modifier => {
    render(<QuickLauncher />)
    const search = screen.getByRole('combobox')
    fireEvent.change(search, { target: { value: 'Keep this in Quick AI' } })
    const outerShortcut = vi.fn()
    window.addEventListener('keydown', outerShortcut)
    try {
      fireEvent.keyDown(search, { key: 'Enter', ...modifier })
      expect(screen.getByRole('textbox')).toHaveValue('')
      expect(outerShortcut).not.toHaveBeenCalled()
      expect(window.api.quickChat.openInChat).not.toHaveBeenCalled()
      expect(window.api.quickChat.hide).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', outerShortcut)
    }
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    expect(window.api.chatStream).toHaveBeenCalledOnce()
  })

  it('does not execute during IME composition and requires an explicit web action', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: '日本語 & query' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(window.api.quickChat.launcher.searchWeb).not.toHaveBeenCalled()
    expect(window.api.chatStream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('option', { name: 'Search Google Command' }))
    await waitFor(() => expect(window.api.quickChat.launcher.searchWeb).toHaveBeenCalledWith('日本語 & query'))
  })

  it('clears the query before dismissing and restores search on global shortcut reopen', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Editor' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(window.api.quickChat.hide).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(window.api.quickChat.hide).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', ctrlKey: true })
    act(() => show?.())
    expect(screen.getByRole('combobox')).toHaveFocus()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading applications…')).not.toBeInTheDocument()
  })

  it('reports a catalog failure while retaining commands and retries', async () => {
    vi.mocked(window.api.quickChat.launcher.listApps).mockRejectedValue(new Error('unavailable'))
    render(<QuickLauncher />)
    expect(await screen.findByText(/Applications are unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Translate Command' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Editor' } })
    expect(screen.getByRole('option', { name: 'Ask AI Command' })).toBeInTheDocument()
    vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({ success: true, apps: [{ id: 'editor', name: 'Editor' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('option', { name: 'Editor Application' })).toBeInTheDocument()
    expect(screen.queryByText(/Applications are unavailable/)).not.toBeInTheDocument()
  })

  it('shows launch failures and does not double-launch while waiting', async () => {
    let resolve: (value: { success: boolean }) => void = () => {}
    vi.mocked(window.api.quickChat.launcher.openApp).mockReturnValue(new Promise(done => { resolve = done }))
    render(<QuickLauncher />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Editor' } })
    const app = await screen.findByRole('option', { name: 'Editor Application' })
    fireEvent.click(app)
    fireEvent.click(app)
    expect(window.api.quickChat.launcher.openApp).toHaveBeenCalledOnce()
    await act(async () => resolve({ success: false }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not open this item')
  })

  it('answers arithmetic at the top, copies the result with Enter and keeps the other sections', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1 + 1' } })
    const groups = screen.getAllByRole('group').map(group => group.getAttribute('aria-label'))
    expect(groups).toEqual(['Calculator', 'Use "1 + 1" with…'])
    const option = screen.getByRole('option', { name: '1 + 1 = 2 Calculator' })
    expect(option).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Copy')
    expect(screen.getByRole('option', { name: 'Ask AI Command' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('2'))
    expect(window.api.quickChat.hide).toHaveBeenCalledOnce()
    expect(window.api.quickChat.launcher.convertCurrency).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '15% of 80' } })
    expect(screen.getByRole('option', { name: '15% of 80 = 12 Calculator' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2*(3+4)' } })
    expect(screen.getByRole('option', { name: '2*(3+4) = 14 Calculator' })).toBeInTheDocument()
  })

  it('converts "2$" into the UI language currency, with the rate date, and copies the amount', async () => {
    useAppStore.setState({ locale: 'vi' })
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2$' } })
    expect(screen.getByRole('option', { name: '2 USD → VND Tiền tệ' })).toHaveTextContent('Đang tải tỷ giá…')
    const row = await screen.findByRole('option', { name: '2 USD = 50.000 VND Tiền tệ' })
    expect(row).toHaveAttribute('aria-selected', 'true')
    expect(row).toHaveTextContent('1 USD = 25.000 VND · Tỷ giá ngày 22/10/2026')
    expect(window.api.quickChat.launcher.convertCurrency).toHaveBeenLastCalledWith({ amount: 2, from: 'USD', to: 'VND' })
    expect(screen.getByRole('group', { name: 'Tiền tệ' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Dùng "2$" với…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đổi sang: VND' })).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '20$' } })
    // The confirmed rate answers immediately; the round trip only confirms it.
    expect(screen.getByRole('option', { name: '20 USD = 500.000 VND Tiền tệ' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('500.000'))
    expect(window.api.quickChat.hide).toHaveBeenCalledOnce()
  })

  it('changes the target currency from the pull-down, remembers it, and lets the query override it', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '300 yen' } })
    await screen.findByRole('option', { name: '300 JPY = 2.00 USD Currency' })
    fireEvent.click(screen.getByRole('button', { name: 'Convert to: USD' }))
    fireEvent.mouseMove(screen.getByRole('option', { name: /^EUR/ }), { clientX: 40, clientY: 90 })
    fireEvent.click(screen.getByRole('option', { name: /^EUR/ }))
    await screen.findByRole('option', { name: '300 JPY = 1.80 EUR Currency' })
    expect(window.api.quickChat.launcher.setCurrencyTarget).toHaveBeenCalledExactlyOnceWith('EUR')
    expect(useAppStore.getState().launcherCurrency).toBe('EUR')
    expect(screen.getByRole('button', { name: 'Convert to: EUR' })).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus())
    expect(screen.getByRole('option', { name: '300 JPY = 1.80 EUR Currency' })).toHaveAttribute('aria-selected', 'true')
    // A replayed pointer event at the resting position must not steal the selection; real movement may.
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Ask AI Command' }))
    fireEvent.mouseMove(screen.getByRole('option', { name: 'Ask AI Command' }), { clientX: 40, clientY: 90 })
    expect(screen.getByRole('option', { name: '300 JPY = 1.80 EUR Currency' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.mouseMove(screen.getByRole('option', { name: 'Ask AI Command' }), { clientX: 41, clientY: 95 })
    expect(screen.getByRole('option', { name: 'Ask AI Command' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2 usd to vnd' } })
    await screen.findByRole('option', { name: '2 USD = 50,000 VND Currency' })
    expect(screen.getByRole('button', { name: 'Convert to: VND' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2 usd' } })
    await screen.findByRole('option', { name: '2 USD = 1.80 EUR Currency' })
    // Typing the remembered currency itself falls back to the UI-language default.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '9 eur' } })
    await screen.findByRole('option', { name: '9 EUR = 10.00 USD Currency' })
    expect(screen.getByRole('button', { name: 'Convert to: USD' })).toBeEnabled()
  })

  it('loads the remembered target from the main process and explains missing rates', async () => {
    vi.mocked(window.api.quickChat.launcher.getCurrencyTarget).mockResolvedValue({ success: true, code: 'JPY' })
    vi.mocked(window.api.quickChat.launcher.convertCurrency).mockResolvedValue({ success: false, errorCode: 'UNAVAILABLE' })
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50€' } })
    const row = await screen.findByRole('option', { name: '50 EUR → JPY Currency' })
    await waitFor(() => expect(row).toHaveTextContent('Exchange rates are unavailable offline'))
    expect(window.api.quickChat.launcher.convertCurrency).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.launcher.convertCurrency).toHaveBeenCalledTimes(2))
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    expect(window.api.quickChat.hide).not.toHaveBeenCalled()
  })

  it('adds no calculator or currency rows for ordinary queries', async () => {
    render(<QuickLauncher />)
    await act(async () => {})
    for (const query of ['Editor', '2025-10-11', 'thông tư 25', '2', '1password']) {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: query } })
      expect(screen.queryByRole('group', { name: 'Calculator' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Currency' })).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Ask AI Command' })).toBeInTheDocument()
    }
    expect(window.api.quickChat.launcher.convertCurrency).not.toHaveBeenCalled()
  })

  it('lists indexed files under Applications after a typing pause, opens with Enter and reveals with Shift+Enter', async () => {
    const files = [
      { id: 'f'.repeat(64), name: 'Quarterly report.pdf', folder: '~/Documents', kind: 'file' as const, iconDataUrl: 'data:image/png;base64,pdf' },
      { id: 'd'.repeat(64), name: 'Reports', folder: '~/Documents/Work', kind: 'folder' as const },
    ]
    vi.mocked(window.api.quickChat.launcher.searchFiles).mockResolvedValue({ success: true, files })
    vi.mocked(window.api.quickChat.launcher.listApps).mockResolvedValue({ success: true, apps: [{ id: 'editor', name: 'Report Editor' }] })
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'r' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'report' } })
    const file = await screen.findByRole('option', { name: 'Quarterly report.pdf File' })
    expect(window.api.quickChat.launcher.searchFiles).toHaveBeenCalledExactlyOnceWith('report')
    expect(screen.getAllByRole('group').map(group => group.getAttribute('aria-label'))).toEqual(['Applications', 'Files', 'Use "report" with…'])
    expect(file).toHaveTextContent('~/Documents')
    expect(file.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,pdf')
    expect(screen.getByRole('option', { name: 'Reports Folder' })).toHaveTextContent('~/Documents/Work')
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute('aria-label', 'Report Editor Application')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Show in folder')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', shiftKey: true })
    await waitFor(() => expect(window.api.quickChat.launcher.revealFile).toHaveBeenCalledWith('f'.repeat(64)))
    expect(window.api.quickChat.launcher.openFile).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.launcher.openFile).toHaveBeenCalledWith('d'.repeat(64)))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(screen.queryByRole('group', { name: 'Files' })).not.toBeInTheDocument()
  })

  it('ignores a late answer to an earlier file query and skips the index for calculations', async () => {
    let resolveFirst: (value: { success: boolean; files: typeof first }) => void = () => {}
    const first = [{ id: 'a'.repeat(64), name: 'old-notes.txt', folder: '~', kind: 'file' as const }]
    vi.mocked(window.api.quickChat.launcher.searchFiles)
      .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ success: true, files: [{ id: 'b'.repeat(64), name: 'new-notes.txt', folder: '~', kind: 'file' as const }] })
    render(<QuickLauncher />)
    await act(async () => {})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old' } })
    await waitFor(() => expect(window.api.quickChat.launcher.searchFiles).toHaveBeenCalledWith('old'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'new' } })
    await screen.findByRole('option', { name: 'new-notes.txt File' })
    await act(async () => resolveFirst({ success: true, files: first }))
    expect(screen.queryByRole('option', { name: 'old-notes.txt File' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'new-notes.txt File' })).toBeInTheDocument()
    vi.mocked(window.api.quickChat.launcher.searchFiles).mockClear()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2 + 2' } })
    await screen.findByRole('option', { name: '2 + 2 = 4 Calculator' })
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(window.api.quickChat.launcher.searchFiles).not.toHaveBeenCalled()
  })
})
