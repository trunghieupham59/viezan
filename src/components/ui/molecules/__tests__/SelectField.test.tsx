import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelectField } from '../SelectField'

const options = [
  { value: 'general', label: 'General' },
  { value: 'formal', label: 'Formal' },
  { value: 'technical', label: 'Technical' },
] as const

describe('SelectField', () => {
  it('selects with keyboard navigation and returns focus to its trigger', () => {
    const onChange = vi.fn()
    render(
      <SelectField
        label="Style"
        value="general"
        options={options}
        onChange={onChange}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Style General' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox', { name: 'Style' })).toBeInTheDocument()

    const general = screen.getByRole('option', { name: 'General' })
    const formal = screen.getByRole('option', { name: 'Formal' })
    expect(general).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(general, { key: 'ArrowDown' })
    expect(formal).toHaveFocus()
    fireEvent.click(formal)
    expect(onChange).toHaveBeenCalledWith('formal')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows an option description beside its label', () => {
    render(
      <SelectField
        label="Style"
        value="general"
        options={[
          { value: 'general', label: 'General', description: 'Balanced' },
          { value: 'formal', label: 'Formal', description: 'Official letters' },
        ]}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Style General' }))
    const formal = screen.getByRole('option', { name: 'Formal' })
    expect(formal).toHaveAccessibleDescription('Official letters')
    expect(screen.getByText('Official letters')).toHaveAttribute('title', 'Official letters')
  })

  it('closes on Escape without changing the value', () => {
    const onChange = vi.fn()
    render(
      <SelectField label="Reading" value="general" options={options} onChange={onChange} />,
    )

    const trigger = screen.getByRole('button', { name: 'Reading General' })
    fireEvent.click(trigger)
    const selected = screen.getByRole('option', { name: 'General' })
    fireEvent.keyDown(selected, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('consumes Escape on the trigger while the menu is open', () => {
    const onParentKeyDown = vi.fn()
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: observes bubbling only
      <div onKeyDown={onParentKeyDown}>
        <SelectField label="Reading" value="general" options={options} onChange={vi.fn()} />
      </div>,
    )

    const trigger = screen.getByRole('button', { name: 'Reading General' })
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onParentKeyDown).not.toHaveBeenCalled()

    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(onParentKeyDown).toHaveBeenCalledTimes(1)
  })

  it('exposes disabled state and its explanation', () => {
    render(
      <SelectField
        label="Reasoning"
        value="general"
        options={options}
        onChange={vi.fn()}
        disabled
        disabledHint="Not configurable"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Reasoning General' })
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveAttribute('title', 'Not configurable')
    fireEvent.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  describe('with search', () => {
    const languages = [
      { value: 'vi', label: 'Tiếng Việt' },
      { value: 'ja', label: 'Japanese', description: '日本語' },
      { value: 'de', label: 'German', description: 'Deutsch' },
      { value: 'fr', label: 'French', description: 'Français', disabled: true },
    ]
    const renderSearchable = (onChange = vi.fn(), onParentKeyDown = vi.fn()) => {
      render(
        // biome-ignore lint/a11y/noStaticElementInteractions: stands in for an enclosing popover
        <div onKeyDown={onParentKeyDown}>
          <SelectField label="Language" value="ja" options={languages} onChange={onChange}
            searchPlaceholder="Search languages" noResultsLabel="No language found" clearSearchLabel="Clear search" />
        </div>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Language Japanese' }))
      return { onChange, onParentKeyDown, search: screen.getByRole('searchbox', { name: 'Search languages' }) }
    }

    it('opens on a search field that filters by label, description and value, ignoring diacritics', async () => {
      const { search } = renderSearchable()
      await waitFor(() => expect(search).toHaveFocus())
      expect(screen.getByRole('listbox', { name: 'Language' })).toBeInTheDocument()
      fireEvent.change(search, { target: { value: 'tieng viet' } })
      expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual(['Tiếng Việt'])
      fireEvent.change(search, { target: { value: 'deutsch' } })
      expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual(['German'])
      fireEvent.change(search, { target: { value: 'zzz' } })
      expect(screen.queryAllByRole('option')).toHaveLength(0)
      expect(screen.getByRole('status')).toHaveTextContent('No language found')
    })

    it('moves between the field and the list, and Enter picks the best enabled match', () => {
      const { search, onChange } = renderSearchable()
      fireEvent.keyDown(search, { key: 'ArrowDown' })
      expect(screen.getByRole('option', { name: 'Japanese' })).toHaveFocus()
      fireEvent.keyDown(screen.getByRole('option', { name: 'Tiếng Việt' }), { key: 'ArrowUp' })
      expect(search).toHaveFocus()
      // A disabled match is skipped.
      fireEvent.change(search, { target: { value: 'fr' } })
      fireEvent.keyDown(search, { key: 'Enter' })
      expect(onChange).not.toHaveBeenCalled()
      fireEvent.change(search, { target: { value: 'ger' } })
      fireEvent.keyDown(search, { key: 'Enter' })
      expect(onChange).toHaveBeenCalledWith('de')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Language Japanese' })).toHaveFocus()
    })

    it('closes on Escape from the field without closing the surface, and starts empty next time', () => {
      const { search, onParentKeyDown } = renderSearchable()
      fireEvent.change(search, { target: { value: 'ger' } })
      fireEvent.keyDown(search, { key: 'Escape' })
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(onParentKeyDown).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Language Japanese' }))
      expect(screen.getByRole('searchbox', { name: 'Search languages' })).toHaveValue('')
      expect(screen.getAllByRole('option')).toHaveLength(4)
    })
  })
})
