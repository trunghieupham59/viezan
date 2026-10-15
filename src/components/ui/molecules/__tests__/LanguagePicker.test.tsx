import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Language } from '../../../../types'
import { LanguagePicker } from '../LanguagePicker'

const languages: Language[] = [
  { code: 'auto', name: 'Auto Detect', nativeName: 'Auto' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
]

function StatefulPicker({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('auto')
  return (
    <LanguagePicker
      value={value}
      options={languages}
      onChange={(language) => {
        setValue(language)
        onChange(language)
      }}
      getLabel={(language) => language.name}
      label="Translate from"
      searchPlaceholder="Search languages…"
      noResultsLabel="No languages found"
    />
  )
}

describe('LanguagePicker', () => {
  it('opens an app-owned searchable dialog and selects a language', () => {
    const onChange = vi.fn()
    render(<StatefulPicker onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: /Translate from/i })
    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Translate from' })).toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: 'Search languages…' })
    fireEvent.change(search, { target: { value: '日本' } })
    expect(screen.getByRole('option', { name: /Japanese/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Vietnamese/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: /Japanese/i }))
    expect(onChange).toHaveBeenCalledWith('ja')
    expect(trigger).toHaveTextContent('Japanese')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('supports ArrowDown navigation and Escape focus restoration', async () => {
    render(<StatefulPicker />)

    const trigger = screen.getByRole('button', { name: /Translate from/i })
    fireEvent.click(trigger)
    const search = screen.getByRole('searchbox', { name: 'Search languages…' })

    fireEvent.keyDown(search, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Auto Detect/i })).toHaveFocus()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog', { name: 'Translate from' })).not.toBeInTheDocument()
  })

  it('selects the first filtered language with Enter and restores trigger focus', async () => {
    const onChange = vi.fn()
    render(<StatefulPicker onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: /Translate from/i })
    fireEvent.click(trigger)
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'n' } })
    expect(screen.getAllByRole('option')).toHaveLength(3)

    fireEvent.keyDown(search, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledExactlyOnceWith('en')
    expect(trigger).toHaveTextContent('English')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('closes on Enter when the first result is already selected', () => {
    const onChange = vi.fn()
    render(<StatefulPicker onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Translate from/i }))
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    { isComposing: true },
    { keyCode: 229 },
  ])('does not select while confirming IME input (%j)', (composition) => {
    const onChange = vi.fn()
    render(<StatefulPicker onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Translate from/i }))
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: '日本' } })
    fireEvent.keyDown(search, { key: 'Enter', ...composition })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows a localized empty state when no option matches', () => {
    const onChange = vi.fn()
    render(<StatefulPicker onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Translate from/i }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Klingon' } })
    expect(screen.getByText('No languages found')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
