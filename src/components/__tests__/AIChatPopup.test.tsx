import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  vi.mocked(window.api.quickChat.openSettings).mockClear()
  vi.mocked(window.api.keychain.hasKey).mockResolvedValue({ exists: false })
  window.api.platform = 'darwin'
})

describe('AIChatPopup quick window', () => {
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

    fireEvent.click(screen.getByText('Open in Chat'))

    expect(window.api.quickChat.openInChat).toHaveBeenCalledWith({
      question: 'Carry this',
      response: 'Hello there',
      provider: 'local',
      model: 'local-auto',
    })
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
