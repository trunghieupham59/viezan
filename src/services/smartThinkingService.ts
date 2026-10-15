/**
 * Smart Thinking Service — structured reasoning with optional web grounding.
 *
 * This is the DEFAULT path for normal chat (text-only, not Deep Research).
 * The user does NOT toggle it on or off — every message runs through a
 * disciplined thinking contract, and the AI decides whether external evidence
 * is needed before answering.
 *
 * Pipeline:
 *   Step 1 — Route and plan:
 *     AI reads the latest message plus recent context, identifies the real
 *     problem, assumptions, uncertainty, and whether web evidence is required.
 *
 *   Step 2a — needs_web=true:
 *     Run ONE canonical web search with an AI-planned result budget (existing
 *     webSearch IPC, multi-provider fallback). The final answer is
 *     source-grounded and cites result indexes.
 *
 *   Step 2b — needs_web=false:
 *     Answer from the conversation and model knowledge under the same Smart
 *     Thinking contract.
 *
 * Compared to Deep Research:
 *   • 1–2 AI calls (vs 6–10+)
 *   • At most 1 web search with a small dynamic source budget (vs 4–8 searches)
 *   • Streams the final answer
 *   • Best for everyday questions; Deep Research is opt-in for thorough reports.
 */
import type { ChatMessage as IpcChatMessage } from './chatService'
import { chatService } from './chatService'
import { needsWebSearchHeuristic } from './localWebIntent'
import {
  type ActionableSearchFallback,
  formatWebSearchResults,
  getActionableSearchFallback,
  getCurrentLocaleDateTime,
  hasWebSearchApi,
  isSearchUnavailable,
} from './searchResultFormatting'

// ─── Constants ────────────────────────────────────────────────────────────────

const SEARCH_RESULT_BUDGET = {
  min: 1,
  fallback: 2,
  max: 6,
  /** Web Search mode: the user asked for sources, so never answer from a single snippet. */
  forcedMin: 4,
  forcedFallback: 5,
} as const
const SEARCH_CONTEXT_BASE_CHARS = 1500
const SEARCH_CONTEXT_CHARS_PER_RESULT = 2300
/** Per-result snippet cap handed to the answer model (matches the IPC sanitizer cap). */
const SEARCH_RESULT_SNIPPET_CHARS = 2000
const MAX_CLASSIFIER_CONTEXT_MESSAGES = 8
const MAX_CLASSIFIER_CONTEXT_CHARS = 4000
const LOCAL_PROVIDER_ID = 'local'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartThinkingCallbacks {
  /** Called only when the AI decides to web-search. Returns the bubble id. */
  onStepStart: (label: string) => string
  /** Called when the search step finishes successfully. */
  onStepComplete: (msgId: string, content: string) => void
  /** Called when the search step errors out. */
  onStepError: (msgId: string, error: string) => void

  /** Called when the FINAL answer bubble is created. Returns the message id. */
  onAnswerStart: () => string
  /** Streamed token callback for the final answer. `content` is the cumulative text. */
  onAnswerToken: (msgId: string, content: string) => void
  /** Called when the final answer completes successfully. */
  onAnswerComplete: (msgId: string, content: string) => void
  /** Called when the final answer errors. */
  onAnswerError: (msgId: string, error: string, errorCode?: string) => void
  /**
   * Optional: fired when a configured web-search provider rejected the key or ran
   * out of quota and the free provider answered instead.
   */
  onSearchFallback?: (info: ActionableSearchFallback) => void
  /** Optional: fired when every search provider failed, so the answer has no live sources. */
  onSearchUnavailable?: () => void
}

export interface SmartThinkingUiText {
  webSearchStepLabelPrefix: string
  webSearchSummaryTitle: string
  webSearchDefaultReason: string
  webSearchSourcesTitle: string
  webSearchNoSources: string
  webSearchNoResults: string
  webSearchErrorFallback: string
  noResponseError: string
  unknownError: string
}

