/**
 * Version helpers shared by the updater and the installer cleanup. Pure module
 * (no Electron import) so both sides can use it without a dependency cycle.
 */

/**
 * Simple semver comparison.
 * Returns true if `remote` is strictly newer than `current`.
 */
export function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [rMaj = 0, rMin = 0, rPat = 0] = parse(remote)
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current)
  if (rMaj !== cMaj) return rMaj > cMaj
  if (rMin !== cMin) return rMin > cMin
  return rPat > cPat
}

/**
 * Version embedded in an electron-builder artifact name produced by the
 * `Viezan-${version}-${arch}.${ext}` pattern in package.json, e.g.
 * `Viezan-2.2.6-x64.exe` or `Viezan-2.2.6-arm64.dmg`. Null for any other name.
 */
export function parseArtifactVersion(fileName: string): string | null {
  const base = fileName.replace(/^.*[/\\]/, '')
  const match = /^Viezan-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)-/.exec(base)
  return match ? match[1] : null
}
