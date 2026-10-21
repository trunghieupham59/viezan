import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import type { ChatResult, ChatStreamEvent } from '../../types'
import { AIChatPopup } from '../AIChatPopup'

function mockStreamingChat() {
  let listener: ((event: ChatStreamEvent) => void) | null = null

  vi.mocked(window.api.onChatStreamEvent).mockImplementation((_requestId, cb) => {
    listener = cb
    return vi.fn()
  })
  vi.mocked(window.api.chatStream).mockImplementation(async () => {
    listener?.({ requestId: 'quick-chat-test', type: 'token', token: 'Hello' })
    listener?.({ requestId: 'quick-chat-test', type: 'token', token: ' there' })
    listener?.({ requestId: 'quick-chat-test', type: 'end', reply: 'Hello there' })
    return { success: true, reply: 'Hello there' } satisfies ChatResult
  })
}

beforeEach(() => {
  window.localStorage.clear()
  useAppStore.persist.clearStorage()
  act(() => {
    useAppStore.setState({
      selectedProvider: 'local',
      selectedModels: { gemini: 'gemini-2.0-flash', claude: 'claude-3-5-haiku-20241022', openai: 'gpt-4o', local: 'local-auto' },
      keyStatus: { gemini: false, claude: false, openai: false, local: true },
      chatSystemPrompt: '',
      locale: 'en',
    })
  })
  vi.mocked(window.api.chat).mockReset()
  vi.mocked(window.api.chat).mockResolvedValue({ success: false })
  vi.mocked(window.api.chatStream).mockReset()
  vi.mocked(window.api.chatStream).mockResolvedValue({ success: false })
  vi.mocked(window.api.onChatStreamEvent).mockReset()
  vi.mocked(window.api.onChatStreamEvent).mockReturnValue(() => {})
  ;(window.api as unknown as { webSearch?: typeof window.api.webSearch }).webSearch = undefined
  vi.mocked(window.api.quickChat.openInChat).mockClear()
  vi.mocked(window.api.quickChat.openInChat).mockResolvedValue({ success: true })
  vi.mocked(window.api.quickChat.openSettings).mockClear()
  vi.mocked(window.api.quickChat.session.save).mockClear()
  vi.mocked(window.api.quickChat.session.clear).mockClear()
  vi.mocked(window.api.keychain.hasKey).mockResolvedValue({ exists: false })
  window.api.platform = 'darwin'
})

