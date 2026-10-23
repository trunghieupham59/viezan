#!/usr/bin/env node
/**
 * Build the native helpers Viezan ships beside the app. Today that is `viezan-smc`,
 * the macOS SMC reader (native/smc/main.swift), compiled as a universal binary into
 * native/bin/darwin/. Other platforms have nothing to build and exit quietly.
 *
 * Usage: node scripts/build-native.mjs [--force]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')

if (process.platform !== 'darwin') {
  console.log('[native] nothing to build on this platform')
  process.exit(0)
}

const source = join(root, 'native', 'smc', 'main.swift')
const outDir = join(root, 'native', 'bin', 'darwin')
const output = join(outDir, 'viezan-smc')

if (!force && existsSync(output) && statSync(output).mtimeMs >= statSync(source).mtimeMs) {
  console.log('[native] viezan-smc is up to date')
  process.exit(0)
}

try {
  execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' })
} catch {
  console.warn('[native] swiftc not found (install the Xcode Command Line Tools); skipping viezan-smc')
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
const slices = []
for (const arch of ['arm64', 'x86_64']) {
  const slice = join(outDir, `viezan-smc-${arch}`)
  execFileSync('swiftc', ['-O', '-target', `${arch}-apple-macos12.0`, '-o', slice, source], { stdio: 'inherit' })
  slices.push(slice)
}
execFileSync('lipo', ['-create', ...slices, '-output', output], { stdio: 'inherit' })
for (const slice of slices) rmSync(slice, { force: true })
console.log(`[native] built ${output}`)
