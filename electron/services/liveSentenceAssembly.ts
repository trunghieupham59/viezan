import type { LiveAssemblyRequest, LiveAssemblyUpdate, LiveSegmentState } from '../../shared/liveInterpretation'
import { LIVE_SOURCE_CHARS } from '../ipc/liveTranslationPolicy'

/** Capture pauses are hints, not sentence boundaries. The renderer reports
 * sustained silence only after all captured/STT work has drained. */
export const LIVE_PREVIEW_AUDIO_MS = 12_000

const terminal = /[.!?。！？]["”’」』）)]*$/u
const standalone = /^(?:はい|いいえ|どうぞ|ありがとう(?:ございます)?|vâng|dạ|đúng vậy|cảm ơn|yes|no|thanks)[.!?。！？]*$/iu
const continuation = /^(?:(?:chỉ khi|chỉ nếu|với điều kiện|trừ khi|nếu|nhưng|mà|vì|bởi vì|thì|only if|unless|provided that|but|because|which|that)(?!\p{L})|わけでは|のでは|ではなく|というわけ|とは限ら|けれど|しかし|ただし|場合|ので|けど)/iu

export function hasOpenDependency(text: string): boolean {
  const bare = text.replace(/[.!?。！？…、,\s]+$/gu, '')
  if (/(?:(?<!\p{L})(?:nếu|khi|vì|nhưng|và|hoặc|rằng|là|để|của|if|unless|because|although|and|or|that|to)|(?:なら|ので|のに|けれど|けど|ですが|だが|場合は|については|を|という))$/iu.test(bare)) return true
  // Conservative: do not call a conditional antecedent a complete statement.
  return /^(?:nếu|if|unless|although)(?!\p{L})/iu.test(bare)
    && !/(?:(?<!\p{L})thì(?!\p{L})|[,，、])/iu.test(bare)
}

function joinSource(left: string, right: string, language: string): string {
  if (!left) return right
  const continuing = continuation.test(right) || hasOpenDependency(left)
  const prefix = continuing ? left.replace(/[.!?。！？]+$/u, '') : left
  return `${prefix}${language === 'ja' || language.startsWith('zh') ? '' : ' '}${right}`
}

interface OpenUnit {
  update: LiveAssemblyUpdate
  audioMs: number
  previewIssued: boolean
  translatedSource: string
  paused: boolean
}

/** One mutable tail, at most one preview plus one final translation per unit.
 * No model calls, transcript history replay, or two-chunk forced finalization. */
export class LiveSentenceAssembly {
  private open: OpenUnit | null = null
  private nextId = 0
  private context = ''
  private sequence = 0
  private languages = ''
  private stopped = false

  get hasOpen(): boolean { return this.open !== null }

  accept(request: LiveAssemblyRequest): LiveAssemblyUpdate[] {
    if (this.stopped) {
      if (request.action === 'stop') return []
      throw new Error('SESSION_STOPPED')
    }
    const languages = `${request.sourceLang}:${request.targetLang}`
    if (this.languages && this.languages !== languages) throw new Error('INVALID_INPUT')
    this.languages = languages
    const updates: LiveAssemblyUpdate[] = []
    if (request.action !== 'append') {
      if (request.action === 'stop') {
        this.finish(updates, this.open && (!terminal.test(this.open.update.sourceText) && !standalone.test(this.open.update.sourceText) || hasOpenDependency(this.open.update.sourceText)) ? 'incomplete' : 'final')
        this.stopped = true
      } else if (this.open && !hasOpenDependency(this.open.update.sourceText)) {
        this.finish(updates, 'final')
      }
      return updates
    }
    if (request.sequence <= this.sequence) throw new Error('INVALID_INPUT')
    this.sequence = request.sequence
    let text = request.sourceText.trim()
    // A following independent clause confirms the preceding punctuated unit.
    // A conditional/negative suffix instead revises the still-open unit.
    if (this.open?.paused && terminal.test(this.open.update.sourceText)
      && !hasOpenDependency(this.open.update.sourceText) && !continuation.test(text)) {
      this.finish(updates, 'final')
    }
    const combined = joinSource(this.open?.update.sourceText ?? '', text, request.sourceLang)
    text = combined
    // Bound the editable source window without silently dropping its prefix.
    // Prefer a clause boundary; a forced split remains explicitly incomplete.
    while (text.length > LIVE_SOURCE_CHARS) {
      const prefix = text.slice(0, LIVE_SOURCE_CHARS)
      const bounds = [...prefix.matchAll(/[,;，、；]\s*|\s+/gu)]
      let cut = bounds[bounds.length - 1]?.index ?? LIVE_SOURCE_CHARS
      if (cut < LIVE_SOURCE_CHARS / 2) cut = LIVE_SOURCE_CHARS
      if (/[\uD800-\uDBFF]/u.test(text[cut - 1])) cut -= 1
      this.setOpen(text.slice(0, cut).trim(), request)
      this.finish(updates, 'incomplete')
      text = text.slice(cut).trim()
    }
    this.setOpen(text, request)
    if (!this.open) return updates
    // One-word replies do not need a lookahead chunk.
    if (standalone.test(text)) {
      this.finish(updates, 'final')
    } else {
      const open = this.open
      const preview = !open.previewIssued && open.audioMs >= LIVE_PREVIEW_AUDIO_MS
      if (preview) {
        open.previewIssued = true
        open.translatedSource = text
      }
      open.update.state = open.previewIssued ? 'provisional' : 'pending'
      updates.push({ ...open.update, translate: preview })
    }
    return updates
  }

  private setOpen(text: string, request: LiveAssemblyRequest): void {
    if (!text) return
    if (!this.open) {
      this.open = {
        update: {
          segmentId: `unit-${request.sessionId.slice(-64)}-${++this.nextId}`, revision: 1, sourceText: text,
          context: this.context, speaker: request.speaker, timestamp: request.timestamp,
          state: 'pending', translate: false,
        },
        audioMs: request.durationMs, previewIssued: false, translatedSource: '', paused: request.pause,
      }
    } else {
      if (this.open.update.sourceText !== text) this.open.update.revision += 1
      this.open.update.sourceText = text
      this.open.audioMs += request.durationMs
      this.open.paused = request.pause
    }
  }

  private finish(updates: LiveAssemblyUpdate[], state: LiveSegmentState): void {
    if (!this.open) return
    const { update, translatedSource } = this.open
    updates.push({ ...update, state, translate: update.sourceText !== translatedSource })
    // Only a settled complete source may become reference material.
    this.context = state === 'final' ? update.sourceText.slice(-160) : ''
    this.open = null
  }
}
