import { nativeImage } from 'electron'
import type { LauncherIcon } from '../../shared/launcher'
import type { IndexedLauncherApp } from './launcherApps'
import { runWindowsScript } from './launcherSystemApps'

// Launcher tiles are 32px (--vzn-icon-2xl); keep 2x pixels so icons stay sharp
// on Retina and HiDPI (125-200%) displays. Shared by every platform reader.
export const LAUNCHER_ICON_PIXELS = 64

// Native shell icons work for both packaged AppsFolder entries and shortcuts.
// Run extraction in a bounded child process, never on Electron's UI thread.
// Only the module-level pixel constant is interpolated; targets arrive via env.
const WINDOWS_ICONS_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
public static class LauncherIconReader {
  [StructLayout(LayoutKind.Sequential)]
  public struct Size { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)]
  public struct BitmapInfo {
    public uint Size;
    public int Width, Height;
    public ushort Planes, BitCount;
    public uint Compression, SizeImage;
    public int XPelsPerMeter, YPelsPerMeter;
    public uint ClrUsed, ClrImportant;
  }
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IImageFactory {
    [PreserveSig] int GetImage(Size size, int flags, out IntPtr bitmap);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string name, IntPtr bind, ref Guid iid,
    [MarshalAs(UnmanagedType.Interface)] out IImageFactory item);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);
  [DllImport("gdi32.dll")] static extern int GetDIBits(IntPtr dc, IntPtr bitmap,
    uint start, uint lines, [Out] byte[] pixels, ref BitmapInfo info, uint usage);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
  static string EncodePng(IntPtr bitmap) {
    // FromHbitmap discards alpha. Read the original 32-bit shell pixels so
    // transparent corners do not turn into black squares in the launcher.
    using (var dimensions = Image.FromHbitmap(bitmap))
    using (var image = new Bitmap(dimensions.Width, dimensions.Height, PixelFormat.Format32bppArgb))
    using (var stream = new MemoryStream()) {
      int width = image.Width, height = image.Height;
      var info = new BitmapInfo { Size = 40, Width = width, Height = -height, Planes = 1, BitCount = 32 };
      var pixels = new byte[width * height * 4];
      IntPtr dc = GetDC(IntPtr.Zero);
      try {
        if (GetDIBits(dc, bitmap, 0, (uint)height, pixels, ref info, 0) != height)
          throw new InvalidOperationException("Unable to read application icon");
      } finally { ReleaseDC(IntPtr.Zero, dc); }
      bool hasAlpha = false;
      for (int i = 3; i < pixels.Length; i += 4) if (pixels[i] != 0) { hasAlpha = true; break; }
      // Legacy icons may have no alpha channel; preserve their opaque pixels.
      if (!hasAlpha) for (int i = 3; i < pixels.Length; i += 4) pixels[i] = 255;
      var data = image.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
      try {
        for (int y = 0; y < height; y++)
          Marshal.Copy(pixels, y * width * 4, IntPtr.Add(data.Scan0, y * data.Stride), width * 4);
      } finally { image.UnlockBits(data); }
      image.Save(stream, ImageFormat.Png);
      return Convert.ToBase64String(stream.ToArray());
    }
  }
  public static string Read(string path) {
    IImageFactory item = null;
    IntPtr bitmap = IntPtr.Zero;
    try {
      Guid iid = typeof(IImageFactory).GUID;
      SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item);
      Marshal.ThrowExceptionForHR(item.GetImage(new Size { X = ${LAUNCHER_ICON_PIXELS}, Y = ${LAUNCHER_ICON_PIXELS} }, 4, out bitmap));
      return EncodePng(bitmap);
    } finally {
      if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
      if (item != null) Marshal.ReleaseComObject(item);
    }
  }
}
'@
$icons = @()
$targets = ConvertFrom-Json -InputObject $env:VIEZAN_LAUNCHER_ICON_TARGETS
foreach ($entry in $targets) {
  try {
    $icons += @{ id = $entry.id; png = [LauncherIconReader]::Read($entry.path) }
  } catch {}
}
ConvertTo-Json -InputObject @($icons) -Compress
`

export async function readLauncherIcons(entries: IndexedLauncherApp[], platform: string): Promise<LauncherIcon[]> {
  if (platform === 'win32') {
    const targets = entries.map(({ id, target }) => ({
      id, path: target.kind === 'windows-app' ? `shell:AppsFolder\\${target.appId}` : target.path,
    }))
    const output = await runWindowsScript(WINDOWS_ICONS_SCRIPT, {
      ...process.env, VIEZAN_LAUNCHER_ICON_TARGETS: JSON.stringify(targets),
    })
    const rows: unknown = JSON.parse(output.replace(/^\uFEFF/u, ''))
    if (!Array.isArray(rows)) return []
    return rows.flatMap(row => {
      if (!row || typeof row.id !== 'string' || !entries.some(entry => entry.id === row.id)
        || typeof row.png !== 'string' || row.png.length > 64_000
        || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(row.png)) return []
      return [{ id: row.id, dataUrl: `data:image/png;base64,${row.png}` }]
    })
  }
  // createThumbnailFromPath exists on macOS and Windows only; the launcher is
  // not offered on other platforms, so never reach into Electron there.
  if (platform !== 'darwin') return []
  const icons = await Promise.all(entries.map(async ({ id, target }): Promise<LauncherIcon | null> => {
    if (target.kind !== 'path') return null
    try {
      // app.getFileIcon only knows the generic ".app" type icon on macOS. Quick
      // Look renders the bundle's own icon, including asset-catalog-only ones.
      const size = { width: LAUNCHER_ICON_PIXELS, height: LAUNCHER_ICON_PIXELS }
      const image = await nativeImage.createThumbnailFromPath(target.path, size)
      if (image.isEmpty()) return null
      // Quick Look returns oversized pixel data; resample to the tile's 2x size.
      const dataUrl = image.resize({ ...size, quality: 'best' }).toDataURL()
      return dataUrl.length <= 64_000 ? { id, dataUrl } : null
    } catch { return null }
  }))
  return icons.filter((icon): icon is LauncherIcon => icon !== null)
}
