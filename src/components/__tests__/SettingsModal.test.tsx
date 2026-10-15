import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import { SettingsModal } from '../SettingsModal'

vi.mock('../../pages/SettingsPage', () => ({
  SettingsPage: () => (
    <div>
      <button type="button">First setting</button>
      <button type="button">Last setting</button>
    </div>
  ),
}))

function Harness() {
  const openSettings = useAppStore((state) => state.openSettings)
  return (
    <>
      <button type="button" onClick={openSettings}>Open settings</button>
      <SettingsModal />
    </>
  )
}

describe('SettingsModal keyboard boundary', () => {
  beforeEach(() => {
    act(() => useAppStore.setState({
      locale: 'en',
      localeAuto: false,
      settingsOpen: false,
    }))
  })

  it('contains tab focus and restores the opener after Escape', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open settings' })
    opener.focus()
    fireEvent.click(opener)

    const close = await screen.findByRole('button', { name: 'Close settings' })
    await waitFor(() => expect(close).toHaveFocus())

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Last setting' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Last setting' }), { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })
})
