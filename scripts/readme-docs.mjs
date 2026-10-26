import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REVIEW_FILE = '.github/readme-review.json'
const SOURCE_DIRS = ['src', 'electron', 'shared', 'native', 'chrome-extension']
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|css|html|json|c|cc|cpp|h|hpp|m|mm|swift|sh|ps1)$/
const SKIP_DIRS = new Set(['__tests__', '__mocks__', 'test', 'tests', 'fixtures', 'node_modules', 'bin', 'build', 'dist'])
const STACK = [
  ['electron', 'Electron', 'Desktop shell, native capabilities and secure storage'],
  ['react', 'React', 'Renderer UI'],
  ['typescript', 'TypeScript', 'Type safety across renderer and Electron code'],
  ['vite', 'Vite', 'Renderer build pipeline'],
  ['tailwindcss', 'Tailwind CSS', 'Styling'],
  ['zustand', 'Zustand', 'Client state'],
  ['electron-builder', 'electron-builder', 'Packaging and publishing'],
  ['vitest', 'Vitest', 'Unit and integration tests'],
]

const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
const json = (root, file) => JSON.parse(read(root, file))
const hash = (value) => createHash('sha256').update(value).digest('hex')

function requireMatch(text, pattern, label) {
  const match = text.match(pattern)
  if (!match) throw new Error(`Cannot extract ${label}; update scripts/readme-docs.mjs for the new source shape.`)
  return match[1]
}

function generatedBlocks(root) {
  const pkg = json(root, 'package.json')
  const providerSource = read(root, 'src/constants/providers.ts')
  const providers = [...providerSource.matchAll(/id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*color:/g)]
  const supported = requireMatch(read(root, 'electron/ipc/providers/types.ts'), /SUPPORTED_PROVIDERS\s*=\s*\[([^\]]+)\]\s*as const/, 'provider IDs')
  if (!/^\s*'[^']+'(?:\s*,\s*'[^']+')*\s*,?\s*$/.test(supported)) throw new Error('Unsupported provider registry syntax.')
  const ids = [...supported.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort()
  if (JSON.stringify(ids) !== JSON.stringify(providers.map((match) => match[1]).sort())) {
    throw new Error('Main and renderer provider registries disagree or cannot be extracted.')
  }
  const localeSource = requireMatch(read(root, 'src/i18n/index.ts'), /export const LOCALE_NAMES[^=]*=\s*\{([^}]+)\}/, 'locale names')
  const locales = [...localeSource.matchAll(/(\w+):\s*'([^']+)'/g)]
  const localeFiles = fs.readdirSync(path.join(root, 'src/i18n/locales')).filter((file) => file.endsWith('.ts')).map((file) => file.slice(0, -3)).sort()
  if (JSON.stringify(localeFiles) !== JSON.stringify(locales.map((match) => match[1]).sort())) throw new Error('Locale registry and locale files disagree.')
  const rows = STACK.map(([id, label, role]) => {
    const range = pkg.dependencies?.[id] ?? pkg.devDependencies?.[id]
    if (!range) throw new Error(`Missing documented dependency: ${id}`)
    return `| ${label} | \`${range}\` | ${role} |`
  })
  return {
    overview: `This README describes the source in this checkout (package version **${pkg.version}**).\nThe latest published installer may differ; see [Releases](https://github.com/trunghieupham59/Viezan/releases/latest).\n\n- AI providers: ${providers.map((match) => match[2]).join(', ')}.\n- Interface languages: ${locales.map((match) => match[2]).join(', ')}.`,
    stack: ['| Technology | Declared version | Role |', '| --- | --- | --- |', ...rows].join('\n'),
  }
}

/** Only replace bounded generated sections; prose must be reviewed against source. */
export function renderReadme(root) {
  let readme = read(root, 'README.md')
  for (const [id, content] of Object.entries(generatedBlocks(root))) {
    const start = `<!-- BEGIN GENERATED:${id} -->`
    const end = `<!-- END GENERATED:${id} -->`
    if (readme.split(start).length !== 2 || readme.split(end).length !== 2 || readme.indexOf(start) > readme.indexOf(end)) {
      throw new Error(`README.md must contain exactly one ordered ${id} marker pair.`)
    }
    readme = `${readme.slice(0, readme.indexOf(start) + start.length)}\n${content}\n${readme.slice(readme.indexOf(end))}`
  }
  return readme
}

/** Hash product source, including new files, without reading secrets or generated binaries.
 * CRLF normalization keeps review records portable across checkout platforms.
 */
export function sourceDigest(root) {
  const files = ['package.json', 'package-lock.json']
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const relative = `${dir}/${entry.name}`
      if (entry.isSymbolicLink()) throw new Error(`Source symlinks are not supported: ${relative}`)
      if (entry.isDirectory()) walk(relative)
      else if (SOURCE_EXTENSIONS.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) files.push(relative)
    }
  }
  for (const dir of SOURCE_DIRS) walk(dir)
  return hash(JSON.stringify(files.sort().map((file) => [file, hash(read(root, file))])))
}

