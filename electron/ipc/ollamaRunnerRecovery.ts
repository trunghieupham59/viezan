import { setTimeout as delay } from 'node:timers/promises'

/** Match Ollama's internal runner transport failure, never arbitrary HTTP 500s. */
export function isOllamaRunnerConnectionReset(error: unknown): error is Error {
  if (!(error instanceof Error)) return false
  return /127\.0\.0\.1:\d+/.test(error.message)
    && /health resp:|\/tokenize|llama-server response|while running the model/i.test(error.message)
    && /connection was forcibly closed|connection reset by peer|ECONNRESET/i.test(error.message)
}

/** Only for inference that can be repeated without exposing duplicate output. */
export async function recoverOllamaRunnerConnection<T>(
  operation: () => Promise<T>, signal: AbortSignal, onRecovery: (error: Error) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try { return await operation() } catch (error) {
      signal.throwIfAborted()
      if (attempt >= 3 || !isOllamaRunnerConnectionReset(error)) throw error
      onRecovery(error)
      await delay(250 * 2 ** attempt, undefined, { signal })
    }
  }
}
