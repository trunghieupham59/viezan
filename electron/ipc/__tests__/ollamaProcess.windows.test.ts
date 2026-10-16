// @vitest-environment node
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getOllamaServeLaunch } from '../ollamaProcess'

// Explicit native check: VIEZAN_TEST_WINDOWS_CONSOLE=1 npm test -- --run <this file>
// The fixture creates a real console child and grandchild, without Ollama or a GPU.
describe.runIf(process.platform === 'win32' && process.env.VIEZAN_TEST_WINDOWS_CONSOLE === '1')('Windows inherited hidden console', () => {
  it('keeps a real descendant on the same invisible console and forwards exit status', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "viezan console 'native-"))
    try {
      const executable = path.join(dir, "ollama's fixture.exe")
      const source = path.join(dir, 'Fixture.cs')
      const result = path.join(dir, 'result.txt')
      fs.writeFileSync(source, `
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
class Fixture {
  [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  static int Main(string[] args) {
    IntPtr console = GetConsoleWindow();
    File.AppendAllText(Environment.GetEnvironmentVariable("VIEZAN_CONSOLE_TEST_RESULT"),
      args[0] + "|" + console.ToInt64() + "|" + IsWindowVisible(console) + Environment.NewLine);
    if (args[0] == "grandchild") return 0;
    var info = new ProcessStartInfo(Assembly.GetExecutingAssembly().Location, "grandchild");
    info.UseShellExecute = false;
    using (var child = Process.Start(info)) { child.WaitForExit(); if (child.ExitCode != 0) return child.ExitCode; }
    return 42;
  }
}`)
      const windows = process.env.SystemRoot || 'C:\\Windows'
      const compiler = ['Framework64', 'Framework']
        .map(arch => path.win32.join(windows, 'Microsoft.NET', arch, 'v4.0.30319', 'csc.exe'))
        .find(file => fs.existsSync(file))
      if (!compiler) throw new Error('Windows .NET Framework C# compiler is required for the native fixture')
      execFileSync(compiler, ['/nologo', '/target:exe', `/out:${executable}`, source], { windowsHide: true, timeout: 15_000 })
      const launch = getOllamaServeLaunch(executable, { ...process.env, VIEZAN_CONSOLE_TEST_RESULT: result })
      let diagnostics = ''
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(launch.command, launch.args, { ...launch.options, stdio: 'pipe', timeout: 15_000 })
        child.stdout.on('data', chunk => { diagnostics += chunk.toString() })
        child.stderr.on('data', chunk => { diagnostics += chunk.toString() })
        child.stdin.end()
        child.once('error', reject)
        child.once('exit', code => resolve(code))
      })
      if (!fs.existsSync(result)) throw new Error(`Fixture did not run (exit ${exitCode}): ${diagnostics}`)
      const rows = fs.readFileSync(result, 'utf8').trim().split(/\r?\n/).map(line => line.split('|'))
      expect(rows.map(row => row[0])).toEqual(['serve', 'grandchild'])
      expect(rows[0][1]).not.toBe('0')
      expect(rows[1][1]).toBe(rows[0][1])
      expect(rows.map(row => row[2])).toEqual(['False', 'False'])
      expect(exitCode).toBe(42)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 40_000)
})
