// @vitest-environment node
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileActions, type FileActionDeps, type FileCandidate } from '../service'
import { createPathPolicy, FileActionError, snapshot, verify } from '../verify'

let root: string
let home: string
let source: string
let deps: FileActionDeps
let candidate: FileCandidate
beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'viezan-files-test-')))
  home = path.join(root, 'home')
  source = path.join(home, 'Library/Caches/org.example.app')
  await mkdir(source, { recursive: true })
  await mkdir(path.join(root, 'trash'))
  await writeFile(path.join(source, 'cache'), 'original')
  candidate = { id: 'item', path: source, kind: 'data', evidence: 'exact', bytes: 8, selected: true, snapshot: await snapshot(source) }
  deps = { directory: path.join(root, 'journal'), policy: createPathPolicy(home, path.join(home, 'Library/Application Support/Viezan')), checkUse: vi.fn(async () => {}),
    files: { available: () => true, running: async () => false, quit: async () => {},
      trash: vi.fn(async p => { const target = path.join(root, 'trash', path.basename(p)); await rename(p, target); return target }),
      restore: vi.fn(async (from, to) => { await rename(from, to) }) },
    preferences: { export: vi.fn(async (_domain, file) => { await writeFile(file, 'backup') }), remove: vi.fn(async () => {}), restore: vi.fn(async () => {}), exists: vi.fn(async () => false) },
    agents: { stop: vi.fn(async () => {}), start: vi.fn(async () => {}) },
  }
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('bounded, reversible file actions', () => {
  it('journals intent before moving, persists results and restores after restart', async () => {
    const original = deps.files.trash
    deps.files.trash = vi.fn(async (p, expected, receipt) => {
      const journal = JSON.parse(await readFile(path.join(deps.directory, 'journal.json'), 'utf8'))
      expect(journal[0].items[0].status).toBe('pending')
      return original(p, expected, receipt)
    })
    const actions = createFileActions(deps)
    const result = await actions.execute('Example', 'uninstall', [candidate], new Set(['item']))
    expect(result.items[0].status).toBe('trashed')
    const restarted = createFileActions(deps)
    expect((await restarted.sessions())[0].canUndo).toBe(true)
    const restored = await restarted.undo(result.id)
    expect(restored.items[0].status).toBe('restored')
    expect(await readFile(path.join(source, 'cache'), 'utf8')).toBe('original')
  })
  it('refuses a changed descendant even if the directory timestamp is unchanged', async () => {
    await writeFile(path.join(source, 'cache'), 'different bytes')
    if (!candidate.snapshot) throw new Error('Missing snapshot')
    await expect(verify(source, candidate.snapshot, deps.policy)).rejects.toMatchObject({ issue: 'changed' })
    const result = await createFileActions(deps).execute('Example', 'reset', [candidate], new Set(['item']))
    expect(result.items[0]).toMatchObject({ status: 'failed', issue: 'changed' })
    expect(deps.files.trash).not.toHaveBeenCalled()
  })
  it('refuses a replaced root and symlinked ancestor', async () => {
    await rename(source, `${source}-old`)
    await symlink(`${source}-old`, source)
    await expect(deps.policy(source)).rejects.toMatchObject({ issue: 'protected' })
    await expect(snapshot(source)).rejects.toMatchObject({ issue: 'protected' })
  })
  it('does not traverse a symlink within a directory', async () => {
    await symlink('/does-not-exist', path.join(source, 'link'))
    expect((await snapshot(source)).bytes).toBeGreaterThanOrEqual(0)
  })
  it('rejects whole roots, secrets, its own data and nested Photos libraries', async () => {
    for (const p of [home, path.join(home, 'Library/Caches'), path.join(home, '.ssh'), path.join(home, 'Library/Application Support/Viezan'), path.join(source, 'photos.photoslibrary')]) {
      await expect(deps.policy(p)).rejects.toMatchObject({ issue: 'protected' })
    }
  })
  it('keeps unchecked/shared items and records their reason', async () => {
    const result = await createFileActions(deps).execute('Example', 'reset', [{ ...candidate, blocked: 'shared' }], new Set(['item']))
    expect(result.items[0]).toMatchObject({ status: 'skipped', issue: 'shared' })
    expect(deps.files.trash).not.toHaveBeenCalled()
  })
  it('checks open files immediately before moving', async () => {
    deps.checkUse = vi.fn(async () => { throw new FileActionError('in-use') })
    const result = await createFileActions(deps).execute('Example', 'reset', [candidate], new Set(['item']))
    expect(result.items[0]).toMatchObject({ status: 'failed', issue: 'in-use' })
    expect(deps.files.trash).not.toHaveBeenCalled()
  })
  it('does not overwrite a new file or dangling symlink on Undo', async () => {
    const actions = createFileActions(deps)
    const result = await actions.execute('Example', 'reset', [candidate], new Set(['item']))
    await symlink('/missing', source)
    const undo = await actions.undo(result.id)
    expect(undo.items[0].issue).toBe('collision')
    expect(deps.files.restore).not.toHaveBeenCalled()
  })
  it('does not restore a different object substituted in Trash', async () => {
    const actions = createFileActions(deps)
    const result = await actions.execute('Example', 'reset', [candidate], new Set(['item']))
    const trashed = result.items[0].trashedPath
    if (!trashed) throw new Error('Missing trash path')
    await rename(trashed, `${trashed}-original`)
    await writeFile(trashed, 'substitute')
    expect((await actions.sessions())[0].canUndo).toBe(false)
    expect((await actions.undo(result.id)).items[0].issue).toBe('changed')
    expect(deps.files.restore).not.toHaveBeenCalled()
  })
  it('does not destroy an unreadable journal or touch files after it fails', async () => {
    await mkdir(deps.directory)
    await writeFile(path.join(deps.directory, 'journal.json'), 'invalid')
    await expect(createFileActions(deps).execute('Example', 'reset', [candidate], new Set(['item']))).rejects.toThrow()
    expect(deps.files.trash).not.toHaveBeenCalled()
  })
  it('backs up preferences before delete and refuses to overwrite a recreated domain', async () => {
    const item = { ...candidate, kind: 'preferences' as const, domain: 'org.example.app' }
    const actions = createFileActions(deps)
    const result = await actions.execute('Example', 'reset', [item], new Set(['item']))
    expect(deps.preferences.export).toHaveBeenCalledBefore(vi.mocked(deps.preferences.remove))
    const backup = result.items[0].backup
    if (!backup) throw new Error('Missing backup')
    expect(await readFile(backup, 'utf8')).toBe('backup')
    vi.mocked(deps.preferences.exists).mockResolvedValue(true)
    expect((await actions.undo(result.id)).items[0].issue).toBe('collision')
    expect(deps.preferences.restore).not.toHaveBeenCalled()
  })
  it('restores the agent when moving its plist fails', async () => {
    deps.files.trash = vi.fn(async () => { throw new Error('denied') })
    await createFileActions(deps).execute('Example', 'reset', [{ ...candidate, kind: 'agent', launchLabel: 'org.example.app' }], new Set(['item']))
    expect(deps.agents.stop).toHaveBeenCalledWith('org.example.app')
    expect(deps.agents.start).toHaveBeenCalledWith(source)
  })
  it('keeps pending intent visible after interruption and does not invent Undo', async () => {
    await mkdir(deps.directory)
    await writeFile(path.join(deps.directory, 'journal.json'), JSON.stringify([{ id: 'interrupted', appName: 'Example', action: 'reset', createdAt: new Date().toISOString(), remaining: null, items: [{ path: source, kind: 'data', status: 'pending' }] }]))
    expect((await createFileActions(deps).sessions())[0]).toMatchObject({ canUndo: false, remaining: null, items: [{ status: 'pending' }] })
  })
  it('recovers a native receipt after Electron loses the result, then allows Undo', async () => {
    deps.files.trash = vi.fn(async (p, _snapshot, receipt) => {
      const target = path.join(root, 'trash', path.basename(p))
      await rename(p, target)
      await writeFile(receipt, JSON.stringify({ path: target }))
      throw new Error('pipe closed after native completion')
    })
    const actions = createFileActions(deps)
    const result = await actions.execute('Example', 'reset', [candidate], new Set(['item']))
    expect(result.items[0].status).toBe('pending')
    const restarted = createFileActions(deps)
    expect((await restarted.sessions())[0]).toMatchObject({ canUndo: true, items: [{ status: 'trashed' }] })
    expect((await restarted.undo(result.id)).items[0].status).toBe('restored')
  })
  it('refuses to restore content edited in Trash', async () => {
    const actions = createFileActions(deps)
    const result = await actions.execute('Example', 'reset', [candidate], new Set(['item']))
    const trashed = result.items[0].trashedPath
    if (!trashed) throw new Error('Expected a trashed item')
    await writeFile(path.join(trashed, 'cache'), 'modified in trash')
    expect((await actions.undo(result.id)).items[0].issue).toBe('changed')
    expect(deps.files.restore).not.toHaveBeenCalled()
  })
  it('records a restored agent even when starting it fails', async () => {
    const actions = createFileActions(deps)
    const result = await actions.execute('Example', 'reset', [{ ...candidate, kind: 'agent', launchLabel: 'org.example.app' }], new Set(['item']))
    deps.agents.start = vi.fn(async () => { throw new Error('bootstrap failed') })
    const restored = await actions.undo(result.id)
    expect(restored).toMatchObject({ canUndo: false, items: [{ status: 'restored', issue: 'failed' }] })
    expect(await readFile(path.join(source, 'cache'), 'utf8')).toBe('original')
    expect((await createFileActions(deps).sessions())[0].items[0].status).toBe('restored')
  })

})
