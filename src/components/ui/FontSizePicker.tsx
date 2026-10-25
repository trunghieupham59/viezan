/**
 * FontSizePicker — three-button toggle for selecting app text size.
 * Extracted from SettingsPage (Preferences › Font Size row).
 */
import { ButtonGroup } from './ButtonGroup'

export type FontSize = 'small' | 'medium' | 'large'

interface FontSizePickerProps {
  /** Accessible name of the group (the row label). */
  label: string
  value: FontSize
  onChange: (size: FontSize) => void
  labels: { small: string; medium: string; large: string }
}

export function FontSizePicker({ label, value, onChange, labels }: FontSizePickerProps) {
  const options = (['small', 'medium', 'large'] as FontSize[]).map((size) => ({
    value: size,
    label: labels[size],
  }))

  return (
    <div className="flex-shrink-0">
      <ButtonGroup size="sm" label={label} value={value} onChange={onChange} options={options} />
    </div>
  )
}
