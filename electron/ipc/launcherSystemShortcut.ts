/**
 * macOS system shortcut conflicts for the Launcher hotkey.
 *
 * `globalShortcut.register('Command+Space')` succeeds on macOS even while Spotlight owns
 * the combination, but the system handler wins and the Launcher never opens. The
 * system's symbolic hotkeys live in the `com.apple.symbolichotkeys` preference domain,
 * which is read here (read-only) so Settings can explain the conflict and point the user
 * at the right pane instead of silently doing nothing.
 */
import { exec, execFile } from 'node:child_process'

/** How long the `defaults` + `plutil` pipeline may take before the check is abandoned (ms). */
const READ_TIMEOUT_MS = 3_000
const READ_COMMAND = 'defaults export com.apple.symbolichotkeys - | plutil -convert json -o - -'
const SYMBOLIC_HOTKEYS_DOMAIN = 'com.apple.symbolichotkeys'
/** AppleSymbolicHotKeys id of "Show Spotlight search". */
export const SPOTLIGHT_HOTKEY_ID = '64'
/** Spotlight's factory parameters: [character, key code (Space), modifier flags (Command)]. */
const SPOTLIGHT_DEFAULT_PARAMETERS = [65535, 49, 0x100000] as const
/**
 * Apple's (private) tool that makes the system re-read symbolic hotkeys without a logout.
 * It has shipped unchanged for many releases; when it is missing or fails the change still
 * lands in the preference file and applies at the next login.
 */
const ACTIVATE_SETTINGS_BIN = '/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings'
const WRITE_TIMEOUT_MS = 5_000

/** Who owns a conflicting system shortcut. */
export type SystemShortcutOwner = 'spotlight' | 'finder-search' | 'system'

export interface SystemShortcutConflict {
  owner: SystemShortcutOwner
  accelerator: string
}

/** Well-known AppleSymbolicHotKeys ids. Anything else enabled and matching is reported as `system`. */
const OWNER_BY_ID: Record<string, SystemShortcutOwner> = {
  '64': 'spotlight',       // Show Spotlight search
  '65': 'finder-search',   // Show Finder search window
}

/** NSEvent modifier flags as stored in the symbolic hotkey parameters. */
const MOD_SHIFT = 0x20000
const MOD_CONTROL = 0x40000
const MOD_OPTION = 0x80000
const MOD_COMMAND = 0x100000
const MOD_MASK = MOD_SHIFT | MOD_CONTROL | MOD_OPTION | MOD_COMMAND

/** Virtual key codes (ANSI layout) for the keys an Electron accelerator can name. */
const KEY_CODES: Record<string, number> = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15,
  y: 16, t: 17, '1': 18, '2': 19, '3': 20, '4': 21, '6': 22, '5': 23, '=': 24, '9': 25, '7': 26,
  '-': 27, '8': 28, '0': 29, ']': 30, o: 31, u: 32, '[': 33, i: 34, p: 35, l: 37, j: 38, "'": 39,
  k: 40, ';': 41, '\\': 42, ',': 43, '/': 44, n: 45, m: 46, '.': 47, tab: 48, space: 49, '`': 50,
  backspace: 51, escape: 53, esc: 53, return: 36, enter: 36,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
  left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121, delete: 117,
}

const MODIFIER_FLAGS: Record<string, number> = {
  command: MOD_COMMAND, cmd: MOD_COMMAND, commandorcontrol: MOD_COMMAND, cmdorctrl: MOD_COMMAND,
  control: MOD_CONTROL, ctrl: MOD_CONTROL,
  alt: MOD_OPTION, option: MOD_OPTION,
  shift: MOD_SHIFT,
}

export interface MacKeyCombination {
  keyCode: number
  modifiers: number
}

/** Translate an Electron accelerator into the macOS key code + modifier flags, or null when a part is unknown. */
export function acceleratorToMacKey(accelerator: string): MacKeyCombination | null {
  const parts = accelerator.split('+').map((part) => part.trim().toLowerCase()).filter(Boolean)
  const key = parts.pop()
  if (key === undefined) return null
  const keyCode = KEY_CODES[key]
  if (keyCode === undefined) return null
  let modifiers = 0
  for (const part of parts) {
    const flag = MODIFIER_FLAGS[part]
    if (flag === undefined) return null
    modifiers |= flag
  }
  return { keyCode, modifiers }
}

interface SymbolicHotKeyEntry {
  enabled?: unknown
  value?: { parameters?: unknown }
}

function entryKey(entry: SymbolicHotKeyEntry): MacKeyCombination | null {
  const params = entry.value?.parameters
  if (!Array.isArray(params) || params.length < 3) return null
  const keyCode = params[1]
  const flags = params[2]
  if (typeof keyCode !== 'number' || typeof flags !== 'number') return null
  return { keyCode, modifiers: flags & MOD_MASK }
}

/**
 * Find an enabled system shortcut that uses `accelerator`. `hotkeys` is the parsed JSON of
 * the `com.apple.symbolichotkeys` domain (`{ AppleSymbolicHotKeys: { [id]: entry } }`).
 */
