import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import { ModelSelector } from '../ModelSelector'

const LOCAL_MODELS = [
  { id: 'local-auto', name: 'Auto local model', description: 'Best running local model' },
  { id: 'qwen3:4b', name: 'Qwen3 4B', description: 'Balanced local model' },
]

type FetchModelsResult = Awaited<ReturnType<typeof window.api.fetchModels>>

describe('ModelSelector', () => {
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
        dynamicModels: { local: LOCAL_MODELS, gemini: [], claude: [], openai: [] },
        modelsLoading: { local: false, gemini: false, claude: false, openai: false },
        modelsError: { local: null, gemini: null, claude: null, openai: null },
        recentModels: [],
      })
    })
    vi.mocked(window.api.fetchModels).mockReset()
    vi.mocked(window.api.fetchModels).mockResolvedValue({ success: false, models: [] })
  })

  it('opens the composer picker above the trigger and drills into model search', async () => {
    const onSelectionChange = vi.fn()
    render(<ModelSelector compact onSelectionChange={onSelectionChange} />)

    const trigger = screen.getByRole('button', { name: /auto local model/i })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 560,
      y: 700,
      top: 700,
      right: 720,
      bottom: 732,
      left: 560,
      width: 160,
      height: 32,
      toJSON: () => ({}),
    })

    fireEvent.click(trigger)

    const panel = await screen.findByRole('dialog', { name: 'Model' })
    await waitFor(() => expect(panel).toHaveClass('model-picker-panel--above'))
    expect(Number.parseFloat(panel.style.top)).toBeLessThan(700)

    fireEvent.click(screen.getByRole('button', { name: 'Model: Auto local model' }))
    const search = await screen.findByRole('searchbox', { name: 'Search models…' })
    fireEvent.change(search, { target: { value: 'Qwen3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Qwen3 4B' }))

    expect(useAppStore.getState().selectedModels.local).toBe('qwen3:4b')
    expect(onSelectionChange).toHaveBeenCalledWith('local', 'qwen3:4b')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the picker inline without creating a nested dialog', () => {
    const onOpenChange = vi.fn()
    render(<ModelSelector inline onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: /auto local model/i }))

    expect(screen.getByRole('group', { name: 'Model' }))
      .toHaveClass('model-picker-panel--inline')
    expect(screen.queryByRole('dialog', { name: 'Model' })).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Model' })).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('opens an inline direct picker without the intermediate model menu', async () => {
    render(<ModelSelector inline directModelList hideTriggerWhenOpen />)

    fireEvent.click(screen.getByRole('button', { name: /auto local model/i }))

    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search models…' })).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Model: Auto local model' })).not.toBeInTheDocument()
    expect(document.querySelector('.model-picker-trigger')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Advanced' })).not.toBeInTheDocument()
  })

  it('opens the inline advanced view from an owning surface request', async () => {
    const onInlineViewChange = vi.fn()
    const { rerender } = render(
      <ModelSelector
        inline
        directModelList
        hideTriggerWhenOpen
        advancedOpenRequest={0}
        onInlineViewChange={onInlineViewChange}
      />,
    )

    rerender(
      <ModelSelector
        inline
        directModelList
        hideTriggerWhenOpen
        advancedOpenRequest={1}
        onInlineViewChange={onInlineViewChange}
      />,
    )

    await waitFor(() => expect(document.querySelector('.model-picker-advanced-view')).toHaveFocus())
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByText('local-auto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
    expect(onInlineViewChange).toHaveBeenCalledWith('advanced')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Model' })).not.toBeInTheDocument()
    expect(onInlineViewChange).toHaveBeenLastCalledWith(null)
  })

  it('shows provider and advanced subviews without exposing unsupported controls', async () => {
    render(<ModelSelector compact />)
    fireEvent.click(screen.getByRole('button', { name: /auto local model/i }))

    fireEvent.click(await screen.findByRole('button', { name: 'Provider: Local AI' }))
    expect(screen.getByRole('button', { name: 'Local AI' })).toHaveAttribute('aria-current', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))

    expect(screen.getByText('local-auto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    render(<ModelSelector compact />)
    const trigger = screen.getByRole('button', { name: /auto local model/i })

    fireEvent.click(trigger)
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('falls back below the compact trigger when there is no room above', async () => {
    render(<ModelSelector compact />)
    const trigger = screen.getByRole('button', { name: /auto local model/i })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 560,
      y: 8,
      top: 8,
      right: 720,
      bottom: 40,
      left: 560,
      width: 160,
      height: 32,
      toJSON: () => ({}),
    })

    fireEvent.click(trigger)

    const panel = await screen.findByRole('dialog', { name: 'Model' })
    await waitFor(() => expect(panel).toHaveClass('model-picker-panel--below'))
    expect(Number.parseFloat(panel.style.top)).toBeGreaterThanOrEqual(40)
  })

  it('does not let an in-flight refresh overwrite a newer model choice', async () => {
    act(() => {
      useAppStore.setState({
        dynamicModels: { local: [], gemini: [], claude: [], openai: [] },
      })
    })
    let resolveFetch!: (value: FetchModelsResult) => void
    const pendingFetch = new Promise<FetchModelsResult>((resolve) => {
      resolveFetch = resolve
    })
    vi.mocked(window.api.fetchModels).mockImplementation(() => pendingFetch)

    render(<ModelSelector compact />)
    await waitFor(() => expect(window.api.fetchModels).toHaveBeenCalledWith('local'))
    fireEvent.click(screen.getByRole('button', { name: /auto local model/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Model: Auto local model' }))
    fireEvent.click(screen.getByRole('button', { name: 'Qwen3 4B' }))

    await act(async () => {
      resolveFetch({ success: true, models: LOCAL_MODELS, recommendedModel: 'local-auto' })
      await pendingFetch
    })

    expect(useAppStore.getState().selectedModels.local).toBe('qwen3:4b')
  })

  it('loads and displays the exact model ID returned by the provider', async () => {
    act(() => {
      useAppStore.setState({
        selectedProvider: 'claude',
        keyStatus: { local: false, gemini: false, claude: true, openai: false },
        dynamicModels: {
          local: LOCAL_MODELS,
          gemini: [],
          claude: [{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: '' }],
          openai: [],
        },
      })
    })
    vi.mocked(window.api.fetchModels).mockResolvedValue({
      success: true,
      models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Balanced' }],
      recommendedModel: 'claude-sonnet-4-6',
    })

    render(<ModelSelector compact />)
    fireEvent.click(screen.getByRole('button', { name: /claude sonnet 4/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByText('claude-sonnet-4-20250514')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText('claude-sonnet-4-6')).toBeInTheDocument()
    expect(useAppStore.getState().selectedModels.claude).toBe('claude-sonnet-4-6')
  })

  it('loads keyed cloud catalogs while Local is selected and hides pending fallback choices', async () => {
    act(() => {
      useAppStore.setState({
        keyStatus: { local: false, gemini: false, claude: true, openai: true },
      })
    })
    const resolvers = new Map<string, (result: FetchModelsResult) => void>()
    vi.mocked(window.api.fetchModels).mockImplementation((provider) => new Promise((resolve) => {
      resolvers.set(provider, resolve)
    }))
    const onSelectionChange = vi.fn()
    render(<ModelSelector embedded inline directModelList onSelectionChange={onSelectionChange} />)

    await waitFor(() => expect(window.api.fetchModels).toHaveBeenCalledTimes(2))
    expect(window.api.fetchModels).toHaveBeenCalledWith('openai')
    expect(window.api.fetchModels).toHaveBeenCalledWith('claude')
    expect(window.api.fetchModels).not.toHaveBeenCalledWith('gemini')
    expect(window.api.fetchModels).not.toHaveBeenCalledWith('local')
    expect(screen.queryByRole('button', { name: 'GPT 5 Mini' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claude Sonnet 5' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh: OpenAI GPT' })).toBeDisabled()

    await act(async () => {
      resolvers.get('openai')?.({ success: true, models: [{ id: 'gpt-live-1', name: 'GPT Live 1', description: '' }] })
      resolvers.get('claude')?.({ success: true, models: [{ id: 'claude-live-1', name: 'Claude Live 1', description: '' }] })
    })
    expect(await screen.findByRole('button', { name: 'GPT Live 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude Live 1' })).toBeInTheDocument()
    expect(useAppStore.getState().selectedProvider).toBe('local')
    expect(onSelectionChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'GPT Live 1' }))
    expect(onSelectionChange).toHaveBeenCalledWith('openai', 'gpt-live-1')
  })

  it('shows a cloud catalog error and retries without requiring a provider switch', async () => {
    act(() => {
      useAppStore.setState({ keyStatus: { local: false, gemini: false, claude: false, openai: true } })
    })
    render(<ModelSelector embedded inline directModelList />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load')
    vi.mocked(window.api.fetchModels).mockResolvedValue({
      success: true,
      models: [{ id: 'gpt-retry-1', name: 'GPT Retry 1', description: '' }],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh: OpenAI GPT' }))
    expect(await screen.findByRole('button', { name: 'GPT Retry 1' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(window.api.fetchModels).toHaveBeenCalledTimes(2)
    expect(useAppStore.getState().selectedProvider).toBe('local')
  })

  it('does not overwrite a different conversation when a catalog refresh finishes', async () => {
    act(() => {
      useAppStore.setState({
        selectedProvider: 'claude',
        keyStatus: { local: false, gemini: false, claude: true, openai: false },
        dynamicModels: { local: LOCAL_MODELS, gemini: [], claude: [{ id: 'claude-old', name: 'Claude Old', description: '' }], openai: [] },
      })
    })
    let resolveFetch!: (result: FetchModelsResult) => void
    vi.mocked(window.api.fetchModels).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    const onSelectionChange = vi.fn()
    const { rerender } = render(<ModelSelector embedded inline directModelList selectionContextKey="conversation-a" onSelectionChange={onSelectionChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh: Anthropic Claude' }))
    rerender(<ModelSelector embedded inline directModelList selectionContextKey="conversation-b" onSelectionChange={onSelectionChange} />)
    await act(async () => {
      resolveFetch({ success: true, models: [{ id: 'claude-new', name: 'Claude New', description: '' }], recommendedModel: 'claude-new' })
    })
    expect(await screen.findByRole('button', { name: 'Claude New' })).toBeInTheDocument()
    expect(useAppStore.getState().selectedModels.claude).toBe('claude-sonnet-4-20250514')
    expect(onSelectionChange).not.toHaveBeenCalled()
  })
})
