/**
 * Deep Research Service — Iterative Multi-loop Pipeline
 *
 * True deep research with feedback loops, not a simple 1-pass search:
 *
 *   Phase 1 — Initial Analysis
 *     AI breaks the question into key aspects and research questions.
 *
 *   Phase 2 — First-Pass Research (Breadth)
 *     Web search + AI analysis for each aspect. Builds initial knowledge base.
 *
 *   Phase 3 — Gap Analysis Loop (up to MAX_GAP_ITERATIONS rounds)
 *     AI evaluates all findings and identifies:
 *       • What's still unclear / missing?
 *       • What contradictions need resolution?
 *     Targeted searches fill those gaps. Loops until AI is satisfied or limit reached.
 *
 *   Phase 4 — Cross-Reference & Confidence
 *     AI reviews ALL findings for contradictions and assigns confidence levels
 *     (Confirmed / Uncertain / Contradicted).
 *
 *   Phase 5 — Final Synthesis
 *     Comprehensive answer with source citations and confidence indicators.
 *
 * With Tavily web search: real-time data at every phase.
 * Without Tavily key: AI-knowledge-only with explicit staleness warnings.
 *
 * i18n: All user-facing step labels, error fallbacks and Markdown prefixes
 * are passed in via the {@link DeepResearchUiText} object so the service
 * stays language-agnostic. AI-facing system prompts intentionally remain
 * in English to avoid biasing the model's output language (the AI is told
 * via LANG_RULE to mirror the user's question language).
 */

import type { DeepResearchResumeState } from '../types'
import { tpl } from '../utils/tpl'
import type { ChatMessageContent } from './chatService'
import { chatService } from './chatService'
import {
  type ActionableSearchFallback,
  formatWebSearchResults,
  getActionableSearchFallback,
  getCurrentLocaleDateTime,
  hasWebSearchApi,
  isSearchUnavailable,
} from './searchResultFormatting'
import { stripTrailingSourcesSection } from './smartThinkingService'


// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of gap-analysis → targeted-search iterations */
const MAX_GAP_ITERATIONS = 3

/** Maximum number of gaps to chase per iteration */
const MAX_GAPS_PER_ROUND = 4

/** Maximum number of aspects investigated in the survey phase */
const MAX_ASPECTS = 6

/** Maximum search results per query */
const MAX_SEARCH_RESULTS = 8

/** Characters of each search result handed to the analysis step */
const MAX_RESULT_CHARS = 1500

/** Maximum characters of earlier conversation given to the pipeline for resolving references */
const MAX_HISTORY_CHARS = 4000

export const DEEP_RESEARCH_CANCELLED_ERROR = 'deep-research-cancelled'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Logical phase identifier passed to {@link DeepResearchCallbacks.onStepStart}.
 * The renderer uses it to group consecutive steps of the same phase into one
 * compact pill (e.g. "Khảo sát · 4 khía cạnh") instead of rendering N rows.
 *
 * Kept loose (`string` union) so the service stays decoupled from renderer
 * types — `src/types/index.ts` defines the matching `ResearchStepPhase`.
 */
export type DeepResearchStepPhase =
  | 'analyze'
  | 'survey'
  | 'gap'
  | 'deep'
  | 'cross'
  | 'synth'

export interface DeepResearchStepMeta {
  /** Phase this step belongs to (drives the grouped pill UI). */
  phase: DeepResearchStepPhase
  /**
   * Optional aspect / sub-question descriptor — surfaced inside the hover
   * info popover so users can see what each grouped step researched. Empty
   * for phase-level steps (analyze / cross / synth).
   */
  aspect?: string
}

export interface DeepResearchCallbacks {
  /** Called when a new step starts. Must return the generated message ID. */
  onStepStart: (label: string, meta: DeepResearchStepMeta) => string
  /** Called when a step completes. `isFinal` = true only for the synthesis step. */
  onStepComplete: (msgId: string, content: string, isFinal: boolean) => void
  /** Called when a step fails with an error. */
  onStepError: (msgId: string, error: string) => void
  /**
   * Persistence hook — fired whenever a phase finishes successfully so the
   * caller can snapshot the in-progress pipeline state. Pass `null` once
   * the synthesis phase completes (or when the whole pipeline succeeds) so
   * the caller can clear the resume snapshot.
   *
   * Optional: callers that don't care about resume can omit this.
   */
  onResumeStateChange?: (state: DeepResearchResumeState | null) => void
  /**
   * Fired at most once per run when a configured web-search provider rejected the
   * key or ran out of quota and the free provider answered instead.
   */
  onSearchFallback?: (info: ActionableSearchFallback) => void
  /** Fired at most once per run when every search provider failed (no live sources). */
  onSearchUnavailable?: () => void
}



/**
 * Localized strings rendered into the chat thread by the deep-research pipeline.
 *
 * Keys whose template uses `{name}` placeholders accept variables consumed by
 * {@link tpl}. Callers should map renderer i18n keys → fields here.
 */
