/**
 * HotkeyRecordButton — keyboard-shortcut recorder input styled as a button.
 * Shows three visual states: idle (empty), set (shows current value),
 * recording (captures the next key combination).
 * Extracted from SettingsPage (Global Hotkey › Shortcut recorder row).
 */
import type { KeyboardEventHandler, RefObject } from 'react'
import { Button } from './atoms'

interface HotkeyRecordButtonProps {
  inputRef: RefObject<HTMLButtonElement>
  isRecording: boolean
  value: string
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>
  onClick: () => void
  onBlur: () => void
  recordingText: string
  noneText: string
}

export function HotkeyRecordButton({
  inputRef,
  isRecording,
  value,
  onKeyDown,
  onClick,
  onBlur,
  recordingText,
  noneText,
}: HotkeyRecordButtonProps) {
  return (
    <Button
      size="md"
      shape="rect"
      variant={isRecording ? 'primary' : 'neutral'}
      appearance={isRecording ? 'soft' : 'outline'}
      ref={inputRef}
      type="button"
      onKeyDown={isRecording ? onKeyDown : undefined}
      onClick={onClick}
      onBlur={onBlur}
      className="justify-center text-center font-mono"
    >
      {isRecording ? recordingText : value || noneText}
    </Button>
  )
}
