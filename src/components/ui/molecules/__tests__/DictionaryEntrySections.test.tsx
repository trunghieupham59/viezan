import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DictionaryEntrySections } from '../DictionaryEntrySections'

const chips = [
  { key: 'a', text: 'cải tiến', pronunciation: '/kai tien/' },
  { key: 'b', text: 'cải thiện' },
]

describe('DictionaryEntrySections', () => {
  it('renders meaning, numbered examples, phrases and bulleted notes with their labels', () => {
    render(
      <DictionaryEntrySections
        meaningLabel="Meaning"
        meaning="Improve the way something is done."
        paragraphs={[{ key: 'usage', label: 'How to use', text: 'Use for practical improvements.' }]}
        examplesLabel="Examples"
        examples={['工夫する -> cải tiến', '工夫する -> cải tiến']}
        phrasesLabel="Common phrases"
        phrases={['cải tiến quy trình']}
        notesLabel="Notes"
        notes={['Moderately formal.']}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Meaning' })).toBeInTheDocument()
    expect(screen.getByText('Improve the way something is done.')).toHaveClass('entry-meaning')
    expect(screen.getByText('Use for practical improvements.')).toBeInTheDocument()
    expect(screen.getAllByText('工夫する -> cải tiến')).toHaveLength(2)
    expect(screen.getByText('cải tiến quy trình')).toHaveClass('entry-phrase')
    expect(screen.getByText('Moderately formal.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders translation chips as pressed Button atoms when a toggle handler is provided', () => {
    const onToggle = vi.fn()
    render(
      <DictionaryEntrySections
        meaningLabel="Meaning"
        meaning="Meaning."
        translationsLabel="Translations"
        translations={chips}
        selectedTranslationKey="a"
        onTranslationToggle={onToggle}
        translationChipLabel={(chip) => `Translation detail: ${chip.text}`}
      />,
    )

    const selected = screen.getByRole('button', { name: 'Translation detail: cải tiến' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(selected).toHaveAttribute('data-control-variant', 'primary')
    expect(screen.getByRole('button', { name: 'Translation detail: cải thiện' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Translation detail: cải thiện' }))
    expect(onToggle).toHaveBeenCalledWith('b')
  })

  it('renders translation chips as static tokens without a toggle handler', () => {
    render(
      <DictionaryEntrySections
        meaningLabel="Meaning"
        meaning="Meaning."
        translations={chips}
      />,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('cải tiến').closest('.entry-chip--static')).toBeInTheDocument()
    expect(screen.getByText('/kai tien/')).toHaveClass('entry-chip-pronunciation')
  })
})
