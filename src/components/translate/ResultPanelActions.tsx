import { CopyButton } from '../ui/CopyButton'
import { DownloadImageButton } from '../ui/DownloadImageButton'
import { RewriteButton } from '../ui/RewriteButton'
import type { SpeakPanel } from '../ui/SpeakButton'
import { SpeakButton } from '../ui/SpeakButton'

interface ResultPanelActionsProps {
  translatedText: string
  targetLang: string
  editedImageUrl: string | null
  hasImageRegions: boolean
  hasImageAttachment: boolean
  copied: boolean
  isRewriting: 'source' | 'translated' | null
  speakingPanel: SpeakPanel | null
  speakLoading: boolean
  onSpeak: (text: string, lang: string, panel: SpeakPanel) => void
  onDownloadEdited: () => void
  onDownloadTranslated: () => void
  onRewrite: (panel: 'source' | 'translated') => void
  onCopy: () => void
  /** Pre-formatted character count, e.g. "62 chars"; empty hides the count. */
  charCountLabel: string
  labelSpeak: string
  labelSpeakStop: string
  labelDownload: string
  labelRewrite: string
  labelRewriting: string
  labelCopy: string
  labelCopied: string
}

/**
 * Footer actions for the result panel.
 * Left: copy → rewrite → speak → download
 * Right: char count
 */
export function ResultPanelActions({
  translatedText, targetLang, editedImageUrl,
  hasImageRegions, hasImageAttachment,
  copied, isRewriting, speakingPanel, speakLoading,
  onSpeak, onDownloadEdited, onDownloadTranslated, onRewrite, onCopy,
  charCountLabel, labelSpeak, labelSpeakStop, labelDownload,
  labelRewrite, labelRewriting, labelCopy, labelCopied,
}: ResultPanelActionsProps) {
  const hasContent = !!(translatedText || editedImageUrl)

  return (
    <>
      {/* LEFT: action icons — copy, rewrite, speak, download */}
      <div className="flex items-center gap-1.5">
        {hasContent && !editedImageUrl && (
          <CopyButton
            copied={copied}
            onClick={onCopy}
            labelCopy={labelCopy}
            labelCopied={labelCopied}
          />
        )}
        {hasContent && !editedImageUrl && (
          <RewriteButton
            panel="translated"
            isRewriting={isRewriting}
            onRewrite={onRewrite}
            labelRewrite={labelRewrite}
            labelRewriting={labelRewriting}
          />
        )}
        {hasContent && !editedImageUrl && (
          <SpeakButton
            panel="translated"
            text={translatedText}
            lang={targetLang}
            speakingPanel={speakingPanel}
            speakLoading={speakLoading}
            onSpeak={onSpeak}
            labelSpeak={labelSpeak}
            labelStop={labelSpeakStop}
          />
        )}
        {editedImageUrl && (
          <DownloadImageButton title={labelDownload} onClick={onDownloadEdited} />
        )}
        {hasImageRegions && hasImageAttachment && !editedImageUrl && (
          <DownloadImageButton title={labelDownload} onClick={onDownloadTranslated} />
        )}
      </div>

      {/* RIGHT: char count */}
      <span className="translate-char-count tabular-nums">
        {translatedText && !editedImageUrl ? charCountLabel : ''}
      </span>
    </>
  )
}
