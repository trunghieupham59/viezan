import { useEffect, useState } from 'react'
import type { LiveSegmentState } from '../../shared/liveInterpretation'
import { BilingualSegmentRow } from '../components/live/BilingualSegmentRow'
import { SegmentRow } from '../components/live/SegmentRow'
import { TranslationRow } from '../components/live/TranslationRow'
import { MarkdownText } from '../components/MarkdownText'
import { AIModelPickerField, InterpretAIConfiguration, InterpretSubtitleConfiguration, LanguagePairBar, LiveSessionStatus } from '../components/organisms'
import { Button } from '../components/ui/atoms'
import { 
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  GearIcon,
  InfoCircleIcon,
  LayersIcon,
  LightbulbIcon,
  MicrophoneIcon,
  MonitorIcon,
  SpinnerIcon,
  StopIcon,
  SubtitlesIcon,
  TranslateIcon,
  TrashIcon,
  XIcon,} from '../components/ui/icons'
import { EmptyPanelState, NotificationToast } from '../components/ui/molecules'
import { COPY_FEEDBACK_DURATION_MS, DEFAULT_SEGMENT_DURATION_MS, MIN_SEGMENT_DURATION_MS } from '../constants/ui'
import { MACOS_SCREEN_RECORDING_PREFS } from '../constants/urls'
import { useFollowLatest } from '../hooks/live/useFollowLatest'
import type { LiveAudioMode } from '../hooks/live/vadPolicy'
import { DEFAULT_SUBTITLE_SETTINGS, useLiveTranslate } from '../hooks/useLiveTranslate'
import type { Translations } from '../i18n/types'
import { useAppStore, useT } from '../store/useAppStore'
import '../styles/translate.css'

function segmentStatus(state: LiveSegmentState | undefined, t: Translations): string | undefined {
  if (state === 'pending') return t.live_sentence_pending
  if (state === 'provisional') return t.live_sentence_provisional
  if (state === 'incomplete') return t.live_sentence_incomplete
  return undefined
}

/**
 * DUP-04: Shared helper for downloading text content as a file.
 */
