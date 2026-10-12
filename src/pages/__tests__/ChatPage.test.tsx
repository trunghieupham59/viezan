import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { deepResearchService } from '../../services/deepResearchService'
import { useAppStore } from '../../store/useAppStore'
import type { ChatResult, ChatStreamEvent } from '../../types'
import { DEFAULT_CHAT_NEW_SESSION_SHORTCUT, DEFAULT_CHAT_SEND_SHORTCUT } from '../../utils/keyboardShortcuts'
import { ChatPage } from '../ChatPage'

vi.mock('../../utils/imageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/imageUtils')>()
  return {
    ...actual,
    resizeImageFile: vi.fn().mockResolvedValue({
      base64: 'research-image-base64',
      mimeType: 'image/png',
      previewUrl: 'data:image/png;base64,research-image-base64',
      width: 100,
      height: 100,
      fileName: 'research.png',
    }),
  }
})

function mockStreamingChat() {
  let listener: ((event: ChatStreamEvent) => void) | null = null
  let resolveStream: (result: ChatResult) => void = () => {}
  const streamResult = new Promise<ChatResult>((resolve) => {
    resolveStream = resolve
  })

  vi.mocked(window.api.onChatStreamEvent).mockImplementation((_requestId, cb) => {
    listener = cb
    return vi.fn()
  })
  vi.mocked(window.api.chatStream).mockImplementation(() => streamResult)

  return {
    emit: (event: Omit<ChatStreamEvent, 'requestId'>) => {
      act(() => {
        listener?.({ requestId: 'test-request', ...event } as ChatStreamEvent)
      })
    },
    resolve: (result: ChatResult) => {
      act(() => {
        resolveStream(result)
      })
    },
  }
}

function mockedEditChatImage() {
  const editChatImage = window.api.editChatImage
  if (typeof editChatImage !== 'function') {
    throw new Error('editChatImage bridge is missing in test setup')
  }
  return vi.mocked(editChatImage)
}

// Reset store before each test
beforeEach(() => {
  act(() => {
    useAppStore.setState({
      chatSessions: [],
      activeChatSessionId: null,
      keyStatus: { gemini: false, claude: false, openai: false, local: false },
      selectedProvider: 'gemini',
      selectedModels: { gemini: 'gemini-2.0-flash', claude: 'claude-3-5-haiku-20241022', openai: 'gpt-4o', local: 'local-auto' },
      locale: 'en',
      chatSystemPrompt: '',
      chatPendingDraft: '',
      chatPendingDeepResearchMode: false,
      chatPendingWebSearchMode: false,
      chatPendingImageMode: false,
      systemPromptPresets: [],
      chatSendShortcut: DEFAULT_CHAT_SEND_SHORTCUT,
      chatNewSessionShortcut: DEFAULT_CHAT_NEW_SESSION_SHORTCUT,
      sttProvider: 'auto',
    })
  })
  vi.mocked(window.api.transcribeAudio).mockReset()
  vi.mocked(window.api.transcribeAudio).mockResolvedValue({
    success: false,
    errorCode: 'UNKNOWN',
    retryable: false,
  })
  vi.mocked(window.api.chatStream).mockReset()
  vi.mocked(window.api.chatStream).mockResolvedValue({ success: false })
  mockedEditChatImage().mockReset()
  mockedEditChatImage().mockResolvedValue({ success: false })
  vi.mocked(window.api.onChatStreamEvent).mockReset()
  vi.mocked(window.api.onChatStreamEvent).mockReturnValue(() => {})
  vi.mocked(window.api.fetchModels).mockReset()
  vi.mocked(window.api.fetchModels).mockResolvedValue({ success: false, models: [] })
})

