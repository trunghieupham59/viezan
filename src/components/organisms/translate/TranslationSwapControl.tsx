import { useId } from 'react'
import { useT } from '../../../store/useAppStore'
import { Button } from '../../ui/atoms'
import { SwapIcon } from '../../ui/icons'

interface TranslationSwapControlProps {
  canSwap: boolean
  disabledReason: string
  onSwap: () => void
  /** Button size; a compact size fits the narrow panel gap in panel-aligned rows. */
  size?: 'xs' | 'md'
}

/** Swap control rendered in the dedicated gutter between language selectors. */
export function TranslationSwapControl({
  canSwap,
  disabledReason,
  onSwap,
  size = 'md',
}: TranslationSwapControlProps) {
  const t = useT()
  const tooltipId = useId()
  const swapButton = (
    <Button
      size={size}
      shape="icon"
      variant="neutral"
      appearance="ghost"
      onClick={onSwap}
      disabled={!canSwap}
      aria-label={t.translate_swap}
      aria-describedby={canSwap ? undefined : tooltipId}
      className="translate-swap-button"
    >
      <SwapIcon />
    </Button>
  )

  if (canSwap) {
    return (
      <span className="translate-swap-control" title={t.translate_swap}>
        {swapButton}
      </span>
    )
  }

  return (
    <fieldset
      className="translate-swap-control translate-swap-control-disabled"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the native-disabled child cannot receive focus, so this group is the keyboard entry point for its explanation.
      tabIndex={0}
      aria-disabled="true"
      aria-label={t.translate_swap}
      aria-describedby={tooltipId}
    >
      {swapButton}
      <span id={tooltipId} role="tooltip" className="translate-swap-tooltip">
        {disabledReason}
      </span>
    </fieldset>
  )
}