export function findSystemShortcutConflict(hotkeys: unknown, accelerator: string): SystemShortcutConflict | null {
  const wanted = acceleratorToMacKey(accelerator)
  if (!wanted) return null
  const table = (hotkeys as { AppleSymbolicHotKeys?: unknown } | null)?.AppleSymbolicHotKeys
  if (!table || typeof table !== 'object') return null

  let fallback: SystemShortcutConflict | null = null
  for (const [id, raw] of Object.entries(table as Record<string, SymbolicHotKeyEntry>)) {
    if (!raw || typeof raw !== 'object' || raw.enabled !== true) continue
    const key = entryKey(raw)
    if (!key || key.keyCode !== wanted.keyCode || key.modifiers !== wanted.modifiers) continue
    const owner = OWNER_BY_ID[id]
    if (owner) return { owner, accelerator }
    fallback ??= { owner: 'system', accelerator }
  }
  return fallback
}

function readSymbolicHotKeys(): Promise<unknown> {
  return new Promise((resolve) => {
    exec(READ_COMMAND, { timeout: READ_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        console.warn('[LauncherShortcut] Could not read system shortcuts:', error.killed ? 'timed out' : error.message)
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(String(stdout)))
      } catch {
        resolve(null)
      }
    })
  })
}

/**
 * Whether macOS itself handles `accelerator`. Resolves null on other platforms, when the
 * preference domain cannot be read, or when nothing conflicts.
 */
export async function detectSystemShortcutConflict(
  accelerator: string,
  platform: NodeJS.Platform = process.platform,
): Promise<SystemShortcutConflict | null> {
  if (platform !== 'darwin' || !accelerator) return null
  return findSystemShortcutConflict(await readSymbolicHotKeys(), accelerator)
}

// ── Spotlight shortcut toggle ─────────────────────────────────────────────────

export interface SpotlightShortcutState {
  /** Whether macOS has the Spotlight search shortcut turned on. */
  enabled: boolean
  /** Whether that shortcut is Command+Space (the Launcher default). */
  holdsCommandSpace: boolean
}

function spotlightEntry(hotkeys: unknown): SymbolicHotKeyEntry | null {
  const table = (hotkeys as { AppleSymbolicHotKeys?: unknown } | null)?.AppleSymbolicHotKeys
  if (!table || typeof table !== 'object') return null
  const entry = (table as Record<string, unknown>)[SPOTLIGHT_HOTKEY_ID]
  return entry && typeof entry === 'object' ? (entry as SymbolicHotKeyEntry) : null
}

/** Read the Spotlight shortcut state from parsed `com.apple.symbolichotkeys` data. */
export function spotlightStateFrom(hotkeys: unknown): SpotlightShortcutState {
  const entry = spotlightEntry(hotkeys)
  // macOS omits the entry entirely while Spotlight still uses its factory shortcut.
  if (!entry) return { enabled: true, holdsCommandSpace: true }
  const key = entryKey(entry) ?? { keyCode: SPOTLIGHT_DEFAULT_PARAMETERS[1], modifiers: SPOTLIGHT_DEFAULT_PARAMETERS[2] }
  return {
    enabled: entry.enabled !== false,
    holdsCommandSpace: key.keyCode === SPOTLIGHT_DEFAULT_PARAMETERS[1] && key.modifiers === SPOTLIGHT_DEFAULT_PARAMETERS[2],
  }
}

export async function readSpotlightShortcutState(platform: NodeJS.Platform = process.platform): Promise<SpotlightShortcutState | null> {
  if (platform !== 'darwin') return null
  const hotkeys = await readSymbolicHotKeys()
  return hotkeys ? spotlightStateFrom(hotkeys) : null
}

/** The `<dict>` written for the Spotlight entry: only `enabled` changes, its key combination is kept. */
export function spotlightEntryPlist(enabled: boolean, parameters: readonly number[]): string {
  const safe = parameters.length === 3 && parameters.every((n) => Number.isInteger(n) && n >= 0)
    ? parameters : SPOTLIGHT_DEFAULT_PARAMETERS
  const integers = safe.map((n) => `<integer>${n}</integer>`).join('')
  return `<dict><key>enabled</key><${enabled ? 'true' : 'false'}/><key>value</key><dict><key>parameters</key><array>${integers}</array><key>type</key><string>standard</string></dict></dict>`
}

function run(file: string, args: readonly string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(file, [...args], { timeout: WRITE_TIMEOUT_MS }, (error) => {
      if (error) console.warn(`[LauncherShortcut] ${file} failed:`, error.killed ? 'timed out' : error.message)
      resolve(!error)
    })
  })
}

export interface SpotlightToggleResult {
  /** The preference was written. */
  ok: boolean
  /** The running system picked the change up; false means it applies at the next login. */
  applied: boolean
}

/**
 * Turn the macOS Spotlight search shortcut on or off for the current user. Writes only
 * the `enabled` flag of the Spotlight entry (its key combination is preserved) and asks
 * the system to reload its shortcuts. Never needs administrator rights.
 */
export async function setSpotlightShortcutEnabled(
  enabled: boolean,
  platform: NodeJS.Platform = process.platform,
): Promise<SpotlightToggleResult> {
  if (platform !== 'darwin') return { ok: false, applied: false }
  const current = spotlightEntry(await readSymbolicHotKeys())
  const params = current?.value?.parameters
  const parameters = Array.isArray(params) && params.every((n) => typeof n === 'number') ? (params as number[]) : [...SPOTLIGHT_DEFAULT_PARAMETERS]
  const ok = await run('defaults', ['write', SYMBOLIC_HOTKEYS_DOMAIN, 'AppleSymbolicHotKeys', '-dict-add', SPOTLIGHT_HOTKEY_ID, spotlightEntryPlist(enabled, parameters)])
  if (!ok) return { ok: false, applied: false }
  const applied = await run(ACTIVATE_SETTINGS_BIN, ['-u'])
  return { ok: true, applied }
}
