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
        results={results}
        copiedResultKey={null}
        speakingResultKey={null}
        speakLoading={false}
        isTranslating={results.some((result) => result.status === 'loading')}
        isResultStale={false}
        canRetry
        onUseAsSource={vi.fn()}
        onCopy={vi.fn()}
        onSpeak={vi.fn()}
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
  useAppStore.setState({ locale: 'en', localeAuto: false })
})

describe('TranslationComparisonPane compact tabs', () => {
  it('selects one result with linked tab and panel semantics', () => {
    renderComparison()

    const tabs = within(screen.getByRole('tablist', { name: 'Translation results' }))
      .getAllByRole('tab')
    const panels = screen.getAllByRole('tabpanel')

    expect(screen.getByText('Each model runs independently. One failure will not stop the other results.'))
      .toBeInTheDocument()
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
          results={IDLE_RESULTS.map((result) => (
            result.key === IDLE_RESULTS[1].key
              ? { ...result, status: 'success', translatedText: 'Done', durationMs: 500 }
              : result
          ))}
          copiedResultKey={null}
          speakingResultKey={null}
          speakLoading={false}
          isTranslating={false}
          isResultStale={false}
          canRetry
          onUseAsSource={vi.fn()}
        onCopy={vi.fn()}
          onSpeak={vi.fn()}
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
          results={[IDLE_RESULTS[0], IDLE_RESULTS[2]]}
          copiedResultKey={null}
          speakingResultKey={null}
          speakLoading={false}
          isTranslating={false}
          isResultStale={false}
          canRetry
          onUseAsSource={vi.fn()}
        onCopy={vi.fn()}
          onSpeak={vi.fn()}
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

  it('keeps read-aloud and copy in the card header so long text cannot hide them', () => {
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
          results={[result]}
          copiedResultKey={null}
          speakingResultKey={null}
          speakLoading={false}
          isTranslating={false}
          isResultStale={false}
          canRetry
          onUseAsSource={vi.fn()}
        onCopy={onCopy}
          onSpeak={onSpeak}
          onRetry={vi.fn()}
          onOpenSettings={vi.fn()}
          onChooseModel={vi.fn()}
        />
      </>,
    )

    const card = screen.getByRole('article', { name: /GPT 4o.*OpenAI/i })
    const header = card.querySelector('header')
    expect(header).not.toBeNull()
    expect(card.querySelector('footer')).toBeNull()

    const headerActions = within(header as HTMLElement)
    fireEvent.click(headerActions.getByRole('button', { name: /Read aloud: GPT 4o.*OpenAI/i }))
    fireEvent.click(headerActions.getByRole('button', { name: /Copy: GPT 4o.*OpenAI/i }))
    expect(onSpeak).toHaveBeenCalledWith(result)
    expect(onCopy).toHaveBeenCalledWith(result)
  })

  it('offers no result actions until a model has a translation', () => {
    renderComparison([errorResult('NETWORK')])

    expect(screen.queryByRole('button', { name: /^Copy:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Read aloud:/ })).not.toBeInTheDocument()
  })

  it('shows the independence notice only before the first run', () => {
    const view = renderComparison()
    const notice = 'Each model runs independently. One failure will not stop the other results.'
    expect(screen.getByText(notice)).toBeInTheDocument()

    view.unmount()
    renderComparison([{ ...IDLE_RESULTS[0], status: 'success', translatedText: 'Done', durationMs: 300 }])
    expect(screen.queryByText(notice)).not.toBeInTheDocument()
  })
})
