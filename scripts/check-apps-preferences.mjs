#!/usr/bin/env node
/** Real defaults export/delete/import using a new UUID domain; never an existing app domain. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') throw new Error('Requires macOS')
const require = createRequire(import.meta.url)
const { createPreferences } = require('../dist-electron/apps/preferences.js')
const { createFileActions } = require('../dist-electron/fileActions/service.js')
const { snapshot, createPathPolicy } = require('../dist-electron/fileActions/verify.js')
const { createNativeFiles } = require('../dist-electron/fileActions/native.js')
const { runFile } = require('../dist-electron/fileActions/native.js')
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'viezan-prefs-smoke-')))
await chmod(root, 0o700)
const domain = `org.viezan.safety-fixture.${randomUUID()}`
const preferences = createPreferences(os.homedir())
const backup = path.join(root, 'backup.plist')
const marker = randomUUID()
let created = false
let complete = false
try {
  assert.equal(await preferences.exists(domain), false)
  await runFile('/usr/bin/defaults', ['write', domain, 'syntheticFixture', '-string', marker])
  created = true
  await new Promise(resolve => setTimeout(resolve, 1000))
  assert.equal(await preferences.exists(domain), true)
  await preferences.export(domain, backup)
  assert.match(await readFile(backup, 'utf8'), new RegExp(marker))
  await preferences.remove(domain)
  assert.equal(await preferences.exists(domain), false)
  await preferences.restore(domain, backup)
  assert.equal((await runFile('/usr/bin/defaults', ['read', domain, 'syntheticFixture'])).stdout.trim(), marker)
  const prefsPath = path.join(os.homedir(), 'Library/Preferences', `${domain}.plist`)
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const forbidden = async () => { throw new Error('No launch agents in this fixture') }
  const deps = { directory: path.join(root, 'journal'), files: createNativeFiles(path.join(repo, 'native/bin/darwin/viezan-fs')),
    policy: createPathPolicy(os.homedir(), path.join(root, 'appData')), checkUse: async () => {}, preferences,
    agents: { stop: forbidden, start: forbidden } }
  const item = { id: 'fixture', path: prefsPath, kind: 'preferences', evidence: 'exact', selected: true, bytes: 0,
    domain, snapshot: await snapshot(prefsPath) }
  const session = await createFileActions(deps).execute('Synthetic preferences', 'reset', [item], new Set(['fixture']))
  assert.equal(session.items[0].status, 'trashed')
  assert.equal(await preferences.exists(domain), false)
  assert.equal((await createFileActions(deps).undo(session.id)).items[0].status, 'restored')
  assert.equal((await runFile('/usr/bin/defaults', ['read', domain, 'syntheticFixture'])).stdout.trim(), marker)
  complete = true
  console.log('PASS: real defaults and journal-service reset/Undo, verified restored values and retained-empty-plist handling; synthetic UUID domain only.')
} catch (error) { console.error('Fixture operation failed:', error.message); throw error
} finally {
  if (created && await preferences.exists(domain)) await preferences.remove(domain).catch(() => console.error('Fixture domain cleanup remains unresolved:', domain))
  if (complete || !created) {
    if (created && !await preferences.exists(domain)) await rm(path.join(os.homedir(), 'Library/Preferences', `${domain}.plist`), { force: true })
    await rm(root, { recursive: true })
  }
  else console.error(`Synthetic backup retained at ${root}`)
}