export interface SmartThinkingParams {
  provider: string
  model: string
  /** Latest user question (the message just sent). */
  question: string
  /**
   * Full IPC-shaped conversation history (including the latest user message).
   * Used for the FINAL streaming answer and the routing classifier so
   * multi-turn references keep their target.
   */
  messages: IpcChatMessage[]
  systemPrompt?: string
  uiText: SmartThinkingUiText
  callbacks: SmartThinkingCallbacks
  /**
   * AbortSignal for user-initiated cancellation. When aborted, the final
   * streaming answer is cancelled and orchestration short-circuits.
   */
  signal?: AbortSignal
  /**
   * Forward the user's "Careful Reasoning" toggle to the final streaming
   * answer call. The classifier step deliberately does NOT receive it —
   * classification is a short JSON-only task that doesn't benefit from
   * the step-by-step discipline directive.
   */
  carefulReasoning?: boolean
  /**
   * When true, skip the AI classifier and always run a web search before
   * answering. Used by "Web Search" mode where the user explicitly wants
   * web results every time — no AI routing decision needed.
   */
  forceWebSearch?: boolean
}


interface ClassifyResult {
  needsWeb: boolean
  query: string
  reason: string
  answerFocus: string
  sourceGuidance: string
  sourceCount: number
  freshnessRequirement: string
  reliabilityRequirement: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function composeSearchQuery(question: string, plannedQuery: string): string {
  const normalizedQuestion = normalizeWhitespace(question)
  const normalizedPlan = normalizeWhitespace(plannedQuery)
  return (normalizedPlan || normalizedQuestion).slice(0, 200)
}

function combineSystemPrompt(basePrompt: string, userSystemPrompt?: string): string {
  return userSystemPrompt ? `${userSystemPrompt}\n\n---\n\n${basePrompt}` : basePrompt
}

function normalizeClassifierText(value: unknown, maxChars = 300): string {
  return typeof value === 'string' ? normalizeWhitespace(value).slice(0, maxChars) : ''
}

function normalizeSourceCount(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : SEARCH_RESULT_BUDGET.fallback

  if (!Number.isFinite(parsed)) return SEARCH_RESULT_BUDGET.fallback
  return Math.min(SEARCH_RESULT_BUDGET.max, Math.max(SEARCH_RESULT_BUDGET.min, Math.round(parsed)))
}

function parseNeedsWeb(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    return ['true', 'yes', '1'].includes(value.trim().toLowerCase())
  }
  return false
}

function getSearchContextCharBudget(sourceCount: number): number {
  return SEARCH_CONTEXT_BASE_CHARS + normalizeSourceCount(sourceCount) * SEARCH_CONTEXT_CHARS_PER_RESULT
}

function messageText(message: IpcChatMessage): string {
  return message.content
    .map((content) => {
      if (content.type === 'text') return normalizeWhitespace(content.text ?? '')
      if (content.type === 'image') return '[image]'
      return ''
    })
    .filter(Boolean)
    .join(' ')
}

function formatClassifierContext(messages: IpcChatMessage[], fallbackQuestion: string): string {
  const formatted = messages
    .slice(-MAX_CLASSIFIER_CONTEXT_MESSAGES)
    .map((message) => {
      const text = messageText(message)
      if (!text) return ''
      return `${message.role.toUpperCase()}: ${text}`
    })
    .filter(Boolean)

  if (!formatted.length) return `USER: ${normalizeWhitespace(fallbackQuestion)}`

  const selected: string[] = []
  let total = 0
  for (let i = formatted.length - 1; i >= 0; i--) {
    const line = formatted[i]
    const nextTotal = total + line.length + 1
    if (selected.length > 0 && nextTotal > MAX_CLASSIFIER_CONTEXT_CHARS) break
    selected.unshift(line)
    total = nextTotal
  }

  return selected.join('\n')
}

/**
 * Remove a trailing "Sources / References / <localized title>" section that the
 * AI may have appended despite our instructions. We strip from the last heading-like
 * line that contains one of the known section titles to the end of the message.
 *
 * Recognised triggers (case-insensitive):
 *   - The exact localised sources title passed by the UI
 *   - English fallbacks: "Sources", "References", "Citations"
 *   - Lines that start with "[1]" / "[2]" markdown reference style at the very end
 */
