/**
 * Global Hotkey — translate selected text in ANY app by pressing a custom shortcut.
 *
 * Flow when hotkey fires:
 *   1. Snapshot the clipboard (text, HTML, RTF, image) and clear it - unless it holds
 *      formats we cannot restore (files, Excel...), in which case it is left untouched
 *   2. Simulate Cmd+C / Ctrl+C to copy selected text from the foreground app
 *   3. Poll the clipboard (up to ~1 s) for the copied text
 *   4. Read selected text from clipboard
 *   5. Translate using stored provider/model/language settings
 *   6. Write translated text to clipboard
 *   7. Simulate Cmd+V / Ctrl+V to paste (replacing original selection)
 *   8. Restore the original clipboard after 1.5 s (only if the user has not
 *      copied something else in the meantime)
 *
 * Also supports an AI Chat hotkey that toggles the standalone quick chat window.
 */
import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app, type BrowserWindow, clipboard, globalShortcut, type NativeImage } from 'electron'
import {
  type HotkeyIndicatorLanguage,
  hideHotkeyIndicator,
  isHotkeyIndicatorLanguage,
  setHotkeyIndicatorLanguage,
  showHotkeyIndicator,
} from './hotkeyIndicator'
import { EXT_DEFAULT_GEMINI_MODEL } from './ipcConstants'
import { isNonEmptyString, isRecord, isSafeLanguageCode, isSafeTargetLanguageCode } from './ipcValidation'
import { lightweightTranslate } from './lightweightTranslate'
import { isValidProvider } from './providers/types'

/** Short settle after the copy keystroke helper exits, before polling the clipboard (ms) */
const CLIPBOARD_COPY_SETTLE_MS = 30
/** Clipboard poll interval while waiting for the target app to publish the copy (ms) */
const CLIPBOARD_COPY_POLL_MS = 50
/** Give slow targets (Office delayed rendering, big selections, RDP) up to this long to copy (ms) */
const CLIPBOARD_COPY_TIMEOUT_MS = 1_000
/** Thời gian chờ sau khi gửi Cmd+V để paste hoàn thành (ms) */
const CLIPBOARD_PASTE_WAIT_MS = 100
/** Thời gian trước khi restore clipboard sau khi paste (ms) */
const CLIPBOARD_RESTORE_WAIT_MS = 1_500
/** Upper bound for the OS keystroke helpers (powershell / osascript / xdotool can hang). */
const KEYSTROKE_EXEC_TIMEOUT_MS = 5_000
const MAX_ACCELERATOR_CHARS = 64
const MAX_MODEL_CHARS = 200

// ── Types ────────────────────────────────────────────────────────────────────

export interface HotkeySettings {
  hotkey: string       // Electron accelerator, e.g. "CommandOrControl+Shift+T"
  enabled: boolean
  provider: string     // 'gemini' | 'claude' | 'openai'
  model: string
  sourceLang: string   // 'auto' or BCP-47 code
  targetLang: string   // BCP-47 code
  /** UI language for the hotkey indicator copy (pushed by the renderer). */
  uiLanguage?: HotkeyIndicatorLanguage
}

export interface AIChatHotkeySettings {
  hotkey: string   // Electron accelerator, e.g. "Alt+Shift+C"
  enabled: boolean
}

type HotkeyFailureCode = 'INVALID' | 'IN_USE' | 'CONFLICT'

export interface HotkeyUpdateFailure {
  success: false
  error: string
  errorCode: HotkeyFailureCode
  /** The settings that remain in effect (unchanged by the failed update). */
  settings?: HotkeySettings | AIChatHotkeySettings
}

// ── Accelerator validation ───────────────────────────────────────────────────

const ACCELERATOR_MODIFIER =
  '(?:CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta)'
