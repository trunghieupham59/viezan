// @vitest-environment node
import { nativeImage } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LAUNCHER_ICON_PIXELS, readLauncherIcons } from '../launcherIcons'
import { runWindowsScript } from '../launcherSystemApps'

vi.mock('electron', () => ({ nativeImage: { createThumbnailFromPath: vi.fn() } }))
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
    expect(script).toContain(`new Size { X = ${LAUNCHER_ICON_PIXELS}, Y = ${LAUNCHER_ICON_PIXELS} }`)
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

  it('renders macOS bundle icons through Quick Look at tile size and tolerates missing icons', async () => {
    // app.getFileIcon would only yield the generic ".app" type icon on macOS.
    const resize = vi.fn(() => ({ toDataURL: () => `data:image/png;base64,${png}` }))
    vi.mocked(nativeImage.createThumbnailFromPath).mockResolvedValueOnce({ isEmpty: () => false, resize } as never)
      .mockRejectedValueOnce(new Error('missing'))
    const apps = ['Editor', 'Deleted'].map(name => ({ id: name, name, target: { kind: 'path' as const, path: `/Applications/${name}.app` } }))
    expect(await readLauncherIcons(apps, 'darwin')).toEqual([{ id: 'Editor', dataUrl: `data:image/png;base64,${png}` }])
    expect(nativeImage.createThumbnailFromPath).toHaveBeenCalledWith('/Applications/Editor.app', { width: 64, height: 64 })
    expect(resize).toHaveBeenCalledWith({ width: 64, height: 64, quality: 'best' })
  })

  it('returns no icons on platforms without a launcher instead of calling platform-only APIs', async () => {
    const apps = [{ id: 'editor', name: 'Editor', target: { kind: 'path' as const, path: '/usr/share/applications/editor.desktop' } }]
    expect(await readLauncherIcons(apps, 'linux')).toEqual([])
    expect(nativeImage.createThumbnailFromPath).not.toHaveBeenCalled()
    expect(runWindowsScript).not.toHaveBeenCalled()
  })
})
