import { useT } from '../../store/useAppStore'
import { SttSection } from './SttSection'
import { TtsSection } from './TtsSection'

/** Settings › Voice: speech recognition and read-aloud in one card, as in the design. */
export function VoiceSection() {
  const t = useT()
  return (
    <div className="settings-section-stack">
      <header>
        <h2 className="settings-section-title">{t.settings_voice_section}</h2>
        <p className="settings-section-desc">{t.settings_voice_section_desc}</p>
      </header>
      <div className="ui-settings-card">
        <SttSection />
        <TtsSection />
      </div>
    </div>
  )
}
