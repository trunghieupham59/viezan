/**
 * BilingualSegmentRow — one realtime segment shown as an original/translation
 * pair, so the reader never has to match lines across two panels.
 * Feature-specific: belongs to the Live Translate feature.
 */
import { useTypewriter } from '../../hooks/useTypewriter'
import { SpeakerBadge } from './SpeakerBadge'
import { getSpeakerColorClass } from './speakerColors'

interface BilingualSegmentRowProps {
  speaker: string
  original: string
  translation: string
  speakerNameMap: Record<string, string>
  onRename: (original: string, newName: string) => void
  /** Shown in place of a translation that has not arrived yet. */
  pendingTranslationLabel?: string
  statusLabel?: string
}

export function BilingualSegmentRow({
  speaker,
  original,
  translation,
  speakerNameMap,
  onRename,
  pendingTranslationLabel,
  statusLabel,
}: BilingualSegmentRowProps) {
  const displayName = speakerNameMap[speaker] || speaker
  const displayedOriginal = useTypewriter(original)
  // Slight delay so the translation appears after its original, as in split view.
  const displayedTranslation = useTypewriter(translation, 55)

  return (
    <div className="live-bilingual-row">
      <SpeakerBadge
        name={displayName}
        colorClass={getSpeakerColorClass(speaker)}
        onRename={(newName) => onRename(speaker, newName)}
      />
      <div className="live-bilingual-text">
        <p className="live-bilingual-original">{displayedOriginal}</p>
        {statusLabel && <p className="live-bilingual-pending" role="status">{statusLabel}</p>}
        {translation ? (
          <p className="live-bilingual-translation">{displayedTranslation}</p>
        ) : pendingTranslationLabel ? (
          <p className="live-bilingual-pending">{pendingTranslationLabel}</p>
        ) : null}
      </div>
    </div>
  )
}
