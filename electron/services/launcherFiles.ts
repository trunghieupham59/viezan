import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { LauncherFile } from '../../shared/launcher'

/**
 * File search for the Quick Launcher.
 *
 * Results come from the OS index (Spotlight on macOS, Windows Search on
 * Windows), never from walking the disk. When the index is unavailable a
 * shallow scan of the user's common folders answers instead. Renderers only
 * ever see opaque IDs; `LauncherFileIndex` maps them back to paths.
 */
export interface LauncherFileHit {
  path: string
  name: string
  kind: 'file' | 'folder'
}

export interface FileSearchOptions {
  platform: string
  home: string
  /** Executes a command and resolves its stdout; injected for tests. */
  run?: (file: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<string>
  /** Lists a directory with entry kinds; injected for tests. */
  listDirectory?: (directory: string) => Promise<Array<{ name: string; isDirectory: boolean }>>
  /** Resolves whether a path is a file or folder, `null` when it no longer exists. */
  statKind?: (filePath: string) => Promise<LauncherFileHit['kind'] | null>
  limit?: number
}

export const MAX_FILE_QUERY_CHARS = 200
export const MIN_FILE_QUERY_CHARS = 2
export const MAX_FILE_RESULTS = 8
const SEARCH_TIMEOUT_MS = 4_000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const MAX_CANDIDATES = 2_000
/** Folders whose contents never belong in a launcher result. */
const EXCLUDED_SEGMENTS = new Set(['node_modules', 'Library', '.git', '.Trash', 'Caches', 'AppData', '$RECYCLE.BIN'])
const FALLBACK_FOLDERS = ['Desktop', 'Documents', 'Downloads']

function defaultRun(file: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8', windowsHide: true, timeout: SEARCH_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, env }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

async function defaultStatKind(filePath: string): Promise<LauncherFileHit['kind'] | null> {
  try {
    return (await stat(filePath)).isDirectory() ? 'folder' : 'file'
  } catch {
    return null
  }
}

async function defaultListDirectory(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries.map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }))
}

/** Windows paths are judged with win32 rules even when tests run elsewhere. */
const pathFor = (filePath: string) => (/^[a-z]:[\\/]/i.test(filePath) ? path.win32 : path.posix)

/** Hidden entries, excluded folders and app bundles (already offered as apps) are skipped. */
export function isSearchableFile(filePath: string, home: string): boolean {
  const p = pathFor(filePath)
  const relative = p.relative(home, filePath)
  if (!relative || relative.startsWith('..') || p.isAbsolute(relative)) return false
  const segments = relative.split(/[\\/]/)
  return !segments.some(segment => segment.startsWith('.') || EXCLUDED_SEGMENTS.has(segment)) && !/\.app$/i.test(filePath)
}

const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase()

/** Exact and prefix name matches first, then shallow paths, then alphabetical. */
export function rankFileHits(hits: LauncherFileHit[], query: string, limit = MAX_FILE_RESULTS): LauncherFileHit[] {
  const needle = fold(query.trim())
  const score = (hit: LauncherFileHit) => {
    const name = fold(hit.name)
    const stem = name.replace(/\.[^.]+$/, '')
    if (name === needle || stem === needle) return 0
    if (name.startsWith(needle)) return 1
    if (name.split(/[\s._-]+/).some(word => word.startsWith(needle))) return 2
    return name.includes(needle) ? 3 : 4
  }
  const seen = new Set<string>()
  return hits
    .filter(hit => { if (seen.has(hit.path)) return false; seen.add(hit.path); return true })
    .map(hit => ({ hit, score: score(hit), depth: hit.path.split(/[\\/]/).length }))
    .filter(entry => entry.score < 4)
    .sort((a, b) => a.score - b.score || a.depth - b.depth || a.hit.name.localeCompare(b.hit.name))
    .slice(0, limit)
    .map(entry => entry.hit)
}