const ACCELERATOR_KEY = [
  // Any single printable ASCII key except '+' (the separator; spelled `Plus`). This covers
  // letters, digits, punctuation and the shifted symbols the renderer recorder sends (`!`, `?`).
  '[!-*,-~]',
  'F(?:[1-9]|1[0-9]|2[0-4])',
  'Space|Tab|Backspace|Delete|Insert|Return|Enter|Escape|Esc|Plus',
  'Up|Down|Left|Right|Home|End|PageUp|PageDown',
  'num(?:[0-9]|dec|add|sub|mult|div)',
  'Media(?:PlayPause|NextTrack|PreviousTrack|Stop)',
  'Volume(?:Up|Down|Mute)',
  'PrintScreen|CapsLock|NumLock|ScrollLock',
].join('|')
const ACCELERATOR_PATTERN = new RegExp(`^(?:${ACCELERATOR_MODIFIER}\\+)+(?:${ACCELERATOR_KEY})$`, 'i')

/**
 * True for a plausible Electron accelerator: one or more modifiers followed by a
 * single key (a bare F1-F24 key is also accepted). A bare printable key would hijack
 * ordinary typing system-wide, so it is rejected.
 */
export function isValidAccelerator(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ACCELERATOR_CHARS) return false
  if (ACCELERATOR_PATTERN.test(value)) return true
  return /^F(?:[1-9]|1[0-9]|2[0-4])$/i.test(value)
}

const ACCELERATOR_ALIASES: Record<string, string> = {
  cmdorctrl: 'commandorcontrol',
  cmd: 'command',
  ctrl: 'control',
  option: 'alt',
  esc: 'escape',
  enter: 'return',
}

/** Canonical form used to compare accelerators that spell the same combination differently. */
export function normalizeAccelerator(accelerator: string): string {
  const parts = accelerator.toLowerCase().split('+').filter(Boolean)
  const key = parts.pop() ?? ''
  const modifiers = parts.map(part => ACCELERATOR_ALIASES[part] ?? part)
  return [...new Set(modifiers)].sort().concat(ACCELERATOR_ALIASES[key] ?? key).join('+')
}

function sameAccelerator(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && normalizeAccelerator(a) === normalizeAccelerator(b)
}

// ── Persistence ───────────────────────────────────────────────────────────────

const SETTINGS_FILE = 'hotkey-settings.json'
const CHAT_SETTINGS_FILE = 'ai-chat-hotkey-settings.json'

const DEFAULT_SETTINGS: HotkeySettings = {
  hotkey: '',
  enabled: false,
  provider: 'gemini',
  model: EXT_DEFAULT_GEMINI_MODEL,
  sourceLang: 'auto',
  targetLang: 'en',
}

const DEFAULT_CHAT_SETTINGS: AIChatHotkeySettings = {
  hotkey: '',
  enabled: false,
}

let currentSettings: HotkeySettings = { ...DEFAULT_SETTINGS }
let currentChatSettings: AIChatHotkeySettings = { ...DEFAULT_CHAT_SETTINGS }
/** Accelerators actually registered with Electron (may differ from persisted settings). */
let registeredTranslateAccelerator = ''
let registeredChatAccelerator = ''

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

function getChatSettingsPath(): string {
  return path.join(app.getPath('userData'), CHAT_SETTINGS_FILE)
}

type PatchResult<T> = { ok: true; patch: Partial<T> } | { ok: false; error: string }

/** Validate the `enabled` / `hotkey` fields common to the translate and AI Chat shortcuts. */
function parseSharedHotkeyFields(
  raw: Record<string, unknown>,
  patch: { enabled?: boolean; hotkey?: string },
): { ok: false; error: string } | null {
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== 'boolean') return { ok: false, error: 'Invalid "enabled" value.' }
    patch.enabled = raw.enabled
  }
  if (raw.hotkey !== undefined) {
    if (raw.hotkey !== '' && !isValidAccelerator(raw.hotkey)) return { ok: false, error: 'Invalid hotkey combination.' }
    patch.hotkey = raw.hotkey as string
  }
  return null
}

/**
 * Whitelist and type-check a translate-hotkey settings payload. Unknown keys are
 * ignored; `undefined` (and an empty provider/model, which the renderer can send
 * before a model is chosen) means "leave unchanged".
 */
