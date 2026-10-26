// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { residues } from '../residues'

vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, readdir: vi.fn(async (...args: Parameters<typeof fs.readdir>) => String(args[0]).startsWith('/Library/') ? [] : fs.readdir(...args)) }
})
let root = ''
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }) })
describe('filesystem selection safety', () => {
  it('preselects transient exact matches, requires opt-in for persistent data and keeps ambiguous/sandboxed items', async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'viezan-residue-safety-')))
    const app = { id: 'fixture', name: 'Synthetic', bundleId: 'org.example.synthetic', path: path.join(root, 'Applications/Synthetic.app'), teamId: 'TEAM', executable: 'Synthetic', version: '1' }
    await mkdir(app.path, { recursive: true })
    const fixtures = [
      ['Caches', app.bundleId], ['Logs', app.bundleId], ['Application Support', app.bundleId],
      ['Application Support', 'Synthetic'], ['Caches', `${app.bundleId}.helper`], ['Containers', app.bundleId],
      ['Group Containers', 'TEAM.shared'], ['LaunchAgents', `${app.bundleId}.plist`], ['Preferences', `${app.bundleId}.plist`],
    ]
    for (const [dir, name] of fixtures) {
      const p = path.join(root, 'Library', dir, name)
      await mkdir(path.dirname(p), { recursive: true })
      if (name.endsWith('.plist')) await writeFile(p, 'synthetic fixture')
      else await mkdir(p)
    }
    const scan = await residues(app, [app], root)
    const item = (dir: string, name = app.bundleId) => scan.items.find(i => i.path === path.join(root, 'Library', dir, name))
    expect(scan.incomplete).toBe(false)
    expect(item('Caches')?.selected).toBe(true)
    expect(item('Logs')?.selected).toBe(true)
    expect(item('Application Support')?.selected).toBe(false)
    expect(item('Preferences', `${app.bundleId}.plist`)?.selected).toBe(false)
    for (const [dir, name] of fixtures.slice(3, 8)) expect(item(dir, name)).toMatchObject({ selected: false, blocked: expect.any(String) })
  })
})
