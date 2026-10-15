/**
 * TtsVoicePicker — badge-buttons for picking a TTS voice.
 * Extracted from SettingsPage (TTS Voice › Voice preview badges row).
 */
import type { TtsVoice } from '../../types'
import { Button } from './atoms'
import { RadioCheckedIcon } from './icons'

const VOICES: TtsVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

interface TtsVoicePickerProps {
  value: TtsVoice
  onChange: (voice: TtsVoice) => void
}

export function TtsVoicePicker({ value, onChange }: TtsVoicePickerProps) {
  return (
    <div className="px-4 py-3 flex flex-wrap gap-2">
      {VOICES.map((id) => (
        <Button
          size="md"
          shape="rect"
          variant={value === id ? 'primary' : 'neutral'}
          appearance={value === id ? 'soft' : 'outline'}
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
        >
          {value === id && <RadioCheckedIcon className="w-3 h-3" />}
          {id.charAt(0).toUpperCase() + id.slice(1)}
        </Button>
      ))}
    </div>
  )
}
