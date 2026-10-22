// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  displayFolder,
  isSearchableFile,
  LauncherFileIndex,
  parseWindowsSearchOutput,
  rankFileHits,
  searchLauncherFiles,
  windowsSearchQuery,
} from '../launcherFiles'

const home = '/Users/me'
const kinds: Record<string, 'file' | 'folder'> = { [`${home}/Documents/Work`]: 'folder' }
const statKind = vi.fn(async (filePath: string) => filePath.includes('missing') ? null : kinds[filePath] ?? 'file')

describe('searchLauncherFiles on macOS', () => {
  it('asks Spotlight within the home folder, ranks by name match, resolves kinds and drops vanished entries', async () => {
    const run = vi.fn(async () => [
      `${home}/Downloads/report-final.pdf`, `${home}/Documents/Work`, `${home}/Documents/Work/report.docx`,
      `${home}/Documents/old report.txt`, `${home}/Library/report.plist`, `${home}/dev/node_modules/report/index.js`,
      `${home}/.hidden/report.md`, `${home}/Applications/Report.app`, '/tmp/report.log', `${home}/Documents/missing-report.txt`, '',
    ].join('\n'))
    const hits = await searchLauncherFiles(' report ', { platform: 'darwin', home, run, statKind })
    expect(run).toHaveBeenCalledWith('mdfind', ['-onlyin', home, '-name', 'report'])
    expect(hits).toEqual([
      { path: `${home}/Documents/Work/report.docx`, name: 'report.docx', kind: 'file' },
      { path: `${home}/Downloads/report-final.pdf`, name: 'report-final.pdf', kind: 'file' },
      { path: `${home}/Documents/old report.txt`, name: 'old report.txt', kind: 'file' },
    ])
  })

  it('falls back to Desktop, Documents and Downloads when Spotlight fails or finds nothing', async () => {
    const run = vi.fn().mockRejectedValue(new Error('mdfind missing'))
    const listDirectory = vi.fn(async (directory: string) => directory.endsWith('Documents')
      ? [{ name: 'Báo cáo.xlsx', isDirectory: false }, { name: 'Work', isDirectory: true }, { name: 'notes.txt', isDirectory: false }]
      : [])
    expect(await searchLauncherFiles('bao cao', { platform: 'darwin', home, run, listDirectory, statKind })).toEqual([
      { path: `${home}/Documents/Báo cáo.xlsx`, name: 'Báo cáo.xlsx', kind: 'file' },
    ])
    run.mockResolvedValue('')
    expect(await searchLauncherFiles('work', { platform: 'darwin', home, run, listDirectory, statKind })).toEqual([
      { path: `${home}/Documents/Work`, name: 'Work', kind: 'folder' },
    ])
  })

  it('returns nothing for short, oversized or unsupported-platform queries', async () => {
    const run = vi.fn()
    expect(await searchLauncherFiles('r', { platform: 'darwin', home, run })).toEqual([])
    expect(await searchLauncherFiles('x'.repeat(201), { platform: 'darwin', home, run })).toEqual([])
    expect(await searchLauncherFiles('report', { platform: 'linux', home, run })).toEqual([])
    expect(run).not.toHaveBeenCalled()
  })
})

describe('searchLauncherFiles on Windows', () => {
  it('runs an encoded PowerShell Windows Search query with the text passed through the environment', async () => {
    const winHome = 'C:\\Users\\me'
    const run = vi.fn<(file: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<string>>(async () => JSON.stringify([
      { path: 'C:\\Users\\me\\Documents\\Plan.docx', type: 'Microsoft Word Document' },
      { path: 'C:\\Users\\me\\Desktop\\Plans', type: 'Directory' },
      { path: 'relative\\plan.txt', type: 'Text' }, { nope: true },
    ]))
    const hits = await searchLauncherFiles('plan', { platform: 'win32', home: winHome, run, statKind: async p => p.endsWith('Plans') ? 'folder' : 'file' })
    const [file, args, env] = run.mock.calls[0]
    expect(file).toMatch(/powershell\.exe$/)
    expect(args).toContain('-EncodedCommand')
    expect(env?.VIEZAN_FILE_QUERY).toBe("SELECT TOP 200 System.ItemPathDisplay, System.ItemType FROM SystemIndex WHERE SCOPE='file:C:/Users/me' AND System.FileName LIKE '%plan%'")
    expect(windowsSearchQuery("plan's", winHome)).toContain("LIKE '%plan''s%'")
    expect(hits.map(hit => hit.path)).toEqual(['C:\\Users\\me\\Documents\\Plan.docx', 'C:\\Users\\me\\Desktop\\Plans'])
    expect(hits[1].kind).toBe('folder')
  })

  it('escapes LIKE wildcards and parses only absolute rows', () => {
    expect(windowsSearchQuery('50%_[x]', 'D:\\h')).toContain("LIKE '%50[%][_][[]x[]]%'")
    expect(parseWindowsSearchOutput('\uFEFF{"path":"C:\\\\a\\\\b.txt","type":"Text"}')).toEqual([{ path: 'C:\\a\\b.txt', name: 'b.txt', kind: 'file' }])
    expect(parseWindowsSearchOutput('')).toEqual([])
  })
})

describe('helpers', () => {
  it('keeps only visible home files outside excluded folders and app bundles', () => {
    expect(isSearchableFile(`${home}/Documents/a.txt`, home)).toBe(true)
    for (const bad of [`${home}/Library/a.txt`, `${home}/.ssh/id`, `${home}/x/node_modules/a.js`, `${home}/Apps/Foo.app`, '/etc/hosts', home]) {
      expect(isSearchableFile(bad, home), bad).toBe(false)
    }
  })

  it('ranks exact, prefix, word and substring matches, de-duplicates and caps the list', () => {
    const hit = (name: string, dir = 'Documents') => ({ path: `${home}/${dir}/${name}`, name, kind: 'file' as const })
    const ranked = rankFileHits([hit('my-plan.txt'), hit('plan.txt', 'Documents/deep'), hit('Plan.txt'), hit('planning.md'), hit('Plan.txt')], 'plan', 3)
    expect(ranked.map(entry => entry.name)).toEqual(['Plan.txt', 'plan.txt', 'planning.md'])
  })

  it('abbreviates the home folder and hands out opaque IDs that resolve only while remembered', () => {
    expect(displayFolder(`${home}/Documents/Work/a.txt`, home)).toBe('~/Documents/Work')
    expect(displayFolder(`${home}/a.txt`, home)).toBe('~')
    expect(displayFolder('/tmp/a.txt', home)).toBe('/tmp')
    const index = new LauncherFileIndex(2)
    const [first] = index.remember([{ path: `${home}/a.txt`, name: 'a.txt', kind: 'file' }], home)
    expect(first).toEqual({ id: expect.stringMatching(/^[a-f0-9]{64}$/), name: 'a.txt', folder: '~', kind: 'file' })
    expect(first.id).not.toContain('a.txt')
    expect(index.get(first.id)?.path).toBe(`${home}/a.txt`)
    index.remember([{ path: `${home}/b.txt`, name: 'b.txt', kind: 'file' }, { path: `${home}/c.txt`, name: 'c.txt', kind: 'file' }], home)
    expect(index.get(first.id)).toBeUndefined()
  })
})
