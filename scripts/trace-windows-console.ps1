<#
.SYNOPSIS
Capture intermittent console windows and their process ancestry on Windows.
.DESCRIPTION
Run before opening Viezan. No administrator rights are required. Records window
show events and samples process starts, without collecting command lines, window
titles, environment variables, clipboard contents, or application data. Stops
automatically after DurationSeconds; never stops or starts another application.
.EXAMPLE
powershell -NoProfile -File scripts/trace-windows-console.ps1 -DurationSeconds 120
#>
[CmdletBinding()]
param(
  [ValidateRange(1, 600)]
  [int]$DurationSeconds = 120,
  [string]$OutputPath = (Join-Path ([IO.Path]::GetTempPath()) ('viezan-console-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.jsonl'))
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'This diagnostic requires Windows.'
}

if (-not ('Viezan.ConsoleTrace' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace Viezan {
  public sealed class ProcessEntry {
    public uint Pid;
    public uint ParentPid;
    public string Name;
    public string Path;
  }
  public sealed class ConsoleEvent {
    public string TimeUtc;
    public string Kind;
    public string WindowClass;
    public List<ProcessEntry> Ancestry;
    public uint? ExitCode;
  }
  public sealed class ConsoleTrace : IDisposable {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32 {
      public uint Size, Usage, Pid;
      public UIntPtr Heap;
      public uint ModuleId, Threads, ParentPid;
      public int Priority;
      public uint Flags;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct MSG {
      public IntPtr Hwnd;
      public uint Message;
      public UIntPtr WParam;
      public IntPtr LParam;
      public uint Time;
      public int X, Y;
      public uint Private;
    }
    delegate void WinEvent(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint thread, uint time);
    delegate bool EnumWindow(IntPtr hwnd, IntPtr param);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32 entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32 entry);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder path, ref uint size);
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEvent callback, uint pid, uint thread, uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr hwnd, StringBuilder name, int size);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback, IntPtr param);
    [DllImport("user32.dll")] static extern bool PeekMessageW(out MSG msg, IntPtr hwnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessageW(ref MSG msg);

    readonly WinEvent callback;
    readonly IntPtr hook;
    readonly List<ConsoleEvent> events = new List<ConsoleEvent>();
    Dictionary<uint, ProcessEntry> previous;
    Dictionary<uint, ProcessEntry> known = new Dictionary<uint, ProcessEntry>();
    readonly Dictionary<uint, IntPtr> handles = new Dictionary<uint, IntPtr>();

    public ConsoleTrace() {
      previous = Snapshot();
      foreach (var entry in previous) known[entry.Key] = entry.Value;
      Track(previous);
      foreach (var entry in previous) if (Relevant(entry.Value.Name)) Record(entry.Key, "process-baseline", null);
      callback = OnShow;
      // EVENT_OBJECT_SHOW; out-of-context callback delivered on this thread.
      hook = SetWinEventHook(0x8002, 0x8002, IntPtr.Zero, callback, 0, 0, 0);
      if (hook == IntPtr.Zero) throw new InvalidOperationException("Cannot register window show hook.");
      EnumWindows((hwnd, param) => { if (IsWindowVisible(hwnd)) RecordWindow(hwnd, "window-baseline"); return true; }, IntPtr.Zero);
    }
    static string ImagePath(uint pid) {
      IntPtr process = OpenProcess(0x1000, false, pid);
      if (process == IntPtr.Zero) return null;
      try {
        var path = new StringBuilder(32768);
        uint size = (uint)path.Capacity;
        return QueryFullProcessImageNameW(process, 0, path, ref size) ? path.ToString() : null;
      } finally { CloseHandle(process); }
    }
    static Dictionary<uint, ProcessEntry> Snapshot() {
      var entries = new Dictionary<uint, ProcessEntry>();
      IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
      if (snapshot == new IntPtr(-1)) throw new InvalidOperationException("Cannot read process snapshot.");
      try {
        var entry = new PROCESSENTRY32();
        entry.Size = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
        if (Process32FirstW(snapshot, ref entry)) do {
          entries[entry.Pid] = new ProcessEntry { Pid = entry.Pid, ParentPid = entry.ParentPid, Name = entry.Name };
        } while (Process32NextW(snapshot, ref entry));
      } finally { CloseHandle(snapshot); }
      return entries;
    }
    static bool Relevant(string name) {
      switch ((name ?? "").ToLowerInvariant()) {
        case "powershell.exe": case "pwsh.exe": case "cmd.exe":
        case "conhost.exe": case "openconsole.exe": case "windowsterminal.exe":
        case "ollama.exe": case "llama-server.exe": case "ollama app.exe": case "viezan.exe": return true;
        default: return false;
      }
    }
    void Track(Dictionary<uint, ProcessEntry> entries) {
      foreach (var entry in entries) {
        if (!Relevant(entry.Value.Name) || handles.ContainsKey(entry.Key)) continue;
        IntPtr handle = OpenProcess(0x00101000, false, entry.Key);
        if (handle != IntPtr.Zero) handles[entry.Key] = handle;
      }
    }
    void Record(uint pid, string kind, string windowClass, uint? exitCode = null) {
      var chain = new List<ProcessEntry>();
      var seen = new HashSet<uint>();
      ProcessEntry entry;
      while (pid != 0 && chain.Count < 12 && seen.Add(pid)) {
        if (!known.TryGetValue(pid, out entry)) {
          chain.Add(new ProcessEntry { Pid = pid, Name = "unavailable", Path = ImagePath(pid) });
          break;
        }
        // Paths may be unavailable for protected or already-exited processes.
        if (entry.Path == null) entry.Path = ImagePath(pid);
        chain.Add(entry);
        pid = entry.ParentPid;
      }
      events.Add(new ConsoleEvent { TimeUtc = DateTime.UtcNow.ToString("o"), Kind = kind, WindowClass = windowClass, Ancestry = chain, ExitCode = exitCode });
    }
    void RecordWindow(IntPtr hwnd, string kind) {
      var className = new StringBuilder(256);
      GetClassNameW(hwnd, className, className.Capacity);
      string name = className.ToString();
      if (name != "ConsoleWindowClass" && name != "CASCADIA_HOSTING_WINDOW_CLASS") return;
      uint pid;
      GetWindowThreadProcessId(hwnd, out pid);
      foreach (var entry in Snapshot()) known[entry.Key] = entry.Value;
      Record(pid, kind, name);
    }
    void OnShow(IntPtr h, uint ev, IntPtr hwnd, int obj, int child, uint thread, uint time) {
      if (hwnd == IntPtr.Zero || obj != 0 || child != 0) return;
      // Exceptions must never cross the native callback boundary.
      try { RecordWindow(hwnd, "window-show"); } catch { }
    }
    public ConsoleEvent[] Poll() {
      MSG msg;
      while (PeekMessageW(out msg, IntPtr.Zero, 0, 0, 1)) {
        TranslateMessage(ref msg);
        DispatchMessageW(ref msg);
      }
      var current = Snapshot();
      foreach (var handle in new List<KeyValuePair<uint, IntPtr>>(handles)) {
        if (WaitForSingleObject(handle.Value, 0) != 0) continue;
        uint code;
        if (GetExitCodeProcess(handle.Value, out code)) Record(handle.Key, "process-exited", null, code);
        CloseHandle(handle.Value);
        handles.Remove(handle.Key);
      }
      foreach (var entry in current) known[entry.Key] = entry.Value;
      Track(current);
      foreach (var entry in current) {
        ProcessEntry old;
        if (Relevant(entry.Value.Name) && (!previous.TryGetValue(entry.Key, out old) || old.Name != entry.Value.Name)) {
          Record(entry.Key, "process-observed", null);
        }
      }
      previous = current;
      var result = events.ToArray();
      events.Clear();
      return result;
    }
    public void Dispose() {
      UnhookWinEvent(hook);
      foreach (var handle in handles.Values) CloseHandle(handle);
      handles.Clear();
      GC.KeepAlive(callback);
    }
  }
}
'@
}

$resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
# CreateNew refuses to overwrite any existing file, even if OutputPath was supplied.
$stream = [IO.File]::Open($resolvedOutput, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
$writer = [IO.StreamWriter]::new($stream, [Text.UTF8Encoding]::new($false))
$writer.AutoFlush = $true
$probe = $null
try {
  $writer.WriteLine((@{Kind='trace-start'; TimeUtc=[DateTime]::UtcNow.ToString('o'); DurationSeconds=$DurationSeconds; ProcessSamplingMs=50; ComputerNameCollected=$false; CommandLinesCollected=$false} | ConvertTo-Json -Compress))
  $probe = [Viezan.ConsoleTrace]::new()
  Write-Host "Recording for $DurationSeconds seconds. Open Viezan now."
  Write-Host "Log: $resolvedOutput"
  $watch = [Diagnostics.Stopwatch]::StartNew()
  while ($watch.Elapsed.TotalSeconds -lt $DurationSeconds) {
    foreach ($entry in $probe.Poll()) {
      $writer.WriteLine(($entry | ConvertTo-Json -Depth 6 -Compress))
      $ancestry = ($entry.Ancestry | ForEach-Object { $_.Name + '(' + $_.Pid + ')' }) -join ' <- '
      Write-Host ($entry.TimeUtc + ' ' + $entry.Kind + ' ' + $ancestry)
    }
    Start-Sleep -Milliseconds 50
  }
  $writer.WriteLine((@{Kind='trace-end'; TimeUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress))
} finally {
  if ($null -ne $probe) { $probe.Dispose() }
  $writer.Dispose()
}
Write-Host "Finished: $resolvedOutput"
