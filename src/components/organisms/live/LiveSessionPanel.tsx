import { Button } from '../../ui/atoms'
import { DownloadIcon, LightbulbIcon, SpinnerIcon } from '../../ui/icons'
import { SectionCard } from '../../ui/molecules'

export interface LiveSessionSpeaker {
  id: string
  name: string
  /** How many transcript lines this speaker has. */
  lines: number
}

export interface LiveSessionPanelLabels {
  title: string
  summary: string
  summaryEmpty: string
  summarize: string
  openSummary: string
  summarizing: string
  speakers: string
  speakersEmpty: string
  speakerLines: (count: number) => string
  export: string
  exportTxt: string
  exportSrt: string
  previousSessions: (count: number) => string
}

export interface LiveSessionPanelProps {
  labels: LiveSessionPanelLabels
  /** A short excerpt of the summary, when one exists. */
  summaryExcerpt: string | null
  isSummarizing: boolean
  canSummarize: boolean
  speakers: readonly LiveSessionSpeaker[]
  canExportTxt: boolean
  canExportSrt: boolean
  previousCount: number
  onOpenSummary: () => void
  onExportTxt: () => void
  onExportSrt: () => void
  onOpenPrevious: () => void
}

/**
 * "This session" beside the transcript: the summary once there is one, who
 * spoke, exports, and the way to earlier sessions. Props only; the page owns
 * the session data and the actions.
 */
export function LiveSessionPanel({
  labels,
  summaryExcerpt,
  isSummarizing,
  canSummarize,
  speakers,
  canExportTxt,
  canExportSrt,
  previousCount,
  onOpenSummary,
  onExportTxt,
  onExportSrt,
  onOpenPrevious,
}: LiveSessionPanelProps) {
  return (
    <aside className="live-session-panel" aria-label={labels.title}>
      <h2 className="live-session-panel__title">{labels.title}</h2>

      <SectionCard title={labels.summary}>
        {isSummarizing ? (
          <p className="live-session-panel__note" role="status">
            <SpinnerIcon className="live-session-panel__spinner animate-spin" />
            {labels.summarizing}
          </p>
        ) : summaryExcerpt ? (
          <p className="live-session-panel__excerpt">{summaryExcerpt}</p>
        ) : (
          <p className="live-session-panel__note">{labels.summaryEmpty}</p>
        )}
        <Button size="sm" shape="rect" variant="primary" appearance={summaryExcerpt ? 'outline' : 'soft'}
          disabled={!canSummarize || isSummarizing} onClick={onOpenSummary}>
          <LightbulbIcon className="h-4 w-4" />
          {summaryExcerpt ? labels.openSummary : labels.summarize}
        </Button>
      </SectionCard>

      <SectionCard title={labels.speakers}>
        {speakers.length === 0 ? (
          <p className="live-session-panel__note">{labels.speakersEmpty}</p>
        ) : (
          <ul className="live-session-panel__speakers">
            {speakers.map((speaker) => (
              <li key={speaker.id}>
                <span className="live-session-panel__speaker">{speaker.name}</span>
                <span className="live-session-panel__note">{labels.speakerLines(speaker.lines)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={labels.export}>
        <div className="live-session-panel__actions">
          <Button size="sm" shape="rect" variant="neutral" appearance="outline" disabled={!canExportTxt} onClick={onExportTxt} title={labels.exportTxt}>
            <DownloadIcon className="h-4 w-4" />TXT
          </Button>
          <Button size="sm" shape="rect" variant="neutral" appearance="outline" disabled={!canExportSrt} onClick={onExportSrt} title={labels.exportSrt}>
            <DownloadIcon className="h-4 w-4" />SRT
          </Button>
        </div>
      </SectionCard>

      <Button size="sm" shape="rect" variant="neutral" appearance="ghost" className="live-session-panel__previous" onClick={onOpenPrevious}>
        {labels.previousSessions(previousCount)}
      </Button>
    </aside>
  )
}