function parseTranslateSettingsPatch(raw: unknown): PatchResult<HotkeySettings> {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid hotkey settings payload.' }
  const patch: Partial<HotkeySettings> = {}

  const sharedError = parseSharedHotkeyFields(raw, patch)
  if (sharedError) return sharedError
  if (raw.provider !== undefined && raw.provider !== '') {
    if (!isNonEmptyString(raw.provider) || !isValidProvider(raw.provider.trim())) {
      return { ok: false, error: 'Invalid provider.' }
    }
    patch.provider = raw.provider.trim()
  }
  if (raw.model !== undefined && raw.model !== '') {
    if (!isNonEmptyString(raw.model) || raw.model.length > MAX_MODEL_CHARS) return { ok: false, error: 'Invalid model.' }
    patch.model = raw.model.trim()
  }
  if (raw.sourceLang !== undefined) {
    if (!isSafeLanguageCode(raw.sourceLang)) return { ok: false, error: 'Invalid source language.' }
    patch.sourceLang = raw.sourceLang
  }
  if (raw.targetLang !== undefined) {
    if (!isSafeTargetLanguageCode(raw.targetLang)) return { ok: false, error: 'Invalid target language.' }
    patch.targetLang = raw.targetLang
  }
  if (raw.uiLanguage !== undefined) {
    if (!isHotkeyIndicatorLanguage(raw.uiLanguage)) return { ok: false, error: 'Invalid UI language.' }
    patch.uiLanguage = raw.uiLanguage
  }
  return { ok: true, patch }
}

