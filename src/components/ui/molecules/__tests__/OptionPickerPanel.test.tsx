import { fireEvent, render, screen, within } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OptionPickerPanel, type OptionPickerPanelProps } from '../OptionPickerPanel'

const options = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Vietnamese' },
]

function Harness(props: Partial<OptionPickerPanelProps>) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button type="button" ref={anchorRef}>anchor</button>
      <OptionPickerPanel
        open
        anchorRef={anchorRef}
        onClose={vi.fn()}
        value="en"
        options={options}
        onChange={vi.fn()}
        label="Language"
        {...props}
      />
    </>
  )
}

describe('OptionPickerPanel chips', () => {
  it('renders no chip section without chips', () => {
    render(<Harness />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('selects a pair chip then closes with focus restoration', () => {
    const onChipSelect = vi.fn()
    const onClose = vi.fn()
    const onChange = vi.fn()
    render(<Harness chips={[{ key: 'en:vi', label: 'English → Vietnamese', selected: true }, { key: 'ja:vi', label: 'Japanese → Vietnamese' }]}
      chipsLabel="Recent pairs" onChipSelect={onChipSelect} onClose={onClose} onChange={onChange} />)
    const group = screen.getByRole('group', { name: 'Recent pairs' })
    expect(within(group).getByRole('button', { name: 'English → Vietnamese' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(group).getByRole('button', { name: 'Japanese → Vietnamese' }))
    expect(onChipSelect).toHaveBeenCalledWith('ja:vi')
    expect(onClose).toHaveBeenCalledWith(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true')
  })

  it('toggles pinning without closing the panel', () => {
    const onChipPinChange = vi.fn()
    const onClose = vi.fn()
    render(<Harness chips={[{ key: 'en:vi', label: 'English → Vietnamese', pinned: true }, { key: 'ja:vi', label: 'Japanese → Vietnamese' }]}
      chipsLabel="Recent pairs" onChipPinChange={onChipPinChange} onClose={onClose} pinLabel="Pin pair" unpinLabel="Unpin pair" />)
    const unpin = screen.getByRole('button', { name: 'Unpin pair: English → Vietnamese' })
    expect(unpin).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(unpin)
    expect(onChipPinChange).toHaveBeenCalledWith('en:vi', false)
    fireEvent.click(screen.getByRole('button', { name: 'Pin pair: Japanese → Vietnamese' }))
    expect(onChipPinChange).toHaveBeenCalledWith('ja:vi', true)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hides pin controls when no pin handler is provided', () => {
    render(<Harness chips={[{ key: 'en:vi', label: 'English → Vietnamese' }]} chipsLabel="Recent pairs" pinLabel="Pin pair" />)
    expect(screen.queryByRole('button', { name: /Pin pair/ })).not.toBeInTheDocument()
  })
})
