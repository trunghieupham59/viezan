import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ButtonGroup } from '../ButtonGroup'
import { PresetActions } from '../PresetActions'
import { SettingsFormActions } from '../SettingsFormActions'

describe('settings control interactions', () => {
  it('keeps cancel usable while an async submit is unavailable', () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn()
    const { rerender } = render(
      <SettingsFormActions onCancel={onCancel} onSubmit={onSubmit} cancelLabel="Cancel" submitLabel="Save" submitting />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
    rerender(<SettingsFormActions onCancel={onCancel} onSubmit={onSubmit} cancelLabel="Cancel" submitLabel="Save" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('exposes selection and passes the option value rather than its label', () => {
    const onChange = vi.fn()
    render(<ButtonGroup value="small" onChange={onChange} options={[{ value: 'small', label: 'S' }, { value: 'large', label: 'L' }]} />)
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'L' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'L' }))
    expect(onChange).toHaveBeenCalledWith('large')
  })

  it('keeps all preset icon actions named and independently operable', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<PresetActions isDefault={false} onSetDefault={vi.fn()} onApply={vi.fn()} onEdit={onEdit} onDelete={onDelete} setDefaultTitle="Set default" applyTitle="Apply" editTitle="Edit" deleteTitle="Delete" />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
