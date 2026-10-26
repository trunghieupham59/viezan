import { useStorageStatus } from '../store/useStorageStatus'
import type { WorkbenchFeature, WorkbenchRecord, WorkbenchSnapshots } from '../types/workbench'
import { type WorkbenchRecords, type WorkbenchStorage, workbenchStorage } from './workbenchStorage'
import { validWorkbenchRecords } from './workbenchValidation'

const SAVE_DELAY_MS = 250

function sameSnapshot(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const entries = Object.entries(a)
  return entries.length === Object.keys(b).length && entries.every(([key, value]) => sameSnapshot(value, (b as Record<string, unknown>)[key]))
}

/** Two small recovery records, independent of the existing history/settings store. */
export class WorkbenchRecovery {
  private records: WorkbenchRecords = {}
  private revision = 0
  private savedRevision = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private initialization: Promise<void> | undefined
  private writing: Promise<boolean> | undefined
  private readable = false

  constructor(private storage: WorkbenchStorage) {}

  initialize(): Promise<void> {
    this.initialization ??= this.storage.read().then((records) => {
      // Refuse unknown schemas rather than overwriting a newer/invalid recovery file.
      if (!validWorkbenchRecords(records)) throw new Error('Invalid recovery data')
      for (const feature of ['translate', 'dictionary'] as const) {
        const record = records[feature]
        if (!record) continue
        record.awayAt ??= record.updatedAt
      }
      this.records = records
      this.readable = true
    }).catch(() => { useStorageStatus.setState({ recoveryReadFailed: true }) })
    return this.initialization
  }

  get<K extends WorkbenchFeature>(feature: K): WorkbenchRecord<K> | undefined {
    return this.records[feature] as WorkbenchRecord<K> | undefined
  }

  capture<K extends WorkbenchFeature>(feature: K, snapshot: WorkbenchSnapshots[K], complete: boolean): void {
    if (!this.initialization) return
    const old = this.get(feature)
    const unchanged = old && sameSnapshot(old.snapshot, snapshot)
    if (unchanged && Boolean(old.completedAt !== null) === complete) return
    const now = Date.now()
    this.records = { ...this.records, [feature]: {
      version: 1, snapshot, previous: old?.previous ?? null, awayAt: old?.awayAt ?? null,
      completedAt: complete ? (unchanged ? old.completedAt ?? now : now) : null, updatedAt: now,
    } }
    this.changed()
  }

  leave(feature: WorkbenchFeature): void {
    const record = this.get(feature)
    if (!record || record.awayAt !== null) return
    this.records = { ...this.records, [feature]: { ...record, awayAt: Date.now() } }
    this.changed()
  }

  enter<K extends WorkbenchFeature>(feature: K, previous?: WorkbenchSnapshots[K]): void {
    const record = this.get(feature)
    if (!record) return
    this.records = { ...this.records, [feature]: { ...record, awayAt: null, previous: previous ?? record.previous } }
    this.changed()
  }

  clear(feature: WorkbenchFeature): void {
    if (!this.records[feature]) return
    const next = { ...this.records }
    delete next[feature]
    this.records = next
    this.changed()
  }

  forgetPrevious(feature: WorkbenchFeature): void {
    const record = this.get(feature)
    if (!record?.previous) return
    this.records = { ...this.records, [feature]: { ...record, previous: null } }
    this.changed()
  }

  private changed(): void {
    this.revision++
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, SAVE_DELAY_MS)
  }

  flush(): Promise<boolean> {
    clearTimeout(this.timer)
    if (!this.readable) return Promise.resolve(false)
    if (this.writing) return this.writing
    this.writing = this.writePending().finally(() => { this.writing = undefined })
    return this.writing
  }

  private async writePending(): Promise<boolean> {
    try {
      while (this.savedRevision !== this.revision) {
        const revision = this.revision
        await this.storage.write(this.records)
        this.savedRevision = revision
      }
      useStorageStatus.setState({ recoveryFailed: false })
      return true
    } catch {
      useStorageStatus.setState({ recoveryFailed: true })
      return false
    }
  }
}

export const workbenchRecovery = new WorkbenchRecovery(workbenchStorage)
