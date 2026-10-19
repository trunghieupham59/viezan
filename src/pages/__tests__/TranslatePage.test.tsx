import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATE_INPUT_WARNING_CHARS } from '../../constants/providers'
import { IMAGE_AUTO_TRANSLATE_DELAY_MS } from '../../constants/ui'
import { TRANSLATIONS } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { extractImageFromClipboard, resizeImageFile } from '../../utils/imageUtils'
import { TranslatePage } from '../TranslatePage'

vi.mock('../../utils/imageUtils', async () => {
  const actual = await vi.importActual<typeof import('../../utils/imageUtils')>('../../utils/imageUtils')
  return {
    ...actual,
    extractImageFromClipboard: vi.fn(),
    resizeImageFile: vi.fn(),
  }
})

function openTranslationSettings() {
  const configButton = screen.getByRole('button', { name: /AI configuration|Cấu hình AI|AI 設定/i })
  act(() => {
    fireEvent.click(configButton)
  })
}

function openTranslationModelDialog() {
  openTranslationSettings()
  const configDialog = screen.getByRole('dialog', {
    name: /AI configuration|Cấu hình AI|AI 設定/i,
  })
  fireEvent.click(within(configDialog).getByRole('button', {
    name: /Choose translation models|Chọn mô hình dịch|翻訳モデル/i,
  }))
  return screen.getByRole('dialog', { name: 'Translation models' })
}

function getSourcePane() {
  return screen.getByRole('region', { name: /Source content|Nội dung gốc|原文/i })
}

function getSourceInput() {
  return screen.getByRole('textbox', { name: /Source content|Nội dung gốc|原文/i })
}

// Reset store before each test
beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.mocked(window.api.translate).mockReset()
  vi.mocked(window.api.translate).mockResolvedValue({ success: false })
  vi.mocked(window.api.translateImage).mockReset()
  vi.mocked(window.api.translateImage).mockResolvedValue({ success: false })
  vi.mocked(window.api.transcribeAudio).mockReset()
  vi.mocked(window.api.transcribeAudio).mockResolvedValue({
    success: false,
    errorCode: 'UNKNOWN',
    retryable: false,
  })
  const cancelTranslateMock = vi.mocked(
    window.api.cancelTranslate as NonNullable<typeof window.api.cancelTranslate>
  )
  cancelTranslateMock.mockReset()
  cancelTranslateMock.mockResolvedValue({ success: false, error: 'NOT_FOUND' })
  vi.mocked(extractImageFromClipboard).mockReturnValue(null)
  vi.mocked(resizeImageFile).mockResolvedValue({
    base64: 'mock-image-base64',
    mimeType: 'image/png',
    previewUrl: 'data:image/png;base64,mock-image-base64',
    width: 100,
    height: 80,
    fileName: 'mock.png',
  })
  act(() => {
    useAppStore.setState({
      sourceText: '',
      translatedText: '',
      phoneticText: '',
      sourceLang: 'auto',
      targetLang: 'vi',
      isTranslating: false,
      translateError: null,
      translateErrorCode: null,
      autoTranslate: false, // manual mode — shows Translate button
      keyStatus: { gemini: true, claude: false, openai: false, local: false },
      selectedProvider: 'gemini',
      selectedModels: { gemini: 'gemini-2.0-flash', claude: 'claude-3-5-haiku-20241022', openai: 'gpt-4o', local: 'local-auto' },
      translationModels: [{ provider: 'gemini', model: 'gemini-2.0-flash' }],
      phoneticMode: 'off',
      translationStyle: 'general',
      translationReasoningEffort: 'auto',
      locale: 'en',
      localeAuto: false,
      sttProvider: 'auto',
      dynamicModels: {
        ...useAppStore.getState().dynamicModels,
        gemini: [{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '' }],
      },
      modelsLoading: { gemini: false, claude: false, openai: false, local: false },
      modelsError: { gemini: null, claude: null, openai: null, local: null },
      settingsOpen: false,
    })
  })
})

