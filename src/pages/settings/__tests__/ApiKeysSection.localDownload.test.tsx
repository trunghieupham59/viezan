import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../../components/organisms/NotificationViewport'
import { useAppStore } from '../../../store/useAppStore'
import type { LocalAiDiscoveryResult, LocalAiModelDownloadProgress } from '../../../types'
import { ApiKeysSection } from '../ApiKeysSection'

const hardware = { platform: 'win32', arch: 'x64', cpuCount: 20, totalMemoryGb: 32, tier: 'max' as const }

function runtime(installed: string[] = []): LocalAiDiscoveryResult {
  const suggestedModels = ['qwen3:14b', 'deepseek-r1:14b'].map((id) => ({
    id,
    name: id,
    description: 'test model',
    downloadModel: id,
    installed: installed.includes(id),
  }))
  return {
    success: true,
    available: true,
    engine: 'ollama',
    endpoint: 'http://127.0.0.1:11434/v1',
    models: installed.map((id) => ({ id, name: id, description: '' })),
    suggestedModels,
    recommendedModel: 'qwen3:14b',
    hardware,
  }
}

const progress = (model: string, percent: number): LocalAiModelDownloadProgress => ({
  model,
  status: 'running',
  percent,
  message: 'pulling',
})

describe('ApiKeysSection local model downloads', () => {
  let emit: (p: LocalAiModelDownloadProgress) => void

  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({ locale: 'en' })
    vi.mocked(window.api.keychain.get).mockResolvedValue({ exists: false, masked: null })
    vi.mocked(window.api.ensureLocalAiRuntime).mockResolvedValue(runtime())
    vi.mocked(window.api.onLocalAiModelDownloadProgress).mockImplementation((cb) => {
      emit = cb
      return () => {}
    })
  })

  it('resumes the progress of a pull that kept running while Settings was closed', async () => {
    window.api.getLocalAiActiveDownloads = vi.fn().mockResolvedValue([progress('qwen3:14b', 42)])

    render(<><ApiKeysSection /><NotificationViewport /></>)

    expect(await screen.findByText('42%', { selector: 'button' })).toBeTruthy()
    // One pull at a time: the other model cannot be started on top of it.
    const other = (await screen.findAllByRole('button', { name: /Download/ }))
    for (const button of other) expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps each model on its own progress when two pulls report interleaved events', async () => {
    window.api.getLocalAiActiveDownloads = vi.fn().mockResolvedValue([])
    render(<><ApiKeysSection /><NotificationViewport /></>)
    await screen.findAllByRole('button', { name: /Download/ })

    act(() => {
      emit(progress('qwen3:14b', 30))
      emit(progress('deepseek-r1:14b', 5))
      emit(progress('qwen3:14b', 31))
    })

    expect(screen.getByText('31%', { selector: 'button' })).toBeTruthy()
    expect(screen.getByText('5%', { selector: 'button' })).toBeTruthy()
  })

  it('refreshes the model catalog when a resumed pull finishes', async () => {
    window.api.getLocalAiActiveDownloads = vi.fn().mockResolvedValue([progress('qwen3:14b', 99)])
    render(<><ApiKeysSection /><NotificationViewport /></>)
    await screen.findByText('99%', { selector: 'button' })
    vi.mocked(window.api.ensureLocalAiRuntime).mockClear()
    vi.mocked(window.api.ensureLocalAiRuntime).mockResolvedValue(runtime(['qwen3:14b']))

    act(() => emit({ model: 'qwen3:14b', status: 'success', percent: 100, message: 'done' }))

    await waitFor(() => expect(window.api.ensureLocalAiRuntime).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('99%', { selector: 'button' })).toBeNull())
    expect(await screen.findByText('Uninstall')).toBeTruthy()
  })

  it('does not report an error when the model is already being pulled', async () => {
    window.api.getLocalAiActiveDownloads = vi.fn().mockResolvedValue([])
    vi.mocked(window.api.downloadLocalAiModel).mockResolvedValue({
      success: false,
      model: 'qwen3:14b',
      error: 'This model is already being downloaded.',
    })
    render(<><ApiKeysSection /><NotificationViewport /></>)
    const [download] = await screen.findAllByRole('button', { name: /Download/ })

    act(() => download.click())

    await waitFor(() => expect(window.api.downloadLocalAiModel).toHaveBeenCalled())
    expect(screen.queryByText('This model is already being downloaded.')).toBeNull()
    expect(screen.getByText('1%', { selector: 'button' })).toBeTruthy()
  })
})
