import { memo, useCallback, useState } from 'react'

import { useAppStore, useT } from '../../store/useAppStore'
import type { ChatMessage, ChatMessageContent } from '../../types'
import { AppLogoIcon } from '../AppLogo'
import { MarkdownText } from '../MarkdownText'
import { Button } from '../ui/atoms'
import { CopyIcon, DownloadIcon, LightbulbIcon, RefreshIcon, SparklesIcon, SpinnerIcon, ThumbsDownIcon, ThumbsUpIcon, UserIcon } from '../ui/icons'
import { ImageLightbox, stripTrailingEllipsis, ThinkingDots, ThinkingPill } from '../ui/molecules'
import { UsageCostBadge } from '../ui/UsageCostBadge'

/**
 * Shared button shells for the message-action toolbar (copy / download /
 * regenerate). They sit *inside* `.chat-message-actions`, which fades the
 * whole row in only on hover or focus — the visual rule "controls reveal on
 * intent" matches modern chat UIs (ChatGPT, Claude) and keeps the conversation
 * scroll clean.
 */
const MESSAGE_ACTION_BUTTON_CLASS = 'chat-message-action-button'
const MESSAGE_COPY_BUTTON_CLASS = MESSAGE_ACTION_BUTTON_CLASS
const MESSAGE_DOWNLOAD_BUTTON_CLASS = MESSAGE_ACTION_BUTTON_CLASS
const MESSAGE_REGENERATE_BUTTON_CLASS = MESSAGE_ACTION_BUTTON_CLASS

/**
 * "Thinking…" indicator. The `muted` variant is used inside the collapsed
 * research-step header where the label has to sit on a neutral surface.
 */
function ThinkingLabel({ muted = false }: { muted?: boolean } = {}) {
  const t = useT()
  if (muted) {
    return (
      <span className="thinking-inline-label">
        <ThinkingDots tone="muted" />
        <span>{stripTrailingEllipsis(t.chat_thinking_label)}</span>
      </span>
    )
  }
  return <ThinkingPill label={t.chat_thinking_label} />
}

/** Smart Thinking pill — same shape as ThinkingLabel with a quiet shimmer. */
function SmartThinkingLabel({ label }: { label: string }) {
  return <ThinkingPill label={label} title={label} shimmer />
}


function getImageSource(content: ChatMessageContent): string | null {
  if (content.imagePreviewUrl) return content.imagePreviewUrl
  if (content.imageBase64 && content.imageMimeType) {
    return `data:${content.imageMimeType};base64,${content.imageBase64}`
  }
  return null
}

interface MessageBubbleProps {
  message: ChatMessage
  onCopy: (text: string) => void
  onCopyImage?: (content: ChatMessageContent) => void
  onDownloadImage?: (content: ChatMessageContent) => void
  onRegenerate?: () => void
  isLastAssistant?: boolean
  isSending?: boolean
  copyLabel?: string
  downloadImageLabel?: string
  regenerateLabel?: string
}