function parseChatSettingsPatch(raw: unknown): PatchResult<AIChatHotkeySettings> {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid hotkey settings payload.' }
  const patch: Partial<AIChatHotkeySettings> = {}
  const sharedError = parseSharedHotkeyFields(raw, patch)
  if (sharedError) return sharedError
  return { ok: true, patch }
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return undefined
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/**
 * Keep every valid field of a persisted payload and drop only the invalid ones, so one
 * bad or newly-unsupported value does not reset the user's whole saved configuration.
 */
function parsePersistedFields<T>(
  raw: unknown,
  keys: readonly (keyof T & string)[],
  parse: (value: unknown) => PatchResult<T>,
): Partial<T> {
  if (!isRecord(raw)) return {}
  const merged: Partial<T> = {}
  for (const key of keys) {
    const parsed = parse({ [key]: raw[key] })
    if (parsed.ok) Object.assign(merged, parsed.patch)
  }
  return merged
}

const TRANSLATE_SETTING_KEYS = ['enabled', 'hotkey', 'provider', 'model', 'sourceLang', 'targetLang', 'uiLanguage'] as const
const CHAT_SETTING_KEYS = ['enabled', 'hotkey'] as const

/** Persisted values are re-validated field by field: invalid fields fall back to defaults. */
function loadSettings(): HotkeySettings {
  try {
    const patch = parsePersistedFields<HotkeySettings>(readJsonFile(getSettingsPath()), TRANSLATE_SETTING_KEYS, parseTranslateSettingsPatch)
    const settings = { ...DEFAULT_SETTINGS, ...patch }
    // A hotkey that was dropped as invalid cannot stay "enabled".
    if (!settings.hotkey) settings.enabled = false
    return settings
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function loadChatSettings(): AIChatHotkeySettings {
  try {
    const patch = parsePersistedFields<AIChatHotkeySettings>(readJsonFile(getChatSettingsPath()), CHAT_SETTING_KEYS, parseChatSettingsPatch)
    const settings = { ...DEFAULT_CHAT_SETTINGS, ...patch }
    if (!settings.hotkey) settings.enabled = false
    return settings
  } catch {
    return { ...DEFAULT_CHAT_SETTINGS }
  }
}

function saveSettings(settings: HotkeySettings): void {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (e) {
    console.error('[GlobalHotkey] Failed to save settings:', e)
  }
}

function saveChatSettings(settings: AIChatHotkeySettings): void {
  try {
    fs.writeFileSync(getChatSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (e) {
    console.error('[GlobalHotkey] Failed to save chat hotkey settings:', e)
  }
}

// ── OS-level clipboard actions ────────────────────────────────────────────────

/** Run a keystroke helper with a hard timeout. Resolves true when it exited cleanly. */
function runKeystrokeCommand(command: string, settleMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    exec(command, { timeout: KEYSTROKE_EXEC_TIMEOUT_MS, windowsHide: true }, (error) => {
      if (error) {
        console.warn('[GlobalHotkey] Keystroke helper failed:', error.killed ? 'timed out' : error.message)
      }
      setTimeout(() => resolve(!error), settleMs)
    })
  })
}

function keystrokeCommand(key: 'c' | 'v'): string {
  if (process.platform === 'darwin') {
    return `osascript -e 'tell application "System Events" to keystroke "${key}" using command down'`
  }
  if (process.platform === 'win32') {
    return `powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^${key}')"`
  }
  // Linux — requires xdotool
  return `xdotool key ctrl+${key}`
}

/** Simulate Cmd+C (macOS) / Ctrl+C (Windows/Linux). The caller polls the clipboard afterwards. */
function simulateCopy(): Promise<boolean> {
  return runKeystrokeCommand(keystrokeCommand('c'), CLIPBOARD_COPY_SETTLE_MS)
}

/** Simulate Cmd+V (macOS) / Ctrl+V (Windows/Linux). */
function simulatePaste(): Promise<boolean> {
  return runKeystrokeCommand(keystrokeCommand('v'), CLIPBOARD_PASTE_WAIT_MS)
}

// ── Clipboard snapshot / restore ──────────────────────────────────────────────

interface ClipboardSnapshot {
  /** Formats present when the snapshot was taken. */
  formats: string[]
  text: string
  html: string
  rtf: string
  image: NativeImage | null
}

function snapshotClipboard(): ClipboardSnapshot {
  const image = clipboard.readImage()
  return {
    formats: clipboard.availableFormats(),
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    image: image && !image.isEmpty() ? image : null,
  }
}

/**
 * Put a snapshot back. An originally empty clipboard is cleared; a clipboard whose
 * formats we cannot represent (e.g. copied files) is left untouched rather than
 * being overwritten with an empty string.
 */
function restoreClipboardSnapshot(snapshot: ClipboardSnapshot): void {
  if (snapshot.formats.length === 0) {
    clipboard.clear()
    return
  }
  const data: Electron.Data = {}
  if (snapshot.text) data.text = snapshot.text
  if (snapshot.html) data.html = snapshot.html
  if (snapshot.rtf) data.rtf = snapshot.rtf
  if (snapshot.image) data.image = snapshot.image
  if (Object.keys(data).length === 0) return
  clipboard.write(data)
}

/** Formats restoreClipboardSnapshot can put back (images are rewritten as a NativeImage). */
function isRestorableFormat(format: string): boolean {
  const f = format.toLowerCase()
  return f === 'text/plain' || f === 'text/html' || f === 'text/rtf' || f.startsWith('image/')
}

/**
 * True when every format on the clipboard can be rebuilt from the snapshot. When it is
 * false (files, Excel, app-private formats) the clipboard must never be cleared or
 * overwritten up front, because the original could not be put back.
 */
function isFullyRestorable(snapshot: ClipboardSnapshot): boolean {
  return snapshot.formats.every(isRestorableFormat)
}

function sameFormats(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
}

/** True when the live clipboard still looks exactly like the snapshot (nothing replaced it). */
function clipboardMatchesSnapshot(snapshot: ClipboardSnapshot): boolean {
  return clipboard.readText() === snapshot.text && sameFormats(clipboard.availableFormats(), snapshot.formats)
}

/**
 * The text the copy keystroke put on the clipboard, or '' if nothing arrived yet.
 * When the clipboard was cleared first, any text is new. When it could not be cleared
 * (non-restorable formats), only text or formats that differ from the snapshot count.
 */
function readCopiedText(snapshot: ClipboardSnapshot, cleared: boolean): string {
  const text = clipboard.readText()
  if (!text) return ''
  if (cleared) return text
  if (text !== snapshot.text) return text
  return sameFormats(clipboard.availableFormats(), snapshot.formats) ? '' : text
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Poll for the copied text: slow targets can take far longer than a fixed delay. */
async function waitForCopiedText(snapshot: ClipboardSnapshot, cleared: boolean): Promise<string> {
  const attempts = Math.ceil(CLIPBOARD_COPY_TIMEOUT_MS / CLIPBOARD_COPY_POLL_MS)
  for (let i = 0; ; i++) {
    const text = readCopiedText(snapshot, cleared)
    if (text) return text
    if (i >= attempts) return ''
    await sleep(CLIPBOARD_COPY_POLL_MS)
  }
}

function safeRestoreClipboard(snapshot: ClipboardSnapshot): void {
  try {
    restoreClipboardSnapshot(snapshot)
  } catch (e) {
    console.error('[GlobalHotkey] Failed to restore clipboard:', e)
  }
}

interface PendingRestore {
  snapshot: ClipboardSnapshot
  /** The translated text we wrote — restore is skipped if the clipboard no longer holds it. */
  expectedText: string
  timer: NodeJS.Timeout
  resolve: () => void
}

let pendingRestore: PendingRestore | null = null

/** Run (or skip, if the user copied something else) the pending clipboard restore now. */
function flushPendingClipboardRestore(): void {
  if (!pendingRestore) return
  const { snapshot, expectedText, timer, resolve } = pendingRestore
  pendingRestore = null
  clearTimeout(timer)
  try {
    if (clipboard.readText() === expectedText) safeRestoreClipboard(snapshot)
  } catch (e) {
    console.error('[GlobalHotkey] Failed to restore clipboard:', e)
  }
  resolve()
}

/** Resolves once the delayed restore has run. The timer can be flushed early. */
function scheduleClipboardRestore(snapshot: ClipboardSnapshot, expectedText: string): Promise<void> {
  return new Promise((resolve) => {
    pendingRestore = {
      snapshot,
      expectedText,
      resolve,
      timer: setTimeout(flushPendingClipboardRestore, CLIPBOARD_RESTORE_WAIT_MS),
    }
  })
}

// ── Hotkey registration ───────────────────────────────────────────────────────

type RegisterOutcome = 'ok' | 'invalid' | 'in_use'

/** Register `accelerator`; distinguishes a rejected accelerator from one held by another app. */
function tryRegister(accelerator: string, callback: () => void): RegisterOutcome {
  try {
    return globalShortcut.register(accelerator, callback) ? 'ok' : 'in_use'
  } catch (e) {
    console.error('[GlobalHotkey] Registration error:', e)
    return 'invalid'
  }
}

function safeUnregister(accelerator: string): void {
  if (!accelerator) return
  try { globalShortcut.unregister(accelerator) } catch { /* ignore */ }
}

let isTranslating = false

function createTranslateHotkeyHandler(getMainWindow: () => BrowserWindow | null): () => void {
  return () => { void runTranslateHotkey(getMainWindow) }
}

async function runTranslateHotkey(getMainWindow: () => BrowserWindow | null): Promise<void> {
  if (isTranslating) {
    // The indicator keeps showing the live copying/translating state in this case.
    showHotkeyIndicator('busy', undefined, 1_200)
    return
  }
  isTranslating = true

  // Until handed to scheduleClipboardRestore this snapshot is restored in `finally`.
  let snapshot: ClipboardSnapshot | null = null
  let restoreInFinally = false

  try {
    // A restore from the previous run may still be pending (the flag is released right
    // after the paste): settle it first so the snapshot below is the user's real clipboard.
    flushPendingClipboardRestore()
    showHotkeyIndicator('copying')

    snapshot = snapshotClipboard()
    restoreInFinally = true
    // Clearing first lets us tell "nothing was copied" from "same text as before" - but
    // only when the original can be put back. Otherwise leave the clipboard untouched and
    // detect the copy by a change in its content.
    const cleared = isFullyRestorable(snapshot)
    if (cleared) clipboard.clear()

    const copied = await simulateCopy()
    const selectedText = copied ? await waitForCopiedText(snapshot, cleared) : ''

    if (!selectedText || selectedText.trim() === '') {
      showHotkeyIndicator('warning', undefined, 1_500)
      return
    }

    // Notify renderer: translation starting
    getMainWindow()?.webContents.send('hotkey:translating', { text: selectedText })
    showHotkeyIndicator('translating')

    const result = await lightweightTranslate({
      text: selectedText,
      targetLang: currentSettings.targetLang,
      provider: currentSettings.provider,
      model: currentSettings.model,
    })
    if (!result.success || !result.translatedText) throw new Error(result.error ?? 'Translation failed')
    const translated = result.translatedText

    // Paste translated text
    clipboard.writeText(translated)
    if (!(await simulatePaste())) throw new Error('Could not paste the translated text')

    // Notify renderer: done
    getMainWindow()?.webContents.send('hotkey:translated', {
      original: selectedText,
      translated,
    })
    showHotkeyIndicator('done')
    hideHotkeyIndicator()

    // Restore the clipboard after a short delay so paste completes first. Ownership of
    // the snapshot moves to pendingRestore and the busy flag is released right away so
    // the next press is not rejected; that press (or app quit) flushes the pending
    // restore first, so it can never capture the translated text as its "original".
    restoreInFinally = false
    void scheduleClipboardRestore(snapshot, translated)
  } catch (err) {
    console.error('[GlobalHotkey] Translation error:', err)
    showHotkeyIndicator('error', err instanceof Error ? err.message : undefined, 2_200)
    getMainWindow()?.webContents.send('hotkey:error', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    if (restoreInFinally && snapshot) {
      // Non-restorable clipboards are only touched if something actually replaced them.
      try {
        if (isFullyRestorable(snapshot) || !clipboardMatchesSnapshot(snapshot)) safeRestoreClipboard(snapshot)
      } catch (e) {
        console.error('[GlobalHotkey] Failed to restore clipboard:', e)
      }
    }
    isTranslating = false
  }
}

/**
 * Register the translate hotkey and update bookkeeping. Returns the registration
 * outcome so callers can report a precise error.
 */
function registerTranslateAccelerator(
  accelerator: string,
  getMainWindow: () => BrowserWindow | null,
): RegisterOutcome {
  const outcome = tryRegister(accelerator, createTranslateHotkeyHandler(getMainWindow))
  if (outcome === 'ok') registeredTranslateAccelerator = accelerator
  return outcome
}

function registerChatAccelerator(accelerator: string, toggleQuickChatWindow: () => void): RegisterOutcome {
  const outcome = tryRegister(accelerator, () => { toggleQuickChatWindow() })
  if (outcome === 'ok') registeredChatAccelerator = accelerator
  return outcome
}

function failure(
  errorCode: HotkeyFailureCode,
  error: string,
  settings?: HotkeySettings | AIChatHotkeySettings,
): HotkeyUpdateFailure {
  return { success: false, error, errorCode, ...(settings ? { settings } : {}) }
}

const IN_USE_MESSAGE = 'Hotkey is already in use by another application.'

/**
 * Switch `registered` to `wanted` safely: the NEW accelerator is registered before
 * the old one is released, so a failure leaves the previous hotkey working.
 */
function swapAccelerator(
  registered: string,
  wanted: string,
  register: (accelerator: string) => RegisterOutcome,
  clearRegistered: () => void,
): RegisterOutcome {
  if (!wanted) {
    safeUnregister(registered)
    clearRegistered()
    return 'ok'
  }
  if (registered && sameAccelerator(registered, wanted)) return 'ok'

  const previous = registered
  const outcome = register(wanted)
  if (outcome === 'ok' && previous) safeUnregister(previous)
  return outcome
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initGlobalHotkey(
  ipcMain: Electron.IpcMain,
  getMainWindow: () => BrowserWindow | null,
  toggleQuickChatWindow: () => void
): void {
  registeredTranslateAccelerator = ''
  registeredChatAccelerator = ''

  // Load persisted settings and register translate hotkey if enabled
  currentSettings = loadSettings()
  if (currentSettings.uiLanguage) setHotkeyIndicatorLanguage(currentSettings.uiLanguage)
  if (currentSettings.enabled && currentSettings.hotkey) {
    const outcome = registerTranslateAccelerator(currentSettings.hotkey, getMainWindow)
    if (outcome !== 'ok') {
      console.warn('[GlobalHotkey] Could not register saved hotkey (already in use?)')
    }
  }

  // Load and register AI Chat hotkey if enabled
  currentChatSettings = loadChatSettings()
  if (currentChatSettings.enabled && currentChatSettings.hotkey
      && !(currentSettings.enabled && sameAccelerator(currentSettings.hotkey, currentChatSettings.hotkey))) {
    const outcome = registerChatAccelerator(currentChatSettings.hotkey, toggleQuickChatWindow)
    if (outcome !== 'ok') {
      console.warn('[GlobalHotkey] Could not register saved chat hotkey (already in use?)')
    }
  }

  // Never leave the clipboard holding translated text if the app quits mid-restore.
  app.once?.('will-quit', flushPendingClipboardRestore)

  /** Update (and optionally re-register) translate hotkey settings */
  ipcMain.handle('hotkey:update', (_event, rawSettings: unknown) => {
    try {
      const parsed = parseTranslateSettingsPatch(rawSettings)
      if (!parsed.ok) return failure('INVALID', parsed.error, currentSettings)

      const next: HotkeySettings = { ...currentSettings, ...parsed.patch }
      const wanted = next.enabled && next.hotkey ? next.hotkey : ''

      if (next.enabled && !next.hotkey) return failure('INVALID', 'A hotkey is required to enable this shortcut.', currentSettings)
      if (wanted && currentChatSettings.enabled && sameAccelerator(wanted, currentChatSettings.hotkey)) {
        return failure('CONFLICT', 'Hotkey is already used by the AI Chat shortcut.', currentSettings)
      }

      const outcome = swapAccelerator(
        registeredTranslateAccelerator,
        wanted,
        accelerator => registerTranslateAccelerator(accelerator, getMainWindow),
        () => { registeredTranslateAccelerator = '' },
      )
      if (outcome === 'invalid') return failure('INVALID', 'Invalid hotkey combination.', currentSettings)
      if (outcome === 'in_use') return failure('IN_USE', IN_USE_MESSAGE, currentSettings)

      currentSettings = next
      if (next.uiLanguage) setHotkeyIndicatorLanguage(next.uiLanguage)
      saveSettings(currentSettings)
      return { success: true, settings: currentSettings }
    } catch (e) {
      console.error('[GlobalHotkey] hotkey:update failed:', e)
      return { success: false, error: 'Could not update the hotkey.' }
    }
  })

  /** Return current translate hotkey settings */
  ipcMain.handle('hotkey:get', () => ({
    success: true,
    settings: currentSettings,
  }))

  /** Unregister translate hotkey and disable */
  ipcMain.handle('hotkey:disable', () => {
    try {
      safeUnregister(registeredTranslateAccelerator)
      registeredTranslateAccelerator = ''
      currentSettings = { ...currentSettings, enabled: false }
      saveSettings(currentSettings)
      return { success: true }
    } catch (e) {
      console.error('[GlobalHotkey] hotkey:disable failed:', e)
      return { success: false, error: 'Could not disable the hotkey.' }
    }
  })

  /** Update (and optionally re-register) AI Chat hotkey settings */
  ipcMain.handle('hotkey:chat:update', (_event, rawSettings: unknown) => {
    try {
      const parsed = parseChatSettingsPatch(rawSettings)
      if (!parsed.ok) return failure('INVALID', parsed.error, currentChatSettings)

      const next: AIChatHotkeySettings = { ...currentChatSettings, ...parsed.patch }
      const wanted = next.enabled && next.hotkey ? next.hotkey : ''

      if (next.enabled && !next.hotkey) return failure('INVALID', 'A hotkey is required to enable this shortcut.', currentChatSettings)
      if (wanted && currentSettings.enabled && sameAccelerator(wanted, currentSettings.hotkey)) {
        return failure('CONFLICT', 'Hotkey is already used by the translate shortcut.', currentChatSettings)
      }

      const outcome = swapAccelerator(
        registeredChatAccelerator,
        wanted,
        accelerator => registerChatAccelerator(accelerator, toggleQuickChatWindow),
        () => { registeredChatAccelerator = '' },
      )
      if (outcome === 'invalid') return failure('INVALID', 'Invalid hotkey combination.', currentChatSettings)
      if (outcome === 'in_use') return failure('IN_USE', IN_USE_MESSAGE, currentChatSettings)

      currentChatSettings = next
      saveChatSettings(currentChatSettings)
      return { success: true, settings: currentChatSettings }
    } catch (e) {
      console.error('[GlobalHotkey] hotkey:chat:update failed:', e)
      return { success: false, error: 'Could not update the hotkey.' }
    }
  })

  /** Return current AI Chat hotkey settings */
  ipcMain.handle('hotkey:chat:get', () => ({
    success: true,
    settings: currentChatSettings,
  }))
}
