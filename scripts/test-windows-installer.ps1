<#
.SYNOPSIS
  Smoke-test the Windows NSIS installer: install, upgrade, recover, uninstall.

.DESCRIPTION
  Runs the built installer silently into a throw-away directory and checks the
  flows that used to break upgrades:
    1. fresh per-user install
    2. install over a running app that supports `--quit`: it must exit by itself
    3. silent in-app style update (--updated /S) over a running app that ignores
       `--quit` (older builds): the installer falls back to stopping it
    4. update when the previous uninstaller is broken (exits non-zero)
    5. uninstall leaves no files or registry entries behind

  The running app is simulated with TWO processes started from the installed exe,
  like the real multi-process Electron app. (The stock electron-builder check
  counts matching processes with `.Count`, which is `$null` for a single match on
  Windows PowerShell 5.1, so a one-process stand-in is never noticed.)

  It writes the real per-user uninstall entry of the product, so it only runs on
  CI runners unless -Force is given. For a local run, build the installer with
  a different appId/productName/shortcutName and pass that name via -ProductName.

.EXAMPLE
  pwsh scripts/test-windows-installer.ps1 -Installer release/Viezan-2.1.5-x64.exe
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$ProductName = 'Viezan',
  [string]$InstallDir = (Join-Path ([IO.Path]::GetTempPath()) 'viezan-installer-smoke'),
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not $env:CI -and -not $Force) {
  throw 'Refusing to run outside CI: this installs and removes a real per-user app entry. Pass -Force to override.'
}
if (-not (Test-Path -LiteralPath $Installer)) { throw "Installer not found: $Installer" }

$Installer = (Resolve-Path -LiteralPath $Installer).Path
$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$AppExe = Join-Path $InstallDir "$ProductName.exe"
$GracefulMarker = Join-Path ([IO.Path]::GetTempPath()) 'viezan-smoke-graceful-exit.txt'
$script:failures = 0

# Stand-in for the tray-resident app. Every instance waits on a named event;
# `<exe> --quit` (what the installer runs) sets it, and the waiting instances then
# leave a marker and exit normally. A force-kill leaves no marker.
$StandInSource = @'
using System;
using System.IO;
using System.Threading;
static class StandIn {
  static int Main(string[] args) {
    var quit = new EventWaitHandle(false, EventResetMode.ManualReset, @"Local\ViezanSmokeStandInQuit");
    if (args.Length > 0 && args[0] == "--quit") { quit.Set(); return 0; }
    if (quit.WaitOne(120000)) {
      File.WriteAllText(Path.Combine(Path.GetTempPath(), "viezan-smoke-graceful-exit.txt"), "ok");
    }
    return 0;
  }
}
'@

function Assert-That([bool]$Condition, [string]$Message) {
  if ($Condition) { Write-Host "  PASS  $Message" }
  else { Write-Host "  FAIL  $Message"; $script:failures++ }
}

function Get-Entries {
  @(Get-ChildItem $UninstallKey -ErrorAction SilentlyContinue |
      ForEach-Object { Get-ItemProperty $_.PSPath } |
      Where-Object { $_.DisplayName -like "$ProductName*" })
}

function Stop-InstalledProcesses {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Wait-ProcessExitCode($Process, [int]$TimeoutSeconds = 180) {
  # A message box in a silent installer would block forever; fail instead of hanging CI.
  if (-not $Process.WaitForExit($TimeoutSeconds * 1000)) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  (timed out after ${TimeoutSeconds}s)"
    return -1
  }
  return $Process.ExitCode
}

function Invoke-Installer([string[]]$ExtraArgs) {
  # Mirrors how electron-updater starts the installer: switches first, /D= last.
  # Processes are NOT stopped here: callers check what the installer did first.
  $installerArgs = @($ExtraArgs) + '/S' + "/D=$InstallDir"
  $p = Start-Process -FilePath $Installer -ArgumentList $installerArgs -PassThru
  return (Wait-ProcessExitCode $p)
}

function Start-AppProcesses([string]$Exe, [string[]]$ExeArgs) {
  # Two processes, like the real app (main + helper).
  $procs = @()
  for ($i = 0; $i -lt 2; $i++) {
    $params = @{ FilePath = $Exe; WindowStyle = 'Hidden'; PassThru = $true }
    if ($ExeArgs) { $params.ArgumentList = $ExeArgs }
    $procs += Start-Process @params
  }
  Start-Sleep -Seconds 1
  return $procs
}

function Test-AllExited($Procs) {
  foreach ($p in $Procs) { $p.Refresh() }
  return -not ($Procs | Where-Object { -not $_.HasExited })
}

function Install-StandInApp {
  $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (-not (Test-Path -LiteralPath $csc)) { throw "csc.exe not found: $csc" }
  $src = Join-Path ([IO.Path]::GetTempPath()) 'viezan-smoke-standin.cs'
  Set-Content -LiteralPath $src -Value $StandInSource -Encoding ASCII
  & $csc /nologo /target:exe "/out:$AppExe" $src | Out-Null
  Remove-Item $src -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path -LiteralPath $AppExe)) { throw 'Could not build the stand-in app' }
}

