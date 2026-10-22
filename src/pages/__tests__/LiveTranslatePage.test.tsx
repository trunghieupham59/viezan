import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationViewport } from '../../components/organisms/NotificationViewport'
import { TRANSLATIONS } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { LiveTranslatePage } from '../LiveTranslatePage'

const live = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))

vi.mock('../../hooks/useLiveTranslate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useLiveTranslate')>()
  return { ...actual, useLiveTranslate: () => live.state }
})

const t = TRANSLATIONS.en

function liveState(overrides: Record<string, unknown> = {}) {
  return {
    audioMode: 'system', setAudioMode: vi.fn(), screenPermission: 'granted',
    isActive: false, liveLanguagesLocked: false, sessionLanguages: { sourceLang: 'auto', targetLang: 'vi' },
    rawTranscript: '', translation: '', isTranscribing: false, isTranslating: false, micError: null, dismissMicError: vi.fn(), pipelineError: null,
    showSubtitles: false, setShowSubtitles: vi.fn(),
    subtitleSettings: {}, setSubtitleSettings: vi.fn(),
    showSummaryBtn: false, summary: '', isSummarizing: false,
    actionItems: '', isExtractingActionItems: false, decisions: '', isExtractingDecisions: false,
    speakerNameMap: {}, sessionStartTime: 0, segments: [], pendingText: '',
    handleStart: vi.fn(), handleStop: vi.fn(), handleClear: vi.fn(), handleSummarize: vi.fn(),
    handleExtractActionItems: vi.fn(), handleExtractDecisions: vi.fn(), handleRenameSpeaker: vi.fn(),
    getInputLevel: vi.fn(() => 0.5), wordCount: 0, isMac: false,
    hasSttKey: true, hasAnyKey: true, activeSttProvider: 'whisper',
    ...overrides,
  }
}

const segment = { id: 's1', rawText: 'Bonjour', translation: 'Hello', speaker: 'Speaker 1', timestamp: 1 }

beforeEach(() => {
  localStorage.clear()
  useAppStore.setState({ locale: 'en', liveSourceLang: 'auto', liveTargetLang: 'vi', liveLanguagesLocked: false })
  live.state = liveState()
})