/** Windows Search takes a SQL-like string; `'` is the only quote character to escape. */
export function windowsSearchQuery(query: string, home: string): string {
  const escaped = query.replace(/'/g, "''").replace(/[%_[\]]/g, match => `[${match}]`)
  const scope = `file:${home.replace(/\\/g, '/')}`.replace(/'/g, "''")
  return `SELECT TOP 200 System.ItemPathDisplay, System.ItemType FROM SystemIndex WHERE SCOPE='${scope}' AND System.FileName LIKE '%${escaped}%'`
}

const WINDOWS_SEARCH_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$connection = New-Object System.Data.OleDb.OleDbConnection "Provider=Search.CollatorDSO;Extended Properties='Application=Windows'"
$connection.Open()
$command = $connection.CreateCommand()
$command.CommandText = $env:VIEZAN_FILE_QUERY
$reader = $command.ExecuteReader()
$rows = @()
while ($reader.Read()) { $rows += [pscustomobject]@{ path = $reader.GetValue(0); type = $reader.GetValue(1) } }
$connection.Close()
ConvertTo-Json -Compress -InputObject @($rows)
`

export function parseWindowsSearchOutput(output: string): LauncherFileHit[] {
  const parsed: unknown = JSON.parse(output.replace(/^\uFEFF/u, '') || '[]')
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.flatMap((row): LauncherFileHit[] => {
    if (!row || typeof row !== 'object' || typeof row.path !== 'string' || !/^[a-z]:\\/i.test(row.path)) return []
    return [{ path: row.path, name: path.win32.basename(row.path), kind: row.type === 'Directory' ? 'folder' : 'file' }]
  })
}

async function searchSpotlight(query: string, options: FileSearchOptions): Promise<LauncherFileHit[]> {
  const run = options.run ?? defaultRun
  // `-name` matches the display name; `-onlyin` keeps results under the home folder.
  const output = await run('mdfind', ['-onlyin', options.home, '-name', query])
  // Spotlight prints bare paths; the kind is resolved later for the few ranked results.
  return output.split('\n').map(line => line.trim()).filter(Boolean).slice(0, MAX_CANDIDATES)
    .map(filePath => ({ path: filePath, name: path.basename(filePath), kind: 'file' as const }))
}

async function searchWindows(query: string, options: FileSearchOptions): Promise<LauncherFileHit[]> {
  const run = options.run ?? defaultRun
  const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  // The query travels through the environment, never through the script text.
  const output = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(WINDOWS_SEARCH_SCRIPT, 'utf16le').toString('base64')], { ...process.env, VIEZAN_FILE_QUERY: windowsSearchQuery(query, options.home) })
  return parseWindowsSearchOutput(output).slice(0, MAX_CANDIDATES)
}

/** Top-level entries of Desktop, Documents and Downloads whose names contain the query. */
async function searchFallback(query: string, options: FileSearchOptions): Promise<LauncherFileHit[]> {
  const list = options.listDirectory ?? defaultListDirectory
  const needle = fold(query)
  const hits = await Promise.all(FALLBACK_FOLDERS.map(async folder => {
    const directory = path.join(options.home, folder)
    const entries = await list(directory).catch(() => [])
    return entries.filter(entry => fold(entry.name).includes(needle))
      .map((entry): LauncherFileHit => ({ path: path.join(directory, entry.name), name: entry.name, kind: entry.isDirectory ? 'folder' : 'file' }))
  }))
  return hits.flat()
}

export async function searchLauncherFiles(rawQuery: string, options: FileSearchOptions): Promise<LauncherFileHit[]> {
  const query = rawQuery.trim()
  if (query.length < MIN_FILE_QUERY_CHARS || query.length > MAX_FILE_QUERY_CHARS) return []
  let hits: LauncherFileHit[] = []
  try {
    if (options.platform === 'darwin') hits = await searchSpotlight(query, options)
    else if (options.platform === 'win32') hits = await searchWindows(query, options)
    else return []
  } catch {
    hits = []
  }
  if (!hits.length) hits = await searchFallback(query, options)
  const ranked = rankFileHits(hits.filter(hit => isSearchableFile(hit.path, options.home)), query, options.limit)
  const statKind = options.statKind ?? defaultStatKind
  const resolved = await Promise.all(ranked.map(async hit => {
    const kind = await statKind(hit.path)
    return kind ? { ...hit, kind } : null
  }))
  return resolved.filter((hit): hit is LauncherFileHit => hit !== null)
}

/** `~/Documents/Work` style folder shown under the file name. */
export function displayFolder(filePath: string, home: string): string {
  const p = pathFor(filePath)
  const folder = p.dirname(filePath)
  const relative = p.relative(home, folder)
  if (!relative) return '~'
  if (relative.startsWith('..') || p.isAbsolute(relative)) return folder
  return `~${p.sep}${relative}`
}

/** Remembers recently offered files so `open` can only reach something the launcher listed. */
export class LauncherFileIndex {
  private readonly entries = new Map<string, LauncherFileHit>()

  constructor(private readonly capacity = 256) {}

  remember(hits: LauncherFileHit[], home: string): LauncherFile[] {
    return hits.map(hit => {
      const id = createHash('sha256').update(`file:${hit.path}`).digest('hex')
      this.entries.delete(id)
      this.entries.set(id, hit)
      while (this.entries.size > this.capacity) {
        const oldest = this.entries.keys().next().value
        if (oldest === undefined) break
        this.entries.delete(oldest)
      }
      return { id, name: hit.name, folder: displayFolder(hit.path, home), kind: hit.kind }
    })
  }

  get(id: string): LauncherFileHit | undefined {
    return this.entries.get(id)
  }
}

export const launcherHome = () => os.homedir()
