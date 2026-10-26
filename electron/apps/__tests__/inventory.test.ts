// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bundleInfo, bundleMetadata, inventory } from '../inventory'

const state = vi.hoisted(() => ({ discovered: [] as string[], metadata: new Map<string, Record<string, unknown>>(), nonJson: new Set<string>() }))
vi.mock('../../services/launcherApps', () => ({ scanLauncherApps: async () => state.discovered.map(p => ({ target: { kind: 'path', path: p } })) }))
vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, readdir: vi.fn(async (...args: Parameters<typeof fs.readdir>) => args[0] === '/Applications' ? [] : fs.readdir(...args)) }
})
vi.mock('../../fileActions/native', () => ({ runFile: vi.fn(async (command: string, args: string[]) => {
  if (command.endsWith('codesign')) return { stderr: 'TeamIdentifier=TESTTEAM' }
  const file = args[args.length - 1] ?? ''
  const info = state.metadata.get(file)
  if (!info) throw new Error('No metadata')
  if (args[0] === '-convert') {
    if (state.nonJson.has(file)) throw new Error('Invalid object for JSON')
    return { stdout: JSON.stringify(info) }
  }
  const value = info[args[1]]
  if (value === undefined) throw new Error('Missing key')
  return { stdout: `${String(value)}\n` }
}) }))
let root: string
beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'viezan-inventory-test-')))
  state.discovered = []; state.metadata.clear(); state.nonJson.clear()
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
async function app(relative: string, layout = 'Contents/Info.plist', id = 'org.example.synthetic') {
  const bundle = path.join(root, relative)
  const file = path.join(bundle, layout)
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, 'fixture')
  state.metadata.set(file, { CFBundleIdentifier: id, CFBundleName: 'Synthetic', CFBundleVersion: '1' })
  return { bundle, file }
}
describe('inventory metadata boundaries', () => {
  it('extracts only needed scalar keys when a valid plist cannot be converted to JSON', async () => {
    const { file } = await app('Applications/Date.app')
    state.nonJson.add(file)
    expect(await bundleInfo(file)).toMatchObject({ CFBundleIdentifier: 'org.example.synthetic', CFBundleVersion: '1' })
    expect((await inventory(root, '/own.app'))[0].blocked).toBeUndefined()
  })
  it('recognizes wrapped iOS metadata but keeps its removal protected without blocking unrelated apps', async () => {
    const wrapped = await app('Applications/iOS.app', 'Wrapper/Inner.app/Info.plist', 'org.example.ipad')
    const regular = await app('Applications/Mac.app')
    expect(await bundleMetadata(wrapped.bundle)).toMatchObject({ file: wrapped.file, wrapped: true })
    const apps = await inventory(root, '/own.app')
    expect(apps.find(a => a.path === wrapped.bundle)?.blocked).toBe('protected')
    expect(apps.find(a => a.path === regular.bundle)?.blocked).toBeUndefined()
  })
  it('ignores a suffix-only Spotlight data folder outside application roots', async () => {
    const falsePositive = path.join(root, 'Library/Application Scripts/group.workflow.my.app')
    await mkdir(falsePositive, { recursive: true }); state.discovered = [falsePositive]
    await app('Applications/Mac.app')
    const apps = await inventory(root, '/own.app')
    expect(apps).toHaveLength(1); expect(apps[0].blocked).toBeUndefined()
  })
  it('retains the incomplete-ownership gate for a malformed bundle inside application roots', async () => {
    await mkdir(path.join(root, 'Applications/Broken.app'), { recursive: true })
    await app('Applications/Mac.app')
    expect((await inventory(root, '/own.app'))[0].blocked).toBe('unreadable')
  })
  it('does not accept metadata symlinked outside the bundle', async () => {
    const external = path.join(root, 'external.plist'); await writeFile(external, 'outside')
    const bundle = path.join(root, 'Applications/Symlink.app')
    await mkdir(path.join(bundle, 'Contents'), { recursive: true })
    await symlink(external, path.join(bundle, 'Contents/Info.plist'))
    await expect(bundleMetadata(bundle)).rejects.toThrow('Metadata outside bundle')
  })
  it('keeps nested duplicate bundles even when the launcher catalog deduplicates names', async () => {
    await app('Applications/Mac.app'); await app('Applications/Older/Versions/Mac.app')
    expect(await inventory(root, '/own.app')).toHaveLength(2)
  })
  it('recognizes an Apple identifier containing underscores without permitting removal', async () => {
    const apple = await app('Applications/System.app', 'Contents/Info.plist', 'com.apple.Image_Capture')
    const regular = await app('Applications/Mac.app')
    const apps = await inventory(root, '/own.app')
    expect(apps.find(a => a.path === apple.bundle)?.blocked).toBe('protected')
    expect(apps.find(a => a.path === regular.bundle)?.blocked).toBeUndefined()
  })

})
