import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import type { TranslationComparisonResult } from '../../../types'
import { TranslationComparisonPane } from '../translate/TranslationComparisonPane'

const IDLE_RESULTS: TranslationComparisonResult[] = [
  {
    key: 'gemini:gemini-2.0-flash',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    status: 'idle',
    translatedText: '',
    error: null,
    errorCode: null,
    durationMs: null,
  },
  {
    key: 'openai:gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    status: 'idle',
    translatedText: '',
    error: null,
    errorCode: null,
    durationMs: null,
  },
  {
    key: 'claude:claude-sonnet-4',
    provider: 'claude',
    model: 'claude-sonnet-4',
    status: 'idle',
    translatedText: '',
    error: null,
    errorCode: null,
    durationMs: null,
  },
]

function renderComparison(results = IDLE_RESULTS) {
  return render(
    <>
      <h2 id="translation-results-heading">Translation results</h2>
      <TranslationComparisonPane
        headingId="translation-results-heading"
        sourceText="Source text."
        results={results}
        copiedResultKey={null}
        speakingResultKey={null}
        selectedResultKey={null}
        speakLoading={false}
        isTranslating={results.some((result) => result.status === 'loading')}
        isResultStale={false}
        canRetry
        onUseAsSource={vi.fn()}
        onCopy={vi.fn()}
        onSpeak={vi.fn()}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        onOpenSettings={vi.fn()}
        onChooseModel={vi.fn()}
      />
    </>,
  )
}

function errorResult(errorCode: string): TranslationComparisonResult {
  return {
    ...IDLE_RESULTS[1],
    status: 'error',
    error: 'Raw provider detail',
    errorCode,
  }
}

beforeEach(() => {
  useAppStore.setState({ locale: 'en', localeAuto: false, translateComparisonView: 'columns' })
})

