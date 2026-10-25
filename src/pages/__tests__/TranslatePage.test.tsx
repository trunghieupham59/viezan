import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../components/organisms/NotificationViewport'
import { MAX_IMAGE_INPUT_BYTES } from '../../constants/image'
import { TRANSLATE_INPUT_WARNING_CHARS } from '../../constants/providers'
import { IMAGE_AUTO_TRANSLATE_DELAY_MS } from '../../constants/ui'
import { TRANSLATIONS } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { HistoryItem } from '../../types'
import { extractImageFromClipboard, resizeImageFile } from '../../utils/imageUtils'
import { formatModelName } from '../../utils/modelDisplay'
import { tpl } from '../../utils/tpl'
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
  const configButton = screen.getByRole('button', { name: /AI configuration|Cấu hình AI|AI設定/i })
  act(() => {
    fireEvent.click(configButton)
  })
}

function openTranslationModelDialog() {
  openTranslationSettings()
  const configDialog = screen.getByRole('dialog', {
    name: /AI configuration|Cấu hình AI|AI設定/i,
  })
  fireEvent.click(within(configDialog).getByRole('button', {
    name: /Choose translation models|Chọn mô hình dịch|翻訳モデル/i,
  }))
  return screen.getByRole('dialog', { name: 'Translation models' })
}

function getSourcePane() {
  return screen.getByRole('region', { name: /^(Source content|Nguồn|原文)$/i })
}

function getSourceInput() {
  return screen.getByRole('textbox', { name: /^(Source content|Nguồn|原文)$/i })
}

