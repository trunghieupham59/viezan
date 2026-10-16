import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const tokenFile = path.join(root, 'src/styles/tokens.css')
const tokenSource = await readFile(tokenFile, 'utf8')
const chatStyleFile = path.join(root, 'src/styles/chat.css')
const chatStyleSource = await readFile(chatStyleFile, 'utf8')
const legacyStyleSource = await readFile(path.join(root, 'src/styles/codex.css'), 'utf8')
const normalizedLegacyStyleSource = legacyStyleSource.replaceAll('\r\n', '\n')
const violations = []

const colorTokenPrefixes = [
  '--vzn-neutral-',
  '--vzn-blue-',
  '--vzn-red-',
  '--vzn-green-',
  '--vzn-amber-',
  '--vzn-tone-',
  '--vzn-surface-',
  '--vzn-text-',
  '--vzn-action-',
  '--vzn-success-',
  '--vzn-warning-',
  '--vzn-danger-',
  '--vzn-accent-',
  '--vzn-send-',
]
const colorTokenNames = new Set([
  '--vzn-app-bg',
  '--vzn-bg',
  '--vzn-canvas',
  '--vzn-titlebar-bg',
  '--vzn-sidebar-bg',
  '--vzn-chat-sidebar-bg',
  '--vzn-surface',
  '--vzn-text',
  '--vzn-border',
  '--vzn-border-strong',
  '--vzn-divider',
  '--vzn-titlebar-material',
  '--vzn-primary-nav-material',
  '--vzn-context-nav-material',
  '--vzn-overlay-material',
  '--vzn-material-border',
  '--vzn-material-highlight',
  '--vzn-user-avatar-bg',
  '--vzn-user-avatar-fg',
  '--vzn-assistant-avatar-bg',
  '--vzn-action',
  '--vzn-focus-ring',
  '--vzn-success',
  '--vzn-warning',
  '--vzn-danger',
  '--vzn-disabled-bg',
  '--vzn-disabled-border',
  '--vzn-disabled-fg',
  '--vzn-accent',
  '--vzn-skeleton',
])

function isColorToken(name) {
  return colorTokenNames.has(name) || colorTokenPrefixes.some((prefix) => name.startsWith(prefix))
}

const requiredTokens = [
  '--vzn-surface',
  '--vzn-text',
  '--vzn-action',
  '--vzn-danger',
  '--vzn-disabled-bg',
  '--vzn-space-4',
  '--vzn-radius-control',
  '--vzn-control-height-xs',
  '--vzn-control-height-md',
  '--vzn-brand-mark-sm',
  '--vzn-brand-mark-lg',
  '--vzn-chat-message-end-clearance',
  '--vzn-shadow-overlay',
  '--vzn-duration-fast',
]

for (const token of requiredTokens) {
  if (!tokenSource.includes(`${token}:`)) violations.push(`tokens.css is missing ${token}`)
}

for (const entry of ['src/main.tsx', 'src/quick-chat-main.tsx']) {
  const source = await readFile(path.join(root, entry), 'utf8')
  const codexIndex = source.indexOf("./styles/codex.css")
  const chatIndex = source.indexOf("./styles/chat.css")
  const tokenIndex = source.indexOf("./styles/tokens.css")
  if (codexIndex < 0 || chatIndex < codexIndex || tokenIndex < chatIndex) {
    violations.push(`${entry} must load codex.css, chat.css, then tokens.css in ownership order`)
  }
}

for (const section of ['/* Chat ', '/* Codex-style new-chat composition.', '/* Model picker ']) {
  if (!chatStyleSource.includes(section)) violations.push(`chat.css is missing ownership section ${section}`)
}

if (/#[\da-f]{3,8}\b|rgba?\(/i.test(chatStyleSource)) {
  violations.push('chat.css contains a literal color; define it in tokens.css')
}

for (const selector of ['.chat-composer', '.chat-empty-state', '.chat-page', '.model-picker', '.prompt-card']) {
  if (legacyStyleSource.includes(selector)) {
    violations.push(`codex.css still owns ${selector}; keep AI Chat page styles in chat.css`)
  }
}

const chatSidebarStyleContracts = [
  'border-right: var(--vzn-border-width) solid var(--vzn-border-strong)',
  'background: var(--vzn-surface);\n  box-shadow: inset 0 0 0 1px var(--vzn-divider)',
  'background: var(--vzn-surface-hover);\n  box-shadow: inset 0 0 0 1px var(--vzn-border-strong)',
  'background: var(--vzn-action-soft);\n  box-shadow: inset 0 0 0 1px var(--vzn-action-border)',
]

for (const contract of chatSidebarStyleContracts) {
  if (!normalizedLegacyStyleSource.includes(contract)) {
    violations.push(`codex.css is missing AI Chat sidebar semantic style contract: ${contract}`)
  }
}

const chatScrollerStyleContracts = [
  'scroll-padding-block: var(--vzn-space-6) var(--vzn-chat-message-end-clearance)',
  'flex: 0 0 var(--vzn-chat-message-end-clearance)',
]

for (const contract of chatScrollerStyleContracts) {
  if (!chatStyleSource.includes(contract)) {
    violations.push(`chat.css is missing active-chat bottom-clearance contract: ${contract}`)
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectFiles(target)
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [target] : []
  }))
  return nested.flat()
}

async function collectStyleFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectStyleFiles(target)
    return entry.name.endsWith('.css') ? [target] : []
  }))
  return nested.flat()
}

for (const file of await collectStyleFiles(path.join(root, 'src'))) {
  if (file === tokenFile) continue
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(/(--vzn-[\w-]+)\s*:/g)) {
    if (isColorToken(match[1])) {
      violations.push(
        `${path.relative(root, file)} redeclares canonical color token ${match[1]}; define it only in tokens.css`,
      )
    }
  }
}

const atomicDirectories = [
  'src/components/ui/atoms',
  'src/components/ui/molecules',
  'src/components/organisms',
  'src/components/templates',
]

for (const directory of atomicDirectories) {
  for (const file of await collectFiles(path.join(root, directory))) {
    const source = await readFile(file, 'utf8')
    if (/#[\da-f]{3,8}\b|rgba?\(/i.test(source)) {
      violations.push(`${path.relative(root, file)} contains a literal color; use a semantic token`)
    }
  }
}

const literalColorOwnership = [
  ['src/styles/tokens.css', 'canonical tokens'],
  ['src/index.css', 'legacy/base components'],
  ['src/styles/codex.css', 'app chrome and shared UI'],
  ['src/styles/chat.css', 'AI Chat'],
  ['src/styles/translate.css', 'AI Translate'],
]

console.log('Literal color inventory (non-blocking migration debt):')
for (const [file, owner] of literalColorOwnership) {
  const source = await readFile(path.join(root, file), 'utf8')
  const literals = source.match(/#[\da-f]{3,8}\b|rgba?\(/gi) ?? []
  console.log(`- ${file} (${owner}): ${literals.length} occurrences`)
}

if (violations.length > 0) {
  console.error('Design system contract violations:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('Design token and Atomic UI contracts are valid.')
}