describe('AI Interpret screen', () => {
  it('keeps Start on the command row and shows a direction arrow instead of a dead swap', () => {
    render(<LiveTranslatePage />)
    const row = document.querySelector('.feature-command-bar') as HTMLElement
    expect(within(row).getByRole('button', { name: t.live_start })).toBeEnabled()
    expect(within(row).getByRole('button', { name: t.ai_configuration_title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.translate_swap })).not.toBeInTheDocument()
  })

  it('opens saved sessions from the command row and reopens one in place', () => {
    useAppStore.setState({
      liveSessions: [{
        id: 'live-1',
        createdAt: Date.now() - 60_000,
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        sourceLang: 'vi',
        targetLang: 'en',
        rawTranscript: 'Họp sáng thứ hai',
        translation: 'Monday morning meeting',
        wordCount: 3,
      }],
      viewingLiveSessionId: null,
    })
    render(<LiveTranslatePage />)
    const trigger = screen.getByRole('button', { name: /^Saved sessions/ })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveTextContent('1')

    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Saved sessions' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open session: Họp sáng thứ hai' }))
    expect(useAppStore.getState().viewingLiveSessionId).toBe('live-1')
    expect(screen.queryByRole('dialog', { name: 'Saved sessions' })).not.toBeInTheDocument()
  })

  it('exposes the audio source outside the configuration popover', () => {
    render(<LiveTranslatePage />)
    const group = screen.getByRole('group', { name: t.live_audio_source_label })
    expect(group).toContainElement(screen.getByRole('button', { name: t.live_audio_mode_system, pressed: true }))
    fireEvent.click(screen.getByRole('button', { name: t.live_audio_mode_mic }))
    expect(live.state.setAudioMode).toHaveBeenCalledWith('mic')
  })

  it('locks the audio source while a session runs', () => {
    live.state = liveState({ isActive: true })
    render(<LiveTranslatePage />)
    expect(screen.getByRole('button', { name: t.live_audio_mode_mic })).toBeDisabled()
    expect(screen.getByRole('button', { name: t.live_stop })).toBeEnabled()
  })

  it('toggles floating subtitles from the translation panel', () => {
    render(<LiveTranslatePage />)
    fireEvent.click(screen.getByRole('button', { name: t.live_subtitles, pressed: false }))
    expect(live.state.setShowSubtitles).toHaveBeenCalledWith(true)
  })

  it('explains why Start is unavailable when no translation key is configured', () => {
    live.state = liveState({ hasAnyKey: false })
    render(<><LiveTranslatePage /><NotificationViewport /></>)
    const row = document.querySelector('.feature-command-bar') as HTMLElement
    const start = within(row).getByRole('button', { name: t.live_start })
    expect(start).toBeDisabled()
    expect(start).toHaveAttribute('title', t.live_no_translate_key)
    expect(screen.getByText(t.live_no_translate_key, { exact: false })).toBeInTheDocument()
  })

  it('shows a missing speech-recognition key as a dismissible notification', () => {
    const openSettings = vi.fn()
    useAppStore.setState({ openSettings })
    live.state = liveState({ hasSttKey: false })
    render(<><LiveTranslatePage /><NotificationViewport /></>)
    const viewport = document.querySelector('.notification-viewport') as HTMLElement
    expect(within(viewport).getByText(t.live_no_stt_key)).toBeInTheDocument()
    fireEvent.click(within(viewport).getByRole('button', { name: t.translate_error_open_settings }))
    expect(openSettings).toHaveBeenCalled()
    fireEvent.click(within(viewport).getByRole('button', { name: t.translate_error_dismiss }))
    expect(screen.queryByText(t.live_no_stt_key)).not.toBeInTheDocument()
  })

  it('blocks Start with the speech-recognition message when no STT provider has a key', () => {
    live.state = liveState({ hasSttKey: false })
    render(<LiveTranslatePage />)
    const row = document.querySelector('.feature-command-bar') as HTMLElement
    const start = within(row).getByRole('button', { name: t.live_start })
    expect(start).toBeDisabled()
    expect(start).toHaveAttribute('title', t.live_no_stt_key)
  })

  it('keeps Start enabled and shows no key notice when an STT provider is usable', () => {
    live.state = liveState({ hasSttKey: true, activeSttProvider: 'gemini' })
    render(<><LiveTranslatePage /><NotificationViewport /></>)
    const row = document.querySelector('.feature-command-bar') as HTMLElement
    expect(within(row).getByRole('button', { name: t.live_start })).toBeEnabled()
    expect(screen.queryByText(t.live_no_stt_key)).not.toBeInTheDocument()
  })

  it('surfaces start failures instead of dropping them, and lets the user dismiss them', () => {
    live.state = liveState({ micError: t.live_error_mic_denied })
    render(<><LiveTranslatePage /><NotificationViewport /></>)
    const viewport = document.querySelector('.notification-viewport') as HTMLElement
    const alert = within(viewport).getByRole('alert')
    expect(alert).toHaveTextContent(t.live_error_mic_denied)
    fireEvent.click(within(alert).getByRole('button', { name: t.translate_error_dismiss }))
    expect(live.state.dismissMicError).toHaveBeenCalled()
  })

  it('shows transient pipeline errors in the same notification stack', () => {
    live.state = liveState({ pipelineError: t.live_error_stt_failed })
    render(<><LiveTranslatePage /><NotificationViewport /></>)
    const viewport = document.querySelector('.notification-viewport') as HTMLElement
    expect(within(viewport).getByText(t.live_error_stt_failed)).toBeInTheDocument()
  })

  it('drops its page-scoped notices when the screen unmounts', () => {
    live.state = liveState({ hasSttKey: false, micError: t.live_error_mic_denied, pipelineError: t.live_error_stt_failed })
    const { unmount } = render(<><LiveTranslatePage /><NotificationViewport /></>)
    const viewport = document.querySelector('.notification-viewport') as HTMLElement
    expect(within(viewport).getByText(t.live_no_stt_key)).toBeInTheDocument()
    expect(within(viewport).getByText(t.live_error_mic_denied)).toBeInTheDocument()
    expect(within(viewport).getByText(t.live_error_stt_failed)).toBeInTheDocument()
    unmount()
    render(<NotificationViewport />)
    expect(screen.queryByText(t.live_no_stt_key)).not.toBeInTheDocument()
    expect(screen.queryByText(t.live_error_mic_denied)).not.toBeInTheDocument()
    expect(screen.queryByText(t.live_error_stt_failed)).not.toBeInTheDocument()
    expect(live.state.dismissMicError).not.toHaveBeenCalled()
  })

  it('hides transcript and translation toolbars until there is output', () => {
    const { unmount } = render(<LiveTranslatePage />)
    expect(screen.queryByRole('button', { name: /TXT/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.live_copy_original })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.live_copy_translation })).not.toBeInTheDocument()
    unmount()

    live.state = liveState({ rawTranscript: 'Hello', translation: 'Xin chào' })
    render(<LiveTranslatePage />)
    expect(screen.getByRole('button', { name: /TXT/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: t.live_copy_original })).toBeEnabled()
    expect(screen.getByRole('button', { name: t.live_copy_translation })).toBeEnabled()
  })

  it('shows elapsed time and input level while a session runs', () => {
    live.state = liveState({ isActive: true, sessionStartTime: Date.now() - 65_000 })
    render(<LiveTranslatePage />)
    expect(screen.getByRole('meter', { name: t.live_input_level })).toHaveAttribute('value', '0.5')
    expect(screen.getByText('1:05')).toBeInTheDocument()
    expect(screen.getAllByText(t.live_status_listening_system)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: t.live_start })).not.toBeInTheDocument()
  })

  it('pairs each original with its translation and remembers the layout', () => {
    live.state = liveState({ rawTranscript: 'Bonjour', translation: 'Hello', segments: [segment] })
    const { unmount } = render(<LiveTranslatePage />)
    expect(screen.getByRole('button', { name: t.live_view_split, pressed: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t.live_view_paired }))

    const row = document.querySelector('.live-bilingual-row') as HTMLElement
    expect(row).toHaveTextContent('Bonjour')
    expect(row).toHaveTextContent('Hello')
    expect(document.querySelector('.app-panel-grid')).not.toBeInTheDocument()
    // One footer still offers both copies, each with a distinct name.
    expect(screen.getByRole('button', { name: t.live_copy_original })).toBeEnabled()
    expect(screen.getByRole('button', { name: t.live_copy_translation })).toBeEnabled()
    unmount()

    render(<LiveTranslatePage />)
    expect(screen.getByRole('button', { name: t.live_view_paired, pressed: true })).toBeInTheDocument()
  })

  it('stops following new text when the reader scrolls up, and jumps back on request', () => {
    live.state = liveState({ rawTranscript: 'Bonjour', translation: 'Hello', segments: [segment] })
    render(<LiveTranslatePage />)
    const viewport = document.querySelector('.live-scroll-viewport') as HTMLElement
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 200 })
    viewport.scrollTop = 0
    expect(screen.queryByRole('button', { name: t.live_jump_latest })).not.toBeInTheDocument()

    fireEvent.scroll(viewport)
    fireEvent.click(screen.getByRole('button', { name: t.live_jump_latest }))
    expect(viewport.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: t.live_jump_latest })).not.toBeInTheDocument()
  })
})