function Get-UninstallerPath {
  $u = Get-ChildItem -LiteralPath $InstallDir -Filter 'Uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($u) { $u.FullName }
}

function Test-RealAppInstalled {
  # The stand-ins are tiny; the installer must have put the real app back.
  (Test-Path -LiteralPath $AppExe) -and ((Get-Item -LiteralPath $AppExe).Length -gt 1MB)
}

try {
  if (Test-Path -LiteralPath $InstallDir) { Remove-Item -LiteralPath $InstallDir -Recurse -Force }
  Assert-That (@(Get-Entries).Count -eq 0) 'no pre-existing entry for the product'

  Write-Host '1. Fresh install'
  Assert-That ((Invoke-Installer @()) -eq 0) 'installer exits 0'
  Stop-InstalledProcesses
  Assert-That (@(Get-Entries).Count -eq 1) 'exactly one uninstall entry'
  Assert-That (Test-RealAppInstalled) "$ProductName.exe is installed"

  Write-Host '2. Install over a running app that supports --quit'
  Remove-Item $GracefulMarker -Force -ErrorAction SilentlyContinue
  Install-StandInApp
  $running = Start-AppProcesses $AppExe @()
  Assert-That (-not (Test-AllExited $running)) 'stand-in app is running before the install'
  Assert-That ((Invoke-Installer @()) -eq 0) 'installer exits 0'
  Assert-That (Test-AllExited $running) 'running app is gone after the install'
  Assert-That (Test-Path -LiteralPath $GracefulMarker) 'app exited by itself on --quit (not force-killed)'
  Stop-InstalledProcesses
  Assert-That (@(Get-Entries).Count -eq 1) 'still exactly one uninstall entry'
  Assert-That (Test-RealAppInstalled) "$ProductName.exe was replaced by the installer"

  Write-Host '3. Silent update while an app that ignores --quit is running'
  Copy-Item "$env:SystemRoot\System32\ping.exe" $AppExe -Force   # harmless stand-in process
  $running = Start-AppProcesses $AppExe @('-n', '600', '127.0.0.1')
  Assert-That (-not (Test-AllExited $running)) 'stand-in app is running before the update'
  Assert-That ((Invoke-Installer @('--updated')) -eq 0) 'installer exits 0'
  Assert-That (Test-AllExited $running) 'running app was stopped by the installer'
  Stop-InstalledProcesses
  Assert-That (@(Get-Entries).Count -eq 1) 'still exactly one uninstall entry'
  Assert-That (Test-RealAppInstalled) "$ProductName.exe was replaced by the installer"

  Write-Host '4. Update when the previous uninstaller is broken'
  $uninstaller = Get-UninstallerPath
  Assert-That ([bool]$uninstaller) 'previous uninstaller exists'
  Copy-Item "$env:SystemRoot\System32\find.exe" $uninstaller -Force   # exits non-zero for these args
  Assert-That ((Invoke-Installer @('--updated')) -eq 0) 'installer exits 0 despite the broken uninstaller'
  Stop-InstalledProcesses
  Assert-That (@(Get-Entries).Count -eq 1) 'still exactly one uninstall entry'
  Assert-That (Test-RealAppInstalled) "$ProductName.exe is installed"

  Write-Host '5. Uninstall'
  $uninstaller = Get-UninstallerPath
  Assert-That ([bool]$uninstaller) 'uninstaller exists'
  if ($uninstaller) {
    # Run a copy: an uninstaller cannot delete the exe it is running from.
    $copy = Join-Path ([IO.Path]::GetTempPath()) 'viezan-uninstall-copy.exe'
    Copy-Item $uninstaller $copy -Force
    $p = Start-Process -FilePath $copy -ArgumentList '/S', "_?=$InstallDir" -PassThru
    $code = Wait-ProcessExitCode $p
    Remove-Item $copy -Force -ErrorAction SilentlyContinue
    Assert-That ($code -eq 0) 'uninstaller exits 0'
    Start-Sleep -Seconds 2
  }
  Assert-That (@(Get-Entries).Count -eq 0) 'uninstall entry removed'
  Assert-That (-not (Test-Path -LiteralPath $AppExe)) "$ProductName.exe removed"
}
finally {
  # Always leave the machine clean, even when an assertion or the installer failed.
  Stop-InstalledProcesses
  Remove-Item $GracefulMarker -Force -ErrorAction SilentlyContinue
  Get-ChildItem $UninstallKey -ErrorAction SilentlyContinue |
    Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like "$ProductName*" } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $InstallDir) { Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue }
}

if ($script:failures -gt 0) {
  Write-Host "`n$($script:failures) check(s) failed."
  exit 1
}
Write-Host "`nAll installer checks passed."
