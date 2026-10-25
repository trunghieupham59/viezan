import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { useUpdaterStore } from '../../../store/useUpdaterStore'
import { AboutSection } from '../AboutSection'

describe('AboutSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    act(() => {
      useAppStore.setState((state) => ({
        locale: 'en',
        localeAuto: false,
        keyStatus: { ...state.keyStatus, local: true },
        selectedModels: { ...state.selectedModels, local: 'qwen3:14b' },
        localAiEngine: null,
      }))
      useUpdaterStore.setState({ status: { type: 'idle' } })
    })
  })

  it('marks the updater as checking before asking main to check', () => {
    let statusWhenCalled: string | undefined
    vi.mocked(window.api.updater.check).mockImplementation(async () => {
      statusWhenCalled = useUpdaterStore.getState().status.type
      return { success: true }
    })
    render(<AboutSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    expect(window.api.updater.check).toHaveBeenCalledTimes(1)
    expect(statusWhenCalled).toBe('checking')
  })

  it('names the detected local engine', () => {
    act(() => useAppStore.setState({ localAiEngine: 'lmstudio' }))
    render(<AboutSection />)
    expect(screen.getByText('LM Studio · qwen3:14b')).toBeInTheDocument()
  })

  it('omits the engine word when it is unknown instead of assuming Ollama', () => {
    render(<AboutSection />)
    expect(screen.getByText('qwen3:14b')).toBeInTheDocument()
    expect(screen.queryByText(/Ollama/)).not.toBeInTheDocument()
  })
})
