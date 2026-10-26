import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStorageStatus } from '../../store/useStorageStatus'
import type { DictionarySnapshot } from '../../types/workbench'
import { WorkbenchRecovery } from '../workbenchRecovery'
import type { WorkbenchRecords } from '../workbenchStorage'

const snapshot: DictionarySnapshot = { term: 'bank', context: 'river bank', sourceLang: 'en', targetLang: 'vi', selectedEntryId: 'entry', activeListTab: 'recent' }

describe('workbench recovery persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    useStorageStatus.setState({ recoveryFailed: false, recoveryReadFailed: false })
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  function setup() {
    let disk: WorkbenchRecords = {}
    const storage = { read: vi.fn(async () => structuredClone(disk)), write: vi.fn(async (records: WorkbenchRecords) => { disk = structuredClone(records) }) }
    return { storage, recovery: new WorkbenchRecovery(storage) }
  }

  it('restores completed work and retains its age across a fresh process', async () => {
    const { storage, recovery } = setup()
    await recovery.initialize()
    recovery.capture('dictionary', snapshot, true)
    recovery.leave('dictionary')
    await recovery.flush()
    vi.setSystemTime(100000)
    const reopened = new WorkbenchRecovery(storage)
    await reopened.initialize()
    reopened.capture('dictionary', { ...snapshot }, true)
    expect(reopened.get('dictionary')).toMatchObject({ snapshot, completedAt: 1000, awayAt: 1000 })
  })

  it('keeps the first departure and preserves a previous result through restart', async () => {
    const { storage, recovery } = setup()
    await recovery.initialize()
    recovery.capture('dictionary', snapshot, true)
    recovery.leave('dictionary')
    vi.setSystemTime(2000)
    recovery.leave('dictionary')
    expect(recovery.get('dictionary')?.awayAt).toBe(1000)
    recovery.enter('dictionary', snapshot)
    recovery.capture('dictionary', { ...snapshot, term: '', context: '', selectedEntryId: null }, false)
    await recovery.flush()
    const reopened = new WorkbenchRecovery(storage)
    await reopened.initialize()
    expect(reopened.get('dictionary')?.previous).toEqual(snapshot)
  })

  it('keeps pending data after a quota failure and retries without discarding the durable copy', async () => {
    const { storage, recovery } = setup()
    await recovery.initialize()
    recovery.capture('dictionary', snapshot, true)
    await recovery.flush()
    storage.write.mockRejectedValueOnce(new Error('quota'))
    recovery.capture('dictionary', { ...snapshot, term: 'new draft' }, false)
    expect(await recovery.flush()).toBe(false)
    expect((await storage.read()).dictionary?.snapshot.term).toBe('bank')
    expect(recovery.get('dictionary')?.snapshot.term).toBe('new draft')
    expect(useStorageStatus.getState().recoveryFailed).toBe(true)
    expect(await recovery.flush()).toBe(true)
    expect((await storage.read()).dictionary?.snapshot.term).toBe('new draft')
    expect(useStorageStatus.getState().recoveryFailed).toBe(false)
  })

  it('serializes writes so a slow older snapshot never overwrites a newer draft', async () => {
    const { storage, recovery } = setup()
    await recovery.initialize()
    let release!: () => void
    storage.write.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    recovery.capture('dictionary', snapshot, false)
    const saving = recovery.flush()
    recovery.capture('dictionary', { ...snapshot, term: 'newer' }, false)
    release()
    await saving
    expect((await storage.read()).dictionary?.snapshot.term).toBe('newer')
  })

  it('refuses to overwrite unreadable or unknown-version data', async () => {
    const storage = { read: vi.fn(async () => ({ dictionary: { version: 99 } }) as unknown as WorkbenchRecords), write: vi.fn() }
    const recovery = new WorkbenchRecovery(storage)
    await recovery.initialize()
    recovery.capture('dictionary', snapshot, false)
    expect(await recovery.flush()).toBe(false)
    expect(storage.write).not.toHaveBeenCalled()
    expect(useStorageStatus.getState().recoveryReadFailed).toBe(true)
  })

  it('an explicit clear removes the recovery copy, including the previous result', async () => {
    const { storage, recovery } = setup()
    await recovery.initialize()
    recovery.capture('dictionary', snapshot, true)
    recovery.enter('dictionary', snapshot)
    recovery.clear('dictionary')
    await recovery.flush()
    expect(await storage.read()).toEqual({})
  })
})
