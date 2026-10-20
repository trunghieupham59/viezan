import { execFile } from 'node:child_process'
import path from 'node:path'

export type LauncherTarget =
  | { kind: 'path'; path: string }
  | { kind: 'windows-app'; appId: string }

export interface SystemLauncherApp {
  name: string
  target: LauncherTarget
  executable?: string
  args?: string
}

// Constant script: never interpolate a renderer query, path or command.
// StartApps includes MSIX/UWP and desktop AUMIDs. App Paths adds registered
// desktop executables which do not have a Start Menu entry.
const WINDOWS_CATALOG_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$apps = @()
try {
  $folder = (New-Object -ComObject Shell.Application).Namespace('shell:AppsFolder')
  $apps += @(Get-StartApps | ForEach-Object {
    $row = @{ name = $_.Name; appId = $_.AppID }
    try {
      $item = $folder.ParseName($_.AppID)
      $row.executable = $item.ExtendedProperty('System.Link.TargetParsingPath')
      $row.args = $item.ExtendedProperty('System.Link.Arguments')
    } catch {}
    $row
  })
} catch {}
$roots = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths'
)
foreach ($root in $roots) {
  foreach ($key in @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)) {
    try {
      $target = [Environment]::ExpandEnvironmentVariables([string]$key.GetValue('')).Trim('"')
      if ($target -notmatch '^[a-zA-Z]:\\\\.*\\.exe$' -or !(Test-Path -LiteralPath $target -PathType Leaf)) { continue }
      $name = (Get-Item -LiteralPath $target).VersionInfo.FileDescription
      if (!$name) { $name = [IO.Path]::GetFileNameWithoutExtension($target) }
      $apps += @{ name = $name; path = $target }
    } catch {}
  }
}
ConvertTo-Json -InputObject @($apps) -Compress -Depth 3
`

// Explorer may exit with code 1 even after successfully activating an app.
// Resolve the catalog item and invoke its verb instead of treating Explorer's
// process exit code as the application's launch result. The ID is data only.
const WINDOWS_OPEN_SCRIPT = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject Shell.Application
$folder = $shell.Namespace('shell:AppsFolder')
$item = $folder.ParseName($env:VIEZAN_LAUNCHER_APP_ID)
if ($null -eq $item) { throw 'Application is no longer available' }
$item.InvokeVerb('open')
`

function runFile(file: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024, env }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

function windowsDirectory(): string {
  return process.env.SystemRoot || 'C:\\Windows'
}

export function runWindowsScript(script: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const powershell = path.win32.join(windowsDirectory(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return runFile(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')], env)
}

function hasUnsafeCharacters(value: string): boolean {
  return [...value].some(character => character.charCodeAt(0) < 32 || character === '"')
}

export function isWindowsAppId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048
    && value === value.trim() && !hasUnsafeCharacters(value)
}

export function parseWindowsApps(output: string): SystemLauncherApp[] {
  const parsed: unknown = JSON.parse(output.replace(/^\uFEFF/u, ''))
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.flatMap((row): SystemLauncherApp[] => {
    if (!row || typeof row !== 'object' || typeof row.name !== 'string' || !row.name.trim()) return []
    const name = row.name.trim()
    if (isWindowsAppId(row.appId)) {
      const metadata = typeof row.executable === 'string' && /^[a-z]:\\/i.test(row.executable)
        && /\.exe$/i.test(row.executable) && !hasUnsafeCharacters(row.executable)
        ? { executable: row.executable, args: typeof row.args === 'string' ? row.args : '' } : {}
      return [{ name, target: { kind: 'windows-app', appId: row.appId }, ...metadata }]
    }
    if (typeof row.path === 'string' && /^[a-z]:\\/i.test(row.path) && /\.exe$/i.test(row.path) && !hasUnsafeCharacters(row.path)) {
      return [{ name, target: { kind: 'path', path: row.path } }]
    }
    return []
  })
}

export async function readSystemLauncherApps(platform: string): Promise<SystemLauncherApp[]> {
  if (platform === 'win32') {
    const output = await runWindowsScript(WINDOWS_CATALOG_SCRIPT)
    return parseWindowsApps(output)
  }
  if (platform === 'darwin') {
    // Spotlight covers indexed app bundles outside the standard Applications
    // folders, including applications on other indexed volumes.
    const output = await runFile('/usr/bin/mdfind', ['-0', 'kMDItemContentType == "com.apple.application-bundle"'])
    return output.split('\0').filter(value => path.posix.isAbsolute(value) && value.endsWith('.app')
      && !/\.app\//i.test(value) && !value.includes('\n')).map(value => ({
      name: path.posix.basename(value, '.app'), target: { kind: 'path' as const, path: value },
    }))
  }
  return []
}

/** Only a main-process catalog entry reaches this function; never script text. */
export async function openWindowsLauncherApp(appId: string): Promise<void> {
  if (!isWindowsAppId(appId)) throw new Error('Invalid Windows application ID')
  await runWindowsScript(WINDOWS_OPEN_SCRIPT, { ...process.env, VIEZAN_LAUNCHER_APP_ID: appId })
}
