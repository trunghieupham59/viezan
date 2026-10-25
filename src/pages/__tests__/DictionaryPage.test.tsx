import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../components/organisms/NotificationViewport'
import { dictionaryService } from '../../services/dictionaryService'
import { useAppStore } from '../../store/useAppStore'
import { DictionaryPage } from '../DictionaryPage'

vi.mock('../../services/dictionaryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/dictionaryService')>()
  return {
    ...actual,
    dictionaryService: {
      lookup: vi.fn(),
      lookupPreview: vi.fn(),
      lookupDetails: vi.fn(),
    },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
  vi.mocked(dictionaryService.lookupDetails).mockResolvedValue({
    success: false,
    error: 'No enrichment',
    errorCode: 'INVALID_RESPONSE',
  })
  act(() => {
    useAppStore.setState({
      dictionaryEntries: [],
      pendingDictionaryTerm: null,
      activePage: 'dictionary',
      sourceLang: 'auto',
      targetLang: 'vi',
      selectedProvider: 'local',
      selectedModels: { local: 'local-auto', gemini: 'gemini-2.5-flash', claude: 'claude-sonnet-4-20250514', openai: 'gpt-5-mini' },
      keyStatus: { local: true, gemini: false, claude: false, openai: false },
    })
  })
})

describe('DictionaryPage', () => {
  it('looks up a term handed over by the command palette once, then clears the handoff', async () => {
    vi.mocked(dictionaryService.lookupPreview).mockResolvedValueOnce({ success: false, error: 'stop here', errorCode: 'INVALID_RESPONSE' })
    act(() => useAppStore.getState().setPendingDictionaryTerm('serendipity'))

    render(<DictionaryPage />)

    await waitFor(() => expect(dictionaryService.lookupPreview).toHaveBeenCalledOnce())
    expect(dictionaryService.lookupPreview).toHaveBeenCalledWith(
      expect.objectContaining({ term: 'serendipity', context: '', provider: 'local', model: 'local-auto' }),
      expect.anything(),
    )
    expect(screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i)).toHaveValue('serendipity')
    expect(useAppStore.getState().pendingDictionaryTerm).toBeNull()
  })

  it('does not look anything up when no term is handed over', async () => {
    render(<DictionaryPage />)
    await act(async () => {})

    expect(dictionaryService.lookupPreview).not.toHaveBeenCalled()
  })

  it('renders the dictionary empty state', () => {
    render(<DictionaryPage />)

    expect(screen.getByRole('heading', { name: /Dictionary|Từ điển|辞書/i })).toBeInTheDocument()
    expect(screen.getByText(/No entry selected|Chưa chọn mục nào|選択されていません/i)).toBeInTheDocument()
  })

  it('runs lookup and saves a result entry', async () => {
    vi.mocked(dictionaryService.lookupPreview).mockResolvedValueOnce({
      success: true,
      result: {
        headword: '工夫',
        pronunciation: 'くふう',
        partOfSpeech: ['noun'],
        meaning: 'Cải tiến cách làm.',
        translations: [{
          text: 'cải tiến',
          pronunciation: 'cải tiến',
          partOfSpeech: 'noun',
          meaning: 'Cách làm tốt hơn.',
          usage: 'Dùng khi nói về việc cải thiện cách làm hoặc giải pháp thực tế.',
          nuance: 'Nhấn mạnh cải thiện thực tế trong công việc.',
          examples: ['工夫する -> cải tiến cách làm'],
          collocations: ['cải tiến quy trình'],
          notes: ['Trang trọng vừa phải.'],
        }],
        examples: ['工夫する -> cải tiến'],
        notes: ['Dùng trong công việc.'],
      },
    })

    render(<DictionaryPage />)
    fireEvent.change(screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i), { target: { value: '工夫' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up|Tra cứu|検索/i }))

    await waitFor(() => expect(dictionaryService.lookupPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        term: '工夫',
        provider: 'local',
        model: 'local-auto',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ))
    await waitFor(() => expect(screen.getAllByText('Cải tiến cách làm.').length).toBeGreaterThan(0))
    expect(dictionaryService.lookupDetails).toHaveBeenCalledWith(
      expect.objectContaining({ term: '工夫' }),
      expect.objectContaining({ headword: '工夫' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(useAppStore.getState().dictionaryEntries).toHaveLength(1)
  })

  it('opens a translation detail pop-up from a translation chip', async () => {
    vi.mocked(dictionaryService.lookupPreview).mockResolvedValueOnce({
      success: true,
      result: {
        headword: '工夫',
        pronunciation: 'くふう',
        partOfSpeech: ['noun'],
        meaning: 'Cải tiến cách làm.',
        translations: [{
          text: 'cải tiến',
          pronunciation: 'cải tiến',
          partOfSpeech: 'noun',
          meaning: 'Cách làm tốt hơn.',
          usage: 'Dùng khi nói về việc cải thiện cách làm hoặc giải pháp thực tế.',
          nuance: 'Nhấn mạnh cải thiện thực tế trong công việc.',
          examples: ['工夫する -> cải tiến cách làm'],
          collocations: ['cải tiến quy trình'],
          notes: ['Trang trọng vừa phải.'],
        }],
        examples: ['工夫する -> cải tiến'],
        notes: ['Dùng trong công việc.'],
      },
    })

    render(<DictionaryPage />)
    fireEvent.change(screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i), { target: { value: '工夫' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up|Tra cứu|検索/i }))

    await waitFor(() => expect(screen.getAllByText('Cải tiến cách làm.').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: /Translation detail.*cải tiến|Chi tiết bản dịch.*cải tiến|訳語の詳細.*cải tiến/i }))

    const dialog = screen.getByRole('dialog', { name: /Translation detail|Chi tiết bản dịch|訳語の詳細/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Dùng khi nói về việc cải thiện cách làm hoặc giải pháp thực tế.')).toBeInTheDocument()
    expect(within(dialog).getByText('Nhấn mạnh cải thiện thực tế trong công việc.')).toBeInTheDocument()
    expect(screen.getByText('cải tiến quy trình')).toBeInTheDocument()

    fireEvent.click(dialog)
    expect(screen.getByRole('dialog', { name: /Translation detail|Chi tiết bản dịch|訳語の詳細/i })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('dictionary-translation-backdrop'))
    expect(screen.queryByRole('dialog', { name: /Translation detail|Chi tiết bản dịch|訳語の詳細/i })).not.toBeInTheDocument()
  })

  it('shows a lookup action for selected result text and opens a detail pop-up', async () => {
    vi.mocked(dictionaryService.lookupPreview)
      .mockResolvedValueOnce({
        success: true,
        result: {
          headword: '工夫',
          pronunciation: 'くふう',
          partOfSpeech: ['noun'],
          meaning: 'Cải tiến cách làm.',
          translations: [{
            text: 'cải tiến',
            pronunciation: 'cải tiến',
            partOfSpeech: 'noun',
            meaning: 'Cách làm tốt hơn.',
            usage: 'Dùng khi nói về việc cải thiện cách làm hoặc giải pháp thực tế.',
            nuance: 'Nhấn mạnh cải thiện thực tế trong công việc.',
            examples: ['工夫する -> cải tiến cách làm'],
            collocations: ['cải tiến quy trình'],
            notes: ['Trang trọng vừa phải.'],
          }],
          examples: ['工夫する -> cải tiến'],
          notes: ['Dùng trong công việc.'],
        },
      })
    vi.mocked(dictionaryService.lookup)
      .mockResolvedValueOnce({
        success: true,
        result: {
          headword: 'Cải tiến',
          pronunciation: 'cải tiến',
          partOfSpeech: ['verb'],
          meaning: 'Làm cho cách làm hoặc sản phẩm tốt hơn.',
          translations: [{ text: 'improve', pronunciation: 'ɪmˈpruːv' }],
          examples: ['cải tiến quy trình -> improve the process'],
          notes: ['Dùng khi nói về thay đổi theo hướng tốt hơn.'],
        },
      })

    render(<DictionaryPage />)
    fireEvent.change(screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i), { target: { value: '工夫' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up|Tra cứu|検索/i }))

    await waitFor(() => expect(screen.getAllByText('Cải tiến cách làm.').length).toBeGreaterThan(0))

    // The lookup column (with Recent) comes first; select inside the result page.
    const resultRegion = screen.getByRole('region', { name: /^(Dictionary|Từ điển|辞書)$/ })
    const meaning = within(resultRegion).getAllByText('Cải tiến cách làm.')[0]
    const textNode = meaning.firstChild as Text
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 8)
    Object.assign(range, {
      getBoundingClientRect: () => ({ left: 120, top: 120, width: 44, height: 18 }),
    })
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    fireEvent.mouseUp(meaning)

    const lookupButton = await screen.findByRole('button', { name: /Look up selection.*Cải tiến|Tra phần đã chọn.*Cải tiến|選択部分を検索.*Cải tiến/i })
    fireEvent.click(lookupButton)

    await waitFor(() => expect(dictionaryService.lookup).toHaveBeenLastCalledWith(
      expect.objectContaining({
        term: 'Cải tiến',
        sourceLang: 'auto',
        targetLang: 'vi',
        provider: 'local',
        model: 'local-auto',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ))
    expect(await screen.findByRole('dialog', { name: /Look up selection|Tra phần đã chọn|選択部分を検索/i })).toBeInTheDocument()
    // The text now appears in both the dialog and the persisted history entry.
    expect(screen.getAllByText('Làm cho cách làm hoặc sản phẩm tốt hơn.').length).toBeGreaterThan(0)
  })

  it('renders a preview result before detail enrichment completes', async () => {
    let resolveDetails: (value: Awaited<ReturnType<typeof dictionaryService.lookupDetails>>) => void = () => {}
    vi.mocked(dictionaryService.lookupPreview).mockResolvedValueOnce({
      success: true,
      result: {
        headword: 'extension',
        pronunciation: 'ɪkˈstenʃən',
        partOfSpeech: ['noun'],
        meaning: 'Bản xem nhanh.',
        translations: [{ text: 'phần mở rộng', pronunciation: 'phần mở rộng' }],
        examples: ['browser extension -> phần mở rộng trình duyệt'],
        notes: [],
      },
    })
    vi.mocked(dictionaryService.lookupDetails).mockReturnValueOnce(new Promise((resolve) => {
      resolveDetails = resolve
    }))

    render(<DictionaryPage />)
    fireEvent.change(screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i), {
      target: { value: 'extension' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Look up|Tra cứu|検索/i }))

    expect((await screen.findAllByText('Bản xem nhanh.')).length).toBeGreaterThan(0)
    expect(useAppStore.getState().dictionaryEntries[0].result.meaning).toBe('Bản xem nhanh.')

    await act(async () => {
      resolveDetails({
        success: true,
        result: {
          headword: 'extension',
          pronunciation: 'ɪkˈstenʃən',
          partOfSpeech: ['noun'],
          meaning: 'Bản đầy đủ.',
          translations: [{
            text: 'phần mở rộng',
            pronunciation: 'phần mở rộng',
            meaning: 'Một thành phần bổ sung.',
            usage: 'Dùng cho browser extension hoặc file extension tùy ngữ cảnh.',
          }],
          examples: ['Chrome extension -> phần mở rộng Chrome'],
          notes: ['Phân biệt với deadline extension.'],
        },
      })
    })

    expect((await screen.findAllByText('Bản đầy đủ.')).length).toBeGreaterThan(0)
    expect(useAppStore.getState().dictionaryEntries).toHaveLength(1)
  })

  it('uses a cached detailed entry without issuing another lookup request', async () => {
    act(() => {
      useAppStore.getState().addDictionaryEntry({
        id: 'cached-entry',
        term: '工夫',
        normalizedTerm: '工夫',
        sourceLang: 'auto',
        targetLang: 'vi',
        provider: 'local',
        model: 'local-auto',
        createdAt: Date.now(),
        favorite: false,
        result: {
          headword: '工夫',
          pronunciation: 'くふう',
          partOfSpeech: ['noun'],
          meaning: 'Kết quả cache.',
          translations: [{
            text: 'cải tiến',
            pronunciation: 'cải tiến',
            meaning: 'Cách làm tốt hơn.',
            usage: 'Dùng khi nói về cải thiện cách làm.',
          }],
          examples: [],
          notes: [],
        },
      })
    })

    render(<DictionaryPage />)
    fireEvent.change(screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i), { target: { value: '工夫' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up|Tra cứu|検索/i }))

    expect(screen.getAllByText('Kết quả cache.').length).toBeGreaterThan(0)
    expect(dictionaryService.lookupPreview).not.toHaveBeenCalled()
    expect(dictionaryService.lookupDetails).not.toHaveBeenCalled()
  })

  it('favorites an entry and reuses it in AI Translate', async () => {
    act(() => {
      useAppStore.getState().addDictionaryEntry({
        id: 'entry-1',
        term: '工夫',
        normalizedTerm: '工夫',
        sourceLang: 'ja',
        targetLang: 'vi',
        provider: 'local',
        model: 'local-auto',
        createdAt: Date.now(),
        favorite: false,
        result: {
          headword: '工夫',
          pronunciation: 'くふう',
          partOfSpeech: ['noun'],
          meaning: 'Cải tiến cách làm.',
          translations: [{
            text: 'cải tiến',
            pronunciation: 'cải tiến',
            partOfSpeech: 'noun',
            meaning: 'Cách làm tốt hơn.',
            usage: 'Dùng khi nói về việc cải thiện cách làm hoặc giải pháp thực tế.',
            nuance: 'Nhấn mạnh cải thiện thực tế trong công việc.',
            examples: ['工夫する -> cải tiến cách làm'],
            collocations: ['cải tiến quy trình'],
            notes: ['Trang trọng vừa phải.'],
          }],
          examples: [],
          notes: [],
        },
      })
    })

    render(<DictionaryPage />)
    fireEvent.click(screen.getByTitle(/Favorite|Đánh dấu|お気に入り/i))
    expect(useAppStore.getState().dictionaryEntries[0].favorite).toBe(true)

    fireEvent.click(screen.getByTitle(/Use in AI Translate|Dùng trong AI Dịch|AI翻訳/i))
    expect(useAppStore.getState()).toMatchObject({
      activePage: 'translate',
      sourceText: '工夫',
      sourceLang: 'ja',
      targetLang: 'vi',
    })
  })

  it('shows a localized validation error under the term field, not as a toast', () => {
    render(<><DictionaryPage /><NotificationViewport /></>)
    fireEvent.click(screen.getByRole('button', { name: /Look up|Tra cứu|検索/i }))

    const input = screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i)
    const message = screen.getByText(/Enter a term|Nhập từ cần tra|語句を入力/i)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBe(message.id)
    expect(message).toHaveClass('dictionary-field-error')
    expect(document.querySelector('.notification-toast, [data-notification-key]')).toBeNull()

    // Typing clears the message and the invalid state.
    fireEvent.change(input, { target: { value: 'a' } })
    expect(screen.queryByText(/Enter a term|Nhập từ cần tra|語句を入力/i)).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('explains a missing model with a warning row that opens Settings › AI models', () => {
    act(() => useAppStore.setState({ selectedModels: { local: '', gemini: '', claude: '', openai: '' } }))
    render(<DictionaryPage />)

    const notice = screen.getByText(/Choose a model|Chọn model|モデル/i).closest('.capability-notice') as HTMLElement
    expect(notice).toHaveAttribute('data-tone', 'warning')
    fireEvent.click(within(notice).getByRole('button'))
    expect(useAppStore.getState().activePage).toBe('settings')
    expect(useAppStore.getState().settingsInitialSection).toBe('api')
  })

  it('drops the lookup error toast when the screen unmounts', async () => {
    vi.mocked(dictionaryService.lookupPreview)
      .mockResolvedValueOnce({ success: false, error: 'Provider unavailable' })

    const view = render(<><DictionaryPage /><NotificationViewport /></>)
    fireEvent.change(screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i), { target: { value: 'reliable' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up|Tra cứu|検索/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable')

    view.unmount()
    render(<NotificationViewport />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps a failed lookup recoverable without clearing the term', async () => {
    vi.mocked(dictionaryService.lookupPreview)
      .mockResolvedValueOnce({ success: false, error: 'Provider unavailable' })
      .mockResolvedValueOnce({ success: false, error: 'Still unavailable' })

    render(<><DictionaryPage /><NotificationViewport /></>)
    const input = screen.getByPlaceholderText(/Enter a word|Nhập từ|単語/i)
    fireEvent.change(input, { target: { value: 'reliable' } })
    fireEvent.click(screen.getByRole('button', { name: /Look up|Tra cứu|検索/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable')
    expect(input).toHaveValue('reliable')

    fireEvent.click(screen.getByRole('button', { name: /Retry|Thử lại|再試行/i }))
    await waitFor(() => expect(dictionaryService.lookupPreview).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: /Choose another model|Chọn model khác|別のモデル/i }))
    expect(screen.getByRole('dialog', {
      name: /AI configuration|Cấu hình AI|AI 設定/i,
    })).toBeInTheDocument()
  })
})
