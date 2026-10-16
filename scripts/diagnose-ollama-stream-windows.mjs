// Opt-in diagnostic. Uses only a test-owned runtime and synthetic prompts.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

assert(process.platform === 'win32' && process.env.VIEZAN_DIAGNOSE_STREAM === '1', 'Explicit Windows opt-in required')
const { getOllamaServeLaunch } = createRequire(import.meta.url)('../dist-electron/ipc/ollamaProcess.js')
const production = 'http://127.0.0.1:11434'
const before = await (await fetch(`${production}/api/ps`)).json()
assert.equal(before.models.length, 0, 'Resident production models require separate interruption approval')
const listener = net.createServer()
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
const port = listener.address().port
await new Promise(resolve => listener.close(resolve))
const endpoint = `http://127.0.0.1:${port}`
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-stream-diagnostic-'))
const report = { endpoint, directory, started: new Date().toISOString(), attempts: [] }
const model = 'gemma3:4b'
const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
const ps = code => execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ProgressPreference = 'SilentlyContinue'; ${code}`, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', timeout: 15000 })
const launch = getOllamaServeLaunch('ollama.exe', { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` })
const runtime = spawn(launch.command, launch.args, launch.options)
let exited = false
runtime.on('exit', () => { exited = true })
runtime.on('error', () => { exited = true })
const budget = AbortSignal.timeout(300000)
function runners() {
  return JSON.parse(ps(`$owner = Get-CimInstance Win32_Process -Filter "ParentProcessId = ${runtime.pid}" | Where-Object Name -eq 'ollama.exe'; @($owner | ForEach-Object { Get-CimInstance Win32_Process -Filter "ParentProcessId = $($_.ProcessId)" } | Where-Object Name -eq 'llama-server.exe' | ForEach-Object { if ($_.CommandLine -match '--port[ =]+(\\d+)') { @{ pid=$_.ProcessId; port=[int]$Matches[1] } } }) | ConvertTo-Json -Compress -AsArray`.replace(' | ConvertTo-Json -Compress -AsArray', ' | ConvertTo-Json -Compress')) || '[]')
}
async function stream(url, body, connection, kind) {
  const record = { kind, connection, started: new Date().toISOString(), frames: 0, characters: 0, finished: false }
  report.attempts.push(record)
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', connection }, body: JSON.stringify(body), signal: AbortSignal.any([budget, AbortSignal.timeout(45000)]) })
    record.status = response.status
    let pending = ''
    const decoder = new TextDecoder()
    const consume = line => {
      if (!line.trim()) return
      if (line.startsWith('data: ')) line = line.slice(6)
      if (line === '[DONE]') { record.finished = true; return }
      const data = JSON.parse(line)
      record.frames++
      record.characters += (data.message?.content ?? data.choices?.[0]?.delta?.content ?? '').length
      if (data.done || data.choices?.[0]?.finish_reason) record.finished = true
      if (data.error) record.error = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
    }
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, { stream: true })
      const lines = pending.split('\n'); pending = lines.pop() ?? ''
      for (const line of lines) consume(line)
    }
    pending += decoder.decode(); if (pending.trim()) consume(pending)
  } catch (error) { record.error = `${error}${error.cause ? `; ${error.cause}` : ''}` }
  record.ended = new Date().toISOString()
  console.log(JSON.stringify(record))
  return record
}
// Observe HTTP framing directly, without fetch's parser hiding an incomplete tail.
async function rawStream(runnerPort, body, connection) {
  const record = { kind: 'raw-tcp', connection, completeChunks: false }
  report.attempts.push(record)
  await new Promise(resolve => {
    let bytes = Buffer.alloc(0)
    const socket = net.createConnection({ host: '127.0.0.1', port: runnerPort })
    socket.setTimeout(15000, () => { record.error = 'timeout'; socket.destroy() })
    socket.on('connect', () => {
      const payload = JSON.stringify(body)
      socket.write(`POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:${runnerPort}\r\nContent-Type: application/json\r\nConnection: ${connection}\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`)
    })
    socket.on('data', chunk => {
      bytes = Buffer.concat([bytes, chunk])
      if (bytes.length > 2000000) { record.error = 'response size limit'; socket.destroy(); return }
      const head = bytes.indexOf('\r\n\r\n')
      if (head < 0) return
      record.headers = bytes.subarray(0, head).toString()
      if (!/transfer-encoding: chunked/i.test(record.headers)) return
      let offset = head + 4
      while (offset < bytes.length) {
        const line = bytes.indexOf('\r\n', offset)
        if (line < 0) break
        const size = Number.parseInt(bytes.subarray(offset, line).toString(), 16)
        if (!Number.isFinite(size) || bytes.length < line + 2 + size + 2) break
        if (size === 0) { record.completeChunks = true; socket.end(); break }
        offset = line + 2 + size + 2
      }
    })
    socket.on('error', error => { record.error = `${error.code}: ${error.message}` })
    socket.on('close', () => {
      record.bytes = bytes.length
      record.doneMarker = bytes.includes(Buffer.from('data: [DONE]'))
      record.tail = bytes.subarray(-350).toString()
      record.tailHex = bytes.subarray(-32).toString('hex')
      resolve()
    })
  })
  console.log(JSON.stringify({ ...record, headers: undefined, tail: undefined, tailHex: undefined }))
}
try {
  console.log(`Evidence: ${directory}`)
  for (let i = 0; i < 120; i++) {
    assert(!exited, 'Test runtime exited')
    try { if ((await fetch(`${endpoint}/api/version`, { signal: AbortSignal.timeout(500) })).ok) break } catch { /* startup */ }
    await delay(250)
  }
  report.version = await (await fetch(`${endpoint}/api/version`)).json()
  const nativeBody = { model, messages: [{ role: 'user', content: 'Count from 1 to 40, separated by spaces. Output only numbers.' }], stream: true, keep_alive: '10m', options: { num_gpu: 999, num_ctx: 2048, num_predict: 96, temperature: 0, seed: 42 } }
  for (let i = 0; i < (process.env.VIEZAN_DIAGNOSE_RAW === '1' ? 2 : 6); i++) {
    budget.throwIfAborted()
    const record = await stream(`${endpoint}/api/chat`, nativeBody, 'keep-alive', 'ollama-native')
    record.runnersAfter = runners()
    const resident = await (await fetch(`${endpoint}/api/ps`)).json()
    record.residency = resident.models.map(m => ({ name: m.name, size: m.size, size_vram: m.size_vram }))
  }
  const candidates = [runners()].flat()
  assert(candidates.length === 1, 'Expected one test-owned model runner')
  const runner = candidates[0]
  report.directRunner = runner
  const runnerBase = `http://127.0.0.1:${runner.port}`
  for (let i = 0; i < (process.env.VIEZAN_DIAGNOSE_RAW === '1' ? 20 : 12); i++) {
    budget.throwIfAborted()
    const connection = i % 2 ? 'keep-alive' : 'close'
    if (process.env.VIEZAN_DIAGNOSE_RAW === '1') {
      await rawStream(runner.port, { model, messages: nativeBody.messages, stream: true, max_tokens: 96, temperature: 0, seed: 42 }, connection)
      continue
    }
    const record = await stream(`${runnerBase}/v1/chat/completions`, { model, messages: nativeBody.messages, stream: true, max_tokens: 96, temperature: 0, seed: 42 }, connection, 'direct-runner')
    record.health = await fetch(`${runnerBase}/health`, { signal: AbortSignal.timeout(2000) }).then(r => r.status).catch(e => String(e))
  }
  const readerPath = path.resolve('electron/ipc/__tests__/fixtures/readOllamaTestConsole.ps1').replaceAll("'", "''")
  report.runnerLog = ps(`& '${readerPath}' -SupervisorPid ${runtime.pid}`)
} catch (error) { report.failure = String(error); process.exitCode = 1 } finally {
  if (!exited) { try { execFileSync('taskkill', ['/PID', String(runtime.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }) } catch { /* verify below */ } }
  report.testListenerStopped = await fetch(`${endpoint}/api/version`, { signal: AbortSignal.timeout(2000) }).then(() => false).catch(() => true)
  report.productionAfter = await fetch(`${production}/api/ps`).then(r => r.json()).catch(e => ({ error: String(e) }))
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2))
  console.log(`Saved ${directory}/result.json`)
  if (!report.testListenerStopped) process.exitCode = 1
}
