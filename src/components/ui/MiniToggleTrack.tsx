/**
 * MiniToggleTrack — reusable inline mini-toggle pill (track + thumb).
 *
 * Used inside pill-style buttons like AutoTranslateToggle
 * to show a small visual on/off indicator embedded in the button label.
 *
 * NOT a standalone interactive control — the parent button handles click events.
 */

interface MiniToggleTrackProps {
  checked: boolean
}

export function MiniToggleTrack({ checked }: MiniToggleTrackProps) {
  return (
    <span
      className={[
        'toggle-switch-track relative inline-flex shrink-0 items-center w-7 h-4 rounded-full transition-colors duration-200',
        checked ? 'toggle-switch-track-on' : 'toggle-switch-track-off',
      ].join(' ')}
    >
      <span
        className={[
          'toggle-switch-thumb absolute w-3 h-3 rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-3.5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </span>
  )
}
