import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { LauncherIcon } from '../../shared/launcher'
import type { IndexedLauncherApp } from './launcherApps'
import { readLauncherIcons } from './launcherIcons'

const MAX_CACHE_BYTES = 16 * 1024 * 1024
const MAX_ENTRIES = 4096
const HIT_TTL_MS = 24 * 60 * 60 * 1000
const MISS_TTL_MS = 5 * 60 * 1000
const validPng = (value: unknown): value is string => typeof value === 'string'
  && value.length <= 64_000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)

interface SavedIcon {
  id: string
  fingerprint: string
  checkedAt: number
  dataUrl: string | null
}
interface CacheEntry extends SavedIcon {
  app: IndexedLauncherApp
  pending?: Promise<void>
  resolve?: () => void
}
interface CacheOptions {
  file: string
  platform: string
  extract?: typeof readLauncherIcons
  onIcons?: (icons: LauncherIcon[]) => void
}

/** One OS extraction queue shared by startup prefetch and interactive searches. */
export class LauncherIconCache {
  private entries = new Map<string, CacheEntry>()
  private saved?: Promise<Map<string, SavedIcon>>
  private queue: CacheEntry[] = []
  private worker?: Promise<void>
  private writing = Promise.resolve()

  constructor(private readonly options: CacheOptions) {}

  private async readSaved(): Promise<Map<string, SavedIcon>> {
    try {
      if ((await stat(this.options.file)).size > MAX_CACHE_BYTES) return new Map()
      const data = JSON.parse(await readFile(this.options.file, 'utf8'))
      if (data.version !== 1 || !Array.isArray(data.icons) || data.icons.length > MAX_ENTRIES) return new Map()
      return new Map(data.icons.filter((row: SavedIcon) => row
        && /^[a-f0-9]{64}$/.test(row.id) && /^[a-f0-9]{64}$/.test(row.fingerprint)
        && Number.isFinite(row.checkedAt) && row.checkedAt > 0 && row.checkedAt <= Date.now()
        && (row.dataUrl === null || validPng(row.dataUrl)))
        .map((row: SavedIcon) => [row.id, row]))
    } catch { return new Map() }
  }

  async updateCatalog(apps: IndexedLauncherApp[]): Promise<void> {
    this.saved ??= this.readSaved()
    const saved = await this.saved
    const next = await Promise.all(apps.map(async app => {
      const targetPath = app.target.kind === 'path' ? app.target.path : undefined
      const sourcePath = app.iconSourcePath ?? targetPath
      const source = sourcePath ? await stat(sourcePath).catch(() => null) : null
      const target = targetPath && targetPath !== sourcePath ? await stat(targetPath).catch(() => null) : null
      const fingerprint = createHash('sha256').update(JSON.stringify([
        app.target, sourcePath, source?.mtimeMs, source?.size, target?.mtimeMs, target?.size,
      ])).digest('hex')
      const current = this.entries.get(app.id)
      if (current?.fingerprint === fingerprint) { current.app = app; return current }
      const previous = saved.get(app.id)
      return {
        app, id: app.id, fingerprint,
        checkedAt: previous?.fingerprint === fingerprint ? previous.checkedAt : 0,
        dataUrl: previous?.fingerprint === fingerprint ? previous.dataUrl : null,
      } satisfies CacheEntry
    }))
    this.entries = new Map(next.map(entry => [entry.id, entry]))
    // Disk records are only seeds for the first catalog, never resurrect removed apps.
    saved.clear()
    this.persist()
  }

  peek(id: string): string | undefined { return this.entries.get(id)?.dataUrl ?? undefined }

  async get(ids: string[], priority = true): Promise<LauncherIcon[]> {
    const pending: Promise<void>[] = []
    const requested = new Set(ids)
    for (const id of requested) {
      const entry = this.entries.get(id)
      if (!entry) continue
      const ttl = entry.dataUrl ? HIT_TTL_MS : MISS_TTL_MS
      if (!entry.checkedAt || Date.now() - entry.checkedAt >= ttl) {
        if (!entry.pending) {
          entry.pending = new Promise(resolve => { entry.resolve = resolve })
          this.queue.push(entry)
        }
        // A stale but valid icon is still immediately usable while it refreshes.
        if (!entry.dataUrl) pending.push(entry.pending)
      }
    }
    if (priority) this.queue.sort((a, b) => Number(requested.has(b.id)) - Number(requested.has(a.id)))
    this.startWorker()
    await Promise.all(pending)
    return ids.flatMap(id => {
      const dataUrl = this.peek(id)
      return dataUrl ? [{ id, dataUrl }] : []
    })
  }

  warm(): void { void this.get([...this.entries.keys()], false) }

  private startWorker(): void {
    if (this.worker || !this.queue.length) return
    this.worker = Promise.resolve().then(async () => {
      while (this.queue.length) {
        // Bound native helper time, environment payload and renderer event size.
        const batch = this.queue.splice(0, 16)
        const active = batch.filter(entry => this.entries.get(entry.id) === entry)
        const found = active.length
          ? await (this.options.extract ?? readLauncherIcons)(active.map(entry => entry.app), this.options.platform).catch(() => [])
          : []
        const updates: LauncherIcon[] = []
        for (const entry of batch) {
          if (this.entries.get(entry.id) === entry) {
            const icon = found.find(icon => icon.id === entry.id && validPng(icon.dataUrl))
            // A transient refresh failure must not erase an already usable icon.
            entry.dataUrl = icon?.dataUrl ?? entry.dataUrl
            entry.checkedAt = Date.now()
            if (entry.dataUrl) updates.push({ id: entry.id, dataUrl: entry.dataUrl })
          }
          entry.resolve?.()
          entry.pending = undefined
          entry.resolve = undefined
        }
        try { if (updates.length) this.options.onIcons?.(updates) } catch { /* Popup may close during extraction. */ }
        this.persist()
      }
    }).finally(() => { this.worker = undefined; this.startWorker() })
  }

  private persist(): void {
    this.writing = this.writing.then(async () => {
      const icons = [...this.entries.values()].filter(entry => entry.checkedAt)
        .slice(0, MAX_ENTRIES).map(({ id, fingerprint, checkedAt, dataUrl }) => ({ id, fingerprint, checkedAt, dataUrl }))
      const data = JSON.stringify({ version: 1, icons })
      if (Buffer.byteLength(data) > MAX_CACHE_BYTES) return
      await mkdir(path.dirname(this.options.file), { recursive: true })
      await writeFile(`${this.options.file}.tmp`, data, 'utf8')
      await rename(`${this.options.file}.tmp`, this.options.file)
    }).catch(() => { /* Read-only/corrupt cache never prevents searching or launching. */ })
  }

  async flush(): Promise<void> {
    await this.worker
    await this.writing
  }
}
