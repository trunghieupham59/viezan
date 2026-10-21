import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LauncherIcon } from '../../../shared/launcher'
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
  vi.mocked(window.api.chatStream).mockResolvedValue({ success: true, reply: 'A saved answer' })
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
})