describe('ChatPage', () => {
  it('renders empty state when no messages', () => {
    render(<ChatPage />)
    // Empty state title should be visible
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(document.querySelector('.chat-empty-composer .chat-page-composer')).toBeInTheDocument()
    expect(document.querySelector('.chat-active-composer-frame')).not.toBeInTheDocument()
  })

  it('shows a safe localized top-right notification when microphone access is denied', async () => {
    const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    const mediaRecorderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: class MediaRecorderSupportStub {},
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(
          new DOMException('Sensitive browser permission detail', 'NotAllowedError'),
        ),
      },
    })

    try {
      render(<ChatPage />)
      fireEvent.click(screen.getByRole('button', { name: TRANSLATIONS.en.chat_voice_record }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(TRANSLATIONS.en.voice_error_permission_denied)
      expect(alert.closest('.notification-viewport')).toBeInTheDocument()
      expect(within(alert).queryByRole('button', { name: /Open Settings/i })).not.toBeInTheDocument()
      expect(screen.queryByText('Sensitive browser permission detail')).not.toBeInTheDocument()
    } finally {
      if (mediaDevicesDescriptor) {
        Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor)
      } else {
        Reflect.deleteProperty(navigator, 'mediaDevices')
      }
      if (mediaRecorderDescriptor) {
        Object.defineProperty(globalThis, 'MediaRecorder', mediaRecorderDescriptor)
      } else {
        Reflect.deleteProperty(globalThis, 'MediaRecorder')
      }
    }
  })

  it('keeps the active composer unframed like the empty composer and uses one atomic size contract', () => {
    const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    const mediaRecorderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: class MediaRecorderSupportStub {},
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    })

    act(() => {
      useAppStore.setState({
        chatSessions: [{
          id: 'active-chat',
          title: 'Existing conversation',
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          messages: [{
            id: 'user-message',
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            timestamp: 1_000,
          }],
          createdAt: 1_000,
          updatedAt: 1_000,
        }],
        activeChatSessionId: 'active-chat',
        keyStatus: { gemini: true, claude: false, openai: false, local: false },
      })
    })

    try {
      render(<ChatPage />)

      const activeFooter = document.querySelector('.chat-active-composer-footer')
      expect(activeFooter).toBeInTheDocument()
      if (!(activeFooter instanceof HTMLElement)) throw new Error('Active-chat composer footer is missing')

      const messagesScroller = document.querySelector('.chat-messages-scroll')
      expect(messagesScroller).toBeInTheDocument()
      if (!(messagesScroller instanceof HTMLElement)) throw new Error('Active-chat message scroller is missing')
      expect(messagesScroller.nextElementSibling).toBe(activeFooter)
      expect(messagesScroller.querySelector('.chat-message-stage > .chat-messages-end')).toHaveAttribute('aria-hidden', 'true')

      const composer = activeFooter.querySelector('.chat-composer.chat-page-composer')
      expect(composer).toBeInTheDocument()
      if (!(composer instanceof HTMLElement)) throw new Error('Active-chat composer is missing')
      expect(document.querySelector('.chat-active-composer-frame')).not.toBeInTheDocument()

      expect(screen.queryByRole('button', { name: TRANSLATIONS.en.chat_clear })).not.toBeInTheDocument()

      const controls = composer.querySelectorAll<HTMLButtonElement>('[data-ui-control="button"]')
      expect(controls.length).toBeGreaterThanOrEqual(5)
      for (const control of controls) {
        expect(control).toHaveAttribute('data-control-size', 'md')
      }

      const composerQueries = within(composer)
      expect(composerQueries.getByRole('button', { name: TRANSLATIONS.en.chat_attach_image }))
        .toHaveAttribute('aria-haspopup', 'menu')
      expect(composerQueries.getByRole('button', { name: TRANSLATIONS.en.chat_attach_image }))
        .toHaveAttribute('aria-expanded', 'false')
      // Image generation is one of the response modes, not a separate toggle.
      expect(composerQueries.queryByRole('button', { name: TRANSLATIONS.en.chat_mode_chip_image })).not.toBeInTheDocument()
      const modeButton = composerQueries.getByRole('button', { name: `${TRANSLATIONS.en.chat_response_mode}: ${TRANSLATIONS.en.chat_mode_standard}` })
      expect(modeButton).toHaveAttribute('aria-haspopup', 'menu')
      expect(modeButton).toHaveAttribute('aria-expanded', 'false')
      expect(modeButton).toHaveAttribute('data-control-variant', 'neutral')
      fireEvent.click(modeButton)
      fireEvent.click(screen.getByRole('menuitemradio', { name: TRANSLATIONS.en.chat_mode_chip_image }))
      const imageModeButton = composerQueries.getByRole('button', { name: `${TRANSLATIONS.en.chat_response_mode}: ${TRANSLATIONS.en.chat_mode_chip_image}` })
      expect(imageModeButton).toHaveAttribute('data-control-variant', 'primary')
      expect(imageModeButton).toHaveAttribute('aria-expanded', 'false')
      expect(composer.querySelector('button[aria-haspopup="dialog"]'))
        .toHaveAttribute('aria-expanded', 'false')
      expect(composerQueries.getByRole('button', { name: TRANSLATIONS.en.chat_voice_record }))
        .toBeInTheDocument()
      const sendButton = composerQueries.getByRole('button', { name: TRANSLATIONS.en.chat_send })
      expect(sendButton).toHaveAttribute('data-control-variant', 'primary')
      expect(sendButton).toHaveAttribute('data-control-state', 'disabled')
    } finally {
      if (mediaDevicesDescriptor) {
        Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor)
      } else {
        Reflect.deleteProperty(navigator, 'mediaDevices')
      }
      if (mediaRecorderDescriptor) {
        Object.defineProperty(globalThis, 'MediaRecorder', mediaRecorderDescriptor)
      } else {
        Reflect.deleteProperty(globalThis, 'MediaRecorder')
      }
    }
  })

  describe('response mode menu', () => {
    const modeTriggerName = `${TRANSLATIONS.en.chat_response_mode}: ${TRANSLATIONS.en.chat_mode_standard}`

    // Pending (pre-session) mode flags live in the store and would leak from earlier tests.
    beforeEach(() => {
      act(() => {
        useAppStore.setState({
          chatPendingImageMode: false,
          chatPendingWebSearchMode: false,
          chatPendingDeepResearchMode: false,
        })
      })
    })

    it('is a keyboard-operable radio menu that returns focus to its trigger', () => {
      render(<ChatPage />)
      const trigger = screen.getByRole('button', { name: modeTriggerName })
      fireEvent.click(trigger)

      const menu = screen.getByRole('menu', { name: TRANSLATIONS.en.chat_response_mode })
      expect(trigger).toHaveAttribute('aria-controls', menu.id)
      const items = within(menu).getAllByRole('menuitemradio')
      expect(items).toHaveLength(4)
      expect(items[0]).toHaveAttribute('aria-checked', 'true')
      expect(items[0]).toHaveFocus()

      fireEvent.keyDown(items[0], { key: 'ArrowDown' })
      expect(items[1]).toHaveFocus()
      fireEvent.keyDown(items[1], { key: 'End' })
      expect(items[3]).toHaveFocus()
      fireEvent.keyDown(items[3], { key: 'ArrowDown' })
      expect(items[0]).toHaveFocus()
      fireEvent.keyDown(items[0], { key: 'ArrowUp' })
      expect(items[3]).toHaveFocus()

      fireEvent.keyDown(items[3], { key: 'Escape' })
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })

    it('explains image mode in the composer placeholder once selected', () => {
      render(<ChatPage />)
      fireEvent.click(screen.getByRole('button', { name: modeTriggerName }))
      fireEvent.click(screen.getByRole('menuitemradio', { name: TRANSLATIONS.en.chat_mode_chip_image }))

      expect(screen.getByPlaceholderText(TRANSLATIONS.en.chat_image_mode_hint)).toBeInTheDocument()
      expect(screen.queryByPlaceholderText(TRANSLATIONS.en.chat_placeholder)).not.toBeInTheDocument()
    })

    it('disables image mode with a reason when the provider cannot generate images', () => {
      act(() => {
        useAppStore.setState({ selectedProvider: 'claude' })
      })
      render(<ChatPage />)
      fireEvent.click(screen.getByRole('button', { name: modeTriggerName }))

      const imageItem = screen.getByRole('menuitemradio', { name: new RegExp(TRANSLATIONS.en.chat_mode_chip_image) })
      expect(imageItem).toBeDisabled()
      expect(imageItem).toHaveTextContent(TRANSLATIONS.en.chat_image_mode_unsupported_provider)
    })
  })

  describe('research starter card', () => {
    const researchModeName = `${TRANSLATIONS.en.chat_response_mode}: ${TRANSLATIONS.en.chat_mode_chip_research}`
    const researchCardName = `${TRANSLATIONS.en.chat_suggest_research}${TRANSLATIONS.en.chat_suggest_research_desc}`

    it.each(['web', 'image'] as const)('replaces %s mode with research without sending the pending draft', async (mode) => {
      act(() => {
        useAppStore.setState({
          keyStatus: { gemini: true, claude: false, openai: false, local: false },
          chatPendingWebSearchMode: mode === 'web',
          chatPendingImageMode: mode === 'image',
        })
      })
      render(<ChatPage />)

      fireEvent.click(screen.getByRole('button', { name: researchCardName }))

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue(TRANSLATIONS.en.chat_suggest_research_prompt)
      await waitFor(() => expect(input).toHaveFocus())
      expect(screen.getByRole('button', { name: researchModeName })).toBeInTheDocument()
      expect(useAppStore.getState()).toMatchObject({
        chatPendingDraft: TRANSLATIONS.en.chat_suggest_research_prompt,
        chatPendingDeepResearchMode: true,
        chatPendingWebSearchMode: false,
        chatPendingImageMode: false,
        activeChatSessionId: null,
        chatSessions: [],
      })
      expect(window.api.chatStream).not.toHaveBeenCalled()
      expect(window.api.chat).not.toHaveBeenCalled()
    })

    it('restores each conversation draft and mode when switching sessions', async () => {
      const sessionA = {
        id: 'research-card-a', title: 'Research', provider: 'gemini' as const,
        model: 'gemini-2.0-flash', messages: [], createdAt: 1, updatedAt: 1,
        imageMode: true,
      }
      const sessionB = {
        ...sessionA, id: 'research-card-b', title: 'Other conversation',
        draftInput: 'Keep this draft', imageMode: false, webSearchMode: true,
      }
      act(() => {
        useAppStore.setState({
          keyStatus: { gemini: true, claude: false, openai: false, local: false },
          chatSessions: [sessionA, sessionB], activeChatSessionId: sessionA.id,
        })
      })
      render(<ChatPage />)
      fireEvent.click(screen.getByRole('button', { name: researchCardName }))
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())

      act(() => useAppStore.getState().setActiveChatSession(sessionB.id))
      expect(screen.getByRole('textbox')).toHaveValue(sessionB.draftInput)
      expect(screen.getByRole('button', {
        name: `${TRANSLATIONS.en.chat_response_mode}: ${TRANSLATIONS.en.chat_mode_chip_web}`,
      })).toBeInTheDocument()
      expect(useAppStore.getState().chatSessions.find((s) => s.id === sessionB.id)).toEqual(sessionB)

      act(() => useAppStore.getState().setActiveChatSession(sessionA.id))
      expect(screen.getByRole('textbox')).toHaveValue(TRANSLATIONS.en.chat_suggest_research_prompt)
      expect(screen.getByRole('button', { name: researchModeName })).toBeInTheDocument()
      const restoredSession = useAppStore.getState().chatSessions.find((s) => s.id === sessionA.id)
      expect(restoredSession).toMatchObject({ deepResearchMode: true, messages: [] })
      expect(restoredSession?.webSearchMode).toBeFalsy()
      expect(restoredSession?.imageMode).toBeFalsy()
      expect(window.api.chatStream).not.toHaveBeenCalled()
      expect(window.api.chat).not.toHaveBeenCalled()
    })
  })

  it('keeps contextual navigation outside the page component', () => {
    render(<ChatPage />)
    expect(screen.queryByRole('complementary', { name: TRANSLATIONS.en.chat_sidebar_label })).not.toBeInTheDocument()
  })

  it('does not let a stale model response rewrite a newly selected conversation', async () => {
    const sessionA = {
      id: 'session-a',
      title: 'Local chat',
      provider: 'local' as const,
      model: 'local-auto',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    }
    const sessionB = {
      id: 'session-b',
      title: 'Another local chat',
      provider: 'local' as const,
      model: 'qwen3:8b',
      messages: [],
      createdAt: 2,
      updatedAt: 2,
    }
    let resolveFetch!: (value: Awaited<ReturnType<typeof window.api.fetchModels>>) => void
    const pendingFetch = new Promise<Awaited<ReturnType<typeof window.api.fetchModels>>>((resolve) => {
      resolveFetch = resolve
    })
    vi.mocked(window.api.fetchModels).mockImplementation(() => pendingFetch)

    act(() => {
      useAppStore.setState({
        chatSessions: [sessionA, sessionB],
        activeChatSessionId: sessionA.id,
        selectedProvider: 'local',
        selectedModels: {
          local: 'local-auto',
          gemini: 'gemini-2.0-flash',
          claude: 'claude-sonnet-4-20250514',
          openai: 'gpt-4o',
        },
        dynamicModels: { local: [], gemini: [], claude: [], openai: [] },
        modelsLoading: { local: false, gemini: false, claude: false, openai: false },
        modelsError: { local: null, gemini: null, claude: null, openai: null },
      })
    })

    render(<ChatPage />)
    fireEvent.click(screen.getByRole('button', { name: /Model: local-auto/i }))
    await waitFor(() => expect(window.api.fetchModels).toHaveBeenCalledWith('local'))
    act(() => useAppStore.getState().setActiveChatSession(sessionB.id))

    await act(async () => {
      resolveFetch({
        success: true,
        models: [{ id: 'qwen3:4b', name: 'Qwen3 4B', description: '' }],
        recommendedModel: 'qwen3:4b',
      })
      await pendingFetch
    })

    expect(useAppStore.getState().chatSessions).toEqual([
      expect.objectContaining({ id: sessionA.id, provider: 'local', model: 'local-auto' }),
      expect.objectContaining({ id: sessionB.id, provider: 'local', model: sessionB.model }),
    ])
    expect(useAppStore.getState().selectedModels.local).toBe(sessionB.model)
  })

  it('shows API key warning when no key is configured', () => {
    render(<ChatPage />)
    // The warning message text (from t.chat_error_no_key) must be visible in
    // the empty state. We assert by content rather than CSS class so the test
    // survives design-token refactors.
    expect(screen.getByText(TRANSLATIONS.en.chat_error_no_key)).toBeInTheDocument()
  })

  it('send button is disabled when no API key', () => {
    render(<ChatPage />)
    const sendButton = screen.getByRole('button', { name: TRANSLATIONS.en.chat_send })
    expect(sendButton).toBeDisabled()
    expect(sendButton).toHaveAttribute('data-control-variant', 'primary')
    expect(sendButton).toHaveAttribute('data-control-state', 'disabled')
  })

  it('creates a new chat session when "New Chat" is clicked with a key', () => {
    // Set a key so session creation is accessible
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
    })
    render(<ChatPage />)

    // Sessions should still be empty before interaction
    expect(useAppStore.getState().chatSessions).toHaveLength(0)
  })

  it('starts a new chat with Cmd+N on macOS', () => {
    let sessionId = ''
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
      sessionId = useAppStore.getState().createChatSession('gemini', 'gemini-2.0-flash')
    })

    render(<ChatPage />)
    expect(useAppStore.getState().activeChatSessionId).toBe(sessionId)

    fireEvent.keyDown(window, { key: 'n', metaKey: true })

    expect(useAppStore.getState().activeChatSessionId).toBeNull()
  })

  it('uses the configured new chat shortcut', () => {
    let sessionId = ''
    act(() => {
      useAppStore.setState({
        keyStatus: { gemini: true, claude: false, openai: false, local: false },
        chatNewSessionShortcut: 'Alt+K',
      })
      sessionId = useAppStore.getState().createChatSession('gemini', 'gemini-2.0-flash')
    })

    render(<ChatPage />)
    expect(useAppStore.getState().activeChatSessionId).toBe(sessionId)

    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    expect(useAppStore.getState().activeChatSessionId).toBe(sessionId)

    fireEvent.keyDown(window, { key: 'k', altKey: true })
    expect(useAppStore.getState().activeChatSessionId).toBeNull()
  })

  it('renders system prompt button', () => {
    render(<ChatPage />)
    // System prompt area should be present
    const promptButtons = screen.getAllByRole('button')
    expect(promptButtons.length).toBeGreaterThan(1)
  })

  // ── Required: input field nhận text ───────────────────────────────────────
  it('input field accepts typed text', () => {
    render(<ChatPage />)
    const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_placeholder)
    expect(textarea).toBeInTheDocument()
    fireEvent.change(textarea, { target: { value: 'Hello chatbot' } })
    expect(textarea).toHaveValue('Hello chatbot')
  })

  it('streams assistant text while sending a message', async () => {
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
    })
    const stream = mockStreamingChat()
    render(<ChatPage />)

    const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_placeholder)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())

    const stopButton = screen.getByRole('button', { name: TRANSLATIONS.en.chat_stop })
    expect(stopButton).toHaveAttribute('data-control-variant', 'danger')

    stream.emit({ type: 'token', token: 'Hel' })
    expect(screen.getByText('Hel')).toBeInTheDocument()

    stream.emit({ type: 'token', token: 'lo' })
    expect(screen.getAllByText('Hello').length).toBeGreaterThanOrEqual(2)

    stream.resolve({ success: true, reply: 'Hello' })

    await waitFor(() => {
      const session = useAppStore.getState().chatSessions[0]
      const assistant = session.messages.find((m) => m.role === 'assistant')
      expect(assistant?.isLoading).toBe(false)
      expect(assistant?.content[0].text).toBe('Hello')
    })
  })

  it('uses Cmd+Enter to send when configured', async () => {
    act(() => {
      useAppStore.setState({
        keyStatus: { gemini: true, claude: false, openai: false, local: false },
        chatSendShortcut: 'modEnter',
      })
    })
    vi.mocked(window.api.chatStream).mockResolvedValue({ success: true, reply: 'Sent with shortcut' })
    render(<ChatPage />)

    const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_placeholder)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(window.api.chatStream).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())
  })

  it('passes attached images through Deep Research mode', async () => {
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
    })
    const runSpy = vi.spyOn(deepResearchService, 'run').mockImplementation(async ({ callbacks }) => {
      const msgId = callbacks.onStepStart('Tổng hợp cuối cùng', { phase: 'synth' })
      callbacks.onStepComplete(msgId, 'Research done', true)
    })


    try {
      render(<ChatPage />)

      fireEvent.click(screen.getByRole('button', { name: `${TRANSLATIONS.en.chat_response_mode}: ${TRANSLATIONS.en.chat_mode_standard}` }))
      fireEvent.click(screen.getByRole('menuitemradio', { name: TRANSLATIONS.en.chat_menu_deep_research }))

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(fileInput, {
        target: { files: [new File(['fake'], 'research.png', { type: 'image/png' })] },
      })
      await waitFor(() => expect(screen.getByAltText('research.png')).toBeInTheDocument())

      const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_placeholder)
      fireEvent.change(textarea, { target: { value: 'Research this image' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => expect(runSpy).toHaveBeenCalled())
      expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
        question: 'Research this image',
        images: [{
          imageBase64: 'research-image-base64',
          imageMimeType: 'image/png',
        }],
      }))

      const userMessage = useAppStore.getState().chatSessions[0].messages.find((m) => m.role === 'user')
      expect(userMessage?.content).toEqual([
        expect.objectContaining({
          type: 'image',
          imageBase64: 'research-image-base64',
          imageMimeType: 'image/png',
        }),
        expect.objectContaining({ type: 'text', text: 'Research this image' }),
      ])
    } finally {
      runSpy.mockRestore()
    }
  })

  it('renders Deep Research resume as the composer primary action', async () => {
    const resumeState = {
      question: 'Resume checkpoint question',
      aspects: ['Aspect A', 'Aspect B'],
      knowledgeBase: [{ label: 'Aspect A', content: 'Completed A' }],
      surveyCompletedAspects: ['Aspect A'],
      imageContext: '',
      imageSearchTerms: [],
      anyWebSearch: false,
      lastCompletedPhase: 'survey' as const,
      lastGapIteration: 0,
      hasImages: false,
    }
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
      const sessionId = useAppStore.getState().createChatSession('gemini', 'gemini-2.0-flash')
      useAppStore.getState().addChatMessage(sessionId, {
        id: 'msg-research-step',
        role: 'assistant',
        content: [{ type: 'text', text: 'Completed A' }],
        timestamp: Date.now(),
        isResearchStep: true,
        researchStepLabel: 'Survey',
        researchStepPhase: 'survey',
        researchStepAspect: 'Aspect A',
      })
      useAppStore.getState().setDeepResearchResumeState(sessionId, resumeState)
    })
    const runSpy = vi.spyOn(deepResearchService, 'run').mockImplementation(async ({ callbacks }) => {
      const msgId = callbacks.onStepStart('Tổng hợp cuối cùng', { phase: 'synth' })
      callbacks.onStepComplete(msgId, 'Research done', true)
      callbacks.onResumeStateChange?.(null)
    })

    try {
      render(<ChatPage />)

      const resumeButton = screen.getByTitle(/resume research/i)
      expect(resumeButton).toHaveClass('chat-resume-button')
      expect(resumeButton).toHaveTextContent('Resume')

      fireEvent.click(resumeButton)

      await waitFor(() => expect(runSpy).toHaveBeenCalled())
      expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
        question: 'Resume checkpoint question',
        resumeState: expect.objectContaining({
          lastCompletedPhase: 'survey',
          surveyCompletedAspects: ['Aspect A'],
        }),
      }))
    } finally {
      runSpy.mockRestore()
    }
  })

  it('routes image edit prompts to the image-edit API and renders the generated image', async () => {
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
    })
    mockedEditChatImage().mockResolvedValue({
      success: true,
      imageBase64: 'edited-image-base64',
      imageMimeType: 'image/png',
      usedProvider: 'gemini',
      usedModel: 'gemini-2.5-flash-image',
    })

    render(<ChatPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['fake'], 'research.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByAltText('research.png')).toBeInTheDocument())

    const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_placeholder)
    fireEvent.change(textarea, { target: { value: 'Sửa thành phông nền màu trắng' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(window.api.editChatImage).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      prompt: 'Sửa thành phông nền màu trắng',
      imageBase64: 'research-image-base64',
      imageMimeType: 'image/png',
    })))
    expect(window.api.chatStream).not.toHaveBeenCalled()

    await waitFor(() => {
      const assistant = useAppStore.getState().chatSessions[0].messages.find((m) => m.role === 'assistant')
      expect(assistant?.isLoading).toBe(false)
      expect(assistant?.content).toEqual([
        expect.objectContaining({
          type: 'image',
          imageBase64: 'edited-image-base64',
          imageMimeType: 'image/png',
          imagePreviewUrl: 'data:image/png;base64,edited-image-base64',
        }),
        expect.objectContaining({ type: 'text', text: 'Edited image' }),
      ])
    })
    const editedImage = screen.getByAltText(/edited-image-/i)
    expect(editedImage).toBeInTheDocument()

    fireEvent.click(editedImage)
    expect(screen.getByRole('dialog', { name: /image preview/i })).toBeInTheDocument()
    expect(screen.getAllByAltText(/edited-image-/i).length).toBe(2)

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /image preview/i })).not.toBeInTheDocument()
    })
  })

  it('shows a reload-required error when the Electron preload bridge is stale', async () => {
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
    })
    const originalEditChatImage = window.api.editChatImage
    // biome-ignore lint/suspicious/noExplicitAny: simulates a running app with an older preload bundle
    ;(window.api as any).editChatImage = undefined

    try {
      render(<ChatPage />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(fileInput, {
        target: { files: [new File(['fake'], 'research.png', { type: 'image/png' })] },
      })
      await waitFor(() => expect(screen.getByAltText('research.png')).toBeInTheDocument())

      const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_placeholder)
      fireEvent.change(textarea, { target: { value: 'Thay nền trắng cho ảnh' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => expect(screen.getByText(/restart/i)).toBeInTheDocument())
      expect(window.api.chatStream).not.toHaveBeenCalled()
    } finally {
      window.api.editChatImage = originalEditChatImage
    }
  })

  it('localizes typed image-edit timeout errors in Vietnamese', async () => {
    act(() => {
      useAppStore.setState({
        locale: 'vi',
        keyStatus: { gemini: true, claude: false, openai: false, local: false },
      })
    })
    mockedEditChatImage().mockResolvedValue({
      success: false,
      error: 'Chat failed: This operation was aborted',
      errorCode: 'TIMEOUT',
    })

    render(<ChatPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['fake'], 'research.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByAltText('research.png')).toBeInTheDocument())

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Thay nền ảnh thành màu trắng' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText('Yêu cầu mất quá lâu và đã bị hủy. Vui lòng thử lại.')).toBeInTheDocument()
    })
    expect(screen.queryByText(/This operation was aborted/i)).not.toBeInTheDocument()
  })

  it('streams text into the last assistant message when regenerating', async () => {
    let sessionId = ''
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
      sessionId = useAppStore.getState().createChatSession('gemini', 'gemini-2.0-flash')
      useAppStore.getState().addChatMessage(sessionId, {
        id: 'msg-user',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        timestamp: Date.now(),
      })
      useAppStore.getState().addChatMessage(sessionId, {
        id: 'msg-assistant',
        role: 'assistant',
        content: [{ type: 'text', text: 'Old response' }],
        timestamp: Date.now(),
      })
    })
    const stream = mockStreamingChat()
    render(<ChatPage />)

    fireEvent.click(screen.getByTitle(/regenerate response/i))
    await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())

    stream.emit({ type: 'token', token: 'New' })
    // chatService.stream batches tokens via `bufferIntervalMs` (~60 ms) before
    // dispatching the store update, so the rendered text appears asynchronously.
    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument())

    stream.resolve({ success: true, reply: 'New response' })


    await waitFor(() => {
      const assistant = useAppStore.getState().chatSessions[0].messages.find((m) => m.id === 'msg-assistant')
      expect(assistant?.isLoading).toBe(false)
      expect(assistant?.content[0].text).toBe('New response')
    })
  })

  it('shows stream errors and stops loading', async () => {
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
    })
    vi.mocked(window.api.chatStream).mockResolvedValue({ success: false, error: 'Stream failed' })

    render(<ChatPage />)
    const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_placeholder)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Stream failed')).toBeInTheDocument())

    const assistant = useAppStore.getState().chatSessions[0].messages.find((m) => m.role === 'assistant')
    expect(assistant?.isLoading).toBe(false)
  })

  it('localizes Gemini recitation blocks in Vietnamese', async () => {
    act(() => {
      useAppStore.setState({
        locale: 'vi',
        keyStatus: { gemini: true, claude: false, openai: false, local: false },
      })
    })
    vi.mocked(window.api.chatStream).mockResolvedValue({
      success: false,
      error: '[GoogleGenerativeAI Error]: Candidate was blocked due to RECITATION: The generated content was filtered because it may contain material that resembles existing copyrighted works.',
      errorCode: 'BLOCKED_RECITATION',
    })

    render(<ChatPage />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Phân tích đoạn lời bài hát này' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText(/Gemini đã chặn phản hồi/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/GoogleGenerativeAI|RECITATION|copyrighted works/i)).not.toBeInTheDocument()
  })

  it('falls back to non-streaming chat when the preload stream API is unavailable', async () => {
    act(() => {
      useAppStore.setState({ keyStatus: { gemini: true, claude: false, openai: false, local: false } })
    })
    const originalChatStream = window.api.chatStream
    const originalOnChatStreamEvent = window.api.onChatStreamEvent
    // biome-ignore lint/suspicious/noExplicitAny: simulates an older Electron preload at runtime
    ;(window.api as any).chatStream = undefined
    // biome-ignore lint/suspicious/noExplicitAny: simulates an older Electron preload at runtime
    ;(window.api as any).onChatStreamEvent = undefined
    vi.mocked(window.api.chat).mockResolvedValueOnce({ success: true, reply: 'Fallback reply' })

    try {
      render(<ChatPage />)
      const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_placeholder)
      fireEvent.change(textarea, { target: { value: 'Hello' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => expect(screen.getByText('Fallback reply')).toBeInTheDocument())
      expect(window.api.chat).toHaveBeenCalled()
    } finally {
      window.api.chatStream = originalChatStream
      window.api.onChatStreamEvent = originalOnChatStreamEvent
    }
  })

  // ── Required: empty state hiển thị khi không có session ───────────────────
  it('empty state is shown when there are no chat sessions', () => {
    // chatSessions: [] from beforeEach — no session, no messages
    render(<ChatPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(document.querySelector('.chat-empty-state')).not.toBeNull()
  })
})
