export const CHAT_IMAGE_EDIT_VALIDATION_MESSAGES = {
  payloadMustBeObject: 'Chat image edit payload must be an object',
  providerRequired: 'Provider is required',
  modelRequired: 'Model is required',
  modelTooLong: 'Model is too long',
  promptRequired: 'Image edit prompt is required',
  noImageData: 'No image data provided',
  invalidImageData: 'Invalid image data',
  unsupportedImageMimeType: 'Unsupported image MIME type',
  promptTooLong: (maxChars: number) =>
    `Image edit prompt is too long. Maximum is ${maxChars} characters.`,
} as const

export const CHAT_RUNTIME_MESSAGES = {
  geminiEmptyResponse: 'Gemini returned an empty response.',
  geminiEmptyResponseWithFinishReason: (finishReason: string) =>
    `Gemini returned an empty response (finishReason=${finishReason}).`,
  geminiTextWithoutImage: (text: string) =>
    `Gemini returned text but no edited image: ${text}`,
  geminiNoEditedImage: 'Gemini image edit did not return an image.',
  geminiImageEditFailed: (status: number, errorText: string) =>
    `Gemini image edit failed: ${status} ${errorText}`,
  claudeEmptyResponse: (stopReason: string) =>
    `Claude returned an empty response (stop_reason=${stopReason}).`,
  claudeStreamEmptyResponse: 'Claude returned an empty response.',
  claudeUnexpectedResponseType: 'Unexpected response type from Claude',
  openAiEmptyResponse: (finishReason: string, refusal?: unknown) =>
    `OpenAI returned an empty response (finish_reason=${finishReason}${refusal ? `, refusal=${refusal}` : ''}).`,
  openAiStreamEmptyResponse: 'OpenAI returned an empty response.',
  openAiImageUrlDownloadFailed: (status: number) =>
    `OpenAI image edit returned a URL, but downloading it failed (${status}).`,
  remoteImageInvalidUrl: 'Returned image URL is not a valid https URL.',
  remoteImageNotAnImage: 'Returned image URL did not serve a supported image.',
  remoteImageTooLarge: (maxBytes: number) =>
    `Returned image is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`,
  openAiNoEditedImage: 'OpenAI image edit did not return an image.',
  localAiEmptyResponse: (finishReason: string) =>
    `Local AI returned an empty response (finish_reason=${finishReason}).`,
  localAiStreamEmptyResponse: 'Local AI returned an empty response.',
  imageEditUnsupportedProvider:
    'Image editing is currently available with Gemini or OpenAI. Switch provider to edit images directly.',
  streamRequestIdRequired: 'Chat stream requestId is required',
  streamRequestIdInUse: 'A chat stream with this requestId is already in progress',
  chatFailed: (message: string) => `Chat failed: ${message}`,
} as const

export const CHAT_LOG_MESSAGES = {
  geminiOutputLimitFetchFailed: '[chat] Failed to fetch Gemini model output limit:',
  openAiFallbackModelSelected: (model: string) =>
    `[chat] Fallback to best chat model: ${model}`,
  openAiFallbackModelsFetchFailed: '[chat] Failed to fetch models for fallback:',
  providerError: (provider: string) => `Chat error with ${provider}:`,
  imageEditProviderError: (provider: string) => `Chat image edit error with ${provider}:`,
  streamProviderError: (provider: string) => `Chat stream error with ${provider}:`,
} as const
