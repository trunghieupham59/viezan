import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { QuickAiSession, QuickAiTurn } from '../../shared/quickAi'
import { MAX_CHAT_REQUEST_CHARS } from '../ipc/ipcConstants'

/** Ten question/answer pairs; the popup trims to the same cap before saving. */
export const MAX_QUICK_AI_TURNS = 20
export const MAX_QUICK_AI_ASSISTANT_CHARS = 80_000
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Complete, alternating user/assistant pairs with bounded, non-blank text. */
export function parseQuickAiTurns(raw: unknown, maxTurns = MAX_QUICK_AI_TURNS): QuickAiTurn[] | null {
  if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.length > maxTurns) return null
  const turns: QuickAiTurn[] = []
  for (const [index, entry] of raw.entries()) {
    if (!isPlainRecord(entry)) return null
    const role = index % 2 === 0 ? 'user' : 'assistant'
    if (entry.role !== role || typeof entry.text !== 'string') return null
    const text = entry.text.trim()
    if (!text || text.length > (role === 'user' ? MAX_CHAT_REQUEST_CHARS : MAX_QUICK_AI_ASSISTANT_CHARS)) return null
    turns.push({ role, text })
  }
  return turns
}

export function parseQuickAiSession(raw: unknown): QuickAiSession | null {
  if (!isPlainRecord(raw)) return null
  const { id, updatedAt } = raw
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) return null
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return null
  const turns = parseQuickAiTurns(raw.turns)
  if (!turns?.length) return null
  return { id, turns, updatedAt: Math.floor(updatedAt) }
}

/** Disk-backed single session with an in-memory copy after the first read. */
export class QuickAiSessionStore {
  private cached: QuickAiSession | null | undefined

  constructor(private readonly file: string) {}

  async get(): Promise<QuickAiSession | null> {
    if (this.cached !== undefined) return this.cached
    try {
      this.cached = parseQuickAiSession(JSON.parse(await readFile(this.file, 'utf-8')))
    } catch {
      this.cached = null
    }
    return this.cached
  }

  async save(session: QuickAiSession): Promise<void> {
    this.cached = session
    await mkdir(path.dirname(this.file), { recursive: true })
    await writeFile(`${this.file}.tmp`, JSON.stringify(session), 'utf-8')
    await rename(`${this.file}.tmp`, this.file)
  }

  async clear(): Promise<void> {
    this.cached = null
    await rm(this.file, { force: true })
  }
}
