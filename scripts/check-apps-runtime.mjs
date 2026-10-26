#!/usr/bin/env node
/** Full main runtime, real inventory/residue/MDM/in-use guards and native Trash/Undo. Synthetic targets only. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') throw new Error('Requires macOS and npm run build:electron')
const require = createRequire(import.meta.url)
const { createAppsRuntime } = require('../dist-electron/apps/runtime.js')
const { snapshot } = require('../dist-electron/fileActions/verify.js')
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'viezan-runtime-smoke-')))
const home = path.join(root, 'home')
const bundleId = `org.viezan.synthetic.${randomUUID()}`
const bundle = path.join(home, 'Applications/Synthetic Runtime.app')
const cache = path.join(home, 'Library/Caches', bundleId)
let complete = false
let confirmations = 0
try {
  await mkdir(path.join(bundle, 'Contents'), { recursive: true })
  await writeFile(path.join(bundle, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundleId}</string><key>CFBundleName</key><string>Synthetic Runtime</string><key>CFBundleVersion</key><string>1</string></dict></plist>`)
  await mkdir(cache, { recursive: true }); await writeFile(path.join(cache, 'fixture.txt'), 'runtime smoke only')
  const before = [await snapshot(bundle), await snapshot(cache)]
  const options = { home, userData: path.join(root, 'userData'), ownBundle: '/Applications/Viezan.app', platform: process.platform,
    uid: os.userInfo().uid, binary: path.join(repo, 'native/bin/darwin/viezan-fs'), reveal: () => {},
    confirm: async (plan, request) => {
      assert.equal(plan.app.path, bundle)
      for (const item of plan.items.filter(i => request.itemIds.includes(i.id))) assert([bundle, cache].includes(item.path), 'Never approve a non-fixture path')
      confirmations++; return true
    },
  }
  const get = reply => { assert(reply.success, `Runtime refused operation: ${reply.error}`); return reply.data }
  const runtime = createAppsRuntime(options); runtime.start()
  const apps = get(await runtime.api.inventory())
  const app = apps.find(a => a.path === bundle)
  assert(app && !app.blocked, `Synthetic app is not actionable: ${app?.blocked}`)
  let plan = get(await runtime.api.inspect(app.id))
  assert.equal(plan.incomplete, false)
  assert.deepEqual(plan.items.filter(i => i.selected).map(i => i.path).sort(), [bundle, cache].sort())
  // Exercise the real lsof guard, not a mocked running-state response.
  const held = await open(path.join(cache, 'fixture.txt'), 'r')
  try {
    const blocked = get(await runtime.api.apply({ planId: plan.id, itemIds: plan.items.filter(i => i.selected).map(i => i.id), action: 'uninstall', quit: true, locale: 'en' }))
    assert(blocked.items.some(i => i.path === cache && i.status === 'failed' && i.issue === 'in-use'))
    assert(blocked.items.every(i => i.status !== 'trashed'))
    assert.equal((await snapshot(bundle)).digest, before[0].digest)
    assert.equal((await snapshot(cache)).digest, before[1].digest)
  } finally { await held.close() }
  plan = get(await runtime.api.inspect(app.id))
  const result = get(await runtime.api.apply({ planId: plan.id, itemIds: plan.items.filter(i => i.selected).map(i => i.id), action: 'uninstall', quit: true, locale: 'en' }))
  assert.equal(confirmations, 2)
  assert(result.items.every(i => i.status === 'trashed'), JSON.stringify(result.items))
  assert.equal(result.remaining, 0)
  runtime.stop()
  const restarted = createAppsRuntime(options); restarted.start()
  const undo = get(await restarted.api.undo(result.id))
  assert(undo.items.every(i => i.status === 'restored'), JSON.stringify(undo.items))
  assert.equal((await snapshot(bundle)).digest, before[0].digest)
  assert.equal((await snapshot(cache)).digest, before[1].digest)
  assert.equal(await readFile(path.join(cache, 'fixture.txt'), 'utf8'), 'runtime smoke only')
  restarted.stop(); complete = true
  console.log('PASS: real open-file refusal plus full runtime inventory → inspect → confirmation → ownership/in-use recheck → native uninstall → post-scan → restart → Undo; only synthetic paths approved.')
} finally {
  if (complete) await rm(root, { recursive: true })
  else console.error(`Synthetic runtime fixture and journal retained for recovery: ${root}`)
}
