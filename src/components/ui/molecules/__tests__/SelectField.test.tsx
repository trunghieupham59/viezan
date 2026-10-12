import { fireEvent, render, screen } from '@testing-library/react'
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
})
