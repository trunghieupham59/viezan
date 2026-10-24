import { DEFAULT_TTS_FALLBACK_LANG } from '../../constants/providers'
import type { AudioTranscriptionErrorCode } from '../../types'
import { ClearButton } from '../ui/ClearButton'
import { ImageTranslateButton } from '../ui/ImageTranslateButton'
import { RewriteButton } from '../ui/RewriteButton'
import type { SpeakPanel } from '../ui/SpeakButton'
import { SpeakButton } from '../ui/SpeakButton'
import { VoiceRecorder, type VoiceRecordingState } from '../VoiceRecorder'

interface SourcePanelActionsProps {
  // Mode
  isVoiceActive: boolean
  isVoiceInterim: boolean
  isRewriting: 'source' | 'translated' | null
  // Content state
  sourceText: string
  sourceLang: string
  voiceContextKey: string
  hasImage: boolean
  /** The page's input mode: the microphone shows for voice, the image button for image. */
  inputMode?: 'text' | 'image' | 'voice'
  // TTS state
  speakingPanel: SpeakPanel | null
  speakLoading: boolean
  // Handlers
  onVoiceTranscript: (text: string, isFinal: boolean) => void
  onVoiceRecordingChange: (isRecording: boolean) => void
  onVoiceStateChange: (state: VoiceRecordingState) => void
  onVoiceCancel: () => void
  onVoiceError: (code: AudioTranscriptionErrorCode) => void
  onImageButtonClick: () => void
  onSpeak: (text: string, lang: string, panel: SpeakPanel) => void
  onRewrite: (panel: 'source' | 'translated') => void
  onClear: () => void
  // i18n
  labelVoiceRecord: string
  labelVoiceStop: string
  labelVoiceCancel: string
  labelVoiceTranscribing: string
  labelVoiceRecording: string
  labelAddImage: string
  labelSpeak: string
  labelSpeakStop: string
  labelRewrite: string
  labelRewriting: string
  labelClear: string
}

/**
 * Left-section icons for the source panel footer.
 * Order: mic → image → (when text present) clear → rewrite → speak
 */
export function SourcePanelActions({
  isVoiceActive, isVoiceInterim: _isVoiceInterim,
  isRewriting, sourceText, sourceLang, voiceContextKey,
  hasImage,
  inputMode = 'text',
  speakingPanel, speakLoading,
  onVoiceTranscript, onVoiceRecordingChange, onVoiceStateChange, onVoiceCancel,
  onVoiceError, onImageButtonClick,
  onSpeak, onRewrite, onClear,
  labelVoiceRecord, labelVoiceStop,
  labelVoiceCancel,
  labelVoiceTranscribing, labelVoiceRecording, labelAddImage,
  labelSpeak, labelSpeakStop,
  labelRewrite, labelRewriting, labelClear,
}: SourcePanelActionsProps) {
  const hasContent = (sourceText.trim().length > 0 || hasImage) && !isVoiceActive
  const hasTextContent = sourceText.trim().length > 0 && !hasImage && !isVoiceActive
  const showEntryLabels = !hasContent && !isVoiceActive

  return (
    <div className="flex items-center gap-1.5">
      {!hasImage && (inputMode === 'voice' || isVoiceActive) && (
        <VoiceRecorder
          sourceLang={sourceLang}
          contextKey={voiceContextKey}
          onTranscript={onVoiceTranscript}
          onRecordingChange={onVoiceRecordingChange}
          onStateChange={onVoiceStateChange}
          onCancel={onVoiceCancel}
          onError={onVoiceError}
          titleRecord={labelVoiceRecord}
          titleStop={labelVoiceStop}
          buttonSize="md"
          showIdleLabel={showEntryLabels}
          idleLabel={labelVoiceRecord}
          labelTranscribing={labelVoiceTranscribing}
          labelRecording={labelVoiceRecording}
          labelCancel={labelVoiceCancel}
          showCancel
          showPulse={false}
        />
      )}
      {!isVoiceActive && inputMode === 'image' && !hasImage && (
        <ImageTranslateButton
          onClick={onImageButtonClick}
          title={labelAddImage}
          showLabel={showEntryLabels}
        />
      )}
      {hasContent && (
        <ClearButton onClick={onClear} label={labelClear} />
      )}
      {hasTextContent && (
        <>
          <RewriteButton
            panel="source"
            isRewriting={isRewriting}
            onRewrite={onRewrite}
            labelRewrite={labelRewrite}
            labelRewriting={labelRewriting}
          />
          <SpeakButton
            panel="source"
            text={sourceText}
            lang={sourceLang === 'auto' ? DEFAULT_TTS_FALLBACK_LANG : sourceLang}
            speakingPanel={speakingPanel}
            speakLoading={speakLoading}
            onSpeak={onSpeak}
            labelSpeak={labelSpeak}
            labelStop={labelSpeakStop}
          />
        </>
      )}
    </div>
  )
}
