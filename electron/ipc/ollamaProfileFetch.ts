import type { LocalAiPerformanceProfile } from '../../shared/localAiPerformance'
import { localAiProfileOptions } from './localAiPerformance'
import { isOllamaRunnerConnectionReset, recoverOllamaRunnerConnection } from './ollamaRunnerRecovery'

interface NativeReply {
  model?: string
  message?: { content?: string; thinking?: string; tool_calls?: Array<{ id?: string; function: { name: string; arguments: unknown } }> }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}
interface NativeStreamHead {
  reader: ReadableStreamDefaultReader<Uint8Array>
  decoder: TextDecoder
  pending: string
  replies: NativeReply[]
  eof: boolean
}
function nativeMessages(messages: Array<Record<string, unknown>>) {
  return messages.map(message => {
    let content = ''
    const images: string[] = []
    if (typeof message.content === 'string') content = message.content
    else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') content += part.text
        else if (part.type === 'image_url') {
          const image = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(part.image_url?.url ?? '')
          if (!image) throw new Error('Configured Ollama requests require inline image data')
          images.push(image[1])
        } else throw new Error('Unsupported local AI message content')
      }
    }
    return { role: message.role, content, ...(images.length ? { images } : {}),
      ...(message.tool_calls ? { tool_calls: (message.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>).map(call => ({
        id: call.id, type: 'function', function: { name: call.function.name, arguments: JSON.parse(call.function.arguments) },
      })) } : {}), ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}) }
  })
}
function completion(reply: NativeReply, streaming: boolean) {
  if (reply.error) throw new Error(reply.error)
  const calls = reply.message?.tool_calls?.map((call, index) => ({ id: call.id ?? `viezan-tool-${index}`, index, type: 'function',
    function: { name: call.function.name, arguments: typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments) } }))
  const finish = reply.done ? reply.done_reason === 'length' ? 'length' : calls?.length ? 'tool_calls' : 'stop' : null
  const message = { role: 'assistant', content: reply.message?.content ?? '', ...(reply.message?.thinking ? { reasoning: reply.message.thinking } : {}), ...(calls?.length ? { tool_calls: calls } : {}) }
  return { id: 'viezan-local', object: streaming ? 'chat.completion.chunk' : 'chat.completion', created: Math.floor(Date.now() / 1000), model: reply.model,
    choices: [{ index: 0, ...(streaming ? { delta: message } : { message }), finish_reason: finish }],
    ...(reply.done ? { usage: { prompt_tokens: reply.prompt_eval_count ?? 0, completion_tokens: reply.eval_count ?? 0,
      total_tokens: (reply.prompt_eval_count ?? 0) + (reply.eval_count ?? 0) } } : {}) }
}

/** Preserve the SDK contract while sending placement options to Ollama's native API. */
export function createOllamaProfileFetch(baseURL: string, profile?: LocalAiPerformanceProfile): typeof fetch | undefined {
  if (!profile) return undefined
  return async (input, init) => {
    const request = new Request(input, init)
    if (new URL(request.url).pathname !== '/v1/chat/completions') return fetch(request)
    const body = await request.json() as {
      model: string; messages: Array<Record<string, unknown>>; stream?: boolean; max_tokens?: number; max_completion_tokens?: number
      temperature?: number; top_p?: number; seed?: number; stop?: unknown; tools?: unknown[]; response_format?: { type?: string; json_schema?: { schema?: unknown } }
    }
    if (body.model !== profile.model) throw new Error('Local AI configuration does not match the requested model')
    const send = () => fetch(`${new URL(baseURL).origin}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: request.signal,
      body: JSON.stringify({ model: body.model, messages: nativeMessages(body.messages), stream: Boolean(body.stream), keep_alive: '30m',
        ...(body.tools ? { tools: body.tools } : {}),
        ...(body.response_format ? { format: body.response_format.type === 'json_object' ? 'json' : body.response_format.json_schema?.schema } : {}),
        options: { ...localAiProfileOptions(profile), num_predict: body.max_completion_tokens ?? body.max_tokens,
          temperature: body.temperature, top_p: body.top_p, seed: body.seed, stop: body.stop } }),
    })
    // Gate recovery on the first native frame. Once any SDK output is exposed,
    // a later failure must propagate instead of replaying assistant/tool tokens.
    const prepared = await recoverOllamaRunnerConnection<{ response: Response } | NativeStreamHead>(async () => {
      const native = await send()
      if (!native.ok) {
        const error = await native.json().catch(() => ({})) as { error?: string }
        const failure = new Error(error.error ?? `Ollama HTTP ${native.status}`)
        if (native.status === 500 && isOllamaRunnerConnectionReset(failure)) throw failure
        return { response: Response.json({ error: { message: failure.message, type: 'api_error' } }, { status: native.status }) }
      }
      if (!body.stream) return { response: Response.json(completion(await native.json() as NativeReply, false)) }
      if (!native.body) throw new Error('Ollama returned no response stream')
      const reader = native.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      try {
        while (true) {
          const next = await reader.read()
          pending += decoder.decode(next.value, { stream: !next.done })
          const lines = pending.split('\n')
          pending = lines.pop() ?? ''
          if (next.done && pending.trim()) { lines.push(pending); pending = '' }
          const replies = lines.filter(line => line.trim()).map(line => JSON.parse(line) as NativeReply)
          for (const reply of replies) if (reply.error) throw new Error(reply.error)
          if (replies.length || next.done) return { reader, decoder, pending, replies, eof: next.done }
        }
      } catch (error) { await reader.cancel().catch(() => undefined); reader.releaseLock(); throw error }
    }, request.signal, () => { /* No output has been exposed; retry the same native request. */ })
    if ('response' in prepared) return prepared.response
    const { reader, decoder } = prepared
    const encoder = new TextEncoder()
    let pending = prepared.pending
    let initial = true
    let ended = false
    return new Response(new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          let replies = prepared.replies
          let done = prepared.eof
          if (!initial) {
            const next = await reader.read()
            done = next.done
            pending += decoder.decode(next.value, { stream: !done })
            const lines = pending.split('\n')
            pending = lines.pop() ?? ''
            if (done && pending.trim()) lines.push(pending)
            replies = lines.filter(line => line.trim()).map(line => JSON.parse(line) as NativeReply)
          }
          initial = false
          for (const reply of replies) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(completion(reply, true))}\n\n`))
            ended ||= Boolean(reply.done)
          }
          if (done) {
            if (!ended) throw new Error('Ollama stream ended before completion')
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
            reader.releaseLock()
          }
        } catch (error) { await reader.cancel().catch(() => undefined); controller.error(error) }
      },
      async cancel(reason) { await reader.cancel(reason); reader.releaseLock() },
    }), { headers: { 'content-type': 'text/event-stream' } })
  }
}