describe('AIChatPopup quick window', () => {
  it('waits for provider readiness, submits each launcher action once and does not replay it on reopen', async () => {
    let resolveKey!: (value: { exists: boolean }) => void
    vi.mocked(window.api.keychain.hasKey).mockImplementation(() => new Promise(resolve => { resolveKey = resolve }))
    useAppStore.setState({ selectedProvider: 'openai' })
    mockStreamingChat()
    const onBack = vi.fn()
    const request = { id: 1, text: 'Say hello' }
    const { rerender } = render(<StrictMode><AIChatPopup launchRequest={request} onBack={onBack} /></StrictMode>)
    expect(window.api.chatStream).not.toHaveBeenCalled()
    await act(async () => resolveKey({ exists: true }))
    expect(await screen.findByText('Hello there')).toBeInTheDocument()
    expect(window.api.chatStream).toHaveBeenCalledOnce()
    rerender(<StrictMode><AIChatPopup active={false} launchRequest={request} onBack={onBack} /></StrictMode>)
    rerender(<StrictMode><AIChatPopup launchRequest={request} onBack={onBack} /></StrictMode>)
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    expect(window.api.chatStream).toHaveBeenCalledOnce()
    rerender(<StrictMode><AIChatPopup launchRequest={{ id: 2, text: request.text }} onBack={onBack} /></StrictMode>)
    await waitFor(() => expect(window.api.chatStream).toHaveBeenCalledTimes(2))
    expect(vi.mocked(window.api.chatStream).mock.calls[1][0].messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Say hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello there' }] },
      { role: 'user', content: [{ type: 'text', text: 'Say hello' }] },
    ])
  })

  it('keeps a launcher question editable when no key exists and does not send it later without another action', async () => {
    useAppStore.setState({ selectedProvider: 'openai' })
    render(<AIChatPopup launchRequest={{ id: 1, text: 'Keep this question' }} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    expect(screen.getByRole('textbox')).toHaveValue('Keep this question')
    expect(screen.getByTitle('Send')).toBeDisabled()
    expect(window.api.chatStream).not.toHaveBeenCalled()
    act(() => useAppStore.setState({ selectedProvider: 'local' }))
    await waitFor(() => expect(screen.getByTitle('Send')).toBeEnabled())
    expect(window.api.chatStream).not.toHaveBeenCalled()
  })

  it('does not overlap sends or lose a new launcher question while the previous answer is streaming', async () => {
    let finish!: (value: ChatResult) => void
    vi.mocked(window.api.chatStream).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValue({ success: true, reply: 'Second answer' })
    const onBack = vi.fn()
    const { rerender } = render(<AIChatPopup onBack={onBack} launchRequest={{ id: 1, text: 'First question' }} />)
    await waitFor(() => expect(window.api.chatStream).toHaveBeenCalledOnce())
    rerender(<AIChatPopup onBack={onBack} launchRequest={{ id: 2, text: 'Second question' }} />)
    expect(window.api.chatStream).toHaveBeenCalledOnce()
    await act(async () => finish({ success: true, reply: 'First answer' }))
    expect(await screen.findByText('Second answer')).toBeInTheDocument()
    expect(window.api.chatStream).toHaveBeenCalledTimes(2)
    expect(vi.mocked(window.api.chatStream).mock.calls[1][0].messages).toHaveLength(3)
  })

  it('focuses the input when mounted', async () => {
    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    await waitFor(() => expect(document.activeElement).toBe(input))
  })

  it('streams the answer inline when Enter sends the question', async () => {
    mockStreamingChat()
    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Say hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())
    expect(await screen.findByText('Hello there')).toBeInTheDocument()
  })

  it('runs Smart Thinking web search but only surfaces a minimal indicator', async () => {
    // The Smart Thinking flow still performs the routing call + web search +
    // injects results into the final system prompt, but the UI must NOT
    // expose the internal search query, sources list, or AI reasoning to
    // the user — only a small "Smart Thinking" indicator should be visible.
    // Cloud provider: local models skip the AI routing call (rule-based intent instead).
    vi.mocked(window.api.keychain.hasKey).mockResolvedValue({ exists: true })
    act(() => {
      useAppStore.setState({
        selectedProvider: 'gemini',
        keyStatus: { gemini: true, claude: false, openai: false, local: true },
      })
    })
    vi.mocked(window.api.chat).mockResolvedValueOnce({
      success: true,
      reply: JSON.stringify({
        needs_web: true,
        query: 'current Viezan release',
        reason: 'The answer needs current release information.',
        answer_focus: 'State the latest release from current sources.',
        source_guidance: 'Prefer official release pages.',
        source_count: 1,
      }),
    })
    const webSearchMock = vi.fn().mockResolvedValue({
      success: true,
      results: [{
        title: 'Viezan release notes',
        url: 'https://example.com/viezan/releases',
        content: 'Latest Viezan release information from the official release page.',
        score: 0.99,
      }],
    })
    ;(window.api as unknown as { webSearch: typeof webSearchMock }).webSearch = webSearchMock
    mockStreamingChat()

    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'What is the current Viezan release?' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Web search must still run with the AI-generated query.
    await waitFor(() => expect(webSearchMock).toHaveBeenCalledWith(expect.objectContaining({
      query: 'current Viezan release',
      maxResults: 1,
    })))

    // Final answer streams in normally.
    expect(await screen.findByText('Hello there')).toBeInTheDocument()

    // The minimal "Smart Thinking" pill is shown — but the internal
    // step UI must NOT surface the search query or the AI reasoning text.
    // (Citations inside the final answer are part of the answer markdown
    // and are rendered separately from the Smart Thinking step indicator.)
    expect(screen.getAllByText('Smart Thinking').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Web search current Viezan release/)).not.toBeInTheDocument()
    expect(screen.queryByText(/AI decided web search is needed/)).not.toBeInTheDocument()

    // Web evidence must still reach the model via the system prompt.
    const streamCall = vi.mocked(window.api.chatStream).mock.calls[0]?.[0]
    expect(streamCall?.systemPrompt).toContain('WEB SEARCH RESULTS')
  })

  it('localizes provider content blocks instead of showing raw SDK errors', async () => {
    vi.mocked(window.api.chatStream).mockResolvedValue({
      success: false,
      error: '[GoogleGenerativeAI Error]: Candidate was blocked due to RECITATION',
      errorCode: 'BLOCKED_RECITATION',
    })

    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Analyze these lyrics' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText(/Gemini blocked this response/)).toBeInTheDocument()
    expect(screen.queryByText(/GoogleGenerativeAI|RECITATION/i)).not.toBeInTheDocument()
  })

  it('does not send on Shift+Enter', () => {
    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Line one' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(window.api.chatStream).not.toHaveBeenCalled()
  })

  it('disables send and opens settings when the provider has no key', async () => {
    act(() => {
      useAppStore.setState({
        selectedProvider: 'gemini',
        keyStatus: { gemini: false, claude: false, openai: false, local: true },
      })
    })
    render(<AIChatPopup />)

    expect(await screen.findByText('No API key configured. Go to Settings to add one.')).toBeInTheDocument()
    const sendButton = screen.getByTitle('Send')
    expect(sendButton).toBeDisabled()

    fireEvent.click(screen.getByText('Open Settings'))
    expect(window.api.quickChat.openSettings).toHaveBeenCalled()
  })

  it('sends the current Q&A payload when opening full Chat', async () => {
    mockStreamingChat()
    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Carry this' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('Hello there')

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByText('Open in Chat'))

    expect(window.api.quickChat.openInChat).toHaveBeenCalledWith({
      question: 'Carry this',
      response: 'Hello there',
      provider: 'local',
      model: 'local-auto',
    })
  })

  it.each(['button', 'shortcut'])('forwards a new draft without the previous answer via %s', async (action) => {
    window.api.platform = 'win32'
    mockStreamingChat()
    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Say hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('Hello there')
    fireEvent.change(input, { target: { value: '  What is 5 + 7?  ' } })

    if (action === 'button') {
      fireEvent.click(screen.getByText('Open in Chat'))
    } else {
      fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    }

    expect(window.api.quickChat.openInChat).toHaveBeenCalledExactlyOnceWith({
      question: 'What is 5 + 7?',
      response: undefined,
      history: [
        { role: 'user', text: 'Say hello' },
        { role: 'assistant', text: 'Hello there' },
      ],
      provider: 'local',
      model: 'local-auto',
    })
    expect(window.api.chatStream).toHaveBeenCalledTimes(1)
  })

  it('persists each answered pair, hands the session back, and clears it on Cmd+N', async () => {
    mockStreamingChat()
    const onSessionChange = vi.fn()
    render(<AIChatPopup onSessionChange={onSessionChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Say hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('Hello there')
    await waitFor(() => expect(window.api.quickChat.session.save).toHaveBeenCalledOnce())
    const saved = vi.mocked(window.api.quickChat.session.save).mock.calls[0][0]
    expect(saved).toMatchObject({ turns: [{ role: 'user', text: 'Say hello' }, { role: 'assistant', text: 'Hello there' }] })
    expect(saved.id).toMatch(/^quick-ai-/)
    expect(onSessionChange).toHaveBeenLastCalledWith(saved)
    expect(screen.getByText(/1 turn/)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'And again' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.session.save).toHaveBeenCalledTimes(2))
    const next = vi.mocked(window.api.quickChat.session.save).mock.calls[1][0]
    expect(next.id).toBe(saved.id)
    expect(next.turns).toHaveLength(4)

    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    expect(window.api.quickChat.session.clear).toHaveBeenCalledOnce()
    expect(onSessionChange).toHaveBeenLastCalledWith(null)
    fireEvent.change(input, { target: { value: 'Fresh' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(window.api.quickChat.session.save).toHaveBeenCalledTimes(3))
    expect(vi.mocked(window.api.quickChat.session.save).mock.calls[2][0].id).not.toBe(saved.id)
  })

  it('does not persist a failed answer', async () => {
    vi.mocked(window.api.chatStream).mockResolvedValue({ success: false, error: 'boom' })
    const { container } = render(<AIChatPopup />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Say hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(container.querySelector('.ui-error-box')).toBeInTheDocument())
    expect(window.api.quickChat.session.save).not.toHaveBeenCalled()
  })

  it('resumes a launcher session, sends the follow-up with its context, and keeps the same id', async () => {
    mockStreamingChat()
    const session = {
      id: 'quick-ai-stored', updatedAt: Date.now(),
      turns: [
        { role: 'user' as const, text: 'Earlier question' }, { role: 'assistant' as const, text: 'Earlier answer' },
        { role: 'user' as const, text: 'Latest question' }, { role: 'assistant' as const, text: 'Latest answer' },
      ],
    }
    const { rerender } = render(<AIChatPopup launchRequest={{ id: 1, text: '', session }} onBack={() => {}} />)
    expect(screen.getByText('Latest answer')).toBeInTheDocument()
    expect(screen.getByText('Earlier answer')).toBeInTheDocument()
    expect(screen.getByText(/2 turns/)).toBeInTheDocument()
    expect(window.api.chatStream).not.toHaveBeenCalled()

    rerender(<AIChatPopup launchRequest={{ id: 2, text: 'Follow up', session }} onBack={() => {}} />)
    await screen.findByText('Hello there')
    expect(vi.mocked(window.api.chatStream).mock.calls[0][0].messages.map(message => message.content[0]))
      .toEqual([
        { type: 'text', text: 'Earlier question' }, { type: 'text', text: 'Earlier answer' },
        { type: 'text', text: 'Latest question' }, { type: 'text', text: 'Latest answer' },
        { type: 'text', text: 'Follow up' },
      ])
    const saved = vi.mocked(window.api.quickChat.session.save).mock.calls[0][0]
    expect(saved.id).toBe('quick-ai-stored')
    expect(saved.turns).toHaveLength(6)

    rerender(<AIChatPopup launchRequest={{ id: 3, text: '', session: null }} onBack={() => {}} />)
    expect(screen.queryByText('Hello there')).not.toBeInTheDocument()
    expect(screen.queryByText('Earlier answer')).not.toBeInTheDocument()
  })

  it('sends only the newest six pairs within the character budget', async () => {
    mockStreamingChat()
    const turns = Array.from({ length: 16 }, (_, index) => index % 2 === 0
      ? { role: 'user' as const, text: `Q${index / 2}` }
      : { role: 'assistant' as const, text: `A${(index - 1) / 2}` })
    render(<AIChatPopup launchRequest={{ id: 1, text: 'Latest', session: { id: 'quick-ai-long', turns, updatedAt: Date.now() } }} onBack={() => {}} />)
    await screen.findByText('Hello there')
    const sent = vi.mocked(window.api.chatStream).mock.calls[0][0].messages.map(message => message.content[0].text)
    expect(sent).toEqual(['Q2', 'A2', 'Q3', 'A3', 'Q4', 'A4', 'Q5', 'A5', 'Q6', 'A6', 'Q7', 'A7', 'Latest'])

    vi.mocked(window.api.chatStream).mockClear()
    const bulky = [
      { role: 'user' as const, text: 'Old' }, { role: 'assistant' as const, text: 'x'.repeat(5_000) },
      { role: 'user' as const, text: 'Recent' }, { role: 'assistant' as const, text: 'y'.repeat(1_500) },
    ]
    render(<AIChatPopup launchRequest={{ id: 2, text: 'Latest', session: { id: 'quick-ai-bulky', turns: bulky, updatedAt: Date.now() } }} onBack={() => {}} />)
    await waitFor(() => expect(window.api.chatStream).toHaveBeenCalledOnce())
    expect(vi.mocked(window.api.chatStream).mock.calls[0][0].messages.map(message => message.content[0].text))
      .toEqual(['Recent', 'y'.repeat(1_500), 'Latest'])
  })

  it('clears the popup and the stored session once the main chat takes the conversation', async () => {
    mockStreamingChat()
    const onSessionChange = vi.fn()
    render(<AIChatPopup onSessionChange={onSessionChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Carry this' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('Hello there')
    fireEvent.click(screen.getByText('Open in Chat'))
    await waitFor(() => expect(window.api.quickChat.session.clear).toHaveBeenCalledOnce())
    expect(screen.queryByText('Hello there')).not.toBeInTheDocument()
    expect(onSessionChange).toHaveBeenLastCalledWith(null)

    vi.mocked(window.api.quickChat.session.clear).mockClear()
    vi.mocked(window.api.quickChat.openInChat).mockResolvedValueOnce({ success: false, error: 'no main window' })
    fireEvent.change(input, { target: { value: 'Keep me' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('Hello there')
    fireEvent.click(screen.getByText('Open in Chat'))
    await waitFor(() => expect(window.api.quickChat.openInChat).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(window.api.quickChat.session.clear).not.toHaveBeenCalled()
  })

  it('starts a new conversation with Cmd+N on macOS', async () => {
    mockStreamingChat()
    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Start over from this' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('Hello there')

    expect(screen.getByTitle('New conversation (Cmd+N)')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'n', metaKey: true })

    expect(screen.queryByText('Hello there')).not.toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('starts a new conversation with Ctrl+N off macOS', async () => {
    window.api.platform = 'win32'
    mockStreamingChat()
    render(<AIChatPopup />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Start over from this' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('Hello there')

    expect(screen.getByTitle('New conversation (Ctrl+N)')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })

    expect(screen.queryByText('Hello there')).not.toBeInTheDocument()
    expect(input).toHaveValue('')
  })
})