describe('TranslatePage', () => {
  it('renders the translate page without crashing', () => {
    const { container } = render(<TranslatePage />)
    expect(container).not.toBeNull()
  })

  it.each(['en', 'vi', 'ja'] as const)('renders the bilingual editor chrome in %s', (locale) => {
    act(() => {
      useAppStore.setState({ locale, localeAuto: false })
    })

    render(<TranslatePage />)
    const t = TRANSLATIONS[locale]

    expect(screen.getByRole('button', {
      name: new RegExp(`^${t.ai_configuration_title},`),
    })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(t.translate_from_label, 'i') }))
      .toHaveTextContent(t.lang_names.auto)
    expect(screen.getByRole('button', { name: new RegExp(t.translate_to_label, 'i') }))
      .toHaveTextContent(t.lang_names.vi)
    expect(screen.getByRole('heading', { name: t.translate_source_content_label }))
      .toHaveClass('translate-pane-heading')
    expect(getSourcePane()).toHaveAccessibleName(t.translate_source_content_label)
    expect(screen.getByRole('heading', { name: t.translate_result_content_label }))
      .toHaveClass('translate-pane-heading')
    expect(screen.getByRole('region', { name: t.translate_result_content_label }))
      .toHaveAccessibleName(t.translate_result_content_label)
    expect(screen.getByText(t.translate_empty_manual_hint)).toBeInTheDocument()
  })

  it('shows Translate button in manual mode', () => {
    render(<TranslatePage />)
    expect(screen.getByRole('button', { name: /^Translate$/i })).toBeDisabled()
  })

  it('applies model changes only after confirmation and switches comparison to manual mode', async () => {
    act(() => {
      useAppStore.setState({
        autoTranslate: true,
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
        dynamicModels: {
          ...useAppStore.getState().dynamicModels,
          openai: [{ id: 'gpt-4o', name: 'GPT 4o', description: '' }],
        },
      })
    })

    render(<TranslatePage />)
    const dialog = openTranslationModelDialog()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    fireEvent.click(within(dialog).getByRole('button', { name: /GPT 4o.*Select model/i }))

    expect(useAppStore.getState().translationModels).toEqual([
      { provider: 'gemini', model: 'gemini-2.0-flash' },
    ])
    expect(useAppStore.getState().autoTranslate).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', {
      name: 'AI configuration, 1 model',
    })).toHaveFocus())

    const reopenedDialog = openTranslationModelDialog()
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: /GPT 4o.*Select model/i }))
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'Apply 2 models' }))

    expect(useAppStore.getState().translationModels).toEqual([
      { provider: 'gemini', model: 'gemini-2.0-flash' },
      { provider: 'openai', model: 'gpt-4o' },
    ])
    expect(useAppStore.getState().autoTranslate).toBe(false)
    expect(screen.getByRole('button', { name: 'AI configuration, 2 models' }))
      .toHaveTextContent('AI configuration·2 models')
    expect(screen.queryByRole('button', { name: 'Auto translate' })).not.toBeInTheDocument()
    expect(screen.getByText('Manual translate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Translate with 2 models' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'AI Translate' }))
      .toHaveAttribute('data-layout', 'comparison')
  })

  it('explains the three-model limit and enables replacement after one model is removed', () => {
    act(() => {
      useAppStore.setState({
        keyStatus: { gemini: true, claude: true, openai: true, local: false },
        dynamicModels: {
          ...useAppStore.getState().dynamicModels,
          gemini: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '' },
            { id: 'gemini-experimental', name: 'Gemini Experimental', description: '' },
          ],
          claude: [{ id: 'claude-haiku', name: 'Claude Haiku', description: '' }],
          openai: [{ id: 'gpt-4o', name: 'GPT 4o', description: '' }],
        },
      })
    })

    render(<TranslatePage />)
    const dialog = openTranslationModelDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: /GPT 4o.*Select model/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Claude Haiku.*Select model/i }))

    expect(within(dialog).getByText(
      'Three models selected. Remove one to choose another.',
    )).toBeInTheDocument()
    const replacement = within(dialog).getByRole('button', {
      name: /Gemini Experimental.*Selection limit reached/i,
    })
    expect(replacement).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove model: GPT 4o' }))
    expect(replacement).toBeEnabled()
  })

  it('keeps a keyboard-focused model row clear of sticky headings and the scroll footer edge', () => {
    act(() => {
      useAppStore.setState({
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
        dynamicModels: {
          ...useAppStore.getState().dynamicModels,
          openai: [{ id: 'gpt-4o', name: 'GPT 4o', description: '' }],
        },
      })
    })

    render(<TranslatePage />)
    const dialog = openTranslationModelDialog()
    const row = within(dialog).getByRole('button', { name: /GPT 4o.*Select model/i })
    const scrollRegion = dialog.querySelector<HTMLElement>('.translate-model-available-list')
    const providerHeading = row.closest('.translate-model-provider-group')
      ?.querySelector<HTMLElement>('.translate-model-provider-heading')
    expect(scrollRegion).not.toBeNull()
    expect(providerHeading).not.toBeNull()
    if (!scrollRegion || !providerHeading) return

    const bounds = (top: number, bottom: number) => ({
      top,
      bottom,
      left: 0,
      right: 400,
      width: 400,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
    vi.spyOn(scrollRegion, 'getBoundingClientRect').mockReturnValue(bounds(100, 300))
    vi.spyOn(providerHeading, 'getBoundingClientRect').mockReturnValue(bounds(100, 136))
    const rowBounds = vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(bounds(110, 158))

    scrollRegion.scrollTop = 100
    fireEvent.focus(row)
    expect(scrollRegion.scrollTop).toBe(74)

    fireEvent.blur(row)
    rowBounds.mockReturnValue(bounds(280, 328))
    fireEvent.focus(row)
    expect(scrollRegion.scrollTop).toBe(102)
    expect(useAppStore.getState().translationModels).toEqual([
      { provider: 'gemini', model: 'gemini-2.0-flash' },
    ])
  })

  it('reuses an existing translation only for the model that produced it', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({
      success: true,
      translatedText: 'Existing Gemini result',
    })
    act(() => {
      useAppStore.setState({
        sourceText: 'Translate this',
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
        dynamicModels: {
          ...useAppStore.getState().dynamicModels,
          openai: [{ id: 'gpt-4o', name: 'GPT 4o', description: '' }],
        },
      })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))
    expect(await screen.findByText('Existing Gemini result')).toBeInTheDocument()

    const dialog = openTranslationModelDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: /GPT 4o.*Select model/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply 2 models' }))

    const geminiCard = screen.getByRole('article', { name: /Gemini 2.0 Flash.*Google Gemini/i })
    const openAiCard = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    expect(within(geminiCard).getByText('Existing Gemini result')).toBeInTheDocument()
    expect(within(openAiCard).getByText('Choose Translate to run this model.')).toBeInTheDocument()
    expect(within(openAiCard).queryByText('Existing Gemini result')).not.toBeInTheDocument()
  })

  it('runs selected provider models in parallel and presents equal result actions', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    vi.mocked(window.api.translate).mockImplementation(async ({ provider }) => ({
      success: true,
      translatedText: provider === 'gemini' ? 'Bản dịch Gemini' : 'Bản dịch OpenAI',
    }))
    act(() => {
      useAppStore.setState({
        sourceText: 'Translate this',
        translationModels: [
          { provider: 'gemini', model: 'gemini-2.0-flash' },
          { provider: 'openai', model: 'gpt-4o' },
        ],
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
        history: [],
      })
    })

    render(<TranslatePage />)
    expect(screen.getByRole('button', { name: 'AI configuration, 2 models' }))
      .toHaveTextContent('2 models')
    expect(screen.getByText('2 independent requests')).toBeInTheDocument()
    expect(screen.getByText('Each model runs independently. One failure will not stop the other results.'))
      .toBeInTheDocument()
    expect(screen.getAllByRole('article').every((card) => within(card).getByText('Ready')))
      .toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Translate with 2 models' }))

    await waitFor(() => expect(window.api.translate).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Bản dịch Gemini')).toBeInTheDocument()
    expect(await screen.findByText('Bản dịch OpenAI')).toBeInTheDocument()
    expect(useAppStore.getState().translatedText).toBe('')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Translation results' })).toBeInTheDocument()

    const geminiCard = screen.getByRole('article', { name: /Gemini 2.0 Flash.*Google Gemini/i })
    const openAiCard = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    expect(within(geminiCard).getByText(/Complete/)).toBeInTheDocument()
    expect(within(openAiCard).getByText(/Complete/)).toBeInTheDocument()
    expect(within(geminiCard).getByRole('button', {
      name: /Read aloud: Gemini 2.0 Flash.*Google Gemini/i,
    })).toBeInTheDocument()
    expect(within(openAiCard).getByRole('button', {
      name: /Read aloud: GPT 4o.*OpenAI/i,
    })).toBeInTheDocument()

    fireEvent.click(within(openAiCard).getByRole('button', { name: /Copy: GPT 4o.*OpenAI/i }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Bản dịch OpenAI')
    })
    expect(await within(openAiCard).findByRole('button', { name: /Copied!: GPT 4o.*OpenAI/i }))
      .toBeInTheDocument()
    expect(within(geminiCard).getByRole('button', { name: /Copy: Gemini 2.0 Flash.*Google Gemini/i }))
      .toBeInTheDocument()

    const comparisonHistory = useAppStore.getState().history
      .filter((item) => item.sourceText === 'Translate this')
    expect(comparisonHistory).toHaveLength(2)
    expect(comparisonHistory.map((item) => item.translatedText).sort()).toEqual([
      'Bản dịch Gemini',
      'Bản dịch OpenAI',
    ])

    fireEvent.change(getSourceInput(), { target: { value: 'Translate this updated' } })
    expect(screen.getByText('The source changed. Translate again to update this result.'))
      .toBeInTheDocument()
  })

  it('keeps successful comparison results when one provider fails and retries only that model', async () => {
    vi.mocked(window.api.translate)
      .mockImplementationOnce(async () => ({ success: true, translatedText: 'Gemini succeeded' }))
      .mockImplementationOnce(async () => ({
        success: false,
        error: 'rate limited',
        errorCode: 'RATE_LIMIT',
      }))
      .mockImplementationOnce(async () => ({ success: true, translatedText: 'OpenAI recovered' }))
    act(() => {
      useAppStore.setState({
        sourceText: 'Translate this',
        translationModels: [
          { provider: 'gemini', model: 'gemini-2.0-flash' },
          { provider: 'openai', model: 'gpt-4o' },
        ],
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
      })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate with 2 models' }))

    expect(await screen.findByText('Gemini succeeded')).toBeInTheDocument()
    const openAiCard = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    expect(await within(openAiCard).findByText(
      'OpenAI is rate limited. Wait briefly, then retry this model.',
    )).toBeInTheDocument()
    expect(within(openAiCard).getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('2 of 2 complete')).toBeInTheDocument()
    const geminiCard = screen.getByRole('article', { name: /Gemini 2.0 Flash.*Google Gemini/i })
    expect(within(geminiCard).queryByRole('button', { name: 'Retry this model' }))
      .not.toBeInTheDocument()
    const retryButton = within(openAiCard).getByRole('button', { name: 'Retry this model' })
    await waitFor(() => expect(retryButton).toBeEnabled())
    fireEvent.click(retryButton)

    expect(await within(openAiCard).findByText('OpenAI recovered')).toBeInTheDocument()
    expect(window.api.translate).toHaveBeenCalledTimes(3)
    expect(window.api.translate).toHaveBeenLastCalledWith(expect.objectContaining({
      provider: 'openai',
      model: 'gpt-4o',
    }))
  })

  it('classifies an unavailable provider model and opens the transactional picker', async () => {
    vi.mocked(window.api.translate)
      .mockResolvedValueOnce({ success: true, translatedText: 'Gemini succeeded' })
      .mockResolvedValueOnce({
        success: false,
        error: '404 not_found_error: model gpt-4o does not exist',
      })
    act(() => {
      useAppStore.setState({
        sourceText: 'Translate this',
        translationModels: [
          { provider: 'gemini', model: 'gemini-2.0-flash' },
          { provider: 'openai', model: 'gpt-4o' },
        ],
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
      })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate with 2 models' }))

    const openAiCard = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    expect(await within(openAiCard).findByText(
      'GPT 4o is unavailable from OpenAI. Choose another model.',
    )).toBeInTheDocument()
    expect(within(openAiCard).queryByRole('button', { name: 'Retry this model' }))
      .not.toBeInTheDocument()
    fireEvent.click(within(openAiCard).getByRole('button', { name: 'Change model' }))
    expect(screen.getByRole('dialog', { name: 'Translation models' })).toBeInTheDocument()
    expect(useAppStore.getState().translationModels).toHaveLength(2)
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
      render(<TranslatePage />)
      fireEvent.click(screen.getByRole('button', { name: TRANSLATIONS.en.voice_record }))

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

  it('does not auto-translate a pasted image while manual mode is active', async () => {
    vi.useFakeTimers()
    const file = new File(['image'], 'manual.png', { type: 'image/png' })
    vi.mocked(extractImageFromClipboard).mockReturnValue(file)

    render(<TranslatePage />)

    act(() => {
      fireEvent.paste(getSourcePane(), {
        clipboardData: { items: [] },
      })
    })

    await act(async () => {})

    expect(resizeImageFile).toHaveBeenCalledWith(file, expect.any(Number), { useQualityLoop: true })

    act(() => {
      vi.advanceTimersByTime(IMAGE_AUTO_TRANSLATE_DELAY_MS + 50)
    })

    expect(window.api.translateImage).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('clears a pasted image when the source delete button is clicked', async () => {
    const file = new File(['image'], 'clear.png', { type: 'image/png' })
    vi.mocked(extractImageFromClipboard).mockReturnValue(file)

    render(<TranslatePage />)

    act(() => {
      fireEvent.paste(getSourcePane(), {
        clipboardData: { items: [] },
      })
    })

    await act(async () => {})

    expect(screen.getByAltText('mock.png')).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByTitle(/Clear|Xóa/i))
    })

    expect(screen.queryByAltText('mock.png')).not.toBeInTheDocument()
    expect(window.api.translateImage).not.toHaveBeenCalled()
  })

  it('restarts an in-flight manual translation when the target language changes', async () => {
    type TranslateApiResult = Awaited<ReturnType<typeof window.api.translate>>
    let resolveFirst: ((value: TranslateApiResult) => void) | undefined

    vi.mocked(window.api.translate)
      .mockImplementationOnce(() => new Promise<TranslateApiResult>((resolve) => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce({ success: true, translatedText: 'こんにちは' })

    act(() => {
      useAppStore.setState({
        sourceText: 'Hello',
        targetLang: 'vi',
        autoTranslate: false,
      })
    })

    render(<TranslatePage />)

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^(Translate|Dịch)$/i }))
    })

    await waitFor(() => {
      expect(window.api.translate).toHaveBeenCalledWith(expect.objectContaining({
        sourceText: 'Hello',
        targetLang: 'vi',
      }))
    })

    act(() => {
      useAppStore.getState().setTargetLang('ja')
    })

    await waitFor(() => {
      expect(window.api.translate).toHaveBeenCalledTimes(2)
      expect(window.api.translate).toHaveBeenLastCalledWith(expect.objectContaining({
        sourceText: 'Hello',
        targetLang: 'ja',
      }))
    })

    expect(window.api.cancelTranslate).toHaveBeenCalledWith(expect.objectContaining({
      requestId: expect.any(String),
    }))

    await waitFor(() => {
      expect(useAppStore.getState().translatedText).toBe('こんにちは')
    })

    await act(async () => {
      resolveFirst?.({ success: true, translatedText: 'Xin chào cũ' })
    })

    expect(useAppStore.getState().translatedText).toBe('こんにちは')
  })

  it('cancels an in-flight result when the source draft changes', async () => {
    type TranslateApiResult = Awaited<ReturnType<typeof window.api.translate>>
    let resolveRequest: ((value: TranslateApiResult) => void) | undefined

    vi.mocked(window.api.translate).mockImplementationOnce(() => (
      new Promise<TranslateApiResult>((resolve) => { resolveRequest = resolve })
    ))
    act(() => {
      useAppStore.setState({ sourceText: 'Original source' })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))

    await waitFor(() => expect(window.api.translate).toHaveBeenCalledTimes(1))
    fireEvent.change(getSourceInput(), { target: { value: 'Edited source' } })

    expect(window.api.cancelTranslate).toHaveBeenCalledWith({
      requestId: expect.any(String),
    })

    await act(async () => {
      resolveRequest?.({ success: true, translatedText: 'Outdated result' })
    })

    expect(useAppStore.getState().translatedText).toBe('')
    expect(screen.queryByText('Outdated result')).not.toBeInTheDocument()
  })

  it('clears the shared translating state when leaving during a request', async () => {
    vi.mocked(window.api.translate).mockImplementationOnce(() => new Promise(() => {}))
    act(() => {
      useAppStore.setState({ sourceText: 'Navigate away while translating' })
    })

    const view = render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))
    await waitFor(() => expect(useAppStore.getState().isTranslating).toBe(true))

    view.unmount()

    expect(useAppStore.getState().isTranslating).toBe(false)
  })

  it('cancels an in-flight text result when an image replaces the source', async () => {
    type TranslateApiResult = Awaited<ReturnType<typeof window.api.translate>>
    let resolveRequest: ((value: TranslateApiResult) => void) | undefined
    const file = new File(['image'], 'replacement.png', { type: 'image/png' })

    vi.mocked(window.api.translate).mockImplementationOnce(() => (
      new Promise<TranslateApiResult>((resolve) => { resolveRequest = resolve })
    ))
    vi.mocked(extractImageFromClipboard).mockReturnValue(file)
    act(() => {
      useAppStore.setState({ sourceText: 'Original source' })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))
    await waitFor(() => expect(window.api.translate).toHaveBeenCalledTimes(1))

    fireEvent.paste(getSourcePane(), { clipboardData: { items: [] } })

    await waitFor(() => expect(resizeImageFile).toHaveBeenCalledWith(
      file,
      expect.any(Number),
      { useQualityLoop: true },
    ))
    expect(window.api.cancelTranslate).toHaveBeenCalledWith({ requestId: expect.any(String) })

    await act(async () => {
      resolveRequest?.({ success: true, translatedText: 'Outdated text result' })
    })

    expect(useAppStore.getState().translatedText).toBe('')
    expect(screen.queryByText('Outdated text result')).not.toBeInTheDocument()
  })

  it('does not attach an image whose preprocessing finishes after Clear', async () => {
    type ResizeResult = Awaited<ReturnType<typeof resizeImageFile>>
    let resolveResize: ((value: ResizeResult) => void) | undefined
    const file = new File(['image'], 'slow.png', { type: 'image/png' })

    vi.mocked(extractImageFromClipboard).mockReturnValue(file)
    vi.mocked(resizeImageFile).mockImplementationOnce(() => (
      new Promise<ResizeResult>((resolve) => { resolveResize = resolve })
    ))
    act(() => {
      useAppStore.setState({ sourceText: 'Keep the clear action available' })
    })

    render(<TranslatePage />)
    fireEvent.paste(getSourcePane(), { clipboardData: { items: [] } })
    fireEvent.click(screen.getByTitle(/Clear|Xóa/i))

    await act(async () => {
      resolveResize?.({
        base64: 'slow-image',
        mimeType: 'image/png',
        previewUrl: 'data:image/png;base64,slow-image',
        width: 100,
        height: 80,
        fileName: 'slow.png',
      })
    })

    expect(screen.queryByAltText('slow.png')).not.toBeInTheDocument()
    expect(useAppStore.getState().sourceText).toBe('')
  })

  it('does not let a delayed rewrite restore source text after Clear', async () => {
    type RewriteResult = Awaited<ReturnType<typeof window.api.rewriteText>>
    let resolveRewrite: ((value: RewriteResult) => void) | undefined

    vi.mocked(window.api.rewriteText).mockImplementationOnce(() => (
      new Promise<RewriteResult>((resolve) => { resolveRewrite = resolve })
    ))
    act(() => {
      useAppStore.setState({ sourceText: 'Rewrite this source' })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByTitle(/^Rewrite$/i))
    fireEvent.click(screen.getByTitle(/^Clear$/i))

    await act(async () => {
      resolveRewrite?.({ success: true, translatedText: 'Delayed rewritten source' })
    })

    expect(useAppStore.getState().sourceText).toBe('')
    expect(screen.queryByText('Delayed rewritten source')).not.toBeInTheDocument()
  })

  it('marks a completed manual result stale after the source changes', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({
      success: true,
      translatedText: 'Xin chào',
    })
    act(() => {
      useAppStore.setState({ sourceText: 'Hello' })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))
    await waitFor(() => expect(useAppStore.getState().translatedText).toBe('Xin chào'))

    fireEvent.change(getSourceInput(), { target: { value: 'Hello there' } })

    expect(screen.getAllByText(/The source changed\. Translate again/i)).not.toHaveLength(0)
  })

  it('preserves stale-result tracking after leaving and returning to the page', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({
      success: true,
      translatedText: 'Xin chào',
    })
    act(() => {
      useAppStore.setState({ sourceText: 'Hello' })
    })

    const firstRender = render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))
    await waitFor(() => expect(useAppStore.getState().translatedText).toBe('Xin chào'))
    firstRender.unmount()

    render(<TranslatePage />)
    fireEvent.change(getSourceInput(), { target: { value: 'Hello again' } })

    expect(screen.getAllByText(/The source changed\. Translate again/i)).not.toHaveLength(0)
  })

  it('submits translation with Enter without an IME composition', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({
      success: true,
      translatedText: 'Bản dịch',
    })
    act(() => {
      useAppStore.setState({ sourceText: 'Keyboard source' })
    })

    render(<TranslatePage />)
    const eventContinues = fireEvent.keyDown(getSourceInput(), { key: 'Enter' })

    expect(eventContinues).toBe(false)
    await waitFor(() => expect(window.api.translate).toHaveBeenCalledTimes(1))
  })

  it('keeps Shift+Enter available for a new line', () => {
    act(() => {
      useAppStore.setState({ sourceText: 'First line' })
    })

    render(<TranslatePage />)
    const eventContinues = fireEvent.keyDown(getSourceInput(), {
      key: 'Enter',
      shiftKey: true,
    })

    expect(eventContinues).toBe(true)
    expect(window.api.translate).not.toHaveBeenCalled()
  })

  it('does not submit Enter while an IME composition is active', () => {
    act(() => {
      useAppStore.setState({ sourceText: '入力中' })
    })

    render(<TranslatePage />)
    fireEvent.keyDown(getSourceInput(), {
      key: 'Enter',
      isComposing: true,
    })

    expect(window.api.translate).not.toHaveBeenCalled()
  })

  it.each([
    ['en', 'Auto translate'],
    ['vi', 'Dịch tự động'],
    ['ja', '自動翻訳'],
  ] as const)('shows an explicit automatic-translation label in %s', (locale, label) => {
    act(() => {
      useAppStore.setState({ autoTranslate: true, locale, localeAuto: false })
    })

    render(<TranslatePage />)
    expect(screen.getByRole('button', { name: label, pressed: true })).toBeInTheDocument()
  })

  it('keeps a stable Auto translate label while switching state', () => {
    render(<TranslatePage />)
    expect(useAppStore.getState().autoTranslate).toBe(false)

    const toggle = screen.getByRole('button', { name: 'Auto translate', pressed: false })
    act(() => { fireEvent.click(toggle) })

    expect(useAppStore.getState().autoTranslate).toBe(true)
    expect(screen.getByRole('button', { name: 'Auto translate', pressed: true })).toBeInTheDocument()
  })

  it('uses one accurate auto-translate message after typing stops', () => {
    act(() => {
      useAppStore.setState({ autoTranslate: true, locale: 'vi', localeAuto: false })
    })

    render(<TranslatePage />)

    expect(screen.getByText(TRANSLATIONS.vi.translate_empty_auto_hint)).toBeInTheDocument()
    expect(screen.queryByText(/trong khi gõ/i)).not.toBeInTheDocument()
  })

  it('exposes labelled language controls in one scoped AI configuration flow', async () => {
    act(() => {
      useAppStore.setState({
        selectedModels: {
          ...useAppStore.getState().selectedModels,
          gemini: 'gemini-2.5-flash',
        },
        translationModels: [{ provider: 'gemini', model: 'gemini-2.5-flash' }],
        dynamicModels: {
          ...useAppStore.getState().dynamicModels,
          gemini: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '' }],
        },
      })
    })
    render(<TranslatePage />)

    expect(getSourcePane()).toHaveAccessibleName('Source content')
    expect(screen.getByRole('region', { name: /^Translation$/i }))
      .toHaveAccessibleName('Translation')
    expect(screen.getByRole('button', { name: /Translate from/i }))
      .toHaveTextContent('Auto Detect')
    expect(screen.getByRole('button', { name: /Translate to/i }))
      .toHaveTextContent('Vietnamese')

    const optionsButton = screen.getByRole('button', { name: 'AI configuration, 1 model' })
    expect(optionsButton).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(optionsButton)
    expect(optionsButton).toHaveAttribute('aria-expanded', 'true')
    const optionsDialog = screen.getByRole('dialog', { name: 'AI configuration' })
    expect(optionsDialog).toBeInTheDocument()
    const styleSelect = within(optionsDialog).getByRole('button', { name: 'Style General' })
    const reasoningSelect = within(optionsDialog).getByRole('button', {
      name: 'Reasoning Automatic',
    })
    expect(styleSelect).toBeInTheDocument()
    expect(reasoningSelect).toBeEnabled()
    expect(within(optionsDialog).queryByRole('button', { name: 'Advanced' }))
      .not.toBeInTheDocument()
    expect(within(optionsDialog).queryByRole('button', { name: 'Done' }))
      .not.toBeInTheDocument()
    expect(within(optionsDialog).queryByRole('button', { name: 'Reset defaults' }))
      .not.toBeInTheDocument()
    await waitFor(() => expect(within(optionsDialog).getByRole('button', {
      name: 'Choose translation models, 1 selected',
    })).toHaveFocus())

    fireEvent.click(reasoningSelect)
    fireEvent.click(screen.getByRole('option', { name: 'High' }))
    expect(useAppStore.getState().translationReasoningEffort).toBe('high')
    fireEvent.click(within(optionsDialog).getByRole('button', { name: 'Reset defaults' }))
    expect(useAppStore.getState().translationReasoningEffort).toBe('auto')
    expect(within(optionsDialog).queryByRole('button', { name: 'Reset defaults' }))
      .not.toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(optionsButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'AI configuration' })).not.toBeInTheDocument()

    fireEvent.click(optionsButton)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(optionsButton).toHaveAttribute('aria-expanded', 'false')
    expect(optionsButton).toHaveFocus()

    fireEvent.click(optionsButton)
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(screen.queryByRole('dialog', { name: 'AI configuration' })).not.toBeInTheDocument()
    expect(optionsButton).toHaveFocus()

    fireEvent.click(optionsButton)
    const modelsButton = within(screen.getByRole('dialog', { name: 'AI configuration' })).getByRole('button', {
      name: 'Choose translation models, 1 selected',
    })
    fireEvent.click(modelsButton)
    const modelsDialog = screen.getByRole('dialog', { name: 'Translation models' })
    expect(modelsDialog).toHaveAttribute('aria-modal', 'true')
    expect(modelsDialog).toBeInTheDocument()
    const modelSearch = within(modelsDialog).getByRole('searchbox', { name: 'Search models…' })
    expect(modelSearch).toBeInTheDocument()
    await waitFor(() => expect(modelSearch).toHaveFocus())
    expect(within(modelsDialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(modelsDialog).getByRole('button', { name: 'Apply 1 model' })).toBeDisabled()
    expect(within(modelsDialog).queryByLabelText('Style')).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Translation models' })).not.toBeInTheDocument()
    await waitFor(() => expect(optionsButton).toHaveFocus())
  })

  it('swaps an explicit language pair before a translation exists', () => {
    act(() => {
      useAppStore.setState({ sourceLang: 'en', targetLang: 'vi' })
    })

    render(<TranslatePage />)
    const swapButton = screen.getByRole('button', { name: 'Swap languages' })
    expect(swapButton.parentElement).not.toHaveAttribute('tabindex')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(swapButton)

    expect(screen.getByRole('button', { name: /Translate from/i })).toHaveTextContent('Vietnamese')
    expect(screen.getByRole('button', { name: /Translate to/i })).toHaveTextContent('English')
  })

  it('keeps swap disabled for Auto until the source language is detected', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({
      success: true,
      translatedText: 'Xin chào',
    })
    act(() => {
      useAppStore.setState({ sourceText: 'Hello', sourceLang: 'auto' })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))
    await waitFor(() => expect(useAppStore.getState().translatedText).toBe('Xin chào'))

    expect(screen.getByRole('button', { name: 'Swap languages' })).toBeDisabled()
  })

  it('makes the disabled swap reason discoverable from the keyboard', () => {
    render(<TranslatePage />)

    const swapButton = screen.getByRole('button', { name: 'Swap languages' })
    const swapGroup = screen.getByRole('group', { name: 'Swap languages' })
    const reason = TRANSLATIONS.en.translate_swap_disabled_auto

    expect(swapButton).toBeDisabled()
    expect(swapButton).toHaveAccessibleDescription(reason)
    expect(swapGroup).toHaveAttribute('tabindex', '0')
    expect(swapGroup).toHaveAttribute('aria-disabled', 'true')
    expect(swapGroup).toHaveAccessibleDescription(reason)
    expect(screen.getByRole('tooltip')).toHaveTextContent(reason)
  })

  it('localizes structured provider errors instead of rendering backend English', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({
      success: false,
      error: 'Invalid API key. Please check your key in Settings.',
      errorCode: 'INVALID_KEY',
    })
    act(() => {
      useAppStore.setState({ sourceText: 'Hello', locale: 'vi', localeAuto: false })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Dịch$/i }))

    expect(await screen.findByText('API key không hợp lệ. Vui lòng kiểm tra trong Cài đặt.')).toBeInTheDocument()
  })

  it('does not leak an unstructured backend exception into the localized UI', async () => {
    vi.mocked(window.api.translate).mockRejectedValueOnce(new Error('Backend exploded in English'))
    act(() => {
      useAppStore.setState({ sourceText: 'Hello', locale: 'vi', localeAuto: false })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Dịch$/i }))

    expect(await screen.findByText('Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.')).toBeInTheDocument()
    expect(screen.queryByText('Backend exploded in English')).not.toBeInTheDocument()
  })

  it('uses translation-specific copy for an empty model response', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({
      success: false,
      error: 'The model returned an empty response.',
      errorCode: 'EMPTY_RESPONSE',
    })
    act(() => {
      useAppStore.setState({ sourceText: 'Hello', locale: 'vi', localeAuto: false })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Dịch$/i }))

    expect(await screen.findByText(
      'Mô hình không trả về bản dịch. Hãy thử lại hoặc chọn mô hình khác.',
    )).toBeInTheDocument()
  })

  it('shows result placeholder when no translation yet', () => {
    render(<TranslatePage />)
    expect(screen.queryByRole('heading', { name: /Ready to translate|Sẵn sàng dịch/i })).not.toBeInTheDocument()
    expect(screen.getByText(/appear here after you choose Translate|xuất hiện ở đây sau khi bạn chọn Dịch/i)).toBeInTheDocument()
  })

  it('shows labelled voice and image entry points only while the source is empty', () => {
    render(<TranslatePage />)
    const voiceButton = screen.getByRole('button', { name: TRANSLATIONS.en.voice_record })
    const imageButton = screen.getByRole('button', { name: TRANSLATIONS.en.translate_add_image })

    expect(voiceButton).toHaveTextContent(TRANSLATIONS.en.voice_record)
    expect(imageButton).toHaveTextContent(TRANSLATIONS.en.translate_add_image)

    fireEvent.change(getSourceInput(), { target: { value: 'Hello' } })

    expect(voiceButton).not.toHaveTextContent(TRANSLATIONS.en.voice_record)
    expect(imageButton).not.toHaveTextContent(TRANSLATIONS.en.translate_add_image)
  })

  it('renders a text input area for source text', () => {
    render(<TranslatePage />)
    expect(getSourceInput().getAttribute('placeholder')).toMatch(/Enter or paste text|Nhập hoặc dán văn bản/i)
  })

  it('shows error message when translateError is set', () => {
    act(() => {
      useAppStore.setState({ translateError: 'API key invalid' })
    })
    render(<TranslatePage />)
    expect(screen.getByText('API key invalid')).toBeInTheDocument()
  })

  it('preserves the draft and opens the model picker from a recoverable error', () => {
    act(() => {
      useAppStore.setState({
        sourceText: 'Keep this draft',
        translateError: 'Translation failed.',
        translateErrorCode: 'EMPTY_RESPONSE',
      })
    })

    render(<TranslatePage />)
    expect(getSourceInput()).toHaveValue('Keep this draft')
    expect(screen.getByRole('alert')).toHaveTextContent('Google Gemini · Gemini 2.0 Flash')

    fireEvent.click(screen.getByRole('button', { name: 'Choose another model' }))
    expect(screen.getByRole('dialog', { name: 'Translation models' })).toBeInTheDocument()
    expect(getSourceInput()).toHaveValue('Keep this draft')
  })

  it('offers Settings as an additional recovery path for API key failures', () => {
    act(() => {
      useAppStore.setState({
        sourceText: 'Keep this draft',
        translateError: 'Invalid API key.',
        translateErrorCode: 'INVALID_KEY',
        settingsOpen: false,
      })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(useAppStore.getState().settingsOpen).toBe(true)
    expect(getSourceInput()).toHaveValue('Keep this draft')
  })

  it('shows phonetic toggle button', () => {
    render(<TranslatePage />)
    openTranslationSettings()
    // Reading display is available directly in the settings panel.
    expect(screen.getByRole('button', {
      name: /Reading (Do not show|Không hiển thị|表示しない)/i,
    })).toBeInTheDocument()
  })

  it('generates phonetic text when phonetic mode is enabled after translation', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({
      success: true,
      translatedText: '{東京|とうきょう}',
    })

    act(() => {
      useAppStore.setState({
        translatedText: '東京',
        targetLang: 'ja',
        phoneticMode: 'off',
      })
    })

    render(<TranslatePage />)
    openTranslationSettings()

    fireEvent.click(screen.getByRole('button', {
      name: /Reading (Do not show|Không hiển thị|表示しない)/i,
    }))
    fireEvent.click(screen.getByRole('option', {
      name: /Show with text|Kèm cách đọc|本文に併記/i,
    }))

    await waitFor(() => {
      expect(window.api.translate).toHaveBeenCalledWith(expect.objectContaining({
        sourceText: '東京',
        sourceLang: 'ja',
        targetLang: 'ja',
        showFurigana: true,
        phoneticOnly: true,
        phoneticMode: 'standard',
      }))
      expect(useAppStore.getState().phoneticText).toBe('{東京|とうきょう}')
    })
  })

  // ── Required: source text input nhận giá trị ──────────────────────────────
  it('source text input renders the entered value', () => {
    act(() => {
      useAppStore.setState({ sourceText: 'Hello world' })
    })
    render(<TranslatePage />)
    expect(getSourceInput()).toHaveValue('Hello world')
  })

  // ── Required: clear button xuất hiện khi có source text ───────────────────
  it('clear button does NOT appear when source text is empty', () => {
    // beforeEach already sets sourceText: ''
    render(<TranslatePage />)
    expect(screen.queryByTitle(/Clear|Xóa|クリア/i)).toBeNull()
  })

  it('clear button appears when source text is present', () => {
    act(() => {
      useAppStore.setState({ sourceText: 'Some text to translate' })
    })
    render(<TranslatePage />)
    expect(screen.queryByTitle(/Clear|Xóa|クリア/i)).not.toBeNull()
  })

  // ── Required: character counter hiển thị đúng ─────────────────────────────
  it('character counter displays the correct character count', () => {
    act(() => {
      useAppStore.setState({ sourceText: 'Hello' }) // exactly 5 characters
    })
    render(<TranslatePage />)
    expect(document.querySelector('.translate-char-count')).toHaveTextContent(/^5 chars$/)
  })

  it('explains the soft threshold and still submits the full long text', async () => {
    const longText = 'x'.repeat(TRANSLATE_INPUT_WARNING_CHARS + 1)
    act(() => {
      useAppStore.setState({ sourceText: longText })
    })

    render(<TranslatePage />)
    const translateButton = screen.getByRole('button', { name: /^Translate$/i })
    const counter = document.querySelector('.translate-char-count')
    const notice = TRANSLATIONS.en.translate_long_text_notice(TRANSLATE_INPUT_WARNING_CHARS)

    expect(translateButton).toBeEnabled()
    expect(counter).toHaveClass('translate-char-count-notice')
    expect(counter).toHaveTextContent('5,001 chars·May take longer')
    expect(getSourceInput()).toHaveAccessibleDescription(new RegExp(notice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    fireEvent.click(translateButton)
    await waitFor(() => expect(window.api.translate).toHaveBeenCalledTimes(1))
    expect(window.api.translate).toHaveBeenCalledWith(expect.objectContaining({ sourceText: longText }))
  })
})


describe('language pair workflow', () => {
  it('swaps languages without moving the translated result into the draft', async () => {
    vi.mocked(window.api.translate).mockResolvedValue({ success: true, translatedText: 'Xin chào' })
    act(() => useAppStore.setState({ sourceLang: 'en', targetLang: 'vi', sourceText: 'Hello' }))
    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    await screen.findByRole('button', { name: 'Use as source' })
    fireEvent.click(screen.getByRole('button', { name: 'Swap languages' }))
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'vi', targetLang: 'en', sourceText: 'Hello', translatedText: 'Xin chào' })
    expect(screen.getAllByText(TRANSLATIONS.en.translate_result_stale_manual).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Use as source' })).not.toBeInTheDocument()
    expect(window.api.translate).toHaveBeenCalledTimes(1)
  })

  it('uses the selected model result as source and permits swapping in comparison mode', async () => {
    vi.mocked(window.api.translate).mockImplementation(async ({ provider }) => ({ success: true,
      translatedText: provider === 'gemini' ? 'First translation' : 'Chosen translation' }))
    act(() => useAppStore.setState({ sourceLang: 'en', targetLang: 'vi', sourceText: 'Hello',
      translationModels: [{ provider: 'gemini', model: 'gemini-2.0-flash' }, { provider: 'openai', model: 'gpt-4o' }],
      keyStatus: { gemini: true, claude: false, openai: true, local: false } }))
    render(<TranslatePage />)
    expect(screen.getByRole('button', { name: 'Swap languages' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Translate with 2 models' }))
    const useResult = await screen.findByRole('button', { name: /Use as source: GPT 4o/ })
    await waitFor(() => expect(useResult).toBeEnabled())
    fireEvent.click(useResult)
    expect(useAppStore.getState()).toMatchObject({ sourceText: 'Chosen translation', sourceLang: 'vi', targetLang: 'en', translatedText: '' })
    expect(window.api.translate).toHaveBeenCalledTimes(2)
  })

  it('switches both languages atomically while a manual request is running', async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof window.api.translate>>) => void
    vi.mocked(window.api.translate).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValueOnce({ success: true, translatedText: 'New pair result' })
    act(() => useAppStore.setState({ sourceLang: 'en', targetLang: 'vi', sourceText: 'Hello',
      pinnedLanguagePairs: [{ source: 'vi', target: 'ja' }], languagePairDirections: { translate: {}, live: {} } }))
    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    await waitFor(() => expect(window.api.translate).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /^Translate to:/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Translate to' })).getByRole('button', { name: 'Vietnamese → Japanese' }))
    await waitFor(() => expect(useAppStore.getState().translatedText).toBe('New pair result'))
    expect(window.api.translate).toHaveBeenCalledTimes(2)
    expect(window.api.translate).toHaveBeenLastCalledWith(expect.objectContaining({ sourceLang: 'vi', targetLang: 'ja' }))
    await act(async () => { resolveOld({ success: true, translatedText: 'Late old result' }) })
    expect(useAppStore.getState().translatedText).toBe('New pair result')
  })
})
