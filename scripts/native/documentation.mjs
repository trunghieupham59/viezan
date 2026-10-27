// Source/document consistency only. No build, network request or user-data access.
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '../..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const readme = read('README.md')
if (pkg.version !== lock.version || pkg.version !== lock.packages[''].version) throw new Error('Package version mismatch')
if (pkg.main || pkg.build || pkg.dependencies?.electron || Object.keys(pkg.devDependencies || {}).some(key => key.includes('electron'))) throw new Error('Retired desktop runtime in package manifest')
for (const source of ['apps/macos/Package.swift', 'apps/desktop-qt/CMakeLists.txt', 'scripts/native/build.py', 'scripts/native/package.py']) {
  if (!fs.existsSync(path.join(root, source))) throw new Error(`Missing native entrypoint: ${source}`)
}
for (const required of ['SwiftUI', 'C++', 'runtime acceptance', 'Qt 6.8', 'scripts/native/build.py', 'scripts/native/package.py']) if (!readme.includes(required)) throw new Error(`README missing native fact: ${required}`)
console.log(`Native documentation references version ${pkg.version}; runtime acceptance is separate.`)
