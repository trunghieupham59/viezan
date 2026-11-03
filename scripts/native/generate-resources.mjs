import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

// One-way adapter: existing product locales/tokens -> both native presentations.
const root = path.resolve(import.meta.dirname, '../..')
const css = fs.readFileSync(path.join(root, 'resources/tokens.css'), 'utf8')
const metric = (name) => {
  const value = css.match(new RegExp(`${name}:\\s*([\\d.]+)px;`))?.[1]
  if (!value) throw new Error(`Missing scalar native metric ${name}`)
  return Number(value)
}
const metrics = Object.fromEntries(Object.entries({
  trafficLights: '--vzn-titlebar-mac-controls-width', titlebar: '--vzn-titlebar-height',
  hairline: '--vzn-border-width', tight: '--vzn-space-1', small: '--vzn-space-2', gap: '--vzn-space-3', inset: '--vzn-space-4',
  gutter: '--vzn-space-6', large: '--vzn-space-8', radius: '--vzn-radius-md',
  compactSidebar: '--vzn-sidebar-compact-expanded-width', sidebar: '--vzn-sidebar-expanded-width', reading: '--vzn-chat-reading-max',
  editor: '--vzn-chat-textarea-max-height', control: '--vzn-control-height-md',
  rail: '--vzn-sidebar-width', compact: '--vzn-navigation-compact-breakpoint',
  minWindowWidth: '--vzn-native-window-min-width', minWindowHeight: '--vzn-native-window-min-height',
  compactControl: '--vzn-control-height-sm', surfaceRadius: '--vzn-radius-xl', largeRadius: '--vzn-radius-lg', controlRadius: '--vzn-radius-control', composerMinimum: '--vzn-composer-min-height',
  navControl: '--vzn-control-height-lg', icon: '--vzn-space-5', brand: '--vzn-space-8', hero: '--vzn-space-12', notificationInline: '--vzn-notification-max-inline',
}).map(([key, name]) => [key, metric(name)]))
// Motion durations in ms become seconds, the unit SwiftUI and Qt animations take.
const duration = (name) => {
  const value = css.match(new RegExp(`${name}:\\s*([\\d.]+)ms;`))?.[1]
  if (!value) throw new Error(`Missing native duration ${name}`)
  return Number(value) / 1000
}
Object.assign(metrics, Object.fromEntries(Object.entries({
  durationFast: '--vzn-duration-fast', durationNormal: '--vzn-duration-normal',
}).map(([key, name]) => [key, duration(name)])))
// Unitless ratios and scales for native layout (no px): read verbatim.
const ratio = (name) => {
  const value = css.match(new RegExp(`${name}:\\s*([\\d.]+);`))?.[1]
  if (!value) throw new Error(`Missing native ratio ${name}`)
  return Number(value)
}
Object.assign(metrics, Object.fromEntries(Object.entries({
  launcherTop: '--vzn-native-launcher-top-fraction', launcherHeight: '--vzn-native-launcher-height-fraction', launcherResults: '--vzn-native-launcher-results-fraction',
  toastSeconds: '--vzn-native-toast-seconds', skeletonShort: '--vzn-native-skeleton-short-fraction', quickCard: '--vzn-native-quick-card-fraction', inventorySplit: '--vzn-native-inventory-fraction', thermalScaleMax: '--vzn-native-thermal-scale-max',
  composerMaxLines: '--vzn-composer-max-lines',
  bubbleFraction: '--vzn-native-bubble-fraction',
}).map(([key, name]) => [key, ratio(name)])))
// Type roles as ratios to body (md) so native system fonts keep their own base size.
const fontSize = (name) => Number(css.match(new RegExp(`--vzn-font-size-${name}:\\s*calc\\(([\\d.]+)px`))?.[1])
for (const [key, role] of Object.entries({ captionScale: 'caption', smallScale: 'sm', labelScale: 'lg', sectionScale: 'title', subtitleScale: 'subtitle', titleScale: 'title-lg', headingScale: 'heading', displayScale: 'heading-lg', heroScale: 'display' })) {
  const ratio = fontSize(role) / fontSize('md')
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`Missing font role ${role}`)
  metrics[key] = Math.round(ratio * 1000) / 1000
}
// Keep native accent emphasis tied to the canonical selected-surface token.
metrics.selectionOpacity = Number(css.match(/--vzn-surface-selected:\s*rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1])
if (!Number.isFinite(metrics.selectionOpacity)) throw new Error('Missing selected surface opacity')
metrics.overlayShadowOpacity = Number(css.match(/--vzn-shadow-overlay:[^;]*rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1])
if (!Number.isFinite(metrics.overlayShadowOpacity)) throw new Error('Missing overlay shadow opacity')
const textScales = {
  medium: Number(css.match(/--vzn-text-scale:\s*([\d.]+);/)?.[1]),
}
for (const size of ['small', 'large']) {
  textScales[size] = Number(css.match(new RegExp(`:root\\[data-text-size="${size}"\\]\\s*\\{\\s*--vzn-text-scale:\\s*([\\d.]+);`))?.[1])
}
if (Object.values(textScales).some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Missing canonical text scale')
const locales = {}
for (const locale of ['vi', 'en', 'ja']) {
  const file = path.join(root, 'resources/locales', locale + '.json')
  locales[locale] = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (Object.values(locales[locale]).some(value => typeof value !== 'string')) {
    throw new Error(`Invalid native string in ${file}`)
  }
}
const keys = Object.keys(locales.vi).sort().join(',')
if (Object.values(locales).some(catalog => Object.keys(catalog).sort().join(',') !== keys)) throw new Error('Native locale parity failed')
// Graphite is the native Qt foundation palette. Resolve aliases from the source
// stylesheet and encode CSS rgba as Qt ARGB; never maintain a second color table.
const declarations = block => Object.fromEntries([...block.matchAll(/(--vzn-[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
const primitives = declarations(css.slice(0, css.indexOf('/* Palette (light)')))
const paletteBlock = (preset, mode) => css.match(new RegExp(`:root \\[data-theme="${preset}"\\]\\[data-mode="${mode}"\\]\\s*\\{([\\s\\S]*?)\\}`))?.[1]
const makePalettes = (preset, roles, accent = "auto") => Object.fromEntries(['light', 'dark'].map(mode => {
  const block = paletteBlock(preset, mode)
  if (!block) throw new Error(`Missing Graphite ${mode} palette`)
  const accentBlock = accent === 'auto' ? '' : css.match(new RegExp(`\\[data-accent="${accent}"\\]\\[data-accent\\]\\[data-mode="${mode}"\\]\\s*\\{([\\s\\S]*?)\\}`))?.[1]
  if (accent !== 'auto' && !accentBlock) throw new Error(`Missing accent ${accent}/${mode}`)
  const values = {...primitives, ...declarations(block), ...declarations(accentBlock || '')}
  values['--vzn-danger'] = css.slice(mode === 'dark' ? css.indexOf('/* Palette (dark)') : 0).match(/--vzn-danger:\s*([^;]+);/)?.[1].trim()
  for (const status of ['success', 'warning']) values[`--vzn-${status}`] = css.slice(mode === 'dark' ? css.indexOf('/* Palette (dark)') : 0).match(new RegExp(`--vzn-${status}:\\s*([^;]+);`))?.[1].trim()
  function resolve(key, seen = new Set()) {
    if (seen.has(key) || !values[key]) throw new Error(`Unresolved color ${key}`)
    seen.add(key)
    const value = values[key], alias = value.match(/^var\((--vzn-[\w-]+)\)$/)
    if (alias) return resolve(alias[1], seen)
    const rgba = value.match(/^rgba\(([^)]+)\)$/)
    if (rgba) {
      const [r,g,b,a] = rgba[1].split(',').map(Number)
      return `#${[Math.round(a * 255),r,g,b].map(n => n.toString(16).padStart(2,'0')).join('')}`
    }
    if (value === 'transparent') return '#00000000'
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Unsupported native color ${key}: ${value}`)
    return value
  }
  return [mode, Object.fromEntries(roles.map(role => [role,resolve(`--vzn-${role}`)]))]
}))
const palettes = makePalettes('graphite', ['canvas','surface','sidebar-bg','surface-hover','text','text-muted','border','border-strong','action','action-text','action-fg','surface-subtle','text-disabled','danger','success','warning'])
const chromePalettes = makePalettes('glass', ['app-bg','sidebar-bg','titlebar-bg','surface','surface-raised','border-strong','text','text-strong','text-muted','text-soft','border','divider','action-text','action-soft','action','action-hover','action-active','action-fg','surface-hover','chrome-fg-strong','chrome-fg-muted','chrome-fg-soft','chrome-accent','chrome-item-active','chrome-item-hover','chrome-fg','chrome-item-active-fg','material-border','material-highlight','primary-nav-material','titlebar-material','sidebar-search-bg','surface-muted'])
const themePalettes = {}
const themeRoles = Array.from(new Set([...Object.keys(palettes.light), ...Object.keys(chromePalettes.light)]))
for (const preset of ['graphite','glass','paper','corporate','midnight']) for (const accent of ['auto','violet','pink','teal','green','amber','red']) {
  themePalettes[preset + ':' + accent] = makePalettes(preset, themeRoles, accent)
}
// Glass chrome geometry follows the same preset as its generated colors.
for (const [key, token] of Object.entries({chromeSearchRadius: '--vzn-radius-sm', chromeShortcutRadius: '--vzn-radius-xs', chromeItemRadius: '--vzn-radius-control', chromeControlRadius: '--vzn-radius-control', chromeCardRadius: '--vzn-radius-md', chromeSurfaceRadius: '--vzn-radius-xl'})) {
  const value = declarations(paletteBlock('glass', 'light'))[token]
  if (!/^\d+(?:\.\d+)?px$/.test(value)) throw new Error(`Missing Glass metric ${token}`)
  metrics[key] = Number(value.slice(0, -2))
}
// Compile the existing product prompt policy to inert native resources; no JS evaluator ships.
const promptSource = fs.readFileSync(path.join(root, 'contracts/native-workbench/translation-policy.ts'), 'utf8')
const promptCode = stripTypeScriptTypes(promptSource).replace(/^import .*$/gm, '').replace(/export /g, '')
const promptContext = { hasOwnKey: (object, key) => Object.hasOwn(object, key) }
vm.createContext(promptContext)
vm.runInContext(promptCode + '\nglobalThis.policy = {SYSTEM_PROMPT, REWRITE_SYSTEM_PROMPT, buildPrompt, buildRewritePrompt}', promptContext, {timeout: 1000})
const translationTemplates = {}
const nativeLanguages = ['en','vi','ja','zh','zh-TW','ko','fr','de','es','pt','ru','ar','th','id','it','nl','pl','tr','hi']
for (const target of nativeLanguages) for (const style of ['general','formal','casual','business','technical','natural']) {
  const marker = '{{VIEZAN_INPUT}}'
  for (const mode of ['translate','annotate','phonetic','rewrite']) {
    if (target === 'ja' && (mode === 'translate' || mode === 'annotate')) {
      translationTemplates[`${target}:${style}:${mode}:honorific`] = promptContext.policy.buildPrompt('Tanaka-san\n' + marker, 'auto', target, mode === 'annotate', style).replace('\n\nTanaka-san\n' + marker, '\n\n' + marker)
    }
    translationTemplates[`${target}:${style}:${mode}`] = mode === 'rewrite'
      ? promptContext.policy.buildRewritePrompt(marker, target, style)
      : promptContext.policy.buildPrompt(marker, 'auto', target, mode !== 'translate', style, mode === 'phonetic', mode === 'phonetic' ? 'phonetic' : 'standard')
  }
}
const resources = {
  chatPrompt: JSON.parse(fs.readFileSync(path.join(root, "contracts/native-workbench/chat-prompt.json"), "utf8")),
  reasoningPolicy: JSON.parse(fs.readFileSync(path.join(root, "contracts/native-workbench/reasoning-policy.json"), "utf8")),
  imageTranslationPrompt: JSON.parse(fs.readFileSync(path.join(root, "contracts/native-workbench/image-translation.json"), "utf8")).prompt,
  nativeLanguages, translationTemplates, translationSystem: promptContext.policy.SYSTEM_PROMPT, rewriteSystem: promptContext.policy.REWRITE_SYSTEM_PROMPT,
  schemaVersion: 1, metrics, palettes, chromePalettes, themePalettes, textScales, locales,
  navigation: [
    {id: 'home', title: 'home', systemImage: 'house', icon: 'home'},
    {id: 'chat', title: 'chat', systemImage: 'bubble.left.and.bubble.right', icon: 'chat'},
    {id: 'translate', title: 'translate', systemImage: 'character.bubble', icon: 'translate'},
    {id: "interpret", title: "interpret", systemImage: "mic", icon: "interpret"},
    {id: 'dictionary', title: 'dictionary', systemImage: 'book.closed', icon: 'dictionary'},
    {id: 'everywhere', title: 'everywhere', systemImage: 'globe', icon: 'everywhere'},
    {id: "apps", title: "apps", systemImage: "square.grid.2x2", icon: "apps"},
    {id: 'thermal', title: 'thermal', systemImage: 'thermometer.medium', icon: 'thermal'},
    {id: 'utilities', title: 'utilities', systemImage: 'keyboard', icon: 'utilities'},
    {id: 'settings', title: 'settings', systemImage: 'slider.horizontal.3', icon: 'settings'},
  ],
  commands: [
    // Review 18 palette order: destinations in sidebar order, then actions.
    {id: 'home', title: 'home', systemImage: 'house', icon: 'home', shortcut: '0'},
    {id: 'chat', title: 'chat', systemImage: 'bubble.left.and.bubble.right', icon: 'chat', shortcut: '1'},
    {id: 'translate', title: 'translate', systemImage: 'character.bubble', icon: 'translate', shortcut: '2'},
    {id: "interpret", title: "interpret", systemImage: "mic", icon: "interpret", shortcut: ""},
    {id: 'dictionary', title: 'dictionary', systemImage: 'book.closed', icon: 'dictionary', shortcut: '3'},
    {id: 'everywhere', title: 'everywhere', systemImage: 'globe', icon: 'everywhere', shortcut: ''},
    {id: "apps", title: "apps", systemImage: "square.grid.2x2", icon: "apps", shortcut: ""},
    {id: 'thermal', title: 'thermal', systemImage: 'thermometer.medium', icon: 'thermal', shortcut: ''},
    {id: 'utilities', title: 'utilities', systemImage: 'keyboard', icon: 'utilities', shortcut: ''},
    {id: 'settings', title: 'settings', systemImage: 'slider.horizontal.3', icon: 'settings', shortcut: ','},
    {id: 'new', title: 'newWork', systemImage: 'plus', icon: 'new', shortcut: 'N'},
    {id: 'history', title: 'history', systemImage: 'clock', icon: 'history', shortcut: 'Shift+H'},
    {id: 'activity', title: 'activity', systemImage: 'waveform.path', icon: 'activity', shortcut: 'Shift+A'},
    {id: 'navigation', title: 'toggleNavigation', systemImage: 'sidebar.left', icon: 'expand', shortcut: '\\'},
  ],
  settingsSections: [
    {id: 'general', title: 'generalTitle', description: 'generalDescription', terms: ['language', 'recoveryTitle', 'recoveryDescription']},
    {id: 'appearance', title: 'appearanceTitle', description: 'appearanceDescription', terms: ['themeMode', 'themeDescription', 'themeLight', 'themeDark', 'themeSystem', 'readingSize', 'readingSizeDescription']},
    {id: 'providers', title: 'providerSettings', description: 'keyStorageHint', terms: ['provider', 'apiKey', 'modelID']},
    {id: "localModels", title: "localModels", description: "localModelsHint", terms: ["downloadModel", "deleteModel"]},
    {id: "voice", title: "voiceTitle", description: "voiceDescription", terms: ["speechProvider", "voiceProvider", "voiceID"]},
    {id: "modules", title: "modulesTitle", description: "modulesDescription", terms: ["chat", "translate", "interpret", "thermal", "apps"]},
    {id: "desktop", title: "utilities", description: "shortcutPlatformHint", terms: ["quickChat", "translateSelection", "launcher"]},
    {id: "data", title: "backupTitle", description: "backupDescription", terms: ["exportBackup", "importBackup"]},
    {id: "updates", title: "updatesTitle", description: "updatesHint", terms: ["checkUpdates", "downloadUpdate", "releaseNotes"]},
    {id: 'about', title: 'aboutTitle', description: 'aboutDescription', terms: ['previewScopeTitle', 'previewScopeDescription', 'localDataTitle', 'settingsInfo']},
  ],
  fixtures: JSON.parse(fs.readFileSync(path.join(root, 'contracts/native-workbench/fixtures.json'), 'utf8')),
}
const output = `${JSON.stringify(resources, null, 2)}\n`
for (const relative of ['apps/macos/Sources/ViezanDomain/Resources/native.json', 'apps/desktop-qt/qml/native.json']) {
  const destination = path.join(root, relative)
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== output) throw new Error(`Stale native resources: ${relative}`)
  } else if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== output) {
    // Preserve timestamps so a dev reload does not invalidate unchanged resources.
    fs.writeFileSync(destination, output)
  }
}
const brandSource = path.join(root, 'public/icon.png')
const qtBrand = path.join(root, 'apps/desktop-qt/qml/brand.png')
if (process.argv.includes('--check')) {
  if (!fs.readFileSync(brandSource).equals(fs.readFileSync(qtBrand))) throw new Error('Stale Qt brand asset')
} else if (!fs.existsSync(qtBrand) || !fs.readFileSync(brandSource).equals(fs.readFileSync(qtBrand))) {
  fs.copyFileSync(brandSource, qtBrand)
}
console.log(`Native resources ${process.argv.includes('--check') ? 'verified' : 'generated'}: 3 locales, ${Object.keys(metrics).length} metrics.`)
