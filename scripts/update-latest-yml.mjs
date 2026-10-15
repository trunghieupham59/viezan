#!/usr/bin/env node
/**
 * Re-point latest.yml at a re-signed Windows installer.
 *
 * electron-builder writes latest.yml with the SHA-512 and size of the unsigned
 * installer. Code signing rewrites the file, so electron-updater would reject
 * the signed download with a checksum mismatch. This updates the `sha512` and
 * `size` of the entry that matches the installer's file name, plus the legacy
 * top-level `sha512`, and leaves everything else untouched.
 *
 * Usage: node scripts/update-latest-yml.mjs <latest.yml> <installer.exe>
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

export function updateLatestYml(yml, fileName, sha512, size) {
  const lines = yml.split('\n')
  let currentFile = null
  let topLevelPath = null
  let updated = 0

  for (const raw of lines) {
    const m = /^path:\s*(.+?)\s*\r?$/.exec(raw)
    if (m) topLevelPath = m[1].replace(/^['"]|['"]$/g, '')
  }

  const out = lines.map((line) => {
    const urlMatch = /^\s*-\s*url:\s*(.+?)\s*(\r?)$/.exec(line)
    if (urlMatch) {
      currentFile = urlMatch[1].replace(/^['"]|['"]$/g, '')
      return line
    }
    const indented = /^(\s+)(sha512|size):\s*.*?(\r?)$/.exec(line)
    if (indented && currentFile === fileName) {
      updated++
      return `${indented[1]}${indented[2]}: ${indented[2] === 'sha512' ? sha512 : size}${indented[3]}`
    }
    const top = /^sha512:\s*.*?(\r?)$/.exec(line)
    if (top && topLevelPath === fileName) {
      updated++
      return `sha512: ${sha512}${top[1]}`
    }
    return line
  })

  // entry sha512 + size, and the top-level sha512
  if (updated < 3) {
    throw new Error(`latest.yml has no complete entry for "${fileName}" (updated ${updated} of 3 fields)`)
  }
  return out.join('\n')
}

function main() {
  const [ymlPath, installerPath] = process.argv.slice(2)
  if (!ymlPath || !installerPath) {
    console.error('Usage: node scripts/update-latest-yml.mjs <latest.yml> <installer.exe>')
    process.exit(2)
  }
  const data = readFileSync(installerPath)
  const sha512 = createHash('sha512').update(data).digest('base64')
  const size = statSync(installerPath).size
  const next = updateLatestYml(readFileSync(ymlPath, 'utf8'), basename(installerPath), sha512, size)
  writeFileSync(ymlPath, next)
  console.log(`latest.yml updated for ${basename(installerPath)} (size ${size})`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
