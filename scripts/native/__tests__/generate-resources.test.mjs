import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const source = path.resolve(import.meta.dirname, '../../..')
const outputs = [
  'apps/macos/Sources/ViezanDomain/Resources/native.json',
  'apps/desktop-qt/qml/native.json',
  'apps/desktop-qt/qml/brand.png',
]

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-resources-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const relative of ['resources', 'contracts/native-workbench', 'public/icon.png', 'scripts/native/generate-resources.mjs']) {
    fs.cpSync(path.join(source, relative), path.join(root, relative), { recursive: true })
  }
  for (const relative of outputs) fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
  return {
    root,
    file: relative => path.join(root, relative),
    run: (args = [], nodeArgs = []) => spawnSync(process.execPath, [...nodeArgs, 'scripts/native/generate-resources.mjs', ...args], {
      cwd: root, encoding: 'utf8', timeout: 30_000,
    }),
  }
}

test('resource generation creates missing outputs, preserves unchanged timestamps and checks without writing', t => {
  const env = fixture(t)
  assert.notEqual(env.run(['--check']).status, 0)
  const generated = env.run()
  assert.equal(generated.status, 0, generated.stderr)
  assert.deepEqual(fs.readFileSync(env.file(outputs[0])), fs.readFileSync(env.file(outputs[1])))
  assert.deepEqual(fs.readFileSync(env.file(outputs[2])), fs.readFileSync(env.file('public/icon.png')))

  const earlier = new Date('2000-01-01T00:00:00Z')
  for (const relative of outputs) fs.utimesSync(env.file(relative), earlier, earlier)
  assert.equal(env.run().status, 0)
  assert.equal(env.run(['--check']).status, 0)
  for (const relative of outputs) assert.equal(fs.statSync(env.file(relative)).mtimeMs, earlier.getTime())

  for (const relative of outputs) {
    fs.writeFileSync(env.file(relative), 'stale resource')
    const checked = env.run(['--check'])
    assert.notEqual(checked.status, 0)
    assert.match(checked.stderr, /Stale (native resources|Qt brand asset)/)
    assert.equal(fs.readFileSync(env.file(relative), 'utf8'), 'stale resource')
    assert.equal(env.run().status, 0)
    fs.unlinkSync(env.file(relative))
    assert.notEqual(env.run(['--check']).status, 0)
    assert.equal(env.run().status, 0)
  }
  assert.equal(env.run(['--check']).status, 0)
})

test('changed resources replace swapped output symlinks without overwriting their targets', {
  skip: process.platform === 'win32' ? 'Creating test symlinks requires Windows developer mode or elevation' : false,
}, t => {
  const env = fixture(t)
  assert.equal(env.run().status, 0)
  const targets = outputs.map(relative => env.file(relative))
  for (const destination of targets) fs.writeFileSync(destination, 'stale resource')
  const protectedFile = env.file('protected.txt')
  fs.writeFileSync(protectedFile, 'keep this file')
  const preload = env.file('swap-output.mjs')
  // Deterministically replace each output after its comparison read, before the
  // generator publishes bytes. This reproduces the reported check/use window.
  fs.writeFileSync(preload, `
    import fs from 'node:fs'
    const pending = new Set(${JSON.stringify(targets)})
    const read = fs.readFileSync
    fs.readFileSync = function (file, ...args) {
      const bytes = read.call(this, file, ...args)
      if (pending.delete(file)) {
        fs.unlinkSync(file)
        fs.symlinkSync(${JSON.stringify(protectedFile)}, file)
      }
      return bytes
    }
  `)
  const generated = env.run([], ['--import', preload])
  assert.equal(generated.status, 0, generated.stderr)
  assert.ok(fs.readFileSync(protectedFile).equals(Buffer.from('keep this file')), 'output symlink target was modified')
  for (const destination of targets) {
    assert.equal(fs.lstatSync(destination).isSymbolicLink(), false)
    assert.equal(fs.readdirSync(path.dirname(destination)).some(name => name.startsWith('.native-resource-')), false)
  }
  assert.equal(env.run(['--check']).status, 0)
})
