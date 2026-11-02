import fs from 'node:fs'
import path from 'node:path'

const root = 'docs/agents'
const jsonFiles = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(filePath)
    } else if (filePath.endsWith('.json')) {
      jsonFiles.push(filePath)
    }
  }
}

function collectRelativeRefs(value, filePath, refs) {
  if (Array.isArray(value)) {
    for (const item of value) collectRelativeRefs(item, filePath, refs)
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && item.startsWith('../')) {
      refs.push({ filePath, key, ref: item })
    } else if (Array.isArray(item)) {
      for (const child of item) {
        if (typeof child === 'string' && child.startsWith('../')) {
          refs.push({ filePath, key, ref: child })
        }
      }
    }
    collectRelativeRefs(item, filePath, refs)
  }
}

walk(root)

const refs = []
for (const filePath of jsonFiles) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  collectRelativeRefs(parsed, filePath, refs)
}

const broken = refs.filter(({ filePath, ref }) => {
  return !fs.existsSync(path.resolve(path.dirname(filePath), ref))
})

if (broken.length > 0) {
  for (const item of broken) {
    console.error(`${item.filePath} ${item.key} ${item.ref}`)
  }
  process.exit(1)
}

console.log(`json_files ${jsonFiles.length} ok`)
console.log(`checked_refs ${refs.length} ok`)
