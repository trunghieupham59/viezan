/**
 * Legacy Assistant — inject a floating Viezan icon into any browser tab
 * WITHOUT requiring a browser extension to be installed.
 *
 * Two modes:
 *  1. Auto-inject (macOS): uses osascript to inject JS into the frontmost
 *     browser tab every few seconds. Works with Chrome, Arc, Brave, Edge,
 *     Safari, and any Chromium-based browser on macOS.
 *
 *  2. Bookmarklet: the Settings page provides a bookmarklet URL the user
 *     can drag to their bookmarks bar — clicking it injects the assistant
 *     on demand in any browser on any OS.
 *
 * The injected floating assistant:
 *  • Shows a small Viezan icon in the bottom-right corner
 *  • When text is selected, hovering the icon shows a "Translate" button
 *  • Clicking it calls localhost:39875/api/translate (our local server)
 *  • Shows the result in a tooltip; also copies it to clipboard
 *  • 127.0.0.1 is exempt from mixed-content restrictions in modern browsers,
 *    so this works on both HTTP and HTTPS pages.
 */
import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { LEGACY_ASSISTANT_CHANNELS } from './channels'
import { invalidIpcInput, isRecord, isSafeLanguageCode } from './ipcValidation'

// These are imported lazily to avoid circular deps — call the getters below.
let _getToken: () => string = () => ''
let _getPort: () => number = () => 39875

