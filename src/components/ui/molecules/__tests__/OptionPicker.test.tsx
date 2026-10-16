import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OptionPicker } from '../OptionPicker'

const options = [
  { value: 'usd', label: 'USD' },
  { value: 'vnd', label: 'VND' },
  { value: 'jpy', label: 'JPY' },
]

function StatefulPicker({
  onChange = vi.fn(),
  searchPlaceholder,
}: { onChange?: (value: string) => void; searchPlaceholder?: string }) {
  const [value, setValue] = useState('usd')
  return (
    <OptionPicker
      value={value}
      options={options}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      label="Currency"
      searchPlaceholder={searchPlaceholder}
      noResultsLabel="No matches"
    />
  )
}

describe('OptionPicker', () => {
  it('renders an app-owned listbox, never a native select', () => {
    const { container } = render(<StatefulPicker />)
    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('button', { name: 'Currency: USD' })).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('selects an option and reflects it in the trigger', () => {
    const onChange = vi.fn()
    render(<StatefulPicker onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: 'Currency: USD' })
    fireEvent.click(trigger)
    expect(screen.getByRole('option', { name: 'USD' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: 'VND' }))
    expect(onChange).toHaveBeenCalledWith('vnd')
    expect(screen.getByRole('button', { name: 'Currency: VND' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('focuses the selected option on open, navigates with arrows and closes on Escape', async () => {
    render(<StatefulPicker />)
    const trigger = screen.getByRole('button', { name: 'Currency: USD' })
    fireEvent.click(trigger)

    await waitFor(() => expect(screen.getByRole('option', { name: 'USD' })).toHaveFocus())
    fireEvent.keyDown(screen.getByRole('option', { name: 'USD' }), { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByRole('option', { name: 'VND' })).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('adds a search box only when a placeholder is supplied', () => {
    render(<StatefulPicker searchPlaceholder="Search…" />)
    fireEvent.click(screen.getByRole('button', { name: 'Currency: USD' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search…' }), { target: { value: 'jp' } })
    expect(screen.getByRole('option', { name: 'JPY' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'USD' })).not.toBeInTheDocument()
  })

  it('skips unavailable options with keyboard navigation and explains why they are disabled', async () => {
    const onChange = vi.fn()
    render(<OptionPicker value="chat" label="Task" onChange={onChange} options={[
      { value: 'chat', label: 'Chat' },
      { value: 'image', label: 'Create image', disabled: true, hint: 'Choose a supported provider' },
      { value: 'write', label: 'Write' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Task: Chat' }))
    const chat = screen.getByRole('option', { name: 'Chat' })
    await waitFor(() => expect(chat).toHaveFocus())
    fireEvent.keyDown(chat, { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Write' })).toHaveFocus())
    const image = screen.getByRole('option', { name: 'Create image' })
    expect(image).toBeDisabled()
    expect(image).toHaveAttribute('aria-description', 'Choose a supported provider')
    expect(screen.getByText('Choose a supported provider')).toBeVisible()
    fireEvent.click(image)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('OptionPicker inside a window-level Escape host', () => {
  it('closes only the picker and does not reach window Escape listeners', async () => {
    const hostEscape = vi.fn()
    window.addEventListener('keydown', hostEscape)
    try {
      render(<StatefulPicker />)
      fireEvent.click(screen.getByRole('button', { name: 'Currency: USD' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      fireEvent.keyDown(document.body, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(hostEscape).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', hostEscape)
    }
  })
})
