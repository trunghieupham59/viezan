import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SliderField, snapToRange } from '../SliderField'

describe('SliderField', () => {
  it('snaps typed values into the range and onto the step', () => {
    expect(snapToRange(2374, 1499, 5348, 50)).toBe(2350)
    expect(snapToRange(100, 1499, 5348, 50)).toBe(1499)
    expect(snapToRange(99999, 1499, 5348, 50)).toBe(5348)
    expect(snapToRange(Number.NaN, 20, 110, 1)).toBe(20)
  })

  it('commits a typed value on Enter and on blur, corrected to the range, and only when it changed', () => {
    const onCommit = vi.fn()
    render(<SliderField label="Target speed" value={2000} min={1499} max={5348} step={50} unit="RPM" onCommit={onCommit} />)
    const box = screen.getByRole('spinbutton', { name: 'Target speed' })
    const slider = screen.getByRole('slider', { name: 'Target speed' })
    expect(box).toHaveValue(2000)
    expect(slider).toHaveValue('2000')

    fireEvent.change(box, { target: { value: '3020' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onCommit).toHaveBeenLastCalledWith(3000)
    expect(box).toHaveValue(3000)
    expect(slider).toHaveValue('3000')

    fireEvent.change(box, { target: { value: '99999' } })
    fireEvent.blur(box)
    expect(onCommit).toHaveBeenLastCalledWith(5348)

    // Typing the committed value back (the parent still holds 2000) is not a change.
    onCommit.mockClear()
    fireEvent.change(box, { target: { value: '2000' } })
    fireEvent.blur(box)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('previews while dragging and commits on release; Escape restores the committed value', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(<SliderField label="Minimum speed up to" value={50} min={20} max={109} step={1} unit="°C" onChange={onChange} onCommit={onCommit} />)
    const slider = screen.getByRole('slider', { name: 'Minimum speed up to' })
    const box = screen.getByRole('spinbutton', { name: 'Minimum speed up to' })

    fireEvent.change(slider, { target: { value: '63' } })
    expect(onChange).toHaveBeenLastCalledWith(63)
    expect(box).toHaveValue(63)
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.pointerUp(slider)
    expect(onCommit).toHaveBeenLastCalledWith(63)

    fireEvent.change(box, { target: { value: '80' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(box).toHaveValue(50)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
