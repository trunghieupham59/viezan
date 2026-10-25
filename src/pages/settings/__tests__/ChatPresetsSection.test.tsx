import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { useAppStore } from '../../../store/useAppStore'
import { ChatPresetsSection } from '../ChatPresetsSection'

vi.mock('../ChatImageStorageCard', () => ({ ChatImageStorageCard: () => null }))

const preset = { id: 'p1', name: 'Coder', content: 'You write code.' }

describe('ChatPresetsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    act(() => useAppStore.setState({
      locale: 'en',
      localeAuto: false,
      systemPromptPresets: [preset],
      chatSystemPrompt: '',
      chatNewSessionShortcut: 'CommandOrControl+N',
    }))
  })

  it('asks before deleting a preset and keeps it when cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ChatPresetsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalledWith('Delete the preset “Coder”? This can’t be undone.')
    expect(useAppStore.getState().systemPromptPresets).toHaveLength(1)
  })

  it('deletes the preset once confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ChatPresetsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(useAppStore.getState().systemPromptPresets).toHaveLength(0)
  })

  it('confirms with a toast when a preset is applied', async () => {
    render(<><ChatPresetsSection /><NotificationViewport /></>)

    fireEvent.click(screen.getByRole('button', { name: 'Use this prompt' }))

    expect(useAppStore.getState().chatSystemPrompt).toBe('You write code.')
    expect(await screen.findByRole('status')).toHaveTextContent('Using “Coder” as the system prompt')
  })

  it('sizes the New chat row actions like the md shortcut recorder', () => {
    render(<ChatPresetsSection />)
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('data-control-size', 'md')

    act(() => useAppStore.setState({ chatNewSessionShortcut: '' }))
    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute('data-control-size', 'md')
  })
})
