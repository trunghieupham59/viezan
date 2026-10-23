// @vitest-environment node
/**
 * Every `invoke` channel declared in channels.ts must have a main-process handler
 * registered through that constant. This is a source scan, so it needs no Electron
 * and catches a channel that was added to the preload contract but never served.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as channels from '../channels'

const ELECTRON_DIR = path.resolve(__dirname, '../..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'preload' || entry.name === 'node_modules') continue
      out.push(...sourceFiles(full))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

const mainSource = sourceFiles(ELECTRON_DIR).map((file) => fs.readFileSync(file, 'utf-8')).join('\n')

interface ChannelTable {
  invoke: Record<string, string>
  event?: Record<string, string>
}

const channelTables = Object.entries(channels as Record<string, unknown>).filter(
  (entry): entry is [string, ChannelTable] =>
    typeof entry[1] === 'object' && entry[1] !== null && 'invoke' in entry[1],
)

describe('IPC channel tables', () => {
  it('declares at least the hotkey, capability and system tables', () => {
    expect(channelTables.map(([name]) => name)).toEqual(expect.arrayContaining(['HOTKEY_CHANNELS', 'CAPABILITY_CHANNELS', 'SYSTEM_CHANNELS']))
  })

  it('uses each invoke channel once and each event channel once across all tables', () => {
    // The same name may serve as an invoke (popup → main) and as a push (main → window);
    // what must not happen is two tables claiming the same channel for the same direction.
    const invokes = channelTables.flatMap(([, table]) => Object.values(table.invoke))
    const events = channelTables.flatMap(([, table]) => Object.values(table.event ?? {}))
    expect(new Set(invokes).size).toBe(invokes.length)
    expect(new Set(events).size).toBe(events.length)
  })

  it.each(channelTables)('%s: every invoke channel has a main handler registered through the constant', (name, table) => {
    for (const key of Object.keys(table.invoke)) {
      const pattern = new RegExp(`\\.handle\\(\\s*${name}\\.invoke\\.${key}\\b`)
      expect(mainSource, `${name}.invoke.${key} (${table.invoke[key]})`).toMatch(pattern)
    }
  })

  it('never registers a handler by a raw string that a table already names', () => {
    const named = new Set(channelTables.flatMap(([, table]) => Object.values(table.invoke)))
    for (const match of mainSource.matchAll(/\.handle\(\s*'([^']+)'/g)) {
      expect(named.has(match[1]), `raw handler for ${match[1]}`).toBe(false)
    }
  })
})
