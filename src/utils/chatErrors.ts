import type { Translations } from '../i18n/types'

export type ChatErrorLike = {
  error?: string
  errorCode?: string
}

function isTimeoutLikeError(error: string): boolean {
  const lower = error.toLowerCase()
  return lower.includes('abort') || lower.includes('timeout') || lower.includes('timed out')
}

function isBlockedRecitationLikeError(error: string): boolean {
  const lower = error.toLowerCase()
  return lower.includes('recitation') ||
    (lower.includes('copyright') && (lower.includes('blocked') || lower.includes('filtered')))
}

function isBlockedSafetyLikeError(error: string): boolean {
  const lower = error.toLowerCase()
  return lower.includes('blocked due to safety') ||
    lower.includes('candidate was blocked') ||
    lower.includes('prompt was blocked') ||
    lower.includes('content was filtered') ||
    lower.includes('finishreason=safety') ||
    lower.includes('finish_reason=content_filter') ||
    lower.includes('safety_settings')
}

export function localizeChatError(t: Translations, result: ChatErrorLike, fallback: string): string {
  switch (result.errorCode) {
    case 'NO_API_KEY':
      return t.chat_error_no_key
    case 'INVALID_KEY':
      return t.chat_error_invalid_key
    case 'RATE_LIMIT':
      return t.chat_error_rate_limit
    case 'NETWORK':
      return t.chat_error_network
    case 'TIMEOUT':
      return t.chat_error_timeout
    case 'EMPTY_RESPONSE':
      return t.chat_error_empty_response
    case 'BLOCKED_RECITATION':
      return t.chat_error_blocked_recitation
    case 'BLOCKED_SAFETY':
      return t.chat_error_blocked_safety
    case 'MODEL_REFUSAL':
      return t.chat_error_model_refusal
    case 'NO_IMAGE_EDIT':
      return t.chat_error_no_image_edit
    case 'PRELOAD_OUTDATED':
      return t.chat_error_image_edit_reload_required
    default:
      if (result.error && isTimeoutLikeError(result.error)) return t.chat_error_timeout
      if (result.error && isBlockedRecitationLikeError(result.error)) return t.chat_error_blocked_recitation
      if (result.error && isBlockedSafetyLikeError(result.error)) return t.chat_error_blocked_safety
      return result.error || fallback
  }
}

export function localizeChatException(t: Translations, error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (message && isTimeoutLikeError(message)) return t.chat_error_timeout
  if (message && isBlockedRecitationLikeError(message)) return t.chat_error_blocked_recitation
  if (message && isBlockedSafetyLikeError(message)) return t.chat_error_blocked_safety
  return message || fallback
}
