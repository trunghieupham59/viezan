import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVIDERS } from '../../../constants/providers'
import { useAppStore } from '../../../store/useAppStore'
import type { TranslationModelSelection } from '../../../types'
import { formatModelName } from '../../../utils/modelDisplay'
import { TranslationModelPicker } from '../translate/TranslationModelPicker'

const emptyCatalog = { gemini: [], claude: [], openai: [], local: [] }
const idle = { gemini: false, claude: false, openai: false, local: false }
const noErrors = { gemini: null, claude: null, openai: null, local: null }
const bundledOpenAiModel = PROVIDERS.find((provider) => provider.id === 'openai')?.models[0]
const bundledOpenAiName = bundledOpenAiModel
  ? formatModelName('openai', bundledOpenAiModel.id, bundledOpenAiModel.name)
  : ''

function renderPicker(models: TranslationModelSelection[] = []) {
  return render(
    <TranslationModelPicker models={models} onChange={vi.fn()} onOpenSettings={vi.fn()} />,
  )
}

beforeEach(() => {
  vi.mocked(window.api.fetchModels).mockReset()
  vi.mocked(window.api.fetchModels).mockResolvedValue({ success: false, models: [] })
  act(() => {
    useAppStore.setState({
      locale: 'en',
      localeAuto: false,
      keyStatus: { gemini: false, claude: false, openai: true, local: false },
      dynamicModels: emptyCatalog,
      modelsLoading: idle,
      modelsError: noErrors,
    })
  })
})

describe('TranslationModelPicker catalog loading', () => {
  it('loads the live catalog of keyed providers on open without a manual refresh', async () => {
    vi.mocked(window.api.fetchModels).mockResolvedValue({
      success: true,
      models: [{ id: 'gpt-live-1', name: 'GPT Live 1', description: '' }],
    })

    renderPicker()

    expect(await screen.findByRole('button', { name: /GPT Live 1/ })).toBeInTheDocument()
    expect(window.api.fetchModels).toHaveBeenCalledTimes(1)
    expect(window.api.fetchModels).toHaveBeenCalledWith('openai')
    expect(useAppStore.getState().dynamicModels.openai).toHaveLength(1)
  })

  it('does not offer the bundled fallback models while the live catalog is loading', async () => {
    let resolveFetch: (value: { success: boolean; models: [] }) => void = () => {}
    vi.mocked(window.api.fetchModels).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    renderPicker()

    expect(await screen.findByText('Loading models…')).toBeInTheDocument()
    expect(bundledOpenAiName).not.toBe('')
    expect(screen.queryByRole('button', { name: new RegExp(bundledOpenAiName) }))
      .not.toBeInTheDocument()

    await act(async () => {
      resolveFetch({ success: false, models: [] })
    })
    await waitFor(() => expect(screen.queryByText('Loading models…')).not.toBeInTheDocument())
  })

  it('falls back to the bundled list with an error when the live fetch fails', async () => {
    renderPicker()

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load')
    expect(screen.getByRole('button', { name: new RegExp(bundledOpenAiName) }))
      .toBeInTheDocument()
  })

  it('skips providers without a key and the local runtime probe', async () => {
    renderPicker()

    await waitFor(() => expect(window.api.fetchModels).toHaveBeenCalledTimes(1))
    expect(window.api.fetchModels).not.toHaveBeenCalledWith('gemini')
    expect(window.api.fetchModels).not.toHaveBeenCalledWith('claude')
    expect(window.api.fetchModels).not.toHaveBeenCalledWith('local')
  })

  it('does not refetch a provider that already has a live catalog', () => {
    act(() => {
      useAppStore.setState({
        dynamicModels: {
          ...emptyCatalog,
          openai: [{ id: 'gpt-cached', name: 'GPT Cached', description: '' }],
        },
      })
    })

    renderPicker()

    expect(screen.getByRole('button', { name: /GPT Cached/ })).toBeInTheDocument()
    expect(window.api.fetchModels).not.toHaveBeenCalled()
  })

  it('still refreshes a provider on demand', async () => {
    renderPicker()
    await waitFor(() => expect(window.api.fetchModels).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(useAppStore.getState().modelsLoading.openai).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: 'Refresh: OpenAI GPT' }))

    await waitFor(() => expect(window.api.fetchModels).toHaveBeenCalledTimes(2))
  })
})
