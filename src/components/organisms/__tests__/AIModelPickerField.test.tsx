import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { AIModelPickerField } from '../AIModelPickerField'

describe('AIModelPickerField', () => {
  beforeEach(() => {
    act(() => {
      useAppStore.setState({
        locale: 'en',
        selectedProvider: 'local',
        selectedModels: {
          local: 'local-auto',
          gemini: 'gemini-2.5-flash',
          claude: 'claude-sonnet-4-20250514',
          openai: 'gpt-5-mini',
        },
        keyStatus: { local: false, gemini: false, claude: false, openai: false },
        dynamicModels: {
          local: [
            { id: 'local-auto', name: 'Auto local model', description: 'Best running local model' },
            { id: 'qwen3:4b', name: 'Qwen3 4B', description: 'Balanced local model' },
          ],
          gemini: [],
          claude: [],
          openai: [],
        },
        modelsLoading: { local: false, gemini: false, claude: false, openai: false },
        modelsError: { local: null, gemini: null, claude: null, openai: null },
        recentModels: [],
      })
    })
    vi.mocked(window.api.fetchModels).mockReset()
    vi.mocked(window.api.fetchModels).mockResolvedValue({ success: false, models: [] })
  })

  it('expands the searchable catalog in place and collapses after a selection', () => {
    render(<AIModelPickerField />)
    const field = screen.getByRole('button', { name: /^Model: / })
    expect(field).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(field)
    expect(field).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('searchbox', { name: 'Search models…' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Qwen3 4B' }))
    expect(useAppStore.getState().selectedModels.local).toBe('qwen3:4b')
    expect(screen.queryByRole('searchbox', { name: 'Search models…' })).not.toBeInTheDocument()
  })

  it('collapses on Escape instead of leaving an empty section', () => {
    render(<AIModelPickerField />)
    fireEvent.click(screen.getByRole('button', { name: /^Model: / }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('searchbox', { name: 'Search models…' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Model: / })).toHaveAttribute('aria-expanded', 'false')
  })
})
