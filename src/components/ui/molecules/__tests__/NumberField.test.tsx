import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from '../NumberField'

describe('NumberField', () => {
  it('commits corrected values on Enter and blur, skips unchanged values, and restores on Escape', () => {
    const onCommit = vi.fn()
    render(<NumberField label="Maximum speed from" value={80} min={21} max={110} unit="°C" onCommit={onCommit} />)
    const box = screen.getByRole('spinbutton', { name: 'Maximum speed from' })
    expect(box).toHaveValue(80)

    fireEvent.change(box, { target: { value: '95' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onCommit).toHaveBeenLastCalledWith(95)

    fireEvent.change(box, { target: { value: '500' } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenLastCalledWith(110)

    onCommit.mockClear()
    fireEvent.change(box, { target: { value: '80' } })
    fireEvent.blur(box)
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.change(box, { target: { value: '42' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(box).toHaveValue(80)
    expect(onCommit).not.toHaveBeenCalled()
  })
})