// Reset store before each test
const COMPARISON_ENTRY: HistoryItem = {
        id: 'hist-compare-1',
        timestamp: 1,
        provider: 'openai',
        model: 'gpt-4o',
        sourceLang: 'en',
        targetLang: 'vi',
        sourceText: 'Translate this',
        translatedText: 'Bản dịch OpenAI',
        selectedKey: 'openai:gpt-4o',
        results: [
          { provider: 'gemini', model: 'gemini-2.0-flash', translatedText: 'Bản dịch Gemini', durationMs: 120 },
          { provider: 'openai', model: 'gpt-4o', translatedText: 'Bản dịch OpenAI', durationMs: 90 },
        ],
      }

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
      activePage: 'translate',
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
    // The stored preference survives; comparison only suspends it.
    expect(useAppStore.getState().autoTranslate).toBe(true)
    expect(screen.getByRole('button', { name: 'AI configuration, 2 models' })).toBeInTheDocument()
    // Auto-translate lives in the options popover.
    openTranslationSettings()
    const suspendedToggle = screen.getByRole('button', { name: 'Auto translate' })
    expect(suspendedToggle).toBeDisabled()
    expect(suspendedToggle).toHaveAttribute('aria-pressed', 'false')
    expect(suspendedToggle).toHaveAttribute(
      'title',
      'Comparison runs manually. Each model sends a separate provider request.',
    )
    expect(screen.getByRole('button', { name: 'Translate · 2 models' })).toBeDisabled()
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
    // The result shows on the workbench and, once saved, as a row of the history panel.
    expect(await screen.findAllByText('Existing Gemini result')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Use this: Translate this' })).toHaveAttribute('aria-current', 'true')

    const dialog = openTranslationModelDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: /GPT 4o.*Select model/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply 2 models' }))

    const geminiCard = screen.getByRole('article', { name: /Gemini 2.0 Flash.*Google Gemini/i })
    const openAiCard = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    expect(within(geminiCard).getByText('Existing Gemini result')).toBeInTheDocument()
    expect(within(openAiCard).getByText('Choose Translate to run this model.')).toBeInTheDocument()
    expect(within(openAiCard).queryByText('Existing Gemini result')).not.toBeInTheDocument()
  })

  it('shows the history panel beside the workbench and remembers when it is hidden', () => {
    act(() => {
      useAppStore.setState({ history: [COMPARISON_ENTRY], translateHistoryCollapsed: false })
    })
    render(<TranslatePage />)
    expect(screen.getByRole('region', { name: 'History' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Hide translation history' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Icon-only in the header; the pressed look carries the state with aria-expanded.
    expect(toggle).toHaveAttribute('data-control-shape', 'icon')
    expect(toggle).toHaveAttribute('data-control-appearance', 'soft')

    fireEvent.click(toggle)
    expect(useAppStore.getState().translateHistoryCollapsed).toBe(true)
    expect(screen.queryByRole('region', { name: 'History' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show translation history' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('reopens a comparison entry from the panel without leaving the screen', async () => {
    act(() => {
      useAppStore.setState({
        activePage: 'translate',
        sourceText: '',
        translatedText: '',
        translationModels: [{ provider: 'gemini', model: 'gemini-2.0-flash' }],
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
        history: [COMPARISON_ENTRY],
        translateHistoryCollapsed: false,
        pendingTranslateRestoreId: null,
      })
    })
    render(<TranslatePage />)
    const row = screen.getByRole('button', { name: 'Use this: Translate this' })
    expect(row).not.toHaveAttribute('aria-current')
    fireEvent.click(row)

    const geminiCard = await screen.findByRole('article', { name: /Gemini 2.0 Flash/ })
    const openAiCard = screen.getByRole('article', { name: /GPT 4o/ })
    await waitFor(() => expect(geminiCard).toHaveTextContent('Bản dịch Gemini'))
    expect(openAiCard).toHaveTextContent('Bản dịch OpenAI')
    expect(within(openAiCard).getByRole('button', { name: /Picked: GPT 4o/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Use this: Translate this' })).toHaveAttribute('aria-current', 'true')
    expect(useAppStore.getState().activePage).toBe('translate')
    expect(useAppStore.getState().pendingTranslateRestoreId).toBeNull()
    expect(window.api.translate).not.toHaveBeenCalled()
  })

  it('reopens a comparison entry from history with every model and the pick', async () => {
    act(() => {
      useAppStore.setState({
        sourceText: 'Translate this',
        sourceLang: 'en',
        targetLang: 'vi',
        translatedText: '',
        translationModels: [
          { provider: 'gemini', model: 'gemini-2.0-flash' },
          { provider: 'openai', model: 'gpt-4o' },
        ],
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
        history: [COMPARISON_ENTRY],
        pendingTranslateRestoreId: 'hist-compare-1',
      })
    })

    render(<TranslatePage />)
    const geminiCard = await screen.findByRole('article', { name: /Gemini 2.0 Flash/ })
    const openAiCard = screen.getByRole('article', { name: /GPT 4o/ })
    await waitFor(() => expect(geminiCard).toHaveTextContent('Bản dịch Gemini'))
    expect(openAiCard).toHaveTextContent('Bản dịch OpenAI')
    expect(within(openAiCard).getByRole('button', { name: /Picked: GPT 4o/ })).toHaveAttribute('aria-pressed', 'true')
    // Nothing is re-run and the request is consumed.
    expect(window.api.translate).not.toHaveBeenCalled()
    expect(useAppStore.getState().pendingTranslateRestoreId).toBeNull()
    expect(screen.queryByRole('button', { name: 'Expand source text' })).toBeInTheDocument()

    // A new pick updates the reopened entry instead of adding another one.
    fireEvent.click(within(geminiCard).getByRole('button', { name: /Pick this one: Gemini 2.0 Flash/ }))
    const history = useAppStore.getState().history
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      id: 'hist-compare-1',
      provider: 'gemini',
      translatedText: 'Bản dịch Gemini',
      selectedKey: 'gemini:gemini-2.0-flash',
    })
    expect(history[0].results).toHaveLength(2)
  })

  it('assembles a translation sentence by sentence and keeps one history entry for the dominant model', async () => {
    vi.mocked(window.api.translate).mockImplementation(async ({ provider }) => ({
      success: true,
      translatedText: provider === 'gemini' ? 'Eins. Zwei. Drei.' : 'Uno. Dos. Tres.',
    }))
    act(() => {
      useAppStore.setState({
        sourceText: 'First one. Second one. Third one.',
        translationModels: [
          { provider: 'gemini', model: 'gemini-2.0-flash' },
          { provider: 'openai', model: 'gpt-4o' },
        ],
        keyStatus: { gemini: true, claude: false, openai: true, local: false },
        translateComparisonView: 'sentences',
        history: [],
      })
    })

    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate · 2 models' }))
    const table = await screen.findByRole('table', { name: 'Translations by sentence' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('First one.')

    const assembly = screen.getByLabelText('Assembled translation')
    fireEvent.click(within(rows[2]).getByRole('button', { name: 'Use this sentence: Sentence 2 · GPT 4o' }))
    expect(assembly).toHaveTextContent('Eins. Dos. Drei.')

    const historyFor = () => useAppStore.getState().history
      .filter((item) => item.sourceText === 'First one. Second one. Third one.')
    fireEvent.click(within(assembly).getByRole('button', { name: 'Pick this one: Assembled translation' }))
    expect(historyFor()).toHaveLength(1)
    expect(historyFor()[0]).toMatchObject({ provider: 'gemini', translatedText: 'Eins. Dos. Drei.' })
    expect(within(assembly).getByRole('button', { name: 'Picked: Assembled translation' }))
      .toHaveAttribute('aria-pressed', 'true')

    // Changing a sentence after the pick reopens the choice; re-picking replaces the same entry.
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Use this sentence: Sentence 1 · GPT 4o' }))
    fireEvent.click(within(rows[3]).getByRole('button', { name: 'Use this sentence: Sentence 3 · GPT 4o' }))
    expect(assembly).toHaveTextContent('Uno. Dos. Tres.')
    fireEvent.click(within(assembly).getByRole('button', { name: 'Pick this one: Assembled translation' }))
    expect(historyFor()).toHaveLength(1)
    expect(historyFor()[0]).toMatchObject({ provider: 'openai', translatedText: 'Uno. Dos. Tres.' })
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
    expect(screen.getByRole('button', { name: 'AI configuration, 2 models' })).toBeInTheDocument()
    expect(screen.queryByText('2 independent requests')).not.toBeInTheDocument()
    expect(screen.getAllByRole('article').every((card) => (
      within(card).getByText('Choose Translate to run this model.')
    ))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Translate · 2 models' }))

    await waitFor(() => expect(window.api.translate).toHaveBeenCalledTimes(2))
    // Differences are highlighted, so the text is split across marks; match on the card.
    await waitFor(() => expect(screen.getByRole('article', { name: /Gemini 2.0 Flash/ }))
      .toHaveTextContent('Bản dịch Gemini'))
    expect(screen.getByRole('article', { name: /GPT 4o/ })).toHaveTextContent('Bản dịch OpenAI')
    expect(useAppStore.getState().translatedText).toBe('')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Translation results' })).toBeInTheDocument()

    const geminiCard = screen.getByRole('article', { name: /Gemini 2.0 Flash.*Google Gemini/i })
    const openAiCard = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    // Completed columns report elapsed time; the check icon carries "complete".
    expect(geminiCard.querySelector('header [data-run-status]')).toHaveAttribute('data-run-status', 'success')
    expect(openAiCard.querySelector('header [data-run-status]')).toHaveAttribute('data-run-status', 'success')
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

    // One comparison is one history entry that keeps every finished model. It is
    // written when the run completes, attributed to the first model until the
    // reader picks one, and replaced (not duplicated) when they change their mind.
    const historyFor = () => useAppStore.getState().history
      .filter((item) => item.sourceText === 'Translate this')
    expect(historyFor()).toHaveLength(1)
    expect(historyFor()[0]).toMatchObject({ provider: 'gemini', translatedText: 'Bản dịch Gemini' })
    expect(historyFor()[0].selectedKey).toBeUndefined()
    expect(historyFor()[0].results).toEqual([
      expect.objectContaining({ provider: 'gemini', model: 'gemini-2.0-flash', translatedText: 'Bản dịch Gemini' }),
      expect.objectContaining({ provider: 'openai', model: 'gpt-4o', translatedText: 'Bản dịch OpenAI' }),
    ])
    const entryId = historyFor()[0].id
    fireEvent.click(within(openAiCard).getByRole('button', { name: /Pick this one: GPT 4o/ }))
    expect(historyFor()).toHaveLength(1)
    expect(historyFor()[0]).toMatchObject({
      id: entryId, provider: 'openai', translatedText: 'Bản dịch OpenAI', selectedKey: 'openai:gpt-4o',
    })
    expect(historyFor()[0].results).toHaveLength(2)
    expect(within(openAiCard).getByRole('button', { name: /Picked: GPT 4o/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(geminiCard).getByRole('button', { name: /Pick this one: Gemini 2.0 Flash/ }))
    expect(historyFor()).toHaveLength(1)
    expect(historyFor()[0]).toMatchObject({
      id: entryId, provider: 'gemini', translatedText: 'Bản dịch Gemini', selectedKey: 'gemini:gemini-2.0-flash',
    })

    // With results on screen the source folds into a strip; one disclosure
    // control reopens it, and the same control (now the heading) folds it again.
    expect(screen.queryByRole('textbox', { name: /Source content/i })).not.toBeInTheDocument()
    const expandToggle = screen.getByRole('button', { name: 'Expand source text' })
    expect(expandToggle).toHaveAttribute('aria-expanded', 'false')
    expect(expandToggle).toHaveTextContent('Translate this')
    fireEvent.click(expandToggle)
    const collapseToggle = screen.getByRole('button', { name: 'Source content' })
    expect(collapseToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('button', { name: 'Expand source text' })).not.toBeInTheDocument()
    fireEvent.click(collapseToggle)
    expect(screen.queryByRole('textbox', { name: /Source content/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand source text' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Translate · 2 models' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Translate · 2 models' }))

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
      render(<><TranslatePage /><NotificationViewport /></>)
      // The microphone belongs to the Voice input mode.
      fireEvent.click(screen.getByRole('button', { name: 'Voice' }))
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
    openTranslationSettings()
    expect(screen.getByRole('button', { name: label, pressed: true })).toBeInTheDocument()
  })

  it('names the page and switches the source between text, image and voice input', () => {
    render(<TranslatePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'AI Translate' })).toBeVisible()
    const modes = screen.getByRole('group', { name: 'Input' })
    expect(within(modes).getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(modes).getByRole('button', { name: 'Image' }))
    expect(screen.getByText('Drop an image here')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Source content' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument()

    fireEvent.click(within(modes).getByRole('button', { name: 'Voice' }))
    expect(screen.getByRole('textbox', { name: 'Source content' })).toHaveAttribute('placeholder', expect.stringMatching(/microphone/))
  })

  it('opens the model dialog from the result panel to compare models', () => {
    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Compare models' }))
    expect(screen.getByRole('dialog', { name: 'Translation models' })).toBeInTheDocument()
  })

  it('keeps a stable Auto translate label while switching state', () => {
    render(<TranslatePage />)
    expect(useAppStore.getState().autoTranslate).toBe(false)
    openTranslationSettings()

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

    render(<><TranslatePage /><NotificationViewport /></>)
    fireEvent.click(screen.getByRole('button', { name: /^Dịch$/i }))

    expect(await screen.findByText('API key không hợp lệ. Vui lòng kiểm tra trong Cài đặt.')).toBeInTheDocument()
  })

  it('does not leak an unstructured backend exception into the localized UI', async () => {
    vi.mocked(window.api.translate).mockRejectedValueOnce(new Error('Backend exploded in English'))
    act(() => {
      useAppStore.setState({ sourceText: 'Hello', locale: 'vi', localeAuto: false })
    })

    render(<><TranslatePage /><NotificationViewport /></>)
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

    render(<><TranslatePage /><NotificationViewport /></>)
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

  it('offers the microphone in Voice mode and the image picker in Image mode, labelled while empty', () => {
    render(<TranslatePage />)
    expect(screen.queryByRole('button', { name: TRANSLATIONS.en.voice_record })).toBeNull()
    expect(screen.queryByRole('button', { name: TRANSLATIONS.en.translate_add_image })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Voice' }))
    const voiceButton = screen.getByRole('button', { name: TRANSLATIONS.en.voice_record })
    expect(voiceButton).toHaveTextContent(TRANSLATIONS.en.voice_record)
    fireEvent.change(getSourceInput(), { target: { value: 'Hello' } })
    expect(voiceButton).not.toHaveTextContent(TRANSLATIONS.en.voice_record)

    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    expect(screen.getByRole('button', { name: TRANSLATIONS.en.translate_add_image })).toBeInTheDocument()
  })

  it('renders a text input area for source text', () => {
    render(<TranslatePage />)
    expect(getSourceInput().getAttribute('placeholder')).toMatch(/Enter or paste text|Nhập hoặc dán văn bản/i)
  })

  it('shows error message when translateError is set', () => {
    act(() => {
      useAppStore.setState({ translateError: 'API key invalid' })
    })
    render(<><TranslatePage /><NotificationViewport /></>)
    expect(screen.getByText('API key invalid')).toBeInTheDocument()
  })

  it('drops the error toast when the screen unmounts without clearing the error itself', () => {
    act(() => {
      useAppStore.setState({ translateError: 'API key invalid' })
    })
    const view = render(<><TranslatePage /><NotificationViewport /></>)
    expect(screen.getByText('API key invalid')).toBeInTheDocument()
    view.unmount()
    render(<NotificationViewport />)
    expect(screen.queryByText('API key invalid')).not.toBeInTheDocument()
    expect(useAppStore.getState().translateError).toBe('API key invalid')
  })

  it('preserves the draft and opens the model picker from a recoverable error', () => {
    act(() => {
      useAppStore.setState({
        sourceText: 'Keep this draft',
        translateError: 'Translation failed.',
        translateErrorCode: 'EMPTY_RESPONSE',
      })
    })

    render(<><TranslatePage /><NotificationViewport /></>)
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
        activePage: 'translate',
      })
    })

    render(<><TranslatePage /><NotificationViewport /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(useAppStore.getState().activePage).toBe('settings')
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
    fireEvent.click(screen.getByRole('button', { name: 'Translate · 2 models' }))
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

describe('TranslatePage design fixes', () => {
  beforeEach(() => {
    act(() => useNotificationStore.getState().clear())
  })

  async function pasteImage(file = new File(['image'], 'photo.png', { type: 'image/png' })) {
    vi.mocked(extractImageFromClipboard).mockReturnValue(file)
    act(() => {
      fireEvent.paste(getSourcePane(), { clipboardData: { items: [] } })
    })
    await act(async () => {})
    return file
  }

  it('gives every result footer action the same md size', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({ success: true, translatedText: 'Xin chào' })
    act(() => { useAppStore.setState({ sourceText: 'Hello' }) })
    render(<TranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))
    await waitFor(() => expect(useAppStore.getState().translatedText).toBe('Xin chào'))

    const footer = document.querySelector('.translate-result-footer') as HTMLElement
    const buttons = within(footer).getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(1)
    expect(within(footer).getByRole('button', { name: TRANSLATIONS.en.translate_use_as_source })).toBeInTheDocument()
    for (const button of buttons) expect(button).toHaveAttribute('data-control-size', 'md')
  })

  it('renders the language pair at the header sm size', () => {
    render(<TranslatePage />)
    const source = screen.getByRole('button', { name: /^Translate from:/ })
    expect(source).toHaveAttribute('data-control-size', 'sm')
    expect(screen.getByRole('button', { name: /^Translate to:/ })).toHaveAttribute('data-control-size', 'sm')
    expect(source.closest('.language-pair-bar')).toHaveClass('language-pair-bar--sm')
  })

  it('rejects an oversized image before decoding it', async () => {
    render(<TranslatePage />)
    const file = new File(['image'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: MAX_IMAGE_INPUT_BYTES + 1 })
    await pasteImage(file)

    expect(resizeImageFile).not.toHaveBeenCalled()
    expect(useAppStore.getState().translateError).toBe(
      TRANSLATIONS.en.image_translate_size_error(Math.round(MAX_IMAGE_INPUT_BYTES / (1024 * 1024))),
    )
  })

  it('saves an image translation to history and names the substitute model in one sentence', async () => {
    vi.mocked(window.api.translateImage).mockResolvedValueOnce({
      success: true,
      editedImageBase64: 'edited',
      editedImageMimeType: 'image/png',
      usedProvider: 'gemini',
      usedModel: 'gemini-2.5-flash',
    })
    act(() => { useAppStore.setState({ history: [] }) })
    render(<><TranslatePage /><NotificationViewport /></>)
    await pasteImage()
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/i }))

    await waitFor(() => expect(useAppStore.getState().history).toHaveLength(1))
    expect(useAppStore.getState().history[0]).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      sourceText: 'mock.png',
      translatedText: TRANSLATIONS.en.image_translate_result_label,
    })

    const expected = tpl(TRANSLATIONS.en.image_model_switched_message, {
      model: formatModelName('gemini', 'gemini-2.5-flash'),
      previous: formatModelName('gemini', 'gemini-2.0-flash'),
    })
    const notice = useNotificationStore.getState().notifications.find((n) => n.key === 'translate-image-model-switched')
    expect(notice?.message).toBe(expected)
    expect(notice?.message).not.toMatch(/\. doesn't|\)\./)
  })

  it('deletes a history entry with an undo toast that restores it in place', () => {
    const second: HistoryItem = { ...COMPARISON_ENTRY, id: 'hist-2', sourceText: 'Second', results: undefined, selectedKey: undefined }
    act(() => {
      useAppStore.setState({ history: [COMPARISON_ENTRY, second], translateHistoryCollapsed: false })
    })
    render(<><TranslatePage /><NotificationViewport /></>)

    fireEvent.click(screen.getByRole('button', { name: `${TRANSLATIONS.en.history_delete}: ${COMPARISON_ENTRY.sourceText}` }))
    expect(useAppStore.getState().history.map((entry) => entry.id)).toEqual(['hist-2'])

    const toast = useNotificationStore.getState().notifications.find((n) => n.key === 'translate-history-deleted')
    expect(toast?.message).toBe(TRANSLATIONS.en.translate_history_deleted)
    fireEvent.click(screen.getByRole('button', { name: TRANSLATIONS.en.translate_history_deleted_undo }))

    expect(useAppStore.getState().history.map((entry) => entry.id)).toEqual(['hist-compare-1', 'hist-2'])
    expect(useNotificationStore.getState().notifications.some((n) => n.key === 'translate-history-deleted')).toBe(false)
  })

  it('counts characters with one localized template and tags text with its language', async () => {
    vi.mocked(window.api.translate).mockResolvedValueOnce({ success: true, translatedText: 'こんにちは' })
    act(() => {
      useAppStore.setState({ locale: 'ja', sourceText: 'Hello', sourceLang: 'en', targetLang: 'ja' })
    })
    render(<TranslatePage />)

    expect(document.querySelector('.translate-source-submit .translate-char-count')).toHaveTextContent(/^5文字$/)
    expect(getSourceInput()).toHaveAttribute('lang', 'en')

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${TRANSLATIONS.ja.translate_btn}$`) }))
    await waitFor(() => expect(useAppStore.getState().translatedText).toBe('こんにちは'))
    const resultPane = screen.getByRole('region', { name: TRANSLATIONS.ja.translate_result_content_label })
    expect(within(resultPane).getByText('こんにちは').closest('[lang]')).toHaveAttribute('lang', 'ja')
  })

  it('leaves the source textarea untagged while the language is Auto and unknown', () => {
    render(<TranslatePage />)
    expect(getSourceInput()).not.toHaveAttribute('lang')
  })

  it('keeps the shortcut on the Translate button and shows the style only when it is not the default', () => {
    const { unmount } = render(<TranslatePage />)
    const button = screen.getByRole('button', { name: /^Translate$/i })
    expect(button).toHaveAttribute('title', TRANSLATIONS.en.translate_manual_shortcut)
    expect(TRANSLATIONS.en.translate_manual_shortcut).toBe('Enter to translate')
    expect(document.querySelector('.translate-options-summary')).toBeNull()
    unmount()

    act(() => { useAppStore.setState({ translationStyle: 'formal' }) })
    render(<TranslatePage />)
    expect(document.querySelector('.translate-options-summary')).toHaveTextContent(
      `${TRANSLATIONS.en.translate_style_label}: ${TRANSLATIONS.en.translate_style_formal}`,
    )
  })
})
