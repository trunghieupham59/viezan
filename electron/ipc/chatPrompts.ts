/**
 * Chat system prompt builder.
 *
 * Two layers of guardrails are applied to every chat request:
 *
 *   1. **Reading discipline** (always on) — a short directive that asks the
 *      model to take the user's stated assumptions/constraints at face value
 *      instead of silently overriding them with common-case defaults. This
 *      covers the common failure mode where users describe an unusual setup
 *      and the model "helpfully" reverts to the textbook scenario, producing
 *      a confidently wrong answer (e.g. tax-withholding questions where the
 *      caller specifies an unusual withholding rule but the model applies the
 *      standard formula and arrives at a wrong refund amount).
 *
 *   2. **Reasoning discipline** (opt-in via `carefulReasoning`) — a longer
 *      directive that forces the model to restate inputs, show step-by-step
 *      math, and cross-check the final number against every stated
 *      constraint. Toggled by the user from the Chat composer ("Careful
 *      Reasoning" mode) and is most useful for finance/tax/math questions.
 *
 * Both directives sit AFTER the user's system prompt so a stricter user
 * instruction (e.g. "always answer in one sentence") still wins for plain
 * chat, while the discipline rules survive as a baseline reading contract.
 */

const DEFAULT_CHAT_SYSTEM_PROMPT =
  'You are a helpful AI assistant. Be concise, friendly, and accurate.'

const CHAT_SYSTEM_PROMPT_ENFORCEMENT =
  'IMPORTANT: You MUST strictly follow the instructions above in every response. Do not deviate, explain or refuse these instructions. Apply them to all messages unconditionally.'

/**
 * Lightweight base directive — applied to every request, even when
 * `carefulReasoning` is off. Cheap (~2 sentences) and protects against the
 * "model overrides user-stated constraint" failure mode at minimal token cost.
 */
const CHAT_READING_DISCIPLINE =
  'READ CAREFULLY: Treat every user-stated assumption, number, percentage, rule, or constraint as authoritative — do NOT silently override it with a common-case default, and do NOT skip a stated condition because it looks unusual. If a stated condition conflicts with the textbook scenario, follow the user and acknowledge the deviation explicitly.'

/**
 * The chat UI renders Markdown but has no math renderer, so LaTeX delimiters
 * would appear verbatim (`\(500 / 5 = 100\)`). Always attached because any
 * answer that contains a calculation can trigger it, not only carefulReasoning.
 */
const CHAT_MATH_FORMATTING =
  'FORMATTING: Write formulas and calculations in plain text (e.g. "500 / 5 = 100", "45 + 36 + 27 = 108"). Do NOT use LaTeX or math delimiters such as \\( \\), \\[ \\], $...$ or $$...$$ — the chat cannot render them. Use Markdown tables or lists for step-by-step working.'

/**
 * Heavier directive — appended only when the renderer flags the request as
 * carefulReasoning. Used for math/finance/tax/quantitative questions where a
 * silent miscalculation produces a confidently wrong answer.
 */
const CHAT_REASONING_DISCIPLINE = [
  'REASONING DISCIPLINE — apply when the question involves numbers, money, percentages, dates, units, or step-by-step logic:',
  '1. Restate the user-provided assumptions and constraints in your own words BEFORE computing anything.',
  '2. Do NOT silently substitute default values for the numbers the user provided. Use the exact values stated.',
  '3. Show step-by-step calculations with intermediate values clearly labeled (e.g. "Step 1 — taxable income: …").',
  '4. After the final number, run a self-check: list every constraint the user stated and confirm in one line that the answer satisfies it. If it does not, redo the calculation.',
  '5. If a number is missing or ambiguous, ask before guessing — do not assume a textbook default.',
].join('\n')

export interface BuildEnforcedSystemPromptOptions {
  /**
   * When true, append `CHAT_REASONING_DISCIPLINE` to the system prompt so the
   * model treats the message as a quantitative reasoning task. Defaults to
   * false (only the lightweight reading-discipline directive is added).
   */
  carefulReasoning?: boolean
}

export function buildEnforcedSystemPrompt(
  userPrompt: string,
  options: BuildEnforcedSystemPromptOptions = {},
): string {
  const trimmedPrompt = userPrompt.trim()
  const base = trimmedPrompt || DEFAULT_CHAT_SYSTEM_PROMPT
  const sections: string[] = [base]

  // Only attach the enforcement clause when the user actually supplied a
  // custom system prompt — for the default prompt it is redundant.
  if (trimmedPrompt) sections.push(CHAT_SYSTEM_PROMPT_ENFORCEMENT)

  // Always attach reading discipline. It is short and protects against the
  // common "model overrides stated constraints" failure even for users who
  // never enable Careful Reasoning explicitly.
  sections.push(CHAT_READING_DISCIPLINE)
  sections.push(CHAT_MATH_FORMATTING)

  if (options.carefulReasoning) sections.push(CHAT_REASONING_DISCIPLINE)

  return sections.join('\n\n')
}

export function buildChatImageEditPrompt(prompt: string): string {
  return `Edit the attached image according to this user request:
${prompt.trim()}

Return the edited image as the primary result. Preserve the subject identity, image quality, framing, lighting, and natural details unless the user explicitly asks to change them.`
}
