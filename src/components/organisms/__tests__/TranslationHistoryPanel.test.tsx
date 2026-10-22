import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../../i18n'
import type { HistoryItem } from '../../../types'
import { TranslationHistoryPanel } from '../translate/TranslationHistoryPanel'

const t = TRANSLATIONS.en

function entry(overrides: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'sourceText'>): HistoryItem {
  return {
    timestamp: Date.now() - 120_000,
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    sourceLang: 'en',
    targetLang: 'vi',
    translatedText: `${overrides.sourceText} (vi)`,
    ...overrides,
  }
}

const comparison = entry({
  id: 'compare',
  sourceText: 'Compare me',
  provider: 'openai',
  model: 'gpt-4o',
  translatedText: 'So sánh tôi',
  selectedKey: 'openai:gpt-4o',
  results: [
    { provider: 'gemini', model: 'gemini-2.0-flash', translatedText: 'Hãy so sánh tôi' },
    { provider: 'openai', model: 'gpt-4o', translatedText: 'So sánh tôi' },
  ],
})

function renderPanel(props: Partial<Parameters<typeof TranslationHistoryPanel>[0]> = {}) {
  const onReuse = vi.fn()
  const onDelete = vi.fn()
  const onClearHistory = vi.fn()
  render(
    <TranslationHistoryPanel
      entries={[comparison, entry({ id: 'single', sourceText: 'Hello' })]}
      activeEntryId="compare"
      onReuse={onReuse}
      onDelete={onDelete}
      onClearHistory={onClearHistory}
      t={t}
      {...props}
    />,
  )
  return { onReuse, onDelete, onClearHistory }
}

describe('TranslationHistoryPanel', () => {
  it('lists saved runs with the model count and marks the open one', () => {
    const { onReuse, onDelete } = renderPanel()
    expect(screen.getByRole('region', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByText('2 entries')).toBeInTheDocument()

    const reopen = screen.getByRole('button', { name: 'Use this: Compare me' })
    expect(reopen).toHaveAttribute('aria-current', 'true')
    expect(within(reopen).getByText('2 models')).toBeInTheDocument()
    expect(within(reopen).getByText('So sánh tôi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use this: Hello' })).not.toHaveAttribute('aria-current')

    fireEvent.click(reopen)
    expect(onReuse).toHaveBeenCalledWith(comparison)
    fireEvent.click(screen.getByRole('button', { name: 'Delete: Hello' }))
    expect(onDelete).toHaveBeenCalledWith('single')
  })

  it('filters across every saved result once the list is long enough', () => {
    const entries = [comparison, ...['One', 'Two', 'Three', 'Four'].map((text) => entry({ id: text, sourceText: text }))]
    renderPanel({ entries })
    const filter = screen.getByRole('textbox', { name: 'Search history...' })
    fireEvent.change(filter, { target: { value: 'hãy so sánh' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Use this: Compare me' })).toBeInTheDocument()

    fireEvent.change(filter, { target: { value: 'nothing here' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('No matching results')).toBeInTheDocument()
  })

  it('asks before clearing and shows the empty state without entries', () => {
    const { onClearHistory } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Clear translation history' }))
    const dialog = screen.getByRole('dialog', { name: 'Clear translation history' })
    // The shell's close control and the footer action share the Cancel label.
    const cancelButtons = within(dialog).getAllByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButtons[cancelButtons.length - 1] as HTMLElement)
    expect(onClearHistory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Clear translation history' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear translation history' }))
    expect(onClearHistory).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state and no footer when nothing is saved', () => {
    renderPanel({ entries: [] })
    expect(screen.getByText('Translations you run will appear here.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear translation history' })).not.toBeInTheDocument()
  })

  it('drops its own heading in the overlay variant', () => {
    renderPanel({ variant: 'overlay' })
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'History' })).toHaveAttribute('data-variant', 'overlay')
  })
})
