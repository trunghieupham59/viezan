import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { DictionaryAIConfiguration } from '../dictionary/DictionaryAIConfiguration'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <DictionaryAIConfiguration
      open={open}
      title="AI configuration"
      scopeDescription="Applies to the next dictionary lookup."
      closeLabel="Close"
      modelsLabel="Models"
      onOpenChange={setOpen}
    />
  )
}

describe('DictionaryAIConfiguration', () => {
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
          local: [{ id: 'local-auto', name: 'Auto local model', description: 'Best running local model' }],
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

  it('lists models directly in the popover and closes after a selection', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'AI configuration' }))

    const dialog = screen.getByRole('dialog', { name: 'AI configuration' })
    expect(dialog).toHaveTextContent('Models')
    expect(screen.getByRole('searchbox', { name: 'Search models…' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Advanced' })).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('searchbox', { name: 'Search models…' }))
    expect(screen.getByRole('dialog', { name: 'AI configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Auto local model' }))
    expect(screen.queryByRole('dialog', { name: 'AI configuration' })).not.toBeInTheDocument()
  })
})