export function stripTrailingSourcesSection(text: string, localizedTitle: string): string {
  if (!text) return text
  const titles = [
    localizedTitle,
    'Sources found',
    'Sources',
    'References',
    'Citations',
  ]
    .map((t) => t.trim())
    .filter(Boolean)

  const lines = text.split('\n')
  let cutIndex = -1

  // Walk from the end backwards looking for a heading/bold line that introduces a sources block.
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i]
    const stripped = raw.trim().replace(/^[#>\s*_:`-]+|[\s*_:`-]+$/g, '').toLowerCase()
    if (!stripped) continue
    const matched = titles.some((title) => {
      const t = title.toLowerCase()
      return stripped === t || stripped.startsWith(`${t}:`) || stripped === `**${t}**`
    })
    if (matched) {
      cutIndex = i
      // also drop a separator like "---" right above the heading
      if (i > 0 && /^\s*-{3,}\s*$/.test(lines[i - 1])) cutIndex = i - 1
      break
    }
  }

  if (cutIndex >= 0) {
    return lines.slice(0, cutIndex).join('\n').trimEnd()
  }

  // Fallback: strip a tail block that is purely "[N] http..." reference list
  let tailStart = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (!t) continue
    if (/^\[\d+\]\s+https?:\/\//i.test(t)) {
      tailStart = i
      continue
    }
    break
  }
  if (tailStart < lines.length) {
    let end = tailStart
    if (end > 0 && /^\s*-{3,}\s*$/.test(lines[end - 1])) end -= 1
    return lines.slice(0, end).join('\n').trimEnd()
  }

  return text
}

async function runWebSearch(
  query: string,
  uiText: SmartThinkingUiText,
  sourceCount: number,
  onFallback?: (info: ActionableSearchFallback) => void,
  onUnavailable?: () => void,
): Promise<{
  context: string
  sourcesMarkdown: string
}> {
  if (!hasWebSearchApi()) return { context: '', sourcesMarkdown: '' }
  try {
    const maxResults = normalizeSourceCount(sourceCount)
    const result = await window.api.webSearch({
      query: query.slice(0, 200),
      maxResults,
    })
    const fallback = getActionableSearchFallback(result)
    if (fallback) onFallback?.(fallback)
    if (isSearchUnavailable(result)) onUnavailable?.()
    if (result.success && result.results?.length) {
      const selectedResults = result.results.slice(0, maxResults)
      const context = formatWebSearchResults(
        selectedResults,
        result.answer,
        uiText.webSearchSummaryTitle,
        {
          maxChars: getSearchContextCharBudget(maxResults),
          retrievedAt: getCurrentLocaleDateTime(),
          query,
          provider: result.provider,
          resultCount: selectedResults.length,
          maxCharsPerResult: SEARCH_RESULT_SNIPPET_CHARS,
        },
      )
      const sourcesMarkdown = selectedResults
        .map((r, i) => `${i + 1}. [${r.title || r.url}](${r.url})`)
        .join('\n')
      return { context, sourcesMarkdown }
    }
  } catch {
    /* ignore — empty context returned */
  }
  return { context: '', sourcesMarkdown: '' }
}

// ─── Prompts (English to keep classifier output stable) ──────────────────────

const SMART_THINKING_ANSWER_PROMPT = (date: string) =>
  `You are Smart Thinking, a disciplined reasoning system. Current time: ${date}.

Core operating contract:
  • Find the real problem behind the user's wording before solving the surface request.
  • Trace root causes instead of treating symptoms as the whole problem.
  • Break complex problems into parts, constraints, causes, tradeoffs, and decision criteria.
  • Evaluate information quality, uncertainty, assumptions, and missing evidence.
  • Challenge weak assumptions instead of accepting them silently.
  • Consider multiple perspectives, including credible counterarguments.
  • Synthesize a coherent answer from the available evidence and the conversation context.
  • Distinguish stable knowledge from current, real-time, or source-specific claims; do not present time-sensitive facts as verified without current evidence.
  • Prefer accurate, source-qualified statements over confident guesses.
  • Apply useful mental models when they genuinely improve the answer: systems thinking, inversion, Pareto prioritization, Occam's razor, and probabilistic reasoning.
  • Create practical next steps, options, experiments, and feedback loops when the user is solving a problem or making a decision.
  • Scale depth to the task: be concise for simple requests and more structured for complex, ambiguous, or high-impact questions.
  • State assumptions or uncertainty when they materially affect the answer.
  • Reply in the same language as the user's latest message unless the user asks otherwise.

Do not expose a long hidden reasoning trace. Give the user the conclusions, key rationale, tradeoffs, and next actions that matter.`