describe('TranslationComparisonPane compact tabs', () => {
  it('selects one result with linked tab and panel semantics', () => {
    renderComparison()

    const tabs = within(screen.getByRole('tablist', { name: 'Translation results' }))
      .getAllByRole('tab')
    const panels = screen.getAllByRole('tabpanel')

    expect(panels[0]?.parentElement)
      .toHaveAttribute('data-result-count', '3')
    expect(tabs.every((tab) => tab.getAttribute('aria-label')?.endsWith('Ready'))).toBe(true)

    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    expect(tabs[0]).toHaveAttribute('aria-controls', panels[0].id)
    expect(panels[0]).toHaveAttribute('aria-labelledby', tabs[0].id)
    expect(panels[0]).toHaveAttribute('data-compact-active', 'true')
    expect(panels[1]).toHaveAttribute('data-compact-active', 'false')

    fireEvent.click(tabs[1])

    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[0]).toHaveAttribute('tabindex', '-1')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('tabindex', '0')
    expect(panels[0]).toHaveAttribute('data-compact-active', 'false')
    expect(panels[1]).toHaveAttribute('data-compact-active', 'true')
  })

  it('supports arrow, Home, and End navigation with roving focus', async () => {
    renderComparison()

    const tabs = within(screen.getByRole('tablist', { name: 'Translation results' }))
      .getAllByRole('tab')
    tabs[0].focus()

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    await waitFor(() => expect(tabs[1]).toHaveFocus())

    fireEvent.keyDown(tabs[1], { key: 'End' })
    await waitFor(() => expect(tabs[2]).toHaveFocus())

    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
    await waitFor(() => expect(tabs[0]).toHaveFocus())

    fireEvent.keyDown(tabs[0], { key: 'End' })
    await waitFor(() => expect(tabs[2]).toHaveFocus())

    fireEvent.keyDown(tabs[2], { key: 'Home' })
    await waitFor(() => expect(tabs[0]).toHaveFocus())
  })

  it('exposes each hidden model status from its tab', () => {
    renderComparison([
      { ...IDLE_RESULTS[0], status: 'loading' },
      {
        ...IDLE_RESULTS[1],
        status: 'success',
        translatedText: 'Completed translation',
        durationMs: 800,
      },
      {
        ...IDLE_RESULTS[2],
        status: 'error',
        error: 'Provider unavailable',
        errorCode: 'NETWORK',
      },
    ])

    const tablist = screen.getByRole('tablist', { name: 'Translation results' })
    expect(within(tablist).getByRole('tab', { name: /Gemini 2.0 Flash.*Running/i }))
      .toHaveAttribute('aria-busy', 'true')
    expect(within(tablist).getByRole('tab', { name: /GPT 4o.*Complete/i }))
      .toHaveAttribute('aria-busy', 'false')
    expect(within(tablist).getByRole('tab', { name: /Claude Sonnet 4.*Failed/i }))
      .toHaveAttribute('aria-busy', 'false')
  })

  it.each([
    ['NO_API_KEY', 'Add an API key for OpenAI before retrying.', false, true, true],
    ['INVALID_KEY', 'The API key for OpenAI is invalid. Check it in Settings.', false, true, true],
    ['RATE_LIMIT', 'OpenAI is rate limited. Wait briefly, then retry this model.', true, false, false],
    ['MODEL_UNAVAILABLE', 'GPT 4o is unavailable from OpenAI. Choose another model.', false, false, true],
    ['NETWORK', 'Could not reach OpenAI. Check your connection, then retry.', true, false, false],
    ['UNKNOWN', 'GPT 4o could not complete this translation. Retry or choose another model.', true, false, true],
  ])('maps %s to model-specific copy and recovery actions', (
    errorCode,
    message,
    hasRetry,
    hasSettings,
    hasChangeModel,
  ) => {
    renderComparison([errorResult(errorCode as string)])
    const card = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })

    expect(within(card).getByText(message as string)).toBeInTheDocument()
    expect(Boolean(within(card).queryByRole('button', { name: 'Retry this model' }))).toBe(hasRetry)
    expect(Boolean(within(card).queryByRole('button', { name: 'Open Settings' }))).toBe(hasSettings)
    expect(Boolean(within(card).queryByRole('button', { name: 'Change model' }))).toBe(hasChangeModel)
  })

  it('keeps aggregate completion visible after independent outcomes settle', () => {
    renderComparison([
      { ...IDLE_RESULTS[0], status: 'success', translatedText: 'Done', durationMs: 300 },
      errorResult('NETWORK'),
      IDLE_RESULTS[2],
    ])

    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('2 of 3 complete')
  })

  it('keeps the selected model across status updates and falls back when it is removed', () => {
    const view = renderComparison()
    const tablist = screen.getByRole('tablist', { name: 'Translation results' })
    fireEvent.click(within(tablist).getAllByRole('tab')[1])

    view.rerender(
      <>
        <h2 id="translation-results-heading">Translation results</h2>
        <TranslationComparisonPane
          headingId="translation-results-heading"
          sourceText="Source text."
          results={IDLE_RESULTS.map((result) => (
            result.key === IDLE_RESULTS[1].key
              ? { ...result, status: 'success', translatedText: 'Done', durationMs: 500 }
              : result
          ))}
          copiedResultKey={null}
          speakingResultKey={null}
          selectedResultKey={null}
          speakLoading={false}
          isTranslating={false}
          isResultStale={false}
          canRetry
          onUseAsSource={vi.fn()}
        onCopy={vi.fn()}
          onSpeak={vi.fn()}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onOpenSettings={vi.fn()}
          onChooseModel={vi.fn()}
        />
      </>,
    )

    expect(within(tablist).getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')

    view.rerender(
      <>
        <h2 id="translation-results-heading">Translation results</h2>
        <TranslationComparisonPane
          headingId="translation-results-heading"
          sourceText="Source text."
          results={[IDLE_RESULTS[0], IDLE_RESULTS[2]]}
          copiedResultKey={null}
          speakingResultKey={null}
          selectedResultKey={null}
          speakLoading={false}
          isTranslating={false}
          isResultStale={false}
          canRetry
          onUseAsSource={vi.fn()}
        onCopy={vi.fn()}
          onSpeak={vi.fn()}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onOpenSettings={vi.fn()}
          onChooseModel={vi.fn()}
        />
      </>,
    )

    expect(within(tablist).getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true')
  })
})