export interface DeepResearchUiText {
  stepAnalyze: string
  /** Template `{aspect}` */
  stepRound1: string
  /** Template `{round}` */
  stepGap: string
  /** Template `{aspect}` */
  stepDeep: string
  stepCross: string
  stepSynth: string
  modeRealtime: string
  modeAiOnly: string
  /** Template `{count}` */
  willStudy: string
  /** Template `{context}` */
  imageContext: string
  /** Template `{terms}` */
  imageTerms: string
  imageKbLabel: string
  complete: string
  /** Template `{count}` */
  gapsFound: string
  deeperLabel: string
  /** Template `{error}` */
  /** @deprecated Unused: a failed step is reported through `onStepError`, never stored as a finding. */
  cannotAnalyze?: string
  /** Template `{error}` */
  /** @deprecated Unused — see `cannotAnalyze`. */
  cannotResearch?: string
  /** Template `{error}` */
  /** @deprecated Unused — see `cannotAnalyze`. */
  crossFailed?: string
  /** Template `{error}` */
  /** @deprecated Unused — see `cannotAnalyze`. */
  crossFailedInline?: string
  /** Template `{error}` */
  /** @deprecated Unused — see `cannotAnalyze`. */
  synthFailed?: string
  /** Template `{error}` */
  /** @deprecated Unused — see `cannotAnalyze`. */
  errorInline?: string
  errorAnalyze: string
  errorGeneric: string
  errorEval: string
  errorCross: string
  errorSynth: string
  errorUnknown: string
  webSummary: string
  /** Heading of the source list appended to the final answer. Defaults to "Sources". */
  sourcesTitle?: string
}

export interface DeepResearchParams {
  provider: string
  model: string
  question: string
  /**
   * Plain-text transcript of the conversation before `question`. Used only to
   * resolve references such as "compare it with the previous one"; it is never
   * researched itself.
   */
  history?: string
  images?: DeepResearchImageAttachment[]
  uiText: DeepResearchUiText
  callbacks: DeepResearchCallbacks
  /**
   * AbortSignal for user-initiated cancellation. The orchestration polls the
   * signal between phases / aspects so the multi-step pipeline can short-
   * circuit cleanly when the user clicks Stop.
   */
  signal?: AbortSignal
  /**
   * Forward the user's "Careful Reasoning" toggle to the synthesis step (the
   * step that produces the user-visible final answer). Intermediate steps
   * (analyze, per-aspect research, gap analysis, deep-dive, cross-reference)
   * intentionally skip the directive — they emit structured JSON or compact
   * notes where the verbose math-discipline preamble is wasted tokens.
   */
  carefulReasoning?: boolean
  /**
   * Optional snapshot of a previous, interrupted run. When supplied, the
   * pipeline resumes from `lastCompletedPhase` instead of starting fresh —
   * skipping all phases the snapshot already finished, restoring the
   * accumulated knowledge base, and continuing with the next phase.
   *
   * Used by the renderer when the user clicks "Tiếp tục nghiên cứu" on a
   * stopped Deep Research run.
   */
  resumeState?: DeepResearchResumeState
}



export interface DeepResearchImageAttachment {
  imageBase64: string
  imageMimeType: string
}

interface GapAnalysisResult {
  isComplete: boolean
  gaps: string[]
  queries: string[]
}

type ChatServiceResult = Awaited<ReturnType<typeof chatService.send>>

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ResearchSource {
  title: string
  url: string
}

/**
 * Run one web search and format it for the analysis step. Results are numbered
 * through `registerSources` so every citation in the run is globally unique
 * ([1] always means the same page) instead of restarting at [1] per search.
 */
async function webSearch(
  query: string,
  webSummaryLabel: string,
  registerSources: (results: ResearchSource[]) => number[],
  onFallback?: (info: ActionableSearchFallback) => void,
  onUnavailable?: () => void,
): Promise<string> {
  if (!hasWebSearchApi()) return ''
  try {
    const result = await window.api.webSearch({ query: query.slice(0, 200), maxResults: MAX_SEARCH_RESULTS })
    const fallback = getActionableSearchFallback(result)
    if (fallback) onFallback?.(fallback)
    if (isSearchUnavailable(result)) onUnavailable?.()
    if (result.success && result.results?.length) {
      return formatWebSearchResults(result.results, result.answer, webSummaryLabel, {
        maxCharsPerResult: MAX_RESULT_CHARS,
        numbers: registerSources(result.results),
      })
    }
  } catch { /* ignore */ }
  return ''
}

/** Compact transcript of the most recent conversation, newest turns kept when over budget. */
function limitHistory(history: string | undefined): string {
  const trimmed = history?.trim() ?? ''
  return trimmed.length > MAX_HISTORY_CHARS ? trimmed.slice(-MAX_HISTORY_CHARS) : trimmed
}

/**
 * Remove citation markers that point at no real source. With `sourceCount`
 * numbered sources, any [n] above it (or any [n] at all when there are none)
 * was invented by the model. Code (fenced or inline) and Markdown links are left alone.
 */
export function removeUnknownCitations(text: string, sourceCount: number): string {
  const citation = /(?<=^|[\s.,;:!?)\]])\[(\d{1,3})\](?!\()/gm
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/)
  let removed = false
  const cleaned = parts
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part.replace(citation, (match, digits: string) => {
        if (Number(digits) <= sourceCount) return match
        removed = true
        return ''
      })
    })
    .join('')
  return removed ? cleaned.replace(/[ \t]+(?=[.,;:!?])/g, '').replace(/[ \t]+$/gm, '') : text
}

