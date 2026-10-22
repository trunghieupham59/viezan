// @vitest-environment node
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openWindowsLauncherApp, parseWindowsApps, readSystemLauncherApps } from '../launcherSystemApps'

const command = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile: command }))
beforeEach(() => { command.mockReset() })
const respond = (output: string) => command.mockImplementation(
  (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string) => void) => callback(null, output),
)

describe('native launcher application discovery', () => {
  it('preserves packaged, Win32 and registered executable targets, including Unicode names', () => {
    expect(parseWindowsApps(JSON.stringify([
      { name: 'Claude', appId: 'Claude_pzs8sxrjxfjjc!Claude' },
      { name: 'Editor', appId: '{folder-id}\\Editor\\editor.exe' },
      { name: 'Ứng dụng 日本語', path: 'D:\\Apps\\editor.exe' },
    ]))).toEqual([
      { name: 'Claude', target: { kind: 'windows-app', appId: 'Claude_pzs8sxrjxfjjc!Claude' } },
      { name: 'Editor', target: { kind: 'windows-app', appId: '{folder-id}\\Editor\\editor.exe' } },
      { name: 'Ứng dụng 日本語', target: { kind: 'path', path: 'D:\\Apps\\editor.exe' } },
    ])
    expect(parseWindowsApps('\uFEFF{"name":"Only app","appId":"single"}')).toHaveLength(1)
  })

  it('rejects malformed records, control characters and non-executable registry targets', () => {
    expect(parseWindowsApps(JSON.stringify([null, {}, { name: ' ' }, { name: 'Bad', appId: 'x\nbad' },
      { name: 'Bad', path: 'C:\\notes.txt' }, { name: 'Bad', path: 'https://example.com/a.exe' },
      { name: 'Bad', appId: '" && cmd' }]))).toEqual([])
  })

  it('keeps validated launch metadata for cross-source deduplication', () => {
    expect(parseWindowsApps(JSON.stringify([
      { name: 'Editor', appId: 'Editor', executable: 'C:\\Apps\\editor.exe', args: '--profile Work' },
      { name: 'Bad metadata', appId: 'Other', executable: 'https://example.com/x.exe' },
    ]))).toEqual([
      { name: 'Editor', target: { kind: 'windows-app', appId: 'Editor' }, executable: 'C:\\Apps\\editor.exe', args: '--profile Work' },
      { name: 'Bad metadata', target: { kind: 'windows-app', appId: 'Other' } },
    ])
  })

  it('runs one fixed hidden Windows catalog command with bounded time and Unicode output', async () => {
    respond('[{"name":"Claude","appId":"Claude_package!Claude"}]')
    expect(await readSystemLauncherApps('win32')).toHaveLength(1)
    const [file, args, options] = command.mock.calls[0]
    expect(path.win32.basename(file)).toBe('powershell.exe')
    expect(args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand'])
    const script = Buffer.from(args[4], 'base64').toString('utf16le')
    expect(script).toContain('Get-StartApps')
    expect(script).toContain('App Paths')
    expect(script).toContain('UTF8Encoding')
    expect(options).toMatchObject({ windowsHide: true, timeout: 15_000, encoding: 'utf8' })
    expect(options.shell).toBeUndefined()
  })

  it('finds macOS app bundles on indexed volumes, preserving spaces and skipping embedded helpers', async () => {
    respond(['/Volumes/Work/Apps/My Editor.app   kMDItemDisplayName = My Editor', '/Users/me/Tools/Claude.app   kMDItemDisplayName = Claude',
      '/Applications/Host.app/Contents/Helper.app   kMDItemDisplayName = Helper',
      '/System/Library/Frameworks/PaperKit.framework/Contents/LinkedNotesUIService.app   kMDItemDisplayName = LinkedNotesUIService',
      'relative.app   kMDItemDisplayName = relative', ''].join('\0'))
    expect(await readSystemLauncherApps('darwin')).toEqual([
      { name: 'My Editor', target: { kind: 'path', path: '/Volumes/Work/Apps/My Editor.app' } },
      { name: 'Claude', target: { kind: 'path', path: '/Users/me/Tools/Claude.app' } },
    ])
    expect(command.mock.calls[0].slice(0, 2)).toEqual(['/usr/bin/mdfind',
      ['-0', '-attr', 'kMDItemDisplayName', 'kMDItemContentType == "com.apple.application-bundle"']])
  })

  it('names macOS apps by their localized display name and keeps the bundle name as an alias', async () => {
    respond(['/System/Applications/Notes.app   kMDItemDisplayName = Ghi chú', '/System/Applications/Stickies.app   kMDItemDisplayName = Giấy ghi chú.app',
      '/Applications/Safari.app   kMDItemDisplayName = safari', '/Applications/Legacy.app   kMDItemDisplayName = (null)',
      '/Applications/Plain.app', ''].join('\0'))
    expect(await readSystemLauncherApps('darwin')).toEqual([
      { name: 'Ghi chú', aliases: ['Notes'], target: { kind: 'path', path: '/System/Applications/Notes.app' } },
      { name: 'Giấy ghi chú', aliases: ['Stickies'], target: { kind: 'path', path: '/System/Applications/Stickies.app' } },
      { name: 'safari', target: { kind: 'path', path: '/Applications/Safari.app' } },
      { name: 'Legacy', target: { kind: 'path', path: '/Applications/Legacy.app' } },
      { name: 'Plain', target: { kind: 'path', path: '/Applications/Plain.app' } },
    ])
  })

  it('activates the AppsFolder item with an ID passed as data, without relying on Explorer exit codes', async () => {
    respond('')
    await openWindowsLauncherApp('Claude_package!Claude')
    const [file, args, options] = command.mock.calls[0]
    expect(file).toMatch(/\\powershell\.exe$/)
    const script = Buffer.from(args[4], 'base64').toString('utf16le')
    expect(script).toContain("$shell.Namespace('shell:AppsFolder')")
    expect(script).toContain('$folder.ParseName($env:VIEZAN_LAUNCHER_APP_ID)')
    expect(script).toContain("if ($null -eq $item) { throw 'Application is no longer available' }")
    expect(script).toContain("$item.InvokeVerb('open')")
    expect(script).not.toContain('Claude_package!Claude')
    expect(options.env.VIEZAN_LAUNCHER_APP_ID).toBe('Claude_package!Claude')
    expect(options.windowsHide).toBe(true)
    expect(options.shell).toBeUndefined()
    await expect(openWindowsLauncherApp('invalid\nid')).rejects.toThrow()
    expect(command).toHaveBeenCalledTimes(1)
  })

  it('reports missing apps or shell activation errors instead of silently accepting them', async () => {
    command.mockImplementation((_file, _args, _options, done) => done(new Error('Application is no longer available'), ''))
    await expect(openWindowsLauncherApp('Removed_package!App')).rejects.toThrow('Application is no longer available')
  })

  it('propagates OS errors for the caller to fall back and never scans unsupported platforms', async () => {
    command.mockImplementation((_file, _args, _options, done) => done(new Error('timeout'), ''))
    await expect(readSystemLauncherApps('win32')).rejects.toThrow('timeout')
    command.mockClear()
    expect(await readSystemLauncherApps('linux')).toEqual([])
    expect(command).not.toHaveBeenCalled()
  })
})