describe('TranslationComparisonPane result actions', () => {
  const LONG_TEXT = Array.from({ length: 200 }, (_, index) => `Sentence ${index}.`).join(' ')

  it('keeps read-aloud and copy in a fixed card footer so long text cannot hide them', () => {
    const onCopy = vi.fn()
    const onSpeak = vi.fn()
    const result: TranslationComparisonResult = {
      ...IDLE_RESULTS[1],
      status: 'success',
      translatedText: LONG_TEXT,
      durationMs: 1200,
    }
    render(
      <>
        <h2 id="translation-results-heading">Translation results</h2>
        <TranslationComparisonPane
          headingId="translation-results-heading"
          sourceText="Source text."
          results={[result]}
          copiedResultKey={null}
          speakingResultKey={null}
          selectedResultKey={null}
          speakLoading={false}
          isTranslating={false}
          isResultStale={false}
          canRetry
          onUseAsSource={vi.fn()}
        onCopy={onCopy}
          onSpeak={onSpeak}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onOpenSettings={vi.fn()}
          onChooseModel={vi.fn()}
        />
      </>,
    )

    const card = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    const footer = card.querySelector('footer')
    expect(footer).not.toBeNull()

    const footerActions = within(footer as HTMLElement)
    fireEvent.click(footerActions.getByRole('button', { name: /Read aloud: GPT 4o.*OpenAI/i }))
    fireEvent.click(footerActions.getByRole('button', { name: /Copy: GPT 4o.*OpenAI/i }))
    expect(onSpeak).toHaveBeenCalledWith(result)
    expect(onCopy).toHaveBeenCalledWith(result)
    expect(footer).toHaveTextContent(/2[,.\s]?689 chars/)
  })

  it('offers one pick per finished translation and reflects the picked column', () => {
    const onSelect = vi.fn()
    const results: TranslationComparisonResult[] = [
      { ...IDLE_RESULTS[0], status: 'success', translatedText: 'Alpha', durationMs: 300 },
      { ...IDLE_RESULTS[1], status: 'success', translatedText: 'Beta', durationMs: 400 },
      IDLE_RESULTS[2],
    ]
    render(
      <>
        <h2 id="translation-results-heading">Translation results</h2>
        <TranslationComparisonPane
          headingId="translation-results-heading"
          sourceText="Source text."
          results={results}
          copiedResultKey={null}
          speakingResultKey={null}
          selectedResultKey={results[1].key}
          speakLoading={false}
          isTranslating={false}
          isResultStale={false}
          canRetry
          onUseAsSource={vi.fn()}
          onCopy={vi.fn()}
          onSpeak={vi.fn()}
          onSelect={onSelect}
          onRetry={vi.fn()}
          onOpenSettings={vi.fn()}
          onChooseModel={vi.fn()}
        />
      </>,
    )

    const pickGemini = screen.getByRole('button', { name: /Pick this one: Gemini 2.0 Flash/ })
    const pickedOpenAi = screen.getByRole('button', { name: /Picked: GPT 4o/ })
    expect(pickGemini).toHaveAttribute('aria-pressed', 'false')
    expect(pickedOpenAi).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /Pick this one: Claude Sonnet 4/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('tabpanel')[1]).toHaveAttribute('data-selected', 'true')

    fireEvent.click(pickGemini)
    expect(onSelect).toHaveBeenCalledWith(results[0])
  })

  it('folds failed models into a recovery row and lets the reader dismiss it', () => {
    renderComparison([
      { ...IDLE_RESULTS[0], status: 'success', translatedText: 'Done', durationMs: 300 },
      errorResult('NETWORK'),
    ])

    const failures = screen.getByRole('list', { name: 'Models that did not finish' })
    const row = within(failures).getByRole('alert')
    expect(row).toHaveTextContent('GPT 4o')
    expect(row).toHaveTextContent('Could not reach OpenAI. Check your connection, then retry.')
    expect(within(row).getByRole('button', { name: 'Retry this model' })).toBeInTheDocument()
    expect(screen.getAllByRole('tabpanel')[1]).toHaveAttribute('data-status', 'error')

    fireEvent.click(within(row).getByRole('button', { name: 'Hide this failure: GPT 4o' }))
    expect(screen.queryByRole('list', { name: 'Models that did not finish' })).not.toBeInTheDocument()
  })

  it('marks where finished translations disagree and can switch the marks off', () => {
    renderComparison([
      { ...IDLE_RESULTS[0], status: 'success', translatedText: 'The quick fox', durationMs: 300 },
      { ...IDLE_RESULTS[1], status: 'success', translatedText: 'The slow fox', durationMs: 400 },
    ])

    const toggle = screen.getByRole('button', { name: 'Highlight differences' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const geminiCard = screen.getByRole('article', { name: /Gemini 2.0 Flash/ })
    expect(Array.from(geminiCard.querySelectorAll('mark')).map((mark) => mark.textContent)).toEqual(['quick'])

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(geminiCard.querySelector('mark')).toBeNull()
    expect(geminiCard).toHaveTextContent('The quick fox')
  })

  it('offers no result actions until a model has a translation', () => {
    renderComparison([errorResult('NETWORK')])

    expect(screen.queryByRole('button', { name: /^Copy:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Read aloud:/ })).not.toBeInTheDocument()
  })

  it('keeps idle column headers free of status chrome and reports elapsed time once complete', () => {
    renderComparison([
      IDLE_RESULTS[0],
      { ...IDLE_RESULTS[1], status: 'success', translatedText: 'Done', durationMs: 1200 },
    ])

    const idleCard = screen.getByRole('article', { name: /Gemini 2.0 Flash.*Google/i })
    const idleHeader = idleCard.querySelector('header') as HTMLElement
    expect(idleHeader.querySelector('[data-run-status]')).toBeNull()
    expect(within(idleCard).getByText('Choose Translate to run this model.')).toBeInTheDocument()

    const doneCard = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    const doneStatus = doneCard.querySelector('header [data-run-status]') as HTMLElement
    expect(doneStatus).toHaveAttribute('data-run-status', 'success')
    expect(doneStatus).toHaveTextContent('1.2s')
    expect(doneStatus).not.toHaveTextContent('Complete')
  })

  it('reports aggregate progress in the toolbar and keeps the pane heading for assistive tech', () => {
    renderComparison([
      { ...IDLE_RESULTS[0], status: 'success', translatedText: 'Done', durationMs: 300 },
      IDLE_RESULTS[1],
    ])

    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 complete')
    expect(screen.queryByRole('button', { name: 'Highlight differences' })).not.toBeInTheDocument()
  })
})

describe('TranslationComparisonPane by-sentence view', () => {
  const SOURCE = 'First one. Second one. Third one.'
  const GEMINI_KEY = IDLE_RESULTS[0].key
  const OPENAI_KEY = IDLE_RESULTS[1].key
  const alignedResults = (): TranslationComparisonResult[] => [
    { ...IDLE_RESULTS[0], status: 'success', translatedText: 'Eins. Zwei. Drei.', durationMs: 300 },
    { ...IDLE_RESULTS[1], status: 'success', translatedText: 'Uno. Dos. Tres.', durationMs: 400 },
  ]

  function renderSentences(
    results: TranslationComparisonResult[],
    options: {
      sourceText?: string
      selectedResultKey?: string | null
      onSelect?: (result: TranslationComparisonResult) => void
      onCopy?: (result: TranslationComparisonResult) => void
    } = {},
  ) {
    return render(
      <>
        <h2 id="translation-results-heading">Translation results</h2>
        <TranslationComparisonPane
          headingId="translation-results-heading"
          results={results}
          sourceText={options.sourceText ?? SOURCE}
          copiedResultKey={null}
          speakingResultKey={null}
          selectedResultKey={options.selectedResultKey ?? null}
          speakLoading={false}
          isTranslating={false}
          isResultStale={false}
          canRetry
          onUseAsSource={vi.fn()}
          onCopy={options.onCopy ?? vi.fn()}
          onSpeak={vi.fn()}
          onSelect={options.onSelect ?? vi.fn()}
          onRetry={vi.fn()}
          onOpenSettings={vi.fn()}
          onChooseModel={vi.fn()}
        />
      </>,
    )
  }

  const getTable = () => screen.getByRole('table', { name: 'Translations by sentence' })
  const getAssembly = () => screen.getByLabelText('Assembled translation')

  it('offers the view switch once two models finished and stores the choice', () => {
    const view = renderSentences([alignedResults()[0], IDLE_RESULTS[1]])
    expect(screen.queryByRole('group', { name: 'Comparison view' })).not.toBeInTheDocument()
    view.unmount()

    renderSentences(alignedResults())
    const group = screen.getByRole('group', { name: 'Comparison view' })
    const columns = within(group).getByRole('button', { name: 'Columns' })
    const sentences = within(group).getByRole('button', { name: 'By sentence' })
    expect(columns).toHaveAttribute('aria-pressed', 'true')
    expect(sentences).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    fireEvent.click(sentences)
    expect(sentences).toHaveAttribute('aria-pressed', 'true')
    expect(columns).toHaveAttribute('aria-pressed', 'false')
    expect(useAppStore.getState().translateComparisonView).toBe('sentences')
    expect(getTable()).toBeInTheDocument()
    expect(getTable().closest('.translate-comparison-body')).toHaveAttribute('data-view', 'sentences')
  })

  it('lines up source and translations sentence by sentence and assembles the chosen pieces', () => {
    useAppStore.setState({ translateComparisonView: 'sentences' })
    const onSelect = vi.fn()
    const onCopy = vi.fn()
    renderSentences(alignedResults(), { onSelect, onCopy })

    const rows = within(getTable()).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Source', expect.stringContaining('Gemini 2.0 Flash'), expect.stringContaining('GPT 4o')])
    expect(within(rows[2]).getByRole('rowheader')).toHaveTextContent('Second one.')
    expect(within(rows[2]).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual([expect.stringContaining('Zwei.'), expect.stringContaining('Dos.')])

    const assembly = getAssembly()
    expect(assembly).toHaveTextContent('Eins. Zwei. Drei.')
    expect(assembly).toHaveTextContent('Every sentence from Gemini 2.0 Flash')
    expect(within(rows[2]).getByRole('button', { name: 'Used: Sentence 2 · Gemini 2.0 Flash' }))
      .toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(rows[2]).getByRole('button', { name: 'Use this sentence: Sentence 2 · GPT 4o' }))
    expect(within(rows[2]).getByRole('button', { name: 'Used: Sentence 2 · GPT 4o' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(within(rows[2]).getAllByRole('cell')[1]).toHaveAttribute('data-chosen', 'true')
    expect(within(rows[2]).getAllByRole('cell')[0]).toHaveAttribute('data-chosen', 'false')
    expect(assembly).toHaveTextContent('Eins. Dos. Drei.')
    expect(assembly).toHaveTextContent('Sentences from 2 models, mostly Gemini 2.0 Flash')

    fireEvent.click(within(assembly).getByRole('button', { name: 'Copy: Assembled translation' }))
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({
      key: 'assembled',
      translatedText: 'Eins. Dos. Drei.',
    }))

    fireEvent.click(within(assembly).getByRole('button', { name: 'Pick this one: Assembled translation' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      key: 'assembled',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      translatedText: 'Eins. Dos. Drei.',
    }))
  })

  it('defaults every row to the picked column and attributes the majority to it', () => {
    useAppStore.setState({ translateComparisonView: 'sentences' })
    const onSelect = vi.fn()
    renderSentences(alignedResults(), { onSelect, selectedResultKey: OPENAI_KEY })

    const assembly = getAssembly()
    expect(assembly).toHaveTextContent('Uno. Dos. Tres.')
    expect(within(getTable()).getByRole('button', { name: /Picked: GPT 4o/ })).toHaveAttribute('aria-pressed', 'true')

    const rows = within(getTable()).getAllByRole('row')
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Use this sentence: Sentence 1 · Gemini 2.0 Flash' }))
    expect(assembly).toHaveTextContent('Eins. Dos. Tres.')

    fireEvent.click(within(assembly).getByRole('button', { name: 'Pick this one: Assembled translation' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      key: 'assembled',
      provider: 'openai',
      translatedText: 'Eins. Dos. Tres.',
    }))
  })

  it('keeps a translation with a different sentence count whole and out of the assembly', () => {
    useAppStore.setState({ translateComparisonView: 'sentences' })
    const [gemini, openai] = alignedResults()
    renderSentences([gemini, { ...openai, translatedText: 'Uno y dos. Tres.' }], { selectedResultKey: OPENAI_KEY })

    const rows = within(getTable()).getAllByRole('row')
    expect(within(rows[0]).getAllByRole('columnheader')[2])
      .toHaveTextContent('2 sentences instead of 3; shown whole and left out of the assembly.')
    expect(within(getTable()).queryByRole('button', { name: /GPT 4o$/ })).not.toBeInTheDocument()
    expect(within(rows[1]).getAllByRole('cell')[1]).toBeEmptyDOMElement()
    expect(within(rows[3]).getAllByRole('cell')[1]).toHaveTextContent('Uno y dos. Tres.')
    expect(within(rows[3]).getAllByRole('cell')[1]).toHaveAttribute('data-aligned', 'false')
    // The picked column cannot be assembled, so the rows default to the first aligned one.
    expect(getAssembly()).toHaveTextContent('Eins. Zwei. Drei.')
    expect(getAssembly()).toHaveTextContent('Every sentence from Gemini 2.0 Flash')
  })

  it('marks disagreements within each row and can switch the marks off', () => {
    useAppStore.setState({ translateComparisonView: 'sentences' })
    const [gemini, openai] = alignedResults()
    renderSentences([
      { ...gemini, translatedText: 'The quick fox. It ran.' },
      { ...openai, translatedText: 'The slow fox. It ran.' },
    ], { sourceText: 'A fox. It ran.' })

    const rows = within(getTable()).getAllByRole('row')
    const marks = (row: HTMLElement) => Array.from(row.querySelectorAll('mark')).map((mark) => mark.textContent)
    expect(marks(rows[1])).toEqual(['quick', 'slow'])
    expect(marks(rows[2])).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Highlight differences' }))
    expect(marks(rows[1])).toEqual([])
    expect(rows[1]).toHaveTextContent('The quick fox.')
  })

  it('explains when nothing can be assembled', () => {
    useAppStore.setState({ translateComparisonView: 'sentences' })
    const [gemini, openai] = alignedResults()
    renderSentences([
      { ...gemini, translatedText: 'Eins und zwei. Drei.' },
      { ...openai, translatedText: 'Uno y dos. Tres.' },
    ])

    expect(getAssembly()).toHaveTextContent(
      'No translation splits into the same number of sentences as the source, so nothing can be assembled.',
    )
    expect(screen.queryByRole('button', { name: 'Pick this one: Assembled translation' })).not.toBeInTheDocument()
    expect(within(getTable()).queryByRole('button', { name: /^Use this sentence/ })).not.toBeInTheDocument()
  })

  it('falls back to columns while fewer than two models have finished', () => {
    useAppStore.setState({ translateComparisonView: 'sentences' })
    renderSentences([alignedResults()[0], { ...IDLE_RESULTS[1], status: 'loading' }])

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Comparison view' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('tabpanel')[0].parentElement?.parentElement).toHaveAttribute('data-view', 'columns')
    expect(screen.getByRole('article', { name: new RegExp(GEMINI_KEY.split(':')[0], 'i') })).toBeInTheDocument()
  })
})
