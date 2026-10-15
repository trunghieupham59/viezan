#!/usr/bin/env node
/**
 * Manual evaluation harness for the translation style prompts.
 *
 * Sends the app's real translation prompts (system prompt + `buildPrompt`) to
 * any OpenAI-compatible chat endpoint, several times per case, and counts
 * mechanical defects: invented names, dropped content, slash-separated pronoun
 * alternatives and stray foreign scripts. It is NOT part of CI: output is
 * non-deterministic and hosted models cost money. Use it before and after
 * editing `electron/ipc/translatePrompts.ts`, and read the samples (`--show`)
 * because the counts cannot judge tone.
 *
 * Local Ollama (default):
 *   node scripts/eval-translation-styles.mjs
 * Hosted OpenAI-compatible endpoint (the key is read from the named env var,
 * never from a file and never printed):
 *   node scripts/eval-translation-styles.mjs --base-url https://api.openai.com/v1 \
 *     --model <model-id> --api-key-env OPENAI_API_KEY
 *
 * Options: --langs ja,vi --styles formal,business --sources honorific,tech
 *          --n 3 --temperature 0.3 --show --json out.json
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i]
  if (!token.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), 'true')
  else {
    args.set(token.slice(2), next)
    i += 1
  }
}
const list = (name, fallback) => (args.get(name) ?? fallback).split(',').map((item) => item.trim()).filter(Boolean)

const baseUrl = (args.get('base-url') ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, '')
const model = args.get('model') ?? 'gemma3:4b'
const apiKeyEnv = args.get('api-key-env')
const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : undefined
if (apiKeyEnv && !apiKey) {
  // Deliberately generic: nothing derived from the key lookup is printed.
  console.error('The environment variable named by --api-key-env is not set.')
  process.exit(1)
}
const samples = Number(args.get('n') ?? 3)
const temperature = args.has('temperature') ? Number(args.get('temperature')) : undefined
const langs = list('langs', 'ja,vi')
const styles = list('styles', 'general,formal,casual,business,technical,natural')

const ANY_HONORIFIC_NAME = /横山|田中|[A-Za-z一-龥]さん/
const SLASH_PRONOUNS = /(anh|chị|em|tôi|mình|bạn)\/(anh|chị|em|tôi|mình|bạn)/i
const FOREIGN_SCRIPT = { ja: /[가-힯Ѐ-ӿऀ-ॿ]/, vi: /[가-힯Ѐ-ӿऀ-ॿ぀-ヿ一-鿿]/ }

/** `must` lists patterns that have to survive the translation; `noName` flags invented honorific names. */
const SOURCES = {
  honorific: {
    text: 'Please tell Yokoyama-san that Tanaka-sensei will arrive at 3 pm.',
    must: { ja: [/横山/, /田中/], vi: [/Yokoyama/, /Tanaka/] },
  },
  condition: {
    text: 'If the payment fails, we will retry twice and then notify you by email.',
    must: { ja: [/失敗|エラー/, /2|二|２/, /メール/], vi: [/thanh toán/i, /hai|2/i, /email|thư/i] },
    noName: true,
  },
  tech: {
    text: 'The API returns a 429 status code when the rate limit is exceeded. Retry after the delay specified in the Retry-After header.',
    // Casual Japanese legitimately drops the "API" subject, so only Vietnamese checks it.
    must: { ja: [/制限/, /429/, /Retry-After/], vi: [/API/, /giới hạn/i, /429/, /Retry-After/] },
    noName: true,
  },
  chat: {
    text: "Hey, are you free tonight? Let's grab dinner, I'm starving lol",
    must: { ja: [/今夜|今晩|夜/, /ご飯|食事|夕食|ディナー/], vi: [/tối/i, /ăn/i] },
    noName: true,
  },
  command: {
    text: 'Run npm install, then set the DATABASE_URL environment variable.',
    must: { ja: [/npm install/, /DATABASE_URL/], vi: [/npm install/, /DATABASE_URL/] },
    noName: true,
  },
}
const sourceKeys = list('sources', Object.keys(SOURCES).join(','))

// Bundle the TypeScript prompt module so the harness always tests the code in the repo.
const tmp = mkdtempSync(join(tmpdir(), 'viezan-eval-'))
let prompts
try {
  const result = await build({
    entryPoints: [join(ROOT, 'electron', 'ipc', 'translatePrompts.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'error',
  })
  const file = join(tmp, 'translatePrompts.mjs')
  writeFileSync(file, result.outputFiles[0].text)
  prompts = await import(pathToFileURL(file).href)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

async function ask(userPrompt) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          stream: false,
          ...(temperature === undefined ? {} : { temperature }),
          messages: [{ role: 'system', content: prompts.SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
        }),
      })
      const body = await response.json()
      const text = body?.choices?.[0]?.message?.content
      if (typeof text === 'string' && text.trim()) return text.trim().replace(/\s*\n\s*/g, ' ⏎ ')
    } catch {
      // Retry below: local runners occasionally drop a connection.
    }
    await new Promise((done) => setTimeout(done, 2000))
  }
  return null
}

function defects(lang, source, output) {
  const found = []
  for (const pattern of source.must[lang] ?? []) if (!pattern.test(output)) found.push(`missing ${pattern.source}`)
  if (source.noName && ANY_HONORIFIC_NAME.test(output)) found.push('invented name')
  if (lang === 'vi' && SLASH_PRONOUNS.test(output)) found.push('slash pronouns')
  if (FOREIGN_SCRIPT[lang]?.test(output)) found.push('foreign script')
  return found
}

const rows = []
for (const lang of langs) {
  for (const style of styles) {
    for (const key of sourceKeys) {
      const source = SOURCES[key]
      if (!source) throw new Error(`Unknown source: ${key}`)
      const userPrompt = prompts.buildPrompt(source.text, 'en', lang, false, style)
      const outputs = []
      for (let i = 0; i < samples; i += 1) outputs.push(await ask(userPrompt))
      const tally = new Map()
      let failed = 0
      for (const output of outputs) {
        if (output === null) {
          failed += 1
          continue
        }
        for (const defect of defects(lang, source, output)) tally.set(defect, (tally.get(defect) ?? 0) + 1)
      }
      rows.push({ lang, style, source: key, samples, requestErrors: failed, defects: Object.fromEntries(tally), outputs })
    }
  }
}

console.log(`model=${model} endpoint=${baseUrl} samples=${samples}${temperature === undefined ? '' : ` temperature=${temperature}`}\n`)
for (const row of rows) {
  const flags = Object.entries(row.defects).map(([name, count]) => `${name} ${count}/${row.samples}`).join(', ')
  const errors = row.requestErrors ? ` [${row.requestErrors} request errors]` : ''
  console.log(`${row.lang} ${row.style.padEnd(9)} ${row.source.padEnd(9)} ${flags || 'ok'}${errors}`)
  if (args.has('show')) for (const output of row.outputs) console.log(`    ${output ?? '(no response)'}`)
}
if (args.has('json')) writeFileSync(resolve(args.get('json')), JSON.stringify(rows, null, 2))
