import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CredentialCard } from '../CredentialCard'

const labels = {
  saved: 'Saved',
  empty: 'Not set',
  invalid: 'Invalid',
  remove: 'Remove key',
  verifying: 'Verifying',
  verified: 'Verified',
  tryAgain: 'Try again',
  submit: 'Save',
  edit: 'Edit',
  add: 'Add key',
}

function SavedKeyCard({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <CredentialCard
      title="Claude"
      docsLabel="Get a key"
      labels={labels}
      inputValue={value}
      maskedValue="sk-ant-••••1234"
      placeholder="Paste a new key"
      hasSecret
      onOpenDocs={vi.fn()}
      onInputChange={setValue}
      onSubmit={() => onSubmit(value)}
      onDelete={vi.fn()}
    />
  )
}

describe('CredentialCard', () => {
  it('lets a saved key be replaced by typing over its masked value', () => {
    const onSubmit = vi.fn()
    render(<SavedKeyCard onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const field = screen.getByPlaceholderText('Paste a new key')
    expect(field).toHaveValue('sk-ant-••••1234')
    expect(field).toHaveAttribute('readonly')

    fireEvent.focus(field)
    expect(field).not.toHaveAttribute('readonly')
    expect(field).toHaveValue('')

    fireEvent.change(field, { target: { value: 'sk-ant-new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith('sk-ant-new')
  })

  it('shows the saved mask again when the replacement is left empty', () => {
    render(<SavedKeyCard onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const field = screen.getByPlaceholderText('Paste a new key')
    fireEvent.focus(field)
    fireEvent.blur(field)

    expect(field).toHaveValue('sk-ant-••••1234')
    expect(field).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Remove key' })).toBeEnabled()
  })
})