export function setLocalServerAccessors (getToken: () => string, getPort: () => number) {
  _getToken = getToken
  _getPort = getPort
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LegacyAssistantSettings {
  enabled: boolean       // auto-inject via osascript
  targetLang: string     // default translate-to language
}

// ── Persistence ───────────────────────────────────────────────────────────────

const SETTINGS_FILE = 'legacy-assistant-settings.json'
const DEFAULT: LegacyAssistantSettings = { enabled: false, targetLang: 'en' }
const LEGACY_ASSISTANT_BUTTON_TEXT = 'V'
const LEGACY_ASSISTANT_BUTTON_CSS = [
  'position:fixed',
  'bottom:20px',
  'right:20px',
  'z-index:2147483647',
  'width:46px',
  'height:46px',
  'border-radius:50%',
  'background:#0f766e',
  'box-shadow:0 6px 18px rgba(15,23,32,.20)',
  'cursor:pointer',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'transition:transform .15s,opacity .15s',
  'opacity:.85',
  'user-select:none',
  'color:#fff',
  'font:700 18px/1 -apple-system,BlinkMacSystemFont,sans-serif',
].join(';')
const LEGACY_ASSISTANT_TOOLTIP_CSS = [
  'position:fixed',
  'bottom:74px',
  'right:20px',
  'z-index:2147483647',
  'max-width:300px',
  'min-width:160px',
  'background:#181b21',
  'color:#e8edf2',
  'padding:10px 13px',
  'border-radius:10px',
  'font:13px/1.5 -apple-system,sans-serif',
  'box-shadow:0 14px 32px rgba(0,0,0,.32)',
  'display:none',
  'word-break:break-word',
].join(';')
const LEGACY_ASSISTANT_MESSAGES = {
  noText: 'Select text on the page first.',
  translating: 'Translating...',
  header: 'Viezan TRANSLATION',
  failed: 'Translation failed',
  offline: 'Cannot reach Viezan app. Make sure it is running.',
} as const

let currentSettings: LegacyAssistantSettings = { ...DEFAULT }

function getSettingsPath () {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

function isValidTargetLang (value: unknown): value is string {
  return isSafeLanguageCode(value) && value !== 'auto'
}

/**
 * Whitelist known fields and drop anything malformed. Used for both settings
 * loaded from disk and IPC patches so a tampered value can never reach the
 * generated injection script.
 */
export function sanitizeLegacyAssistantSettings (
  raw: unknown,
  base: LegacyAssistantSettings = DEFAULT,
): LegacyAssistantSettings {
  const next = { ...base }
  if (!isRecord(raw)) return next
  if (typeof raw.enabled === 'boolean') next.enabled = raw.enabled
  if (isValidTargetLang(raw.targetLang)) next.targetLang = raw.targetLang
  return next
}

function validateLegacyAssistantPatch (patch: unknown): string | null {
  if (!isRecord(patch)) return 'Legacy assistant settings must be an object'
  if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') return 'Invalid enabled flag'
  if (patch.targetLang !== undefined && !isValidTargetLang(patch.targetLang)) return 'Invalid target language'
  return null
}

function loadSettings (): LegacyAssistantSettings {
  try {
    const p = getSettingsPath()
    if (fs.existsSync(p)) return sanitizeLegacyAssistantSettings(JSON.parse(fs.readFileSync(p, 'utf-8')))
  } catch { /* ignore */ }
  return { ...DEFAULT }
}

function saveSettings (s: LegacyAssistantSettings) {
  try { fs.writeFileSync(getSettingsPath(), JSON.stringify(s, null, 2), 'utf-8') } catch { /* ignore */ }
}

// ── Supported browsers (macOS app names) ──────────────────────────────────────

const CHROME_LIKE = [
  'Google Chrome', 'Google Chrome Canary',
  'Brave Browser', 'Microsoft Edge', 'Microsoft Edge Canary',
  'Arc', 'Opera', 'Opera GX', 'Vivaldi', 'Chromium',
  'Naver Whale',
]
const SAFARI_APPS = ['Safari', 'Safari Technology Preview']

// ── The floating-assistant script ─────────────────────────────────────────────
// Injected directly into the page, so the payload is kept self-contained.
// Keep user-facing payload pieces named above instead of scattering literals
// through the generated script.

function scriptLiteral(value: unknown): string {
  return JSON.stringify(value)
}

/**
 * The generated script is whitespace-collapsed before it is embedded (AppleScript
 * string / bookmarklet URL), so it must never contain `//` line comments and
 * every statement must be terminated explicitly.
 */
export function buildAssistantScript (token: string, port: number, targetLang: string): string {
  return `(function(){
if(window.__viezanLA)return;
window.__viezanLA=true;
var TK=${scriptLiteral(token)},PT=${Number(port)},TL=${scriptLiteral(targetLang)};
var b=document.createElement('div');
b.id='__viezanLA_btn';
b.style.cssText=${scriptLiteral(LEGACY_ASSISTANT_BUTTON_CSS)};
b.textContent=${scriptLiteral(LEGACY_ASSISTANT_BUTTON_TEXT)};
b.addEventListener('mouseover',function(){b.style.transform='scale(1.08)';b.style.opacity='1';});
b.addEventListener('mouseout',function(){b.style.transform='';b.style.opacity='.85';});
document.body.appendChild(b);
var t=document.createElement('div');
t.id='__viezanLA_tip';
t.style.cssText=${scriptLiteral(LEGACY_ASSISTANT_TOOLTIP_CSS)};
document.body.appendChild(t);
var timer;
var MSG=${scriptLiteral(LEGACY_ASSISTANT_MESSAGES)};
function clearTip(){while(t.firstChild)t.removeChild(t.firstChild);}
function display(dur){t.style.display='block';clearTimeout(timer);if(dur)timer=setTimeout(function(){t.style.display='none';},dur);}
function showText(msg,dur){clearTip();t.textContent=msg;display(dur);}
function showTranslating(){clearTip();var s=document.createElement('span');s.style.cssText='opacity:.6;font-size:11px';s.textContent=MSG.translating;t.appendChild(s);display(0);}
function showTranslation(text,dur){clearTip();var h=document.createElement('span');h.style.cssText='opacity:.55;font-size:10px;display:block;margin-bottom:3px';h.textContent=MSG.header;t.appendChild(h);t.appendChild(document.createTextNode(text));display(dur);}
b.addEventListener('click',function(){
var sel=window.getSelection(),txt=sel?sel.toString().trim():'';
if(!txt){showText(MSG.noText,3000);return;}
showTranslating();
fetch('http://127.0.0.1:'+PT+'/api/translate?corsToken='+encodeURIComponent(TK),{
method:'POST',
headers:{'Content-Type':'application/json','X-Viezan-Token':TK},
body:JSON.stringify({text:txt,targetLang:TL})
}).then(function(r){return r.json();}).then(function(d){
if(d.success){
showTranslation(d.translatedText,9000);
try{navigator.clipboard.writeText(d.translatedText);}catch(e){}
}else{
showText('Error: '+(d.error||MSG.failed),5000);
}
}).catch(function(){showText(MSG.offline,5000);});
});
document.addEventListener('mousedown',function(e){
if(e.target!==b&&e.target!==t&&!t.contains(e.target))t.style.display='none';
});
})();`
}

// ── osascript injection ───────────────────────────────────────────────────────

export function escapeForAppleScript (js: string): string {
  // Minify whitespace, then escape for embedding inside a double-quoted AS string
  return js
    .replace(/\s+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

export function buildChromeLikeAppleScript (appName: string, js: string): string {
  return `tell application "${appName}" to execute front window's active tab javascript "${escapeForAppleScript(js)}"`
}

export function buildSafariAppleScript (js: string): string {
  return `tell application "Safari" to do JavaScript "${escapeForAppleScript(js)}" in current tab of front window`
}

/**
 * Run an AppleScript without a shell (argv array, so quoting in the script can
 * never break out). Failures are logged without the script text because it
 * embeds the local-server token.
 */
function runOsascript (appleScript: string, timeout: number, label: string, onDone?: (stdout: string) => void): void {
  execFile('osascript', ['-e', appleScript], { timeout }, (error, stdout) => {
    if (error) {
      const code = (error as NodeJS.ErrnoException).code
      console.warn(`[LegacyAssistant] ${label} failed${code ? ` (${String(code)})` : ''}`)
      onDone?.('')
      return
    }
    onDone?.(String(stdout ?? ''))
  })
}

function injectIntoChromeLike (appName: string, js: string): void {
  runOsascript(buildChromeLikeAppleScript(appName, js), 3000, `inject into ${appName}`)
}

function injectIntoSafari (js: string): void {
  runOsascript(buildSafariAppleScript(js), 3000, 'inject into Safari')
}

const FRONTMOST_APP_SCRIPT =
  'tell application "System Events" to get name of first application process whose frontmost is true'
let frontmostInFlight: Promise<string> | null = null

function getFrontmostApp (): Promise<string> {
  if (frontmostInFlight) return frontmostInFlight
  const lookup = new Promise<string>((resolve) => {
    try {
      runOsascript(FRONTMOST_APP_SCRIPT, 1500, 'frontmost app lookup', (stdout) => {
        resolve(stdout.trim())
      })
    } catch {
      // execFile can throw synchronously (e.g. invalid arguments). Resolve a safe
      // default so the in-flight guard never stays a rejected promise.
      console.warn('[LegacyAssistant] frontmost app lookup failed (spawn)')
      resolve('')
    }
  })
  frontmostInFlight = lookup
  // Clear the guard once settled (also covers a lookup that settles synchronously).
  void lookup.finally(() => {
    if (frontmostInFlight === lookup) frontmostInFlight = null
  })
  return lookup
}

async function tryInject (): Promise<void> {
  if (!currentSettings.enabled) return
  if (process.platform !== 'darwin') return

  const token = _getToken()
  const port  = _getPort()
  if (!token) return

  const frontApp = await getFrontmostApp()
  if (!frontApp || !currentSettings.enabled) return

  const script = buildAssistantScript(token, port, currentSettings.targetLang)

  if (CHROME_LIKE.includes(frontApp)) {
    injectIntoChromeLike(frontApp, script)
  } else if (SAFARI_APPS.includes(frontApp)) {
    injectIntoSafari(script)
  }
}

// ── Bookmarklet builder ───────────────────────────────────────────────────────
// The bookmarklet embeds the FULL script inline so it works on any browser / OS
// without requiring the Viezan app to actively inject it.

export function buildBookmarklet (token: string, port: number, targetLang: string): string {
  const script = buildAssistantScript(token, port, targetLang)
  const minified = script.replace(/\s+/g, ' ').trim()
  return `javascript:${encodeURIComponent(minified)}`
}

// ── Injection loop ────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null

function startLoop () {
  if (timer) return
  // First injection almost immediately, then every 2.5 s
  timer = setInterval(() => { void tryInject() }, 2500)
  setTimeout(() => { void tryInject() }, 400)
}

function stopLoop () {
  if (timer) { clearInterval(timer); timer = null }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initLegacyAssistant (ipcMain: Electron.IpcMain): void {
  currentSettings = loadSettings()
  if (currentSettings.enabled) startLoop()

  ipcMain.handle(LEGACY_ASSISTANT_CHANNELS.invoke.update, (_event, patch: unknown) => {
    const invalid = validateLegacyAssistantPatch(patch)
    if (invalid) return invalidIpcInput(invalid)
    currentSettings = sanitizeLegacyAssistantSettings(patch, currentSettings)
    saveSettings(currentSettings)
    if (currentSettings.enabled) { startLoop() } else { stopLoop() }
    return { success: true, settings: currentSettings }
  })

  ipcMain.handle(LEGACY_ASSISTANT_CHANNELS.invoke.get, () => ({
    success: true,
    settings: currentSettings,
  }))

  ipcMain.handle(LEGACY_ASSISTANT_CHANNELS.invoke.getBookmarklet, () => {
    const token = _getToken()
    const port  = _getPort()
    if (!token) return { success: false, error: 'Server not started yet' }
    return {
      success: true,
      bookmarklet: buildBookmarklet(token, port, currentSettings.targetLang),
    }
  })

  ipcMain.handle(LEGACY_ASSISTANT_CHANNELS.invoke.injectNow, async () => {
    await tryInject()
    return { success: true }
  })
}
