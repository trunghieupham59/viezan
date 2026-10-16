// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getOllamaServeLaunch } from '../ollamaProcess'

describe('Ollama process launch', () => {
  it.each(['linux', 'darwin'] as const)('preserves direct process-group launch on %s', platform => {
    const env = { OLLAMA_HOST: '127.0.0.1:11434' }
    expect(getOllamaServeLaunch('/opt/ollama', env, platform)).toEqual({
      command: '/opt/ollama', args: ['serve'],
      options: { env, detached: true, stdio: 'ignore', windowsHide: true },
    })
  })

  it('passes a Windows executable as data and preserves GPU/runtime environment', () => {
    const executable = "C:\\Local AI\\Ollama's $(unexpected);\\ollama.exe"
    const env = { SystemRoot: 'C:\\Windows', OLLAMA_HOST: '127.0.0.1:11434', CUDA_VISIBLE_DEVICES: '0' }
    const launch = getOllamaServeLaunch(executable, env, 'win32')
    expect(launch.command).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(launch.options).toMatchObject({
      detached: false, windowsHide: true, stdio: 'ignore',
      env: { ...env, VIEZAN_OLLAMA_EXECUTABLE: executable },
    })
    expect(env).not.toHaveProperty('VIEZAN_OLLAMA_EXECUTABLE')
    const script = Buffer.from(launch.args[launch.args.length - 1] ?? '', 'base64').toString('utf16le')
    expect(script).not.toContain(executable)
    expect(script).toContain('[System.Diagnostics.ProcessWindowStyle]::Hidden')
    expect(script).toContain('$child.WaitForExit()')
    expect(script).toContain('exit $exitCode')
  })
})
