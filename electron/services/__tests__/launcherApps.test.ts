// @vitest-environment node
import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launcherRoots, scanLauncherApps } from '../launcherApps'
import { readSystemLauncherApps } from '../launcherSystemApps'

vi.mock('node:fs/promises', () => ({ readdir: vi.fn(), stat: vi.fn(), realpath: vi.fn() }))
vi.mock('../launcherSystemApps', () => ({ readSystemLauncherApps: vi.fn() }))
const entry = (name: string, kind: 'file' | 'directory' | 'symlink') => ({
  name,
  isFile: () => kind === 'file',
  isDirectory: () => kind === 'directory',
  isSymbolicLink: () => kind === 'symlink',
})
const options = { platform: 'win32', home: '/home', appData: '/user', programData: '/shared', readShortcut: vi.fn() }

beforeEach(() => {
  vi.mocked(readdir).mockReset().mockResolvedValue([])
  vi.mocked(stat).mockReset().mockRejectedValue(new Error('missing'))
  vi.mocked(realpath).mockReset().mockImplementation(async value => String(value))
  vi.mocked(readSystemLauncherApps).mockReset().mockResolvedValue([])
  options.readShortcut.mockReset()
})

describe('launcher application catalog', () => {
  it('indexes executable Start Menu shortcuts and skips documents, broken links and symlinks', async () => {
    const [userRoot] = launcherRoots(options)
    vi.mocked(readdir).mockImplementation(async directory => {
      if (directory !== userRoot) return [] as never
      return [
        entry('Editor.lnk', 'file'), entry('Readme.lnk', 'file'), entry('Broken.lnk', 'file'),
        entry('Linked folder', 'symlink'), entry('script.cmd', 'file'),
      ] as never
    })
    options.readShortcut.mockImplementation(shortcut => {
      if (shortcut.endsWith('Broken.lnk')) throw new Error('broken')
      return { target: shortcut.endsWith('Editor.lnk') ? 'C:\\Apps\\Editor.exe' : 'C:\\readme.txt' }
    })
    const result = await scanLauncherApps(options)
    expect(result).toEqual([{ id: expect.stringMatching(/^[a-f0-9]{64}$/), name: 'Editor', target: { kind: 'path', path: path.join(userRoot, 'Editor.lnk') }, iconSourcePath: 'C:\\Apps\\Editor.exe' }])
    expect(readdir).toHaveBeenCalledTimes(2)
  })

  it('discovers nested macOS apps without traversing bundles or following symlinks', async () => {
    vi.mocked(readdir).mockImplementation(async directory => {
      if (directory === '/Applications') return [entry('Browser.app', 'directory'), entry('Utilities', 'directory'), entry('Linked.app', 'symlink')] as never
      if (directory === path.join('/Applications', 'Utilities')) return [entry('Terminal.app', 'directory')] as never
      throw new Error('inaccessible')
    })
    const result = await scanLauncherApps({ ...options, platform: 'darwin' })
    expect(result.map(item => item.name)).toEqual(['Browser', 'Terminal'])
    expect(vi.mocked(readdir).mock.calls.some(([directory]) => String(directory).endsWith('.app'))).toBe(false)
    expect(options.readShortcut).not.toHaveBeenCalled()
  })

  it('does not scan arbitrary home folders or unsupported platforms', async () => {
    expect(await scanLauncherApps({ ...options, platform: 'linux' })).toEqual([])
    expect(readdir).not.toHaveBeenCalled()
  })

  it('merges Store apps and desktop registrations without duplicating Start Menu shortcuts', async () => {
    vi.mocked(readSystemLauncherApps).mockResolvedValue([
      { name: 'Claude', target: { kind: 'windows-app', appId: 'Claude_package!Claude' } },
      { name: 'Editor', target: { kind: 'windows-app', appId: 'Editor' } },
      { name: 'Other name', target: { kind: 'windows-app', appId: 'Editor' } },
    ])
    vi.mocked(readdir).mockResolvedValue([entry('Editor.lnk', 'file'), entry('Portable.lnk', 'file')] as never)
    options.readShortcut.mockImplementation(shortcut => ({ target: shortcut.includes('Portable') ? 'C:\\Apps\\portable.exe' : 'C:\\Apps\\editor.exe' }))
    const apps = await scanLauncherApps(options)
    expect(apps.filter(app => app.name === 'Editor')).toHaveLength(1)
    expect(apps.find(app => app.name === 'Claude')?.target).toEqual({ kind: 'windows-app', appId: 'Claude_package!Claude' })
    expect(apps.some(app => app.name === 'Portable')).toBe(true)
    expect(apps.some(app => app.name === 'Other name')).toBe(false)
  })

  it('falls back to shortcuts when the OS catalog is unavailable', async () => {
    vi.mocked(readSystemLauncherApps).mockRejectedValue(new Error('PowerShell unavailable'))
    vi.mocked(readdir).mockResolvedValue([entry('Editor.lnk', 'file')] as never)
    options.readShortcut.mockReturnValue({ target: 'C:\\Apps\\editor.exe' })
    expect((await scanLauncherApps(options)).some(app => app.name === 'Editor')).toBe(true)
  })

  it('merges aliases across catalogs and shortcuts but preserves distinct editions and launch arguments', async () => {
    vi.mocked(readSystemLauncherApps).mockResolvedValue([
      { name: 'Editor', target: { kind: 'windows-app', appId: 'Editor' }, executable: 'C:\\Apps\\editor.exe' },
      { name: 'Editor desktop', target: { kind: 'path', path: 'c:\\apps\\EDITOR.exe' } },
      { name: 'AdGuard', target: { kind: 'windows-app', appId: 'AdGuard' } },
      { name: 'AdGuard for Windows', target: { kind: 'path', path: 'C:\\AdGuard\\AdGuard.exe' } },
      { name: 'Editor Insiders', target: { kind: 'path', path: 'C:\\Insiders\\editor.exe' } },
    ])
    vi.mocked(readdir).mockResolvedValue([entry('Editor alias.lnk', 'file'), entry('Work profile.lnk', 'file')] as never)
    options.readShortcut.mockImplementation(shortcut => ({
      target: 'C:\\Apps\\editor.exe', args: shortcut.includes('Work profile') ? '--profile Work' : '',
    }))
    expect((await scanLauncherApps(options)).map(app => app.name)).toEqual(['AdGuard', 'Editor', 'Editor Insiders', 'Work profile'])
  })

  it('omits auxiliary executables without hiding similarly named user-facing apps', async () => {
    const names = ['Claude', 'claude-ssh-askpass', 'claude-ssh-proxy', 'claude-make-data-folder', 'Crashpad Handler', 'Acme Updater',
      'Acme Uninstaller', 'Acme Helper', 'Proxy Switcher', 'Update Manager', 'Helper Studio']
    vi.mocked(readSystemLauncherApps).mockResolvedValue(names.map(name => ({
      name, target: { kind: 'path', path: `C:\\Apps\\${name}.exe` },
    })))
    expect((await scanLauncherApps(options)).map(app => app.name)).toEqual(['Claude', 'Helper Studio', 'Proxy Switcher', 'Update Manager'])
  })

  it('uses executable metadata to exclude helpers with generic display names', async () => {
    vi.mocked(readSystemLauncherApps).mockResolvedValue([
      { name: 'Claude utility', target: { kind: 'windows-app', appId: 'ClaudeUtility' }, executable: 'C:\\Claude\\claude-ssh-askpass.exe' },
    ])
    expect(await scanLauncherApps(options)).toEqual([])
  })

  it('merges Spotlight with fallback roots and resolves app symlinks without scanning their contents', async () => {
    vi.mocked(readSystemLauncherApps).mockResolvedValue([
      { name: 'Editor', target: { kind: 'path', path: '/Volumes/Tools/Editor.app' } },
      { name: 'Deleted', target: { kind: 'path', path: '/Volumes/Tools/Deleted.app' } },
    ])
    vi.mocked(stat).mockImplementation(async value => {
      if (String(value).includes('Deleted')) throw new Error('missing')
      return { isDirectory: () => true } as never
    })
    vi.mocked(realpath).mockImplementation(async value => String(value).includes('Linked') ? '/Volumes/Tools/Editor.app' : String(value))
    vi.mocked(readdir).mockImplementation(async value => value === '/Applications' ? [entry('Linked.app', 'symlink')] as never : [])
    expect(await scanLauncherApps({ ...options, platform: 'darwin' })).toEqual([
      { id: expect.any(String), name: 'Editor', target: { kind: 'path', path: '/Volumes/Tools/Editor.app' } },
    ])
    expect(vi.mocked(readdir).mock.calls.every(([value]) => !String(value).endsWith('.app'))).toBe(true)
  })
})