function MessageBubbleImpl({
  message,
  onCopy,
  onCopyImage,
  onDownloadImage,
  onRegenerate,
  isLastAssistant,
  isSending,
  copyLabel,
  downloadImageLabel,
  regenerateLabel,
}: MessageBubbleProps) {

  const t = useT()
  const costCurrency = useAppStore((state) => state.costCurrency)
  const isUser = message.role === 'user'
  const textContent = message.content.find((c) => c.type === 'text')?.text ?? ''
  const imageContents = message.content.filter((c) => c.type === 'image')
  const downloadableImage = !isUser
    ? imageContents.find((img) => img.imagePreviewUrl || (img.imageBase64 && img.imageMimeType))
    : null

  // Collapse state for research step bubbles (starts collapsed)
  const [isStepCollapsed, setIsStepCollapsed] = useState(true)
  const [previewImage, setPreviewImage] = useState<ChatMessageContent | null>(null)
  const previewImageSrc = previewImage ? getImageSource(previewImage) : null

  const closeImagePreview = useCallback(() => setPreviewImage(null), [])

  // ── Research Step bubble (collapsible, gray) ──────────────────────────────
  if (message.isResearchStep) {
    return (
      <div className="flex gap-2 items-start pl-11">
        <div className="chat-research-step flex-1">
          {/* Header — always visible, click to expand/collapse */}
          <button
            type="button"
            onClick={() => !message.isLoading && setIsStepCollapsed((v) => !v)}
            className="btn-menu-item justify-between"
          >
            <span className="flex items-center gap-2 font-medium text-left">
              {!message.isLoading && (
                <LightbulbIcon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-300" />
              )}
              <span>
                {message.isLoading ? <ThinkingLabel muted /> : message.researchStepLabel}
              </span>
            </span>

            {message.isLoading ? (
              <SpinnerIcon className="w-3 h-3 animate-spin text-gray-400 flex-shrink-0" />
            ) : (
              <span
                className={`text-gray-400 text-base leading-none flex-shrink-0 transition-transform duration-200
                            ${isStepCollapsed ? '' : 'rotate-90'}`}
              >
                ›
              </span>
            )}
          </button>

          {/* Content — hidden when collapsed or loading */}
          {!isStepCollapsed && !message.isLoading && textContent && (
            <div className="px-3 py-2.5 border-t border-gray-200/60 dark:border-neutral-800
                            text-gray-600 dark:text-gray-300 leading-relaxed bg-white/60 dark:bg-neutral-950/30">
              <MarkdownText text={textContent} className="text-xs" />
            </div>
          )}

          {/* Error state */}
          {message.error && (
            <div className="ui-error-text ui-error-divider-top px-3 py-2 text-xs">
              {message.error}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Research Final bubble ─────────────────────────────────────────────────
  if (message.isResearchFinal) {
    return (
      <div className="chat-message-row group flex gap-3 items-start">
        {/* Avatar */}
        <div className="chat-message-avatar chat-message-avatar-assistant flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm">
          <AppLogoIcon size="sm" />
        </div>

        <div className="chat-message-content flex-1 min-w-0 flex flex-col gap-1.5">
          {message.isLoading ? (
            <div className="rounded-2xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm shadow-gray-900/[0.05]
                            dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center gap-2">
                <SmartThinkingLabel label={t.chat_deep_research_summarizing} />
              </div>
            </div>
          ) : (
            <div className="chat-research-final">
              {/* Badge header */}
              <div className="chat-research-final-header">
                <SparklesIcon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-300" />
                <span className="ui-kicker font-bold tracking-[0.18em] text-gray-700 dark:text-gray-200">
                  {t.chat_deep_research_badge}
                </span>
              </div>
              {/* Content */}
              <div className="px-4 py-3.5 select-text cursor-text">
                <MarkdownText text={textContent} />
              </div>
            </div>
          )}

          {/* Timestamp + copy — hover-only */}
          {!message.isLoading && textContent && (
            <div className="chat-message-actions flex items-center gap-1 px-1">
              <span className="ui-micro">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <Button
                size="xs"
                shape="icon"
                variant="neutral"
                appearance="ghost"
                onClick={() => onCopy(textContent)}
                title={copyLabel ?? t.translate_copy}
                aria-label={copyLabel ?? t.translate_copy}
                className={MESSAGE_COPY_BUTTON_CLASS}
              >
                <CopyIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Normal bubble ─────────────────────────────────────────────────────────
  const showPinnedActions = !isUser && (isLastAssistant || Boolean(message.error))
  // Still waiting for the first token: show only the status pill. A timestamp
  // for an unfinished reply is noise, so the actions row waits for content.
  const isPendingReply = Boolean(message.isLoading && !textContent && !message.error)

  return (
    <div
      className={`chat-message-row group flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start`}
      data-message-role={isUser ? 'user' : 'assistant'}
    >
      {/* Avatar */}
      <div className={`chat-message-avatar flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm
                       ${isUser
                         ? 'chat-message-avatar-user'
                         : 'chat-message-avatar-assistant'}`}>
        {isUser ? (
          <UserIcon className="w-4 h-4" />
        ) : (
          <AppLogoIcon size="sm" />
        )}
      </div>

      <div className={`chat-message-content flex flex-col gap-1.5 min-w-0 max-w-[78%] ${isUser ? 'items-end' : 'items-start w-full'}`}>
        {/* Image attachments */}
        {imageContents.map((img, i) => {
          const imageSrc = getImageSource(img)
          return imageSrc && (
            <button
              type="button"
              // biome-ignore lint/suspicious/noArrayIndexKey: stable index for images
              key={i}
              onClick={() => setPreviewImage(img)}
              title={t.chat_open_image}
              aria-label={t.chat_open_image}
              className="block max-w-full rounded-xl cursor-pointer"
            >
              <img
                src={imageSrc}
                alt={img.imageFileName ?? 'attachment'}
                className="max-w-full rounded-xl max-h-64 object-contain border border-gray-200 dark:border-neutral-800
                           transition-shadow duration-150 hover:shadow-lg shadow-sm shadow-gray-900/[0.05]"
              />
            </button>
          )
        })}

        {/* Text / status — mirrors the Quick Chat popup phase indicator:
         *   • Smart Thinking step running → neutral pill "Smart Thinking…"
         *   • otherwise                   → "Thinking…" label with spinner + cycling dots
         * Both states have a blinking/animated indicator so the user clearly
         * sees the AI is working. */}
        {message.isLoading && !textContent ? (
          <div className="chat-message-status px-1">
            {message.isSmartThinkingStep ? (
              <SmartThinkingLabel
                label={message.researchStepLabel ?? t.chat_smart_thinking_badge}
              />
            ) : (
              <ThinkingLabel />
            )}
          </div>
        ) : textContent ? (
          <div className={`break-words select-text cursor-text
                           ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
            {isUser ? (
              <span className="text-sm leading-relaxed whitespace-pre-wrap">{textContent}</span>
            ) : (
              <MarkdownText text={textContent} />
            )}
          </div>
        ) : message.error ? (
          <div className="ui-error-box select-text cursor-text shadow-sm">
            {message.error}
          </div>
        ) : null}

        {message.error && textContent && (
          <div className="ui-error-box text-xs">
            {message.error}
          </div>
        )}

        {/* Timestamp + Copy + Regenerate — hover-reveal except for the
         * always-visible last assistant / error message which gets pinned so
         * the user always sees regenerate / copy without hunting for it. */}
        {!isPendingReply && (
        <div className={`chat-message-actions ${showPinnedActions ? 'chat-message-actions-pinned' : ''} flex items-center gap-1 px-1
                         ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="ui-micro tabular-nums">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && message.cost && (
            <UsageCostBadge cost={message.cost} currency={costCurrency} />
          )}
          {!isUser && message.usedModel && !message.isLoading && (
            <span
              className="ui-micro min-w-0 truncate"
              title={t.chat_used_model(message.usedModel)}
              data-testid="chat-used-model"
            >
              {t.chat_used_model(message.usedModel)}
            </span>
          )}

          {/* Copy button */}
          {textContent && !message.isLoading && (
            <Button
              size="xs"
              shape="icon"
              variant="neutral"
              appearance="ghost"
              onClick={() => onCopy(textContent)}
              title={copyLabel ?? t.translate_copy}
              aria-label={copyLabel ?? t.translate_copy}
              className={MESSAGE_COPY_BUTTON_CLASS}
            >
              <CopyIcon className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Download generated assistant image */}
          {downloadableImage && onDownloadImage && !message.isLoading && (
            <Button
              size="xs"
              shape="icon"
              variant="neutral"
              appearance="ghost"
              onClick={() => onDownloadImage(downloadableImage)}
              title={downloadImageLabel}
              aria-label={downloadImageLabel ?? t.chat_download_image}
              className={MESSAGE_DOWNLOAD_BUTTON_CLASS}
            >
              <DownloadIcon className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Thumbs up / down feedback — assistant messages only, not loading */}
          {!isUser && !message.isLoading && textContent && (
            <>
              <Button
                size="xs"
                shape="icon"
                variant="neutral"
                appearance="ghost"
                title={t.chat_feedback_good}
                aria-label={t.chat_feedback_good}
                className={MESSAGE_ACTION_BUTTON_CLASS}
              >
                <ThumbsUpIcon className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="xs"
                shape="icon"
                variant="neutral"
                appearance="ghost"
                title={t.chat_feedback_bad}
                aria-label={t.chat_feedback_bad}
                className={MESSAGE_ACTION_BUTTON_CLASS}
              >
                <ThumbsDownIcon className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {/* Regenerate button — only on last assistant message */}
          {!isUser && isLastAssistant && onRegenerate && !message.isLoading && (
            <Button
              size="xs"
              shape="icon"
              variant="primary"
              appearance="soft"
              onClick={onRegenerate}
              disabled={isSending}
              title={regenerateLabel ?? t.chat_regenerate}
              aria-label={regenerateLabel ?? t.chat_regenerate}
              className={MESSAGE_REGENERATE_BUTTON_CLASS}
            >
              <RefreshIcon className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        )}
      </div>

      {previewImage && previewImageSrc && (
        <ImageLightbox
          src={previewImageSrc}
          alt={previewImage.imageFileName ?? t.chat_image_preview}
          previewLabel={t.chat_image_preview}
          toolbarLabel={t.chat_image_actions}
          copyLabel={copyLabel ?? t.chat_copy}
          downloadLabel={downloadImageLabel ?? t.chat_download_image}
          closeLabel={t.chat_close_image_preview}
          onCopy={onCopyImage ? () => onCopyImage(previewImage) : undefined}
          onDownload={onDownloadImage ? () => onDownloadImage(previewImage) : undefined}
          onClose={closeImagePreview}
        />
      )}
    </div>
  )
}

/**
 * Custom equality so MessageBubble only re-renders when something the bubble
 * actually displays has changed. Critical during streaming: ChatPage triggers
 * a re-render for every token, but only the *target* message's `content`
 * changes — every other bubble stays stable. We compare:
 *
 *   - identity-stable scalar fields (id, role, isLoading, error, …)
 *   - the textual content (cheap reference compare on the text leaf)
 *   - the number of image content parts (rarely changes)
 *
 * Callbacks are intentionally *not* compared by identity — ChatPage passes
 * fresh closures every render, but they have no observable effect on a
 * non-target bubble. We accept the tiny risk of a stale closure firing in
 * exchange for skipping ~99% of token-time re-renders.
 */
function areMessageBubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  if (prev.message === next.message
    && prev.isLastAssistant === next.isLastAssistant
    && prev.isSending === next.isSending
    && prev.copyLabel === next.copyLabel
    && prev.downloadImageLabel === next.downloadImageLabel
    && prev.regenerateLabel === next.regenerateLabel
  ) return true

  // Different message reference — compare the fields the bubble renders.
  const a = prev.message
  const b = next.message
  if (a.id !== b.id) return false
  if (a.role !== b.role) return false
  if (a.timestamp !== b.timestamp) return false
  if (a.isLoading !== b.isLoading) return false
  if (a.error !== b.error) return false
  if (a.isResearchStep !== b.isResearchStep) return false
  if (a.isResearchFinal !== b.isResearchFinal) return false
  if (a.isSmartThinkingStep !== b.isSmartThinkingStep) return false
  if (a.researchStepLabel !== b.researchStepLabel) return false
  if (a.cost !== b.cost) return false
  if (a.usedModel !== b.usedModel) return false
  if (a.content !== b.content && a.content.length !== b.content.length) return false
  // Compare each content slot — text is the only frequently-changing leaf.
  if (a.content !== b.content) {
    for (let i = 0; i < a.content.length; i++) {
      const ca = a.content[i]
      const cb = b.content[i]
      if (ca.type !== cb.type) return false
      if (ca.text !== cb.text) return false
      if (ca.imageBase64 !== cb.imageBase64) return false
      if (ca.imagePreviewUrl !== cb.imagePreviewUrl) return false
    }
  }
  if (prev.isLastAssistant !== next.isLastAssistant) return false
  if (prev.isSending !== next.isSending) return false
  if (prev.copyLabel !== next.copyLabel) return false
  if (prev.downloadImageLabel !== next.downloadImageLabel) return false
  if (prev.regenerateLabel !== next.regenerateLabel) return false
  return true
}

/**
 * Memoised export — see `areMessageBubblePropsEqual` for the equality contract.
 * This avoids re-rendering every bubble in a long conversation each time a
 * single token streams into the active assistant message.
 */
export const MessageBubble = memo(MessageBubbleImpl, areMessageBubblePropsEqual)