/** Markdown list of the sources the answer relied on, keeping each source's global [n]. */
function buildSourcesMarkdown(sources: ResearchSource[], answer: string, title: string): string {
  if (sources.length === 0) return ''
  const cited = new Set([...answer.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number(match[1])))
  const lines = sources
    .map((source, index) => ({ source, number: index + 1 }))
    .filter(({ number }) => cited.size === 0 || cited.has(number))
    .map(({ source, number }) => `- **[${number}]** [${source.title || source.url}](${source.url})`)
  return lines.length > 0 ? `\n\n---\n**${title}**\n${lines.join('\n')}` : ''
}

function getReply(result: ChatServiceResult): string | null {
  const reply = result.reply?.trim()
  return result.success && reply ? reply : null
}

function describeChatFailure(result: ChatServiceResult, fallback: string): string {
  if (result.error?.trim()) return result.error
  if (result.success && !result.reply?.trim()) return fallback
  return fallback
}

function buildResearchContent(text: string, images: DeepResearchImageAttachment[] = []): ChatMessageContent[] {
  const content: ChatMessageContent[] = images.map((image) => ({
    type: 'image',
    imageBase64: image.imageBase64,
    imageMimeType: image.imageMimeType,
  }))

  if (text.trim()) {
    content.push({ type: 'text', text })
  }

  return content.length > 0 ? content : [{ type: 'text', text }]
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

/**
 * Build a web-search query. AI-planned topics are already self-contained, so
 * appending the whole question only dilutes them; the question is added solely
 * when the topic is a generic fallback (`includeQuestion`).
 */
function buildSearchQuery(
  topic: string,
  question: string,
  imageContext: string,
  imageSearchTerms: string[],
  includeQuestion = false,
): string {
  const visualContext = imageSearchTerms.length > 0 ? imageSearchTerms.join(' ') : imageContext
  return [visualContext, topic, includeQuestion ? question : '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

function deriveCompletedSurveyIndexes(
  aspects: string[],
  knowledgeBase: Array<{ label: string; content: string }>,
  completedAspects: string[] = [],
): number[] {
  const completedIndexes = new Set<number>()
  const markFirstMatchingAspect = (label: string) => {
    const index = aspects.findIndex((aspect, candidateIndex) =>
      aspect === label && !completedIndexes.has(candidateIndex)
    )
    if (index >= 0) completedIndexes.add(index)
  }

  for (const item of knowledgeBase) {
    markFirstMatchingAspect(item.label)
  }
  for (const aspect of completedAspects) {
    markFirstMatchingAspect(aspect)
  }

  return [...completedIndexes].sort((a, b) => a - b)
}

// ─── Language rule (prepended to every AI-facing prompt) ─────────────────────

const LANG_RULE = `LANGUAGE RULE — NON-NEGOTIABLE:
1. Detect the language of the user's original question.
2. Write your ENTIRE response in that exact same language.
3. Do NOT switch to Vietnamese, English, or any other language — even if these instructions are written in English.
4. Examples: Japanese question → Japanese answer. Korean question → Korean answer. French question → French answer.

`

// ─── System Prompts (written in English to avoid language bias) ───────────────

const ANALYZE_PROMPT = (date: string, hasImages: boolean) => `${LANG_RULE}You are a research expert. The question was asked at: ${date}.
${hasImages
    ? `The user attached image(s) as part of the research request. Inspect the image(s), identify visible entities/text/context, and use that visual information when choosing research aspects and search terms.

`
    : ''}Analyze the user's question and identify the 4-6 most important aspects to research in depth. Cover different angles (facts, causes, current status, comparisons, risks, counter-arguments) rather than restating the same point.
The question may be followed by earlier conversation context: use it only to resolve references (e.g. "it", "the previous one") so every aspect names its concrete subject.
Each aspect MUST be a self-contained phrase that names the main subject explicitly, because it is also used as a standalone web search query.
Return ONLY valid JSON, no other text:
${hasImages
    ? '{"aspects": ["aspect 1", "aspect 2", "aspect 3"], "imageContext": "concise visual context from the attached image(s)", "searchTerms": ["specific entity or keyword from image 1", "specific entity or keyword from image 2"]}'
    : '{"aspects": ["aspect 1", "aspect 2", "aspect 3"]}'}`

const RESEARCH_PROMPT = (date: string, aspect: string, question: string, webCtx: string, imageContext: string) =>
  webCtx
    ? `${LANG_RULE}You are an expert analyst. Timestamp: ${date}.
Original question: ${question}
Aspect to analyze: ${aspect}
${imageContext ? `Attached image context: ${imageContext}\n` : ''}

━━━ REAL-TIME WEB SEARCH RESULTS ━━━
${webCtx}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Analyze the web data above in depth. Extract concrete facts (names, numbers, dates, versions, quotes) and state the effective date when it matters. Cite every claim with the source number exactly as printed in the results, e.g. [3] — these numbers are global for the whole research and must not be renumbered. Note contradictions and weak or outdated sources. Prioritize web data over your training knowledge, and say clearly when the results do not answer the aspect.`
    : `${LANG_RULE}You are an expert analyst. Timestamp: ${date}.
Original question: ${question}
Aspect to analyze: ${aspect}
${imageContext ? `Attached image context: ${imageContext}\n` : ''}

No web search available — using training data only.
Please: state your training cutoff clearly, and mark information that MAY HAVE CHANGED since then.
There are NO numbered sources in this research: do not write [n] citation markers.`

const GAP_ANALYSIS_PROMPT = (date: string) =>
  `${LANG_RULE}You are a research quality evaluator. Timestamp: ${date}.
Evaluate the original question and research findings provided by the user.
Is the research sufficient to answer the original question ACCURATELY and COMPLETELY?
- What important information is still missing?
- Are there any contradictions that need verification?
- Which aspects need deeper investigation?
- Which important claims have no numbered source [n] behind them?

Each entry in "queries" must be a self-contained web search query that names its subject explicitly (it is sent to a search engine as-is, without the original question). Provide one query per gap, in the same order.

Return ONLY valid JSON:
{
  "isComplete": true/false,
  "reasoning": "brief reason",
  "gaps": ["gap 1", "gap 2"],
  "queries": ["specific search query 1", "specific search query 2"]
}`

const GAP_ANALYSIS_CONTENT = (question: string, allFindings: string, imageContext: string) =>
  `Original question: ${question}
${imageContext ? `Attached image context: ${imageContext}\n` : ''}

━━━ ALL RESEARCH FINDINGS SO FAR ━━━
${allFindings}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

const CROSS_REFERENCE_PROMPT = (date: string, hadWeb: boolean) =>
  `${LANG_RULE}You are a research verification expert. Timestamp: ${date}.
${hadWeb ? 'Data was collected from real-time web search.' : 'Data is from AI training data only.'}

The user will provide the original question and all research findings.
Perform cross-reference analysis on those findings:
1. List points CONFIRMED by multiple sources
2. List points UNCERTAIN — from only one source or potentially outdated
3. List points CONTRADICTED across sources and explain

${hadWeb ? 'Refer to each point with its source numbers [n] exactly as they appear in the findings. ' : 'There are no numbered sources, so do not write [n] citation markers. '}Be well-structured and do not drop important specifics (names, numbers, dates).`

const CROSS_REFERENCE_CONTENT = (question: string, allFindings: string, imageContext: string) =>
  `Original question: ${question}
${imageContext ? `Attached image context: ${imageContext}\n` : ''}

━━━ ALL RESEARCH FINDINGS ━━━
${allFindings}
━━━━━━━━━━━━━━━━━━━━━━━━━━━`

const SYNTHESIS_PROMPT = (date: string, hadWeb: boolean, unresearched: string[]) => {
  const note = hadWeb
    ? 'Findings cite web sources by global number, e.g. [3]. Claims without a number come from model knowledge: say so instead of presenting them as verified.'
    : 'Data from AI training only. Add a "## Accuracy Note" section at the end to warn the user about potential staleness.'
  const gaps = unresearched.length > 0
    ? `\n\nThese aspects could NOT be researched because their step failed: ${unresearched.join('; ')}. State this limitation honestly in the answer instead of filling the gap with guesses.`
    : ''
  return `${LANG_RULE}You are a research synthesis expert. Timestamp: ${date}. ${note}${gaps}

Answer the user's ORIGINAL question directly and completely. Lead with the answer, then support it. Keep concrete specifics (names, numbers, dates, versions) from the findings; do not generalise them away.

Structure:
- Clear headings (##) and bullet points where they help
- ${hadWeb ? 'Cite claims inline with the source numbers from the findings, e.g. [2][5]; never invent a number that does not appear in the findings' : 'There are NO numbered sources: never write [n] citation markers, and say plainly which claims are model knowledge'}
- Mark confidence where it matters: Confirmed / Uncertain / Contradicted
- Surface disagreements between sources instead of merging them
- End with a "## Conclusion" section
- Do NOT add a sources / references list${hadWeb ? ': the UI appends the numbered source list automatically' : ''}`
}

// ─── Default aspects (English — neutral, no language bias) ───────────────────

const DEFAULT_ASPECTS = [
  'Background and overview',
  'Detailed analysis and key factors',
  'Latest information and trends',
]

// ─── Main pipeline ────────────────────────────────────────────────────────────

export const deepResearchService = {
  async run({ provider, model, question, history, images = [], uiText, callbacks, signal, carefulReasoning, resumeState }: DeepResearchParams): Promise<void> {

    const date = getCurrentLocaleDateTime()
    // `question` stays the raw user text (search queries, resume snapshot). The
    // framed version adds earlier conversation so the model can resolve
    // references like "compare it with the previous one".
    const conversationContext = limitHistory(history)
    const framedQuestion = conversationContext
      ? `${question}\n\n(Earlier conversation, only to resolve references in the question:\n${conversationContext})`
      : question
    const webAvailable = hasWebSearchApi()
    const { onStepStart, onStepComplete, onStepError, onResumeStateChange } = callbacks
    // Report a search-provider fallback once per run, not once per query.
    let searchFallbackReported = false
    const reportSearchFallback = (info: ActionableSearchFallback) => {
      if (searchFallbackReported) return
      searchFallbackReported = true
      callbacks.onSearchFallback?.(info)
    }
    let searchUnavailableReported = false
    const reportSearchUnavailable = () => {
      if (searchUnavailableReported) return
      searchUnavailableReported = true
      callbacks.onSearchUnavailable?.()
    }
    const hasImages = images.length > 0

    /**
     * Phase ordering helper used to decide whether a given phase should run
     * during a resumed pipeline. We compare the index of `phase` to the index
     * of `resumeState.lastCompletedPhase`; if `phase` is at or before the
     * snapshot's last-completed phase, it has already finished and we skip
     * the work (but still emit a synthetic step bubble so the UI shows the
     * timeline correctly).
     */
    const PHASE_ORDER: DeepResearchStepPhase[] = ['analyze', 'survey', 'gap', 'deep', 'cross', 'synth']
    const phaseIndex = (p: DeepResearchStepPhase): number => PHASE_ORDER.indexOf(p)
    const isPhaseDone = (p: DeepResearchStepPhase): boolean => {
      if (!resumeState) return false
      return phaseIndex(p) <= phaseIndex(resumeState.lastCompletedPhase)
    }
    const isPastPhase = (p: DeepResearchStepPhase): boolean => {
      if (!resumeState) return false
      return phaseIndex(resumeState.lastCompletedPhase) > phaseIndex(p)
    }


    /**
     * Sentinel error message for Deep Research user cancellation. The
     * orchestration polls `signal.aborted` between phases and throws this
     * to halt the pipeline early. The renderer treats the message as a
     * non-error completion.
     */
    const CANCELLED = DEEP_RESEARCH_CANCELLED_ERROR
    /** Throws the cancellation sentinel when the user aborted. */
    const throwIfCancelled = () => {
      if (signal?.aborted) throw new Error(CANCELLED)
    }

    /**
     * Wraps `chatService.sendAbortable` so the caller doesn't have to thread
     * `signal` through every `await`. The signal forwards to the streaming
     * IPC under the hood, which lets the user kill the in-flight provider
     * call within milliseconds when they click Stop — instead of waiting for
     * the current step's HTTP response to finish naturally.
     */
    const isCancelledError = (error: unknown): boolean =>
      error instanceof Error && error.message === CANCELLED

    type SendChatParams = Parameters<typeof chatService.sendAbortable>[0]
    const sendChat = async (params: SendChatParams) => {
      throwIfCancelled()
      const result = await chatService.sendAbortable(params, { signal })
      if (signal?.aborted || result.errorCode === 'CANCELLED') {
        throw new Error(CANCELLED)
      }
      return result
    }



    // Accumulated state — resumed runs hydrate from `resumeState` so phases
    // already completed in the previous run aren't re-paid for.
    const knowledgeBase: Array<{ label: string; content: string }> = resumeState
      ? [...resumeState.knowledgeBase]
      : []
    let anyWebSearch = resumeState?.anyWebSearch ?? false
    let imageContext = resumeState?.imageContext ?? ''
    let imageSearchTerms: string[] = resumeState?.imageSearchTerms ?? []
    /** True while the aspects are the generic fallback list, which is too vague to search without the question. */
    const aspectsAreFallback = () =>
      aspects.length === DEFAULT_ASPECTS.length && aspects.every((aspect, index) => aspect === DEFAULT_ASPECTS[index])
    // Global citation registry: [n] in every finding is index n-1 here.
    const sources: ResearchSource[] = resumeState?.sources ? resumeState.sources.map((s) => ({ ...s })) : []
    const registerSources = (results: ResearchSource[]): number[] =>
      results.map((result) => {
        const existing = sources.findIndex((source) => source.url === result.url)
        if (existing >= 0) return existing + 1
        sources.push({ title: result.title, url: result.url })
        return sources.length
      })
    // Deep-dive queries whose step failed — reported honestly to the synthesis.
    const failedDeepAspects: string[] = []

    // ── Phase 1: Initial Analysis ─────────────────────────────────────────
    let aspects: string[] = resumeState?.aspects ?? DEFAULT_ASPECTS
    const surveyCompletedIndexes = new Set(
      resumeState?.surveyCompletedIndexes?.length
        ? resumeState.surveyCompletedIndexes
        : deriveCompletedSurveyIndexes(aspects, knowledgeBase, resumeState?.surveyCompletedAspects),
    )
    let activeGapRound = resumeState?.activeGapRound
      ? {
          ...resumeState.activeGapRound,
          gaps: [...resumeState.activeGapRound.gaps],
          queries: [...resumeState.activeGapRound.queries],
          completedQueryIndexes: [...resumeState.activeGapRound.completedQueryIndexes],
        }
      : undefined

    /**
     * Build a fresh snapshot reflecting current pipeline state. Helper exists
     * so each phase can persist its outcome at the right moment without
     * duplicating the field list.
     */
    const buildSnapshot = (
      lastCompletedPhase: DeepResearchStepPhase,
      lastGapIteration: number,
      crossContentValue?: string,
      activeGapRoundValue = activeGapRound,
    ): DeepResearchResumeState => ({
      question,
      aspects,
      knowledgeBase: [...knowledgeBase],
      surveyCompletedAspects: [...surveyCompletedIndexes]
        .map((index) => aspects[index])
        .filter((aspect): aspect is string => typeof aspect === 'string'),
      surveyCompletedIndexes: [...surveyCompletedIndexes],
      imageContext,
      imageSearchTerms,
      anyWebSearch,
      sources: sources.map((source) => ({ ...source })),
      crossContent: crossContentValue,
      activeGapRound: activeGapRoundValue
        ? {
            iteration: activeGapRoundValue.iteration,
            gaps: [...activeGapRoundValue.gaps],
            queries: [...activeGapRoundValue.queries],
            completedQueryIndexes: [...activeGapRoundValue.completedQueryIndexes],
          }
        : undefined,
      lastCompletedPhase,
      lastGapIteration,
      hasImages,
      carefulReasoning,
    })

    if (!isPhaseDone('analyze')) {
      const analyzeMsgId = onStepStart(uiText.stepAnalyze, { phase: 'analyze' })

      try {
        const result = await sendChat({
          provider, model,
          messages: [{ role: 'user', content: buildResearchContent(framedQuestion, images) }],
          systemPrompt: ANALYZE_PROMPT(date, hasImages),
        })
        throwIfCancelled()
        if (!result.success) throw new Error(describeChatFailure(result, uiText.errorAnalyze))
        const reply = getReply(result)
        if (reply) {
          const m = reply.match(/\{[\s\S]*\}/)
          if (m) {
            try {
              const p = JSON.parse(m[0])
              const parsedAspects = parseStringArray(p.aspects)
              if (parsedAspects.length >= 2) aspects = parsedAspects.slice(0, MAX_ASPECTS)
              if (hasImages && typeof p.imageContext === 'string') {
                imageContext = p.imageContext.trim()
              }
              if (hasImages) {
                imageSearchTerms = parseStringArray(p.searchTerms).slice(0, 6)
              }
            } catch { /* use defaults */ }
          }
        }
      } catch (err) {
        if (isCancelledError(err)) {
          onStepError(analyzeMsgId, CANCELLED)
          throw err
        }
        onStepError(analyzeMsgId, err instanceof Error ? err.message : uiText.errorAnalyze)
        throw err
      }

      const analyzeContent = [
        webAvailable ? uiText.modeRealtime : uiText.modeAiOnly,
        '',
        tpl(uiText.willStudy, { count: aspects.length }),
        ...aspects.map((a, i) => `${i + 1}. ${a}`),
        ...(imageContext ? ['', tpl(uiText.imageContext, { context: imageContext })] : []),
        ...(imageSearchTerms.length > 0 ? [tpl(uiText.imageTerms, { terms: imageSearchTerms.join(', ') })] : []),
      ].join('\n')
      onStepComplete(analyzeMsgId, analyzeContent, false)
      if (imageContext) {
        knowledgeBase.push({ label: uiText.imageKbLabel, content: imageContext })
      }
      onResumeStateChange?.(buildSnapshot('analyze', 0))
    }


    // ── Phase 2: First-pass research (Breadth) ────────────────────────────
    // The label is intentionally short (just the phase name, e.g. "Khảo sát")
    // because the renderer collapses every survey step into one pill and shows
    // the per-aspect detail inside a hover-info popover. We still pass the
    // `aspect` text via meta so the popover can list what each step researched.
    if (!isPastPhase('survey')) {
      for (let aspectIndex = 0; aspectIndex < aspects.length; aspectIndex++) {
        if (surveyCompletedIndexes.has(aspectIndex)) continue
        const aspect = aspects[aspectIndex]
        if (!aspect) continue
        throwIfCancelled()
        const msgId = onStepStart(
          tpl(uiText.stepRound1, { aspect }),
          { phase: 'survey', aspect },
        )

        try {
          const webCtx = await webSearch(
            buildSearchQuery(aspect, question, imageContext, imageSearchTerms, aspectsAreFallback()),
            uiText.webSummary,
            registerSources,
            reportSearchFallback,
            reportSearchUnavailable,
          )
          if (webCtx) anyWebSearch = true

          const result = await sendChat({
            provider, model,
            messages: [{ role: 'user', content: buildResearchContent(`Analyze this aspect: ${aspect}`, images) }],
            systemPrompt: RESEARCH_PROMPT(date, aspect, framedQuestion, webCtx, imageContext),
          })
          throwIfCancelled()
          const content = getReply(result)
          if (!content) {
            // A failed step is reported as an error and left unfinished (so a
            // resume retries it). Its error text must never enter the
            // knowledge base, where the synthesis would read it as a finding.
            onStepError(msgId, describeChatFailure(result, uiText.errorUnknown))
            continue
          }
          knowledgeBase.push({ label: aspect, content })
          surveyCompletedIndexes.add(aspectIndex)
          onStepComplete(msgId, content, false)
          // Snapshot after each aspect so a Stop mid-survey can resume
          // from the very next aspect rather than restarting Phase 2.
          onResumeStateChange?.(buildSnapshot('survey', 0))
        } catch (err) {
          if (isCancelledError(err)) {
            onStepError(msgId, CANCELLED)
            throw err
          }
          onStepError(msgId, err instanceof Error ? err.message : uiText.errorGeneric)
        }
      }
    }


    // ── Phase 3: Gap Analysis Loop ────────────────────────────────────────
    // Resume must be granular inside this loop. A snapshot from `gap` means
    // the current round's queries are known and pending; a snapshot from
    // `deep` may still have unfinished queries inside the same round.
    let startIteration = 1
    let skipGapLoop = false
    if (resumeState) {
      if (isPastPhase('deep')) {
        skipGapLoop = true
      } else if (resumeState.lastCompletedPhase === 'gap') {
        if (activeGapRound) {
          startIteration = activeGapRound.iteration
        } else {
          skipGapLoop = true
        }
      } else if (resumeState.lastCompletedPhase === 'deep') {
        if (
          activeGapRound
          && activeGapRound.completedQueryIndexes.length < Math.min(activeGapRound.queries.length, MAX_GAPS_PER_ROUND)
        ) {
          startIteration = activeGapRound.iteration
        } else {
          startIteration = resumeState.lastGapIteration + 1
          activeGapRound = undefined
        }
      }
    }

    for (let iteration = startIteration; !skipGapLoop && iteration <= MAX_GAP_ITERATIONS; iteration++) {
      throwIfCancelled()

      const allFindings = knowledgeBase
        .map((k, i) => `### ${i + 1}. ${k.label}\n${k.content}`)
        .join('\n\n---\n\n')

      let gapResult: GapAnalysisResult = { isComplete: true, gaps: [], queries: [] }

      if (activeGapRound?.iteration === iteration) {
        gapResult = {
          isComplete: false,
          gaps: activeGapRound.gaps,
          queries: activeGapRound.queries,
        }
      } else {
        // Ask AI: is the research complete? What's missing?
        const gapMsgId = onStepStart(
          tpl(uiText.stepGap, { round: iteration }),
          { phase: 'gap' },
        )

        try {
          const result = await sendChat({
            provider, model,
            messages: [{ role: 'user', content: buildResearchContent(GAP_ANALYSIS_CONTENT(framedQuestion, allFindings, imageContext), images) }],
            systemPrompt: GAP_ANALYSIS_PROMPT(date),
            bypassLengthCheck: true,
          })
          throwIfCancelled()

          const reply = getReply(result)
          // An empty reply must not be reported as "research complete".
          if (!reply) throw new Error(describeChatFailure(result, uiText.errorEval))
          const m = reply.match(/\{[\s\S]*\}/)
          if (m) {
            try {
              const p = JSON.parse(m[0])
              const gaps = parseStringArray(p.gaps).slice(0, MAX_GAPS_PER_ROUND)
              const queries = parseStringArray(p.queries).slice(0, MAX_GAPS_PER_ROUND)
              gapResult = {
                isComplete: Boolean(p.isComplete),
                gaps,
                // Fall back to the gap descriptions when no usable queries came back.
                queries: queries.length > 0 ? queries : gaps,
              }
            } catch { gapResult.isComplete = true }
          }

          const gapContent = gapResult.isComplete
            ? uiText.complete
            : [
                tpl(uiText.gapsFound, { count: gapResult.gaps.length }),
                ...gapResult.gaps.map((g, i) => `${i + 1}. ${g}`),
              ].join('\n')

          onStepComplete(gapMsgId, gapContent, false)
          activeGapRound = gapResult.isComplete || gapResult.queries.length === 0
            ? undefined
            : {
                iteration,
                gaps: [...gapResult.gaps],
                queries: [...gapResult.queries],
                completedQueryIndexes: [],
              }
          // Snapshot after each gap-evaluation so a Stop here can pick up at
          // the deep-dive sub-phase (or the next iteration) without re-doing
          // the gap analysis call.
          onResumeStateChange?.(buildSnapshot('gap', iteration))
        } catch (err) {
          if (isCancelledError(err)) {
            onStepError(gapMsgId, CANCELLED)
            throw err
          }
          onStepError(gapMsgId, err instanceof Error ? err.message : uiText.errorEval)
          gapResult.isComplete = true // fall through to synthesis on error
        }
      }

      // If complete, stop the loop
      if (gapResult.isComplete || gapResult.queries.length === 0) break


      // Chase each gap with targeted search + analysis
      for (let g = 0; g < Math.min(gapResult.queries.length, MAX_GAPS_PER_ROUND); g++) {
        if (activeGapRound?.completedQueryIndexes.includes(g)) continue
        throwIfCancelled()
        const query = gapResult.queries[g]
        const gapLabel = gapResult.gaps[g] ?? query
        const deepMsgId = onStepStart(
          tpl(uiText.stepDeep, { aspect: gapLabel }),
          { phase: 'deep', aspect: gapLabel },
        )


        try {
          // The planned query is already targeted: sending the original question
          // along with it would only pull the results back toward the broad topic.
          const webCtx = await webSearch(
            buildSearchQuery(query, question, imageContext, imageSearchTerms),
            uiText.webSummary,
            registerSources,
            reportSearchFallback,
            reportSearchUnavailable,
          )
          if (webCtx) anyWebSearch = true

          const result = await sendChat({
            provider, model,
            messages: [{ role: 'user', content: buildResearchContent(`Deep dive research: ${gapLabel}`, images) }],
            systemPrompt: RESEARCH_PROMPT(date, gapLabel, framedQuestion, webCtx, imageContext),
          })
          throwIfCancelled()
          const content = getReply(result)
          if (!content) {
            onStepError(deepMsgId, describeChatFailure(result, uiText.errorUnknown))
            failedDeepAspects.push(gapLabel)
            continue
          }
          knowledgeBase.push({ label: `${uiText.deeperLabel} ${gapLabel}`, content })
          activeGapRound = activeGapRound ?? {
            iteration,
            gaps: [...gapResult.gaps],
            queries: [...gapResult.queries],
            completedQueryIndexes: [],
          }
          activeGapRound.completedQueryIndexes = Array.from(new Set([
            ...activeGapRound.completedQueryIndexes,
            g,
          ])).sort((a, b) => a - b)
          onStepComplete(deepMsgId, content, false)
          // Persist after each deep-dive aspect — granular snapshot helps a
          // mid-loop Stop resume from the very next gap instead of redoing
          // the whole gap-iteration.
          onResumeStateChange?.(buildSnapshot('deep', iteration))
        } catch (err) {
          if (isCancelledError(err)) {
            onStepError(deepMsgId, CANCELLED)
            throw err
          }
          onStepError(deepMsgId, err instanceof Error ? err.message : uiText.errorGeneric)
          failedDeepAspects.push(gapLabel)
        }
      }
      activeGapRound = undefined
      onResumeStateChange?.(buildSnapshot('deep', iteration, undefined, undefined))
    }

    // ── Phase 4: Cross-reference ──────────────────────────────────────────
    // Resumed runs that already produced a cross-reference output reuse it
    // verbatim — we still emit a step bubble so the timeline stays coherent.
    let crossContent = resumeState?.crossContent ?? ''
    if (!isPhaseDone('cross')) {
      const crossMsgId = onStepStart(uiText.stepCross, { phase: 'cross' })

      const allFindingsCross = knowledgeBase
        .map((k, i) => `### ${i + 1}. ${k.label}\n${k.content}`)
        .join('\n\n---\n\n')

      try {
        const result = await sendChat({
          provider, model,
          messages: [{ role: 'user', content: buildResearchContent(CROSS_REFERENCE_CONTENT(framedQuestion, allFindingsCross, imageContext), images) }],
          systemPrompt: CROSS_REFERENCE_PROMPT(date, anyWebSearch),
          bypassLengthCheck: true,
        })
        throwIfCancelled()
        const reply = getReply(result)
        if (reply) {
          crossContent = reply
          onStepComplete(crossMsgId, crossContent, false)
          onResumeStateChange?.(buildSnapshot('cross', resumeState?.lastGapIteration ?? 0, crossContent))
        } else {
          // The synthesis simply proceeds without a cross-reference section;
          // no failure text is passed along as if it were analysis.
          onStepError(crossMsgId, describeChatFailure(result, uiText.errorCross))
        }
      } catch (err) {
        if (isCancelledError(err)) {
          onStepError(crossMsgId, CANCELLED)
          throw err
        }
        onStepError(crossMsgId, err instanceof Error ? err.message : uiText.errorCross)
      }
    }

    // ── Phase 5: Final Synthesis ──────────────────────────────────────────
    // Synth never gets skipped — even when resuming we always re-run it so
    // the user gets a fresh user-facing answer that incorporates the full
    // knowledge base. After it succeeds we clear the resume snapshot so the
    // panel hides the "Tiếp tục" button.
    const synthMsgId = onStepStart(uiText.stepSynth, { phase: 'synth' })

    const allFindingsFinal = knowledgeBase
      .map((k, i) => `### ${i + 1}. ${k.label}\n${k.content}`)
      .join('\n\n---\n\n')

    const sourceListForSynthesis = sources.length > 0
      ? [
          '## Source list (cite as [n])',
          sources.map((source, index) => `[${index + 1}] ${source.title || source.url} — ${source.url}`).join('\n'),
        ].join('\n')
      : ''

    const synthContext = [
      `## Research Findings (${knowledgeBase.length} items)`,
      allFindingsFinal,
      sourceListForSynthesis,
      crossContent ? `---\n## Cross-Reference Analysis\n\n${crossContent}` : '',
    ].filter(Boolean).join('\n\n')

    // Aspects that never produced a finding (their step failed) are surfaced to
    // the synthesis so it states the limitation instead of guessing.
    const unresearched = [
      ...aspects.filter((_, index) => !surveyCompletedIndexes.has(index)),
      ...failedDeepAspects,
    ]

    try {
      const result = await sendChat({
        provider, model,
        messages: [{
          role: 'user',
          content: buildResearchContent([
            `Original question: ${framedQuestion}`,
            imageContext ? `Attached image context: ${imageContext}` : '',
            synthContext,
          ].filter(Boolean).join('\n\n'), images),
        }],
        systemPrompt: SYNTHESIS_PROMPT(date, anyWebSearch, unresearched),
        bypassLengthCheck: true,
        maxOutputTokens: 'model-max',
        carefulReasoning,
      })
      throwIfCancelled()

      const reply = getReply(result)
      // A failed synthesis is an error (the resume snapshot stays so the user
      // can retry), never a "final answer" made of an error message.
      if (!reply) throw new Error(describeChatFailure(result, uiText.errorSynth))

      const sourcesTitle = uiText.sourcesTitle ?? 'Sources'
      const body = removeUnknownCitations(stripTrailingSourcesSection(reply, sourcesTitle), sources.length)
      const synthesis = `${body}${buildSourcesMarkdown(sources, body, sourcesTitle)}`

      onStepComplete(synthMsgId, synthesis, true)
      // Pipeline finished — clear the resume snapshot so the renderer hides
      // the "Tiếp tục nghiên cứu" button.
      onResumeStateChange?.(null)
    } catch (err) {
      if (isCancelledError(err)) {
        onStepError(synthMsgId, CANCELLED)
        throw err
      }
      const e = err instanceof Error ? err.message : uiText.errorSynth
      onStepError(synthMsgId, e)
      throw err
    }
  },
}
