# Read only a test-owned Ollama console. Never emit its startup environment dump.
param([Parameter(Mandatory=$true)][int]$SupervisorPid)
$ErrorActionPreference = 'Stop'
$owner = Get-CimInstance Win32_Process -Filter "ParentProcessId = $SupervisorPid" |
  Where-Object Name -eq 'ollama.exe' | Select-Object -First 1
if (-not $owner) { return }
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class OllamaTestConsole {
  [StructLayout(LayoutKind.Sequential)] struct Coord { public short X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct Rect { public short Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Info {
    public Coord Size, Cursor; public ushort Attributes; public Rect Window; public Coord Maximum;
  }
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("kernel32.dll")] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateFile(string p, uint a, uint s, IntPtr x, uint d, uint f, IntPtr t);
  [DllImport("kernel32.dll")] static extern bool GetConsoleScreenBufferInfo(IntPtr h, out Info info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool ReadConsoleOutputCharacter(IntPtr h, StringBuilder b, uint n, Coord xy, out uint read);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static string Read(uint pid) {
    FreeConsole();
    if (!AttachConsole(pid)) return "Console attachment unavailable";
    IntPtr h = CreateFile("CONOUT$", 0x80000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    try {
      Info info;
      if (!GetConsoleScreenBufferInfo(h, out info)) return "Console buffer unavailable";
      var count = Math.Min(info.Size.X * info.Size.Y, 1000000);
      var raw = new StringBuilder(count); uint read;
      if (!ReadConsoleOutputCharacter(h, raw, (uint)count, new Coord(), out read)) return "Console read unavailable";
      string text = raw.ToString();
      int start = text.IndexOf("inference compute", StringComparison.Ordinal);
      if (start < 0) return "No post-discovery output available";
      // The environment configuration precedes GPU discovery; exclude it entirely.
      var lines = new StringBuilder();
      for (int i = start; i < text.Length; ) {
        int length = Math.Min(info.Size.X - (i % info.Size.X), text.Length - i);
        var line = text.Substring(i, length).TrimEnd();
        if (line.Length > 0) lines.AppendLine(line);
        i += length;
      }
      return lines.ToString();
    } finally { CloseHandle(h); FreeConsole(); }
  }
}
'@
[OllamaTestConsole]::Read($owner.ProcessId)
