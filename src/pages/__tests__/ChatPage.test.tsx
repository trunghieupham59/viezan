import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../components/organisms/NotificationViewport'
import { TRANSLATIONS } from '../../i18n'
import { DEEP_RESEARCH_CANCELLED_ERROR, deepResearchService } from '../../services/deepResearchService'
import * as imagePromptService from '../../services/imagePromptService'
import { smartThinkingService } from '../../services/smartThinkingService'
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
      chatPendingTaskState: null,
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
    const scrollRegion = document.querySelector('.chat-empty-scroll')
    expect(scrollRegion?.querySelector('.chat-empty-hero')).toBeInTheDocument()
    expect(scrollRegion?.querySelector('.chat-composer')).toBeNull()
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
      const view = render(<><ChatPage /><NotificationViewport /></>)
      fireEvent.click(screen.getByRole('button', { name: TRANSLATIONS.en.chat_voice_record }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(TRANSLATIONS.en.voice_error_permission_denied)
      expect(alert.closest('.notification-viewport')).toBeInTheDocument()
      expect(within(alert).queryByRole('button', { name: /Open Settings/i })).not.toBeInTheDocument()
      expect(screen.queryByText('Sensitive browser permission detail')).not.toBeInTheDocument()

      // The notice is page-scoped: leaving Chat takes it out of the app-level stack.
      view.unmount()
      render(<NotificationViewport />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
      const taskButton = composerQueries.getByRole('button', { name: `${TRANSLATIONS.en.chat_task_configuration}: ${TRANSLATIONS.en.chat_task_none}` })
      expect(taskButton).toHaveAttribute('aria-haspopup', 'dialog')
      expect(taskButton).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(taskButton)
      fireEvent.click(screen.getByRole('option', { name: TRANSLATIONS.en.chat_mode_chip_image }))
      expect(composerQueries.getByRole('button', { name: `${TRANSLATIONS.en.chat_task_configuration}: ${TRANSLATIONS.en.chat_mode_chip_image}` })).toHaveAttribute('data-control-variant', 'primary')
      expect(screen.queryByRole('menu', { name: TRANSLATIONS.en.chat_response_mode })).not.toBeInTheDocument()
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

  describe('unified task controls', () => {
    const t = TRANSLATIONS.en
    const trigger = () => screen.getByRole('button', { name: /^Task:/ })
    const pick = (name: string) => {
      fireEvent.click(trigger())
      fireEvent.click(screen.getByRole('option', { name }))
    }
    beforeEach(() => act(() => useAppStore.setState({ keyStatus: { gemini: true, claude: true, openai: true, local: true } })))

    it('has six tasks, no response-mode menu, and keyboard navigation returns focus', async () => {
      render(<ChatPage />)
      fireEvent.click(trigger())
      const dialog = screen.getByRole('dialog', { name: t.chat_task_configuration })
      expect(within(dialog).getAllByRole('option')).toHaveLength(6)
      expect(document.querySelector('.chat-starter-actions')).toBeNull()
      expect(screen.queryByRole('button', { name: new RegExp(t.chat_response_mode) })).not.toBeInTheDocument()
      await waitFor(() => expect(within(dialog).getByRole('option', { name: t.chat_task_none })).toHaveFocus())
      fireEvent.keyDown(within(dialog).getByRole('option', { name: t.chat_task_none }), { key: 'ArrowDown' })
      await waitFor(() => expect(within(dialog).getByRole('option', { name: t.chat_suggest_translate })).toHaveFocus())
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => expect(trigger()).toHaveFocus())
    })

    it.each(['gemini', 'openai', 'claude', 'local'] as const)('checks image capability for %s', (provider) => {
      act(() => useAppStore.setState({ selectedProvider: provider }))
      render(<ChatPage />)
      fireEvent.click(trigger())
      const item = screen.getByRole('option', { name: t.chat_mode_chip_image })
      if (provider === 'gemini' || provider === 'openai') {
        expect(item).toBeEnabled()
        fireEvent.click(item)
        expect(screen.getByPlaceholderText(t.chat_image_mode_hint)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: t.chat_web_source })).not.toBeInTheDocument()
      } else {
        expect(item).toBeDisabled()
        expect(item).toHaveAttribute('aria-description', t.chat_image_mode_unsupported_provider)
      }
    })

    it('shows a reason and blocks sending if a restored image task has an unsupported provider', () => {
      act(() => useAppStore.setState({ selectedProvider: 'claude', chatPendingImageMode: true, chatPendingDraft: 'Draw a cat' }))
      render(<ChatPage />)
      expect(trigger()).toHaveTextContent(t.chat_mode_chip_image)
      expect(screen.getByRole('status')).toHaveTextContent(t.chat_image_mode_unsupported_provider)
      expect(screen.getByRole('button', { name: t.chat_send })).toBeDisabled()
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      expect(window.api.chatStream).not.toHaveBeenCalled()
      pick(t.chat_task_none)
      expect(screen.getByRole('button', { name: t.chat_send })).toBeEnabled()
    })

    it('has one depth selector and sources only for compatible tasks', () => {
      render(<ChatPage />)
      fireEvent.click(screen.getByRole('button', { name: t.chat_web_source }))
      pick(t.chat_suggest_research)
      expect(screen.getByRole('button', { name: `${t.chat_task_depth}: ${t.chat_task_overview}` })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: t.chat_web_source })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByRole('button', { name: `${t.chat_task_depth}: ${t.chat_task_overview}` }))
      fireEvent.click(screen.getByRole('option', { name: t.chat_task_deep }))
      expect(screen.queryByRole('button', { name: t.chat_web_source })).not.toBeInTheDocument()
      expect(useAppStore.getState().chatPendingDeepResearchMode).toBe(true)
      pick(t.chat_suggest_translate)
      expect(useAppStore.getState().chatPendingDeepResearchMode).toBe(false)
      expect(screen.queryByRole('button', { name: t.chat_web_source })).not.toBeInTheDocument()
      pick(t.chat_suggest_write)
      expect(screen.getByRole('button', { name: t.chat_web_source })).toHaveAttribute('aria-pressed', 'true')
      expect(useAppStore.getState().chatPendingImageMode).toBe(false)
    })

    it('restores legacy tasks, sources and drafts separately for each conversation', () => {
      const a = { id: 'legacy-image', title: 'Image', provider: 'gemini' as const, model: 'gemini-2.0-flash', messages: [], createdAt: 1, updatedAt: 1, imageMode: true }
      const b = { ...a, id: 'legacy-web', imageMode: false, webSearchMode: true, draftInput: 'B draft' }
      act(() => useAppStore.setState({ chatSessions: [a, b], activeChatSessionId: a.id }))
      render(<ChatPage />)
      expect(trigger()).toHaveTextContent(t.chat_mode_chip_image)
      pick(t.chat_suggest_research)
      act(() => useAppStore.getState().setActiveChatSession(b.id))
      expect(screen.getByRole('textbox')).toHaveValue('B draft')
      expect(screen.getByRole('button', { name: t.chat_web_source })).toHaveAttribute('aria-pressed', 'true')
      act(() => useAppStore.getState().setActiveChatSession(a.id))
      expect(trigger()).toHaveTextContent(t.chat_suggest_research)
      expect(screen.getByRole('button', { name: `${t.chat_task_depth}: ${t.chat_task_overview}` })).toBeInTheDocument()
    })

    it('retries web requests with their original sources, provider, model and draft boundary', async () => {
      act(() => useAppStore.setState({ chatPendingDraft: 'Original question', chatSystemPrompt: 'Original system' }))
      const run = vi.spyOn(smartThinkingService, 'run')
        .mockImplementationOnce(async ({ callbacks }) => { callbacks.onAnswerError(callbacks.onAnswerStart(), 'Search request failed') })
        .mockImplementationOnce(async ({ callbacks }) => { callbacks.onAnswerComplete(callbacks.onAnswerStart(), 'Retry answer') })
      try {
        render(<ChatPage />)
        fireEvent.click(screen.getByRole('button', { name: t.chat_web_source }))
        fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
        await waitFor(() => expect(screen.getByText('Search request failed')).toBeInTheDocument())
        const sessionId = useAppStore.getState().activeChatSessionId as string
        fireEvent.click(screen.getByRole('button', { name: t.chat_web_source }))
        act(() => { useAppStore.getState().setChatSessionModel(sessionId, 'claude', 'changed-model'); useAppStore.setState({ chatSystemPrompt: 'Changed system' }) })
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New unsent draft' } })
        fireEvent.click(screen.getByTitle(/regenerate response/i))
        await waitFor(() => expect(screen.getByText('Retry answer')).toBeInTheDocument())
        expect(run.mock.calls[1][0]).toMatchObject({ provider: 'gemini', model: 'gemini-2.0-flash', systemPrompt: 'Original system', forceWebSearch: true, allowWebSearch: true, question: 'Original question' })
        expect(screen.getByRole('textbox')).toHaveValue('New unsent draft')
        expect(useAppStore.getState().chatSessions[0].messages.filter(message => message.role === 'user')).toHaveLength(1)
      } finally { run.mockRestore() }
    })

    it('retries deep research through the original pipeline after changing task and model', async () => {
      act(() => useAppStore.setState({ chatPendingDraft: 'Study topic' }))
      const run = vi.spyOn(deepResearchService, 'run').mockImplementation(async ({ callbacks }) => {
        const id = callbacks.onStepStart('Final', { phase: 'synth' })
        callbacks.onStepComplete(id, 'Research result', true)
      })
      try {
        render(<ChatPage />)
        pick(t.chat_suggest_research)
        fireEvent.click(screen.getByRole('button', { name: `${t.chat_task_depth}: ${t.chat_task_overview}` }))
        fireEvent.click(screen.getByRole('option', { name: t.chat_task_deep }))
        fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
        await waitFor(() => expect(screen.getByText('Research result')).toBeInTheDocument())
        const sessionId = useAppStore.getState().activeChatSessionId as string
        pick(t.chat_task_none)
        act(() => useAppStore.getState().setChatSessionModel(sessionId, 'claude', 'changed-model'))
        fireEvent.click(screen.getByTitle(/regenerate response/i))
        await waitFor(() => expect(run).toHaveBeenCalledTimes(2))
        expect(run.mock.calls[1][0]).toMatchObject({ provider: 'gemini', model: 'gemini-2.0-flash', question: run.mock.calls[0][0].question })
        expect(useAppStore.getState().chatSessions[0].messages.filter(message => message.role === 'user')).toHaveLength(1)
        expect(screen.getAllByText('Research result')).toHaveLength(1)
        expect(trigger()).toHaveTextContent(t.chat_task_none)
      } finally { run.mockRestore() }
    })

    it.each(['cancelled', 'failed'] as const)('allows retrying research %s before its first checkpoint without losing the request snapshot', async (outcome) => {
      act(() => useAppStore.setState({ chatPendingDraft: 'Study Unicode' }))
      const run = vi.spyOn(deepResearchService, 'run')
        .mockImplementationOnce(async ({ callbacks, signal }) => {
          const id = callbacks.onStepStart('Analyze', { phase: 'analyze' })
          if (outcome === 'failed') { callbacks.onStepError(id, 'Analysis failed'); return }
          await new Promise<void>((resolve) => signal?.addEventListener('abort', () => {
            callbacks.onStepError(id, DEEP_RESEARCH_CANCELLED_ERROR)
            resolve()
          }, { once: true }))
        })
        .mockImplementationOnce(async ({ callbacks }) => {
          const id = callbacks.onStepStart('Final', { phase: 'synth' })
          callbacks.onStepComplete(id, 'Recovered research', true)
        })
      try {
        render(<ChatPage />)
        pick(t.chat_suggest_research)
        fireEvent.click(screen.getByRole('button', { name: `${t.chat_task_depth}: ${t.chat_task_overview}` }))
        fireEvent.click(screen.getByRole('option', { name: t.chat_task_deep }))
        fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
        await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
        if (outcome === 'cancelled') fireEvent.click(screen.getByRole('button', { name: t.chat_stop }))
        await waitFor(() => expect(screen.getByRole('button', { name: t.chat_deep_research_retry })).toBeEnabled())
        const id = useAppStore.getState().activeChatSessionId as string
        act(() => { useAppStore.getState().setChatSessionModel(id, 'claude', 'changed-model'); useAppStore.getState().setActiveChatSession(id) })
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New draft' } })
        expect(screen.queryByRole('button', { name: t.chat_deep_research_retry })).not.toBeInTheDocument()
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
        fireEvent.click(screen.getByRole('button', { name: t.chat_deep_research_retry }))
        await waitFor(() => expect(screen.getByText('Recovered research')).toBeInTheDocument())
        expect(run.mock.calls[1][0]).toMatchObject({ provider: 'gemini', model: 'gemini-2.0-flash', question: run.mock.calls[0][0].question })
        expect(useAppStore.getState().chatSessions[0].messages.filter(m => m.role === 'user')).toHaveLength(1)
      } finally { run.mockRestore() }
    })

    it('retries image generation through the captured image request after changing task', async () => {
      const original = window.api.generateChatImage
      const generate = vi.fn().mockResolvedValueOnce({ success: false, error: 'Image failed' }).mockResolvedValueOnce({ success: true, imageBase64: 'image-data', imageMimeType: 'image/png' })
      window.api.generateChatImage = generate
      const plan = vi.spyOn(imagePromptService, 'planImageRequest').mockResolvedValue({ prompt: 'A cat', editPrevious: false, rewritten: false })
      try {
        act(() => useAppStore.setState({ chatPendingDraft: 'A cat' }))
        render(<ChatPage />)
        pick(t.chat_mode_chip_image)
        fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
        await waitFor(() => expect(screen.getByText('Image failed')).toBeInTheDocument())
        const sessionId = useAppStore.getState().activeChatSessionId as string
        pick(t.chat_task_none)
        act(() => useAppStore.getState().setChatSessionModel(sessionId, 'claude', 'changed-model'))
        fireEvent.click(screen.getByTitle(/regenerate response/i))
        await waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
        expect(generate.mock.calls[1][0]).toMatchObject({ provider: 'gemini', model: 'gemini-2.0-flash', prompt: 'A cat' })
        expect(plan).toHaveBeenCalledTimes(1)
        expect(window.api.chatStream).not.toHaveBeenCalled()
        expect(useAppStore.getState().chatSessions[0].messages.filter(message => message.role === 'user')).toHaveLength(1)
      } finally { plan.mockRestore(); window.api.generateChatImage = original }
    })
  })

  describe('immediate task configuration', () => {
    const t = TRANSLATIONS.en
    const trigger = () => screen.getByRole('button', { name: new RegExp(`^${t.chat_task_configuration}:`) })
    const choose = (task: 'translate' | 'research' | 'explain' | 'write') => {
      fireEvent.click(trigger())
      fireEvent.click(screen.getByRole('option', { name: t[`chat_suggest_${task}`] }))
    }
    const sentText = () => vi.mocked(window.api.chatStream).mock.calls.slice(-1)[0]?.[0].messages.slice(-1)[0]?.content.map(item => item.text ?? '').join('') ?? ''
    beforeEach(() => act(() => useAppStore.setState({
      keyStatus: { gemini: true, claude: false, openai: false, local: false },
      chatPendingDraft: 'My original text',
    })))

    it.each(['translate', 'explain', 'write'] as const)('uses %s immediately and closes before the response starts', async (task) => {
      const stream = mockStreamingChat()
      render(<ChatPage />)
      choose(task)
      expect(screen.queryByRole('button', { name: t.chat_task_apply })).not.toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('My original text')
      expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', t[`chat_task_${task}_placeholder`])
      expect(document.querySelector('.chat-starter-actions')).toBeNull()
      fireEvent.click(trigger())
      expect(screen.getByRole('dialog', { name: t.chat_task_configuration })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
      expect(screen.queryByRole('dialog', { name: t.chat_task_configuration })).not.toBeInTheDocument()
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
      await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())
      const session = useAppStore.getState().chatSessions[0]
      const instruction = session.messages.find(message => message.role === 'user')?.taskInstruction
      expect(instruction).toBeTruthy()
      expect(sentText()).toBe(`${instruction}My original text`)
      expect(sentText().split(instruction as string)).toHaveLength(2)
      expect(session.messages[0].content).toEqual([{ type: 'text', text: 'My original text' }])
      expect(document.querySelector('.chat-composer .chat-task-configuration')).toBeInTheDocument()
      expect(document.querySelector('.chat-message-stage .chat-task-options')).toBeNull()
      stream.resolve({ success: true, reply: 'Completed' })
      await waitFor(() => expect(screen.getByText('Completed')).toBeInTheDocument())
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    })

    it('sends the selected target language and snapshots it while subsequent choices change', async () => {
      const stream = mockStreamingChat()
      render(<ChatPage />)
      choose('translate')
      fireEvent.click(screen.getByRole('button', { name: `${t.chat_task_language}: ${t.lang_names.en}` }))
      fireEvent.click(screen.getByRole('option', { name: t.lang_names.zh }))
      fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
      await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())
      const expected = `${t.chat_task_translate_template.replace('{option}', t.lang_names.zh)}\n\n`
      expect(sentText()).toBe(`${expected}My original text`)
      const sessionId = useAppStore.getState().activeChatSessionId
      fireEvent.click(trigger())
      fireEvent.click(screen.getByRole('option', { name: t.chat_suggest_write }))
      expect(screen.getByRole('button', { name: `${t.chat_task_format}: ${t.chat_task_email}` })).toBeInTheDocument()
      expect(useAppStore.getState().chatSessions[0].messages[0].taskInstruction).toBe(expected)
      fireEvent.click(trigger())
      stream.resolve({ success: true, reply: 'Chinese reply' })
      await waitFor(() => expect(screen.getByRole('button', { name: t.chat_send })).toBeInTheDocument())
      // Completion must not dismiss settings deliberately reopened for the next request.
      expect(screen.getByRole('dialog', { name: t.chat_task_configuration })).toBeInTheDocument()
      expect(useAppStore.getState().activeChatSessionId).toBe(sessionId)
      const next = mockStreamingChat()
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Next topic' } })
      fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
      await waitFor(() => expect(window.api.chatStream).toHaveBeenCalledTimes(2))
      expect(sentText()).toBe(`${t.chat_task_write_template.replace('{option}', t.chat_task_email)}\n\nNext topic`)
      next.resolve({ success: true, reply: 'Written reply' })
    })

    it('offers searchable target languages directly beside the task control', () => {
      render(<ChatPage />)
      choose('translate')
      expect(screen.queryByRole('dialog', { name: t.chat_task_configuration })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: `${t.chat_task_language}: ${t.lang_names.en}` }))
      const dialog = screen.getByRole('dialog', { name: t.chat_task_language })
      fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'Chinese' } })
      expect(within(dialog).getAllByRole('option')).toHaveLength(2)
      fireEvent.click(within(dialog).getByRole('option', { name: t.lang_names.zh }))
      expect(screen.queryByRole('dialog', { name: t.chat_task_language })).not.toBeInTheDocument()
      expect(useAppStore.getState().chatPendingTaskState?.options[0]).toBe('zh')
      expect(screen.getByRole('textbox')).toHaveValue('My original text')
    })

    it.each(['failure', 'cancelled'] as const)('keeps choices after %s and retries the original instruction after edits', async (outcome) => {
      const stream = mockStreamingChat()
      render(<ChatPage />)
      choose('translate')
      fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
      await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())
      const original = sentText()
      if (outcome === 'cancelled') {
        stream.emit({ type: 'token', token: 'Partial' })
        fireEvent.click(screen.getByRole('button', { name: t.chat_stop }))
      }
      stream.resolve(outcome === 'failure' ? { success: false, error: 'Send failed' } : { success: false, errorCode: 'CANCELLED' })
      await waitFor(() => expect(screen.getByRole('button', { name: t.chat_send })).toBeInTheDocument())
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
      if (outcome === 'failure') expect(screen.getByText('Send failed')).toBeInTheDocument()
      fireEvent.click(trigger())
      fireEvent.click(screen.getByRole('option', { name: t.chat_suggest_write }))
      const retry = mockStreamingChat()
      fireEvent.click(screen.getByTitle(/regenerate response/i))
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
      await waitFor(() => expect(window.api.chatStream).toHaveBeenCalledTimes(2))
      expect(sentText()).toBe(original)
      retry.resolve({ success: true, reply: 'Retry succeeded' })
      await waitFor(() => expect(screen.getByText('Retry succeeded')).toBeInTheDocument())
      expect(trigger()).toHaveTextContent(t.chat_suggest_write)
    })

    it('preserves separate configuration when switching conversations during a response', async () => {
      const stream = mockStreamingChat()
      const view = render(<ChatPage />)
      choose('write')
      fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
      await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())
      const a = useAppStore.getState().activeChatSessionId as string
      let b = ''
      act(() => { b = useAppStore.getState().createChatSession('gemini', 'gemini-2.0-flash') })
      choose('explain')
      fireEvent.click(trigger())
      stream.resolve({ success: true, reply: 'Answer for A' })
      await waitFor(() => expect(useAppStore.getState().chatSessions.find(session => session.id === a)?.messages.slice(-1)[0]?.isLoading).toBe(false))
      expect(useAppStore.getState().chatSessions.find(session => session.id === b)?.taskState?.selected).toBe(2)
      expect(screen.getByRole('dialog', { name: t.chat_task_configuration })).toBeInTheDocument()
      act(() => useAppStore.getState().setActiveChatSession(a))
      expect(screen.getByRole('button', { name: `${t.chat_task_format}: ${t.chat_task_email}` })).toBeInTheDocument()
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
      view.unmount()
      render(<ChatPage />)
      expect(screen.getByRole('button', { name: `${t.chat_task_format}: ${t.chat_task_email}` })).toBeInTheDocument()
    })

    it.each(['research', 'overview'] as const)('routes research depth %s with the selected instruction', async (depth) => {
      const deep = vi.spyOn(deepResearchService, 'run').mockResolvedValue(undefined)
      const standard = vi.spyOn(smartThinkingService, 'run').mockResolvedValue(undefined)
      try {
        render(<ChatPage />)
        choose('research')
        if (depth === 'research') {
          fireEvent.click(screen.getByRole('button', { name: `${t.chat_task_depth}: ${t.chat_task_overview}` }))
          fireEvent.click(screen.getByRole('option', { name: t.chat_task_deep }))
        }
        fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
        const called = depth === 'research' ? deep : standard
        await waitFor(() => expect(called).toHaveBeenCalledOnce())
        expect(called.mock.calls[0][0].question).toBe(`${t.chat_task_research_template.replace('{option}', depth === 'research' ? t.chat_task_deep : t.chat_task_overview)}\n\nMy original text`)
        expect(trigger()).toHaveAttribute('aria-expanded', 'false')
      } finally { deep.mockRestore(); standard.mockRestore() }
    })

    it('keeps the popover for invalid sends and preserves authored text when disabling a task', () => {
      act(() => useAppStore.setState({ chatPendingDraft: '' }))
      render(<ChatPage />)
      choose('explain')
      fireEvent.click(trigger())
      expect(screen.getByRole('button', { name: t.chat_send })).toBeDisabled()
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      expect(screen.getByRole('dialog', { name: t.chat_task_configuration })).toBeInTheDocument()
      const authored = `${t.chat_task_explain_template.replace('{option}', t.chat_task_simple)}\n\nMy own text`
      fireEvent.change(screen.getByRole('textbox'), { target: { value: authored } })
      fireEvent.click(within(screen.getByRole('dialog', { name: t.chat_task_configuration })).getByRole('option', { name: t.chat_task_none }))
      expect(screen.getByRole('textbox')).toHaveValue(authored)
      expect(useAppStore.getState().chatPendingTaskState?.selected).toBeNull()
      expect(window.api.chatStream).not.toHaveBeenCalled()
    })

    it('dismisses with Escape and outside click without undoing choices', async () => {
      render(<ChatPage />)
      choose('write')
      fireEvent.click(trigger())
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: t.chat_task_configuration })).not.toBeInTheDocument()
      await waitFor(() => expect(trigger()).toHaveFocus())
      fireEvent.click(trigger())
      fireEvent.pointerDown(screen.getByRole('textbox'))
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByRole('button', { name: `${t.chat_task_format}: ${t.chat_task_email}` })).toBeInTheDocument()
    })

    it('restores current choices after unmount and locale change without changing the draft', () => {
      const view = render(<ChatPage />)
      choose('explain')
      fireEvent.click(screen.getByRole('button', { name: `${t.chat_task_level}: ${t.chat_task_simple}` }))
      fireEvent.click(screen.getByRole('option', { name: t.chat_task_steps }))
      view.unmount()
      act(() => useAppStore.setState({ locale: 'vi' }))
      render(<ChatPage />)
      expect(screen.getByRole('button', { name: `${TRANSLATIONS.vi.chat_task_level}: ${TRANSLATIONS.vi.chat_task_steps}` })).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('My original text')
      expect(screen.queryByText(TRANSLATIONS.vi.chat_task_unapplied)).not.toBeInTheDocument()
    })

    it('includes the selected instruction for image-only vision requests', async () => {
      act(() => useAppStore.setState({ chatPendingDraft: '' }))
      const stream = mockStreamingChat()
      render(<ChatPage />)
      choose('translate')
      fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File(['fake'], 'research.png', { type: 'image/png' })] },
      })
      await waitFor(() => expect(screen.getByAltText('research.png')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: t.chat_send }))
      await waitFor(() => expect(window.api.chatStream).toHaveBeenCalled())
      expect(sentText()).toBe(`${t.chat_task_translate_template.replace('{option}', t.lang_names.en)}\n\n`)
      expect(vi.mocked(window.api.chatStream).mock.calls.slice(-1)[0]?.[0].messages.slice(-1)[0]?.content[0].type).toBe('image')
      stream.resolve({ success: true, reply: 'Image translation' })
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

      fireEvent.click(screen.getByRole('button', { name: /^Task:/ }))
      fireEvent.click(screen.getByRole('option', { name: TRANSLATIONS.en.chat_suggest_research }))
      fireEvent.click(screen.getByRole('button', { name: `${TRANSLATIONS.en.chat_task_depth}: ${TRANSLATIONS.en.chat_task_overview}` }))
      fireEvent.click(screen.getByRole('option', { name: TRANSLATIONS.en.chat_task_deep }))

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(fileInput, {
        target: { files: [new File(['fake'], 'research.png', { type: 'image/png' })] },
      })
      await waitFor(() => expect(screen.getByAltText('research.png')).toBeInTheDocument())

      const textarea = screen.getByPlaceholderText(TRANSLATIONS.en.chat_task_research_placeholder)
      fireEvent.change(textarea, { target: { value: 'Research this image' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => expect(runSpy).toHaveBeenCalled())
      expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
        question: expect.stringContaining('Research this image'),
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
