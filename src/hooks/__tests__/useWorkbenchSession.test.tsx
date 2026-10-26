import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { workbenchRecovery } from '../../services/workbenchRecovery'
import { workbenchStorage } from '../../services/workbenchStorage'
import { useAppStore } from '../../store/useAppStore'
import type { DictionarySnapshot } from '../../types/workbench'
import { WORKBENCH_IDLE_MS } from '../../utils/workbenchPolicy'
import { useWorkbenchSession } from '../useWorkbenchSession'

const snapshot: DictionarySnapshot = { term: 'bank', context: '', selectedEntryId: 'entry', sourceLang: 'en', targetLang: 'vi', activeListTab: 'recent' }

describe('returning to a workbench', () => {
  beforeAll(async () => {
    vi.spyOn(workbenchStorage, 'read').mockResolvedValue({})
    vi.spyOn(workbenchStorage, 'write').mockResolvedValue(undefined)
    await workbenchRecovery.initialize()
  })
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    workbenchRecovery.clear('dictionary')
    useAppStore.setState({ smartSessionReset: true })
    vi.spyOn(workbenchStorage, 'write').mockResolvedValue(undefined)
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  it('does not clear a screen being read; clears only on return and can reopen the prior content', async () => {
    const reset = vi.fn(), restore = vi.fn()
    const { result } = renderHook(() => useWorkbenchSession('dictionary', { snapshot, complete: true, busy: false, reset, restore }))
    await act(async () => { await workbenchRecovery.flush() })
    act(() => { vi.setSystemTime(1000 + WORKBENCH_IDLE_MS.dictionary) })
    expect(reset).not.toHaveBeenCalled()
    act(() => { window.dispatchEvent(new Event('blur')); vi.setSystemTime(1000 + 2 * WORKBENCH_IDLE_MS.dictionary) })
    await act(async () => { window.dispatchEvent(new Event('focus')); await workbenchRecovery.flush() })
    expect(reset).toHaveBeenCalledTimes(1)
    act(() => result.current.restorePrevious())
    expect(restore).toHaveBeenCalledWith(snapshot)
  })

  it('does not clear new edits made while the save is in progress', async () => {
    const reset = vi.fn()
    const { rerender } = renderHook(({ draft }) => useWorkbenchSession('dictionary', {
      snapshot: draft, complete: true, busy: false, reset, restore: vi.fn(),
    }), { initialProps: { draft: snapshot } })
    await act(async () => { await workbenchRecovery.flush() })
    let release!: () => void
    vi.spyOn(workbenchStorage, 'write').mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    act(() => { window.dispatchEvent(new Event('blur')); vi.setSystemTime(1000 + WORKBENCH_IDLE_MS.dictionary); window.dispatchEvent(new Event('focus')) })
    rerender({ draft: { ...snapshot, term: 'my new input' } })
    await act(async () => { release(); await workbenchRecovery.flush() })
    expect(reset).not.toHaveBeenCalled()
  })

  it('keeps work visible if its recovery save fails', async () => {
    const reset = vi.fn()
    renderHook(() => useWorkbenchSession('dictionary', { snapshot, complete: true, busy: false, reset, restore: vi.fn() }))
    await act(async () => { await workbenchRecovery.flush() })
    vi.spyOn(workbenchStorage, 'write').mockRejectedValue(new Error('quota'))
    act(() => { window.dispatchEvent(new Event('blur')); vi.setSystemTime(1000 + WORKBENCH_IDLE_MS.dictionary) })
    await act(async () => { window.dispatchEvent(new Event('focus')); await workbenchRecovery.flush() })
    expect(reset).not.toHaveBeenCalled()
  })

  it('cannot reopen content after the user explicitly clears its recovery record', () => {
    workbenchRecovery.capture('dictionary', snapshot, true)
    workbenchRecovery.enter('dictionary', snapshot)
    const empty = { ...snapshot, term: '', selectedEntryId: null }
    const restore = vi.fn()
    const { result, rerender } = renderHook(({ draft }) => useWorkbenchSession('dictionary', {
      snapshot: draft, complete: false, busy: false, reset: vi.fn(), restore,
    }), { initialProps: { draft: empty } })
    expect(result.current.previous).toEqual(snapshot)
    const reopen = result.current.restorePrevious
    act(() => workbenchRecovery.clear('dictionary'))
    rerender({ draft: { ...empty } })
    expect(result.current.previous).toBeNull()
    act(reopen)
    expect(restore).not.toHaveBeenCalled()
  })
})
