/**
 * Image prompt planning for AI Chat's "Create image" mode.
 *
 * A raw chat message ("vẽ con mèo", "make it bluer") is a poor image prompt:
 * it is short, often not in English, and follow-ups depend on the previous
 * picture. One cheap planning call fixes both:
 *
 *   • rewrites the request into a detailed, self-contained image prompt, and
 *   • decides whether it modifies the image generated earlier in the chat
 *     (edit that image) or asks for something new (generate).
 *
 * Planning is best-effort: any failure falls back to the user's own text so
 * image creation is never blocked by this step.
 */
import { chatService } from './chatService'

export interface ImageRequestPlan {
  /** Prompt to send to the image model. */
  prompt: string
  /** True when the request modifies the most recent generated image. */
  editPrevious: boolean
  /** True when `prompt` differs from the user's own text (worth showing back to them). */
  rewritten: boolean
}

export interface PlanImageRequestParams {
  provider: string
  model: string
  /** The user's message. */
  text: string
  /** Plain transcript of the recent conversation (may be empty). */
  history?: string
  /** An image generated earlier in this conversation is available to edit. */
  hasPreviousImage: boolean
  /** The user attached an image to this message, so the request is an edit of it. */
  hasAttachedImage: boolean
  signal?: AbortSignal
}

const MAX_PROMPT_CHARS = 1500

const PLANNER_PROMPT = (hasPreviousImage: boolean, hasAttachedImage: boolean) => `You are the prompt planner for an AI image model.
Turn the user's latest message into the best possible prompt for the image model.

Rules:
- Keep EVERY detail the user stated: subject, count, colours, style, mood, setting, aspect or format. Never replace their subject with something else.
- Add only what makes the image better and the user left open: composition, lighting, level of detail, medium/style. Do not add extra objects, people or text they did not ask for.
- Write the prompt in English, except text that must appear INSIDE the image: keep that text verbatim, in its original language, in double quotes, and say where it goes.
- Use the earlier conversation only to resolve references ("it", "the same", "like before") so the prompt is fully self-contained.
- Be concrete and concise: 40-150 words, plain sentences, no markdown, no explanations.
${hasAttachedImage
    ? '- The user attached an image: the prompt is an EDIT instruction for that image. Describe only the change and what must stay the same.'
    : hasPreviousImage
      ? '- An image generated earlier in this conversation is available. If the message modifies or refines it (change a colour, add/remove something, restyle, "make it ...", "thêm ...", "đổi ..."), set "action" to "edit_previous" and make the prompt describe only the change plus what must stay the same. If it asks for a different picture, set "action" to "new" and make the prompt a full self-contained description.'
      : '- There is no earlier image: "action" must be "new".'}

Return ONLY valid JSON, no other text:
{"action": "new" | "edit_previous", "prompt": "the prompt"}`

function fallbackPlan(text: string): ImageRequestPlan {
  return { prompt: text.trim(), editPrevious: false, rewritten: false }
}

export async function planImageRequest({
  provider,
  model,
  text,
  history,
  hasPreviousImage,
  hasAttachedImage,
  signal,
}: PlanImageRequestParams): Promise<ImageRequestPlan> {
  const original = text.trim()
  if (!original) return fallbackPlan(text)

  try {
    const result = await chatService.sendAbortable({
      provider,
      model,
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: [
            history?.trim() ? `Earlier conversation:\n${history.trim()}\n` : '',
            `Latest user message:\n${original}`,
          ].filter(Boolean).join('\n'),
        }],
      }],
      systemPrompt: PLANNER_PROMPT(hasPreviousImage, hasAttachedImage),
      bypassLengthCheck: true,
    }, { signal })

    const reply = result.success ? result.reply?.trim() : ''
    const json = reply?.match(/\{[\s\S]*\}/)?.[0]
    if (!json) return fallbackPlan(original)

    const parsed = JSON.parse(json) as { action?: unknown; prompt?: unknown }
    const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim().slice(0, MAX_PROMPT_CHARS) : ''
    if (!prompt) return fallbackPlan(original)

    return {
      prompt,
      editPrevious: parsed.action === 'edit_previous' && hasPreviousImage && !hasAttachedImage,
      rewritten: prompt !== original,
    }
  } catch {
    return fallbackPlan(original)
  }
}
