import type { SpawnOptions } from 'node:child_process'
import path from 'node:path'

/**
 * A no-console Ollama parent lets its Windows GPU probes allocate visible consoles.
 * ShellExecute creates one hidden console instead; ordinary descendants inherit it.
 * Keep the PowerShell supervisor alive so taskkill /T still owns the entire tree.
 * The executable travels as data in the environment, never as PowerShell source.
 */
const WINDOWS_OLLAMA_SUPERVISOR = [
  "$ErrorActionPreference = 'Stop'",
  'try {',
  '  $start = New-Object System.Diagnostics.ProcessStartInfo',
  '  $start.FileName = $env:VIEZAN_OLLAMA_EXECUTABLE',
  "  $start.Arguments = 'serve'",
  '  $start.UseShellExecute = $true',
  '  $start.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden',
  '  $start.ErrorDialog = $false',
  '  $child = [System.Diagnostics.Process]::Start($start)',
  '  $null = $child.Handle',
  '  $child.WaitForExit()',
  '  $exitCode = $child.ExitCode',
  '  $child.Dispose()',
  '  exit $exitCode',
  '} catch { exit 1 }',
].join('\n')

export function getOllamaServeLaunch(executable: string, env: NodeJS.ProcessEnv, platform = process.platform): {
  command: string
  args: string[]
  options: SpawnOptions
} {
  const options: SpawnOptions = { detached: true, env, stdio: 'ignore', windowsHide: true }
  if (platform !== 'win32') return { command: executable, args: ['serve'], options }

  return {
    command: path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(WINDOWS_OLLAMA_SUPERVISOR, 'utf16le').toString('base64')],
    // PowerShell must stay attached to the managed process handle. A detached
    // Windows PowerShell can hand off startup and exit before its command runs.
    options: { ...options, detached: false, env: { ...env, VIEZAN_OLLAMA_EXECUTABLE: executable } },
  }
}
