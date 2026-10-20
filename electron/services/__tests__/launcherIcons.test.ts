// @vitest-environment node
import { app } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readLauncherIcons } from '../launcherIcons'
import { runWindowsScript } from '../launcherSystemApps'

vi.mock('electron', () => ({ app: { getFileIcon: vi.fn() } }))
vi.mock('../launcherSystemApps', () => ({ runWindowsScript: vi.fn() }))
const entries = [{ id: 'claude', name: 'Claude', target: { kind: 'windows-app' as const, appId: 'Claude_package!Claude' } }]
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='

beforeEach(() => { vi.resetAllMocks() })

describe('launcher system icons', () => {
  it('extracts packaged icons through a fixed native script with catalog targets passed as data', async () => {
    vi.mocked(runWindowsScript).mockResolvedValue(JSON.stringify([{ id: 'claude', png }]))
    expect(await readLauncherIcons(entries, 'win32')).toEqual([{ id: 'claude', dataUrl: `data:image/png;base64,${png}` }])
    const [script, env] = vi.mocked(runWindowsScript).mock.calls[0]
    expect(script).toContain('SHCreateItemFromParsingName')
    expect(script).toContain('DeleteObject(bitmap)')
    expect(script).toContain('Marshal.ReleaseComObject(item)')
    expect(script).not.toContain('Claude_package')
    expect(JSON.parse(env?.VIEZAN_LAUNCHER_ICON_TARGETS ?? '')).toEqual([{ id: 'claude', path: 'shell:AppsFolder\\Claude_package!Claude' }])
  })

  it('never returns arbitrary IDs, remote images, non-PNG data or oversized payloads', async () => {
    vi.mocked(runWindowsScript).mockResolvedValue(JSON.stringify([
      { id: 'other', png }, { id: 'claude', png: 'https://example.com/icon.png' },
      { id: 'claude', png: 'iVBORw0KGgo'.padEnd(64_001, 'A') }, null,
    ]))
    expect(await readLauncherIcons(entries, 'win32')).toEqual([])
  })

  it('loads macOS bundle icons through Electron and tolerates missing icons', async () => {
    vi.mocked(app.getFileIcon).mockResolvedValueOnce({ isEmpty: () => false, toDataURL: () => `data:image/png;base64,${png}` } as never)
      .mockRejectedValueOnce(new Error('missing'))
    const apps = ['Editor', 'Deleted'].map(name => ({ id: name, name, target: { kind: 'path' as const, path: `/Applications/${name}.app` } }))
    expect(await readLauncherIcons(apps, 'darwin')).toEqual([{ id: 'Editor', dataUrl: `data:image/png;base64,${png}` }])
    expect(app.getFileIcon).toHaveBeenCalledWith('/Applications/Editor.app', { size: 'normal' })
  })
})
