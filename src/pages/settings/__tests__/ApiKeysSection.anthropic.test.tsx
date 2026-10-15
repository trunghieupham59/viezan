import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { ApiKeysSection } from '../ApiKeysSection'

describe('ApiKeysSection Anthropic model discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      locale: 'en',
      keyStatus: { local: false, gemini: false, claude: false, openai: false },
      dynamicModels: { local: [], gemini: [], claude: [], openai: [] },
      modelsLoading: { local: false, gemini: false, claude: false, openai: false },
      modelsError: { local: null, gemini: null, claude: null, openai: null },
      selectedModels: {
        ...useAppStore.getState().selectedModels,
        claude: 'claude-sonnet-4-20250514',
      },
    })

    let stored = false
    vi.mocked(window.api.verifyKey).mockResolvedValue({ success: true })
    vi.mocked(window.api.keychain.save).mockImplementation(async () => {
      stored = true
      return { success: true }
    })
    vi.mocked(window.api.keychain.get).mockImplementation(async (provider) => ({
      exists: provider === 'claude' && stored,
      masked: provider === 'claude' && stored ? '••••••••••••1234' : null,
    }))
    vi.mocked(window.api.fetchModels).mockResolvedValue({
      success: true,
      models: [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Balanced' },
        { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', description: 'Powerful' },
      ],
      recommendedModel: 'claude-sonnet-4-6',
    })
  })

  it('loads models immediately after saving and replaces a retired selection', async () => {
    render(<ApiKeysSection />)

    const input = await screen.findByPlaceholderText('Paste your Anthropic Claude API key…')
    const card = input.closest('.card')
    expect(card).not.toBeNull()
    fireEvent.change(input, { target: { value: 'sk-ant-valid' } })
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Verify' }))

    await waitFor(() => expect(window.api.fetchModels).toHaveBeenCalledWith('claude'))
    await waitFor(() => {
      expect(useAppStore.getState().dynamicModels.claude.map((model) => model.id)).toEqual([
        'claude-sonnet-4-6',
        'claude-opus-4-8',
      ])
      expect(useAppStore.getState().selectedModels.claude).toBe('claude-sonnet-4-6')
    })
  })
})
