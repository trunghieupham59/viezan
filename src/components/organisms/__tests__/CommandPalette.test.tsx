import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { smartThinkingService } from '../../../services/smartThinkingService'
import { useAppStore } from '../../../store/useAppStore'
import { CommandPalette } from '../CommandPalette'

function CommandPaletteHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open palette</button>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  )
}

describe('CommandPalette', () => {
  beforeEach(() => {
    act(() => {
      useAppStore.setState({
        activePage: 'dictionary',
        locale: 'en',
        settingsOpen: false,
        selectedProvider: 'local',
        selectedModels: { ...useAppStore.getState().selectedModels, local: 'local-auto' },
        chatSessions: [],
        activeChatSessionId: null,
        pendingDictionaryTerm: null,
        sourceText: 'Text to clear',
        translatedText: 'Translated text to clear',
      })
    })
  })

  it('renders as an accessible modal, filters commands, and shows an empty state', async () => {
    render(<CommandPalette open onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    const search = within(dialog).getByRole('combobox', { name: 'Search commands, calculate, or ask AI…' })
    await waitFor(() => expect(search).toHaveFocus())

    // Translate, Chat, Interpret, Dictionary and Settings: History is no longer a screen.
    expect(within(dialog).getAllByRole('option')).toHaveLength(5)
    expect(search).toHaveAttribute('aria-activedescendant')

    fireEvent.change(search, { target: { value: 'dictionary' } })
    expect(within(dialog).getAllByRole('option')).toHaveLength(2)
    expect(within(dialog).getByRole('option', { name: /Dictionary/ })).toHaveAttribute(
      'data-command-id',
      'dictionary',
    )
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'command that does not exist' } })
    const options = within(dialog).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveAttribute('data-command-id', 'ask')
    expect(within(dialog).getByRole('status')).toHaveTextContent('No matching commands')
  })

  it('navigates with the keyboard and ignores Enter while an IME composition is active', () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Enter', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
    expect(useAppStore.getState().activePage).toBe('dictionary')

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /AI Translate/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(useAppStore.getState().activePage).toBe('translate')
    expect(useAppStore.getState().sourceText).toBe('')
    expect(useAppStore.getState().translatedText).toBe('')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('matches Vietnamese commands without diacritics', () => {
    act(() => useAppStore.setState({ locale: 'vi' }))
    render(<CommandPalette open onClose={vi.fn()} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Tìm lệnh, tính toán hoặc hỏi AI…' }), {
      target: { value: 'cai dat' },
    })

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAttribute('data-command-id', 'settings')
    expect(options[1]).toHaveAttribute('data-command-id', 'ask')
  })

  it('traps focus and restores it to the opener after Escape', async () => {
    render(<CommandPaletteHarness />)

    const opener = screen.getByRole('button', { name: 'Open palette' })
    opener.focus()
    fireEvent.click(opener)

    const search = await screen.findByRole('combobox', { name: 'Search commands, calculate, or ask AI…' })
    await waitFor(() => expect(search).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Tab' })
    expect(search).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  describe('inline answers', () => {
    const chatStream = () => window.api.chatStream as unknown as Mock

    beforeEach(() => {
      chatStream().mockReset()
      chatStream().mockResolvedValue({ success: false })
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      })
    })

    it('evaluates arithmetic locally, highlights the result first and copies it on Enter', () => {
      const onClose = vi.fn()
      render(<CommandPalette open onClose={onClose} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: '25 + 25 =?' } })

      const options = screen.getAllByRole('option')
      expect(options[0]).toHaveAttribute('data-command-kind', 'calc')
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      expect(options[0]).toHaveAccessibleName(/= 50/)
      expect(options[options.length - 1]).toHaveAttribute('data-command-id', 'ask')

      fireEvent.keyDown(window, { key: 'Enter' })
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('50')
      expect(onClose).toHaveBeenCalledOnce()
      expect(chatStream()).not.toHaveBeenCalled()
      expect(useAppStore.getState().activePage).toBe('dictionary')
    })

    it('uses the app locale for calculator numbers', () => {
      act(() => useAppStore.setState({ locale: 'vi' }))
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: '1,5 x 1000' } })
      expect(screen.getAllByRole('option')[0]).toHaveAccessibleName(/= 1\.500/)
    })

    it('does not call the AI until the user asks, then shows the answer inside the palette', async () => {
      chatStream().mockResolvedValueOnce({ success: true, reply: 'Hà Nội' })
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Thủ đô của Việt Nam?' } })
      expect(chatStream()).not.toHaveBeenCalled()

      expect(screen.getByRole('option', { name: /Ask AI/ })).toHaveAttribute('aria-selected', 'true')
      fireEvent.keyDown(window, { key: 'Enter' })

      expect(await screen.findByText('Hà Nội')).toBeInTheDocument()
      expect(chatStream()).toHaveBeenCalledOnce()
      expect(chatStream().mock.calls[0][0]).toMatchObject({
        provider: 'local',
        model: 'local-auto',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Thủ đô của Việt Nam?' }] }],
      })
      expect(screen.getByText('AI answers can be wrong. Verify important information.')).toBeInTheDocument()
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('goes back to the list on Escape and only closes on the second Escape', async () => {
      chatStream().mockResolvedValueOnce({ success: true, reply: 'Hà Nội' })
      const onClose = vi.fn()
      render(<CommandPalette open onClose={onClose} />)

      const search = screen.getByRole('combobox')
      fireEvent.change(search, { target: { value: 'Thủ đô của Việt Nam?' } })
      fireEvent.keyDown(window, { key: 'Enter' })
      await screen.findByText('Hà Nội')

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(search).toHaveValue('Thủ đô của Việt Nam?')

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('continues the answered question in AI Chat with Ctrl+Enter', async () => {
      chatStream().mockResolvedValueOnce({ success: true, reply: 'Hà Nội' })
      const onClose = vi.fn()
      render(<CommandPalette open onClose={onClose} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Thủ đô của Việt Nam?' } })
      fireEvent.keyDown(window, { key: 'Enter' })
      await screen.findByText('Hà Nội')

      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

      const state = useAppStore.getState()
      expect(state.activePage).toBe('chat')
      expect(state.chatSessions).toHaveLength(1)
      expect(state.activeChatSessionId).toBe(state.chatSessions[0].id)
      expect(state.chatSessions[0].messages.map(message => [message.role, message.content[0]])).toEqual([
        ['user', { type: 'text', text: 'Thủ đô của Việt Nam?' }],
        ['assistant', { type: 'text', text: 'Hà Nội' }],
      ])
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('does not open Chat before an answer exists', () => {
      chatStream().mockReturnValueOnce(new Promise(() => {}))
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Thủ đô của Việt Nam?' } })
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(screen.getByRole('status')).toHaveTextContent('Thinking…')

      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
      expect(useAppStore.getState().chatSessions).toHaveLength(0)
      expect(useAppStore.getState().activePage).toBe('dictionary')
    })

    it('shows a localized error when the provider fails', async () => {
      chatStream().mockResolvedValueOnce({ success: false, error: 'boom', errorCode: 'RATE_LIMIT' })
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Thủ đô của Việt Nam?' } })
      fireEvent.keyDown(window, { key: 'Enter' })

      expect(await screen.findByRole('alert')).toHaveTextContent('Rate limit exceeded. Please wait and try again.')
      expect(screen.getByRole('button', { name: /Open in Chat/ })).toBeDisabled()
    })

    it('explains the missing API key instead of calling the provider', () => {
      act(() => useAppStore.setState({
        selectedProvider: 'openai',
        keyStatus: { ...useAppStore.getState().keyStatus, openai: false },
      }))
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Thủ đô của Việt Nam?' } })
      fireEvent.keyDown(window, { key: 'Enter' })

      expect(screen.getByRole('alert')).toHaveTextContent('No API key configured')
      expect(chatStream()).not.toHaveBeenCalled()
    })

    it('abandons an in-flight answer when the query changes', async () => {
      let resolveStream: (value: unknown) => void = () => {}
      chatStream().mockReturnValueOnce(new Promise((resolve) => { resolveStream = resolve }))
      render(<CommandPalette open onClose={vi.fn()} />)

      const search = screen.getByRole('combobox')
      fireEvent.change(search, { target: { value: 'Thủ đô của Việt Nam?' } })
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(screen.getByRole('status')).toHaveTextContent('Thinking…')

      fireEvent.change(search, { target: { value: 'Thủ đô của Nhật Bản?' } })
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await act(async () => { resolveStream({ success: true, reply: 'stale reply' }) })
      expect(screen.queryByText('stale reply')).not.toBeInTheDocument()
    })
  })

  describe('prefixes and web verification', () => {
    const win = window as unknown as { api: Record<string, unknown> }
    const originalWebSearch = win.api.webSearch

    beforeEach(() => {
      win.api.webSearch = vi.fn()
      ;(window.api.chatStream as unknown as Mock).mockClear()
    })

    afterEach(() => {
      win.api.webSearch = originalWebSearch
      vi.restoreAllMocks()
    })

    it('offers both quick and web-verified answers for a plain query', () => {
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Thủ đô của Việt Nam?' } })
      expect(screen.getAllByRole('option').map(option => option.getAttribute('data-command-id'))).toEqual(['ask', 'verify'])
    })

    it('hides the web-verified row when web search is unavailable', () => {
      win.api.webSearch = undefined
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: '?? giá vàng hôm nay' } })
      expect(screen.getAllByRole('option').map(option => option.getAttribute('data-command-id'))).toEqual(['ask'])
    })

    it('routes "?" to the AI and "??" to web verification, skipping commands and the calculator', () => {
      render(<CommandPalette open onClose={vi.fn()} />)
      const search = screen.getByRole('combobox')

      fireEvent.change(search, { target: { value: '? chat 2 + 2' } })
      expect(screen.getAllByRole('option').map(option => option.getAttribute('data-command-id'))).toEqual(['ask', 'verify'])
      expect(screen.getByRole('option', { name: /Ask AI\./ })).toHaveAccessibleName(/“chat 2 \+ 2”/)

      fireEvent.change(search, { target: { value: '?? giá vàng hôm nay' } })
      const options = screen.getAllByRole('option')
      expect(options.map(option => option.getAttribute('data-command-id'))).toEqual(['verify', 'ask'])
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      expect(options[0]).toHaveAccessibleName(/“giá vàng hôm nay”/)
    })

    it('opens AI Translate with the text for "t <text>"', () => {
      const onClose = vi.fn()
      render(<CommandPalette open onClose={onClose} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 't hello world' } })
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(1)
      expect(options[0]).toHaveAccessibleName(/Translate “hello world”/)

      fireEvent.keyDown(window, { key: 'Enter' })
      expect(useAppStore.getState().activePage).toBe('translate')
      expect(useAppStore.getState().sourceText).toBe('hello world')
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('hands "d <word>" to the Dictionary and navigates there', () => {
      const onClose = vi.fn()
      render(<CommandPalette open onClose={onClose} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd serendipity' } })
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(1)
      expect(options[0]).toHaveAccessibleName(/Dictionary\. Look up “serendipity”/)

      fireEvent.keyDown(window, { key: 'Enter' })
      expect(useAppStore.getState().activePage).toBe('dictionary')
      expect(useAppStore.getState().pendingDictionaryTerm).toBe('serendipity')
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('answers with forced web search, showing the searching state before the cited answer', async () => {
      let release: () => void = () => {}
      const run = vi.spyOn(smartThinkingService, 'run').mockImplementation(async ({ callbacks }) => {
        callbacks.onStepStart('search')
        await new Promise<void>((resolve) => { release = resolve })
        callbacks.onStepComplete('s', 'sources')
        const id = callbacks.onAnswerStart()
        callbacks.onAnswerComplete(id, 'Giá vàng hôm nay là 80 triệu [1].')
      })
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: '?? giá vàng hôm nay' } })
      fireEvent.keyDown(window, { key: 'Enter' })

      expect(await screen.findByRole('status')).toHaveTextContent('Searching the web…')
      expect(run).toHaveBeenCalledOnce()
      expect(run.mock.calls[0][0]).toMatchObject({
        provider: 'local',
        model: 'local-auto',
        question: 'giá vàng hôm nay',
        forceWebSearch: true,
      })
      expect(window.api.chatStream).not.toHaveBeenCalled()

      await act(async () => { release() })
      expect(await screen.findByText(/Giá vàng hôm nay là 80 triệu/)).toBeInTheDocument()
      expect(screen.queryByText('Searching the web…')).not.toBeInTheDocument()
    })

    it('shows a localized error when the web-verified answer fails', async () => {
      vi.spyOn(smartThinkingService, 'run').mockImplementation(async ({ callbacks }) => {
        const id = callbacks.onAnswerStart()
        callbacks.onAnswerError(id, 'boom', 'RATE_LIMIT')
      })
      render(<CommandPalette open onClose={vi.fn()} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: '?? giá vàng hôm nay' } })
      fireEvent.keyDown(window, { key: 'Enter' })

      expect(await screen.findByRole('alert')).toHaveTextContent('Rate limit exceeded. Please wait and try again.')
    })
  })
})