function downloadTextFile(content: string, baseName: string, ext: string): void {
  const dateStr = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}-${dateStr}.${ext}`
  a.click()
  URL.revokeObjectURL(url)
}

const SUBTITLE_FONT_SIZES = [
  { size: 14 as const, label: 'S' },
  { size: 18 as const, label: 'M' },
  { size: 22 as const, label: 'L' },
  { size: 28 as const, label: 'XL' },
  { size: 34 as const, label: '2X' },
]

type PostTab = 'summary' | 'actions' | 'decisions'

/** Side-by-side panels, or each segment paired with its translation. */
export type LiveViewMode = 'split' | 'paired'
const LIVE_VIEW_MODE_STORAGE_KEY = 'viezan.live.viewMode'

/** Per-viewer layout preference; storage may be unavailable, so fall back to split. */
function readStoredViewMode(): LiveViewMode {
  try {
    return localStorage.getItem(LIVE_VIEW_MODE_STORAGE_KEY) === 'paired' ? 'paired' : 'split'
  } catch {
    return 'split'
  }
}

function writeStoredViewMode(mode: LiveViewMode) {
  try {
    localStorage.setItem(LIVE_VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // Preference is a convenience only.
  }
}

type LiveInputCopySource = Pick<
  Translations,
  | 'live_empty_desc'
  | 'live_empty_system_desc'
  | 'live_empty_both_desc'
  | 'live_status_listening_mic'
  | 'live_status_listening_system'
  | 'live_status_listening_both'
>

export function getLiveInputCopy(audioMode: LiveAudioMode, t: LiveInputCopySource) {
  if (audioMode === 'system') {
    return {
      emptyDescription: t.live_empty_system_desc,
      listeningLabel: t.live_status_listening_system,
    }
  }
  if (audioMode === 'both') {
    return {
      emptyDescription: t.live_empty_both_desc,
      listeningLabel: t.live_status_listening_both,
    }
  }
  return {
    emptyDescription: t.live_empty_desc,
    listeningLabel: t.live_status_listening_mic,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LiveTranslatePage() {
  const { openSettings, liveSourceLang, liveTargetLang } = useAppStore()
  const t = useT()

  const {
    audioMode, setAudioMode, screenPermission,
    isActive, liveLanguagesLocked, sessionLanguages, rawTranscript, translation, isTranscribing, isTranslating,
    micError, dismissMicError, pipelineError,
    showSubtitles, setShowSubtitles,
    subtitleSettings, setSubtitleSettings,
    showSummaryBtn, summary, isSummarizing,
    actionItems, isExtractingActionItems, decisions, isExtractingDecisions,
    speakerNameMap, sessionStartTime,
    segments, pendingText,
    handleStart, handleStop, handleClear, handleSummarize,
    handleExtractActionItems, handleExtractDecisions, handleRenameSpeaker,
    getInputLevel, wordCount, isMac, hasSttKey, hasAnyKey,
    activeSttProvider,
  } = useLiveTranslate()

  const [copiedRaw,       setCopiedRaw]       = useState(false)
  const [copiedTx,        setCopiedTx]        = useState(false)
  const [copiedSummary,   setCopiedSummary]   = useState(false)
  const [copiedActions,   setCopiedActions]   = useState(false)
  const [copiedDecisions, setCopiedDecisions] = useState(false)
  const [postTab, setPostTab] = useState<PostTab>('summary')
  const [showScreenPermModal, setShowScreenPermModal] = useState(false)
  const [showSummaryPopup, setShowSummaryPopup] = useState(false)

  /** Session-scoped AI configuration. Transcript actions stay with transcript output. */
  const [showAIConfig, setShowAIConfig] = useState(false)
  const liveInputCopy = getLiveInputCopy(audioMode, t)
  const startBlockedReason = !hasSttKey ? t.live_no_stt_key
    : !hasAnyKey ? t.live_no_translate_key
    : !isActive && liveLanguagesLocked ? t.language_pairs_locked
    : undefined
  // Missing-key toast: dismissible, and it comes back if the key is removed again later.
  const missingKeyNotice = !hasSttKey
    ? { id: 'stt', message: t.live_no_stt_key }
    : !hasAnyKey
      ? { id: 'translate', message: t.live_no_translate_key }
      : null
  const [dismissedKeyNotice, setDismissedKeyNotice] = useState<string | null>(null)
  const missingKeyNoticeId = missingKeyNotice?.id ?? null
  const activeKeyNotice = missingKeyNotice && missingKeyNotice.id !== dismissedKeyNotice ? missingKeyNotice : null
  useEffect(() => {
    if (missingKeyNoticeId === null) setDismissedKeyNotice(null)
  }, [missingKeyNoticeId])
  const startSession = () => {
    if ((audioMode === 'system' || audioMode === 'both') && isMac && screenPermission !== 'granted') {
      setShowScreenPermModal(true)
    } else {
      handleStart()
    }
  }
  const audioModes: { mode: LiveAudioMode; label: string; title: string; icon: React.ReactNode }[] = [
    { mode: 'mic', label: t.live_audio_mode_mic, title: t.live_audio_mode_mic_title, icon: <MicrophoneIcon /> },
    { mode: 'system', label: t.live_audio_mode_system, title: t.live_audio_mode_system_title, icon: <MonitorIcon /> },
    { mode: 'both', label: t.live_audio_mode_both, title: t.live_audio_mode_both_title, icon: <LayersIcon /> },
  ]

  // ── Global Escape handler for open modals ──
  // Backdrop-level onKeyDown only fires when the backdrop or its descendants
  // have focus; in practice the user's focus stays on the trigger button, so
  // Escape would do nothing without this document listener.
  useEffect(() => {
    if (!showSummaryPopup && !showScreenPermModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showSummaryPopup) setShowSummaryPopup(false)
      if (showScreenPermModal) setShowScreenPermModal(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showSummaryPopup, showScreenPermModal])

  const handleCopy = async (text: string, setFlag: (v: boolean) => void) => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setFlag(true)
    setTimeout(() => setFlag(false), COPY_FEEDBACK_DURATION_MS)
  }

  // ── Export functions ───────────────────────────────────────────────────────
  const handleExportTxt = () => {
    if (!rawTranscript) return
    const lines: string[] = [
      t.live_export_header,
      `Date: ${new Date().toLocaleString()}`,
      '',
      t.live_export_original_section,
      rawTranscript,
      '',
      t.live_export_translation_section,
      translation,
    ]
    if (summary) lines.push('', t.live_export_summary_section, summary)
    if (actionItems) lines.push('', t.live_export_action_items_section, actionItems)
    if (decisions) lines.push('', t.live_export_decisions_section, decisions)
    downloadTextFile(lines.join('\n'), 'meeting', 'txt')
  }

  const handleExportSrt = () => {
    if (!segments.length) return
    const toSrtTime = (ms: number) => {
      const totalSec = Math.floor(ms / 1000)
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      const s = totalSec % 60
      const msRem = Math.min(999, ms % 1000)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msRem).padStart(3, '0')}`
    }
    const lines: string[] = []
    const base = sessionStartTime || (segments[0]?.timestamp ?? Date.now())
    segments.forEach((seg, i) => {
      const startMs = Math.max(0, seg.timestamp - base)
      const nextMs  = i < segments.length - 1 ? segments[i + 1].timestamp - base : startMs + DEFAULT_SEGMENT_DURATION_MS
      const endMs   = Math.max(startMs + MIN_SEGMENT_DURATION_MS, nextMs)
      const displayName = speakerNameMap[seg.speaker] || seg.speaker
      lines.push(
        String(i + 1),
        `${toSrtTime(startMs)} --> ${toSrtTime(endMs)}`,
        `[${displayName}] ${seg.translation || seg.rawText}`,
        '',
      )
    })
    downloadTextFile(lines.join('\n'), 'meeting', 'srt')
  }

  const subtitleColors = [
    { label: t.live_subtitle_color_white,  value: '#ffffff' },
    { label: t.live_subtitle_color_yellow, value: '#fde047' },
    { label: t.live_subtitle_color_cyan,   value: '#22d3ee' },
    { label: t.live_subtitle_color_green,  value: '#4ade80' },
    { label: t.live_subtitle_color_orange, value: '#fb923c' },
    { label: t.live_subtitle_color_pink,   value: '#f472b6' },
  ]

  // ── Open summary popup and auto-trigger summarize ─────────────────────────
  const handleOpenSummaryPopup = () => {
    setShowSummaryPopup(true)
    setPostTab('summary')
    if (!isSummarizing && !summary) {
      handleSummarize()
    }
  }

  // ── Layout + follow-latest scrolling ───────────────────────────────────────
  const [viewMode, setViewMode] = useState<LiveViewMode>(readStoredViewMode)
  const changeViewMode = (mode: LiveViewMode) => {
    setViewMode(mode)
    writeStoredViewMode(mode)
  }
  const rawFollow = useFollowLatest(viewMode)
  const txFollow = useFollowLatest(viewMode)
  const pairedFollow = useFollowLatest(viewMode)
  const hasTranscript = Boolean(rawTranscript) || segments.length > 0

  // ── Shared toolbar / footer pieces (used by both layouts) ──────────────────
  const statusLabel = isTranscribing ? t.voice_transcribing
    : isTranslating ? t.live_status_translating
    : pendingText ? t.voice_recording
    : liveInputCopy.listeningLabel

  const audioSourceGroup = (
    <fieldset className="live-audio-source-group" aria-label={t.live_audio_source_label}>
      {audioModes.map(({ mode, label, title, icon }) => (
        <Button
          key={mode}
          size="sm"
          shape="pill"
          variant={audioMode === mode ? 'primary' : 'neutral'}
          appearance={audioMode === mode ? 'soft' : 'ghost'}
          aria-pressed={audioMode === mode}
          disabled={isActive}
          onClick={() => setAudioMode(mode)}
          title={title}
        >
          {icon}
          <span>{label}</span>
        </Button>
      ))}
    </fieldset>
  )

  const sessionStatus = isActive ? (
    <LiveSessionStatus
      startedAt={sessionStartTime}
      label={statusLabel}
      busy={isTranscribing || isTranslating}
      getInputLevel={getInputLevel}
      inputLevelLabel={t.live_input_level}
      elapsedLabel={t.live_elapsed}
    />
  ) : null

  const sttBadge = isActive ? (
    <span className="ui-badge-xs gap-1.5 select-none" style={{background:'var(--vzn-surface-muted)',color:'var(--vzn-text-soft)'}}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:'var(--vzn-text-muted)'}} />
      {activeSttProvider === 'whisper' ? 'Whisper' :
       activeSttProvider === 'gemini'  ? 'Gemini' :
       activeSttProvider === 'groq'    ? 'Groq (free)' :
       t.live_stt_backend_none}
    </span>
  ) : null

  const viewToggle = (
    <fieldset className="live-audio-source-group" aria-label={t.live_view_mode_label}>
      {([['split', t.live_view_split], ['paired', t.live_view_paired]] as const).map(([mode, label]) => (
        <Button
          key={mode}
          size="sm"
          shape="pill"
          variant={viewMode === mode ? 'primary' : 'neutral'}
          appearance={viewMode === mode ? 'soft' : 'ghost'}
          aria-pressed={viewMode === mode}
          onClick={() => changeViewMode(mode)}
        >
          {label}
        </Button>
      ))}
    </fieldset>
  )

  const subtitleToggle = (
    <Button
      size="sm"
      shape="pill"
      variant={showSubtitles ? 'primary' : 'neutral'}
      appearance={showSubtitles ? 'soft' : 'ghost'}
      aria-pressed={showSubtitles}
      onClick={() => setShowSubtitles(!showSubtitles)}
      title={showSubtitles ? t.live_subtitles_hide_title : t.live_subtitles_show_title}
    >
      <SubtitlesIcon />
      <span>{t.live_subtitles}</span>
    </Button>
  )

  const jumpToLatest = (follow: ReturnType<typeof useFollowLatest>) => !follow.following && (
    <Button
      size="sm"
      shape="pill"
      variant="neutral"
      appearance="outline"
      className="live-jump-latest"
      onClick={follow.jumpToLatest}
    >
      <ChevronDownIcon />
      {t.live_jump_latest}
    </Button>
  )

  const pendingRow = (
    <>
      {isActive && pendingText && (
        <div className="flex items-start gap-2 opacity-50">
          <span className="ui-badge-xs mt-0.5 flex-shrink-0" style={{color:'var(--vzn-text-muted)'}}>
            {segments.length > 0
              ? (speakerNameMap[segments[segments.length - 1].speaker] || segments[segments.length - 1].speaker)
              : t.live_speaker_default}
          </span>
          <span className="ui-reader-text italic" style={{color:'var(--vzn-text-muted)'}}>
            {pendingText}
            <span className="not-italic inline-block ml-0.5 w-0.5 h-4 animate-pulse align-middle" style={{background:'var(--vzn-text-soft)'}} />
          </span>
        </div>
      )}
      {isActive && !pendingText && (
        <div className="flex items-center gap-2 pl-1">
          <span className="inline-block w-0.5 h-4 animate-pulse" style={{background:'var(--vzn-text-soft)'}} />
        </div>
      )}
    </>
  )

  const startEmptyState = (
    <EmptyPanelState
      icon={<MicrophoneIcon />}
      actionLabel={t.live_start}
      description={liveInputCopy.emptyDescription}
      onAction={startBlockedReason ? undefined : startSession}
    />
  )

  const transcriptActions = (
    <div className="live-transcript-actions">
      <Button
        size="xs"
        shape="icon"
        variant={copiedRaw ? 'primary' : 'neutral'}
        appearance="ghost"
        disabled={!rawTranscript}
        onClick={() => handleCopy(rawTranscript, setCopiedRaw)}
        aria-label={t.live_copy_original}
        title={t.live_copy_original}
      >
        {copiedRaw ? <CheckIcon /> : <CopyIcon />}
      </Button>
      <Button
        size="xs"
        shape="rect"
        variant="danger"
        appearance="soft"
        disabled={!rawTranscript}
        onClick={handleClear}
      >
        <TrashIcon />
        {t.live_clear}
      </Button>
      <Button
        size="xs"
        shape="rect"
        variant="neutral"
        appearance="ghost"
        disabled={!rawTranscript}
        onClick={handleExportTxt}
        title={t.live_export_txt}
      >
        <DownloadIcon />
        TXT
      </Button>
      <Button
        size="xs"
        shape="rect"
        variant="neutral"
        appearance="ghost"
        disabled={!segments.length}
        onClick={handleExportSrt}
        title={t.live_export_srt}
      >
        <DownloadIcon />
        SRT
      </Button>
    </div>
  )

  const wordCountLabel = wordCount > 0 && (
    <span className="text-xs tabular-nums select-none" style={{color:'var(--vzn-text-muted)'}}>
      {wordCount.toLocaleString()} {t.live_words}
    </span>
  )

  const translationActions = (
    <>
      <Button
        size="xs"
        shape="icon"
        variant={copiedTx ? 'primary' : 'neutral'}
        appearance="ghost"
        aria-label={t.live_copy_translation}
        type="button"
        disabled={!translation}
        onClick={() => handleCopy(translation, setCopiedTx)}
        title={t.live_copy_translation}
      >
        {copiedTx ? <CheckIcon /> : <CopyIcon />}
      </Button>

      {showSummaryBtn && (
        <Button
          size="xs"
          shape="rect"
          variant="primary"
          appearance="solid"
          type="button"
          onClick={handleOpenSummaryPopup}
        >
          <LightbulbIcon />
          {t.live_summarize}
        </Button>
      )}
    </>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="app-page relative">

      {/* ── Main area ── */}
      <div className="app-workspace">
        <div className="glass-panel flex-1 min-h-0 flex flex-col overflow-hidden">

          <div className="feature-command-bar">
            <h1 className="sr-only">{t.nav_live_translate}</h1>
            <LanguagePairBar
              scope="live"
              lockedReason={isActive ? t.language_pairs_locked_short : t.language_pairs_locked}
            />
            <div className="feature-command-bar-end">
              <InterpretAIConfiguration
                open={showAIConfig}
                active={isActive}
                title={t.ai_configuration_title}
                scopeDescription={isActive
                  ? t.ai_configuration_interpret_active_scope
                  : t.ai_configuration_interpret_scope}
                closeLabel={t.settings_close}
                translationLabel={t.ai_configuration_translation_section}
                outputLabel={t.ai_configuration_output_section}
                onOpenChange={setShowAIConfig}
                modelControl={<AIModelPickerField />}
                subtitleControl={(
                  <InterpretSubtitleConfiguration
                    enabled={showSubtitles}
                    onEnabledChange={setShowSubtitles}
                    settings={subtitleSettings}
                    onSettingsChange={setSubtitleSettings}
                    onReset={() => setSubtitleSettings({ ...DEFAULT_SUBTITLE_SETTINGS })}
                    colors={subtitleColors}
                    fontSizes={SUBTITLE_FONT_SIZES}
                  />
                )}
              />

              {/* ▶ Bắt Đầu / ■ Dừng — the row's single solid action */}
              <Button
                size="md"
                shape="rect"
                variant={isActive ? 'danger' : 'primary'}
                appearance="solid"
                type="button"
                onClick={isActive ? handleStop : startSession}
                disabled={Boolean(startBlockedReason)}
                title={startBlockedReason}
                className="flex-shrink-0"
              >
                {isActive ? (
                  <><StopIcon className="w-3.5 h-3.5" />{t.live_stop}</>
                ) : (
                  <><MicrophoneIcon className="w-3.5 h-3.5" />{t.live_start}</>
                )}
              </Button>
            </div>
          </div>
          {(rawTranscript || translation) && (liveSourceLang !== sessionLanguages.sourceLang || liveTargetLang !== sessionLanguages.targetLang) && (
            <p className="live-language-notice">{t.language_pairs_previous_session}: {t.lang_names[sessionLanguages.sourceLang] ?? sessionLanguages.sourceLang} → {t.lang_names[sessionLanguages.targetLang] ?? sessionLanguages.targetLang}</p>
          )}
          {/* ── End controls ── */}

          {/* ── Body: notices + panels ── */}
          <div className="live-panels-body">

          {/* ── Panels: side-by-side (Nguyên Bản | Bản Dịch) or paired by sentence ── */}
          {viewMode === 'paired' ? (
            <div className="glass-panel live-paired-panel">
              <div className="live-panel-toolbar">
                <div className="live-toolbar-start">{audioSourceGroup}{sessionStatus}</div>
                <div className="live-toolbar-end">{sttBadge}{viewToggle}{subtitleToggle}</div>
              </div>
              <div className="live-scroll-region">
                <div ref={pairedFollow.scrollRef} onScroll={pairedFollow.onScroll} className="live-scroll-viewport">
                  <div ref={pairedFollow.contentRef} className="live-scroll-content">
                    {segments.length > 0 || (isActive && pendingText) ? (
                      <>
                        {segments.map((seg, index) => (
                          <BilingualSegmentRow
                            key={seg.id}
                            speaker={seg.speaker}
                            original={seg.rawText}
                            translation={seg.translation}
                            statusLabel={segmentStatus(seg.state, t)}
                            speakerNameMap={speakerNameMap}
                            onRename={handleRenameSpeaker}
                            pendingTranslationLabel={isActive && isTranslating && index === segments.length - 1
                              ? t.live_status_translating
                              : undefined}
                          />
                        ))}
                        {pendingRow}
                      </>
                    ) : rawTranscript || translation ? (
                      <>
                        <p className="ui-reader-text whitespace-pre-wrap p-1">{rawTranscript}</p>
                        <p className="ui-reader-text font-medium whitespace-pre-wrap p-1">{translation}</p>
                      </>
                    ) : startEmptyState}
                  </div>
                </div>
                {jumpToLatest(pairedFollow)}
              </div>
              {(hasTranscript || translation || showSummaryBtn) && (
                <div className="surface-footer">
                  {transcriptActions}
                  <div className="live-transcript-actions">
                    {wordCountLabel}
                    {translationActions}
                  </div>
                </div>
              )}
            </div>
          ) : (
          <div className="app-panel-grid">

            {/* Left: Nguyên Bản */}
            <div className="glass-panel h-full flex flex-col">
              {/* Audio source stays visible; it is locked while a session runs. */}
              <div className="live-panel-toolbar">
                <div className="live-toolbar-start">
                  <h2 className="live-panel-title">{t.live_panel_original}</h2>
                  {audioSourceGroup}
                </div>
                {sessionStatus}
              </div>
              <div className="live-scroll-region">
                <div ref={rawFollow.scrollRef} onScroll={rawFollow.onScroll} className="live-scroll-viewport">
                  <div ref={rawFollow.contentRef} className="live-scroll-content">
                    {segments.length > 0 || (isActive && pendingText) ? (
                      <>
                        {segments.map((seg) => (
                          <SegmentRow
                            key={seg.id}
                            speaker={seg.speaker}
                            text={seg.rawText}
                            speakerNameMap={speakerNameMap}
                            onRename={handleRenameSpeaker}
                          />
                        ))}
                        {pendingRow}
                      </>
                    ) : rawTranscript ? (
                      <p className="ui-reader-text whitespace-pre-wrap p-1">{rawTranscript}</p>
                    ) : startEmptyState}
                  </div>
                </div>
                {jumpToLatest(rawFollow)}
              </div>

              {/* Transcript actions belong to transcript output, not AI configuration. */}
              {hasTranscript && (
                <div className="surface-footer">
                  {transcriptActions}
                  {wordCountLabel}
                </div>
              )}
            </div>

            {/* Right: Bản Dịch */}
            <div className="glass-panel h-full flex flex-col">
              {/* STT provider badge (only when active), layout + floating subtitle toggles */}
              <div className="live-panel-toolbar">
                <div className="live-toolbar-start">
                  <h2 className="live-panel-title">{t.live_panel_translation}</h2>
                  {sttBadge}
                </div>
                <div className="live-toolbar-end">{viewToggle}{subtitleToggle}</div>
              </div>
              <div className="live-scroll-region">
                <div ref={txFollow.scrollRef} onScroll={txFollow.onScroll} className="live-scroll-viewport">
                  <div ref={txFollow.contentRef} className="live-scroll-content">
                    {segments.length > 0 ? (
                      <>
                        {segments.map((seg) => (
                          <TranslationRow
                            key={seg.id}
                            speaker={seg.speaker}
                            text={seg.translation}
                            statusLabel={segmentStatus(seg.state, t)}
                            speakerNameMap={speakerNameMap}
                          />
                        ))}
                        {isActive && isTranslating && (
                          <div className="flex items-center gap-2 pl-1">
                            <span style={{color:'var(--vzn-text-muted)'}}><SpinnerIcon className="w-3 h-3 animate-spin" /></span>
                            <span className="text-xs italic" style={{color:'var(--vzn-text-muted)'}}>{t.live_status_translating}</span>
                          </div>
                        )}
                      </>
                    ) : translation ? (
                      <p className="ui-reader-text font-medium whitespace-pre-wrap p-1">
                        {translation}
                      </p>
                    ) : (
                      <EmptyPanelState
                        icon={<TranslateIcon />}
                        description={t.translate_result_placeholder}
                      />
                    )}
                  </div>
                </div>
                {jumpToLatest(txFollow)}
              </div>

              {/* Right panel footer — Copy icon + Tổng hợp nội dung button */}
              {(translation || showSummaryBtn) && (
                <div className="surface-footer">
                  {translationActions}
                </div>
              )}
            </div>
          </div>
          )}
          {/* ── End two panels ── */}

          </div>
          {/* ── End body ── */}
        </div>
        {/* ── End surface panel ── */}
      </div>
      {/* ── End main area ── */}

      {/* ── Summary popup ── */}
      {showSummaryPopup && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop div — keyboard Escape handled by onKeyDown
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowSummaryPopup(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowSummaryPopup(false)}
        >
          <div
            className="modal-surface relative w-full max-w-2xl flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            style={{ maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {/* Popup header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <LightbulbIcon className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t.live_summary_title}</h2>
              </div>
              <Button
                size="sm"
                shape="icon"
                variant="neutral"
                appearance="ghost"
                type="button"
                onClick={() => setShowSummaryPopup(false)}
              >
                <XIcon className="w-4 h-4" />
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-5 pt-3 pb-1 flex-shrink-0">
              {(['summary', 'actions', 'decisions'] as PostTab[]).map(tab => (
                <Button
                  size="md"
                  shape="rect"
                  variant={postTab === tab ? 'primary' : 'neutral'}
                  appearance={postTab === tab ? 'soft' : 'ghost'}
                  key={tab}
                  type="button"
                  onClick={() => setPostTab(tab)}
                  className="whitespace-nowrap"
                >
                  {tab === 'summary' ? t.live_post_tab_summary : tab === 'actions' ? t.live_post_tab_actions : t.live_post_tab_decisions}
                </Button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
              {/* ── Tóm tắt ── */}
              {postTab === 'summary' && (
                isSummarizing ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-gray-400 dark:text-gray-600">
                    <SpinnerIcon className="w-6 h-6 animate-spin" />
                    <span className="text-sm">{t.live_summarizing}</span>
                  </div>
                ) : summary ? (
                  <MarkdownText text={summary} className="text-gray-800 dark:text-gray-200" />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-600 italic py-4 text-center">{t.live_empty_desc}</p>
                )
              )}

              {/* ── Việc cần làm ── */}
              {postTab === 'actions' && (
                isExtractingActionItems ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-gray-400 dark:text-gray-600">
                    <SpinnerIcon className="w-6 h-6 animate-spin" />
                    <span className="text-sm">{t.live_extracting_action_items}</span>
                  </div>
                ) : actionItems ? (
                  <MarkdownText text={actionItems} className="text-gray-800 dark:text-gray-200" />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-600 italic py-4 text-center">{t.live_empty_desc}</p>
                )
              )}

              {/* ── Quyết định ── */}
              {postTab === 'decisions' && (
                isExtractingDecisions ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-gray-400 dark:text-gray-600">
                    <SpinnerIcon className="w-6 h-6 animate-spin" />
                    <span className="text-sm">{t.live_extracting_decisions}</span>
                  </div>
                ) : decisions ? (
                  <MarkdownText text={decisions} className="text-gray-800 dark:text-gray-200" />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-600 italic py-4 text-center">{t.live_empty_desc}</p>
                )
              )}
            </div>

            {/* Popup footer — action buttons */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 gap-2">
              {/* Copy active tab content */}
              {postTab === 'summary' && summary && !isSummarizing && (
                <Button
                  size="sm"
                  shape="rect"
                  variant={copiedSummary ? 'primary' : 'neutral'}
                  appearance={copiedSummary ? 'soft' : 'outline'}
                  type="button"
                  onClick={() => handleCopy(summary, setCopiedSummary)}
                >
                  {copiedSummary ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  {copiedSummary ? t.translate_copied : t.translate_copy}
                </Button>
              )}
              {postTab === 'actions' && actionItems && !isExtractingActionItems && (
                <Button
                  size="sm"
                  shape="rect"
                  variant={copiedActions ? 'primary' : 'neutral'}
                  appearance={copiedActions ? 'soft' : 'outline'}
                  type="button"
                  onClick={() => handleCopy(actionItems, setCopiedActions)}
                >
                  {copiedActions ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  {copiedActions ? t.translate_copied : t.translate_copy}
                </Button>
              )}
              {postTab === 'decisions' && decisions && !isExtractingDecisions && (
                <Button
                  size="sm"
                  shape="rect"
                  variant={copiedDecisions ? 'primary' : 'neutral'}
                  appearance={copiedDecisions ? 'soft' : 'outline'}
                  type="button"
                  onClick={() => handleCopy(decisions, setCopiedDecisions)}
                >
                  {copiedDecisions ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  {copiedDecisions ? t.translate_copied : t.translate_copy}
                </Button>
              )}
              {/* Spacer if no copy button */}
              {((postTab === 'summary' && (!summary || isSummarizing)) ||
                (postTab === 'actions' && (!actionItems || isExtractingActionItems)) ||
                (postTab === 'decisions' && (!decisions || isExtractingDecisions))) && (
                <div />
              )}

              {/* Right-side action button per tab */}
              <div className="flex items-center gap-2 ml-auto">
                {postTab === 'summary' && !isSummarizing && (
                  <Button
                    size="sm"
                    shape="rect"
                    variant="primary"
                    appearance="solid"
                    type="button"
                    onClick={handleSummarize}
                  >
                    <LightbulbIcon className="w-3.5 h-3.5" />
                    {summary ? t.live_summarize_again : t.live_summarize}
                  </Button>
                )}
                {postTab === 'actions' && !isExtractingActionItems && (
                  <Button
                    size="sm"
                    shape="rect"
                    variant="primary"
                    appearance="solid"
                    type="button"
                    onClick={handleExtractActionItems}
                  >
                    <CheckIcon className="w-3.5 h-3.5" />
                    {actionItems ? t.live_action_items_extract_again : t.live_action_items_extract}
                  </Button>
                )}
                {postTab === 'decisions' && !isExtractingDecisions && (
                  <Button
                    size="sm"
                    shape="rect"
                    variant="primary"
                    appearance="solid"
                    type="button"
                    onClick={handleExtractDecisions}
                  >
                    <CheckIcon className="w-3.5 h-3.5" />
                    {decisions ? t.live_decisions_extract_again : t.live_decisions_extract}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screen Recording permission modal */}
      {showScreenPermModal && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop div — keyboard Escape handled by onKeyDown
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowScreenPermModal(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowScreenPermModal(false)}
        >
          <div
            className="modal-surface relative mx-4 w-full max-w-sm p-6 flex flex-col gap-4"
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-950/40 flex items-center justify-center">
                <InfoCircleIcon className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {t.live_screen_permission_title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  {t.live_screen_recording_hint.split(/(<strong>.*?<\/strong>)/g).map((part, i) => {
                    const m = part.match(/^<strong>(.*?)<\/strong>$/)
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable index for locale string segments
                    return m ? <strong key={i} className="text-gray-700 dark:text-gray-200">{m[1]}</strong> : part
                  })}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                shape="rect"
                variant="neutral"
                appearance="outline"
                type="button"
                onClick={() => setShowScreenPermModal(false)}
              >
                {t.translate_error_dismiss}
              </Button>
              <Button
                size="sm"
                shape="rect"
                variant="primary"
                appearance="solid"
                type="button"
                onClick={() => {
                  if (typeof window.api?.openExternal === 'function') {
                    window.api.openExternal(MACOS_SCREEN_RECORDING_PREFS)
                  } else {
                    window.open(MACOS_SCREEN_RECORDING_PREFS)
                  }
                  setShowScreenPermModal(false)
                }}
              >
                <GearIcon className="w-3.5 h-3.5" />
                {t.live_open_system_settings}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications: one top-right stack shared with the other pages */}
      {(micError || pipelineError || activeKeyNotice) && (
        <div className="notification-viewport">
          <div className="flex flex-col gap-2">
            {micError && (
              <NotificationToast
                tone="error"
                title={t.live_error_title}
                message={micError}
                dismissLabel={t.translate_error_dismiss}
                onDismiss={dismissMicError}
                className="fade-in"
              />
            )}
            {pipelineError && (
              <NotificationToast tone="warning" message={pipelineError} className="fade-in" />
            )}
            {activeKeyNotice && (
              <NotificationToast
                tone="warning"
                message={activeKeyNotice.message}
                actionLabel={t.translate_error_open_settings}
                onAction={() => openSettings()}
                dismissLabel={t.translate_error_dismiss}
                onDismiss={() => setDismissedKeyNotice(activeKeyNotice.id)}
                className="fade-in"
              />
            )}
          </div>
        </div>
      )}

    </div>
  )
}
