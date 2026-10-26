#!/usr/bin/env node
/** Actual main-process file-action service + native Trash, restricted to disposable fixtures. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') throw new Error('Requires macOS and npm run build:electron')
const require = createRequire(import.meta.url)
const { createFileActions } = require('../dist-electron/fileActions/service.js')
const { createNativeFiles } = require('../dist-electron/fileActions/native.js')
const { snapshot, createPathPolicy } = require('../dist-electron/fileActions/verify.js')
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'viezan-service-smoke-')))
const home = path.join(root, 'home')
const directory = path.join(root, 'journal')
const files = createNativeFiles(path.join(repo, 'native/bin/darwin/viezan-fs'))
const bundle = path.join(home, 'Applications/Ứng dụng テスト.app')
const cache = path.join(home, 'Library/Caches/org.viezan.synthetic')
const shared = path.join(home, 'Library/Caches/org.viezan.shared')
let verified = false
try {
  for (const p of [bundle, cache, shared]) {
    await mkdir(p, { recursive: true })
    await writeFile(path.join(p, 'fixture.txt'), `synthetic-only ${path.basename(p)}`)
  }
  const candidates = await Promise.all([cache, bundle, shared].map(async (p, i) => ({
    id: String(i), path: p, kind: p === bundle ? 'bundle' : 'data', evidence: 'exact', selected: true,
    bytes: 0, snapshot: await snapshot(p), ...(p === shared ? { blocked: 'shared' } : {}),
  })))
  const forbidden = async () => { throw new Error('This smoke must never touch preferences or launch agents') }
  const deps = { directory, files, policy: createPathPolicy(home, path.join(home, 'Viezan-data')),
    checkUse: async () => { assert.equal(await files.running(bundle), false) },
    preferences: { export: forbidden, remove: forbidden, restore: forbidden, exists: forbidden },
    agents: { stop: forbidden, start: forbidden },
  }
  const service = createFileActions(deps)
  const session = await service.execute('Synthetic only', 'uninstall', candidates, new Set(['0', '1', '2']))
  assert.deepEqual(session.items.map(i => i.status), ['trashed', 'trashed', 'skipped'])
  assert.equal(await readFile(path.join(shared, 'fixture.txt'), 'utf8'), 'synthetic-only org.viezan.shared')
  const restarted = createFileActions(deps)
  assert.equal((await restarted.sessions())[0].canUndo, true)
  const undone = await restarted.undo(session.id)
  assert.deepEqual(undone.items.map(i => i.status), ['restored', 'restored', 'skipped'])
  for (const candidate of candidates) assert.equal((await snapshot(candidate.path)).digest, candidate.snapshot.digest)
  // Re-run with a lost native response, then recover the receipt and Undo after restart.
  const interrupted = createFileActions({ ...deps, files: { ...files, trash: async (...args) => {
    await files.trash(...args); throw new Error('synthetic pipe interruption')
  } } })
  const crash = await interrupted.execute('Synthetic interrupted', 'reset', [candidates[0]], new Set(['0']))
  assert.equal(crash.items[0].status, 'pending')
  const recovered = createFileActions(deps)
  assert.equal((await recovered.sessions())[0].items[0].status, 'trashed')
  assert.equal((await recovered.undo(crash.id)).items[0].status, 'restored')
  assert.equal((await snapshot(cache)).digest, candidates[0].snapshot.digest)
  verified = true
  console.log('PASS: real service/native uninstall, shared-data protection, restart/Undo, Unicode paths, lost-response recovery, exact metadata/content restoration.')
} finally {
  if (verified) await rm(root, { recursive: true })
  else console.error(`Fixture preserved for recovery: ${root}`)
}