/** Return the curated entry used verbatim by the release workflow. */
export function releaseNotes(root) {
  const version = json(root, 'package.json').version
  const sections = [...read(root, 'CHANGELOG.md').matchAll(/^## \[([^\]]+)\][^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)]
  const matches = sections.filter((section) => section[1] === version)
  if (matches.length !== 1 || !/^[-*] \S.+/m.test(matches[0][2]) || /\b(TODO|TBD)\b/.test(matches[0][2])) {
    throw new Error(`CHANGELOG.md needs one non-placeholder ## [${version}] entry with release notes.`)
  }
  return `## Viezan ${version}\n\n${matches[0][2].trim()}\n`
}

function validateContent(root) {
  const errors = []
  const readme = read(root, 'README.md')
  if (readme !== renderReadme(root)) errors.push('Generated README sections are stale. Run npm run docs:sync.')
  const pkg = json(root, 'package.json')
  const lock = json(root, 'package-lock.json')
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) errors.push('package.json and package-lock.json versions disagree.')
  // Every routable screen must be discoverable in the human-written feature guide.
  const pageSource = read(root, 'src/modules/pages.ts')
  const pages = [...pageSource.matchAll(/import\(\s*(['"])\.\.\/(pages\/[^'"]+)\1\s*\)/g)]
  if (!pages.length || pages.length !== [...pageSource.matchAll(/\blazy\s*\(/g)].length) {
    throw new Error('Cannot completely extract the page catalog; update the documentation checker for the new routing shape.')
  }
  for (const [, , page] of pages) {
    if (!readme.includes(`](src/${page}.tsx)`)) errors.push(`README is missing a feature link to src/${page}.tsx.`)
  }
  const links = [...readme.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)|(?:src|href)="([^"]+)"/g)]
  for (const match of links) {
    const link = match[1] ?? match[2]
    if (/^(?:[a-z]+:|#|\/\/)/i.test(link)) continue
    const target = decodeURIComponent(link.split('#')[0])
    if (!fs.existsSync(path.resolve(root, target))) errors.push(`Broken README path: ${target}`)
  }
  releaseNotes(root)
  return errors
}

function reviewState(root) {
  return {
    schemaVersion: 1,
    version: json(root, 'package.json').version,
    sourceSha256: sourceDigest(root),
    readmeSha256: hash(read(root, 'README.md')),
    changelogSha256: hash(read(root, 'CHANGELOG.md')),
  }
}

export function checkDocs(root, releaseRef) {
  const errors = validateContent(root)
  if (releaseRef !== undefined && releaseRef !== `refs/tags/v${json(root, 'package.json').version}`) {
    errors.push('Release must run on a v<package.json version> tag; branch dispatch and mismatched tags are rejected.')
  }
  if (!fs.existsSync(path.join(root, REVIEW_FILE))) return [...errors, 'Missing README review record. Review the source and run npm run docs:review -- --summary "...".']
  const recorded = json(root, REVIEW_FILE)
  const current = reviewState(root)
  for (const [key, value] of Object.entries(current)) {
    if (recorded[key] !== value) errors.push(`README review is stale (${key}). Review changed source/docs, then run npm run docs:review -- --summary "...".`)
  }
  if (typeof recorded.summary !== 'string' || recorded.summary.trim().length < 20) errors.push('README review needs a meaningful summary (at least 20 characters).')
  return errors
}

export function recordReview(root, summary) {
  if (typeof summary !== 'string' || summary.trim().length < 20) throw new Error('Provide --summary describing the content and limitations reviewed (at least 20 characters).')
  const errors = validateContent(root)
  if (errors.length) throw new Error(errors.join('\n'))
  fs.writeFileSync(path.join(root, REVIEW_FILE), `${JSON.stringify({ ...reviewState(root), summary: summary.trim() }, null, 2)}\n`)
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const [command = 'check', ...args] = process.argv.slice(2)
  if (command === 'sync' && !args.length) {
    fs.writeFileSync(path.join(root, 'README.md'), renderReadme(root))
    console.log('Generated README sections updated. Review prose before recording docs:review.')
  } else if (command === 'review' && args.length === 2 && args[0] === '--summary') {
    recordReview(root, args[1])
    console.log('README review recorded. This records your review; it does not prove semantic correctness.')
  } else if (command === 'notes' && !args.length) {
    process.stdout.write(releaseNotes(root))
  } else if (command === 'check' && (!args.length || (args.length === 2 && args[0] === '--release-ref'))) {
    const errors = checkDocs(root, args[1])
    if (errors.length) throw new Error(errors.join('\n'))
    console.log('README facts, page coverage, local links, release notes and review freshness are current.')
  } else {
    throw new Error('Usage: readme-docs.mjs check [--release-ref refs/tags/vX.Y.Z] | sync | review --summary "..." | notes')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
