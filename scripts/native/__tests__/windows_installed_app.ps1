param([Parameter(Mandatory)][string]$Version)

$ErrorActionPreference = 'Stop'
$install = Join-Path $env:LOCALAPPDATA 'Programs/Viezan'
$exe = Get-Item (Join-Path $install 'ViezanNativeQt.exe')
if ($exe.VersionInfo.ProductVersion -ne $Version) {
    throw "Expected installed version $Version, found $($exe.VersionInfo.ProductVersion)"
}

Add-Type -Namespace Viezan -Name WindowProbe -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder name, int capacity);
'@

$app = Start-Process -FilePath $exe.FullName -WorkingDirectory $install -PassThru
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    $name = [Text.StringBuilder]::new(256)
    do {
        Start-Sleep -Milliseconds 250
        $app.Refresh()
        if ($app.HasExited) { throw "Viezan exited during startup with code $($app.ExitCode)" }
        [void]$name.Clear()
        [void][Viezan.WindowProbe]::GetClassName($app.MainWindowHandle, $name, $name.Capacity)
        if ($name.ToString() -eq '#32770') { throw "Windows startup dialog: $($app.MainWindowTitle)" }
        if ($name.ToString() -like 'Qt*QWindow*' -and $app.MainWindowTitle) { break }
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($name.ToString() -notlike 'Qt*QWindow*' -or !$app.MainWindowTitle) {
        throw "Timed out waiting for the Qt window. Last class: $name"
    }
    # A runner can already have a system-wide CRT. Verify what this process actually loaded.
    foreach ($dll in 'msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll') {
        $module = $app.Modules | Where-Object ModuleName -eq $dll
        $expected = [IO.Path]::Combine($exe.DirectoryName, $dll)
        if ($module.FileName -ne $expected) { throw "Expected $expected, loaded '$($module.FileName)'" }
        Write-Output "Loaded $($module.FileName)"
    }
    Write-Output "Opened Viezan $Version. Qt window: $name ($($app.MainWindowTitle))"
} finally {
    if (!$app.HasExited) {
        [void]$app.CloseMainWindow()
        if (!$app.WaitForExit(5000)) { $app.Kill(); $app.WaitForExit() }
    }
    $app.Dispose()
}
