import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Language } from '../../../../types'
import { LanguageOverflowPicker } from '../LanguageOverflowPicker'

const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
]

function StatefulOverflow({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <LanguageOverflowPicker
      value={value}
      options={languages}
      onChange={(language) => {
        setValue(language)
        onChange(language)
      }}
      getLabel={(language) => language.name}
      label="More languages"
      searchPlaceholder="Search languages…"
      noResultsLabel="No languages found"
      active={value !== null}
    />
  )
}

describe('LanguageOverflowPicker', () => {
  it('opens the searchable panel from an icon-only trigger and selects a language', () => {
    const onChange = vi.fn()
    render(<StatefulOverflow onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: 'More languages' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'More languages' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search languages…' }), {
      target: { value: '日本' },
    })
    expect(screen.queryByRole('option', { name: /Vietnamese/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: /Japanese/i }))
    expect(onChange).toHaveBeenCalledWith('ja')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('data-control-variant', 'primary')
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    render(<StatefulOverflow />)

    const trigger = screen.getByRole('button', { name: 'More languages' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marks the selected option and leaves the trigger neutral when no overflow language is active', () => {
    render(
      <LanguageOverflowPicker
        value="vi"
        options={languages}
        onChange={vi.fn()}
        getLabel={(language) => language.name}
        label="More languages"
        searchPlaceholder="Search languages…"
        noResultsLabel="No languages found"
      />,
    )
    const trigger = screen.getByRole('button', { name: 'More languages' })
    expect(trigger).toHaveAttribute('data-control-variant', 'neutral')
    fireEvent.click(trigger)
    expect(screen.getByRole('option', { name: /Vietnamese/i })).toHaveAttribute('aria-selected', 'true')
  })
})
