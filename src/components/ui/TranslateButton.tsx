/**
 * TranslateButton — primary action button that triggers manual translation.
 * Shows a spinner with a loading label while translation is in progress.
 */

import { Button } from './atoms'
import { ArrowRightIcon, SpinnerIcon } from './icons'

interface TranslateButtonProps {
  isTranslating: boolean
  disabled?: boolean
  onClick: () => void
  /** Label shown in idle state, e.g. t.translate_btn */
  labelTranslate: string
  /** Label shown while translating, e.g. t.translate_btn_loading */
  labelLoading: string
  /** Tooltip, e.g. the keyboard shortcut once the inline hint is hidden. */
  title?: string
}

export function TranslateButton({
  isTranslating,
  disabled = false,
  onClick,
  labelTranslate,
  labelLoading,
  title,
}: TranslateButtonProps) {
  return (
    <Button
      size="md"
      shape="rect"
      variant="primary"
      appearance="solid"
      onClick={onClick}
      disabled={isTranslating || disabled}
      aria-busy={isTranslating}
      title={title}
      className="translate-submit-button"
    >
      {isTranslating ? (
        <>
          <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
          <span>{labelLoading}</span>
        </>
      ) : (
        <>
          <ArrowRightIcon className="w-3.5 h-3.5" />
          <span>{labelTranslate}</span>
        </>
      )}
    </Button>
  )
}
