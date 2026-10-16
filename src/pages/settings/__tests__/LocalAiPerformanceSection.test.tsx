import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import type { LocalAiPerformanceState } from '../../../types'
import { LocalAiPerformanceSection } from '../LocalAiPerformanceSection'

const model = 'gemma3:4b'
const measured: LocalAiPerformanceState = {
  comparison: { model, measuredAt: '2026-10-15T09:00:00Z', recommendedMode: 'gpu', results: [
    { mode: 'gpu', status: 'ok', profile: { model, mode: 'gpu', numGpuLayers: 999, contextLength: 2048 }, qualityPassed: true, tokensPerSecond: 40, firstTokenMs: 100, vramBytes: 3e9, modelRamBytes: 0 },
    { mode: 'hybrid', status: 'error', profile: { model, mode: 'hybrid', numGpuLayers: 17, contextLength: 2048 }, error: 'Placement not applied' },
  ] },
}
beforeEach(() => {
  useAppStore.setState({ locale: 'en' })
  window.api.getLocalAiPerformance = vi.fn().mockResolvedValue({})
  window.api.compareLocalAiPerformance = vi.fn().mockResolvedValue(measured)
  window.api.selectLocalAiPerformance = vi.fn().mockResolvedValue({ ...measured, selection: measured.comparison?.results[0].profile })
  window.api.cancelLocalAiPerformance = vi.fn().mockResolvedValue(undefined)
})
describe('local performance settings', () => {
  it('asks before invoking any model reload and never selects automatically', async () => {
    render(<LocalAiPerformanceSection models={[{ id: model, name: model }]} />)
    const compare = await screen.findByRole('button', { name: 'Compare GPU / CPU + GPU' })
    await waitFor(() => expect(compare).not.toBeDisabled())
    fireEvent.click(compare)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(window.api.compareLocalAiPerformance).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Allow reload and compare' }))
    await screen.findByText('40 tok/s')
    expect(window.api.compareLocalAiPerformance).toHaveBeenCalledWith({ model, consentToReload: true })
    expect(window.api.selectLocalAiPerformance).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'CPU + GPU' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'GPU' }))
    await waitFor(() => expect(window.api.selectLocalAiPerformance).toHaveBeenCalledWith(model, 'gpu'))
  })
  it('can stop a comparison that is still restoring or was started before reopening settings', async () => {
    vi.mocked(window.api.getLocalAiPerformance).mockResolvedValue({ running: true })
    render(<LocalAiPerformanceSection models={[{ id: model, name: model }]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Stop comparison' }))
    expect(window.api.cancelLocalAiPerformance).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Runtime default' })).toBeDisabled()
  })
  it('shows connection recovery evidence instead of hiding failed attempts', async () => {
    const recovered = structuredClone(measured)
    if (recovered.comparison) Object.assign(recovered.comparison.results[0], { runnerRecoveries: 2, runnerRecoveryErrors: ['internal runner connection reset'] })
    vi.mocked(window.api.getLocalAiPerformance).mockResolvedValue(recovered)
    render(<LocalAiPerformanceSection models={[{ id: model, name: model }]} />)
    expect(await screen.findByText('Runner connection recoveries: 2')).toBeTruthy()
    expect(screen.getByText('internal runner connection reset')).toBeTruthy()
    expect(screen.getByText(/First-token latency includes retries/)).toBeTruthy()
  })
  it('ignores a stale settings response after switching models', async () => {
    let resolveFirst: (state: LocalAiPerformanceState) => void = () => {}
    vi.mocked(window.api.getLocalAiPerformance).mockImplementation(id => id === model
      ? new Promise(resolve => { resolveFirst = resolve }) : Promise.resolve({}))
    const { rerender } = render(<LocalAiPerformanceSection models={[{ id: model, name: model }]} />)
    rerender(<LocalAiPerformanceSection models={[{ id: 'other:3b', name: 'Other' }]} />)
    await waitFor(() => expect(window.api.getLocalAiPerformance).toHaveBeenCalledWith('other:3b'))
    await act(async () => resolveFirst(measured))
    expect(screen.queryByText('40 tok/s')).toBeNull()
  })
})