/**
 * Compact variant for local models: prompt tokens are re-processed on every turn on
 * local hardware (often partly on CPU), so the full reasoning contract is trimmed to
 * the rules that change answer quality.
 */
const LOCAL_ANSWER_PROMPT = (date: string) =>
  `You are Smart Thinking, a careful assistant. Current time: ${date}.
  • Answer the actual question directly; scale depth to the task and be concise for simple requests.
  • State assumptions or uncertainty when they matter; do not present time-sensitive facts as verified without current evidence.
  • Reply in the same language as the user's latest message unless the user asks otherwise.`

const CLASSIFY_PROMPT = (date: string, forceWebSearch = false) =>
  `You are the routing and evidence-planning stage for Smart Thinking. Current time: ${date}.
${forceWebSearch
    ? `The user explicitly turned on Web Search for this message, so set needs_web to true and plan the best possible search: a self-contained query, a source_count of at least 4, and the freshness/reliability the answer needs.
`
    : `Decide whether the user's latest message requires web evidence before the final answer.
`}
Think internally with this process:
  • Identify the real problem and requested answer target, not just surface keywords.
  • Identify assumptions, uncertainty, and missing information.
  • Decide whether the answer depends on current, external, source-specific, or verifiable facts.
  • If web evidence is needed, produce one canonical, self-contained query that resolves follow-up references from recent context.
  • Choose the smallest source_count that can answer confidently.
  • State the freshness requirement: stable, current-as-of-now, latest, exact-source, or date-bounded.
  • State the reliability requirement: official/primary source, direct source text, corroborated independent sources, or conversation-only.

Return needs_web = TRUE when an accurate answer depends on external information that can change over time,
recent or real-time facts, specific published facts, or verification against current sources.

Return needs_web = FALSE for:
  • General knowledge that does not change (history, science fundamentals, math)
  • Coding, logic, language tasks (translation, grammar)
  • Opinions, brainstorming, creative writing
  • Concepts that have been stable for years
  • Follow-up questions answered by earlier conversation context

Query rules when needs_web=true:
  • Preserve the user's exact intent and requested answer target.
  • Keep the key entity, relationship, requested attribute, and time qualifier.
  • Do not replace the requested attribute with a nearby topic.
  • Resolve any follow-up reference from recent conversation context and make
    the query about the concrete topic or claim referenced earlier.
  • Prefer a concise canonical query over repeating the user's full sentence.
  • State what source quality is needed in source_guidance.

Source-count rules when needs_web=true:
  • 1 = a direct fact, exact wording check, or likely-primary-source lookup is enough.
  • 2 = a concrete claim needs light corroboration.
  • 3 = current information may vary across official/provider/news pages.
  • 4 = current information that must be confirmed across several independent pages.
  • 5-6 = contested, comparative, or multi-perspective topics where coverage matters more than speed.
  • If a broad investigation needs more than 6 sources, keep source_count at 6 and let the final answer suggest Deep Research.

Return ONLY valid JSON with this shape, no other text:
{"needs_web": true, "query": "concise 1-line web search query in user's language", "reason": "very brief reason (max 1 sentence)", "answer_focus": "what the final answer must directly provide", "source_guidance": "what source quality is needed", "source_count": 2, "freshness_requirement": "current-as-of-now", "reliability_requirement": "official or primary source preferred; corroborate if sources conflict"}

If needs_web=false, set query to an empty string, source_count to 0, freshness_requirement to "stable", and reliability_requirement to "conversation/internal knowledge sufficient".`

