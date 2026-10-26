import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppActionSession, AppDataItem } from '../../shared/appsApi'
import type { FileSnapshot } from './verify'

type SessionItem = AppActionSession['items'][number]
export interface JournalItem extends SessionItem {
  kind: AppDataItem['kind']
  snapshot?: FileSnapshot
  trashedPath?: string
  receipt?: string
  /** Export before deleting a preference domain; never accept a domain from renderer. */
  domain?: string
  backup?: string
  launchLabel?: string
}
export interface JournalSession extends Omit<AppActionSession, 'items' | 'canUndo'> { items: JournalItem[] }
export function createJournal(directory: string) {
  const file = path.join(directory, 'journal.json')
  return {
    directory,
    async read(): Promise<JournalSession[]> {
      try {
        const value: unknown = JSON.parse(await readFile(file, 'utf8'))
        if (!Array.isArray(value)) throw new Error('Invalid journal')
        return value as JournalSession[]
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error // Never overwrite an unreadable journal.
      }
    },
    async write(sessions: JournalSession[]) {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const temp = path.join(directory, `${randomUUID()}.tmp`)
      await writeFile(temp, JSON.stringify(sessions), { mode: 0o600, flush: true })
      await rename(temp, file)
    },
  }
}
