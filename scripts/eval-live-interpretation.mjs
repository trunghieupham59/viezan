#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
/** Opt-in local regression corpus. Run `npm run build:electron` first, then:
 * node scripts/eval-live-interpretation.mjs --endpoint http://127.0.0.1:11434/v1
 * Pass the endpoint actually selected by Viezan: on Windows its app-owned
 * patched runtime can use a dynamic port, unlike external Ollama on 11434.
 * Uses an already-running local model only; no STT, credentials or downloads.
 * Checks language/content anchors, not complete semantic translation quality.
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { endpoint: { type: 'string', default: 'http://127.0.0.1:11434/v1' }, model: { type: 'string', default: 'gemma3:4b' }, output: { type: 'string' }, 'compiled-dir': { type: 'string', default: 'dist-electron' } } })
const endpoint = new URL(values.endpoint)
if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error('This evaluation accepts only local HTTP endpoints without credentials.')
}
const require = createRequire(import.meta.url)
const { LiveInterpretationService } = require(resolve(values['compiled-dir'], 'services/LiveInterpretationService.js'))
const { buildLivePrompt, buildLiveSystemPrompt, liveOutputBudget } = require(resolve(values['compiled-dir'], 'ipc/liveTranslationPolicy.js'))
// Fail once on an unavailable runtime/model instead of retrying the whole corpus.
const models = await fetch(`${endpoint.href.replace(/\/$/, '')}/models`, { redirect: 'error', signal: AbortSignal.timeout(5_000) })
if (!models.ok || !(await models.json()).data?.some(model => model.id === values.model)) throw new Error('Requested local model is not available; no downloads attempted.')

const cases = [
  ['long-vi-condition', 'vi', 'ja', 'Tôi đồng ý ký hợp đồng chỉ khi bên bán bổ sung điều khoản bảo hành cho toàn bộ thiết bị.', '', [/契約/, /保証/, /場合|限り|なら|条件/], []],
  ['long-ja-final-negative', 'ja', 'vi', 'この条件に賛成するわけではありません。', '', [/không/i, /đồng ý|tán thành|ủng hộ/i], []],
  ['unfinished-vi-stop', 'vi', 'ja', 'Tôi chỉ ký nếu', '', [/署名|サイン/, /もし|場合|なら|条件/], [/保証|保険|支払/]],
  ['recorded-vi-open-condition', 'vi', 'ja', 'Tôi chỉ đồng ý ký hợp đồng nếu', '', [/署名|サイン/, /同意/, /限り/, /…/], [/保証|保険|支払|だけ/]],
  ['vi-open-negative-condition', 'vi', 'ja', 'Tôi không ký nếu', '', [/署名|サイン/, /ません|ない/, /もし…なら/], [/保証|保険|支払/]],
  ['vi-open-negative-agreement', 'vi', 'ja', 'Tôi không đồng ý ký hợp đồng nếu', '', [/同意/, /ません|ない/, /もし…なら/], [/保証|保険|支払/]],
  ['vi-open-number-condition', 'vi', 'ja', 'Tôi chỉ thanh toán 500 nếu', '', [/500/, /支払|払い/, /限り/, /…/], [/保証|保険/]],
  ['vi-plain-agreement-after-condition', 'vi', 'ja', 'Tôi đồng ý ký hợp đồng', '', [/同意/, /契約/], [/もし|場合|限り|…/]],
  ['unfinished-ja-stop', 'ja', 'vi', 'もし契約に署名するなら', '', [/nếu/i, /ký/i], [/bảo hành|thanh toán/i]],
  // Observed STT can omit punctuation; retaining every clause matters more
  // than fluency alone. This case previously dropped the delivery deadline.
  ['recorded-ja-long-unpunctuated', 'ja', 'vi', '納期だけでなく費用と安全性を確認しすべての条件を満たしている場合に限りこの計画を承認します。', '', [/thời hạn|hạn giao|giao hàng/i, /chi phí/i, /an toàn/i, /chỉ khi/i, /điều kiện/i], [/năng lượng/i]],
  ['ja-negative-until-confirmed', 'ja', 'vi', '担当者が確認してからでなければ、送金しないでください。', '', [/không/i, /chuyển tiền/i, /xác nhận/i], []],
  ['vi-book-fragment', 'vi', 'ja', 'Quyển sách về ô tô', 'Chị muốn xem quyển sách nào?', [/車/, /本|書籍/], [/たい|ですね|どの/]],
  ['vi-numeric-code', 'vi', 'ja', 'Mã cuối cùng là 1, 2, 3, 4, 5', '', [/コード|番号/, /1/, /5/], [/年齢|おばあ|歳|一番|二番/]],
  ['vi-asr-error-no-invention', 'vi', 'ja', 'Má cuối cùng là 1, 2, 3, 4, 5', '', [/Má|母|ママ/u, /1/, /5/], [/年齢|おばあ|歳|一番|二番/]],
  ['vi-recorded-noun-retention', 'vi', 'ja', 'Má cuối cùng là 1 2 3 4 5', '', [/Má|母|ママ/u, /1/, /5/], [/年齢|おばあ|歳/]],
  ['vi-correct-numeric-noun', 'vi', 'ja', 'Mã cuối cùng là 1 2 3 4 5', '', [/コード|番号/, /1/, /5/], [/母|年齢|歳/]],
  ['vi-real-mother-not-code', 'vi', 'ja', 'Má tôi 45 tuổi.', '', [/母/, /45/, /歳/], [/コード|番号/]],
  ['vi-number-fragment', 'vi', 'ja', 'Hai quyển sách.', 'Chị muốn mua mấy quyển sách?', [/2|二/, /本|冊/], [/たい|何冊/]],
  ['vi-question', 'vi', 'ja', 'Chị muốn xem quyển sách nào?', '', [/本/, /ど/], [/姉/]],
  ['vi-book', 'vi', 'ja', 'Quyển sách về ô tô. Chị chờ một chút.', 'Chị muốn xem quyển sách nào?', [/車/, /待/], [/どの本|妹|姉/]],
  ['vi-this', 'vi', 'ja', 'Quyển này à?', 'Chị muốn xem quyển sách nào? Quyển sách về ô tô.', [/本|これ|こちら/], [/Quyền/]],
  ['vi-here', 'vi', 'ja', 'Của chị đây!', 'Khách đang chờ quyển sách về ô tô. Người bán đưa sách cho khách.', [/こちら|渡し|どうぞ/], [/姉/]],
  ['ja-wait', 'ja', 'vi', '少々お待ちください。', '車の本を探しています。', [/đợi|chờ/i], []],
  ['ja-here', 'ja', 'vi', 'はい、どうぞ。', '店員が客に本を渡します。', [/vâng|dạ/i, /mời|lấy|nhận/i], []],
  ['ja-question', 'ja', 'vi', 'どの本をご覧になりたいですか。', '', [/sách/i, /nào/i], []],
  ['ja-book', 'ja', 'vi', '車の本です。', 'どの本をご覧になりたいですか。', [/sách/i, /xe|ô tô/i], [/nào/i]],
  ['ja-wait-context', 'ja', 'vi', '少々お待ちください。', 'どの本をご覧になりたいですか。 車の本です。', [/đợi|chờ/i], [/sách/i]],
  ['ja-this', 'ja', 'vi', 'この本ですか。', '車の本です。 少々お待ちください。', [/sách/i], [/đợi|chờ/i]],
  ['ja-yes', 'ja', 'vi', 'はい、そうです。', '少々お待ちください。 この本ですか。', [/đúng|vâng|dạ/i], []],
  ['ja-short-tail', 'ja', 'vi', 'どうぞ', 'この本ですか。 はい、そうです。', [/mời|lòng|lấy/i], []],
]
let requests = 0
const service = new LiveInterpretationService(async (request, options) => {
  requests += 1
  const response = await fetch(`${endpoint.href.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', redirect: 'error', signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: values.model, temperature: 0, max_tokens: liveOutputBudget(request.sourceText),
      messages: [
        { role: 'system', content: buildLiveSystemPrompt(request.sourceLang, request.targetLang) },
        { role: 'user', content: buildLivePrompt(request.sourceText, request.sourceLang, request.targetLang, options.live.context) },
      ],
    }),
  })
  if (!response.ok) throw new Error(`Local model HTTP ${response.status}`)
  const data = await response.json()
  const choice = data.choices?.[0]
  if (data.usage) options.onUsage?.({ inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens, estimated: false })
  if (choice?.finish_reason === 'length' || typeof choice?.message?.content !== 'string') throw new Error('Invalid or truncated local response')
  return choice.message.content
})
service.begin('local-evaluation')
const results = []
for (const [id, sourceLang, targetLang, sourceText, context, must, avoid] of cases) {
  const started = performance.now()
  const result = await service.translate({ sessionId: 'local-evaluation', segmentId: id, provider: 'local', model: values.model, sourceLang, targetLang, sourceText, context, subtitles: false })
  const text = result.success ? result.translatedText : ''
  results.push({ id, sourceText, context, result, elapsedMs: Math.round(performance.now() - started),
    anchorsPass: result.success && must.every(pattern => pattern.test(text)) && avoid.every(pattern => !pattern.test(text)) })
}
const first = cases[0]
const beforeCache = requests
const cached = await service.translate({ sessionId: 'local-evaluation', segmentId: 'cache-check', provider: 'local', model: values.model, sourceLang: first[1], targetLang: first[2], sourceText: first[3], context: first[4], subtitles: false })
const cachePass = cached.success && cached.cached && cached.usage.totalTokens === 0 && beforeCache === requests
const report = JSON.stringify({ model: values.model, endpoint: endpoint.origin, scope: 'Real local model + compiled service. Content anchors are not a full semantic quality judgment.', requests,
  anchorsPassed: results.filter(result => result.anchorsPass).length, total: results.length, cachePass, results }, null, 2)
if (values.output) await writeFile(values.output, report)
console.log(report)
if (!cachePass || results.some(result => !result.anchorsPass)) process.exitCode = 1