const WEB_AUGMENTED_PROMPT_PREFIX = (
  date: string,
  webContext: string,
  options: {
    userSystemPrompt?: string
    answerFocus?: string
    sourceGuidance?: string
    freshnessRequirement?: string
    reliabilityRequirement?: string
    sourcesTitle: string
  },
) => {
  const userSystemPrompt = options.userSystemPrompt
  const answerFocus = options.answerFocus?.trim()
  const sourceGuidance = options.sourceGuidance?.trim()
  const freshnessRequirement = options.freshnessRequirement?.trim()
  const reliabilityRequirement = options.reliabilityRequirement?.trim()
  const sourcesTitle = options.sourcesTitle.trim()

  return combineSystemPrompt(`${SMART_THINKING_ANSWER_PROMPT(date)}

I performed a web search for the user's latest message. Use these REAL-TIME results as the primary source — they were retrieved during this run and are more recent than your training data:

━━━ WEB SEARCH RESULTS ━━━
${webContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━

${answerFocus ? `Answer focus from the routing step: ${answerFocus}\n` : ''}${freshnessRequirement ? `Freshness requirement: ${freshnessRequirement}\n` : ''}${reliabilityRequirement ? `Reliability requirement: ${reliabilityRequirement}\n` : ''}${sourceGuidance ? `Source-quality guidance: ${sourceGuidance}\n` : ''}
Instructions:
  • Answer the exact question the user asked. If they ask "who", give names/people; if they ask "what", give entities or facts; do not answer only a nearby topic.
  • Do not invent or complete facts, names, wording, dates, or quoted/source text that are absent from the WEB SEARCH RESULTS.
  • If the requested answer depends on exact wording or complete source text, use only text that appears in the WEB SEARCH RESULTS. If the retrieved results are snippets or incomplete, say what cannot be verified from the retrieved results.
  • Evaluate source credibility from each result's URL, publisher, title, content, retrieval metadata, and relevance score. Prefer primary or official sources when the topic needs them.
  • Cross-check whether the retrieved evidence is fresh enough for the user's question. If a result lacks a visible date, status, version, or effective time when the question needs one, say that freshness is unclear.
  • When sources conflict or only weak/secondary sources are available, surface the conflict or quality limitation instead of merging them into one confident claim.
  • For current public roles, leadership positions, laws, prices, releases, and other time-sensitive facts, include the effective "as of" date when useful.
  • Prioritize the web data over your training knowledge when they conflict.
  • Cite sources inline using [1], [2], etc. matching the numbered results above.
  • DO NOT add a "${sourcesTitle}" / "Sources" / "References" section at the end. Do NOT list raw URLs at the end. The UI will append a clean source list automatically.
  • Reply in the same language as the user's latest question.
  • If the search results don't actually answer the question, say so honestly and state what is missing.`, userSystemPrompt)
}

