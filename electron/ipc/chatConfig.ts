export type ChatProviderId = 'openai' | 'claude' | 'gemini'

type ModelTokenRule =
  | { includes: string; maxOutputTokens: number }
  | { startsWith: string; maxOutputTokens: number }
  | { equals: string; maxOutputTokens: number }

export const CHAT_IPC_CHANNELS = {
  send: 'chat:send',
  imageEdit: 'chat:image-edit',
  imageGenerate: 'chat:image-generate',
  stream: 'chat:stream',
  streamEvent: 'chat:stream:event',
  streamCancel: 'chat:stream:cancel',
} as const

export const CHAT_PROVIDER_IDS = {
  openai: 'openai',
  claude: 'claude',
  gemini: 'gemini',
} as const

export const CONFIGURED_CHAT_PROVIDERS = Object.values(CHAT_PROVIDER_IDS)

export const GEMINI_MODEL_RESOURCE_PREFIX = 'models/'
export const OPENAI_CHAT_MODEL_PREFIX = 'gpt-'

export const FALLBACK_MODEL_MAX_OUTPUT_TOKENS = 16_384

export const CHAT_MODEL_OUTPUT_TOKEN_RULES: Record<ChatProviderId, readonly ModelTokenRule[]> = {
  openai: [
    { includes: 'chat-latest', maxOutputTokens: 16_384 },
    { startsWith: 'gpt-5', maxOutputTokens: 128_000 },
    { startsWith: 'gpt-4.1', maxOutputTokens: 32_768 },
    { startsWith: 'gpt-4o', maxOutputTokens: 16_384 },
    { startsWith: 'chatgpt-4o', maxOutputTokens: 16_384 },
    // Older families with smaller completion limits. newer `gpt-4.x` / `gpt-4o`
    // families keep their own limits above.
    { equals: 'gpt-4', maxOutputTokens: 4_096 },
    { startsWith: 'gpt-4-', maxOutputTokens: 4_096 },
    { startsWith: 'gpt-3.5', maxOutputTokens: 4_096 },
  ],
  claude: [
    { startsWith: 'claude-sonnet-4', maxOutputTokens: 64_000 },
    { startsWith: 'claude-opus-4', maxOutputTokens: 32_000 },
    // Claude 3.x families keep their smaller completion limits. Prefixes are
    // exact so `claude-3-7-sonnet` and every 4.x id fall through to the default.
    { startsWith: 'claude-3-5-sonnet', maxOutputTokens: 8_192 },
    { startsWith: 'claude-3-5-haiku', maxOutputTokens: 8_192 },
    { startsWith: 'claude-3-opus', maxOutputTokens: 4_096 },
    { startsWith: 'claude-3-sonnet', maxOutputTokens: 4_096 },
    { startsWith: 'claude-3-haiku', maxOutputTokens: 4_096 },
  ],
  gemini: [
    { includes: '2.5', maxOutputTokens: 65_536 },
  ],
}

export const GEMINI_SUCCESS_FINISH_REASON = 'STOP'

export const OPENAI_NON_CHAT_MODEL_PATTERNS = [
  /instruct/i,
  /^babbage/i,
  /^davinci/i,
  /^curie/i,
  /^ada/i,
  /text-davinci/i,
  /code-davinci/i,
  /search/i,
  /image/i,
  /codex/i,
]

export const OPENAI_CHAT_MODEL_HARD_EXCLUDES = [
  'embedding',
  'tts',
  'whisper',
  'dall-e',
  'moderation',
  'text-search',
  'text-similarity',
  'code-search',
  'realtime',
  'audio',
  'transcribe',
]

export const OPENAI_DEFAULT_CHAT_FALLBACK_MODEL = 'gpt-4o'

export const OPENAI_CHAT_ENDPOINT_ERROR_MARKERS = {
  notChatModel: 'not a chat model',
  completionsPath: 'v1/completions',
  notFoundStatus: '404',
  completionsResource: 'completions',
} as const

export const GEMINI_IMAGE_MODEL_RETRY_ERROR_MARKERS = [
  '404',
  'not found',
  'not supported',
  'not available',
  'unsupported model',
] as const

export const OPENAI_CHAT_MODEL_SCORE = {
  nonChat: -9999,
  majorMultiplier: 1000,
  minorMultiplier: 10,
  nanoPenalty: 5,
  miniPenalty: 2,
  optimizedSuffixBonus: 1,
  dateBaseline: 20230101,
  dateMaxBonus: 9999,
  dateBonusDivisor: 10000,
} as const

export const CHAT_IMAGE_EDIT_SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_CHAT_IMAGE_EDIT_MODEL_ID_CHARS = 200

export type ClaudeImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export const CHAT_IMAGE_EDIT_FILE_BASENAME = 'chat-image-edit'
export const CHAT_IMAGE_EDIT_DEFAULT_MIME_TYPE = 'image/png'
export const CHAT_IMAGE_EDIT_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const CHAT_IMAGE_EDIT_RESPONSE_MODALITIES = ['TEXT', 'IMAGE'] as const
export const CHAT_IMAGE_EDIT_JSON_CONTENT_TYPE = 'application/json'

export const OPENAI_CHAT_IMAGE_DETAIL = 'high' as const
export const OPENAI_IMAGE_EDIT_OPTIONS = {
  n: 1,
  size: 'auto',
  quality: 'auto',
} as const
