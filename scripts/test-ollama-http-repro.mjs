import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const executable = process.argv[2]
assert(executable && path.isAbsolute(executable) && fs.existsSync(executable))
const listener = net.createServer()
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
const port = listener.address().port
await new Promise(resolve => listener.close(resolve))
const child = spawn(executable, [String(port)], { windowsHide: true, stdio: 'ignore' })
const endpoint = `http://127.0.0.1:${port}`
const report = { endpoint, executable, results: [] }
const validateFixed = process.env.VIEZAN_HTTP_VALIDATE_FIXED === '1'
try {
  for (let i = 0; i < 100; i++) {
    try { await (await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(500) })).text(); break } catch { await delay(50) }
  }
  for (const route of (validateFixed ? ['health', 'fixed'] : process.env.VIEZAN_HTTP_HEALTH_ONLY === '1' ? ['health'] : ['health', 'original', 'fixed'])) {
    for (const connection of (validateFixed ? ['keep-alive'] : ['close', 'keep-alive'])) {
      const result = { route, connection, total: validateFixed ? 1000 : 100, complete: 0, failures: [] }
      for (let i = 0; i < result.total; i++) {
        try {
          const response = await fetch(`${endpoint}/${route}`, { method: route === 'health' ? 'GET' : 'POST',
            headers: { connection, 'content-type': 'application/json' }, ...(route === 'health' ? {} : { body: '{}' }), signal: AbortSignal.timeout(3000) })
          const text = await response.text()
          assert(response.ok && (route === 'health' ? text === '{"status":"ok"}' : text.endsWith('data: [DONE]\n\n')))
          result.complete++
        } catch (error) { result.failures.push({ attempt: i, error: `${error}; ${error.cause ?? ''}` }) }
      }
      report.results.push(result)
      console.log(JSON.stringify({ ...result, failures: result.failures.length }))
    }
  }
  if (validateFixed) assert(report.results.every(result => result.failures.length === 0), 'Fixed provider with keep-alive still failed')
} finally {
  child.kill()
  const file = path.join(path.dirname(executable), `${path.basename(executable, '.exe')}-results-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(report, null, 2))
  console.log(file)
}
