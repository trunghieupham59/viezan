#!/usr/bin/env node
/** Real macOS Trash/Undo smoke using only a newly created, synthetic directory. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const binary = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../native/bin/darwin/viezan-fs')
if (process.platform !== 'darwin') throw new Error('This smoke requires macOS')
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'viezan-trash-smoke-')))
const source = path.join(root, 'Synthetic.app')
const receipt = path.join(root, 'receipt.json')
await mkdir(source)
await writeFile(path.join(source, 'fixture.txt'), 'synthetic data, never a real application')
const before = await lstat(source)
const run = args => JSON.parse(execFileSync(binary, args, { encoding: 'utf8', timeout: 30_000 }))
let restored = false
try {
  const moved = run(['trash', source, String(before.dev), String(before.ino), receipt])
  assert.equal((await lstat(source).catch(() => null)), null)
  assert.equal(JSON.parse(await readFile(receipt, 'utf8')).path, moved.path)
  assert.equal((await lstat(moved.path)).ino, before.ino)
  await writeFile(source, 'new file must not be overwritten')
  assert.throws(() => run(['restore', moved.path, source, String(before.dev), String(before.ino)]))
  assert.equal(await readFile(source, 'utf8'), 'new file must not be overwritten')
  await rm(source) // This is the collision fixture created immediately above.
  run(['restore', moved.path, source, String(before.dev), String(before.ino)])
  assert.equal(await readFile(path.join(source, 'fixture.txt'), 'utf8'), 'synthetic data, never a real application')
  assert.equal((await lstat(source)).ino, before.ino)
  restored = true
  console.log('PASS: native Trash, durable receipt, collision refusal and exact restore; synthetic data only.')
} finally {
  if (restored) await rm(root, { recursive: true })
  else console.error(`Smoke interrupted; preserve fixture and recovery receipt at ${root}`)
}