const MISSING_WEB_EVIDENCE_PROMPT_PREFIX = (
  date: string,
  options: {
    userSystemPrompt?: string
    query?: string
    answerFocus?: string
    sourceGuidance?: string
    freshnessRequirement?: string
    reliabilityRequirement?: string
  },
) => {
  const userSystemPrompt = options.userSystemPrompt
  const query = options.query?.trim()
  const answerFocus = options.answerFocus?.trim()
  const sourceGuidance = options.sourceGuidance?.trim()
  const freshnessRequirement = options.freshnessRequirement?.trim()
  const reliabilityRequirement = options.reliabilityRequirement?.trim()

  return combineSystemPrompt(`${SMART_THINKING_ANSWER_PROMPT(date)}

The routing stage determined that the user's latest message needs current or externally verifiable evidence, but this Smart Thinking run did not retrieve usable web results.

Evidence status:
  • Current time: ${date}
${query ? `  • Search query attempted: ${query}\n` : ''}${answerFocus ? `  • Answer focus: ${answerFocus}\n` : ''}${freshnessRequirement ? `  • Freshness requirement: ${freshnessRequirement}\n` : ''}${reliabilityRequirement ? `  • Reliability requirement: ${reliabilityRequirement}\n` : ''}${sourceGuidance ? `  • Source-quality guidance: ${sourceGuidance}\n` : ''}
Instructions:
  • Do not present time-sensitive, current, source-specific, exact wording, price, release, law, leadership, schedule, or availability facts as verified.
  • If stable background knowledge or conversation context helps, clearly separate it from the unverified current part.
  • Tell the user what could not be verified in this run and what evidence would be needed for a reliable answer.
  • Do not fabricate citations, source titles, URLs, dates, or confidence from memory.
  • Reply in the same language as the user's latest question.`, userSystemPrompt)
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export const smartThinkingService = {
  async run({
    provider,
    model,
    question,
    messages,
    systemPrompt,
    uiText,
    callbacks,
    signal,
    carefulReasoning,
    forceWebSearch,
  }: SmartThinkingParams): Promise<void> {

    const date = getCurrentLocaleDateTime()
    const {
      onStepStart,
      onStepComplete,
      onStepError,
      onAnswerStart,
      onAnswerToken,
      onAnswerComplete,
      onAnswerError,
    } = callbacks

    // ── Step 1: Classify (best-effort; failures fall through to no-search) ──
    // When forceWebSearch=true, skip the AI classifier entirely and always search.
    let classify: ClassifyResult = {
      needsWeb: forceWebSearch ?? false,
      query: forceWebSearch ? question.slice(0, 200) : '',
      reason: '',
      answerFocus: '',
      sourceGuidance: '',
      sourceCount: forceWebSearch ? SEARCH_RESULT_BUDGET.forcedFallback : SEARCH_RESULT_BUDGET.fallback,
      freshnessRequirement: '',
      reliabilityRequirement: '',
    }

    // The classifier also runs in forced mode: it resolves follow-up references
    // into a self-contained query and plans freshness/reliability. Its failure
    // is harmless because the forced defaults above already search the raw question.
    // Local models skip the classifier unless Web Search is forced: it is a full,
    // non-streaming model call, which doubles time-to-first-token on local hardware.
    // Rule-based intent detection stands in so time-sensitive questions still search.
    const isLocal = provider === LOCAL_PROVIDER_ID
    const skipClassifier = isLocal && !forceWebSearch
    if (skipClassifier && hasWebSearchApi() && needsWebSearchHeuristic(question)) {
      classify = {
        ...classify,
        needsWeb: true,
        query: question.slice(0, 200),
        sourceCount: SEARCH_RESULT_BUDGET.fallback,
        freshnessRequirement: 'current-as-of-now',
      }
    }
    if (hasWebSearchApi() && !signal?.aborted && !skipClassifier) {
      try {
        const classifierContext = formatClassifierContext(messages, question)
        const result = await chatService.send({
          provider,
          model,
          messages: [{
            role: 'user',
            content: [{
              type: 'text',
              text: [
                'Recent conversation, oldest to newest:',
                classifierContext,
                '',
                'Classify ONLY the latest USER message. Return JSON only.',
              ].join('\n'),
            }],
          }],
          systemPrompt: CLASSIFY_PROMPT(date, forceWebSearch),
          bypassLengthCheck: true,
        })
        const reply = result.success ? result.reply?.trim() : null
        if (reply) {
          const m = reply.match(/\{[\s\S]*\}/)
          if (m) {
            try {
              const p = JSON.parse(m[0])
              classify = {
                needsWeb: parseNeedsWeb(p.needs_web),
                query: typeof p.query === 'string' ? p.query.trim() : '',
                reason: typeof p.reason === 'string' ? p.reason.trim() : '',
                answerFocus: typeof p.answer_focus === 'string' ? p.answer_focus.trim() : '',
                sourceGuidance: typeof p.source_guidance === 'string' ? p.source_guidance.trim() : '',
                sourceCount: normalizeSourceCount(p.source_count ?? p.source_budget ?? p.max_results),
                freshnessRequirement: normalizeClassifierText(p.freshness_requirement ?? p.freshness),
                reliabilityRequirement: normalizeClassifierText(p.reliability_requirement ?? p.reliability),
              }
            } catch {
              /* malformed JSON — keep defaults (no search) */
            }
          }
        }
      } catch {
        /* classifier failed — fall through to plain chat */
      }
    }
    if (forceWebSearch) {
      classify.needsWeb = true
      classify.sourceCount = Math.max(classify.sourceCount, SEARCH_RESULT_BUDGET.forcedMin)
    }
    if (classify.needsWeb) {
      classify.query = composeSearchQuery(question, classify.query)
      classify.sourceCount = normalizeSourceCount(classify.sourceCount)
    }

    // ── Step 2a: Web search (if AI asked for one) ───────────────────────────
    let webContext = ''
    let webSourcesMarkdown = ''

    if (classify.needsWeb && classify.query) {
      const stepLabel = `${uiText.webSearchStepLabelPrefix} ${classify.query}`.trim()
      const stepMsgId = onStepStart(stepLabel)

      try {
        const { context, sourcesMarkdown } = await runWebSearch(
          classify.query,
          uiText,
          classify.sourceCount,
          callbacks.onSearchFallback,
          callbacks.onSearchUnavailable,
        )
        webContext = context
        webSourcesMarkdown = sourcesMarkdown

        if (context) {
          const stepBody = [
            `_${uiText.webSearchDefaultReason}_`,
            '',
            `**${uiText.webSearchSourcesTitle}:**`,
            sourcesMarkdown || `_${uiText.webSearchNoSources}_`,
          ].join('\n')
          onStepComplete(stepMsgId, stepBody)
        } else {
          onStepComplete(stepMsgId, `_${uiText.webSearchNoResults}_`)
        }
      } catch (err) {
        onStepError(stepMsgId, err instanceof Error ? err.message : uiText.webSearchErrorFallback)
      }
    }

    // ── Step 2b: Stream final answer (with full conversation history) ───────
    const answerMsgId = onAnswerStart()
    const finalSystemPrompt = webContext
      ? WEB_AUGMENTED_PROMPT_PREFIX(date, webContext, {
          userSystemPrompt: systemPrompt,
          answerFocus: classify.answerFocus,
          sourceGuidance: classify.sourceGuidance,
          freshnessRequirement: classify.freshnessRequirement,
          reliabilityRequirement: classify.reliabilityRequirement,
          sourcesTitle: uiText.webSearchSourcesTitle,
        })
      : classify.needsWeb
        ? MISSING_WEB_EVIDENCE_PROMPT_PREFIX(date, {
            userSystemPrompt: systemPrompt,
            query: classify.query,
            answerFocus: classify.answerFocus,
            sourceGuidance: classify.sourceGuidance,
            freshnessRequirement: classify.freshnessRequirement,
            reliabilityRequirement: classify.reliabilityRequirement,
          })
      : combineSystemPrompt(
          isLocal ? LOCAL_ANSWER_PROMPT(date) : SMART_THINKING_ANSWER_PROMPT(date),
          systemPrompt,
        )

    let streamed = ''

    try {
      const result = await chatService.stream(
        {
          provider,
          model,
          messages,
          systemPrompt: finalSystemPrompt,
          // Web context can be long — bypass the standard length check
          bypassLengthCheck: Boolean(webContext),
          carefulReasoning,
        },

        {
          onToken: (token) => {
            streamed += token
            onAnswerToken(answerMsgId, streamed)
          },
          signal,
        },
      )

      // User-initiated cancellation — keep any partial tokens that were
      // already emitted, finalise the bubble in a non-error state. We do
      // NOT call onAnswerError so the message bubble doesn't show a red banner.
      if (result.errorCode === 'CANCELLED' || signal?.aborted) {
        onAnswerComplete(answerMsgId, streamed)
        return
      }

      if (result.success && result.reply) {
        let final = result.reply
        if (webContext && webSourcesMarkdown) {
          // Strip any AI-generated sources/references section (raw URL list)
          // so we always end with a single clean, titled link list.
          final = stripTrailingSourcesSection(final, uiText.webSearchSourcesTitle)
          final = `${final}\n\n---\n**${uiText.webSearchSourcesTitle}**\n${webSourcesMarkdown}`
        }
        onAnswerComplete(answerMsgId, final)
      } else {
        onAnswerError(answerMsgId, result.error || uiText.noResponseError, result.errorCode)
      }
    } catch (err) {
      if (signal?.aborted) {
        onAnswerComplete(answerMsgId, streamed)
        return
      }
      onAnswerError(answerMsgId, err instanceof Error ? err.message : uiText.unknownError)
    }
  },
}
